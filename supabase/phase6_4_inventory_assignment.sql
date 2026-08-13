-- =============================================================================
-- Phase 6.4 — Inventory assignment hardening (ADDITIVE)
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor AFTER relying on
-- webhook auto-assignment. Requires phase6_1 (+ preferably phase6_2) applied.
--
-- Hardens claim_inventory_for_order:
--   - New claims only for paid / sourcing / fulfilled orders
--   - Blocks pending / failed / cancelled / refunded
--   - Keeps FOR UPDATE SKIP LOCKED atomicity
--   - Keeps idempotent return when order already has inventory
--   - Does NOT change products.status
--   - Does NOT change order status / payment_status
--   - Does NOT reveal credentials
--
-- Safe to re-run (CREATE OR REPLACE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_inventory_for_order(
  p_order_id uuid,
  p_product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_order_item public.order_items%ROWTYPE;
  v_product_id uuid;
  v_existing public.inventory_items%ROWTYPE;
  v_claimed_id uuid;
  v_claimed public.inventory_items%ROWTYPE;
  v_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_ID_REQUIRED';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Idempotent: order already has an inventory unit (any status on that row).
  SELECT * INTO v_existing
  FROM public.inventory_items
  WHERE order_id = p_order_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'assigned', true,
      'idempotent', true,
      'inventory_item_id', v_existing.id,
      'product_id', v_existing.product_id,
      'order_id', v_existing.order_id,
      'order_item_id', v_existing.order_item_id,
      'status', v_existing.status
    );
  END IF;

  v_status := lower(coalesce(v_order.status, v_order.order_status, ''));

  -- Block terminal statuses from receiving NEW inventory.
  IF v_status IN ('failed', 'cancelled', 'refunded') THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'reason', 'ORDER_NOT_ELIGIBLE',
      'order_id', p_order_id,
      'status', v_status
    );
  END IF;

  IF coalesce(v_order.payment_status, '') IN ('failed', 'refunded') THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'reason', 'ORDER_NOT_ELIGIBLE',
      'order_id', p_order_id,
      'payment_status', v_order.payment_status
    );
  END IF;

  -- New claims require paid payment (or already in paid-flow status).
  -- pending + unpaid → ORDER_NOT_PAID; pending + paid is allowed.
  IF coalesce(v_order.payment_status, '') <> 'paid'
     AND v_status NOT IN ('paid', 'sourcing', 'fulfilled', 'processing', 'completed') THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'reason', 'ORDER_NOT_PAID',
      'order_id', p_order_id,
      'status', v_status,
      'payment_status', v_order.payment_status
    );
  END IF;

  -- Resolve product + order_item from the order (single-item checkout).
  IF p_product_id IS NOT NULL THEN
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE order_id = p_order_id
      AND product_id = p_product_id
    ORDER BY created_at
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ORDER_ITEM_PRODUCT_MISMATCH';
    END IF;

    v_product_id := p_product_id;
  ELSE
    SELECT * INTO v_order_item
    FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY created_at
    LIMIT 1;

    IF NOT FOUND OR v_order_item.product_id IS NULL THEN
      RETURN jsonb_build_object(
        'assigned', false,
        'reason', 'NO_ORDER_ITEM'
      );
    END IF;

    v_product_id := v_order_item.product_id;
  END IF;

  -- Atomic claim: lock one available row, skip rows locked by concurrent claims.
  SELECT id INTO v_claimed_id
  FROM public.inventory_items
  WHERE product_id = v_product_id
    AND status = 'available'
    AND order_id IS NULL
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_claimed_id IS NULL THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'reason', 'NO_INVENTORY',
      'product_id', v_product_id,
      'order_id', p_order_id
    );
  END IF;

  UPDATE public.inventory_items
  SET
    status = 'assigned',
    order_id = p_order_id,
    order_item_id = v_order_item.id,
    assigned_at = COALESCE(assigned_at, now()),
    updated_at = now()
  WHERE id = v_claimed_id
    AND status = 'available'
    AND order_id IS NULL
  RETURNING * INTO v_claimed;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'assigned', false,
      'reason', 'CLAIM_RACE',
      'product_id', v_product_id,
      'order_id', p_order_id
    );
  END IF;

  -- Intentionally does NOT:
  --   - update products.status
  --   - update orders.status / payment_status
  --   - read or return inventory_credentials
  --   - insert delivery_attempts / send messages
  --   - move order to fulfilled

  RETURN jsonb_build_object(
    'assigned', true,
    'idempotent', false,
    'inventory_item_id', v_claimed.id,
    'product_id', v_claimed.product_id,
    'order_id', v_claimed.order_id,
    'order_item_id', v_claimed.order_item_id,
    'status', v_claimed.status,
    'assigned_at', v_claimed.assigned_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_inventory_for_order(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_inventory_for_order(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_inventory_for_order(uuid, uuid) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.claim_inventory_for_order(uuid, uuid) TO service_role;
  END IF;
END $$;

COMMENT ON FUNCTION public.claim_inventory_for_order(uuid, uuid) IS
  'Atomically assign one available inventory_item to a paid order. service_role only. Idempotent. Blocks unpaid/cancelled/refunded/failed. Does not change product/order status or reveal credentials.';

NOTIFY pgrst, 'reload schema';
