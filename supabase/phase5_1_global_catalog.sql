-- Phase 5.1 — Global Catalog Foundation
-- Additive only. Does NOT modify orders, Stripe RPCs, auth, or RLS.
-- Review before applying. Do NOT auto-run against production.

-- region_code: listing region attribute for international filters
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS region_code text;

COMMENT ON COLUMN public.products.region_code IS
  'Listing region code: GLOBAL, ASIA, AMERICA, EUROPE, JAPAN, KOREA, TAIWAN, SEA. Nullable for legacy rows.';

-- Optional index for catalog filters (safe if column already indexed)
CREATE INDEX IF NOT EXISTS products_region_code_idx
  ON public.products (region_code)
  WHERE region_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_currency_idx
  ON public.products (currency)
  WHERE currency IS NOT NULL;
