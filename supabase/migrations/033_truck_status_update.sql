-- Truck (shared vehicle iPad) logins may change a job's status, but ONLY to
-- "complete" or "stump grinding", and only on jobs they're assigned to. They
-- can't touch anything else (office/full keep full control via jobs_office /
-- jobs_full_access). Individual-staff ('restricted') logins get no job updates.
--
-- The WITH CHECK constrains the resulting status to the two allowed values, so a
-- truck can only ever leave a job in complete_to_invoice or stump_grinding.

DROP POLICY IF EXISTS "jobs_truck_status" ON jobs;
CREATE POLICY "jobs_truck_status" ON jobs
  FOR UPDATE TO authenticated
  USING (
    (SELECT access_level FROM public.users WHERE id = auth.uid()) = 'truck'
    AND EXISTS (
      SELECT 1 FROM schedule
      WHERE schedule.job_id = jobs.id AND auth.uid() = ANY(schedule.assigned_to)
    )
  )
  WITH CHECK (
    (SELECT access_level FROM public.users WHERE id = auth.uid()) = 'truck'
    AND status IN ('complete_to_invoice', 'stump_grinding')
    AND EXISTS (
      SELECT 1 FROM schedule
      WHERE schedule.job_id = jobs.id AND auth.uid() = ANY(schedule.assigned_to)
    )
  );
