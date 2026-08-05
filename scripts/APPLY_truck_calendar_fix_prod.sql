-- =====================================================================
-- TRUCK CALENDAR FIX — run in Supabase Dashboard -> SQL Editor.
--
-- Fixes two things:
--   1) Truck iPads show no calendar (Calendar is only for full/office/truck
--      logins). The per-vehicle accounts must sit on the 'truck' access level.
--   2) Setting a user's access level in Settings said "Saved" but reverted
--      on refresh — RLS let you edit only your OWN row, so admin edits to
--      other accounts changed 0 rows. A new policy fixes that.
--
-- RUN STEP 1 ON ITS OWN FIRST, let it finish, THEN run the rest. A new enum
-- value can't be added and used in the same transaction.
-- Everything is idempotent — safe to re-run.
-- =====================================================================


-- ── STEP 1 — run this line ALONE first ───────────────────────────────
ALTER TYPE access_level ADD VALUE IF NOT EXISTS 'truck';


-- ── STEP 2 — run everything below AFTER step 1 has completed ──────────

-- 2a) Let full-access admins edit other users' rows (the "Saved but reverts" fix)
DROP POLICY IF EXISTS "users_admin_update" ON users;
CREATE POLICY "users_admin_update" ON users
  FOR UPDATE
  USING      ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full')
  WITH CHECK ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full');

-- 2b) See the current logins so you can grab the right emails:
--     SELECT id, name, email, access_level, resource_id FROM users ORDER BY name;

-- 2c) Put each per-vehicle iPad on the truck level + its resource.
--     Mapping (per Josh): Big Truck = Nissan, Small Truck = Isuzu.
--     Replace the emails with the real login addresses, then run.

-- Small Truck iPad  ->  Isuzu
UPDATE users SET access_level = 'truck', resource_id = 'isuzu'
 WHERE email = 'REPLACE_WITH_SMALL_TRUCK_LOGIN_EMAIL';

-- Big Truck iPad  ->  Nissan
UPDATE users SET access_level = 'truck', resource_id = 'nissan'
 WHERE email = 'REPLACE_WITH_BIG_TRUCK_LOGIN_EMAIL';

-- Stump Grinder iPad  ->  Stump Grinder   (delete these 2 lines if not used)
UPDATE users SET access_level = 'truck', resource_id = 'stump'
 WHERE email = 'REPLACE_WITH_STUMP_GRINDER_LOGIN_EMAIL';

-- 2d) Verify:
--     SELECT name, email, access_level, resource_id FROM users
--      WHERE access_level = 'truck';

-- Note: individual staff (people) stay on their existing Crew level — they
-- intentionally don't see the calendar; only the shared vehicle iPads do.
-- =====================================================================
