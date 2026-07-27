-- 022_quote_comments.sql
-- A discussion thread on each quote (Quotient-style): clients can ask questions
-- on their quote, staff can reply, and staff can leave internal-only notes. The
-- conversation lives on the quote instead of scattered email.
--
-- The client is the anon role (RLS blocks direct writes), so client reads/writes
-- go through SECURITY DEFINER RPCs keyed by the quote's view token — mirroring
-- respond_to_quote. Staff use the table directly under full-access RLS.

CREATE TABLE IF NOT EXISTS quote_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('client', 'staff')),
  author_id   UUID REFERENCES users(id) ON DELETE SET NULL,   -- staff author
  author_name TEXT,                                            -- display name
  body        TEXT NOT NULL,
  internal    BOOLEAN NOT NULL DEFAULT FALSE,                  -- staff-only note
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_comments_quote ON quote_comments(quote_id);

ALTER TABLE quote_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_comments_full_access" ON quote_comments;
CREATE POLICY "quote_comments_full_access" ON quote_comments
  FOR ALL USING ((SELECT access_level FROM users WHERE id = auth.uid()) = 'full');

-- ── Client read: non-internal comments for the quote behind this token ───────
CREATE OR REPLACE FUNCTION get_quote_comments(p_token TEXT)
RETURNS TABLE (id UUID, author_type TEXT, author_name TEXT, body TEXT, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.author_type, c.author_name, c.body, c.created_at
  FROM quote_comments c
  JOIN quotes q ON q.id = c.quote_id
  WHERE q.client_view_token = p_token
    AND c.internal = FALSE
  ORDER BY c.created_at ASC;
$$;

-- ── Client write: post a question/comment on their quote ─────────────────────
CREATE OR REPLACE FUNCTION post_quote_comment(p_token TEXT, p_body TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes;
  v_name  TEXT;
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;
  SELECT * INTO v_quote FROM quotes WHERE client_view_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  SELECT cl.name INTO v_name
    FROM jobs j LEFT JOIN clients cl ON cl.id = j.client_id
    WHERE j.id = v_quote.job_id;
  INSERT INTO quote_comments (quote_id, author_type, author_name, body)
  VALUES (v_quote.id, 'client', COALESCE(v_name, 'Client'), btrim(p_body));
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION get_quote_comments(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION post_quote_comment(TEXT, TEXT) TO anon, authenticated;
