-- DBS / Spencers portal sync — Phase 1 foundation.
-- Adds first-class columns for the Kāinga Ora job fields the scraper already
-- reads (previously only stuffed into jobs.description as text), plus a
-- portal_sync table that tracks each portal job's last-seen state so the poll
-- can diff new / changed / unchanged jobs and fire notifications. Idempotent.

-- ── jobs: first-class portal fields ────────────────────────────────────────
-- ko_reference is the human KO job number (also kept in description for
-- backward-compat with the existing "KO Ref:" matcher). sla_due_at drives the
-- KPI clock + to-do escalation. priority is the raw portal priority value
-- (e.g. "Emergency", "Urgent", "Planned") — emergency detection is done in app.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ko_reference TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_due_at   TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority     TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_ko_reference ON jobs(ko_reference);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_due_at   ON jobs(sla_due_at);

-- Backfill ko_reference + priority from the description tags the scraper has
-- been writing ("KO Ref: XXXX", "Priority: YYYY"). Safe to re-run.
UPDATE jobs
SET ko_reference = (regexp_match(description, 'KO Ref: (\S+)'))[1]
WHERE ko_reference IS NULL
  AND description ~ 'KO Ref: ';

UPDATE jobs
SET priority = trim((regexp_match(description, 'Priority: ([^\n]+)'))[1])
WHERE priority IS NULL
  AND description ~ 'Priority: ';

-- ── portal_sync: per-job mirror of the portal's last-seen state ─────────────
-- One row per portal job. shl_job_id (the portal's own job id) is the stable
-- idempotency key; ko_reference can be blank on some jobs so it is only an
-- index, not the unique key. raw_snapshot stores the last scraped payload so
-- the poll can detect field-level changes, not just status flips.
CREATE TABLE IF NOT EXISTS portal_sync (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                   UUID REFERENCES jobs(id) ON DELETE CASCADE,
  source                   TEXT NOT NULL DEFAULT 'dbs',   -- room for other portals later
  shl_job_id               TEXT NOT NULL,                 -- portal's internal job id
  ko_reference             TEXT,
  portal_status            TEXT,                          -- current status read this poll
  last_seen_portal_status  TEXT,                          -- status at previous poll (for diff)
  priority                 TEXT,
  sla_due_at               TIMESTAMPTZ,
  kpi                      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- on-time %, exemptions, etc.
  raw_snapshot             JSONB,                         -- last full scraped payload
  first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_polled_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notified_new_at          TIMESTAMPTZ,                   -- guard: new-job email sent once
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_sync_source_shl ON portal_sync(source, shl_job_id);
CREATE INDEX IF NOT EXISTS idx_portal_sync_ko    ON portal_sync(ko_reference);
CREATE INDEX IF NOT EXISTS idx_portal_sync_job   ON portal_sync(job_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- The worker writes via the service_role key (bypasses RLS). These policies
-- govern the app: everyone reads (to show sync state / to-dos); office/full manage.
ALTER TABLE portal_sync ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_sync_read" ON portal_sync;
CREATE POLICY "portal_sync_read" ON portal_sync FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "portal_sync_write" ON portal_sync;
CREATE POLICY "portal_sync_write" ON portal_sync FOR ALL TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
