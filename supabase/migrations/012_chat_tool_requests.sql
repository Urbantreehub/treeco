-- Team chat + crew tool-replacement / wishlist requests.
-- messages: one shared 'team' channel (extensible to more channels later).
-- tool_requests: crew flag gear that needs replacing or wishlist items;
-- office/full manage them through a status workflow. All idempotent.

-- ── Team chat ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  channel    TEXT NOT NULL DEFAULT 'team',
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel, created_at);

-- ── Tool requests / wishlist ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL DEFAULT 'replace',    -- 'replace' | 'wishlist'
  item         TEXT NOT NULL,
  notes        TEXT,
  urgency      TEXT NOT NULL DEFAULT 'normal',      -- 'low' | 'normal' | 'high'
  status       TEXT NOT NULL DEFAULT 'requested',   -- 'requested'|'approved'|'ordered'|'done'|'declined'
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_requests_status ON tool_requests(status);
CREATE INDEX IF NOT EXISTS idx_tool_requests_by     ON tool_requests(requested_by);

DROP TRIGGER IF EXISTS set_updated_at_tool_requests ON tool_requests;
CREATE TRIGGER set_updated_at_tool_requests BEFORE UPDATE ON tool_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_requests ENABLE ROW LEVEL SECURITY;

-- Chat: any authenticated staff member can read + post (posts must be their own).
DROP POLICY IF EXISTS "messages_read_all" ON messages;
CREATE POLICY "messages_read_all" ON messages
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "messages_insert_own" ON messages;
CREATE POLICY "messages_insert_own" ON messages
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office')
  );

-- Tool requests: crew see + create their own; office/full see all + manage.
DROP POLICY IF EXISTS "tool_requests_select" ON tool_requests;
CREATE POLICY "tool_requests_select" ON tool_requests
  FOR SELECT TO authenticated USING (
    requested_by = auth.uid()
    OR (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office')
  );

DROP POLICY IF EXISTS "tool_requests_insert_own" ON tool_requests;
CREATE POLICY "tool_requests_insert_own" ON tool_requests
  FOR INSERT TO authenticated WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "tool_requests_update_office" ON tool_requests;
CREATE POLICY "tool_requests_update_office" ON tool_requests
  FOR UPDATE TO authenticated USING (
    (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office')
  );

-- ── Realtime ──────────────────────────────────────────────────────────────
-- Enable live updates for chat + request notifications. Guard against
-- re-adding (ADD TABLE errors if already a member of the publication).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tool_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE tool_requests;
  END IF;
END $$;
