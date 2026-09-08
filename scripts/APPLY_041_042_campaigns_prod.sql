-- ============================================================
-- TreeCo Campaigns -- paste this whole file into the Supabase
-- SQL Editor and press Run. It applies migrations 041 + 042.
-- Safe to run more than once (every statement is idempotent).
-- Nothing sends: campaign_send_enabled defaults to false.
-- ============================================================

BEGIN;

-- 041_campaigns.sql
-- Mailing list + email campaigns ("Campaigns" page).
--
-- WHY A SEPARATE CONTACT TABLE
-- `clients` is the operational record for someone we have a job/quote against.
-- The mailing list is a different population: it is sourced from Xero and
-- Quotient (years of customers who pre-date the app), it needs consent state
-- and an unsubscribe token per person, and a person must be able to leave the
-- mailing list without touching their operational client record. So the list
-- lives in `marketing_contacts`, optionally linked back to `clients`.
--
-- NZ LAW (Unsolicited Electronic Messages Act 2007 + Privacy Act 2020)
-- Marketing email to a past customer relies on INFERRED consent. The Act
-- requires every commercial message to (a) clearly identify the sender with
-- accurate contact details, and (b) carry a functional unsubscribe facility
-- that stays live for at least 30 days after sending and is actioned within
-- 5 working days. This schema enforces the machinery for that:
--   * every contact gets a permanent `unsubscribe_token`
--   * `consent_status` gates who can be mailed at all
--   * `email_suppressions` is a global, campaign-independent do-not-email list
--   * `campaign_sends` stores the exact rendered subject/body that went out,
--     so we can prove what any individual was sent
--   * unsubscribes are applied by a SECURITY DEFINER function callable by
--     `anon`, so the link works instantly with no login and no app session
-- The eligible-audience view is the ONLY thing the sender is allowed to read
-- from, so an unsubscribe can never be missed by a hand-written filter.
--
-- Idempotent. Safe to re-run.

-- -- 1. The mailing list -----------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_contacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id          UUID REFERENCES clients(id) ON DELETE SET NULL,

  email              TEXT NOT NULL,
  first_name         TEXT,
  last_name          TEXT,
  full_name          TEXT,
  phone              TEXT,
  address            TEXT,
  suburb             TEXT,
  city               TEXT,

  -- Where the row came from, and its id in that system, so re-imports update
  -- rather than duplicate.
  source             TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('quotient','xero','app','import','manual','booking')),
  source_ref         TEXT,

  -- Commercial accounts (Downer, Spencers Henshaw, councils, Kainga Ora) are
  -- contract work, not a marketing audience. They are imported for
  -- completeness but excluded from every campaign by default.
  contact_type       TEXT NOT NULL DEFAULT 'residential'
                       CHECK (contact_type IN ('residential','commercial')),

  -- Job history, used for segmentation and for personalising copy.
  first_job_at       DATE,
  last_job_at        DATE,
  job_count          INTEGER NOT NULL DEFAULT 0,
  lifetime_value     NUMERIC(10,2) NOT NULL DEFAULT 0,
  services           TEXT[] NOT NULL DEFAULT '{}',   -- 'pruning','removal','hedge','stump','planting'
  last_job_summary   TEXT,                            -- short human description of the last job

  -- Consent. 'inferred' = existing customer relationship (UEMA s4).
  consent_status     TEXT NOT NULL DEFAULT 'inferred'
                       CHECK (consent_status IN ('inferred','express','unsubscribed','bounced','complained','suppressed')),
  consent_source     TEXT,
  consent_at         TIMESTAMPTZ,

  unsubscribe_token  TEXT NOT NULL UNIQUE
                       DEFAULT replace(gen_random_uuid()::text, '-', ''),
  unsubscribed_at    TIMESTAMPTZ,
  unsubscribe_reason TEXT,
  bounced_at         TIMESTAMPTZ,
  complained_at      TIMESTAMPTZ,

  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per email address. Case-insensitive: emails are stored lowercased by
-- the importer, and this index makes that a hard guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_contacts_email
  ON marketing_contacts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_contacts_source_ref
  ON marketing_contacts (source, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_segment
  ON marketing_contacts (contact_type, consent_status, last_job_at DESC);

-- -- 2. Global suppression list ----------------------------------------------
-- Survives contact deletion and re-import. Nothing is ever sent to an address
-- in here, whatever the contact row says.
CREATE TABLE IF NOT EXISTS email_suppressions (
  email      TEXT PRIMARY KEY,
  reason     TEXT NOT NULL CHECK (reason IN ('unsubscribed','bounced','complained','manual')),
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -- 3. Campaigns ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  subject          TEXT NOT NULL,
  preheader        TEXT,

  -- Body is plain text with {{merge_tags}}. Deliberately NOT rich HTML: a
  -- plain, personally-written email from a real person outperforms a template
  -- blast for a local trade business and is far less likely to be filtered.
  body             TEXT NOT NULL DEFAULT '',

  from_name        TEXT NOT NULL DEFAULT 'Josh at Urban Tree Services',
  from_email       TEXT NOT NULL DEFAULT 'office@urbantreeservices.net',
  reply_to         TEXT NOT NULL DEFAULT 'office@urbantreeservices.net',

  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','scheduled','sending','sent','paused','failed')),
  scheduled_at     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,

  -- Declarative audience filter, resolved at send time against
  -- campaign_audience_eligible. e.g.
  --   {"min_months_since_job":12,"services":["pruning"],"suburbs":["Karori"]}
  audience         JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The offer. Kept structured so the footer terms can be generated from it
  -- (Fair Trading Act: a discount claim must state its conditions and expiry).
  offer_code       TEXT,
  offer_percent    INTEGER CHECK (offer_percent BETWEEN 0 AND 100),
  offer_expires_on DATE,
  offer_terms      TEXT,

  cta_label        TEXT NOT NULL DEFAULT 'Get a free quote',
  cta_url          TEXT NOT NULL DEFAULT 'https://www.urbantreeservices.net',

  -- Rolling counters, maintained by the tracking functions.
  stats            JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_due
  ON campaigns (status, scheduled_at) WHERE status = 'scheduled';

-- -- 4. One row per recipient ------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_sends (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id    UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,

  status        TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','sending','sent','failed','skipped')),
  provider_id   TEXT,        -- Resend message id
  error         TEXT,
  skip_reason   TEXT,

  -- Exactly what this person received. Stored so we can answer "what did you
  -- send me?" precisely, which is both a compliance and a support need.
  subject_sent  TEXT,
  body_sent     TEXT,
  merge_data    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Per-send secret used by the open pixel and click redirect, so tracking
  -- never exposes a contact id or email in a URL.
  track_token   TEXT NOT NULL UNIQUE
                  DEFAULT replace(gen_random_uuid()::text, '-', ''),

  opened_at     TIMESTAMPTZ,
  open_count    INTEGER NOT NULL DEFAULT 0,
  clicked_at    TIMESTAMPTZ,
  click_count   INTEGER NOT NULL DEFAULT 0,

  queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ,

  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_pending
  ON campaign_sends (campaign_id, status) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_campaign_sends_contact
  ON campaign_sends (contact_id, sent_at DESC);

-- -- 5. Event log (mirrors quote_events) -------------------------------------
CREATE TABLE IF NOT EXISTS campaign_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  send_id     UUID REFERENCES campaign_sends(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL
                CHECK (kind IN ('queued','sent','delivered','opened','clicked','bounced','complained','unsubscribed','failed')),
  url         TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_events_campaign
  ON campaign_events (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_events_kind
  ON campaign_events (campaign_id, kind);

-- -- 6. The only audience the sender may read --------------------------------
-- Every exclusion required by law or good list hygiene is applied here, once.
-- security_invoker matters here. A Postgres view runs with the OWNER's rights by
-- default, which would let ANY authenticated user (including 'restricted' crew and
-- 'truck' logins) read the whole mailing list straight through this view, bypassing
-- the RLS policy on marketing_contacts entirely. With security_invoker the caller's
-- own permissions apply, so the office/full policy below is what governs it.
-- The edge functions are unaffected -- they use the service role.
CREATE OR REPLACE VIEW campaign_audience_eligible
WITH (security_invoker = true) AS
SELECT c.*,
       CASE WHEN c.last_job_at IS NULL THEN NULL
            ELSE (DATE_PART('year',  AGE(CURRENT_DATE, c.last_job_at)) * 12
                + DATE_PART('month', AGE(CURRENT_DATE, c.last_job_at)))::int
       END AS months_since_job
  FROM marketing_contacts c
 WHERE c.contact_type = 'residential'
   AND c.consent_status IN ('inferred','express')
   AND c.email IS NOT NULL
   AND c.email <> ''
   AND c.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
   AND NOT EXISTS (
         SELECT 1 FROM email_suppressions s
          WHERE lower(s.email) = lower(c.email)
       );

-- -- 7. Unsubscribe (public, no auth) ----------------------------------------
-- Called by the /unsubscribe/:token page. Idempotent: clicking twice is fine.
--
-- NAMING RULE FOR THE OUT PARAMETERS (this is not cosmetic)
-- In plpgsql, a RETURNS TABLE column is an OUT parameter, and an OUT parameter
-- is a variable in scope for the WHOLE function body. This used to return
-- (email TEXT, already BOOLEAN), which put a variable called `email` in scope
-- over an INSERT INTO email_suppressions (email, ...). Column lists are not
-- resolved against variables, but an ON CONFLICT arbiter IS -- it goes through
-- transformExpr and the plpgsql column-ref hook -- so under the default
-- plpgsql.variable_conflict = 'error' that can raise
--   42702  column reference "email" is ambiguous
-- at RUN time, on every single call. A silently broken unsubscribe is the worst
-- failure this system has: it is a legal obligation (UEMA s11), the person
-- believes they have opted out, and we would keep mailing them.
--
-- So, belt and braces, three independent fixes:
--   1. the OUT parameters are named out_email / out_already, which collide with
--      no column of any table this body touches (marketing_contacts,
--      email_suppressions, campaign_events, campaign_sends);
--   2. the ON CONFLICT names no arbiter column at all -- `DO NOTHING` with no
--      target cannot be ambiguous, and email_suppressions.email is the primary
--      key so the behaviour is identical;
--   3. #variable_conflict use_column, so that if any other name in this body
--      ever collides, the column wins instead of raising.
--
-- DROP first: CREATE OR REPLACE cannot rename OUT parameters (it is a change of
-- return type), so a re-run over an older definition would fail without this.
-- Safe here -- this migration has never been applied to a database.
DROP FUNCTION IF EXISTS campaign_unsubscribe(TEXT, TEXT);
CREATE OR REPLACE FUNCTION campaign_unsubscribe(p_token TEXT, p_reason TEXT DEFAULT NULL)
RETURNS TABLE (out_email TEXT, out_already BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_contact marketing_contacts%ROWTYPE;
  v_already BOOLEAN;
BEGIN
  SELECT * INTO v_contact FROM marketing_contacts WHERE unsubscribe_token = p_token;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_already := (v_contact.consent_status = 'unsubscribed');

  UPDATE marketing_contacts
     SET consent_status     = 'unsubscribed',
         unsubscribed_at    = COALESCE(unsubscribed_at, NOW()),
         unsubscribe_reason = COALESCE(p_reason, unsubscribe_reason),
         updated_at         = NOW()
   WHERE id = v_contact.id;

  -- No arbiter column: email_suppressions.email is the primary key, so a bare
  -- DO NOTHING covers the same conflict, and there is no expression left for
  -- the plpgsql column-ref hook to find ambiguous.
  INSERT INTO email_suppressions (email, reason, detail)
  VALUES (lower(v_contact.email), 'unsubscribed', p_reason)
  ON CONFLICT DO NOTHING;

  IF NOT v_already THEN
    INSERT INTO campaign_events (campaign_id, send_id, contact_id, kind, meta)
    SELECT s.campaign_id, s.id, v_contact.id, 'unsubscribed',
           jsonb_build_object('reason', p_reason)
      FROM campaign_sends s
     WHERE s.contact_id = v_contact.id
     ORDER BY s.sent_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_contact.email, v_already;
END;
$$;
GRANT EXECUTE ON FUNCTION campaign_unsubscribe(TEXT, TEXT) TO anon, authenticated;

-- Lets the unsubscribe page greet the person and confirm the address, without
-- exposing the table to anon.
--
-- AUDITED for the same OUT-parameter/column collision as campaign_unsubscribe
-- above: its OUT names (email, first_name, unsubscribed) DO match columns of
-- marketing_contacts, but this is LANGUAGE sql -- there is no plpgsql column-ref
-- hook and no variable_conflict setting -- and every reference in the body is
-- table-qualified (c.email, c.first_name, c.consent_status), so nothing can
-- resolve ambiguously. Left as-is deliberately: these names are the RPC's
-- response keys, which frontend/src/pages/Unsubscribe.jsx reads.
-- KEEP THE REFERENCES QUALIFIED if this body is ever edited.
CREATE OR REPLACE FUNCTION campaign_unsubscribe_info(p_token TEXT)
RETURNS TABLE (email TEXT, first_name TEXT, unsubscribed BOOLEAN)
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.email, c.first_name, (c.consent_status = 'unsubscribed')
    FROM marketing_contacts c
   WHERE c.unsubscribe_token = p_token;
$$;
GRANT EXECUTE ON FUNCTION campaign_unsubscribe_info(TEXT) TO anon, authenticated;

-- -- 8. Open / click tracking (public, no auth) ------------------------------
-- Audited for the OUT-parameter/column collision described above: both of these
-- return VOID (no OUT parameters at all) and their only names are p_* arguments
-- and v_* locals, none of which is a column of campaign_sends or
-- campaign_events. #variable_conflict use_column is set anyway so that the
-- house rule holds if either body grows.
CREATE OR REPLACE FUNCTION register_campaign_open(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_send campaign_sends%ROWTYPE;
BEGIN
  UPDATE campaign_sends
     SET open_count = open_count + 1,
         opened_at  = COALESCE(opened_at, NOW())
   WHERE track_token = p_token
   RETURNING * INTO v_send;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO campaign_events (campaign_id, send_id, contact_id, kind)
  VALUES (v_send.campaign_id, v_send.id, v_send.contact_id, 'opened');
END;
$$;
GRANT EXECUTE ON FUNCTION register_campaign_open(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION register_campaign_click(p_token TEXT, p_url TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE v_send campaign_sends%ROWTYPE;
BEGIN
  UPDATE campaign_sends
     SET click_count = click_count + 1,
         clicked_at  = COALESCE(clicked_at, NOW()),
         opened_at   = COALESCE(opened_at, NOW())
   WHERE track_token = p_token
   RETURNING * INTO v_send;

  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO campaign_events (campaign_id, send_id, contact_id, kind, url)
  VALUES (v_send.campaign_id, v_send.id, v_send.contact_id, 'clicked', p_url);
END;
$$;
GRANT EXECUTE ON FUNCTION register_campaign_click(TEXT, TEXT) TO anon, authenticated;

-- -- 9. Campaign stats -------------------------------------------------------
-- Audited: LANGUAGE sql, one argument (p_campaign_id) that matches no column of
-- campaign_sends or campaign_events, and no OUT parameters -- the return is a
-- scalar JSONB, so nothing is in scope over the body.
CREATE OR REPLACE FUNCTION campaign_stats(p_campaign_id UUID)
RETURNS JSONB LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'recipients',   COUNT(*),
    'sent',         COUNT(*) FILTER (WHERE status = 'sent'),
    'failed',       COUNT(*) FILTER (WHERE status = 'failed'),
    'skipped',      COUNT(*) FILTER (WHERE status = 'skipped'),
    'queued',       COUNT(*) FILTER (WHERE status = 'queued'),
    'opened',       COUNT(*) FILTER (WHERE opened_at IS NOT NULL),
    'clicked',      COUNT(*) FILTER (WHERE clicked_at IS NOT NULL),
    'unsubscribed', (SELECT COUNT(*) FROM campaign_events e
                      WHERE e.campaign_id = p_campaign_id AND e.kind = 'unsubscribed')
  )
  FROM campaign_sends WHERE campaign_id = p_campaign_id;
$$;

-- -- 10. updated_at triggers -------------------------------------------------
DROP TRIGGER IF EXISTS set_updated_at_marketing_contacts ON marketing_contacts;
CREATE TRIGGER set_updated_at_marketing_contacts BEFORE UPDATE ON marketing_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_campaigns ON campaigns;
CREATE TRIGGER set_updated_at_campaigns BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -- 11. RLS -----------------------------------------------------------------
-- Same shape as the rest of the app: office/full staff manage everything;
-- nothing is readable by anon. The public unsubscribe and tracking paths go
-- through the SECURITY DEFINER functions above, never through the tables.
ALTER TABLE marketing_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sends      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "marketing_contacts_staff" ON marketing_contacts;
CREATE POLICY "marketing_contacts_staff" ON marketing_contacts FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "email_suppressions_staff" ON email_suppressions;
CREATE POLICY "email_suppressions_staff" ON email_suppressions FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "campaigns_staff" ON campaigns;
CREATE POLICY "campaigns_staff" ON campaigns FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "campaign_sends_staff" ON campaign_sends;
CREATE POLICY "campaign_sends_staff" ON campaign_sends FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "campaign_events_staff" ON campaign_events;
CREATE POLICY "campaign_events_staff" ON campaign_events FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- -- 12. Kill switch ---------------------------------------------------------
-- Sending starts OFF. Nothing goes out until this is flipped in Settings,
-- so importing the list can never accidentally mail 4,000 people.
INSERT INTO app_settings (key, value) VALUES ('campaign_send_enabled', 'false'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Daily cap, so a misconfigured audience cannot burn the sending domain's
-- reputation in one run.
INSERT INTO app_settings (key, value) VALUES ('campaign_daily_cap', '200'::jsonb)
  ON CONFLICT (key) DO NOTHING;


-- 042_campaign_send_retries.sql
-- Makes a campaign send survive the things that actually go wrong: the daily
-- cap, a Resend outage, a function killed mid-flight, and a database that
-- refuses an unsubscribe.
--
-- WHY EACH OF THESE EXISTS
-- 041 modelled a send as one pass over a queue that either finished or didn't.
-- In practice a run is interrupted constantly -- the daily cap stops it after
-- 200, an edge function is killed at ~150s, Resend rate-limits or 500s -- and
-- the old schema had nowhere to record "interrupted, come back to this":
--   * a row claimed by a run that then died stayed 'sending' forever, because
--     nothing recorded WHEN it was claimed, so nothing could tell an in-flight
--     row from an abandoned one (-> claimed_at);
--   * a send that failed because Resend was having a bad minute was written off
--     as permanently failed, because there was nowhere to count tries or to say
--     "not before X" (-> attempts, next_attempt_at, last_error_at);
--   * two runs of the same campaign -- the cron tick and someone hitting "Send
--     now" -- each read the day's remaining budget and each spent all of it,
--     because a campaign had no notion of being claimed (-> run_lock_at);
--   * a one-click unsubscribe that hit a database error was acknowledged to the
--     provider and left no trace anywhere durable (->
--     campaign_unsubscribe_failures).
--
-- Also grants the two public-facing objects 041 created but never granted, both
-- of which the Campaigns page reads directly.
--
-- Idempotent. Safe to re-run.

-- -- 1. Retry + claim bookkeeping on each recipient --------------------------
-- attempts        how many times we have tried to hand this one to Resend
-- claimed_at      when a run took the row (status='sending'); NULL otherwise
-- next_attempt_at earliest a retry may be picked up -- the backoff
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

-- -- 2. One run per campaign at a time ---------------------------------------
-- Taken by whoever is inside the send loop for this campaign and cleared when
-- they leave; a run that dies without clearing it is reclaimed after ~10
-- minutes (longer than any function can live, so a live run is never robbed).
-- This is what stops two runs each spending the whole daily cap.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS run_lock_at TIMESTAMPTZ;

-- -- 3. Unsubscribes we could not action -------------------------------------
-- The one-click endpoint now fails closed (5xx, so the provider re-delivers)
-- instead of telling Gmail "done" when nothing was written. This is the durable
-- half of that: edge function logs roll off, and an opt-out request must not
-- roll off with them -- UEMA gives us 5 working days to honour it however the
-- database was feeling at the time.
--
-- The token is NOT stored. unsubscribe_token is a permanent per-contact secret
-- (anyone holding it can opt that person out), so only its SHA-256 goes in
-- here -- enough to tie a complaint or a support call to a record, useless to
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
-- through the API -- the edge function uses the service role, which bypasses RLS.
DROP POLICY IF EXISTS "campaign_unsubscribe_failures_staff" ON campaign_unsubscribe_failures;
CREATE POLICY "campaign_unsubscribe_failures_staff" ON campaign_unsubscribe_failures FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- -- 4. Grants 041 left off --------------------------------------------------
-- Every other public-facing object in this schema has an explicit grant, and
-- the Campaigns page reads both of these directly: the audience view to show
-- who a filter matches, campaign_stats to fill the results tab. The view is
-- security_invoker, so the RLS policy on marketing_contacts still decides what
-- each user can actually see through it -- this grant only opens the door.
GRANT SELECT ON campaign_audience_eligible TO authenticated;
GRANT EXECUTE ON FUNCTION campaign_stats(UUID) TO authenticated;

COMMIT;
