-- Scheduling planner + SMS + geographic quote-run clustering.
-- Adds: geocode cache on clients/jobs, SMS log + per-job reminder opt-in,
-- quote open-tracking / follow-up columns, and a persisted quote_runs table
-- for Ashley's planner. All idempotent.

-- ── Geocode cache ─────────────────────────────────────────────────────────
-- Lat/lng resolved once from a job/client address (via the `geocode` edge
-- function) so clustering + truck-distance maths never re-hit the geocoder.
ALTER TABLE jobs    ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
ALTER TABLE jobs    ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);
ALTER TABLE jobs    ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lat NUMERIC(9,6);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lng NUMERIC(9,6);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

-- ── Schedule: SMS reminders + linked vehicle for calendar truck tracking ──
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS sms_reminder    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS vehicle_reg     TEXT;  -- Cartrack registration to track truck→job progress

-- ── Quotes: open-tracking + follow-up + SMS delivery ─────────────────────
-- viewed_at already exists (migration/schema). These add richer tracking.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS opened_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_opened_at  TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS followup_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sms_sent_at     TIMESTAMPTZ;

-- Atomic open counter — called from the public QuoteView (RLS-safe via SECURITY DEFINER).
CREATE OR REPLACE FUNCTION register_quote_open(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE quotes
     SET opened_count   = opened_count + 1,
         last_opened_at = NOW(),
         viewed_at      = COALESCE(viewed_at, NOW()),
         status         = CASE WHEN status = 'sent' THEN 'viewed'::quote_status ELSE status END
   WHERE client_view_token = p_token;
END;
$$;
GRANT EXECUTE ON FUNCTION register_quote_open(TEXT) TO anon, authenticated;

-- ── SMS message log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sms_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number   TEXT NOT NULL,
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'quote_link' | 'job_reminder' | 'quote_followup'
  quote_id    UUID REFERENCES quotes(id)   ON DELETE SET NULL,
  job_id      UUID REFERENCES jobs(id)     ON DELETE SET NULL,
  client_id   UUID REFERENCES clients(id)  ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'queued',   -- 'queued' | 'sent' | 'failed'
  provider_id TEXT,                             -- Twilio message SID
  error       TEXT,
  sent_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_quote ON sms_messages(quote_id);
CREATE INDEX IF NOT EXISTS idx_sms_job   ON sms_messages(job_id);

-- ── Quote runs — Ashley's planner persists geographically-clustered runs ──
CREATE TABLE IF NOT EXISTS quote_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date    DATE NOT NULL,
  "window"    TEXT,                              -- 'morning' | 'afternoon' | null (quoted: reserved word)
  job_ids     UUID[] NOT NULL DEFAULT '{}',      -- ordered stops on the run
  assigned_to UUID[] NOT NULL DEFAULT '{}',
  notes       TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_runs_date ON quote_runs(run_date);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_runs   ENABLE ROW LEVEL SECURITY;

-- Office + full access manage SMS log and quote runs (mirrors clients/quotes policy).
DROP POLICY IF EXISTS "sms_office_full" ON sms_messages;
CREATE POLICY "sms_office_full" ON sms_messages
  FOR ALL USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "quote_runs_office_full" ON quote_runs;
CREATE POLICY "quote_runs_office_full" ON quote_runs
  FOR ALL USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- updated_at trigger for quote_runs (set_updated_at defined in base schema)
DROP TRIGGER IF EXISTS set_updated_at_quote_runs ON quote_runs;
CREATE TRIGGER set_updated_at_quote_runs BEFORE UPDATE ON quote_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
