-- Email lead intake — supports the inbound-lead edge function + QuoteReference component.
-- Inbound emails (via Postmark webhook) create a client + a 'new_lead' job, store any
-- image attachments in the public 'job-media' bucket, and record them as job_photos
-- rows with kind = 'lead_reference'. The lead-reference data (images + directions +
-- work_specs + enquiry_raw) is later surfaced read-only inside the Quote Builder.

-- ── jobs: lead-intake columns ────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS directions   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_specs   TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS enquiry_raw  TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_source  TEXT;

-- ── job_photos: classify photos (lead_reference / site / completion) ─────
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'reference';
CREATE INDEX IF NOT EXISTS idx_job_photos_kind ON job_photos(job_id, kind);

-- ── Public storage bucket for job media (lead images, site photos, etc.) ─
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-media', 'job-media', true)
ON CONFLICT (id) DO NOTHING;

-- Public read of job-media objects (bucket is public); write restricted to
-- authenticated full/office users. Mirrors the safety_bucket_rw pattern (migration 006).
DROP POLICY IF EXISTS "job_media_public_read" ON storage.objects;
CREATE POLICY "job_media_public_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'job-media');

DROP POLICY IF EXISTS "job_media_write" ON storage.objects;
CREATE POLICY "job_media_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "job_media_update" ON storage.objects;
CREATE POLICY "job_media_update" ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'job-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK (bucket_id = 'job-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "job_media_delete" ON storage.objects;
CREATE POLICY "job_media_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'job-media' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- ── job_photos RLS: full/office may SELECT + INSERT ──────────────────────
-- Enable RLS (no-op if already enabled) and (re)create the office read/write policies.
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_photos_select" ON job_photos;
CREATE POLICY "job_photos_select" ON job_photos FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "job_photos_insert" ON job_photos;
CREATE POLICY "job_photos_insert" ON job_photos FOR INSERT TO authenticated
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
