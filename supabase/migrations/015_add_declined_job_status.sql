-- Fix C2: the app defines a 'declined' job status (config/statuses.js) but the
-- job_status enum never included it, so declining a job (from the office
-- dropdown or a client declining a quote) failed at the database.
--
-- Must be its own migration: a newly-added enum value cannot be *used* in the
-- same transaction that adds it, so later migrations (017) can reference it.
ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'declined';
