-- Meeting status for quote-run stops (audit F28 / F25).
-- Set by the office (Ashley) when booking a quote run in the Planner: every
-- stop gets an explicit "meeting the client" / "not meeting — quote from
-- street" choice before the run can be saved. Drives the crew/owner meeting
-- banner on the on-site quote view (F27) and the stop-card chip (F27a).
-- Nullable with no default on purpose — the value must be *decided* at
-- booking, never assumed; jobs outside a quote run simply stay NULL.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS meeting_status text
  CHECK (meeting_status IN ('meeting', 'not_meeting'));
