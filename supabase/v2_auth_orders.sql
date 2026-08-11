-- =============================================================================
-- Mihoyo Shop V2 — Auth, Profiles, Order Ownership, Admin separation
-- Run in Supabase SQL Editor AFTER using /register and /account.
-- Does NOT delete existing product/order data.
--
-- AFTER RUNNING: promote your existing admin account:
--   UPDATE public.profiles SET is_admin = true WHERE email = 'your-admin@email.com';
-- =============================================================================

-- 1) Profiles (no passwords — linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text,
  full_name text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON public.profiles (is_admin);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2) Ensure orders.customer_id references auth.users when present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN customer_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);

-- 3) Auto-create profile on signup
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
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for existing auth users
INSERT INTO public.profiles (id, email, full_name, is_admin)
SELECT
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  false
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 4) Admin helper
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

-- 5) Prevent privilege escalation on profiles.is_admin
CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- auth.uid() IS NULL means this is a direct DB / SQL Editor connection
    -- (the Supabase JWT hook always sets auth.uid() for app requests).
    -- Allow that path so the first admin can be bootstrapped.
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
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_flag();

-- 6) Profiles RLS
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

CREATE POLICY profiles_select_own_or_admin
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_admin_update
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7) Rebuild product / game / image / order policies with is_admin()
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('games', 'products', 'product_images', 'orders', 'order_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Games
CREATE POLICY games_public_select ON public.games
  FOR SELECT TO anon, authenticated
  USING (is_active = true OR public.is_admin());

CREATE POLICY games_admin_write ON public.games
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Products
CREATE POLICY products_public_select ON public.products
  FOR SELECT TO anon, authenticated
  USING (status IN ('available', 'sold') OR public.is_admin());

CREATE POLICY products_admin_write ON public.products
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Product images
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

-- Orders: users see own; admin sees all; nobody else
CREATE POLICY orders_user_select ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

CREATE POLICY orders_admin_write ON public.orders
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Order items: same ownership rules
CREATE POLICY order_items_user_select ON public.order_items
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

-- 8) Atomic checkout: attach auth.uid() when logged in
CREATE OR REPLACE FUNCTION public.place_store_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_whatsapp text,
  p_customer_note text,
  p_payment_method text,
  p_product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids uuid[];
  v_locked_count int;
  v_available_count int;
  v_order_id uuid;
  v_order_number text;
  v_total numeric(12,2) := 0;
  v_item record;
  v_items jsonb := '[]'::jsonb;
  v_customer_id uuid := auth.uid();
  v_email text;
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  v_email := lower(trim(coalesce(p_customer_email, '')));

  -- Logged-in users must use their account email
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

  IF p_customer_whatsapp IS NULL OR length(regexp_replace(p_customer_whatsapp, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'INVALID_WHATSAPP';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(p_product_ids) AS id;

  IF array_length(v_ids, 1) IS DISTINCT FROM array_length(p_product_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PRODUCT';
  END IF;

  PERFORM 1 FROM public.products WHERE id = ANY(v_ids) FOR UPDATE;

  SELECT count(*) INTO v_locked_count FROM public.products WHERE id = ANY(v_ids);
  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_available_count
  FROM public.products
  WHERE id = ANY(v_ids) AND status = 'available';

  IF v_available_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  SELECT coalesce(sum(price), 0) INTO v_total
  FROM public.products WHERE id = ANY(v_ids);

  v_order_number := 'MS-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    order_number,
    customer_id,
    customer_name,
    customer_email,
    customer_whatsapp,
    customer_note,
    subtotal,
    total,
    total_amount,
    currency,
    status,
    order_status,
    payment_status,
    payment_method
  ) VALUES (
    v_order_number,
    v_customer_id,
    trim(p_customer_name),
    v_email,
    trim(p_customer_whatsapp),
    nullif(trim(coalesce(p_customer_note, '')), ''),
    v_total,
    v_total,
    v_total,
    'MYR',
    'pending',
    'pending',
    'pending',
    coalesce(nullif(trim(p_payment_method), ''), 'website')
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN
    SELECT id, title, price, cover_image_url
    FROM public.products
    WHERE id = ANY(v_ids)
  LOOP
    INSERT INTO public.order_items (
      order_id, product_id, product_title, price, unit_price, quantity, subtotal
    ) VALUES (
      v_order_id, v_item.id, v_item.title, v_item.price, v_item.price, 1, v_item.price
    );

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_item.id,
        'title', v_item.title,
        'price', v_item.price,
        'quantity', 1,
        'image', v_item.cover_image_url
      )
    );
  END LOOP;

  UPDATE public.products
  SET status = 'sold', updated_at = now()
  WHERE id = ANY(v_ids) AND status = 'available';

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'currency', 'MYR',
    'customer_id', v_customer_id,
    'customer_email', v_email,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) TO anon, authenticated;

-- 9) Receipt: guest by UUID; logged-in owner or admin
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

  -- If order belongs to a user, only that user (or admin) may read via this RPC
  -- Guest orders (customer_id IS NULL) remain readable by UUID capability token
  IF v_order.customer_id IS NOT NULL THEN
    IF auth.uid() IS NULL OR (auth.uid() <> v_order.customer_id AND NOT public.is_admin()) THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'title', oi.product_title,
      'quantity', oi.quantity,
      'price', coalesce(nullif(oi.unit_price, 0), oi.price),
      'subtotal', coalesce(nullif(oi.subtotal, 0), oi.price * oi.quantity),
      'product_id', oi.product_id,
      'image', p.cover_image_url
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'customer_id', v_order.customer_id,
    'customer_name', v_order.customer_name,
    'customer_email', v_order.customer_email,
    'customer_whatsapp', v_order.customer_whatsapp,
    'total', coalesce(v_order.total_amount, v_order.total),
    'currency', coalesce(v_order.currency, 'MYR'),
    'status', coalesce(v_order.order_status, v_order.status),
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'created_at', v_order.created_at,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_receipt(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid) TO anon, authenticated;

-- 10) Storage: only admins write
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images') THEN
    EXECUTE 'DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_delete" ON storage.objects';

    EXECUTE $policy$
      CREATE POLICY "product_images_public_read"
      ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'product-images')
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_admin_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'product-images' AND public.is_admin())
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_admin_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'product-images' AND public.is_admin())
      WITH CHECK (bucket_id = 'product-images' AND public.is_admin())
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_admin_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'product-images' AND public.is_admin())
    $policy$;
  END IF;
END $$;
