-- Phase 24 — supplier auto-import lifecycle (account code + import mode)
-- Safe to run multiple times. Manual apply only — do not auto-run in production.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_account_code text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_import_mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_source_import_mode_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_source_import_mode_check
      CHECK (
        source_import_mode IS NULL
        OR source_import_mode IN ('auto', 'manual')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.products.source_account_code IS
  'Leading ZinkGame account code (e.g. H4723) used for supplier sync and storefront title.';

COMMENT ON COLUMN public.products.source_import_mode IS
  'How a supplier listing was first imported: auto (category cron) or manual (admin URL). NULL for non-supplier products and legacy rows.';

CREATE INDEX IF NOT EXISTS products_source_account_code_idx
  ON public.products (source, source_account_code)
  WHERE source IS NOT NULL AND source_account_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_source_import_mode_idx
  ON public.products (source, source_import_mode)
  WHERE source IS NOT NULL AND source_import_mode IS NOT NULL;
