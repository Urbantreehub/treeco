-- 038_job_activity.sql
-- One unified activity feed per job.
--
-- Today the "what happened on this job" story is scattered: quote_events only
-- ever records opens (029), quote_comments holds the thread (022), job_photos
-- the crew documentation (031), job_alerts the office to-do list (032/034/035),
-- and everything else is *derived* from timestamps on quotes (sent_at,
-- responded_at, followup_count). The redesigned job record shows a single
-- chronological feed, so this migration adds `job_activity` and a set of
-- SECURITY DEFINER triggers that append to it whenever any of those source
-- tables change — no matter who made the change (staff UI, truck iPad, the
-- anon client RPCs, portal sync via service_role, or a follow-up cron).
--
-- Rules of the road for the triggers:
--   * They are AFTER triggers and always RETURN NULL — they never alter the
--     row that fired them.
--   * Every body is wrapped in an EXCEPTION handler that downgrades a failure
--     to a WARNING. The feed is a *record* of a change, never a reason a change
--     can't happen.
--   * They only ever INSERT into job_activity, and nothing writes back to the
--     source tables, so there is no re-entrancy to guard against. (The jobs
--     lifecycle trigger from 034 inserts job_alerts, which in turn appends an
--     'alert' row here — that is the intended one-hop chain, not a loop.)
--
-- Also extends the quote version history (020) so a snapshot is taken when a
-- sent/viewed quote is edited — previously edits between sends created no
-- version at all (audit §3).
--
-- Idempotent and safe to re-run.

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id)   ON DELETE CASCADE,
  quote_id    UUID          REFERENCES quotes(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN (
                'lead','visit_booked','sent','opened','followed_up','edited',
                'accepted','declined','comment','reply','note','photo','status',
                'scheduled','unscheduled','invoiced','portal','alert')),
  actor_type  TEXT NOT NULL DEFAULT 'system'
                CHECK (actor_type IN ('staff','client','system','portal')),
  actor_id    UUID,                                  -- users.id when actor_type = 'staff'
  actor_name  TEXT,                                  -- display name (staff name, client name, portal)
  body        TEXT,                                  -- free text: comment/note body, decline reason, alert detail
  meta        JSONB NOT NULL DEFAULT '{}',           -- kind-specific payload (see docs/redesign/research/05-database-changes.md)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The feed is always read newest-first for one job.
CREATE INDEX IF NOT EXISTS idx_job_activity_job ON job_activity(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_activity_quote ON job_activity(quote_id) WHERE quote_id IS NOT NULL;

ALTER TABLE job_activity ENABLE ROW LEVEL SECURITY;

-- ── Visibility helper ───────────────────────────────────────────────────────
-- Can the calling user see this job's feed?
--   full / office  → every job
--   truck / restricted → jobs with a schedule row they're assigned to
--                        (auth.uid() = ANY(assigned_to), as in 033), OR whose
--                        schedule lane matches their users.resource_id. The
--                        second arm exists because the frontend never writes
--                        assigned_to (audit §3) — the truck iPad is identified
--                        by its resource lane, so that is what we key on too.
-- SECURITY DEFINER so the policy can look at users/schedule without tripping
-- over their own RLS. STABLE so the planner can cache it per statement.
CREATE OR REPLACE FUNCTION job_activity_visible(p_job_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() IS NULL THEN FALSE
      WHEN (SELECT access_level FROM users WHERE id = auth.uid()) IN ('full','office') THEN TRUE
      ELSE EXISTS (
        SELECT 1
        FROM schedule s
        WHERE s.job_id = p_job_id
          AND (
            auth.uid() = ANY(s.assigned_to)
            OR (s.resource_id IS NOT NULL
                AND s.resource_id = (SELECT resource_id FROM users WHERE id = auth.uid()))
          )
      )
    END;
$$;
GRANT EXECUTE ON FUNCTION job_activity_visible(UUID) TO authenticated;

-- Full/office read everything and may insert (notes, replies — any kind; the
-- add_job_note RPC in 040 is the intended path, but a direct insert is allowed).
DROP POLICY IF EXISTS "job_activity_staff_select" ON job_activity;
CREATE POLICY "job_activity_staff_select" ON job_activity
  FOR SELECT TO authenticated
  USING ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

DROP POLICY IF EXISTS "job_activity_staff_insert" ON job_activity;
CREATE POLICY "job_activity_staff_insert" ON job_activity
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('full','office'));

-- Truck / restricted: read the feed for jobs they're on. No insert — they add
-- notes through add_job_note (040), which checks the same visibility rule.
DROP POLICY IF EXISTS "job_activity_crew_select" ON job_activity;
CREATE POLICY "job_activity_crew_select" ON job_activity
  FOR SELECT TO authenticated
  USING (
    (SELECT access_level FROM public.users WHERE id = auth.uid()) IN ('truck','restricted')
    AND job_activity_visible(job_id)
  );

-- anon: no policy → no access. Client-facing views of the thread keep going
-- through the token-keyed RPCs in 022/028.

-- ── Realtime ────────────────────────────────────────────────────────────────
-- The job record subscribes to its own feed so an open/accept/comment shows up
-- without a refresh. Same guard as 012 (ADD TABLE errors if already a member).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'job_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE job_activity;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'supabase_realtime publication not available — job_activity realtime skipped (%).', SQLERRM;
END $$;

-- ── Actor helper ────────────────────────────────────────────────────────────
-- Who is making this change? Staff writes from the app carry a JWT so
-- auth.uid() resolves to a users row; the anon client RPCs, service_role sync
-- workers and cron jobs don't. p_fallback_id lets a trigger pass a column
-- like quotes.updated_by / job_photos.uploaded_by when there is no JWT.
CREATE OR REPLACE FUNCTION job_activity_actor(p_fallback_id UUID DEFAULT NULL,
                                              OUT actor_type TEXT,
                                              OUT actor_id   UUID,
                                              OUT actor_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID := COALESCE(auth.uid(), p_fallback_id);
BEGIN
  actor_type := 'system';
  actor_id   := NULL;
  actor_name := NULL;
  IF v_id IS NOT NULL THEN
    SELECT 'staff', u.id, u.name INTO actor_type, actor_id, actor_name
      FROM users u WHERE u.id = v_id;
    IF NOT FOUND THEN
      actor_type := 'system';
    END IF;
  END IF;
END;
$$;

-- Client display name for a quote (used for accept/decline/open rows).
CREATE OR REPLACE FUNCTION job_activity_client_name(p_job_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.name FROM jobs j LEFT JOIN clients c ON c.id = j.client_id WHERE j.id = p_job_id;
$$;

-- ── jobs: lead / status / visit_booked / invoiced ───────────────────────────
CREATE OR REPLACE FUNCTION job_activity_on_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a      RECORD;
  j      JSONB := to_jsonb(NEW);   -- tolerate environments missing lead_source / category
BEGIN
  SELECT * INTO a FROM job_activity_actor();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.id, 'lead', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'lead_source', j->>'lead_source',
              'category',    j->>'category',
              'status',      NEW.status::text)));
    RETURN NULL;
  END IF;

  -- UPDATE: only care about a real status change.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;

  INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
  VALUES (NEW.id, 'status', a.actor_type, a.actor_id, a.actor_name,
          jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text));

  IF NEW.status = 'quote_scheduled' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.id, 'visit_booked', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object('meeting_status', j->>'meeting_status')));
  ELSIF NEW.status = 'invoiced' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.id, 'invoiced', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'xero_invoice_number', (SELECT q.xero_invoice_number FROM quotes q
                                       WHERE q.job_id = NEW.id AND q.xero_invoice_number IS NOT NULL
                                       ORDER BY q.updated_at DESC LIMIT 1))));
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_job skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_job ON jobs;
CREATE TRIGGER trg_job_activity_job
  AFTER INSERT OR UPDATE OF status ON jobs
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_job();

-- ── quotes: sent / followed_up / accepted / declined / edited ───────────────
-- One UPDATE can legitimately produce more than one row (e.g. respond_to_quote
-- sets status + responded_at + line_items in a single statement → 'accepted'
-- only, because the edit check requires the status to be unchanged).
CREATE OR REPLACE FUNCTION job_activity_on_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a        RECORD;
  n        JSONB := to_jsonb(NEW);   -- quote_number is read by the app but exists in no migration
  v_qno    TEXT  := n->>'quote_number';
  v_ver    INT;
  v_client TEXT;
  v_sel    JSONB;
BEGIN
  SELECT * INTO a FROM job_activity_actor(NEW.updated_by);

  -- sent: sent_at NULL → NOT NULL (the send-quote-email flow stamps it).
  IF OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL THEN
    SELECT MAX(version_no) INTO v_ver FROM quote_versions WHERE quote_id = NEW.id;
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.job_id, NEW.id, 'sent', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'total', NEW.total, 'version_no', v_ver, 'quote_number', v_qno,
              'channel', CASE WHEN NEW.sms_sent_at IS NOT NULL AND OLD.sms_sent_at IS NULL THEN 'sms' ELSE 'email' END)));
  END IF;

  -- followed_up: followup_count went up.
  IF NEW.followup_count > COALESCE(OLD.followup_count, 0) THEN
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.job_id, NEW.id, 'followed_up', a.actor_type, a.actor_id, a.actor_name,
            jsonb_build_object(
              'count',   NEW.followup_count,
              'channel', CASE WHEN NEW.sms_sent_at IS DISTINCT FROM OLD.sms_sent_at THEN 'sms' ELSE 'email' END));
  END IF;

  -- accepted / declined: the client responded (via respond_to_quote, anon).
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    v_client := job_activity_client_name(NEW.job_id);
    -- Optional line items the client ticked, if the line_items carry flags.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', li->>'id', 'description', li->>'description')), '[]'::jsonb)
      INTO v_sel
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.line_items) = 'array' THEN NEW.line_items ELSE '[]'::jsonb END) li
     WHERE lower(COALESCE(li->>'optional','')) IN ('true','t','1') AND lower(COALESCE(li->>'selected','')) IN ('true','t','1');
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, meta)
    VALUES (NEW.job_id, NEW.id, 'accepted', 'client', COALESCE(NEW.signed_name, v_client),
            jsonb_strip_nulls(jsonb_build_object(
              'total', NEW.total, 'signed_name', NEW.signed_name, 'quote_number', v_qno,
              'selected_optional', CASE WHEN v_sel = '[]'::jsonb THEN NULL ELSE v_sel END)));
  ELSIF NEW.status = 'declined' AND OLD.status IS DISTINCT FROM 'declined' THEN
    v_client := job_activity_client_name(NEW.job_id);
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, body, meta)
    VALUES (NEW.job_id, NEW.id, 'declined', 'client', v_client, NEW.decline_reason,
            jsonb_strip_nulls(jsonb_build_object('total', NEW.total, 'quote_number', v_qno)));
  END IF;

  -- edited: pricing or items changed on a quote the client already has, without
  -- a status change (so an acceptance that carries selected optional items is
  -- NOT also logged as an edit).
  IF OLD.status IN ('sent','viewed') AND NEW.status = OLD.status
     AND (NEW.line_items IS DISTINCT FROM OLD.line_items
          OR NEW.total IS DISTINCT FROM OLD.total) THEN
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.job_id, NEW.id, 'edited', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'from_total', OLD.total, 'to_total', NEW.total, 'quote_number', v_qno,
              'version_no', (SELECT MAX(version_no) FROM quote_versions WHERE quote_id = NEW.id))));
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_quote skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Named so it sorts AFTER trg_quote_version (AFTER triggers on one table fire
-- in name order) — the 'edited' snapshot below is then already written when
-- the activity row looks up version_no. 'trg_zz_…' is deliberate.
DROP TRIGGER IF EXISTS trg_zz_job_activity_quote ON quotes;
CREATE TRIGGER trg_zz_job_activity_quote
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_quote();

-- ── quote_versions: snapshot on edit while sent/viewed ──────────────────────
-- quote_versions.reason has no CHECK constraint (020 documents it as free
-- text: 'accepted' | 'reopened'), so nothing to alter — 'edited' and the
-- 'sent' baseline below just become two more values. Lock behaviour for
-- accepted/complete/invoiced (enforce_quote_lock) is untouched.
CREATE OR REPLACE FUNCTION quote_version_on_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  locked quote_status[] := ARRAY['accepted','complete','invoiced']::quote_status[];
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    -- Freeze what the client agreed to.
    PERFORM snapshot_quote_version(NEW, 'accepted');
  ELSIF OLD.status = ANY(locked) AND NOT (NEW.status = ANY(locked)) THEN
    -- Reopened for editing — preserve the locked state being left behind.
    PERFORM snapshot_quote_version(OLD, 'reopened');
  ELSIF OLD.status IN ('sent','viewed') AND NEW.status = OLD.status
        AND (NEW.line_items IS DISTINCT FROM OLD.line_items
             OR NEW.subtotal   IS DISTINCT FROM OLD.subtotal
             OR NEW.gst        IS DISTINCT FROM OLD.gst
             OR NEW.total      IS DISTINCT FROM OLD.total
             OR NEW.notes      IS DISTINCT FROM OLD.notes) THEN
    -- Edited after the client already has it. If this is the first version
    -- ever taken, capture the state the client was sent first so the history
    -- starts from what they actually saw, then the edit.
    IF NOT EXISTS (SELECT 1 FROM quote_versions WHERE quote_id = NEW.id) THEN
      PERFORM snapshot_quote_version(OLD, 'sent');
    END IF;
    PERFORM snapshot_quote_version(NEW, 'edited');
  END IF;
  RETURN NULL;
END;
$$;
-- trg_quote_version (020) already points at this function; re-create so a
-- fresh database gets it even if 020 was applied differently.
DROP TRIGGER IF EXISTS trg_quote_version ON quotes;
CREATE TRIGGER trg_quote_version
  AFTER UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION quote_version_on_change();

-- ── quote_events: mirror opens ──────────────────────────────────────────────
-- register_quote_open (029) is the only writer of quote_events today and only
-- writes kind='opened'. Other kinds are ignored here because the quotes
-- trigger above already covers them from the source of truth.
CREATE OR REPLACE FUNCTION job_activity_on_quote_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job UUID;
BEGIN
  IF NEW.kind <> 'opened' THEN
    RETURN NULL;
  END IF;
  SELECT job_id INTO v_job FROM quotes WHERE id = NEW.quote_id;
  IF v_job IS NULL THEN
    RETURN NULL;
  END IF;
  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, meta, created_at)
  VALUES (v_job, NEW.quote_id, 'opened', 'client', NEW.actor,
          COALESCE(NEW.meta, '{}'::jsonb) || jsonb_build_object('quote_event_id', NEW.id),
          NEW.created_at);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_quote_event skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_quote_event ON quote_events;
CREATE TRIGGER trg_job_activity_quote_event
  AFTER INSERT ON quote_events
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_quote_event();

-- ── quote_comments: comment / reply / note ──────────────────────────────────
CREATE OR REPLACE FUNCTION job_activity_on_quote_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job  UUID;
  v_kind TEXT;
  n      JSONB := to_jsonb(NEW);   -- attachments only exists once 028 has run
  v_meta JSONB;
BEGIN
  SELECT job_id INTO v_job FROM quotes WHERE id = NEW.quote_id;
  IF v_job IS NULL THEN
    RETURN NULL;
  END IF;

  v_kind := CASE
              WHEN NEW.internal THEN 'note'
              WHEN NEW.author_type = 'client' THEN 'comment'
              ELSE 'reply'
            END;

  v_meta := jsonb_build_object('comment_id', NEW.id);
  IF n ? 'attachments' AND jsonb_typeof(n->'attachments') = 'array' AND jsonb_array_length(n->'attachments') > 0 THEN
    v_meta := v_meta || jsonb_build_object('attachments', n->'attachments');
  END IF;

  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, body, meta, created_at)
  VALUES (v_job, NEW.quote_id, v_kind,
          CASE WHEN NEW.author_type = 'client' THEN 'client' ELSE 'staff' END,
          NEW.author_id, NEW.author_name, NEW.body, v_meta, NEW.created_at);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_quote_comment skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_quote_comment ON quote_comments;
CREATE TRIGGER trg_job_activity_quote_comment
  AFTER INSERT ON quote_comments
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_quote_comment();

-- ── job_photos: photo ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION job_activity_on_job_photo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  n JSONB := to_jsonb(NEW);   -- phase / line_ref (031) and kind (010) may lag in some environments
BEGIN
  SELECT * INTO a FROM job_activity_actor(NEW.uploaded_by);
  INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, body, meta, created_at)
  VALUES (NEW.job_id, 'photo', a.actor_type, a.actor_id, a.actor_name, NEW.caption,
          jsonb_strip_nulls(jsonb_build_object(
            'photo_id', NEW.id,
            'url',      NEW.url,
            'phase',    n->>'phase',
            'line_ref', n->>'line_ref',
            'kind',     n->>'kind')),
          NEW.created_at);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_job_photo skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_job_photo ON job_photos;
CREATE TRIGGER trg_job_activity_job_photo
  AFTER INSERT ON job_photos
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_job_photo();

-- ── schedule: scheduled / unscheduled / moved ───────────────────────────────
CREATE OR REPLACE FUNCTION job_activity_on_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT * INTO a FROM job_activity_actor();

  IF TG_OP = 'DELETE' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (OLD.job_id, 'unscheduled', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'schedule_id', OLD.id, 'date', OLD.date, 'start_time', OLD.start_time,
              'end_time', OLD.end_time, 'resource_id', OLD.resource_id, 'assigned_to', OLD.assigned_to)));
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.job_id, 'scheduled', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'schedule_id', NEW.id, 'date', NEW.date, 'start_time', NEW.start_time,
              'end_time', NEW.end_time, 'resource_id', NEW.resource_id, 'assigned_to', NEW.assigned_to)));
    RETURN NULL;
  END IF;

  -- UPDATE: only a move between days or lanes is worth a feed row; time
  -- nudges within the same day/lane are noise.
  IF NEW.date IS DISTINCT FROM OLD.date OR NEW.resource_id IS DISTINCT FROM OLD.resource_id THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta)
    VALUES (NEW.job_id, 'scheduled', a.actor_type, a.actor_id, a.actor_name,
            jsonb_strip_nulls(jsonb_build_object(
              'moved', true, 'schedule_id', NEW.id,
              'date', NEW.date, 'start_time', NEW.start_time, 'end_time', NEW.end_time,
              'resource_id', NEW.resource_id, 'assigned_to', NEW.assigned_to,
              'from_date', OLD.date, 'from_resource_id', OLD.resource_id)));
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_schedule skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_schedule ON schedule;
CREATE TRIGGER trg_job_activity_schedule
  AFTER INSERT OR DELETE OR UPDATE OF date, resource_id ON schedule
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_schedule();

-- ── job_alerts: portal / alert ──────────────────────────────────────────────
-- Alerts whose *cause* already produces its own feed row are skipped so the
-- feed doesn't say the same thing twice:
--   acceptance / comment   → written by notify-office; the quotes and
--                            quote_comments triggers already log them
--   new_lead / to_invoice  → raised by 034 from the very status change the
--                            jobs trigger already logged as lead / invoiced
CREATE OR REPLACE FUNCTION job_activity_on_job_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF NEW.kind IN ('acceptance','comment','new_lead','to_invoice') THEN
    RETURN NULL;
  END IF;

  IF NEW.kind LIKE 'portal%' THEN
    INSERT INTO job_activity (job_id, kind, actor_type, actor_name, body, meta, created_at)
    VALUES (NEW.job_id, 'portal', 'portal', NEW.source, COALESCE(NEW.detail, NEW.title),
            jsonb_strip_nulls(jsonb_build_object(
              'alert_id', NEW.id, 'kind', NEW.kind, 'title', NEW.title,
              'suggested_status', NEW.suggested_status, 'source', NEW.source)),
            NEW.created_at);
  ELSE
    INSERT INTO job_activity (job_id, kind, actor_type, body, meta, created_at)
    VALUES (NEW.job_id, 'alert', 'system', COALESCE(NEW.detail, NEW.title),
            jsonb_strip_nulls(jsonb_build_object(
              'alert_id', NEW.id, 'kind', NEW.kind, 'title', NEW.title,
              'suggested_status', NEW.suggested_status, 'source', NEW.source)),
            NEW.created_at);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'job_activity_on_job_alert skipped: %', SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_activity_job_alert ON job_alerts;
CREATE TRIGGER trg_job_activity_job_alert
  AFTER INSERT ON job_alerts
  FOR EACH ROW EXECUTE FUNCTION job_activity_on_job_alert();

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Seed the feed from history so existing jobs don't start with an empty
-- timeline. Runs ONLY when job_activity is empty, so re-applying the migration
-- (or running it after the triggers have been live) can't duplicate rows.
-- Timestamps are the original event times, not now().
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM job_activity) THEN
    RAISE NOTICE 'job_activity already populated — backfill skipped';
    RETURN;
  END IF;

  -- Every job starts with a lead row (mirrors the INSERT trigger).
  INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, meta, created_at)
  SELECT j.id, 'lead',
         CASE WHEN u.id IS NULL THEN 'system' ELSE 'staff' END, u.id, u.name,
         jsonb_strip_nulls(jsonb_build_object('lead_source', to_jsonb(j)->>'lead_source',
                                              'category',    to_jsonb(j)->>'category',
                                              'backfilled',  true)),
         j.created_at
  FROM jobs j LEFT JOIN users u ON u.id = j.created_by;

  -- sent
  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, meta, created_at)
  SELECT q.job_id, q.id, 'sent',
         CASE WHEN u.id IS NULL THEN 'system' ELSE 'staff' END, u.id, u.name,
         jsonb_strip_nulls(jsonb_build_object('total', q.total,
                                              'quote_number', to_jsonb(q)->>'quote_number',
                                              'backfilled', true)),
         q.sent_at
  FROM quotes q LEFT JOIN users u ON u.id = q.created_by
  WHERE q.sent_at IS NOT NULL;

  -- opened: per-event rows where we have them (029), else the first-open stamp
  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, meta, created_at)
  SELECT q.job_id, q.id, 'opened', 'client', e.actor,
         COALESCE(e.meta, '{}'::jsonb) || jsonb_build_object('quote_event_id', e.id, 'backfilled', true),
         e.created_at
  FROM quote_events e JOIN quotes q ON q.id = e.quote_id
  WHERE e.kind = 'opened';

  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, meta, created_at)
  SELECT q.job_id, q.id, 'opened', 'client', c.name,
         jsonb_build_object('first_open', true, 'backfilled', true),
         q.viewed_at
  FROM quotes q
  JOIN jobs j ON j.id = q.job_id
  LEFT JOIN clients c ON c.id = j.client_id
  WHERE q.viewed_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM quote_events e WHERE e.quote_id = q.id AND e.kind = 'opened');

  -- accepted / declined (a quote that has since moved on to complete/invoiced
  -- was still accepted at responded_at, so include the locked statuses too)
  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_name, body, meta, created_at)
  SELECT q.job_id, q.id,
         CASE WHEN q.status = 'declined' THEN 'declined' ELSE 'accepted' END,
         'client',
         CASE WHEN q.status = 'declined' THEN c.name ELSE COALESCE(q.signed_name, c.name) END,
         CASE WHEN q.status = 'declined' THEN q.decline_reason ELSE NULL END,
         jsonb_strip_nulls(jsonb_build_object('total', q.total, 'signed_name', q.signed_name,
                                              'quote_number', to_jsonb(q)->>'quote_number',
                                              'backfilled', true)),
         q.responded_at
  FROM quotes q
  JOIN jobs j ON j.id = q.job_id
  LEFT JOIN clients c ON c.id = j.client_id
  WHERE q.responded_at IS NOT NULL
    AND q.status IN ('accepted','declined','complete','invoiced');

  -- comment / reply / note
  INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, body, meta, created_at)
  SELECT q.job_id, qc.quote_id,
         CASE WHEN qc.internal THEN 'note' WHEN qc.author_type = 'client' THEN 'comment' ELSE 'reply' END,
         CASE WHEN qc.author_type = 'client' THEN 'client' ELSE 'staff' END,
         qc.author_id, qc.author_name, qc.body,
         jsonb_strip_nulls(jsonb_build_object(
           'comment_id', qc.id,
           'attachments', CASE WHEN jsonb_typeof(to_jsonb(qc)->'attachments') = 'array'
                                AND jsonb_array_length(to_jsonb(qc)->'attachments') > 0
                               THEN to_jsonb(qc)->'attachments' END,
           'backfilled', true)),
         qc.created_at
  FROM quote_comments qc JOIN quotes q ON q.id = qc.quote_id;

  -- photo
  INSERT INTO job_activity (job_id, kind, actor_type, actor_id, actor_name, body, meta, created_at)
  SELECT p.job_id, 'photo',
         CASE WHEN u.id IS NULL THEN 'system' ELSE 'staff' END, u.id, u.name, p.caption,
         jsonb_strip_nulls(jsonb_build_object(
           'photo_id', p.id, 'url', p.url,
           'phase',    to_jsonb(p)->>'phase',
           'line_ref', to_jsonb(p)->>'line_ref',
           'kind',     to_jsonb(p)->>'kind',
           'backfilled', true)),
         p.created_at
  FROM job_photos p LEFT JOIN users u ON u.id = p.uploaded_by;

  -- scheduled
  INSERT INTO job_activity (job_id, kind, actor_type, meta, created_at)
  SELECT s.job_id, 'scheduled', 'system',
         jsonb_strip_nulls(jsonb_build_object(
           'schedule_id', s.id, 'date', s.date, 'start_time', s.start_time, 'end_time', s.end_time,
           'resource_id', s.resource_id, 'assigned_to', s.assigned_to, 'backfilled', true)),
         s.created_at
  FROM schedule s;

  RAISE NOTICE 'job_activity backfilled';
END $$;
