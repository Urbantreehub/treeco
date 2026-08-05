-- =====================================================================
-- Catch-up: apply migrations 017 + 018 to PROD (zagwhnnxjtimzvvjaujm)
-- Verified 2026-07-28: only 017 and 018 are missing from prod.
-- Fully idempotent — safe to run once, safe to re-run.
-- Paste into Supabase SQL editor → Run.
-- =====================================================================

-- ── 017: Job category + catch-up lead-intake / DBS fields ────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE jobs SET category = 'downer'
  WHERE category IS NULL
    AND (title ILIKE '%downer%' OR description ILIKE '%downer%');
UPDATE jobs SET category = 'spencers'
  WHERE category IS NULL
    AND (ko_reference IS NOT NULL OR title LIKE 'SP —%' OR title ILIKE '%spencer%' OR description ILIKE '%spencer%');
UPDATE jobs SET category = 'residential' WHERE category IS NULL;

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ko_reference TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sla_due_at   TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority     TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_ko_reference ON jobs(ko_reference);
CREATE INDEX IF NOT EXISTS idx_jobs_sla_due_at   ON jobs(sla_due_at);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS directions   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_specs   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS enquiry_raw  TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_source  TEXT;
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'reference';

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-media', 'job-media', true)
ON CONFLICT (id) DO NOTHING;

-- ── 018: app_settings key/value table (DBS sync toggle) ──────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES ('dbs_sync_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON app_settings;
CREATE POLICY "app_settings_read" ON app_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "app_settings_write" ON app_settings;
CREATE POLICY "app_settings_write" ON app_settings FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
