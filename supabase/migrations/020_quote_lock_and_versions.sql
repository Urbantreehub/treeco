-- 020_quote_lock_and_versions.sql
-- Locks accepted quotes against silent edits and records a version history.
--
-- Two guarantees:
--   1. Once a quote is accepted/complete/invoiced, its pricing, line items and
--      client-facing terms cannot be changed while it stays in that status.
--      Lifecycle transitions (accepted -> complete -> invoiced) and reopening
--      (back to sent/draft/declined) are still allowed.
--   2. A snapshot of the quote is captured whenever it is accepted, and whenever
--      it is reopened out of a locked status — so the state the client agreed to
--      is preserved even after later edits.

-- ── Version history table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id      UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_no    INT  NOT NULL,
  status        TEXT,                     -- quote status at snapshot time
  line_items    JSONB NOT NULL DEFAULT '[]',
  subtotal      NUMERIC(10,2),
  gst           NUMERIC(10,2),
  total         NUMERIC(10,2),
  notes         TEXT,
  private_notes TEXT,
  reason        TEXT,                     -- 'accepted' | 'reopened'
  snapshot_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quote_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_quote_versions_quote ON quote_versions(quote_id);

ALTER TABLE quote_versions ENABLE ROW LEVEL SECURITY;

-- Full-access staff can read version history. Rows are only ever written by the
-- SECURITY DEFINER snapshot function below, so no INSERT policy is needed.
DROP POLICY IF EXISTS "quote_versions_full_access" ON quote_versions;
CREATE POLICY "quote_versions_full_access" ON quote_versions
  FOR SELECT USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

-- ── Snapshot helper ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so trigger-driven inserts bypass RLS regardless of who is
-- performing the update (staff, or the anon respond_to_quote RPC).
CREATE OR REPLACE FUNCTION snapshot_quote_version(p_quote quotes, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no INT;
BEGIN
  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_no
    FROM quote_versions WHERE quote_id = p_quote.id;
  INSERT INTO quote_versions
    (quote_id, version_no, status, line_items, subtotal, gst, total, notes, private_notes, reason, snapshot_by)
  VALUES
    (p_quote.id, v_no, p_quote.status::text, p_quote.line_items, p_quote.subtotal,
     p_quote.gst, p_quote.total, p_quote.notes, p_quote.private_notes, p_reason, p_quote.updated_by);
END;
$$;

-- ── Lock enforcement (BEFORE UPDATE) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_quote_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  locked quote_status[] := ARRAY['accepted','complete','invoiced']::quote_status[];
BEGIN
  -- Guard only when the quote stays in the SAME locked status. Progressing the
  -- lifecycle (accepted -> complete -> invoiced) or reopening (to sent/draft/
  -- declined) is always permitted; those are how a quote legitimately changes.
  IF OLD.status = ANY(locked) AND NEW.status = OLD.status THEN
    IF NEW.line_items IS DISTINCT FROM OLD.line_items
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.gst      IS DISTINCT FROM OLD.gst
       OR NEW.total    IS DISTINCT FROM OLD.total
       OR NEW.notes    IS DISTINCT FROM OLD.notes THEN
      RAISE EXCEPTION 'Quote is % and locked — reopen it before changing pricing, line items or terms.', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_quote_lock ON quotes;
CREATE TRIGGER trg_enforce_quote_lock
  BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION enforce_quote_lock();

-- ── Version snapshots (AFTER UPDATE) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION quote_version_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  locked quote_status[] := ARRAY['accepted','complete','invoiced']::quote_status[];
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    -- Freeze what the client agreed to.
    PERFORM snapshot_quote_version(NEW, 'accepted');
  ELSIF OLD.status = ANY(locked) AND NOT (NEW.status = ANY(locked)) THEN
    -- Reopened for editing — preserve the locked state being left behind.
    PERFORM snapshot_quote_version(OLD, 'reopened');
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_version ON quotes;
CREATE TRIGGER trg_quote_version
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION quote_version_on_change();
