-- Downer (MyWork) inbound sync on/off switch, mirroring dbs_sync_enabled.
-- Starts PAUSED — turn it on only once the Downer session is captured and the
-- inbound scraper's selectors are verified against the live MyWork screens.
-- Flip on with:  update app_settings set value = 'true'::jsonb where key = 'downer_sync_enabled';

INSERT INTO app_settings (key, value) VALUES ('downer_sync_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;
