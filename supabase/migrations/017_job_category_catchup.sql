-- Catch-up migration: brings prod in sync with earlier migrations that were
-- never applied (010 lead-intake, 015 DBS fields) AND adds the job `category`
-- that drives the Residential / Spencers / Downer templates. Fully idempotent —
-- safe to run on a database where some of these already exist.

-- ── Job category (Residential / Spencers / Downer) ──────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category TEXT;

-- Backfill: portal jobs (KO ref or Spencers/Downer markers) → spencers/downer,
-- everything else → residential.
UPDATE jobs SET category = 'downer'
  WHERE category IS NULL
    AND (title ILIKE '%downer%' OR description ILIKE '%downer%');
UPDATE jobs SET category = 'spencers'
  WHERE category IS NULL
    AND (ko_reference IS NOT NULL OR title LIKE 'SP —%' OR title ILIKE '%spencer%' OR description ILIKE '%spencer%');
UPDATE jobs SET category = 'residential' WHERE category IS NULL;

-- ── DBS/Spencers first-class fields (migration 015, ensure present) ─────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ko_reference TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_due_at   TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority     TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_ko_reference ON jobs(ko_reference);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_due_at   ON jobs(sla_due_at);

-- ── Lead-intake fields (migration 010, ensure present) ─────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS directions   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_specs   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS enquiry_raw  TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_source  TEXT;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'reference';

-- ── job-media storage bucket (migration 010, ensure present) ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-media', 'job-media', true)
ON CONFLICT (id) DO NOTHING;
