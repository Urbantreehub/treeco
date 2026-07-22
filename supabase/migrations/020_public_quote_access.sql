-- Make the emailed quote link actually work for a logged-out client.
--
-- Root cause of "URL link not loading when opening in browser": every RLS policy
-- on quotes/jobs/clients requires an authenticated user with access_level
-- 'full' or 'office' (schema.sql quotes_full_access_only, 005 quotes_office).
-- There is no anon SELECT policy, so QuoteView's direct .from('quotes') read
-- returned zero rows for the client and the page rendered "Quote not found or
-- link has expired." It worked for staff only because they were logged in.
--
-- Fixed with token-scoped SECURITY DEFINER RPCs rather than a broad anon policy:
-- a blanket "anon can SELECT quotes" grant would let anyone enumerate every
-- quote plus the joined client name/email/phone. These functions return exactly
-- one row, only for a caller who already holds the unguessable token.
--
-- Same gap silently broke accept/decline: QuoteView issued anon UPDATEs whose
-- results were never checked, so the UI showed "accepted" while RLS rejected
-- the write. respond_to_quote replaces those with one atomic definer call.

-- ── Read ─────────────────────────────────────────────────────────────────
-- Returns the quote plus the nested job/client shape QuoteView already expects,
-- so the frontend keeps rendering from the same object graph.
CREATE OR REPLACE FUNCTION get_quote_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(q) || jsonb_build_object(
           'jobs',
           CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id',       j.id,
             'address',  j.address,
             'job_type', j.job_type,
             'title',    j.title,
             'clients',
             CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
               'name',  c.name,
               'email', c.email,
               'phone', c.phone
             ) END
           ) END
         )
    INTO result
    FROM quotes q
    LEFT JOIN jobs    j ON j.id = q.job_id
    LEFT JOIN clients c ON c.id = j.client_id
   WHERE q.client_view_token = p_token;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_quote_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_quote_by_token(TEXT) TO anon, authenticated;

-- ── Accept / decline ─────────────────────────────────────────────────────
-- p_line_items carries the client's optional-item selections so the office sees
-- exactly what was accepted, with totals recalculated by the caller.
-- Idempotent: a quote already responded to is left untouched and reports false,
-- so a double-click or a re-opened link cannot overwrite the first answer.
CREATE OR REPLACE FUNCTION respond_to_quote(
  p_token      TEXT,
  p_action     TEXT,
  p_reason     TEXT    DEFAULT NULL,
  p_line_items JSONB   DEFAULT NULL,
  p_subtotal   NUMERIC DEFAULT NULL,
  p_gst        NUMERIC DEFAULT NULL,
  p_total      NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote  quotes%ROWTYPE;
  v_status quote_status;
BEGIN
  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE client_view_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_quote.status IN ('accepted', 'declined') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_responded',
                              'status', v_quote.status);
  END IF;

  v_status := (CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END)::quote_status;

  UPDATE quotes
     SET status         = v_status,
         responded_at   = NOW(),
         line_items     = COALESCE(p_line_items, line_items),
         subtotal       = COALESCE(p_subtotal,   subtotal),
         gst            = COALESCE(p_gst,        gst),
         total          = COALESCE(p_total,      total),
         decline_reason = CASE WHEN p_action = 'decline' THEN p_reason ELSE decline_reason END
   WHERE id = v_quote.id;

  -- 'declined' on job_status is added in migration 019.
  UPDATE jobs
     SET status = (CASE WHEN p_action = 'accept'
                        THEN 'accepted_to_schedule' ELSE 'declined' END)::job_status,
         status_changed_at = NOW()
   WHERE id = v_quote.job_id;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'quote_id', v_quote.id);
END;
$$;

REVOKE ALL ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC) TO anon, authenticated;
