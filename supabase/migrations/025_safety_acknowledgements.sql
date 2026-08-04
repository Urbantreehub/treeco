-- Safety sign-off / acknowledgement register.
-- One signature = "I have read & understood the CURRENT SWMS, SOPs and H&S policies".
-- doc_snapshot captures the exact doc list + versions at the moment of signing, so
-- an acknowledgement stays meaningful even after the docs are later revised.
-- Kiosk mode: signed on one staff (full/office) device — that session inserts rows
-- for each crew member picked. Phase 2: crew sign under their own login (self-insert).

CREATE TABLE IF NOT EXISTS safety_acknowledgements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = signer not yet a user
  signer_name    TEXT        NOT NULL,
  scope          TEXT        NOT NULL DEFAULT 'all',            -- 'all' = whole current pack
  doc_snapshot   JSONB       NOT NULL DEFAULT '{}',             -- { swms:n, sop:n, policy:n, docs:[{type,title,version}] }
  statement      TEXT,                                          -- the exact wording they agreed to
  signature_data TEXT,                                          -- data URL of the drawn signature (nullable)
  meeting_ref    TEXT,                                          -- groups a toolbox, e.g. 'Toolbox 31 Jul 2026'
  signed_by      UUID REFERENCES users(id) ON DELETE SET NULL,  -- the logged-in device operator (audit trail)
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_ack_user    ON safety_acknowledgements(user_id);
CREATE INDEX IF NOT EXISTS idx_safety_ack_meeting ON safety_acknowledgements(meeting_ref);
CREATE INDEX IF NOT EXISTS idx_safety_ack_signed  ON safety_acknowledgements(signed_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- staff (full/office) manage everything (covers kiosk inserts for other crew);
-- everyone else may insert/read only their OWN acknowledgement (Phase 2 self sign-off).
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
