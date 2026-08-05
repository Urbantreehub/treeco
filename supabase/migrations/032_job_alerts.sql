-- Office "to be actioned" alerts — Ashley's to-do list.
--
-- Portal syncs and quote activity used to change a job silently (e.g. the DBS
-- scraper auto-moved a job to Accepted when it saw an "approved" note). Instead,
-- they now raise an ALERT here and leave the status alone. The office reviews
-- the alert on the Actions dashboard and confirms — e.g. "new note says
-- approved → confirm & change status".
--
-- kinds:
--   portal_note      — a new comment/progress note appeared in the portal
--   portal_approval  — a note/flag indicating the quote was approved (suggests a status change)
--   portal_status    — the portal's own status changed
--   comment          — a comment was left on a (residential) quote
--   acceptance       — a (residential) quote was accepted by the client

CREATE TABLE IF NOT EXISTS job_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID REFERENCES jobs(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,
  title            TEXT NOT NULL,
  detail           TEXT,
  suggested_status TEXT,                                -- proposed job status if the office confirms
  source           TEXT NOT NULL DEFAULT 'portal',      -- portal | residential
  status           TEXT NOT NULL DEFAULT 'open',        -- open | done | dismissed
  dedupe_key       TEXT,                                -- so repeated polls don't duplicate an alert
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actioned_at      TIMESTAMPTZ,
  actioned_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

-- One alert per dedupe_key (e.g. a specific note, or "job X approved") — the
-- worker upserts on this so each poll doesn't pile up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_alerts_dedupe ON job_alerts(dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_alerts_open ON job_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_alerts_job  ON job_alerts(job_id);

ALTER TABLE job_alerts ENABLE ROW LEVEL SECURITY;

-- Office/full staff read + manage; the sync worker writes via service_role (RLS bypassed).
DROP POLICY IF EXISTS job_alerts_select ON job_alerts;
CREATE POLICY job_alerts_select ON job_alerts FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS job_alerts_insert ON job_alerts;
CREATE POLICY job_alerts_insert ON job_alerts FOR INSERT TO authenticated
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS job_alerts_update ON job_alerts;
CREATE POLICY job_alerts_update ON job_alerts FOR UPDATE TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
