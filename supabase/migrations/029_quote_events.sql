-- 029_quote_events.sql
-- Per-event activity log for quotes — powers the Quotient-style "Overview /
-- All Activity" timeline on the quote detail page.
--
-- The quote row already tracks first-open (viewed_at), last-open
-- (last_opened_at) and a running opened_count, which is enough to *derive* a
-- timeline. This table records each individual open (and any other event we
-- want to surface) as its own row, so the timeline can show every view with its
-- own timestamp — exactly like Quotient's activity feed — instead of only the
-- first and last.
--
-- The UI degrades gracefully: if this migration hasn't been applied yet it just
-- falls back to the derived first/last-open timeline. Applying it upgrades the
-- feed to per-view fidelity from that point forward. Idempotent.

CREATE TABLE IF NOT EXISTS quote_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id   UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,           -- 'opened' | 'sent' | 'followed_up' | 'accepted' | 'declined' | 'edited' | 'created'
  actor      TEXT,                    -- free-text label: client name for opens/responses, staff name for edits
  meta       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_events_quote ON quote_events(quote_id, created_at DESC);

ALTER TABLE quote_events ENABLE ROW LEVEL SECURITY;

-- Staff (full access) read the feed. Rows are only ever written by the
-- SECURITY DEFINER function below, so no INSERT policy is exposed to clients.
DROP POLICY IF EXISTS "quote_events_read" ON quote_events;
CREATE POLICY "quote_events_read" ON quote_events
  FOR SELECT USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) IN ('full', 'office')
  );

-- ── Log each open ───────────────────────────────────────────────────────────
-- Re-defines register_quote_open (from 011) to additionally append an 'opened'
-- event carrying the client's name, so every view shows up in the timeline.
CREATE OR REPLACE FUNCTION register_quote_open(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote_id   UUID;
  v_client     TEXT;
BEGIN
  UPDATE quotes
     SET opened_count   = opened_count + 1,
         last_opened_at = NOW(),
         viewed_at      = COALESCE(viewed_at, NOW()),
         status         = CASE WHEN status = 'sent' THEN 'viewed'::quote_status ELSE status END
   WHERE client_view_token = p_token
   RETURNING id INTO v_quote_id;

  IF v_quote_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.name INTO v_client
    FROM jobs j
    JOIN clients c ON c.id = j.client_id
    JOIN quotes q ON q.job_id = j.id
   WHERE q.id = v_quote_id;

  INSERT INTO quote_events (quote_id, kind, actor)
  VALUES (v_quote_id, 'opened', v_client);
END;
$$;
GRANT EXECUTE ON FUNCTION register_quote_open(TEXT) TO anon, authenticated;
