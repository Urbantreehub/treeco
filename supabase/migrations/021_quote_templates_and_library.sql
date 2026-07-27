-- 021_quote_templates_and_library.sql
-- Reusable content for faster, consistent quoting:
--   * saved_items      — a price-item library (single reusable line items)
--   * quote_templates  — named collections of line items + default terms
--
-- Both are full-access-only, mirroring the quotes/clients RLS, and reuse the
-- shared set_updated_at() trigger defined in schema.sql.

-- ── Price-item library ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  detail      TEXT,                         -- optional longer description
  rate        NUMERIC(10,2) NOT NULL DEFAULT 0,
  category    TEXT,                          -- optional grouping (Removal, Pruning, Stump…)
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Quote templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quote_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,                          -- internal note: when to use it
  line_items  JSONB NOT NULL DEFAULT '[]',   -- same shape as quotes.line_items
  notes       TEXT,                          -- default client-facing terms
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_items_category ON saved_items(category);

-- ── updated_at triggers (reuse schema.sql helper) ───────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_saved_items ON saved_items;
CREATE TRIGGER set_updated_at_saved_items
  BEFORE UPDATE ON saved_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_quote_templates ON quote_templates;
CREATE TRIGGER set_updated_at_quote_templates
  BEFORE UPDATE ON quote_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: full-access staff only ─────────────────────────────────────────────
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_items_full_access" ON saved_items;
CREATE POLICY "saved_items_full_access" ON saved_items
  FOR ALL USING ((SELECT access_level FROM users WHERE id = auth.uid()) = 'full');

DROP POLICY IF EXISTS "quote_templates_full_access" ON quote_templates;
CREATE POLICY "quote_templates_full_access" ON quote_templates
  FOR ALL USING ((SELECT access_level FROM users WHERE id = auth.uid()) = 'full');
