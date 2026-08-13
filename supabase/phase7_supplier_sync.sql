-- =============================================================================
-- Phase 7 — Supplier Sync Foundation (ADDITIVE)
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor when ready.
--
-- Adds supplier sync metadata to products and product_images.
-- Does NOT modify orders, inventory, Stripe, delivery, or storefront status.
--
-- Legacy rows remain valid with NULL supplier/image metadata.
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) products — supplier sync fields
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_product_id text,
  ADD COLUMN IF NOT EXISTS source_product_url text,
  ADD COLUMN IF NOT EXISTS source_status text,
  ADD COLUMN IF NOT EXISTS source_price numeric(14, 2),
  ADD COLUMN IF NOT EXISTS source_currency text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_source_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_error text;

COMMENT ON COLUMN public.products.source IS
  'Supplier identifier (e.g. zinkgame, manual). NULL for legacy/manual listings.';
COMMENT ON COLUMN public.products.source_product_id IS
  'External product id from the supplier catalog. NULL for manual listings.';
COMMENT ON COLUMN public.products.source_product_url IS
  'Canonical supplier product URL. Admin/sync only — not public storefront data.';
COMMENT ON COLUMN public.products.source_status IS
  'Supplier-side listing status (active, sold, delisted, …). Distinct from products.status.';
COMMENT ON COLUMN public.products.source_price IS
  'Last known supplier list price snapshot. Admin/sync only.';
COMMENT ON COLUMN public.products.source_currency IS
  'ISO currency for source_price (e.g. VND, MYR). Admin/sync only.';
COMMENT ON COLUMN public.products.last_synced_at IS
  'When this listing was last successfully imported/updated from supplier data.';
COMMENT ON COLUMN public.products.last_source_check_at IS
  'When supplier availability was last checked (even if unchanged).';
COMMENT ON COLUMN public.products.sync_error IS
  'Last supplier sync error message. Admin/sync only.';

-- Supplier source_status values (nullable for legacy rows).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_source_status_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_source_status_check
      CHECK (
        source_status IS NULL
        OR source_status IN (
          'active',
          'sold',
          'delisted',
          'unavailable',
          'error',
          'unknown'
        )
      );
  END IF;
END $$;

-- Prevent duplicate imports for the same supplier product.
CREATE UNIQUE INDEX IF NOT EXISTS products_source_product_uidx
  ON public.products (source, source_product_id)
  WHERE source IS NOT NULL
    AND source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_source_idx
  ON public.products (source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS products_source_status_idx
  ON public.products (source_status)
  WHERE source_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) product_images — image pipeline metadata
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.product_images
  ADD COLUMN IF NOT EXISTS image_source text,
  ADD COLUMN IF NOT EXISTS processing_status text,
  ADD COLUMN IF NOT EXISTS original_image_url text,
  ADD COLUMN IF NOT EXISTS processed_image_url text,
  ADD COLUMN IF NOT EXISTS processing_error text;

COMMENT ON COLUMN public.product_images.image_source IS
  'Origin of the image row: manual, supplier, generated. NULL for legacy uploads.';
COMMENT ON COLUMN public.product_images.processing_status IS
  'Image pipeline state: pending, processing, completed, failed, skipped. NULL for legacy.';
COMMENT ON COLUMN public.product_images.original_image_url IS
  'Supplier/original image URL before local processing. Admin/sync only.';
COMMENT ON COLUMN public.product_images.processed_image_url IS
  'Processed asset URL after pipeline (e.g. logo removal). Admin/sync only.';
COMMENT ON COLUMN public.product_images.processing_error IS
  'Last image processing error. Admin/sync only.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_images_image_source_check'
  ) THEN
    ALTER TABLE public.product_images
      ADD CONSTRAINT product_images_image_source_check
      CHECK (
        image_source IS NULL
        OR image_source IN ('manual', 'supplier', 'generated')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_images_processing_status_check'
  ) THEN
    ALTER TABLE public.product_images
      ADD CONSTRAINT product_images_processing_status_check
      CHECK (
        processing_status IS NULL
        OR processing_status IN (
          'pending',
          'processing',
          'completed',
          'failed',
          'skipped'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_images_processing_status_idx
  ON public.product_images (processing_status)
  WHERE processing_status IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS note
-- ─────────────────────────────────────────────────────────────────────────────
-- Existing products / product_images policies from master_migration.sql apply
-- to new columns automatically (admin write, public read of listing data only).
-- No policy changes required for Phase 7 foundation.
