-- Add a 'truck' access level: a shared iPad login for a vehicle. Truck logins see
-- the calendar (their scheduled work) + the work orders it links to, plus Safety
-- and Chat — but not the jobs pipeline, planner, mulch, tools or job packs.
-- Individual-staff ('restricted') logins remain docs & chat only.
-- Run this on its own (ALTER TYPE ... ADD VALUE can't be used in the same
-- transaction that adds it — the SQL editor runs statements standalone, so fine).
ALTER TYPE access_level ADD VALUE IF NOT EXISTS 'truck';
