-- Small key/value settings table for app-wide feature flags. First use: the
-- DBS/Spencers portal sync on/off switch (default OFF while we test manual entry).

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Portal sync starts PAUSED — jobs are entered manually until sync is verified.
INSERT INTO app_settings (key, value) VALUES ('dbs_sync_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON app_settings;
CREATE POLICY "app_settings_read" ON app_settings FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "app_settings_write" ON app_settings;
CREATE POLICY "app_settings_write" ON app_settings FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
