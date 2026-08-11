-- =============================================================================
-- Mihoyo Shop V3 Hardening
-- Safe to run multiple times.
-- =============================================================================

-- 1) Atomically validate + apply coupon to an existing pending order.
--    This closes race windows between validate and increment.
CREATE OR REPLACE FUNCTION public.apply_coupon_to_order(
  p_order_id uuid,
  p_coupon_code text,
  p_user_id uuid DEFAULT NULL,
  p_guest_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_discount numeric(12,2) := 0;
  v_user_uses int := 0;
  v_use_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_coupon_code IS NULL OR length(trim(p_coupon_code)) = 0 THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon code is required.');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  -- Only pending, unpaid orders may receive coupon updates.
  IF coalesce(v_order.payment_status, 'pending') <> 'pending' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Order is no longer pending.');
  END IF;

  IF coalesce(v_order.coupon_code, '') <> '' THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon already applied.');
  END IF;

  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE UPPER(code) = UPPER(trim(p_coupon_code))
  FOR UPDATE;

  IF NOT FOUND OR v_coupon.is_active = false THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon not found or inactive.');
  END IF;

  IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon is not yet active.');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND now() > v_coupon.expires_at THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon has expired.');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon usage limit reached.');
  END IF;

  IF coalesce(v_order.total_amount, v_order.total, 0) < v_coupon.min_order_amount THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', format('Minimum order amount is RM %.2f.', v_coupon.min_order_amount)
    );
  END IF;

  IF v_coupon.max_uses_per_user IS NOT NULL THEN
    IF p_user_id IS NOT NULL THEN
      SELECT count(*) INTO v_user_uses
      FROM public.coupon_uses
      WHERE coupon_id = v_coupon.id
        AND user_id = p_user_id;
    ELSIF p_guest_email IS NOT NULL AND length(trim(p_guest_email)) > 0 THEN
      SELECT count(*) INTO v_user_uses
      FROM public.coupon_uses
      WHERE coupon_id = v_coupon.id
        AND guest_email = lower(trim(p_guest_email));
    END IF;

    IF v_user_uses >= v_coupon.max_uses_per_user THEN
      RETURN jsonb_build_object('applied', false, 'reason', 'Coupon usage limit reached for this account.');
    END IF;
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := round((coalesce(v_order.total_amount, v_order.total, 0) * v_coupon.discount_value / 100)::numeric, 2);
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  -- Keep payment amount positive for Stripe Checkout payment mode.
  v_discount := LEAST(v_discount, GREATEST(coalesce(v_order.total_amount, v_order.total, 0) - 0.01, 0));

  -- Reserve coupon use for this order first (prevents double-increment races).
  INSERT INTO public.coupon_uses (coupon_id, order_id, user_id, guest_email)
  VALUES (
    v_coupon.id,
    p_order_id,
    p_user_id,
    CASE WHEN p_user_id IS NULL THEN lower(trim(coalesce(p_guest_email, ''))) ELSE NULL END
  )
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_use_id;

  IF v_use_id IS NULL THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'Coupon already applied.');
  END IF;

  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE id = v_coupon.id;

  UPDATE public.orders
  SET coupon_id = v_coupon.id,
      coupon_code = v_coupon.code,
      discount_amount = v_discount,
      total_amount = round((coalesce(v_order.total_amount, v_order.total, 0) - v_discount)::numeric, 2),
      total = round((coalesce(v_order.total_amount, v_order.total, 0) - v_discount)::numeric, 2),
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'applied', true,
    'coupon_id', v_coupon.id,
    'code', v_coupon.code,
    'discount_amount', v_discount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon_to_order(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_coupon_to_order(uuid, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_coupon_to_order(uuid, text, uuid, text) FROM authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.apply_coupon_to_order(uuid, text, uuid, text) TO service_role;
  END IF;
END $$;

-- Extend coupon_uses for guest-limit enforcement when needed.
ALTER TABLE public.coupon_uses
  ADD COLUMN IF NOT EXISTS guest_email text;
CREATE INDEX IF NOT EXISTS coupon_uses_guest_email_idx ON public.coupon_uses (guest_email);

-- One coupon use row per order (binds coupon to order atomically).
CREATE UNIQUE INDEX IF NOT EXISTS coupon_uses_order_uidx ON public.coupon_uses (order_id);

-- 2) Compensating rollback when checkout session creation/attach fails.
CREATE OR REPLACE FUNCTION public.rollback_checkout_order_on_session_failure(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reversed_coupon_id uuid;
  v_restore_total numeric(12,2);
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Never touch already-paid orders (idempotent no-op).
  IF coalesce(v_order.payment_status, 'pending') = 'paid' THEN
    RETURN;
  END IF;

  -- Reverse coupon reservation if checkout setup failed after apply_coupon_to_order.
  DELETE FROM public.coupon_uses cu
  WHERE cu.order_id = p_order_id
  RETURNING cu.coupon_id INTO v_reversed_coupon_id;

  IF v_reversed_coupon_id IS NOT NULL THEN
    UPDATE public.coupons
    SET current_uses = GREATEST(current_uses - 1, 0),
        updated_at = now()
    WHERE id = v_reversed_coupon_id;
  END IF;

  v_restore_total := coalesce(
    v_order.subtotal,
    (coalesce(v_order.total_amount, v_order.total, 0) + coalesce(v_order.discount_amount, 0))
  );

  -- Release reserved sold items back to available for this order.
  UPDATE public.products p
  SET status = 'available',
      updated_at = now()
  WHERE p.id IN (
    SELECT oi.product_id
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  )
  AND p.status = 'sold';

  UPDATE public.orders
  SET payment_status = 'failed',
      status = 'pending',
      order_status = 'pending',
      coupon_id = NULL,
      coupon_code = NULL,
      discount_amount = 0,
      total_amount = v_restore_total,
      total = v_restore_total,
      customer_note = CASE
        WHEN coalesce(v_order.payment_status, 'pending') = 'failed' THEN v_order.customer_note
        WHEN p_reason IS NULL OR length(trim(p_reason)) = 0 THEN v_order.customer_note
        ELSE left(
          coalesce(v_order.customer_note, '') || E'\n[system] checkout_setup_failed: ' || trim(p_reason),
          2000
        )
      END,
      updated_at = now()
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_checkout_order_on_session_failure(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rollback_checkout_order_on_session_failure(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.rollback_checkout_order_on_session_failure(uuid, text) FROM authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rollback_checkout_order_on_session_failure(uuid, text) TO service_role;
  END IF;
END $$;

-- 3) V3 table RLS hardening — deny anon writes; users cannot touch admin-only rows.
REVOKE ALL ON TABLE public.coupons FROM anon;
REVOKE ALL ON TABLE public.coupon_uses FROM anon;
REVOKE ALL ON TABLE public.wishlists FROM anon;
REVOKE ALL ON TABLE public.affiliates FROM anon;
REVOKE ALL ON TABLE public.referrals FROM anon;

GRANT SELECT ON TABLE public.reviews TO anon;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.coupons FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.coupon_uses FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.affiliates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.referrals FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.reviews FROM authenticated;

GRANT SELECT ON TABLE public.coupons TO authenticated;
GRANT SELECT ON TABLE public.coupon_uses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wishlists TO authenticated;
GRANT SELECT ON TABLE public.reviews TO authenticated;
GRANT SELECT ON TABLE public.affiliates TO authenticated;
GRANT SELECT ON TABLE public.referrals TO authenticated;

-- Wishlists: split policies so users cannot write other users' rows.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wishlists' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wishlists', r.policyname);
  END LOOP;
END $$;

CREATE POLICY wishlists_select_own ON public.wishlists
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY wishlists_insert_own ON public.wishlists
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY wishlists_update_own ON public.wishlists
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY wishlists_delete_own ON public.wishlists
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY wishlists_admin_all ON public.wishlists
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Reviews: public read + admin manage only (writes via submit_review RPC).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reviews' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.reviews', r.policyname);
  END LOOP;
END $$;

CREATE POLICY reviews_public_select ON public.reviews
  FOR SELECT TO anon, authenticated
  USING (is_hidden = false);

CREATE POLICY reviews_own_select ON public.reviews
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY reviews_admin_all ON public.reviews
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Affiliates / referrals: read-only for owners; admin manages rows.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'affiliates' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.affiliates', r.policyname);
  END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'referrals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.referrals', r.policyname);
  END LOOP;
END $$;

CREATE POLICY affiliates_own_select ON public.affiliates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY affiliates_admin_all ON public.affiliates
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY referrals_admin_all ON public.referrals
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY referrals_own_select ON public.referrals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.affiliates a
      WHERE a.id = referrals.affiliate_id AND a.user_id = auth.uid()
    )
  );

-- Coupons: admin-only direct access (checkout uses service_role RPCs).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupons' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupons', r.policyname);
  END LOOP;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'coupon_uses' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.coupon_uses', r.policyname);
  END LOOP;
END $$;

CREATE POLICY coupons_admin_all ON public.coupons
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY coupon_uses_admin_all ON public.coupon_uses
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';

