-- -----------------------------------------------------------------------------
-- 041  Put the customer's history in the enquiry email
-- -----------------------------------------------------------------------------
--
-- When a quote request lands, the office gets a name, an address and a message,
-- and then has to go hunting through Quotient or Xero to work out whether this
-- is a new customer or someone we did three thousand dollars of work for two
-- years ago. Everything needed to answer that is already on marketing_contacts:
-- source_ref holds the Quotient contact id (numeric) or the Xero contact GUID,
-- so a deep link into the right record can be built for either.
--
-- -- WHY THIS IS GATED BEHIND A SECRET ---------------------------------------
-- record_quote_request is granted to `anon`, and the anon key is public by
-- design -- it ships in the website's JavaScript. If this function simply
-- returned a customer's history for whatever address it was handed, anyone
-- holding that public key could submit a throwaway enquiry for
-- someone@example.com and read back that person's home address, what work we
-- did for them and what they spent. That is a Privacy Act 2020 problem (IPP 5
-- and IPP 11) handed out over an unauthenticated endpoint.
--
-- So the enquiry is always recorded -- the form must never break -- but the
-- history comes back only to a caller that knows a shared secret. In practice
-- that is the marketing site's server-side /api/quote handler, which holds it
-- as an environment variable and puts the result straight into the email to the
-- office. The browser never sees it.

-- -- 1. Somewhere to keep the secret -----------------------------------------
-- RLS is enabled and there are deliberately NO policies. That is not an
-- oversight: with RLS on and no policy, every ordinary role -- anon, and every
-- authenticated user including office staff -- reads exactly zero rows. Only
-- SECURITY DEFINER functions (running as the owner) and the service role can
-- see it, which is precisely the access this needs.
CREATE TABLE IF NOT EXISTS integration_secrets (
  name        TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE integration_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE integration_secrets FROM anon, authenticated;

-- -- 2. The enquiry writer, now returning history to trusted callers ---------
-- The return type changes from UUID to JSONB, which Postgres will not do
-- through CREATE OR REPLACE, so the old one is dropped first. The old signature
-- is dropped explicitly rather than left to coexist: two overloads differing
-- only by a defaulted trailing parameter make PostgREST's function resolution
-- ambiguous, and it starts refusing calls with PGRST203.
DROP FUNCTION IF EXISTS record_quote_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

CREATE OR REPLACE FUNCTION record_quote_request(
  p_name         TEXT,
  p_email        TEXT,
  p_phone        TEXT DEFAULT NULL,
  p_address      TEXT DEFAULT NULL,
  p_service      TEXT DEFAULT NULL,
  p_message      TEXT DEFAULT NULL,
  p_utm_source   TEXT DEFAULT NULL,
  p_utm_medium   TEXT DEFAULT NULL,
  p_utm_campaign TEXT DEFAULT NULL,
  p_secret       TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_email         TEXT := lower(nullif(btrim(p_email), ''));
  v_campaign      UUID;
  v_contact       UUID;
  v_send_campaign UUID;
  v_send_contact  UUID;
  v_matched       TEXT;
  v_id            UUID;
  v_secret        TEXT;
  v_history       JSONB := NULL;
  v_c             RECORD;
BEGIN
  IF v_email IS NULL OR v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'a valid email address is required';
  END IF;

  -- Attribution, best evidence first: the tag the link carried, then the
  -- address we mailed. (Unchanged from 040 -- see the notes there on why the
  -- second lookup reads into scratch variables.)
  IF nullif(btrim(p_utm_campaign), '') IS NOT NULL THEN
    SELECT id INTO v_campaign FROM campaigns
     WHERE lower(name) = lower(btrim(p_utm_campaign))
     ORDER BY created_at DESC LIMIT 1;
    IF v_campaign IS NOT NULL THEN v_matched := 'utm'; END IF;
  END IF;

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

  IF v_campaign IS NOT NULL THEN
    INSERT INTO campaign_events (campaign_id, contact_id, kind, meta)
    VALUES (v_campaign, v_contact, 'converted',
            jsonb_build_object('quote_request_id', v_id, 'matched_by', v_matched));
  END IF;

  -- -- History, for trusted callers only ------------------------------------
  -- Note the ordering: the enquiry is already inserted above. If the secret is
  -- absent, wrong, or has never been set, this simply returns no history --
  -- it does NOT raise. A misconfigured environment variable must degrade to
  -- "email without the extra context", never to a lost customer enquiry.
  SELECT value INTO v_secret FROM integration_secrets WHERE name = 'quote_enrich';

  IF v_secret IS NOT NULL AND p_secret IS NOT NULL AND p_secret = v_secret AND v_contact IS NOT NULL THEN
    SELECT c.full_name, c.email, c.phone, c.address, c.suburb, c.source, c.source_ref,
           c.last_job_summary, c.last_job_at, c.job_count, c.lifetime_value, c.services
      INTO v_c
      FROM marketing_contacts c WHERE c.id = v_contact;

    IF FOUND THEN
      v_history := jsonb_build_object(
        'known_customer',   true,
        'name_on_file',     v_c.full_name,
        'address_on_file',  v_c.address,
        'suburb',           v_c.suburb,
        'phone_on_file',    v_c.phone,
        'last_job_summary', v_c.last_job_summary,
        'last_job_at',      v_c.last_job_at,
        'job_count',        v_c.job_count,
        'lifetime_value',   v_c.lifetime_value,
        'services',         v_c.services,
        'source',           v_c.source,
        -- The deep link. Quotient's source_ref is its numeric contact id; Xero's
        -- is the contact GUID. Anything else gets no link rather than a guessed
        -- one -- a URL that 404s costs more time than no URL at all.
        'record_url',
          CASE
            WHEN v_c.source = 'quotient' AND v_c.source_ref ~ '^[0-9]+$'
              THEN 'https://go.quotientapp.com/31059/c/contacts/view/' || v_c.source_ref
            WHEN v_c.source = 'xero' AND v_c.source_ref ~* '^[0-9a-f-]{36}$'
              THEN 'https://go.xero.com/Contacts/View/' || v_c.source_ref
            ELSE NULL
          END
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'history', v_history);
END;
$$;

REVOKE ALL ON FUNCTION record_quote_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_quote_request(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO anon, authenticated;
