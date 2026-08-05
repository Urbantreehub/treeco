-- Daily 3pm sweep: surface quotes that are slipping through the cracks onto the
-- Actions list (Josh + Ashley both see it). Two categories:
--   * unsent_quote — a quote is drafted but was never sent to the client
--   * not_pushed   — a completed Spencers/Downer job hasn't been pushed to portal
--
-- Deduped per job, so running it every day never piles up duplicates. Enable
-- pg_cron (Supabase: Database > Extensions > pg_cron) for the 3pm schedule; the
-- function also runs on demand: select sweep_stale_quotes();

CREATE OR REPLACE FUNCTION sweep_stale_quotes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Quotes drafted but never sent (job still active).
  INSERT INTO job_alerts (job_id, kind, title, detail, source, dedupe_key)
  SELECT q.job_id, 'unsent_quote', 'Quote not sent yet',
         'A quote is drafted but hasn''t been sent to the client.', 'internal',
         q.job_id::text || ':unsent_quote'
  FROM quotes q
  JOIN jobs j ON j.id = q.job_id
  WHERE q.status = 'draft' AND q.sent_at IS NULL
    AND j.status NOT IN ('invoiced', 'declined', 'complete_to_invoice')
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  -- Completed Spencers/Downer jobs not yet pushed to their portal.
  INSERT INTO job_alerts (job_id, kind, title, detail, source, dedupe_key)
  SELECT j.id, 'not_pushed', 'Not pushed to portal yet',
         'This completed Spencers/Downer job hasn''t been pushed to the portal.', 'portal',
         j.id::text || ':not_pushed'
  FROM jobs j
  WHERE j.ko_reference IS NOT NULL
    AND j.status = 'complete_to_invoice'
    AND NOT EXISTS (
      SELECT 1 FROM portal_actions pa
      WHERE pa.job_id = j.id
        AND pa.action IN ('push_photos', 'upload_documents', 'push_to_portal')
    )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

-- Schedule at 03:00 UTC ≈ 3pm NZST (4pm during NZ daylight saving). Adjust the
-- cron if you want it pinned to a different NZ time. Safe to re-run.
DO $$
BEGIN
  PERFORM cron.schedule('sweep-stale-quotes', '0 3 * * *', 'select public.sweep_stale_quotes();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not enabled yet — turn it on (Database > Extensions > pg_cron), then run: select cron.schedule(''sweep-stale-quotes'', ''0 3 * * *'', ''select public.sweep_stale_quotes();'');';
END $$;
