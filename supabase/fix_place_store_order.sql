-- =============================================================================
-- Mihoyo Shop — Fix place_store_order schema cache mismatch
-- Run this in Supabase SQL Editor.
--
-- Root cause:
--   v2_auth_orders.sql was never applied.  The live DB still has the
--   security_and_orders.sql version, which lacks customer_id / auth.uid()
--   and whose GRANT let PostgREST cache it under the old schema.
--   When the application sends named parameters the PostgREST schema cache
--   cannot match the function → PGRST202.
--
-- This file is a STANDALONE replacement.
-- It is safe to run even if v2_auth_orders.sql was partially applied.
-- It preserves all Phase-1 security: SELECT FOR UPDATE, status=available
-- check, atomic insert, product→sold, race-condition protection,
-- guest checkout, registered checkout.
-- =============================================================================

-- 1) Make sure the orders table has the customer_id column.
--    (Idempotent — ALTER TABLE ADD COLUMN IF NOT EXISTS does nothing if
--     the column already exists.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'orders'
      AND column_name  = 'customer_id'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN customer_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);

-- 2) Drop the OLD signature that PostgREST has cached, so there is no
--    overloaded ambiguity.  Both old and new have the same parameter names
--    and types, so CREATE OR REPLACE alone is enough — but the explicit
--    DROP removes any stale cached overload from prior migrations.
DROP FUNCTION IF EXISTS public.place_store_order(text, text, text, text, text, uuid[]);

-- 3) Create the canonical V2 version.
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
  v_ids            uuid[];
  v_locked_count   int;
  v_available_count int;
  v_order_id       uuid;
  v_order_number   text;
  v_total          numeric(12,2) := 0;
  v_item           record;
  v_items          jsonb := '[]'::jsonb;
  v_customer_id    uuid  := auth.uid();
  v_email          text;
BEGIN
  -- ── Input validation ──────────────────────────────────────────────────────
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'INVALID_NAME';
  END IF;

  v_email := lower(trim(coalesce(p_customer_email, '')));

  -- Logged-in users: always use their account email (ignore supplied value).
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

  -- Deduplicate supplied IDs (each game account can only appear once).
  SELECT array_agg(DISTINCT id) INTO v_ids
  FROM unnest(p_product_ids) AS id;

  IF array_length(v_ids, 1) IS DISTINCT FROM array_length(p_product_ids, 1) THEN
    RAISE EXCEPTION 'DUPLICATE_PRODUCT';
  END IF;

  -- ── Race-condition protection: lock all rows before reading status ────────
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

  -- ── Price from DB (never trust frontend amount) ───────────────────────────
  SELECT coalesce(sum(price), 0) INTO v_total
  FROM public.products WHERE id = ANY(v_ids);

  -- ── Order number ──────────────────────────────────────────────────────────
  v_order_number := 'MS-'
    || to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYMMDD')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  -- ── Create order ──────────────────────────────────────────────────────────
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

  -- ── Create order items ────────────────────────────────────────────────────
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

    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_item.id,
        'title',      v_item.title,
        'price',      v_item.price,
        'quantity',   1,
        'image',      v_item.cover_image_url
      )
    );
  END LOOP;

  -- ── Mark products sold (atomic; race loser will get 0 rows here) ──────────
  UPDATE public.products
  SET status = 'sold', updated_at = now()
  WHERE id = ANY(v_ids) AND status = 'available';

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count IS DISTINCT FROM array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'PRODUCT_UNAVAILABLE';
  END IF;

  -- ── Return result ─────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'order_id',      v_order_id,
    'order_number',  v_order_number,
    'total',         v_total,
    'currency',      'MYR',
    'customer_id',   v_customer_id,
    'customer_email', v_email,
    'items',         v_items
  );
END;
$$;

-- 4) Permissions: anon + authenticated can call (PostgREST requires EXECUTE
--    grant to the calling role; service_role already has it by default).
REVOKE ALL ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_store_order(text, text, text, text, text, uuid[]) TO anon, authenticated;
