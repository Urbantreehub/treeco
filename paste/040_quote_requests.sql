-- -----------------------------------------------------------------------------
-- 040  Quote requests, and tying them back to the campaign that caused them
-- -----------------------------------------------------------------------------
--
-- Today the funnel stops dead halfway. campaign-track records who clicked, then
-- the person lands on urbantreeservices.net, fills in the quote form, and
-- /api/quote emails the office via Resend and writes to NOTHING. The enquiry
-- exists only as a message in an inbox, so there is no way to ask "did the
-- hedge campaign actually bring in work".
--
-- This migration gives web enquiries somewhere to live and attributes them.
--
-- WHY NOT JUST JOIN jobs TO marketing_contacts
-- Because it would report zero and look like a failed campaign. At the time of
-- writing there are 26 rows in `jobs` and 34 in `clients`, against 4,211
-- marketing contacts -- the real quoting happens in Quotient and the invoicing
-- in Xero. Only 20 of 4,211 contacts even carry a client_id. Attribution built
-- on the jobs table would be measuring data entry, not marketing.
--
-- So quote_requests is deliberately its OWN record of the enquiry, written at
-- the moment the form is submitted, and it does not depend on anyone later
-- creating a job.

-- -- 1. The enquiry itself ---------------------------------------------------
CREATE TABLE IF NOT EXISTS quote_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- What the person typed. Kept verbatim; this is the enquiry as received.
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  address       TEXT,
  service       TEXT,
  message       TEXT,

  -- Where it came from. `source` is the channel ('website' for the public form);
  -- the utm_* fields are whatever the link carried, so a campaign can be
  -- identified even when the email address does not match anything we mailed.
  source        TEXT NOT NULL DEFAULT 'website',
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,

  -- Resolved attribution, filled in by record_quote_request() at write time
  -- rather than worked out later in a report. Doing it once, at the moment the
  -- enquiry arrives, means the answer cannot drift when contacts are edited or
  -- a campaign is renamed.
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  contact_id    UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  matched_by    TEXT,          -- 'utm' | 'email' | NULL -- how we attributed it

  -- Set by the office if the enquiry turns into real work. Nullable forever;
  -- an unconverted enquiry is still a conversion FROM the campaign's point of
  -- view, which is what this table measures.
  job_id        UUID REFERENCES jobs(id) ON DELETE SET NULL,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS quote_requests_created_idx  ON quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS quote_requests_campaign_idx ON quote_requests (campaign_id);
CREATE INDEX IF NOT EXISTS quote_requests_email_idx    ON quote_requests (lower(email));

-- -- 2. The public write path ------------------------------------------------
-- SECURITY DEFINER and granted to `anon`, exactly like campaign_unsubscribe in
-- 038. The marketing site is a separate Vercel project on a different origin;
-- giving it a service-role key would put a full-database credential in a second
-- deployment for the sake of one INSERT. This function is the whole of the
-- write surface instead: it takes an enquiry, it returns an id, and there is no
-- way to read anything back out through it.
--
-- #variable_conflict use_column -- same reason as 038. The OUT parameter is in
-- scope over the whole body, and an unqualified `email` in an INSERT column
-- list or a WHERE clause would otherwise raise 42702 at RUN time, on every
-- call, in a function whose failure mode is a silently lost enquiry.
CREATE OR REPLACE FUNCTION record_quote_request(
  p_name         TEXT,
  p_email        TEXT,
  p_phone        TEXT DEFAULT NULL,
  p_address      TEXT DEFAULT NULL,
  p_service      TEXT DEFAULT NULL,
  p_message      TEXT DEFAULT NULL,
  p_utm_source   TEXT DEFAULT NULL,
  p_utm_medium   TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_email      TEXT := lower(nullif(btrim(p_email), ''));
  v_campaign   UUID;
  v_contact    UUID;
  v_send_campaign UUID;
  v_send_contact  UUID;
  v_matched    TEXT;
  v_id         UUID;
BEGIN
  -- The form validates too, but this is the trust boundary, so it validates
  -- again. A nameless, emailless row is not an enquiry, it is noise.
  IF v_email IS NULL OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'a valid email address is required';
  END IF;

  -- Attribution, best evidence first.
  --
  -- 1. utm_campaign is what the link carried, so it is direct evidence of which
  --    email produced the click. Matched on the campaign NAME because that is
  --    what the renderer puts in the URL and what stays readable in a log.
  IF nullif(btrim(p_utm_campaign), '') IS NOT NULL THEN
    SELECT id INTO v_campaign FROM campaigns
     WHERE lower(name) = lower(btrim(p_utm_campaign))
     ORDER BY created_at DESC LIMIT 1;
    IF v_campaign IS NOT NULL THEN v_matched := 'utm'; END IF;
  END IF;

  -- 2. Then the address. Someone who strips the tracking parameters, or types
  --    the web address in from the email rather than clicking, still converted
  --    -- they are just harder to see. Only counted where we actually mailed
  --    them, and only against the most recent send.
  --
  --    SELECT ... INTO assigns NULL when nothing matches, so this reads into
  --    scratch variables and only overwrites a utm match if it found something.
  --    Straight `INTO v_campaign` would wipe a perfectly good utm attribution
  --    for anyone using a different address from the one we mailed -- the exact
  --    case the utm parameter exists to catch.
  SELECT s.campaign_id, s.contact_id
    INTO v_send_campaign, v_send_contact
    FROM campaign_sends s
   WHERE lower(s.email) = v_email
     AND s.status = 'sent'
     AND (v_campaign IS NULL OR s.campaign_id = v_campaign)
   ORDER BY s.sent_at DESC NULLS LAST
   LIMIT 1;

  IF v_send_contact IS NOT NULL THEN v_contact := v_send_contact; END IF;
  IF v_campaign IS NULL AND v_send_campaign IS NOT NULL THEN
    v_campaign := v_send_campaign;
    v_matched  := 'email';
  END IF;

  -- Fill in the contact even when the campaign was matched by utm.
  IF v_contact IS NULL THEN
    SELECT id INTO v_contact FROM marketing_contacts
     WHERE lower(email) = v_email LIMIT 1;
  END IF;

  INSERT INTO quote_requests (
    name, email, phone, address, service, message,
    source, utm_source, utm_medium, utm_campaign,
    campaign_id, contact_id, matched_by
  ) VALUES (
    nullif(btrim(p_name), ''), v_email, nullif(btrim(p_phone), ''),
    nullif(btrim(p_address), ''), nullif(btrim(p_service), ''),
    nullif(btrim(p_message), ''),
    'website', nullif(btrim(p_utm_source), ''), nullif(btrim(p_utm_medium), ''),
    nullif(btrim(p_utm_campaign), ''),
    v_campaign, v_contact, v_matched
  ) RETURNING id INTO v_id;

  -- A quote request is a far stronger signal than an open, so record it on the
  -- campaign timeline as well. 'converted' is a new kind; campaign_stats does
  -- not count it, so this cannot disturb the existing figures.
  IF v_campaign IS NOT NULL THEN
    INSERT INTO campaign_events (campaign_id, contact_id, kind, meta)
    VALUES (v_campaign, v_contact, 'converted',
            jsonb_build_object('quote_request_id', v_id, 'matched_by', v_matched));
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION record_quote_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_quote_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;

-- -- 2b. 'converted' has to be a legal event kind ----------------------------
-- campaign_events.kind carries a CHECK constraint from 038 that lists the
-- provider's delivery events and nothing else. Inserting 'converted' against it
-- raises 23514 -- INSIDE record_quote_request(), which would roll back the
-- enquiry itself. The customer would see the form fail and the office would
-- never learn they tried. Widen the constraint first.
ALTER TABLE campaign_events DROP CONSTRAINT IF EXISTS campaign_events_kind_check;
ALTER TABLE campaign_events ADD  CONSTRAINT campaign_events_kind_check
  CHECK (kind IN ('queued','sent','delivered','opened','clicked',
                  'bounced','complained','unsubscribed','failed','converted'));

-- -- 3. Reading it back ------------------------------------------------------
-- security_invoker, for the same reason as campaign_audience_eligible in 038: a
-- view runs with its OWNER's rights by default, which would hand every
-- authenticated user -- crew and truck logins included -- the full enquiry list
-- with names, addresses and phone numbers, straight past the RLS policy below.
CREATE OR REPLACE VIEW campaign_conversions
WITH (security_invoker = true) AS
SELECT c.id                             AS campaign_id,
       c.name                           AS campaign_name,
       count(q.id)                      AS quote_requests,
       count(q.id) FILTER (WHERE q.job_id IS NOT NULL) AS became_jobs,
       min(q.created_at)                AS first_request_at,
       max(q.created_at)                AS last_request_at
  FROM campaigns c
  LEFT JOIN quote_requests q ON q.campaign_id = c.id
 GROUP BY c.id, c.name;

-- -- 4. RLS ------------------------------------------------------------------
-- Enquiries carry name, address, phone and email, so they are office-only on
-- the same predicate as the rest of the marketing tables. Note there is NO anon
-- policy: the public writes through record_quote_request() and nothing else.
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_requests_staff" ON quote_requests;
CREATE POLICY "quote_requests_staff" ON quote_requests FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
