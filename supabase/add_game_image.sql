-- Gameslot: game category image + storage bucket
-- Run in Supabase SQL Editor. Idempotent.

-- Category image (primary). Legacy banner/logo columns kept for backward compatibility.
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS banner_url text,
  ADD COLUMN IF NOT EXISTS mobile_banner_url text;

-- Public bucket for game category artwork.
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-assets', 'game-assets', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname LIKE 'game_assets_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY game_assets_public_read
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'game-assets');

CREATE POLICY game_assets_admin_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'game-assets'
    AND public.is_admin()
  );

CREATE POLICY game_assets_admin_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'game-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'game-assets' AND public.is_admin());

CREATE POLICY game_assets_admin_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'game-assets' AND public.is_admin());
