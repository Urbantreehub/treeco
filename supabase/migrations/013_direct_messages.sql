-- Direct (private) messages in chat.
-- Reuse the messages table: team messages have recipient_id = NULL (channel
-- 'team'); DMs set recipient_id and channel 'dm'. RLS is tightened so a DM is
-- only readable by its sender and recipient. Idempotent.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(recipient_id, user_id, created_at);

-- Replace the read-everything policy: team messages are public to staff;
-- direct messages only to the two participants.
DROP POLICY IF EXISTS "messages_read_all" ON messages;
DROP POLICY IF EXISTS "messages_read" ON messages;
CREATE POLICY "messages_read" ON messages
  FOR SELECT TO authenticated USING (
    recipient_id IS NULL          -- team channel
    OR user_id = auth.uid()       -- I sent it
    OR recipient_id = auth.uid()  -- it's addressed to me
  );

-- Insert policy (messages_insert_own: user_id = auth.uid()) and delete policy
-- from migration 012 are unchanged and still apply to DMs.

-- Staff directory for the chat picker. The users table RLS only lets full-access
-- users read other rows, so office/crew can't list teammates to DM. This
-- SECURITY DEFINER function exposes ONLY id + name of active staff (not email,
-- phone, or access level) to any authenticated user.
CREATE OR REPLACE FUNCTION list_staff()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, name FROM public.users WHERE active = TRUE ORDER BY name;
$$;
GRANT EXECUTE ON FUNCTION list_staff() TO authenticated;
