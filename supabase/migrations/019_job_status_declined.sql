-- Add 'declined' to the job_status enum.
--
-- The frontend has offered "Decline" as a job transition since the pipeline was
-- built (statuses.js, JobDetailPanel FORWARD_ACTIONS) and QuoteView writes
-- jobs.status = 'declined' when a client declines a quote — but the value was
-- never added to the enum, so every one of those writes fails at the DB.
-- 'declined' existed only on quote_status, which is a different type.
--
-- Kept in its own migration: ALTER TYPE ... ADD VALUE cannot be used by other
-- statements in the same transaction, so anything referencing 'declined'
-- must land in a later migration.

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'declined';
