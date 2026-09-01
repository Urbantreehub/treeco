-- 039_campaign_send_retries.sql
-- Makes a campaign send survive the things that actually go wrong: the daily
-- cap, a Resend outage, a function killed mid-flight, and a database that
-- refuses an unsubscribe.
--
-- WHY EACH OF THESE EXISTS
-- 038 modelled a send as one pass over a queue that either finished or didn't.
-- In practice a run is interrupted constantly — the daily cap stops it after
-- 200, an edge function is killed at ~150s, Resend rate-limits or 500s — and
-- the old schema had nowhere to record "interrupted, come back to this":
--   * a row claimed by a run that then died stayed 'sending' forever, because
--     nothing recorded WHEN it was claimed, so nothing could tell an in-flight
--     row from an abandoned one (→ claimed_at);
--   * a send that failed because Resend was having a bad minute was written off
--     as permanently failed, because there was nowhere to count tries or to say
--     "not before X" (→ attempts, next_attempt_at, last_error_at);
--   * two runs of the same campaign — the cron tick and someone hitting "Send
--     now" — each read the day's remaining budget and each spent all of it,
--     because a campaign had no notion of being claimed (→ run_lock_at);
--   * a one-click unsubscribe that hit a database error was acknowledged to the
--     provider and left no trace anywhere durable (→
--     campaign_unsubscribe_failures).
--
-- Also grants the two public-facing objects 038 created but never granted, both
-- of which the Campaigns page reads directly.
--
-- Idempotent. Safe to re-run.

-- ── 1. Retry + claim bookkeeping on each recipient ──────────────────────────
-- attempts        how many times we have tried to hand this one to Resend
-- claimed_at      when a run took the row (status='sending'); NULL otherwise
-- next_attempt_at earliest a retry may be picked up — the backoff
-- last_error_at   when the most recent failure happened; `error` says what
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS attempts        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS claimed_at      TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;
ALTER TABLE campaign_sends ADD COLUMN IF NOT EXISTS last_error_at   TIMESTAMPTZ;

-- Finding rows a dead run abandoned: "still 'sending', claimed longer ago than
-- the longest a function can live".
CREATE INDEX IF NOT EXISTS idx_campaign_sends_stale
  ON campaign_sends (campaign_id, claimed_at) WHERE status = 'sending';

-- The send loop's actual query: queued rows for one campaign that are not
-- waiting out a backoff, oldest first.
CREATE INDEX IF NOT EXISTS idx_campaign_sends_retry
  ON campaign_sends (campaign_id, next_attempt_at, queued_at) WHERE status = 'queued';

-- ── 2. One run per campaign at a time ───────────────────────────────────────
-- Taken by whoever is inside the send loop for this campaign and cleared when
-- they leave; a run that dies without clearing it is reclaimed after ~10
-- minutes (longer than any function can live, so a live run is never robbed).
-- This is what stops two runs each spending the whole daily cap.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS run_lock_at TIMESTAMPTZ;

-- ── 3. Unsubscribes we could not action ─────────────────────────────────────
-- The one-click endpoint now fails closed (5xx, so the provider re-delivers)
-- instead of telling Gmail "done" when nothing was written. This is the durable
-- half of that: edge function logs roll off, and an opt-out request must not
-- roll off with them — UEMA gives us 5 working days to honour it however the
-- database was feeling at the time.
--
-- The token is NOT stored. unsubscribe_token is a permanent per-contact secret
-- (anyone holding it can opt that person out), so only its SHA-256 goes in
-- here — enough to tie a complaint or a support call to a record, useless to
-- anyone who reads the table.
CREATE TABLE IF NOT EXISTS campaign_unsubscribe_failures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT,                 -- SHA-256 hex of the unsubscribe token
  source     TEXT NOT NULL DEFAULT 'one-click',
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_unsubscribe_failures_recent
  ON campaign_unsubscribe_failures (created_at DESC);

ALTER TABLE campaign_unsubscribe_failures ENABLE ROW LEVEL SECURITY;

-- Staff can read them (so a failure can be actioned by hand); nobody writes
-- through the API — the edge function uses the service role, which bypasses RLS.
DROP POLICY IF EXISTS "campaign_unsubscribe_failures_staff" ON campaign_unsubscribe_failures;
CREATE POLICY "campaign_unsubscribe_failures_staff" ON campaign_unsubscribe_failures FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- ── 4. Grants 038 left off ──────────────────────────────────────────────────
-- Every other public-facing object in this schema has an explicit grant, and
-- the Campaigns page reads both of these directly: the audience view to show
-- who a filter matches, campaign_stats to fill the results tab. The view is
-- security_invoker, so the RLS policy on marketing_contacts still decides what
-- each user can actually see through it — this grant only opens the door.
GRANT SELECT ON campaign_audience_eligible TO authenticated;
GRANT EXECUTE ON FUNCTION campaign_stats(UUID) TO authenticated;
