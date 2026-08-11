-- =============================================================================
-- Optional hardening for guest order receipts
-- Prefer API gate in /api/orders/[id] (email + guest-only).
-- Run only if you want DB-level guest email binding as well.
-- =============================================================================

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

  IF v_order.customer_id IS NOT NULL THEN
    IF auth.uid() IS NULL
       OR (auth.uid() <> v_order.customer_id AND NOT public.is_admin())
    THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
  ELSE
    -- Guest orders: require matching email when caller is not service_role.
    IF auth.role() <> 'service_role' THEN
      IF p_guest_email IS NULL
         OR length(trim(p_guest_email)) = 0
         OR lower(trim(p_guest_email)) <> lower(trim(coalesce(v_order.customer_email, '')))
      THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
      END IF;
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
    'customer_note', v_order.customer_note,
    'created_at', v_order.created_at,
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_receipt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_order_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_order_receipt(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
