-- =====================================================================
-- Apply migration 030 (admin manage users) to PROD.
--
-- Why: changing a user's access_level / resource_id in Settings says
-- "Saved" but reverts on refresh. The users table only allowed a user to
-- update their OWN row, so edits to another account were filtered out by
-- RLS — the UPDATE changed 0 rows and returned success with nothing saved.
-- This adds an admin UPDATE policy so full-access users can edit any row.
--
-- Fully idempotent. Paste into Supabase Dashboard -> SQL Editor -> Run.
--
-- ORDER: if you have NOT yet added the 'truck' access level to prod, run
-- STEP 1 of APPLY_027_truck_access_level_prod.sql first (on its own). Then
-- run this file, then set the truck accounts in Settings — the change will
-- now persist.
-- =====================================================================

DROP POLICY IF EXISTS "users_admin_update" ON users;
CREATE POLICY "users_admin_update" ON users
  FOR UPDATE
  USING      ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full')
  WITH CHECK ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full');

-- Verify the policy is present:
--   SELECT polname FROM pg_policy WHERE polrelid = 'users'::regclass;
