-- 039_resources_availability.sql
-- Trucks, equipment, people-on-trucks and leave — the scheduler's world model.
--
-- Until now the calendar lanes were a hard-coded list in Calendar.jsx
-- ('josh', 'isuzu', 'nissan', 'stump', 'unassigned'), re-declared with
-- different labels in Dashboard.jsx and Settings.jsx (audit §3). One person
-- was mixed in with three vehicles, "stump" was really the Navara ute with the
-- grinder on the back, and there was no notion of who is on which truck on a
-- given day or who is away. This migration makes all of that data:
--
--   resources         — lanes: trucks, equipment and Josh's quote-visit lane
--   schedule.equipment_ids — what a scheduled job takes along (Avant, grinder)
--   crew_assignments  — who rides which truck on which day (independent of jobs)
--   availability      — leave / sick / part-day per person per day
--   users.default_view — the landing view a full-access user prefers
--
-- schedule.resource_id stays free text (no FK) on purpose: 'unassigned' is a
-- valid lane in the UI and never a row here. Idempotent and safe to re-run.

-- ── resources ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
  id      TEXT PRIMARY KEY,                       -- short slug used by schedule.resource_id / users.resource_id
  name    TEXT NOT NULL,
  kind    TEXT NOT NULL CHECK (kind IN ('truck','equipment','person')),
  color   TEXT,                                   -- lane colour (hex)
  sort    INT  NOT NULL DEFAULT 0,                -- lane order, top to bottom
  active  BOOLEAN NOT NULL DEFAULT TRUE,          -- inactive = hidden from the calendar, kept for history
  note    TEXT
);

INSERT INTO resources (id, name, kind, color, sort, active, note) VALUES
  ('josh',    'Josh · quote visits', 'person',    '#4A6741', 0, true, 'Quote runs on Tuesday and Thursday'),
  ('isuzu',   'Isuzu',               'truck',     '#4A7FA5', 1, true, 'small truck'),
  ('nissan',  'Nissan',              'truck',     '#6D4AA8', 2, true, 'big truck'),
  ('navara',  'Navara',              'truck',     '#8B6238', 3, true, 'ute — carries the Avant or the grinder'),
  ('avant',   'Avant',               'equipment', '#8B6238', 4, true, NULL),
  ('grinder', 'Grinder',             'equipment', '#8B6238', 5, true, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Every signed-in user reads the lane list (the truck iPad needs its own lane
-- name/colour; crew see it in the day sheet). Only full access edits it.
DROP POLICY IF EXISTS "resources_read_auth" ON resources;
CREATE POLICY "resources_read_auth" ON resources
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "resources_full_write" ON resources;
CREATE POLICY "resources_full_write" ON resources
  FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) = 'full')
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) = 'full');

-- ── schedule.equipment_ids ──────────────────────────────────────────────────
-- Equipment a scheduled job takes along, as resource ids ('avant', 'grinder').
-- Kept as an array rather than a join table: a job carries at most a couple of
-- items and the calendar renders them as chips on the block.
ALTER TABLE schedule ADD COLUMN IF NOT EXISTS equipment_ids TEXT[] NOT NULL DEFAULT '{}';

-- Data fix: the old 'stump' lane was the Navara with the grinder. Move those
-- blocks onto the Navara lane and record the grinder as its equipment. The
-- users row for the stump-grinding login (if any) follows the lane.
UPDATE schedule SET resource_id = 'navara', equipment_ids = ARRAY['grinder']
  WHERE resource_id = 'stump';
UPDATE users SET resource_id = 'navara'
  WHERE resource_id = 'stump';

-- ── crew_assignments ────────────────────────────────────────────────────────
-- Who is on which truck on a given day. Independent of jobs: the office sets
-- the crews up for the week, then drags jobs onto trucks. One row per person
-- per truck per day.
CREATE TABLE IF NOT EXISTS crew_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id TEXT NOT NULL REFERENCES resources(id),
  date        DATE NOT NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (resource_id, date, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_assignments_date ON crew_assignments(date);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_user ON crew_assignments(user_id, date);

ALTER TABLE crew_assignments ENABLE ROW LEVEL SECURITY;

-- Office/full manage the roster; truck and crew logins read it (the truck
-- iPad shows today's crew, a crew member sees which truck they're on).
DROP POLICY IF EXISTS "crew_assignments_staff_all" ON crew_assignments;
CREATE POLICY "crew_assignments_staff_all" ON crew_assignments
  FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "crew_assignments_crew_read" ON crew_assignments;
CREATE POLICY "crew_assignments_crew_read" ON crew_assignments
  FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('truck','restricted'));

-- ── availability ────────────────────────────────────────────────────────────
-- A person's day off. The scheduler greys them out of the crew picker and
-- warns if they're already on a truck that day. One row per person per day;
-- 'part_day' carries the detail in `note` ("out from 1pm").
CREATE TABLE IF NOT EXISTS availability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('leave','sick','part_day','other')),
  note        TEXT,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);

ALTER TABLE availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "availability_staff_all" ON availability;
CREATE POLICY "availability_staff_all" ON availability
  FOR ALL TO authenticated
  USING      ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'))
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- Everyone can see their own leave (crew portal "my days off").
DROP POLICY IF EXISTS "availability_self_read" ON availability;
CREATE POLICY "availability_self_read" ON availability
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── users.default_view ──────────────────────────────────────────────────────
-- Which app a user lands in: 'quoting' (Josh's quote-first view) or 'full'
-- (the office view). NULL = let the app pick (full access → quoting,
-- office → full). Users may already update their own row (users_update_own).
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_view TEXT
  CHECK (default_view IN ('quoting','full'));
