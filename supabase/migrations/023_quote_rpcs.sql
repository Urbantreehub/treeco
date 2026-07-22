-- Quote RPCs: server-authoritative totals, expiry enforcement, versioning,
-- accept-on-behalf, and the public client Q&A.
--
-- Supersedes respond_to_quote from migration 020, which had three problems:
--   1. It trusted p_subtotal/p_gst/p_total from the browser. Because it is
--      SECURITY DEFINER and granted to anon, anyone holding a quote token could
--      accept at a figure of their choosing. Totals are now recomputed here from
--      the stored line_items and never taken from the caller.
--   2. It never checked valid_until, so a long-expired quote could be accepted.
--   3. It captured no acceptance evidence beyond a timestamp.
--
-- The old 7-argument signature MUST be dropped, not just replaced: this version
-- takes an extra p_user_agent, so CREATE OR REPLACE would leave a second
-- overload in place and PostgREST could still route callers to the insecure one.
DROP FUNCTION IF EXISTS respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC);

-- GST is a single rate in this business; keep it in one place server-side so the
-- frontend can never disagree with the database about what a quote is worth.
CREATE OR REPLACE FUNCTION quote_gst_rate() RETURNS NUMERIC
LANGUAGE sql IMMUTABLE AS $$ SELECT 0.15::NUMERIC $$;

-- ── Server-authoritative totals ──────────────────────────────────────────
-- Mirrors calcTotals() in the frontend: an item counts if it is not optional,
-- or is optional and selected. Rates are ex-GST.
CREATE OR REPLACE FUNCTION quote_totals(p_line_items JSONB)
RETURNS TABLE (subtotal NUMERIC, gst NUMERIC, total NUMERIC)
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_sub NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(
           COALESCE((item->>'qty')::NUMERIC, 0) * COALESCE((item->>'rate')::NUMERIC, 0)
         ), 0)
    INTO v_sub
    FROM jsonb_array_elements(COALESCE(p_line_items, '[]'::JSONB)) AS item
   WHERE COALESCE((item->>'optional')::BOOLEAN, FALSE) = FALSE
      OR COALESCE((item->>'selected')::BOOLEAN, FALSE) = TRUE;

  v_sub := ROUND(v_sub, 2);
  subtotal := v_sub;
  gst      := ROUND(v_sub * quote_gst_rate(), 2);
  total    := v_sub + ROUND(v_sub * quote_gst_rate(), 2);
  RETURN NEXT;
END;
$$;

-- ── Version snapshots ────────────────────────────────────────────────────
-- Records the quote AS IT STANDS NOW, before whatever change is about to happen.
CREATE OR REPLACE FUNCTION snapshot_quote(p_quote_id UUID, p_reason TEXT, p_actor UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q   quotes%ROWTYPE;
  v_no  INTEGER;
  v_id  UUID;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_no FROM quote_versions WHERE quote_id = p_quote_id;

  INSERT INTO quote_versions (quote_id, version_no, line_items, subtotal, gst, total,
                              notes, status, reason, created_by)
  VALUES (p_quote_id, v_no, v_q.line_items, v_q.subtotal, v_q.gst, v_q.total,
          v_q.notes, v_q.status, p_reason, COALESCE(p_actor, auth.uid()))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION snapshot_quote(UUID, TEXT, UUID) TO authenticated;

-- ── Take offline to edit / put back online ───────────────────────────────
-- The Quotient pattern: a sent quote cannot be edited in place. Taking it
-- offline snapshots the current state and hides the figures from the client, so
-- nobody can accept a quote mid-revision.
CREATE OR REPLACE FUNCTION take_quote_offline(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_q.status NOT IN ('sent', 'viewed', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_status', 'status', v_q.status);
  END IF;

  PERFORM snapshot_quote(p_quote_id, 'edit_offline', auth.uid());
  UPDATE quotes SET status = 'editing', updated_by = auth.uid() WHERE id = p_quote_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION take_quote_offline(UUID) TO authenticated;

-- Re-issuing after an offline edit. Extends the expiry the way Quotient does —
-- a revised quote shouldn't inherit the old one's remaining validity.
CREATE OR REPLACE FUNCTION republish_quote(p_quote_id UUID, p_valid_days INTEGER DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q quotes%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  PERFORM snapshot_quote(p_quote_id, 'sent', auth.uid());
  UPDATE quotes
     SET status      = 'sent',
         sent_at     = COALESCE(sent_at, NOW()),
         sent_by     = COALESCE(sent_by, auth.uid()),
         updated_by  = auth.uid(),
         valid_until = (CURRENT_DATE + p_valid_days)
   WHERE id = p_quote_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION republish_quote(UUID, INTEGER) TO authenticated;

-- ── Public read ──────────────────────────────────────────────────────────
-- Replaces the 020 version. Adds the editing/expired states and the comment
-- thread, and computes an is_expired flag so the client page doesn't have to
-- trust its own clock.
CREATE OR REPLACE FUNCTION get_quote_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RETURN NULL; END IF;

  -- Parenthesised deliberately: jsonb `-` binds tighter than `||`, so this would
  -- parse correctly either way, but the intent shouldn't rest on precedence.
  SELECT ((to_jsonb(q) - 'private_notes' - 'accept_ip' - 'accept_user_agent')
         || jsonb_build_object(
           'is_expired',
             (q.valid_until IS NOT NULL AND q.valid_until < CURRENT_DATE
              AND q.status NOT IN ('accepted', 'declined')),
           'jobs',
           CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object(
             'id', j.id, 'address', j.address, 'job_type', j.job_type, 'title', j.title,
             'clients',
             CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
               'name', c.name, 'email', c.email, 'phone', c.phone
             ) END
           ) END,
           'comments', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
                      'id', cm.id, 'author', cm.author, 'body', cm.body,
                      'created_at', cm.created_at
                    ) ORDER BY cm.created_at)
               FROM quote_comments cm
              WHERE cm.quote_id = q.id AND cm.private = FALSE
           ), '[]'::JSONB)
         ))
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

-- ── Client accept / decline ──────────────────────────────────────────────
-- p_line_items carries only the client's optional-item SELECTIONS. Totals are
-- recomputed here; whatever the browser thinks they are is ignored.
CREATE OR REPLACE FUNCTION respond_to_quote(
  p_token      TEXT,
  p_action     TEXT,
  p_reason     TEXT    DEFAULT NULL,
  p_line_items JSONB   DEFAULT NULL,
  p_subtotal   NUMERIC DEFAULT NULL,   -- accepted for call compatibility, ignored
  p_gst        NUMERIC DEFAULT NULL,   -- ignored
  p_total      NUMERIC DEFAULT NULL,   -- ignored
  p_user_agent TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote  quotes%ROWTYPE;
  v_status quote_status;
  v_items  JSONB;
  v_t      RECORD;
  v_ip     TEXT;
BEGIN
  IF p_action NOT IN ('accept', 'decline') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE client_view_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_quote.status IN ('accepted', 'declined') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_responded', 'status', v_quote.status);
  END IF;
  -- A quote being revised must not be acceptable — that is the whole point of
  -- taking it offline.
  IF v_quote.status = 'editing' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'editing');
  END IF;
  IF v_quote.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_sent');
  END IF;
  -- Expiry is now enforced, not merely displayed. Declining stays allowed so we
  -- still capture the reason.
  IF p_action = 'accept'
     AND v_quote.valid_until IS NOT NULL
     AND v_quote.valid_until < CURRENT_DATE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'valid_until', v_quote.valid_until);
  END IF;

  -- Take only the selection flags from the client; everything priced comes from
  -- what we stored. A client cannot introduce items or change a rate.
  IF p_line_items IS NULL THEN
    v_items := v_quote.line_items;
  ELSE
    SELECT COALESCE(jsonb_agg(
             stored || jsonb_build_object(
               'selected',
               COALESCE((
                 SELECT (sent->>'selected')::BOOLEAN
                   FROM jsonb_array_elements(p_line_items) AS sent
                  WHERE sent->>'id' = stored->>'id'
                  LIMIT 1
               ), COALESCE((stored->>'selected')::BOOLEAN, FALSE))
             )
           ORDER BY idx), '[]'::JSONB)
      INTO v_items
      FROM jsonb_array_elements(COALESCE(v_quote.line_items, '[]'::JSONB))
           WITH ORDINALITY AS a(stored, idx);
  END IF;

  SELECT * INTO v_t FROM quote_totals(v_items);

  v_status := (CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END)::quote_status;
  BEGIN
    v_ip := split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1);
  EXCEPTION WHEN OTHERS THEN v_ip := NULL;
  END;

  PERFORM snapshot_quote(v_quote.id,
                         CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END,
                         NULL);

  UPDATE quotes
     SET status         = v_status,
         responded_at   = NOW(),
         line_items     = v_items,
         subtotal       = v_t.subtotal,
         gst            = v_t.gst,
         total          = v_t.total,
         decline_reason = CASE WHEN p_action = 'decline' THEN p_reason ELSE decline_reason END,
         accepted_via   = CASE WHEN p_action = 'accept' THEN 'client' ELSE accepted_via END,
         accept_ip      = CASE WHEN p_action = 'accept' THEN v_ip ELSE accept_ip END,
         accept_user_agent = CASE WHEN p_action = 'accept' THEN p_user_agent ELSE accept_user_agent END,
         accepted_snapshot = CASE WHEN p_action = 'accept' THEN jsonb_build_object(
             'line_items', v_items, 'subtotal', v_t.subtotal, 'gst', v_t.gst,
             'total', v_t.total, 'accepted_at', NOW(), 'via', 'client'
           ) ELSE accepted_snapshot END
   WHERE id = v_quote.id;

  UPDATE jobs
     SET status = (CASE WHEN p_action = 'accept'
                        THEN 'accepted_to_schedule' ELSE 'declined' END)::job_status,
         status_changed_at = NOW()
   WHERE id = v_quote.job_id;

  RETURN jsonb_build_object('ok', true, 'status', v_status, 'quote_id', v_quote.id,
                            'total', v_t.total);
END;
$$;
REVOKE ALL ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT) TO anon, authenticated;

-- ── Accept on behalf ─────────────────────────────────────────────────────
-- For the phone approval. Unlike Quotient — which signals an on-behalf
-- acceptance only by the absence of a fingerprint — this records it explicitly:
-- who marked it, when, and optionally how the client conveyed approval.
CREATE OR REPLACE FUNCTION accept_quote_on_behalf(
  p_quote_id UUID,
  p_reason   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_t     RECORD;
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_quote.status IN ('accepted', 'declined') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_responded', 'status', v_quote.status);
  END IF;
  IF v_quote.status = 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_sent');
  END IF;

  SELECT * INTO v_t FROM quote_totals(v_quote.line_items);
  PERFORM snapshot_quote(p_quote_id, 'accepted', v_actor);

  UPDATE quotes
     SET status           = 'accepted',
         responded_at     = NOW(),
         subtotal         = v_t.subtotal,
         gst              = v_t.gst,
         total            = v_t.total,
         accepted_via     = 'on_behalf',
         accepted_by      = v_actor,
         on_behalf_reason = p_reason,
         updated_by       = v_actor,
         accepted_snapshot = jsonb_build_object(
           'line_items', v_quote.line_items, 'subtotal', v_t.subtotal, 'gst', v_t.gst,
           'total', v_t.total, 'accepted_at', NOW(), 'via', 'on_behalf', 'by', v_actor
         )
   WHERE id = p_quote_id;

  -- The status-dropdown workaround skipped this, leaving quote and job out of sync.
  UPDATE jobs
     SET status = 'accepted_to_schedule'::job_status, status_changed_at = NOW()
   WHERE id = v_quote.job_id;

  RETURN jsonb_build_object('ok', true, 'quote_id', p_quote_id, 'total', v_t.total);
END;
$$;
GRANT EXECUTE ON FUNCTION accept_quote_on_behalf(UUID, TEXT) TO authenticated;

-- ── Client posts a question ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION post_quote_question(p_token TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_id    UUID;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty');
  END IF;
  IF length(p_body) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_long');
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE client_view_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  INSERT INTO quote_comments (quote_id, author, body)
  VALUES (v_quote.id, 'client', trim(p_body))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION post_quote_question(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION post_quote_question(TEXT, TEXT) TO anon, authenticated;

-- ── Expiry sweep ─────────────────────────────────────────────────────────
-- Flips past-date quotes to 'expired' so they surface correctly in the office
-- UI. Acceptance is already blocked in respond_to_quote regardless of whether
-- this has run, so the sweep is for visibility, not enforcement.
CREATE OR REPLACE FUNCTION expire_stale_quotes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE quotes
     SET status = 'expired'
   WHERE status IN ('sent', 'viewed')
     AND valid_until IS NOT NULL
     AND valid_until < CURRENT_DATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION expire_stale_quotes() TO authenticated;
