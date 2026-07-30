-- 028_quote_comment_attachments.sql
-- Adds image attachments to the quote discussion thread. Staff (and later
-- clients) can attach images to a comment. Attachments are stored as an array
-- of public URL strings pointing at the `quote-images` storage bucket.
--
-- Idempotent and safe to re-run. Text-only comments keep working regardless.

ALTER TABLE quote_comments
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── Client read: non-internal comments (now including attachments) ───────────
-- Same body as 022's get_quote_comments, with c.attachments added to the
-- signature and the SELECT. SECURITY DEFINER, search_path and the internal
-- filter are unchanged.
CREATE OR REPLACE FUNCTION get_quote_comments(p_token TEXT)
RETURNS TABLE (id UUID, author_type TEXT, author_name TEXT, body TEXT, attachments JSONB, created_at TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.author_type, c.author_name, c.body, c.attachments, c.created_at
  FROM quote_comments c
  JOIN quotes q ON q.id = c.quote_id
  WHERE q.client_view_token = p_token
    AND c.internal = FALSE
  ORDER BY c.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_quote_comments(TEXT) TO anon, authenticated;
