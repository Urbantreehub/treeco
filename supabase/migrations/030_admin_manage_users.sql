-- Let full-access admins manage other users' rows (access_level, resource_id,
-- active) from the Settings screen.
--
-- Bug: the users table only had users_update_own — FOR UPDATE USING
-- (auth.uid() = id) — so a change to *another* user's row was filtered out by
-- RLS. The UPDATE matched 0 rows and PostgREST returned success with nothing
-- changed: Settings showed "Saved" but the value reverted on refresh. New
-- accounts only ever got their role via the invite-user edge function (service
-- role, bypasses RLS); editing an existing user from the browser silently
-- no-op'd.
--
-- Permissive policies are OR'd together, so this sits alongside
-- users_update_own: a write is allowed if the caller is editing their own row
-- (still bound by the migration-016 self-escalation WITH CHECK) OR the caller
-- is a full-access admin. A restricted/office user still can't self-promote —
-- they fail the 'full' check here and the 016 WITH CHECK there.
--
-- The (SELECT access_level ... WHERE id = auth.uid()) subquery is the same
-- pattern already used by users_select_own / clients_office etc.; its
-- auth.uid() = id read is served by users_select_own's first disjunct, so it
-- does not recurse. Idempotent.

DROP POLICY IF EXISTS "users_admin_update" ON users;
CREATE POLICY "users_admin_update" ON users
  FOR UPDATE
  USING      ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full')
  WITH CHECK ((SELECT u.access_level FROM public.users u WHERE u.id = auth.uid()) = 'full');
