-- Quote attribution, version history, acceptance audit, client Q&A, and a
-- reusable template/item library.
--
-- Context: until now the quotes table recorded nothing about WHO did anything.
-- There was no created_by/updated_by (jobs has created_by; quotes never did),
-- no snapshot of a quote before it was edited, and the only acceptance evidence
-- was a responded_at timestamp. An accepted quote could be silently rewritten in
-- place, against the same live client link.

-- ── 1. Attribution ───────────────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sent_by    UUID REFERENCES users(id) ON DELETE SET NULL;

-- ── 2. Acceptance audit ──────────────────────────────────────────────────
-- accepted_via distinguishes a genuine client acceptance from one a staff member
-- recorded on their behalf. Quotient signals this only by the ABSENCE of a
-- fingerprint, which is easy to miss — here it is an explicit, queryable value.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_via     TEXT
  CHECK (accepted_via IS NULL OR accepted_via IN ('client', 'on_behalf'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_by      UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS on_behalf_reason TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accept_ip        TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accept_user_agent TEXT;
-- Frozen copy of exactly what the client agreed to. Never mutated by later
-- edits — this is the record Quotient destroys when you undo an acceptance.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS accepted_snapshot JSONB;

COMMENT ON COLUMN quotes.accepted_snapshot IS
  'Immutable {line_items, subtotal, gst, total, accepted_at} captured at acceptance. Survives later edits.';

-- ── 3. Version history ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  version_no  INTEGER NOT NULL,
  -- Snapshot of the quote as it stood BEFORE the change this row records.
  line_items  JSONB NOT NULL DEFAULT '[]',
  subtotal    NUMERIC(10,2) NOT NULL DEFAULT 0,
  gst         NUMERIC(10,2) NOT NULL DEFAULT 0,
  total       NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  status      quote_status,
  reason      TEXT,        -- 'sent' | 'edit_offline' | 'accepted' | 'declined' | 'manual'
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quote_id, version_no)
);
CREATE INDEX IF NOT EXISTS quote_versions_quote_idx ON quote_versions(quote_id, version_no DESC);

-- Unlike Quotient's 12-month retention, versions here are kept indefinitely —
-- the accepted snapshot in particular is the record of what was agreed.

-- ── 4. Client questions / comments ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id   UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  author     TEXT NOT NULL CHECK (author IN ('client', 'staff')),
  author_id  UUID REFERENCES users(id) ON DELETE SET NULL,  -- null for client
  body       TEXT NOT NULL,
  -- Staff-only notes never shown on the client page.
  private    BOOLEAN NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_comments_quote_idx ON quote_comments(quote_id, created_at);

-- ── 5. Template / saved item library ─────────────────────────────────────
-- Reusable line items, so a quote isn't rebuilt from scratch each time. The
-- 19-code SOR rate card stays as-is; this sits alongside it for the common
-- residential work that has no SOR code.
CREATE TABLE IF NOT EXISTS quote_items_library (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  detail      TEXT,
  rate        NUMERIC(10,2),          -- ex-GST, as everywhere internally
  category    TEXT,
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS quote_items_library_desc_idx ON quote_items_library(description);

CREATE TABLE IF NOT EXISTS quote_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  line_items  JSONB NOT NULL DEFAULT '[]',
  notes       TEXT,
  use_count   INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. RLS ───────────────────────────────────────────────────────────────
-- Same shape as the existing quotes policies: full + office get everything.
-- No anon policies — the public quote page reaches these through SECURITY
-- DEFINER RPCs in 023, never directly.
ALTER TABLE quote_versions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_versions', 'quote_comments', 'quote_items_library', 'quote_templates']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_staff', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I FOR ALL TO authenticated
        USING      ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
        WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
    $f$, t || '_staff', t);
  END LOOP;
END $$;

-- Reuse the existing updated_at trigger function for templates.
DROP TRIGGER IF EXISTS set_updated_at_quote_templates ON quote_templates;
CREATE TRIGGER set_updated_at_quote_templates
  BEFORE UPDATE ON quote_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
