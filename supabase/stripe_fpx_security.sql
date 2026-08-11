-- =============================================================================
-- Mihoyo Shop V2 — Stripe FPX Security Fix
--
-- Goal:
-- - Only server-side service role can execute Stripe payment RPCs.
-- - Even if someone finds the RPC name, anon/authenticated cannot call it.
-- - Functions refuse non-service_role callers (defense in depth).
--
-- Safe to run repeatedly (CREATE OR REPLACE / REVOKE + GRANT).
-- =============================================================================

DO $$
BEGIN
  -- Ensure the service role exists in this project.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE NOTICE 'Role service_role not found; grants will be skipped.';
  END IF;
END $$;

-- 1) attach_stripe_checkout_session
CREATE OR REPLACE FUNCTION public.attach_stripe_checkout_session(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Defense in depth: only allow service_role JWT.
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Idempotent attach: allow same session id to be re-attached.
  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_method = CASE
      WHEN payment_method IS NULL OR payment_method = '' OR payment_method = 'website'
        THEN 'stripe_fpx'
      ELSE payment_method
    END,
    updated_at = now()
  WHERE id = p_order_id
    AND (
      stripe_checkout_session_id IS NULL
      OR stripe_checkout_session_id = p_checkout_session_id
    );
END;
$$;

-- 2) mark_stripe_payment_paid
CREATE OR REPLACE FUNCTION public.mark_stripe_payment_paid(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_total numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_updated boolean := false;
  v_row_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Prevent mismatch between webhook session and stored session (if stored already).
  IF v_order.stripe_checkout_session_id IS NOT NULL
     AND v_order.stripe_checkout_session_id <> p_checkout_session_id THEN
    RAISE EXCEPTION 'STRIPE_SESSION_MISMATCH';
  END IF;

  -- Prevent amount/currency manipulation.
  IF COALESCE(v_order.total_amount, v_order.total, 0) <> COALESCE(p_amount_total, 0) THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH';
  END IF;

  IF COALESCE(UPPER(v_order.currency), 'MYR') <> UPPER(p_currency) THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH';
  END IF;

  -- Idempotency: if already paid, do nothing (no email again).
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_status = 'paid',
    -- Keep existing order system: set processing status as "can proceed".
    order_status = 'processing',
    status = 'processing',
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'title', oi.product_title,
      'price', COALESCE(oi.unit_price, oi.price, 0),
      'quantity', oi.quantity
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'email', jsonb_build_object(
      'customerName', v_order.customer_name,
      'customerEmail', v_order.customer_email,
      'orderNumber', v_order.order_number,
      'orderId', v_order.id,
      'status', 'processing',
      'paymentStatus', 'paid',
      'total', COALESCE(v_order.total_amount, v_order.total, 0),
      'currency', COALESCE(v_order.currency, 'MYR'),
      'createdAt', v_order.created_at,
      'items', v_items
    )
  );
END;
$$;

-- 3) mark_stripe_payment_failed
CREATE OR REPLACE FUNCTION public.mark_stripe_payment_failed(
  p_order_id uuid,
  p_checkout_session_id text,
  p_amount_total numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated boolean := false;
  v_row_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.stripe_checkout_session_id IS NOT NULL
     AND v_order.stripe_checkout_session_id <> p_checkout_session_id THEN
    RAISE EXCEPTION 'STRIPE_SESSION_MISMATCH';
  END IF;

  IF COALESCE(v_order.total_amount, v_order.total, 0) <> COALESCE(p_amount_total, 0) THEN
    RAISE EXCEPTION 'AMOUNT_MISMATCH';
  END IF;

  IF COALESCE(UPPER(v_order.currency), 'MYR') <> UPPER(p_currency) THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH';
  END IF;

  -- Never override a paid order.
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    payment_status = 'failed',
    order_status = 'pending',
    status = 'pending',
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

-- 4) Tighten RPC permissions:
-- Revoke execute from PUBLIC/anon/authenticated, then grant to service_role only.
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM PUBLIC;

-- Revoke explicitly in case PUBLIC isn't enough (repeatable + safe).
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) TO service_role;
  END IF;
END $$;

