-- =============================================================================
-- Phase 14 — ZinkGame Category Auto Import run counters
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor when ready.
--
-- Extends supplier_sync_runs with auto-import counters.
-- Does NOT modify products, product_images, orders, inventory, Stripe,
-- checkout, or email tables.
--
-- Requires Phase 13 migration to already be applied.
-- =============================================================================

ALTER TABLE public.supplier_sync_runs
  ADD COLUMN IF NOT EXISTS new_products_imported integer NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_sync_runs
  ADD COLUMN IF NOT EXISTS new_products_skipped integer NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_sync_runs
  ADD COLUMN IF NOT EXISTS images_imported integer NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_sync_runs
  ADD COLUMN IF NOT EXISTS translation_failures integer NOT NULL DEFAULT 0;

ALTER TABLE public.supplier_sync_runs
  ADD COLUMN IF NOT EXISTS game_mapping_failures integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.supplier_sync_runs.new_products_imported IS
  'New ZinkGame products actually inserted during category auto-import.';
COMMENT ON COLUMN public.supplier_sync_runs.new_products_skipped IS
  'Category products skipped (status, category, or game mapping).';
COMMENT ON COLUMN public.supplier_sync_runs.images_imported IS
  'Supplier images processed during auto-import.';
COMMENT ON COLUMN public.supplier_sync_runs.translation_failures IS
  'AI title translation failures (original title used).';
COMMENT ON COLUMN public.supplier_sync_runs.game_mapping_failures IS
  'Products skipped because no existing game mapping was found.';
