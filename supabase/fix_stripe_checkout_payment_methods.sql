-- Optional: label new Stripe Checkout attaches as "stripe" (not stripe_fpx).
-- Safe to run multiple times. Does not change paid-order logic or webhooks.

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
      WHEN payment_method IS NULL OR payment_method IN ('', 'website', 'stripe_fpx')
        THEN 'stripe'
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

NOTIFY pgrst, 'reload schema';
