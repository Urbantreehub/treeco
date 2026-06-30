-- Grant 'office' access level the same data access as 'full' on the core tables.
-- The Dashboard is gated in the app UI (RequireFullAccess), not via RLS, so office
-- users get everything except the Dashboard.
--
-- Additive policies: these sit alongside the existing 'full' policies (RLS policies
-- combine with OR), so nothing about full-access behaviour changes.

DROP POLICY IF EXISTS "clients_office"  ON clients;
CREATE POLICY "clients_office" ON clients FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office')
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office');

DROP POLICY IF EXISTS "jobs_office" ON jobs;
CREATE POLICY "jobs_office" ON jobs FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office')
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office');

DROP POLICY IF EXISTS "quotes_office" ON quotes;
CREATE POLICY "quotes_office" ON quotes FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office')
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office');

DROP POLICY IF EXISTS "schedule_office" ON schedule;
CREATE POLICY "schedule_office" ON schedule FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office')
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office');

DROP POLICY IF EXISTS "photos_office" ON job_photos;
CREATE POLICY "photos_office" ON job_photos FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office')
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) = 'office');
