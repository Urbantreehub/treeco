-- Crew Portal — Phase 2 access.
-- Lets a logged-in crew member (access_level not in full/office) see and add ONLY
-- their own staff records, read the shared safety docs, and upload IDs/photos to
-- their own private storage folder. Office/full retain full management via the
-- existing policies from migration 006.

-- ── staff_records: crew read + add their OWN rows ────────────────────────────
DROP POLICY IF EXISTS "staff_records_self_read" ON staff_records;
CREATE POLICY "staff_records_self_read" ON staff_records FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Crew may add records (e.g. an uploaded ID) against themselves, but not edit or
-- delete existing ones — verification/removal stays with the office.
DROP POLICY IF EXISTS "staff_records_self_insert" ON staff_records;
CREATE POLICY "staff_records_self_insert" ON staff_records FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── safety_documents: everyone signed-in can READ (crew view H&S docs) ───────
-- Management (insert/update/delete) stays office/full via safety_docs_staff.
DROP POLICY IF EXISTS "safety_docs_read_auth" ON safety_documents;
CREATE POLICY "safety_docs_read_auth" ON safety_documents FOR SELECT TO authenticated
  USING (true);

-- ── Private bucket for crew self-uploads (IDs, tickets, photos) ──────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-uploads', 'staff-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- Each user owns the folder named after their uid: `<auth.uid()>/<file>`.
DROP POLICY IF EXISTS "staff_uploads_own" ON storage.objects;
CREATE POLICY "staff_uploads_own" ON storage.objects FOR ALL TO authenticated
  USING      (bucket_id = 'staff-uploads' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'staff-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Office/full can view every crew member's uploads.
DROP POLICY IF EXISTS "staff_uploads_staff_read" ON storage.objects;
CREATE POLICY "staff_uploads_staff_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'staff-uploads' AND (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));
