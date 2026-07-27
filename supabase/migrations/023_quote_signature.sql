-- 023_quote_signature.sql
-- Capture a typed e-signature when a client accepts a quote, strengthening the
-- accepted record for disputes. Extends respond_to_quote with an optional
-- p_signature and stores it on the quote.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_name TEXT;

-- Replace the 7-arg version from migration 017 with an 8-arg one that also
-- records the signature. Drop the old signature first so there is a single
-- unambiguous overload.
DROP FUNCTION IF EXISTS respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC);

CREATE OR REPLACE FUNCTION respond_to_quote(
  p_token      TEXT,
  p_action     TEXT,               -- 'accepted' | 'declined'
  p_reason     TEXT    DEFAULT NULL,
  p_line_items JSONB   DEFAULT NULL,
  p_subtotal   NUMERIC DEFAULT NULL,
  p_gst        NUMERIC DEFAULT NULL,
  p_total      NUMERIC DEFAULT NULL,
  p_signature  TEXT    DEFAULT NULL
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
    signed_name    = CASE WHEN p_action = 'accepted' THEN p_signature ELSE signed_name END,
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

GRANT EXECUTE ON FUNCTION respond_to_quote(TEXT, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, TEXT)
  TO anon, authenticated;
