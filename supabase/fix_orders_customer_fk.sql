-- =============================================================================
-- Mihoyo Shop — Fix orders.customer_id foreign key
-- Run this in Supabase SQL Editor BEFORE master_migration.sql
-- (or standalone if master_migration.sql was already run partially).
--
-- Problem:
--   orders.customer_id currently has a FK pointing at public.customers.id
--   (the legacy pre-V2 table).  The V2 design requires it to reference
--   auth.users(id) directly, matching auth.uid() at checkout time.
--
-- What this file does (in safe order):
--   1. Confirms what the current FK target is (informational RAISE NOTICE).
--   2. Nulls out any customer_id values that cannot be mapped to auth.users
--      (i.e. old customers-table IDs that have no matching auth.users row).
--      These are orphaned legacy rows — the order data (items, totals) is kept.
--   3. Drops the old FK constraint.
--   4. Adds the new FK constraint → auth.users(id) ON DELETE SET NULL.
--   5. Notifies PostgREST to reload its schema cache.
--
-- Safety guarantees:
--   - No order rows are deleted.
--   - No product / order_item data is touched.
--   - Guest orders (customer_id IS NULL) are unaffected.
--   - If customer_id already matches an auth.users.id the value is kept as-is.
--   - Idempotent: safe to run more than once.
-- =============================================================================

DO $$
DECLARE
  v_fk_target text;
  v_orphaned  int;
BEGIN
  -- ── 1. Report current FK target ──────────────────────────────────────────
  SELECT ccu.table_name
  INTO v_fk_target
  FROM information_schema.table_constraints       tc
  JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
      AND rc.constraint_schema = tc.constraint_schema
  JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = rc.unique_constraint_name
      AND ccu.constraint_schema = rc.unique_constraint_schema
  WHERE tc.constraint_type  = 'FOREIGN KEY'
    AND tc.table_schema     = 'public'
    AND tc.table_name       = 'orders'
    AND tc.constraint_name  = 'orders_customer_id_fkey';

  IF v_fk_target IS NULL THEN
    RAISE NOTICE 'orders_customer_id_fkey does not exist — nothing to change.';
  ELSIF v_fk_target = 'users' THEN
    RAISE NOTICE 'orders_customer_id_fkey already points at auth.users — no change needed.';
  ELSE
    RAISE NOTICE 'orders_customer_id_fkey currently points at: %.  Will migrate to auth.users.', v_fk_target;
  END IF;

  -- ── 2. Null out orphaned customer_id values ───────────────────────────────
  --   Any customer_id that exists in orders but has no matching row in
  --   auth.users must be cleared before we can add the new FK.
  --   We count them first so you can see how many rows are affected.
  SELECT count(*) INTO v_orphaned
  FROM public.orders o
  WHERE o.customer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = o.customer_id
    );

  IF v_orphaned > 0 THEN
    RAISE NOTICE 'Nulling % order(s) whose customer_id has no matching auth.users row.', v_orphaned;
    UPDATE public.orders
    SET customer_id = NULL
    WHERE customer_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM auth.users u WHERE u.id = customer_id
      );
  ELSE
    RAISE NOTICE 'No orphaned customer_id values found — all existing rows are compatible.';
  END IF;
END $$;

-- ── 3. Drop the old FK (regardless of what table it points at) ──────────────
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

-- ── 4. Add the correct FK → auth.users(id) ──────────────────────────────────
--   ON DELETE SET NULL keeps the order even if the user account is deleted.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id)
  REFERENCES auth.users (id)
  ON DELETE SET NULL;

-- ── 5. Ensure the supporting index exists ───────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON public.orders (customer_id);

-- ── 6. PostgREST schema cache reload ────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
