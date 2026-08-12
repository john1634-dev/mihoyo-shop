-- Product cost in VND with historical MYR conversion snapshot.
-- Safe to run multiple times.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_vnd numeric(14,2),
  ADD COLUMN IF NOT EXISTS cost_myr numeric(14,2),
  ADD COLUMN IF NOT EXISTS vnd_myr_rate numeric(18,10),
  ADD COLUMN IF NOT EXISTS cost_currency text DEFAULT 'VND',
  ADD COLUMN IF NOT EXISTS cost_rate_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_cost_vnd_non_negative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cost_vnd_non_negative
      CHECK (cost_vnd IS NULL OR cost_vnd >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_cost_myr_non_negative'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_cost_myr_non_negative
      CHECK (cost_myr IS NULL OR cost_myr >= 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_vnd_myr_rate_positive'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_vnd_myr_rate_positive
      CHECK (vnd_myr_rate IS NULL OR vnd_myr_rate > 0);
  END IF;
END $$;

UPDATE public.products
SET cost_currency = 'VND'
WHERE cost_currency IS NULL;

COMMENT ON COLUMN public.products.cost_vnd IS
  'Admin purchase cost entered in VND.';
COMMENT ON COLUMN public.products.cost_myr IS
  'Historical MYR purchase cost snapshot calculated at save time.';
COMMENT ON COLUMN public.products.vnd_myr_rate IS
  'Historical VND to MYR exchange rate used when cost_myr was saved.';
COMMENT ON COLUMN public.products.cost_currency IS
  'Purchase cost input currency, currently VND.';
COMMENT ON COLUMN public.products.cost_rate_updated_at IS
  'Timestamp when the exchange rate used for cost calculation was fetched.';
