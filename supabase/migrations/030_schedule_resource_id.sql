-- Calendar resource assignment for scheduled jobs.
-- The scheduler's resource-timeline (FullCalendar) assigns each job to a
-- "resource" — a staff member or truck — identified by a short text id
-- ('josh', 'isuzu', 'nissan', 'stump', 'unassigned'). Dragging a job onto a
-- truck lane, or between lanes, writes that id to schedule.resource_id.
--
-- Without this column, every drag/drop 400s with:
--   "Could not find the resource_id column of 'schedule' in the schema cache"
--
-- resource_id already lives on `users` (a crew member's default calendar
-- resource), but was added directly in the live DB and never captured in a
-- migration — AuthContext selects `*` precisely to tolerate that drift. This
-- migration adds it to `schedule` (the fix) and catches `users` up so the
-- schema is reproducible from scratch. All idempotent.

ALTER TABLE schedule ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS resource_id TEXT;

-- Day/week views filter the lane list by resource for a given date.
CREATE INDEX IF NOT EXISTS idx_schedule_resource_id ON schedule(resource_id);
