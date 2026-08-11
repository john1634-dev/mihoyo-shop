-- =============================================================================
-- Mihoyo Shop — Fix protect_profile_admin_flag for first-admin bootstrap
--
-- Problem:
--   The trigger previously blocked ALL is_admin changes when auth.uid() IS NULL,
--   which includes Supabase SQL Editor / direct DB connections (postgres role).
--   This made it impossible to promote the first admin.
--
-- Fix:
--   Only block the change when auth.uid() IS NOT NULL (i.e. an app user) AND
--   the caller is not already an admin.
--   When auth.uid() IS NULL the caller is a trusted DB-level connection and
--   the update is allowed.
--
-- Security properties preserved:
--   - Normal authenticated users CANNOT set their own is_admin.
--   - Non-admin app users CANNOT promote another user.
--   - Existing admins CAN manage is_admin via the application.
--   - Supabase SQL Editor (postgres role) CAN bootstrap the first admin.
--
-- Run this in Supabase SQL Editor, then promote your admin:
--
--   UPDATE public.profiles
--   SET is_admin = true
--   WHERE email = 'your-admin@example.com';
--
-- Verify it took effect:
--
--   SELECT id, email, is_admin FROM public.profiles WHERE email = 'your-admin@example.com';
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_admin_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    -- auth.uid() IS NULL  →  direct DB / SQL Editor connection (trusted bootstrap).
    -- auth.uid() IS NOT NULL  →  application request via JWT.
    --   Block the change unless the caller is already an admin.
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
