-- TreeCo — Phase 1 Database Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE job_status AS ENUM (
  'new_lead',
  'quote_scheduled',
  'quote_sent',
  'accepted_to_schedule',
  'scheduled',
  'stump_grinding',
  'complete_to_invoice',
  'invoiced',
  'on_hold'
);

CREATE TYPE access_level AS ENUM ('full', 'restricted');

CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined');

-- ============================================================
-- USERS
-- Extends Supabase auth.users — one row per authenticated user
-- ============================================================

CREATE TABLE users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  access_level  access_level NOT NULL DEFAULT 'restricted',
  avatar_url    TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile row when a new auth user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- CLIENTS
-- ============================================================

CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- JOBS
-- Core entity — everything links back to a job
-- ============================================================

CREATE TABLE jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  address           TEXT,
  job_type          TEXT,            -- e.g. 'pruning', 'removal', 'stump_grinding', 'emergency'
  description       TEXT,
  status            job_status NOT NULL DEFAULT 'new_lead',
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estimated_value   NUMERIC(10,2),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTES
-- ============================================================

CREATE TABLE quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  status            quote_status NOT NULL DEFAULT 'draft',
  line_items        JSONB NOT NULL DEFAULT '[]',
  -- line_items structure:
  -- [{id, description, qty, rate, optional, selected, image_url, sort_order}]
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  gst               NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  client_view_token TEXT UNIQUE,     -- random hex token for public link
  sent_at           TIMESTAMPTZ,
  viewed_at         TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  decline_reason    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SCHEDULE
-- Links jobs to calendar slots and crew assignments
-- ============================================================

CREATE TABLE schedule (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  assigned_to UUID[] NOT NULL DEFAULT '{}',   -- array of user IDs
  date        DATE NOT NULL,
  start_time  TIME,
  end_time    TIME,
  status      job_status,                     -- mirrors job status for calendar colour
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- JOB PHOTOS
-- ============================================================

CREATE TABLE job_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_client_id ON jobs(client_id);
CREATE INDEX idx_schedule_date ON schedule(date);
CREATE INDEX idx_schedule_job_id ON schedule(job_id);
CREATE INDEX idx_quotes_job_id ON quotes(job_id);
CREATE INDEX idx_quotes_token ON quotes(client_view_token);
CREATE INDEX idx_job_photos_job_id ON job_photos(job_id);

-- ============================================================
-- UPDATED_AT TRIGGER (auto-update timestamp on row change)
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_clients  BEFORE UPDATE ON clients  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_jobs     BEFORE UPDATE ON jobs     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_quotes   BEFORE UPDATE ON quotes   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at_schedule BEFORE UPDATE ON schedule FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

-- Users: can read own row; full access users can read all
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (
    auth.uid() = id
    OR (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- Clients: full access only
CREATE POLICY "clients_full_access_only" ON clients
  FOR ALL USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

-- Jobs: full access = all; restricted = only their scheduled jobs
CREATE POLICY "jobs_full_access" ON jobs
  FOR ALL USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

CREATE POLICY "jobs_restricted_select" ON jobs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM schedule
      WHERE schedule.job_id = jobs.id
        AND auth.uid() = ANY(schedule.assigned_to)
    )
  );

-- Quotes: full access only
CREATE POLICY "quotes_full_access_only" ON quotes
  FOR ALL USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

-- Schedule: full access = all; restricted = only entries they're assigned to
CREATE POLICY "schedule_full_access" ON schedule
  FOR ALL USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

CREATE POLICY "schedule_restricted_select" ON schedule
  FOR SELECT USING (
    auth.uid() = ANY(assigned_to)
  );

-- Job photos: full access = all; restricted = only photos on their assigned jobs
CREATE POLICY "photos_full_access" ON job_photos
  FOR ALL USING (
    (SELECT access_level FROM users WHERE id = auth.uid()) = 'full'
  );

CREATE POLICY "photos_restricted_select" ON job_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM schedule
      WHERE schedule.job_id = job_photos.job_id
        AND auth.uid() = ANY(schedule.assigned_to)
    )
  );

CREATE POLICY "photos_restricted_insert" ON job_photos
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM schedule
      WHERE schedule.job_id = job_photos.job_id
        AND auth.uid() = ANY(schedule.assigned_to)
    )
  );
