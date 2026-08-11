-- =============================================================================
-- Mihoyo Shop — Security + Atomic Checkout
-- Run this in Supabase Dashboard → SQL Editor (as project owner).
-- Does NOT delete product/order business data.
-- =============================================================================

-- 1) Allow "processing" as an order status (needed for admin workflow)
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

-- 2) Enable RLS on core tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 3) Drop overly-permissive policies if they exist (safe if missing)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('games', 'products', 'product_images', 'orders', 'order_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 4) Games: public read active games; admin write
CREATE POLICY games_public_select
  ON public.games FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR auth.role() = 'authenticated');

CREATE POLICY games_admin_insert
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY games_admin_update
  ON public.games FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY games_admin_delete
  ON public.games FOR DELETE
  TO authenticated
  USING (true);

-- 5) Products: public can read available + sold only (not hidden)
CREATE POLICY products_public_select
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (
    status IN ('available', 'sold')
    OR auth.role() = 'authenticated'
  );

CREATE POLICY products_admin_insert
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY products_admin_update
  ON public.products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY products_admin_delete
  ON public.products FOR DELETE
  TO authenticated
  USING (true);

-- 6) Product images: public read; admin write
CREATE POLICY product_images_public_select
  ON public.product_images FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND (
          p.status IN ('available', 'sold')
          OR auth.role() = 'authenticated'
        )
    )
  );

CREATE POLICY product_images_admin_insert
  ON public.product_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY product_images_admin_update
  ON public.product_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY product_images_admin_delete
  ON public.product_images FOR DELETE
  TO authenticated
  USING (true);

-- 7) Orders: no direct anon writes; authenticated admin full access
CREATE POLICY orders_admin_select
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY orders_admin_insert
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY orders_admin_update
  ON public.orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY orders_admin_delete
  ON public.orders FOR DELETE
  TO authenticated
  USING (true);

-- 8) Order items: admin only for direct table access
CREATE POLICY order_items_admin_select
  ON public.order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY order_items_admin_insert
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY order_items_admin_update
  ON public.order_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY order_items_admin_delete
  ON public.order_items FOR DELETE
  TO authenticated
  USING (true);

-- 9) Atomic checkout RPC (prevents double-purchase race)
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
BEGIN
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  IF p_customer_email IS NULL OR p_customer_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  IF p_customer_whatsapp IS NULL OR length(regexp_replace(p_customer_whatsapp, '\D', '', 'g')) < 8 THEN
    RAISE EXCEPTION 'INVALID_WHATSAPP';
  END IF;

  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;

  -- Unique product IDs only (accounts are qty 1)
  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(p_product_ids) AS id;

  IF array_length(v_ids, 1) IS DISTINCT FROM array_length(p_product_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PRODUCT';
  END IF;

  -- Lock rows to prevent concurrent purchase
  PERFORM 1
  FROM public.products
  WHERE id = ANY(v_ids)
  FOR UPDATE;

  SELECT count(*) INTO v_locked_count
  FROM public.products
  WHERE id = ANY(v_ids);

  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_available_count
  FROM public.products
  WHERE id = ANY(v_ids)
    AND status = 'available';

  IF v_available_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  SELECT coalesce(sum(price), 0) INTO v_total
  FROM public.products
  WHERE id = ANY(v_ids);

  v_order_number := 'MS-' || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMMDD')
    || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    order_number,
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
    trim(p_customer_name),
    lower(trim(p_customer_email)),
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
    SELECT id, title, price
    FROM public.products
    WHERE id = ANY(v_ids)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      product_title,
      price,
      unit_price,
      quantity,
      subtotal
    ) VALUES (
      v_order_id,
      v_item.id,
      v_item.title,
      v_item.price,
      v_item.price,
      1,
      v_item.price
    );

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_item.id,
        'title', v_item.title,
        'price', v_item.price,
        'quantity', 1
      )
    );
  END LOOP;

  UPDATE public.products
  SET status = 'sold',
      updated_at = now()
  WHERE id = ANY(v_ids)
    AND status = 'available';

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;

  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'currency', 'MYR',
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) TO anon, authenticated;

-- 10) Public receipt lookup (UUID acts as capability token)
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
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'title', oi.product_title,
      'quantity', oi.quantity,
      'price', coalesce(nullif(oi.unit_price, 0), oi.price),
      'subtotal', coalesce(nullif(oi.subtotal, 0), oi.price * oi.quantity)
    )
    ORDER BY oi.created_at
  ), '[]'::jsonb)
  INTO v_items
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
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

-- 11) Storage policies for product-images (public read, authenticated write)
-- Bucket must already exist as public or with these policies.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images') THEN
    EXECUTE 'DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_insert" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_update" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "product_images_auth_delete" ON storage.objects';

    EXECUTE $policy$
      CREATE POLICY "product_images_public_read"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'product-images')
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_auth_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'product-images')
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_auth_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'product-images')
      WITH CHECK (bucket_id = 'product-images')
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "product_images_auth_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'product-images')
    $policy$;
  END IF;
END $$;
