-- Fix: a client accepting/declining a quote on the public /q/:token page wrote
-- to `quotes` and `jobs` directly as the anon role, which RLS blocks (those
-- tables are full-access-only). The writes silently matched zero rows, so the
-- quote/job status never actually changed when a client responded.
--
-- Mirror the existing register_quote_open pattern: a SECURITY DEFINER function
-- that performs the response server-side, keyed only by the secret view token,
-- and callable by anon. The client calls this instead of writing directly.
CREATE OR REPLACE FUNCTION respond_to_quote(
  p_token      TEXT,
  p_action     TEXT,               -- 'accepted' | 'declined'
  p_reason     TEXT   DEFAULT NULL,
  p_line_items JSONB  DEFAULT NULL,
  p_subtotal   NUMERIC DEFAULT NULL,
  p_gst        NUMERIC DEFAULT NULL,
  p_total      NUMERIC DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  IF p_action NOT IN ('accepted', 'declined') THEN
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE client_view_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Don't let a decided quote be flipped again by a re-opened link.
  IF v_quote.status IN ('accepted', 'declined') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_responded', 'status', v_quote.status);
  END IF;

  UPDATE quotes SET
    status         = p_action::quote_status,
    responded_at   = v_now,
    line_items     = COALESCE(p_line_items, line_items),
    subtotal       = COALESCE(p_subtotal,   subtotal),
    gst            = COALESCE(p_gst,         gst),
    total          = COALESCE(p_total,       total),
    decline_reason = CASE WHEN p_action = 'declined' THEN p_reason ELSE decline_reason END
  WHERE id = v_quote.id;

  UPDATE jobs SET
    status            = CASE WHEN p_action = 'accepted'
                             THEN 'accepted_to_schedule'::job_status
                             ELSE 'declined'::job_status END,
    status_changed_at = v_now
  WHERE id = v_quote.job_id;

  RETURN jsonb_build_object('ok', true, 'action', p_action,
                            'quote_id', v_quote.id, 'job_id', v_quote.job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC)
  TO anon, authenticated;
