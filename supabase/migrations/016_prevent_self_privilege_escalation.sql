-- Fix C1 (critical): the users UPDATE policy had no WITH CHECK, so a user could
-- update their own row's access_level (e.g. restricted -> full) straight from
-- the browser and self-promote to full office access. Add a WITH CHECK that
-- lets a user edit their own profile (name, phone, avatar, etc.) but forbids
-- them changing their own access_level or active flag.
--
-- The subquueries read the caller's *current* (pre-update) values; the
-- auth.uid() = id disjunct in users_select_own short-circuits, so this does not
-- recurse. Cross-user role changes already require a separate (service-role)
-- path — this policy only ever applies to a user's own row.
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND access_level = (SELECT u.access_level FROM public.users u WHERE u.id = auth.uid())
    AND active       = (SELECT u.active       FROM public.users u WHERE u.id = auth.uid())
  );
