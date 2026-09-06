-- 040_activity_helpers.sql
-- Staff-facing helper for the job activity feed (038).
--
-- Reading needs no helper — the app selects from job_activity directly under
-- its RLS. Writing a note or reply goes through add_job_note so that:
--   * the actor is stamped server-side from auth.uid() / users.name, never
--     from a client-supplied value;
--   * truck logins (who have no INSERT policy on job_activity) can still leave
--     a note on a job they're on — the RPC re-uses job_activity_visible();
--   * a 'reply' reaches the client. It is written as a staff quote_comment on
--     the job's current quote, so the client sees it on /q/:token through
--     get_quote_comments, and the 022/038 trigger mirrors it into the feed.
--     A plain 'note' is internal and goes straight to job_activity.
--
-- respond_to_quote (023) writes signed_name, decline_reason and status in the
-- same UPDATE, so the quotes trigger in 038 already sees them — no change
-- needed there.

CREATE OR REPLACE FUNCTION add_job_note(p_job_id UUID, p_body TEXT, p_kind TEXT DEFAULT 'note')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_name    TEXT;
  v_level   TEXT;
  v_body    TEXT := btrim(COALESCE(p_body, ''));
  v_quote   UUID;
  v_comment UUID;
  v_row     job_activity;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_signed_in');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('note','reply') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;
  IF v_body = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jobs WHERE id = p_job_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT name, access_level::text INTO v_name, v_level FROM users WHERE id = v_uid;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_profile');
  END IF;

  -- Same rule as the SELECT policy: office/full anywhere, truck/crew only on
  -- jobs they're scheduled on.
  IF NOT job_activity_visible(p_job_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_kind = 'reply' THEN
    -- Replies are for the client, so only office/full may send them.
    IF v_level NOT IN ('full','office') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
    -- The job's live quote: the one most recently sent, else the newest.
    SELECT id INTO v_quote FROM quotes
     WHERE job_id = p_job_id
     ORDER BY sent_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;

  IF p_kind = 'reply' AND v_quote IS NOT NULL THEN
    INSERT INTO quote_comments (quote_id, author_type, author_id, author_name, body, internal)
    VALUES (v_quote, 'staff', v_uid, v_name, v_body, FALSE)
    RETURNING id INTO v_comment;
    -- The quote_comments trigger (038) wrote the feed row; hand it back.
    SELECT * INTO v_row FROM job_activity
     WHERE job_id = p_job_id AND meta->>'comment_id' = v_comment::text
     ORDER BY created_at DESC LIMIT 1;
    IF v_row.id IS NULL THEN
      -- Trigger absent or best-effort skipped — write the row ourselves.
      INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, body, meta)
      VALUES (p_job_id, v_quote, 'reply', 'staff', v_uid, v_name, v_body,
              jsonb_build_object('comment_id', v_comment))
      RETURNING * INTO v_row;
    END IF;
  ELSE
    -- 'note', or a 'reply' on a job that has no quote yet (nothing to show the
    -- client) — internal feed row only.
    INSERT INTO job_activity (job_id, quote_id, kind, actor_type, actor_id, actor_name, body)
    VALUES (p_job_id, v_quote, p_kind, 'staff', v_uid, v_name, v_body)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('ok', true, 'activity', to_jsonb(v_row));
END;
$$;

GRANT EXECUTE ON FUNCTION add_job_note(UUID, TEXT, TEXT) TO authenticated;
