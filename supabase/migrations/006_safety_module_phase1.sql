-- Safety & Compliance module — Phase 1: vaults & registers
-- Three tables: versioned document library, per-staff records, company documents.
-- Access: full + office (not crew), matching the existing office data-access pattern.

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE safety_doc_type   AS ENUM ('swms','sop','sssp','policy','procedure','register','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE safety_doc_status AS ENUM ('draft','active','superseded','archived'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE staff_record_type AS ENUM ('qualification','licence','moj','drug_test','asbestos','employment_agreement','id_document','medical','induction','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE company_doc_type  AS ENUM ('insurance','certificate','registration','prequalification','policy','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── 1. Versioned document library (SWMS / SOP / SSSP / policies) ──────────
CREATE TABLE IF NOT EXISTS safety_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type       safety_doc_type   NOT NULL,
  title          TEXT              NOT NULL,
  reference      TEXT,
  version        INT               NOT NULL DEFAULT 1,
  status         safety_doc_status NOT NULL DEFAULT 'draft',
  body           JSONB             NOT NULL DEFAULT '{}',
  file_url       TEXT,
  effective_date DATE,
  review_date    DATE,
  supersedes_id  UUID REFERENCES safety_documents(id) ON DELETE SET NULL,
  tags           TEXT[]            NOT NULL DEFAULT '{}',
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── 2. Per-staff records (quals, MOJ, drug test, asbestos, agreements, ID) ─
CREATE TABLE IF NOT EXISTS staff_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  staff_name   TEXT,                          -- for staff not yet in users table
  record_type  staff_record_type NOT NULL,
  title        TEXT              NOT NULL,
  reference    TEXT,
  file_url     TEXT,
  issued_date  DATE,
  expiry_date  DATE,
  verified     BOOLEAN           NOT NULL DEFAULT FALSE,
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- ── 3. Company documents (insurances, certs, prequal) ────────────────────
CREATE TABLE IF NOT EXISTS company_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type       company_doc_type NOT NULL,
  title          TEXT             NOT NULL,
  issuer         TEXT,
  reference      TEXT,
  file_url       TEXT,
  effective_date DATE,
  expiry_date    DATE,
  notes          TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_safety_docs_type    ON safety_documents(doc_type, status);
CREATE INDEX IF NOT EXISTS idx_safety_docs_review   ON safety_documents(review_date);
CREATE INDEX IF NOT EXISTS idx_staff_records_user   ON staff_records(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_records_expiry ON staff_records(expiry_date);
CREATE INDEX IF NOT EXISTS idx_company_docs_expiry  ON company_documents(expiry_date);

-- ── updated_at triggers (reuse existing set_updated_at function) ─────────
DROP TRIGGER IF EXISTS set_updated_at_safety_documents ON safety_documents;
CREATE TRIGGER set_updated_at_safety_documents BEFORE UPDATE ON safety_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_staff_records ON staff_records;
CREATE TRIGGER set_updated_at_staff_records BEFORE UPDATE ON staff_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_company_documents ON company_documents;
CREATE TRIGGER set_updated_at_company_documents BEFORE UPDATE ON company_documents FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS — full + office only ─────────────────────────────────────────────
ALTER TABLE safety_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_docs_staff"   ON safety_documents;
CREATE POLICY "safety_docs_staff"  ON safety_documents  FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "staff_records_staff" ON staff_records;
CREATE POLICY "staff_records_staff" ON staff_records   FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "company_docs_staff"  ON company_documents;
CREATE POLICY "company_docs_staff" ON company_documents FOR ALL TO authenticated
  USING      ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office'));

-- ── Private storage bucket for safety files + access policy ───────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('safety', 'safety', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "safety_bucket_rw" ON storage.objects;
CREATE POLICY "safety_bucket_rw" ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'safety' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK (bucket_id = 'safety' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
