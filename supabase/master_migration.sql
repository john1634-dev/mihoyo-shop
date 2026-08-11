-- =============================================================================
-- Mihoyo Shop — MASTER MIGRATION
-- Paste this entire file into Supabase SQL Editor and run it once.
-- Safe to run repeatedly (all statements are idempotent).
--
-- Covers (in dependency order):
--   1.  orders table: constraints + new columns
--   2.  profiles table + auth trigger
--   3.  RLS policies (games, products, product_images, orders, order_items)
--   4.  is_admin() helper
--   5.  place_store_order  ← canonical V2 (fixes PGRST202)
--   6.  get_order_receipt
--   7.  Stripe columns on orders
--   8.  attach_stripe_checkout_session
--   9.  mark_stripe_payment_paid
--  10.  mark_stripe_payment_failed
--  11.  All REVOKE / GRANT statements
--  12.  PostgREST schema cache reload
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  orders table: allow new status values + add columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_status_check
  CHECK (order_status IN ('pending', 'paid', 'processing', 'completed', 'cancelled'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IS NULL OR status IN ('pending', 'paid', 'processing', 'completed', 'cancelled'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

-- customer_id (V2 auth linkage)
-- Handles three cases:
--   a) Column does not exist yet       → add it with the correct FK
--   b) Column exists, FK targets wrong table → fix FK (see fix_orders_customer_fk.sql)
--   c) Column exists, FK already correct   → no-op
DO $$
BEGIN
  -- Add column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN customer_id uuid;
  END IF;

  -- Null out any customer_id values that don't exist in auth.users
  -- (handles old customers-table IDs on existing databases)
  UPDATE public.orders
  SET customer_id = NULL
  WHERE customer_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = customer_id);

  -- Drop old FK regardless of target (idempotent — IF EXISTS)
  ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

  -- Add correct FK → auth.users
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id)
    REFERENCES auth.users (id)
    ON DELETE SET NULL;
END $$;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);

-- Stripe identifiers
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id   text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_checkout_session_id_uidx
  ON public.orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_stripe_payment_intent_id_uidx
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  Enable RLS on core tables
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.games           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items     ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  profiles table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email      text,
  full_name  text,
  is_admin   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx    ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON public.profiles (is_admin);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  is_admin() helper  (must exist before RLS policies that reference it)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_admin = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Auto-create profile on signup + backfill existing users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    false
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill
INSERT INTO public.profiles (id, email, full_name, is_admin)
SELECT id, email, coalesce(raw_user_meta_data->>'full_name', ''), false
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  Protect is_admin flag on profiles (cannot self-promote)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- Trusted bootstrap path: when auth.uid() is NULL the call comes from a
    -- direct DB connection (Supabase SQL Editor / postgres superuser), not from
    -- an application request.  Allow it so the first admin can be promoted.
    -- All application requests always have a non-null auth.uid() set by the
    -- Supabase JWT hook, so this path is never reachable from the browser.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_flag();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  RLS policies
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop all existing policies on relevant tables first (idempotent)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'games', 'products', 'product_images', 'orders', 'order_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- profiles
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- games
CREATE POLICY games_public_select ON public.games
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

CREATE POLICY games_admin_write ON public.games
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- products
CREATE POLICY products_public_select ON public.products
  FOR SELECT TO anon, authenticated
  USING (status IN ('available', 'sold') OR public.is_admin());

CREATE POLICY products_admin_write ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- product_images
CREATE POLICY product_images_public_select ON public.product_images
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.status IN ('available', 'sold')
    )
  );

CREATE POLICY product_images_admin_write ON public.product_images
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- orders: users see own; service_role sees all; admin sees all
CREATE POLICY orders_select_own_or_admin ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

-- anon can select by UUID (guest receipt lookup via RPC — RPC is SECURITY DEFINER)
-- No direct table SELECT for anon needed; handled by get_order_receipt RPC.

CREATE POLICY orders_admin_write ON public.orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- order_items
CREATE POLICY order_items_select_own_or_admin ON public.order_items
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY order_items_admin_write ON public.order_items
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  place_store_order  — canonical V2
--     DROP first to clear any stale PostgREST schema cache overload.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.place_store_order(text, text, text, text, text, uuid[]);

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
DECLARE
  v_ids             uuid[];
  v_locked_count    int;
  v_available_count int;
  v_order_id        uuid;
  v_order_number    text;
  v_total           numeric(12,2) := 0;
  v_item            record;
  v_items           jsonb := '[]'::jsonb;
  v_customer_id     uuid  := auth.uid();
  v_email           text;
BEGIN
  -- Input validation
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  v_email := lower(trim(coalesce(p_customer_email, '')));

  -- Logged-in users: always use their verified account email
  IF v_customer_id IS NOT NULL THEN
    SELECT lower(email) INTO v_email
    FROM auth.users
    WHERE id = v_customer_id;

    IF v_email IS NULL THEN
      RAISE EXCEPTION 'INVALID_EMAIL';
    END IF;
  ELSIF v_email IS NULL OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  IF p_customer_whatsapp IS NULL
     OR length(regexp_replace(p_customer_whatsapp, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'INVALID_WHATSAPP';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  -- Deduplicate
  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(p_product_ids) AS id;

  IF array_length(v_ids, 1) IS DISTINCT FROM array_length(p_product_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PRODUCT';
  END IF;

  -- Race-condition protection: lock rows before reading status
  PERFORM 1 FROM public.products WHERE id = ANY(v_ids) FOR UPDATE;

  SELECT count(*) INTO v_locked_count
  FROM public.products WHERE id = ANY(v_ids);

  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_available_count
  FROM public.products
  WHERE id = ANY(v_ids) AND status = 'available';

  IF v_available_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  -- Server-side price (never trust frontend)
  SELECT coalesce(sum(price), 0) INTO v_total
  FROM public.products WHERE id = ANY(v_ids);

  -- Order number
  v_order_number := 'MS-'
    || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  -- Create order
  INSERT INTO public.orders (
    order_number, customer_id, customer_name, customer_email,
    customer_whatsapp, customer_note,
    subtotal, total, total_amount, currency,
    status, order_status, payment_status, payment_method
  ) VALUES (
    v_order_number,
    v_customer_id,
    trim(p_customer_name),
    v_email,
    trim(p_customer_whatsapp),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    v_total, v_total, v_total,
    'MYR',
    'pending', 'pending', 'pending',
    coalesce(nullif(trim(p_payment_method), ''), 'website')
  )
  RETURNING id INTO v_order_id;

  -- Create order items
  FOR v_item IN
    SELECT id, title, price, cover_image_url
    FROM public.products
    WHERE id = ANY(v_ids)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_title, price, unit_price, quantity, subtotal
    ) VALUES (
      v_order_id, v_item.id, v_item.title,
      v_item.price, v_item.price, 1, v_item.price
    );

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_item.id,
      'title',      v_item.title,
      'price',      v_item.price,
      'quantity',   1,
      'image',      v_item.cover_image_url
    ));
  END LOOP;

  -- Mark products sold (atomic; concurrent race loser gets 0 rows → exception)
  UPDATE public.products
  SET status = 'sold', updated_at = now()
  WHERE id = ANY(v_ids) AND status = 'available';

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  RETURN jsonb_build_object(
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'total',          v_total,
    'currency',       'MYR',
    'customer_id',    v_customer_id,
    'customer_email', v_email,
    'items',          v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  get_order_receipt
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_order_receipt(p_order_id uuid)
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

  -- Owned orders: only that user or an admin may fetch
  IF v_order.customer_id IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR (auth.uid() <> v_order.customer_id AND NOT public.is_admin())
    THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'title',      oi.product_title,
      'quantity',   oi.quantity,
      'price',      coalesce(nullif(oi.unit_price, 0), oi.price),
      'subtotal',   coalesce(nullif(oi.subtotal,   0), oi.price * oi.quantity),
      'product_id', oi.product_id,
      'image',      p.cover_image_url
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id',          v_order.id,
    'order_number',      v_order.order_number,
    'customer_id',       v_order.customer_id,
    'customer_name',     v_order.customer_name,
    'customer_email',    v_order.customer_email,
    'customer_whatsapp', v_order.customer_whatsapp,
    'total',             coalesce(v_order.total_amount, v_order.total),
    'currency',          coalesce(v_order.currency, 'MYR'),
    'status',            coalesce(v_order.order_status, v_order.status),
    'payment_status',    v_order.payment_status,
    'payment_method',    v_order.payment_method,
    'created_at',        v_order.created_at,
    'items',             v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid) TO anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  attach_stripe_checkout_session
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
    stripe_payment_intent_id   = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_method = CASE
      WHEN payment_method IS NULL OR payment_method IN ('', 'website')
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

REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.attach_stripe_checkout_session(uuid, text, text) TO service_role;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11.  mark_stripe_payment_paid
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_order      public.orders%ROWTYPE;
  v_items      jsonb := '[]'::jsonb;
  v_updated    boolean := false;
  v_row_count  integer := 0;
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

  -- Idempotency: already paid → skip
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    stripe_payment_intent_id   = COALESCE(NULLIF(p_payment_intent_id, ''), stripe_payment_intent_id),
    payment_status = 'paid',
    order_status   = 'processing',
    status         = 'processing',
    updated_at     = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'title',    oi.product_title,
      'price',    COALESCE(oi.unit_price, oi.price, 0),
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
      'customerName',  v_order.customer_name,
      'customerEmail', v_order.customer_email,
      'orderNumber',   v_order.order_number,
      'orderId',       v_order.id,
      'status',        'processing',
      'paymentStatus', 'paid',
      'total',         COALESCE(v_order.total_amount, v_order.total, 0),
      'currency',      COALESCE(v_order.currency, 'MYR'),
      'createdAt',     v_order.created_at,
      'items',         v_items
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_paid(uuid, text, text, numeric, text) TO service_role;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12.  mark_stripe_payment_failed
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_order     public.orders%ROWTYPE;
  v_updated   boolean := false;
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

  -- Never downgrade a paid order
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('updated', false);
  END IF;

  UPDATE public.orders
  SET
    stripe_checkout_session_id = p_checkout_session_id,
    payment_status = 'failed',
    order_status   = 'pending',
    status         = 'pending',
    updated_at     = now()
  WHERE id = p_order_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_updated := v_row_count > 0;

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.mark_stripe_payment_failed(uuid, text, numeric, text) TO service_role;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 13.  Storage policies (only if bucket exists)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images') THEN
    EXECUTE 'DROP POLICY IF EXISTS "product_images_public_read"   ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_insert"   ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_update"   ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_delete"   ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_admin_insert"  ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_admin_update"  ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_admin_delete"  ON storage.objects';

    EXECUTE $p$
      CREATE POLICY "product_images_public_read"
      ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'product-images')
    $p$;

    EXECUTE $p$
      CREATE POLICY "product_images_admin_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-images' AND public.is_admin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "product_images_admin_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING     (bucket_id = 'product-images' AND public.is_admin())
      WITH CHECK (bucket_id = 'product-images' AND public.is_admin())
    $p$;

    EXECUTE $p$
      CREATE POLICY "product_images_admin_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'product-images' AND public.is_admin())
    $p$;
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 14.  Force PostgREST schema cache reload
--      Supabase exposes this via pg_notify; the API server picks it up within
--      a few seconds.
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
