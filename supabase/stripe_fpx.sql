-- =============================================================================
-- Mihoyo Shop V2 — Stripe FPX (Checkout + Webhook)
-- Run in Supabase SQL Editor (project owner).
--
-- Requirements:
-- - Do NOT delete existing orders/products.
-- - Webhook must be the only source of truth to flip payment_status -> paid.
-- =============================================================================

-- 1) Orders: store Stripe identifiers
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

-- Keep it minimal: unique only for non-null values (Postgres allows multiple NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_checkout_session_id_uidx
  ON public.orders (stripe_checkout_session_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_uidx
  ON public.orders (stripe_payment_intent_id);

-- 2) Attach checkout session ids to the already-created pending order
CREATE OR REPLACE FUNCTION public.attach_stripe_checkout_session(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- 3) Mark payment paid (idempotent) and return email payload
CREATE OR REPLACE FUNCTION public.mark_stripe_payment_paid(
  p_order_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_amount_total numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb := '[]'::jsonb;
  v_updated boolean := false;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Verify the webhook is referencing the correct checkout session.
  IF v_order.stripe_checkout_session_id IS NOT NULL
     AND v_order.stripe_checkout_session_id <> p_checkout_session_id THEN
    RAISE EXCEPTION 'STRIPE_SESSION_MISMATCH';
  END IF;

  -- Verify amount/currency to prevent manipulation.
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

  -- Update payment_status only after verification.
  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_status = 'paid',
    -- Keep existing order system: "paid" triggers fulfillment workflow externally.
    -- We set an order_status that represents "can proceed".
    order_status = 'processing',
    status = 'processing',
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT > 0;

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

-- 4) Mark payment failed (optional, for canceled/failed flows)
CREATE OR REPLACE FUNCTION public.mark_stripe_payment_failed(
  p_order_id uuid,
  p_checkout_session_id text,
  p_amount_total numeric,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated boolean := false;
BEGIN
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
    -- Keep order_status as pending so fulfillment isn't triggered.
    order_status = 'pending',
    status = 'pending',
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT > 0;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

-- 5) Grants: webhook runs server-side with anon key; allow RPC calls.
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) TO anon, authenticated;

