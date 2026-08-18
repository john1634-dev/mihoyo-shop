-- Phase 16.1 — product_type for Endgame / Reroll / Top Up (reserved).
-- Safe to run multiple times. Existing products default to ENDGAME_ACCOUNT.
-- Apply manually in Supabase SQL editor; do NOT auto-run against production.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'ENDGAME_ACCOUNT';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('ENDGAME_ACCOUNT', 'REROLL_ACCOUNT', 'TOP_UP'));

UPDATE public.products
SET product_type = 'ENDGAME_ACCOUNT'
WHERE product_type IS NULL;

COMMENT ON COLUMN public.products.product_type IS
  'Storefront product category: ENDGAME_ACCOUNT, REROLL_ACCOUNT, TOP_UP (future Phase 16.3).';
