-- Phase 5.1.1 — Apply region_code + conservative backfill
-- Safe / additive only.
-- Does NOT modify prices, status, currency values, RLS, auth, orders, or Stripe.
--
-- Run this entire script once in Supabase SQL Editor (role: postgres).
-- Review before running.

BEGIN;

-- 1) Additive schema (idempotent)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS region_code text;

COMMENT ON COLUMN public.products.region_code IS
  'Listing region code: GLOBAL, ASIA, AMERICA, EUROPE, JAPAN, KOREA, TAIWAN, SEA. Nullable for legacy rows.';

CREATE INDEX IF NOT EXISTS products_region_code_idx
  ON public.products (region_code)
  WHERE region_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_currency_idx
  ON public.products (currency)
  WHERE currency IS NOT NULL;

-- 2) Conservative backfill from existing server text
--    Map only ASIA / SEA (case-insensitive).
--    Do NOT overwrite manually assigned region_code values.
UPDATE public.products
SET region_code = 'ASIA'
WHERE region_code IS NULL
  AND upper(trim(coalesce(server, ''))) = 'ASIA';

UPDATE public.products
SET region_code = 'SEA'
WHERE region_code IS NULL
  AND upper(trim(coalesce(server, ''))) = 'SEA';

COMMIT;

-- 3) Verification queries (run after commit)
SELECT region_code, COUNT(*) AS product_count
FROM public.products
GROUP BY region_code
ORDER BY region_code NULLS FIRST;

SELECT currency, COUNT(*) AS product_count
FROM public.products
GROUP BY currency
ORDER BY currency NULLS FIRST;

SELECT status, COUNT(*) AS product_count
FROM public.products
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS total_products FROM public.products;

SELECT COUNT(*) AS usd_products
FROM public.products
WHERE upper(trim(coalesce(currency, ''))) = 'USD';
