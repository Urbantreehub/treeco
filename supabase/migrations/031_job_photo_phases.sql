-- Before / During / After photo documentation for Spencers & Downer jobs.
--
-- The crew Work Order captures per-line-item Before/During/After photos and a
-- set of extra site photos. These were previously localStorage-only (stuck on
-- one device, invisible to the office, and impossible to push to the portal).
-- Persist them to job_photos so the office sees them in the quote/job, they
-- survive a device change, and they can be attached to the portal push.
--
-- Existing job_photos RLS already lets full/office do everything and lets an
-- assigned crew member SELECT + INSERT rows for their own jobs
-- (photos_restricted_select / photos_restricted_insert, uploaded_by = auth.uid()),
-- so no policy changes are needed — only the two new columns.

ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS phase    TEXT;  -- before | during | after | extra
ALTER TABLE job_photos ADD COLUMN IF NOT EXISTS line_ref TEXT;  -- quote line_item id this documents; NULL = job-level extra

-- Fast lookup of a job's photos by phase for the completion gate + portal push.
CREATE INDEX IF NOT EXISTS idx_job_photos_phase ON job_photos(job_id, phase);
