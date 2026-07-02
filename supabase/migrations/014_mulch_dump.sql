-- Mulch dump sites + dump log.
-- Sites are places that take our mulch (photos, dump instructions, contact,
-- agreed price per load). Crew log each dumped load; a Xero DRAFT invoice is
-- auto-generated per load (via the mulch-invoice edge function). Idempotent.

-- ── Dump sites ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mulch_sites (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,               -- label, e.g. "Dave's lifestyle block"
  address        TEXT,
  lat            NUMERIC(9,6),
  lng            NUMERIC(9,6),
  instructions   TEXT,                        -- where exactly to dump it
  photos         TEXT[] NOT NULL DEFAULT '{}',-- public URLs (mulch-media bucket)
  contact_name   TEXT,
  contact_phone  TEXT,
  contact_email  TEXT,
  price_per_load NUMERIC(10,2) NOT NULL DEFAULT 0,  -- ex GST, agreed price per load
  xero_contact_id TEXT,
  notes          TEXT,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mulch_sites_active ON mulch_sites(active);

-- ── Dump log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mulch_dumps (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES mulch_sites(id) ON DELETE CASCADE,
  dumped_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  dumped_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price               NUMERIC(10,2) NOT NULL DEFAULT 0,   -- snapshot of agreed price
  load_note           TEXT,
  photo_url           TEXT,
  invoice_status      TEXT NOT NULL DEFAULT 'pending',    -- 'pending'|'invoiced'|'error'|'skipped'
  invoice_error       TEXT,
  xero_invoice_id     TEXT,
  xero_invoice_number TEXT,
  xero_invoice_url    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mulch_dumps_site ON mulch_dumps(site_id, dumped_at);

DROP TRIGGER IF EXISTS set_updated_at_mulch_sites ON mulch_sites;
CREATE TRIGGER set_updated_at_mulch_sites BEFORE UPDATE ON mulch_sites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Storage bucket for site + dump photos ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('mulch-media', 'mulch-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mulch_media_public_read" ON storage.objects;
CREATE POLICY "mulch_media_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'mulch-media');

-- Any authenticated staff can upload (crew add dump photos; office add site photos).
DROP POLICY IF EXISTS "mulch_media_write" ON storage.objects;
CREATE POLICY "mulch_media_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'mulch-media');

DROP POLICY IF EXISTS "mulch_media_delete" ON storage.objects;
CREATE POLICY "mulch_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'mulch-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE mulch_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE mulch_dumps ENABLE ROW LEVEL SECURITY;

-- Sites: everyone reads (crew need to find them); office/full manage.
DROP POLICY IF EXISTS "mulch_sites_read" ON mulch_sites;
CREATE POLICY "mulch_sites_read" ON mulch_sites FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "mulch_sites_write" ON mulch_sites;
CREATE POLICY "mulch_sites_write" ON mulch_sites FOR ALL TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- Dumps: everyone reads; any staff can log a dump (as themselves); office/full can edit.
DROP POLICY IF EXISTS "mulch_dumps_read" ON mulch_dumps;
CREATE POLICY "mulch_dumps_read" ON mulch_dumps FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "mulch_dumps_insert" ON mulch_dumps;
CREATE POLICY "mulch_dumps_insert" ON mulch_dumps FOR INSERT TO authenticated
  WITH CHECK (dumped_by = auth.uid());

DROP POLICY IF EXISTS "mulch_dumps_update_office" ON mulch_dumps;
CREATE POLICY "mulch_dumps_update_office" ON mulch_dumps FOR UPDATE TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
