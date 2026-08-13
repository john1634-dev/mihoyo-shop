-- =============================================================================
-- Phase 6.2 — Inventory security hardening (ADDITIVE)
-- =============================================================================
-- DO NOT auto-run. Review, then paste into Supabase SQL Editor after phase6_1.
--
-- Hardens Phase 6.1 inventory RLS:
--   - inventory_credentials: service_role ONLY (no anon/authenticated/admin JWT)
--   - inventory_items: admin-only via is_admin(); no customer/anon access
--   - delivery_attempts: admin inspect; service_role writes; no customer list
--
-- Does NOT:
--   - weaken orders/products/order_items RLS
--   - change products.status
--   - implement auto-delivery or credential reveal
--   - modify Stripe checkout / webhook
--
-- Safe to re-run (idempotent where practical).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Drop Phase 6.1 policies (replace with hardened set)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'inventory_items',
        'inventory_credentials',
        'delivery_attempts'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      r.policyname,
      r.tablename
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Explicit table privileges — revoke unsafe defaults
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON public.inventory_credentials FROM PUBLIC;
REVOKE ALL ON public.inventory_credentials FROM anon;
REVOKE ALL ON public.inventory_credentials FROM authenticated;

REVOKE ALL ON public.inventory_items FROM PUBLIC;
REVOKE ALL ON public.inventory_items FROM anon;

REVOKE ALL ON public.delivery_attempts FROM PUBLIC;
REVOKE ALL ON public.delivery_attempts FROM anon;

-- Authenticated role needs table-level GRANT for RLS policies to apply.
-- inventory_credentials intentionally has NO grants to authenticated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_attempts TO authenticated;

-- service_role bypasses RLS and retains full access via Supabase defaults.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) inventory_credentials — service_role ONLY
--    No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated.
--    Admin credential access must go through server API using service_role.
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.inventory_credentials IS
  'Encrypted credential blobs. service_role only at DB layer. Admin access via server-side API only.';

-- RLS enabled (from 6.1) with zero policies → deny all except service_role bypass.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) inventory_items — admin only (no customer/anon)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY inventory_items_admin_select ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY inventory_items_admin_insert ON public.inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_items_admin_update ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY inventory_items_admin_delete ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.inventory_items IS
  'Non-secret inventory metadata. Customers/anon have no SELECT access. Credentials in inventory_credentials via service_role only.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) delivery_attempts — admin inspect; no customer arbitrary list
--    service_role INSERT/UPDATE via RLS bypass for future delivery jobs.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY delivery_attempts_admin_select ON public.delivery_attempts
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY delivery_attempts_admin_insert ON public.delivery_attempts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY delivery_attempts_admin_update ON public.delivery_attempts
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.delivery_attempts IS
  'Delivery idempotency log. Customers cannot list attempts. service_role manages sends server-side.';

NOTIFY pgrst, 'reload schema';
