-- =====================================================================
-- Catch-up: apply migrations 025–028 to PROD (zagwhnnxjtimzvvjaujm)
-- Bundles: safety sign-off, staff phone, crew portal, quote-comment
-- attachments, and the 'truck' access level — plus a one-time cleanup
-- of a test lead. Fully idempotent — safe to run once, safe to re-run.
-- Paste into Supabase Dashboard → SQL Editor → Run.
--
-- NOTE on the last statement (ALTER TYPE ... ADD VALUE 'truck'): on
-- PostgreSQL 15 (what Supabase runs) this is fine inside one run. If it
-- ever errors with "cannot run inside a transaction block", just select
-- that single line and Run it on its own.
-- =====================================================================


-- ── 025: Safety sign-off / acknowledgement register ──────────────────
CREATE TABLE IF NOT EXISTS safety_acknowledgements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  signer_name    TEXT        NOT NULL,
  scope          TEXT        NOT NULL DEFAULT 'all',
  doc_snapshot   JSONB       NOT NULL DEFAULT '{}',
  statement      TEXT,
  signature_data TEXT,
  meeting_ref    TEXT,
  signed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_ack_user    ON safety_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_ack_meeting ON safety_acknowledgements(meeting_ref);
CREATE INDEX IF NOT EXISTS idx_safety_ack_signed  ON safety_acknowledgements(signed_at DESC);

ALTER TABLE safety_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_ack_staff" ON safety_acknowledgements;
CREATE POLICY "safety_ack_staff" ON safety_acknowledgements FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "safety_ack_self_read" ON safety_acknowledgements;
CREATE POLICY "safety_ack_self_read" ON safety_acknowledgements FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "safety_ack_self_insert" ON safety_acknowledgements;
CREATE POLICY "safety_ack_self_insert" ON safety_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());


-- ── 026: Staff mobile number (for chat text/email relay) ─────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;


-- ── 026: Crew Portal — Phase 2 access ────────────────────────────────
DROP POLICY IF EXISTS "staff_records_self_read" ON staff_records;
CREATE POLICY "staff_records_self_read" ON staff_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "staff_records_self_insert" ON staff_records;
CREATE POLICY "staff_records_self_insert" ON staff_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "safety_docs_read_auth" ON safety_documents;
CREATE POLICY "safety_docs_read_auth" ON safety_documents FOR SELECT TO authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-uploads', 'staff-uploads', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "staff_uploads_own" ON storage.objects;
CREATE POLICY "staff_uploads_own" ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'staff-uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'staff-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "staff_uploads_staff_read" ON storage.objects;
CREATE POLICY "staff_uploads_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-uploads' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));


-- ── 028: Quote-comment image attachments ─────────────────────────────
ALTER TABLE quote_comments
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

-- RETURNS TABLE signature changes (adds attachments) → must DROP first.
DROP FUNCTION IF EXISTS get_quote_comments(TEXT);
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


-- ── One-time cleanup: remove the test lead created while probing the
--    inbound-lead webhook (and the throwaway client it made). Safe: if it
--    was already removed, this deletes 0 rows. ────────────────────────
WITH j AS (
  DELETE FROM jobs WHERE id = '73178d7a-6694-42f3-8f2f-dfee15025102' RETURNING client_id
)
DELETE FROM clients c USING j WHERE c.id = j.client_id;


-- ── 027: 'truck' access level — see NOTE at top if this line errors ───
ALTER TYPE access_level ADD VALUE IF NOT EXISTS 'truck';
