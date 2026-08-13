-- =============================================================================
-- Phase 5.3 — Orders foundation + Stripe + manual sourcing (ADDITIVE)
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor.
--
-- Business model:
--   ORDER → PAYMENT → SOURCING → MANUAL FULFILLMENT
-- Does NOT:
--   - reserve inventory / reserved_until / stock locking
--   - mark products sold at checkout creation
--   - store game account credentials
--   - auto-deliver credentials
--
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Expand status constraints (keep legacy processing/completed for old rows)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_status_check
  CHECK (
    order_status IS NULL OR order_status IN (
      'pending', 'paid', 'sourcing', 'fulfilled',
      'cancelled', 'refunded', 'failed',
      'processing', 'completed' -- legacy
    )
  );

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (
    status IS NULL OR status IN (
      'pending', 'paid', 'sourcing', 'fulfilled',
      'cancelled', 'refunded', 'failed',
      'processing', 'completed' -- legacy
    )
  );

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (
    payment_status IS NULL OR payment_status IN (
      'pending', 'paid', 'failed', 'refunded'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Additive order columns (on-demand sourcing + Stripe + guest receipt)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS sourcing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_note text,
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS admin_note text,
  ADD COLUMN IF NOT EXISTS receipt_token_hash text;

COMMENT ON COLUMN public.orders.channel IS
  'Purchase channel: stripe | shopee | whatsapp | website';
COMMENT ON COLUMN public.orders.delivery_note IS
  'Admin fulfillment note only — NEVER store game account passwords here.';
COMMENT ON COLUMN public.orders.admin_note IS
  'Internal admin communication note — not exposed to customers.';
COMMENT ON COLUMN public.orders.receipt_token_hash IS
  'SHA-256 hash of guest receipt token; never store raw token.';

CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders (payment_status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_channel_idx ON public.orders (channel);

-- Backfill channel for known Stripe rows
UPDATE public.orders
SET channel = 'stripe'
WHERE channel IS NULL
  AND (
    stripe_checkout_session_id IS NOT NULL
    OR payment_method IN ('stripe', 'stripe_fpx')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Additive order_items snapshot columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS currency_snapshot text,
  ADD COLUMN IF NOT EXISTS title_snapshot text,
  ADD COLUMN IF NOT EXISTS price_snapshot numeric(12,2);

-- Backfill from legacy columns
UPDATE public.order_items oi
SET
  title_snapshot = COALESCE(oi.title_snapshot, oi.product_title),
  price_snapshot = COALESCE(oi.price_snapshot, oi.unit_price, oi.price),
  currency_snapshot = COALESCE(
    oi.currency_snapshot,
    (SELECT o.currency FROM public.orders o WHERE o.id = oi.order_id),
    'MYR'
  )
WHERE oi.title_snapshot IS NULL
   OR oi.price_snapshot IS NULL
   OR oi.currency_snapshot IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) stripe_events — webhook idempotency
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY, -- Stripe event id (evt_...)
  type text NOT NULL,
  order_id uuid REFERENCES public.orders (id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  payload_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_events_order_id_idx ON public.stripe_events (order_id);
CREATE INDEX IF NOT EXISTS stripe_events_type_idx ON public.stripe_events (type);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stripe_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.stripe_events', r.policyname);
  END LOOP;
END $$;

-- No anon/authenticated access. Server uses service_role (bypasses RLS).
-- Explicit deny policies for clarity.
CREATE POLICY stripe_events_admin_select ON public.stripe_events
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Disable legacy inventory-locking checkout RPC for clients
--    place_store_order marks products sold immediately — incompatible with
--    on-demand sourcing. Server Stripe flow does NOT call it.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.place_store_order(
  p_customer_name     text,
  p_customer_email    text,
  p_customer_whatsapp text,
  p_customer_note     text,
  p_payment_method    text,
  p_product_ids       uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'CHECKOUT_DEPRECATED'
    USING HINT = 'Use Stripe Checkout create-session. Legacy place_store_order is disabled (no inventory lock / no auto sold).';
END;
$$;

REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Stripe attach / paid / expired / failed (service_role only)
--    Does NOT change product.status.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.attach_stripe_checkout_session(
  p_order_id            uuid,
  p_checkout_session_id text,
  p_payment_intent_id   text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_method = CASE
      WHEN payment_method IS NULL OR payment_method IN ('', 'website', 'stripe_fpx')
        THEN 'stripe'
      ELSE payment_method
    END,
    channel = COALESCE(channel, 'stripe'),
    updated_at = now()
  WHERE id = p_order_id
    AND (
      stripe_checkout_session_id IS NULL
      OR stripe_checkout_session_id = p_checkout_session_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_stripe_payment_paid(
  p_order_id            uuid,
  p_checkout_session_id text,
  p_payment_intent_id   text,
  p_amount_total        numeric,
  p_currency            text
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

  -- Idempotent: already paid (or further along) → no-op
  IF v_order.payment_status = 'paid'
     OR v_order.status IN ('paid', 'sourcing', 'fulfilled', 'processing', 'completed') THEN
    RETURN jsonb_build_object('updated', false, 'status', v_order.status);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_status = 'paid',
    status = 'paid',
    order_status = 'paid',
    channel = COALESCE(channel, 'stripe'),
    payment_method = CASE
      WHEN payment_method IS NULL OR payment_method IN ('', 'website', 'stripe_fpx')
        THEN 'stripe'
      ELSE payment_method
    END,
    paid_at = COALESCE(paid_at, now()),
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'status', 'paid',
    'order_id', p_order_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_stripe_payment_failed(
  p_order_id            uuid,
  p_checkout_session_id text,
  p_amount_total        numeric,
  p_currency            text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
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

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    payment_status = 'failed',
    status = 'failed',
    order_status = 'failed',
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_row_count > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_stripe_checkout_expired(
  p_order_id            uuid,
  p_checkout_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
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

  -- Never expire a paid/sourcing/fulfilled order
  IF v_order.payment_status = 'paid'
     OR v_order.status IN ('paid', 'sourcing', 'fulfilled', 'processing', 'completed', 'refunded') THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    status = 'cancelled',
    order_status = 'cancelled',
    payment_status = CASE
      WHEN payment_status = 'paid' THEN payment_status
      ELSE 'failed'
    END,
    cancelled_at = COALESCE(cancelled_at, now()),
    updated_at = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_row_count > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.mark_stripe_checkout_expired(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_checkout_expired(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_checkout_expired(uuid, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) TO service_role;
    GRANT EXECUTE ON FUNCTION public.mark_stripe_checkout_expired(uuid, text) TO service_role;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Harden get_order_receipt — no UUID-only guest access
--    Guests must prove email; owned orders require auth owner/admin.
--    Prefer app signed receipt token for success pages.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_order_receipt(uuid);
DROP FUNCTION IF EXISTS public.get_order_receipt(uuid, text);

CREATE OR REPLACE FUNCTION public.get_order_receipt(
  p_order_id uuid,
  p_guest_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_items jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF auth.role() = 'service_role' THEN
    NULL; -- server gate
  ELSIF v_order.customer_id IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR (auth.uid() <> v_order.customer_id AND NOT public.is_admin()) THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
  ELSE
    IF p_guest_email IS NULL
       OR length(trim(p_guest_email)) = 0
       OR lower(trim(p_guest_email)) <> lower(trim(coalesce(v_order.customer_email, ''))) THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'title', coalesce(oi.title_snapshot, oi.product_title),
      'quantity', oi.quantity,
      'price', coalesce(oi.price_snapshot, nullif(oi.unit_price, 0), oi.price),
      'currency', coalesce(oi.currency_snapshot, v_order.currency, 'MYR'),
      'product_id', oi.product_id
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'customer_email', v_order.customer_email,
    'total', coalesce(v_order.total_amount, v_order.total),
    'currency', coalesce(v_order.currency, 'MYR'),
    'status', coalesce(v_order.status, v_order.order_status),
    'payment_status', v_order.payment_status,
    'channel', v_order.channel,
    'created_at', v_order.created_at,
    'paid_at', v_order.paid_at,
    'fulfilled_at', v_order.fulfilled_at,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_receipt(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_order_receipt(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RLS reminder (orders/order_items already restricted in master migration)
--    Anonymous: no direct table access
--    Authenticated: SELECT own orders / items
--    Admin: full write via is_admin()
--    Mutations for Stripe: service_role only (API routes)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Ensure no anonymous INSERT/UPDATE on orders
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_select_own_or_admin'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname = 'orders_user_select'
  ) THEN
    CREATE POLICY orders_select_own_or_admin ON public.orders
      FOR SELECT TO authenticated
      USING (customer_id = auth.uid() OR public.is_admin());
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
