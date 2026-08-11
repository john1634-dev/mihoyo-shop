-- =============================================================================
-- Mihoyo Shop V3 — Coupons, Wishlist, Reviews, Affiliates
-- Run in Supabase SQL Editor after master_migration.sql.
-- Idempotent: safe to run multiple times.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. COUPONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coupons (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            text        NOT NULL,
  description     text,
  discount_type   text        NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value  numeric(12,2) NOT NULL CHECK (discount_value > 0),
  min_order_amount numeric(12,2) NOT NULL DEFAULT 0,
  max_uses        integer,           -- NULL = unlimited
  max_uses_per_user integer,         -- NULL = unlimited
  current_uses    integer     NOT NULL DEFAULT 0,
  starts_at       timestamptz,       -- NULL = no start restriction
  expires_at      timestamptz,       -- NULL = no expiry
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_code_uidx ON public.coupons (UPPER(code));
CREATE INDEX IF NOT EXISTS coupons_is_active_idx    ON public.coupons (is_active);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Only admins can read/write coupon rows directly.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='coupons' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupons', r.policyname);
  END LOOP;
END $$;

CREATE POLICY coupons_admin_all ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- coupon_uses tracks which user used which coupon (for per-user limits).
CREATE TABLE IF NOT EXISTS public.coupon_uses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id   uuid        NOT NULL REFERENCES public.coupons (id) ON DELETE CASCADE,
  order_id    uuid        NOT NULL,
  user_id     uuid,                  -- NULL for guest
  used_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_uses_coupon_idx ON public.coupon_uses (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_uses_user_idx   ON public.coupon_uses (user_id);
CREATE INDEX IF NOT EXISTS coupon_uses_order_idx  ON public.coupon_uses (order_id);

ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='coupon_uses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupon_uses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY coupon_uses_admin_all ON public.coupon_uses
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Add coupon columns to orders (idempotent).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_id       uuid REFERENCES public.coupons (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code     text,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS orders_coupon_idx ON public.orders (coupon_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COUPON RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- validate_coupon: anyone can call to preview a coupon before checkout.
CREATE OR REPLACE FUNCTION public.validate_coupon(
  p_code          text,
  p_order_subtotal numeric,
  p_user_id       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon  public.coupons%ROWTYPE;
  v_user_uses int := 0;
  v_discount  numeric(12,2);
BEGIN
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE UPPER(code) = UPPER(p_code)
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon not found or inactive.');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon is not yet active.');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND now() > v_coupon.expires_at THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon has expired.');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Coupon usage limit reached.');
  END IF;

  IF p_order_subtotal < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false,
      'reason', format('Minimum order amount is RM %.2f.', v_coupon.min_order_amount)
    );
  END IF;

  IF v_coupon.max_uses_per_user IS NOT NULL AND p_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_user_uses
    FROM public.coupon_uses
    WHERE coupon_id = v_coupon.id AND user_id = p_user_id;

    IF v_user_uses >= v_coupon.max_uses_per_user THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'You have already used this coupon.');
    END IF;
  END IF;

  -- Calculate discount
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := round((p_order_subtotal * v_coupon.discount_value / 100)::numeric, 2);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  -- Discount cannot exceed order subtotal
  v_discount := LEAST(v_discount, p_order_subtotal);

  RETURN jsonb_build_object(
    'valid',          true,
    'coupon_id',      v_coupon.id,
    'code',           v_coupon.code,
    'discount_type',  v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'discount_amount', v_discount,
    'description',    v_coupon.description
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric, uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. WISHLIST
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wishlists (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS wishlists_user_idx    ON public.wishlists (user_id);
CREATE INDEX IF NOT EXISTS wishlists_product_idx ON public.wishlists (product_id);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='wishlists' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wishlists', r.policyname);
  END LOOP;
END $$;

CREATE POLICY wishlists_own ON public.wishlists
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY wishlists_admin ON public.wishlists
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REVIEWS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reviews (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES public.products (id) ON DELETE CASCADE,
  order_id    uuid        NOT NULL,
  rating      smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body        text,
  is_hidden   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS reviews_product_idx  ON public.reviews (product_id);
CREATE INDEX IF NOT EXISTS reviews_user_idx     ON public.reviews (user_id);
CREATE INDEX IF NOT EXISTS reviews_hidden_idx   ON public.reviews (is_hidden);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
  END LOOP;
END $$;

-- Public can see non-hidden reviews.
CREATE POLICY reviews_public_select ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);

-- Owners can see their own (even hidden — for reference).
CREATE POLICY reviews_own_select ON public.reviews
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admins see all.
CREATE POLICY reviews_admin_all ON public.reviews
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Users can only INSERT via the verified RPC (see below); direct INSERT blocked.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. REVIEW RPC (purchase-verified insert)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_review(
  p_product_id uuid,
  p_order_id   uuid,
  p_rating     smallint,
  p_body       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_review_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Verify the order belongs to this user and contains this product.
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.id       = p_order_id
      AND o.customer_id = v_user_id
      AND o.payment_status = 'paid'
      AND oi.product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'PURCHASE_REQUIRED';
  END IF;

  INSERT INTO public.reviews (user_id, product_id, order_id, rating, body)
  VALUES (v_user_id, p_product_id, p_order_id, p_rating, nullif(trim(coalesce(p_body,'')), ''))
  ON CONFLICT (user_id, product_id) DO UPDATE
    SET rating     = EXCLUDED.rating,
        body       = EXCLUDED.body,
        updated_at = now()
  RETURNING id INTO v_review_id;

  RETURN jsonb_build_object('review_id', v_review_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, uuid, smallint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, uuid, smallint, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. AFFILIATES / REFERRALS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.affiliates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  referral_code text        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS affiliates_code_uidx ON public.affiliates (UPPER(referral_code));
CREATE INDEX IF NOT EXISTS affiliates_user_idx ON public.affiliates (user_id);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='affiliates' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.affiliates', r.policyname);
  END LOOP;
END $$;

-- Each user can read their own affiliate row (to show their code).
CREATE POLICY affiliates_own_select ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY affiliates_admin_all ON public.affiliates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- referrals: records which new user was referred by which affiliate.
CREATE TABLE IF NOT EXISTS public.referrals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id    uuid        NOT NULL REFERENCES public.affiliates (id) ON DELETE CASCADE,
  referred_user_id uuid       NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referrals_affiliate_idx ON public.referrals (affiliate_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='referrals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.referrals', r.policyname);
  END LOOP;
END $$;

CREATE POLICY referrals_admin_all ON public.referrals
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Affiliate can see their own referrals.
CREATE POLICY referrals_own_select ON public.referrals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = referrals.affiliate_id AND a.user_id = auth.uid()
    )
  );

-- Store referred_by on profiles (set once at registration, never changed).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referred_by_affiliate_id'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN referred_by_affiliate_id uuid REFERENCES public.affiliates (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by_affiliate_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. AFFILIATE RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- get_or_create_affiliate: authenticated user gets/creates their affiliate record.
CREATE OR REPLACE FUNCTION public.get_or_create_affiliate()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_aff     public.affiliates%ROWTYPE;
  v_code    text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_aff FROM public.affiliates WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    -- Generate a unique 8-char code based on uid + random
    LOOP
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.affiliates WHERE UPPER(referral_code) = v_code);
    END LOOP;

    INSERT INTO public.affiliates (user_id, referral_code)
    VALUES (v_user_id, v_code)
    RETURNING * INTO v_aff;
  END IF;

  RETURN jsonb_build_object(
    'id',            v_aff.id,
    'referral_code', v_aff.referral_code,
    'is_active',     v_aff.is_active,
    'created_at',    v_aff.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_affiliate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_affiliate() TO authenticated;

-- record_referral: called at registration with an optional ref code.
CREATE OR REPLACE FUNCTION public.record_referral(p_referral_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_aff        public.affiliates%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- No self-referral.
  SELECT * INTO v_aff
  FROM public.affiliates
  WHERE UPPER(referral_code) = UPPER(p_referral_code)
    AND user_id <> v_user_id
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'Invalid or own referral code.');
  END IF;

  -- Each user can only be referred once.
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = v_user_id) THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'Already referred.');
  END IF;

  -- Prevent changing referral on profile once set.
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_user_id AND referred_by_affiliate_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'Referral already recorded.');
  END IF;

  INSERT INTO public.referrals (affiliate_id, referred_user_id)
  VALUES (v_aff.id, v_user_id);

  UPDATE public.profiles
  SET referred_by_affiliate_id = v_aff.id
  WHERE id = v_user_id AND referred_by_affiliate_id IS NULL;

  RETURN jsonb_build_object('recorded', true, 'affiliate_id', v_aff.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_referral(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ANALYTICS VIEWS (read-only; no RLS needed — admin access via is_admin())
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_sales_summary AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'Asia/Kuala_Lumpur') AS day,
  count(*)                                                         AS order_count,
  count(*) FILTER (WHERE payment_status = 'paid')                 AS paid_count,
  count(*) FILTER (WHERE payment_status = 'pending')              AS pending_count,
  count(*) FILTER (WHERE payment_status = 'failed')               AS failed_count,
  coalesce(sum(total_amount) FILTER (WHERE payment_status = 'paid'), 0) AS revenue
FROM public.orders
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.v_admin_dashboard AS
SELECT
  (SELECT count(*) FROM public.orders)                                       AS total_orders,
  (SELECT count(*) FROM public.orders WHERE payment_status = 'paid')         AS paid_orders,
  (SELECT count(*) FROM public.orders WHERE payment_status = 'pending')      AS pending_orders,
  (SELECT count(*) FROM public.orders WHERE payment_status = 'failed')       AS failed_orders,
  (SELECT coalesce(sum(total_amount),0) FROM public.orders WHERE payment_status = 'paid') AS total_revenue,
  (SELECT count(*) FROM public.products WHERE status = 'available')          AS available_products,
  (SELECT count(*) FROM public.products WHERE status = 'sold')               AS sold_products,
  (SELECT count(*) FROM auth.users)                                           AS registered_users,
  (SELECT count(*) FROM public.orders WHERE customer_id IS NULL)             AS guest_orders,
  (SELECT count(*) FROM public.coupons WHERE is_active = true)               AS active_coupons,
  (SELECT coalesce(sum(current_uses),0) FROM public.coupons)                 AS total_coupon_uses,
  (SELECT count(*) FROM public.affiliates)                                    AS total_affiliates,
  (SELECT count(*) FROM public.referrals)                                     AS total_referrals;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8b. apply_coupon_use: atomically increments usage + records coupon_uses row.
--     Called server-side only (service_role).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.apply_coupon_use(
  p_coupon_id uuid,
  p_order_id  uuid,
  p_user_id   uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at   = now()
  WHERE id = p_coupon_id;

  INSERT INTO public.coupon_uses (coupon_id, order_id, user_id)
  VALUES (p_coupon_id, p_order_id, p_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon_use(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_coupon_use(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.apply_coupon_use(uuid, uuid, uuid) FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.apply_coupon_use(uuid, uuid, uuid) TO service_role;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. update_coupon_updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coupons_updated_at   ON public.coupons;
DROP TRIGGER IF EXISTS reviews_updated_at   ON public.reviews;

CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Auto-generate affiliate record for new users
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user_affiliate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.affiliates WHERE UPPER(referral_code) = v_code);
  END LOOP;

  INSERT INTO public.affiliates (user_id, referral_code)
  VALUES (NEW.id, v_code)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_affiliate ON auth.users;
CREATE TRIGGER on_auth_user_created_affiliate
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_affiliate();

-- Backfill affiliates for existing users
INSERT INTO public.affiliates (user_id, referral_code)
SELECT
  u.id,
  upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.affiliates a WHERE a.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. PostgREST reload
-- ─────────────────────────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';
