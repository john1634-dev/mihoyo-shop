-- =============================================================================
-- Phase 13 — Production Hardening + Scheduled ZinkGame Auto Sync
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor when ready.
--
-- Adds:
--   - supplier_sync_locks  (one active lock per supplier)
--   - supplier_sync_runs   (cron + manual run history)
--
-- Does NOT modify products, product_images, orders, inventory, Stripe,
-- checkout, or email tables.
--
-- Requires Phase 7 migration (products supplier fields) to already be applied.
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) supplier_sync_locks
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_sync_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  lock_token uuid NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_sync_locks IS
  'Single-flight lock for scheduled/manual supplier auto-sync. TTL-based recovery.';
COMMENT ON COLUMN public.supplier_sync_locks.supplier IS
  'Supplier identifier (e.g. zinkgame). One row per supplier.';
COMMENT ON COLUMN public.supplier_sync_locks.lock_token IS
  'Opaque token so only the lock owner can release (prevents expired-takeover races).';
COMMENT ON COLUMN public.supplier_sync_locks.expires_at IS
  'Lock expiry. Expired rows may be taken over by a later run.';

CREATE UNIQUE INDEX IF NOT EXISTS supplier_sync_locks_supplier_uidx
  ON public.supplier_sync_locks (supplier);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) supplier_sync_runs
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.supplier_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  trigger_type text NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  checked integer NOT NULL DEFAULT 0,
  price_updated integer NOT NULL DEFAULT 0,
  status_updated integer NOT NULL DEFAULT 0,
  requires_review integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  unchanged integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  new_products integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.supplier_sync_runs IS
  'History of ZinkGame (and future supplier) auto-sync runs. No secrets, no HTML.';
COMMENT ON COLUMN public.supplier_sync_runs.trigger_type IS
  'cron | manual';
COMMENT ON COLUMN public.supplier_sync_runs.status IS
  'running | completed | failed | source_unavailable';
COMMENT ON COLUMN public.supplier_sync_runs.new_products IS
  'Listing items not yet imported. Never auto-imported.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_sync_runs_trigger_type_check'
  ) THEN
    ALTER TABLE public.supplier_sync_runs
      ADD CONSTRAINT supplier_sync_runs_trigger_type_check
      CHECK (trigger_type IN ('cron', 'manual'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_sync_runs_status_check'
  ) THEN
    ALTER TABLE public.supplier_sync_runs
      ADD CONSTRAINT supplier_sync_runs_status_check
      CHECK (
        status IN ('running', 'completed', 'failed', 'source_unavailable')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS supplier_sync_runs_supplier_created_idx
  ON public.supplier_sync_runs (supplier, created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_sync_runs_supplier_status_idx
  ON public.supplier_sync_runs (supplier, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — admin read/write, no public access
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.supplier_sync_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_sync_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.supplier_sync_locks FROM PUBLIC, anon;
REVOKE ALL ON public.supplier_sync_runs FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_sync_locks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_sync_runs TO authenticated;

DROP POLICY IF EXISTS supplier_sync_locks_admin_all ON public.supplier_sync_locks;
CREATE POLICY supplier_sync_locks_admin_all
  ON public.supplier_sync_locks
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS supplier_sync_runs_admin_select ON public.supplier_sync_runs;
CREATE POLICY supplier_sync_runs_admin_select
  ON public.supplier_sync_runs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS supplier_sync_runs_admin_insert ON public.supplier_sync_runs;
CREATE POLICY supplier_sync_runs_admin_insert
  ON public.supplier_sync_runs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS supplier_sync_runs_admin_update ON public.supplier_sync_runs;
CREATE POLICY supplier_sync_runs_admin_update
  ON public.supplier_sync_runs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
