-- Outbound action queue for the DBS/Spencers portal.
-- TreeCo records an intent (invoice upload, pre-approval note/request, and
-- later accept/schedule/complete); the sync worker performs it in the portal
-- and marks it done/failed. This is the "wired" half of write-back — the
-- worker-side Playwright automation lands once we map the portal's screens.
CREATE TABLE IF NOT EXISTS portal_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL DEFAULT 'dbs',
  job_id         UUID REFERENCES jobs(id) ON DELETE CASCADE,
  ko_reference   TEXT,
  action         TEXT NOT NULL,            -- upload_invoice | preapproval_note | preapproval_request | accept | schedule | complete
  payload        JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | in_progress | done | failed
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT,
  requested_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_actions_status ON portal_actions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_portal_actions_job    ON portal_actions(job_id);

-- RLS: the worker writes/reads via service_role (bypasses RLS). In-app,
-- office/full staff can queue actions and everyone authenticated can read
-- their status (to show "queued / uploaded" on the job).
ALTER TABLE portal_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_actions_read" ON portal_actions;
CREATE POLICY "portal_actions_read" ON portal_actions FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "portal_actions_insert" ON portal_actions;
CREATE POLICY "portal_actions_insert" ON portal_actions FOR INSERT TO authenticated
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "portal_actions_update" ON portal_actions;
CREATE POLICY "portal_actions_update" ON portal_actions FOR UPDATE TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
