-- =============================================================================
-- Phase 6.1 — Game-account inventory foundation (ADDITIVE)
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor when ready.
--
-- Adds:
--   - inventory_items (non-secret stock units)
--   - inventory_credentials (encrypted ciphertext only — never plaintext)
--   - delivery_attempts (send idempotency log)
--   - claim_inventory_for_order (service_role atomic claim)
--
-- Does NOT:
--   - change products.status
--   - change order status / payment_status
--   - auto-deliver credentials
--   - send email or WhatsApp
--   - reveal credentials
--   - modify Stripe checkout / webhook behavior
--   - add plaintext username/password columns to products/orders/order_items
--
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) inventory_items
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products (id),
  status text NOT NULL DEFAULT 'available',
  order_id uuid NULL REFERENCES public.orders (id),
  order_item_id uuid NULL REFERENCES public.order_items (id),
  reserved_at timestamptz NULL,
  assigned_at timestamptz NULL,
  delivered_at timestamptz NULL,
  consumed_at timestamptz NULL,
  label text NULL,
  game_uid_hint text NULL,
  notes_internal text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_status_check CHECK (
    status IN (
      'available',
      'reserved',
      'assigned',
      'delivered',
      'consumed',
      'void'
    )
  )
);

-- One inventory unit per order (also prevents one unit ↔ many orders).
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_order_id_uidx
  ON public.inventory_items (order_id)
  WHERE order_id IS NOT NULL;

-- Fast claim path: available stock for a product.
CREATE INDEX IF NOT EXISTS inventory_items_product_available_idx
  ON public.inventory_items (product_id, status)
  WHERE status = 'available';

CREATE INDEX IF NOT EXISTS inventory_items_product_id_idx
  ON public.inventory_items (product_id);

CREATE INDEX IF NOT EXISTS inventory_items_status_idx
  ON public.inventory_items (status);

CREATE INDEX IF NOT EXISTS inventory_items_order_item_id_idx
  ON public.inventory_items (order_item_id)
  WHERE order_item_id IS NOT NULL;

COMMENT ON TABLE public.inventory_items IS
  'Sellable game-account stock units. Non-secret metadata only. Credentials live in inventory_credentials.';
COMMENT ON COLUMN public.inventory_items.notes_internal IS
  'Admin-only note. NEVER store passwords or login credentials here.';
COMMENT ON COLUMN public.inventory_items.game_uid_hint IS
  'Optional non-secret display hint (e.g. masked UID). Never store passwords.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) inventory_credentials — ciphertext only
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_credentials (
  inventory_item_id uuid PRIMARY KEY
    REFERENCES public.inventory_items (id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  nonce text NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_credentials_key_version_positive CHECK (key_version >= 1),
  CONSTRAINT inventory_credentials_schema_version_positive CHECK (schema_version >= 1)
);

COMMENT ON TABLE public.inventory_credentials IS
  'Encrypted credential blobs for inventory_items. Never store plaintext usernames/passwords/emails.';
COMMENT ON COLUMN public.inventory_credentials.ciphertext IS
  'Application-encrypted payload (e.g. AES-GCM). Plaintext credentials MUST NOT be stored.';
COMMENT ON COLUMN public.inventory_credentials.nonce IS
  'Encryption nonce/IV for ciphertext.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) delivery_attempts — send idempotency
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.delivery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders (id),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items (id),
  channel text NOT NULL,
  provider_message_id text NULL,
  status text NOT NULL DEFAULT 'pending',
  error_code text NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_attempts_channel_check CHECK (
    channel IN ('email', 'whatsapp', 'manual')
  ),
  CONSTRAINT delivery_attempts_status_check CHECK (
    status IN ('pending', 'sent', 'failed', 'skipped')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_attempts_idempotency_key_uidx
  ON public.delivery_attempts (idempotency_key);

CREATE INDEX IF NOT EXISTS delivery_attempts_order_id_idx
  ON public.delivery_attempts (order_id);

CREATE INDEX IF NOT EXISTS delivery_attempts_inventory_item_id_idx
  ON public.delivery_attempts (inventory_item_id);

CREATE INDEX IF NOT EXISTS delivery_attempts_status_idx
  ON public.delivery_attempts (status);

COMMENT ON TABLE public.delivery_attempts IS
  'Delivery send log for idempotency. Does not store credentials.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_attempts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'inventory_items',
        'inventory_credentials',
        'delivery_attempts'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname,
      r.tablename
    );
  END LOOP;
END $$;

-- inventory_items: admin only for authenticated clients.
-- anon/customers: no policies → no access.
-- service_role bypasses RLS for claim RPC / future delivery jobs.
CREATE POLICY inventory_items_admin_select ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY inventory_items_admin_insert ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_items_admin_update ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_items_admin_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- inventory_credentials: admin only. Never grant to anon/authenticated customers.
CREATE POLICY inventory_credentials_admin_select ON public.inventory_credentials
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY inventory_credentials_admin_insert ON public.inventory_credentials
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_credentials_admin_update ON public.inventory_credentials
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_credentials_admin_delete ON public.inventory_credentials
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- delivery_attempts: admins inspect; customers cannot list arbitrary attempts.
CREATE POLICY delivery_attempts_admin_select ON public.delivery_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY delivery_attempts_admin_insert ON public.delivery_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY delivery_attempts_admin_update ON public.delivery_attempts
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) claim_inventory_for_order — service_role only, atomic, idempotent
--    Does NOT change products.status, order status, or reveal credentials.
-- ─────────────────────────────────────────────────────────────────────────────

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

  -- Idempotent: order already has an assigned inventory unit.
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
    -- Race: another worker claimed between SELECT and UPDATE.
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
  'Atomically assign one available inventory_item to an order. service_role only. Idempotent. Does not change product/order status or reveal credentials.';

NOTIFY pgrst, 'reload schema';
