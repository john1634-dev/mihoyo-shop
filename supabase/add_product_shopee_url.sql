-- Optional: per-product Shopee listing URL.
-- Safe to run multiple times. Does not break existing products.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopee_url text;

COMMENT ON COLUMN public.products.shopee_url IS
  'Optional product-specific Shopee URL. Empty = use global store URL.';
