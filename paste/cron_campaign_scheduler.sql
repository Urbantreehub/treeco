-- ---------------------------------------------------------------------------
-- Schedule the campaign sender
-- ---------------------------------------------------------------------------
-- Run this AFTER 040. Paste as one block; step 2 needs your service role key
-- (Project Settings > API > service_role) pasted in place of the placeholder.
--
-- Without this, a campaign stopped by the daily cap never resumes on its own.
-- campaign-scheduler picks up campaigns already in 'sending' as well as
-- scheduled ones, so this is what carries the remaining recipients out over the
-- following days.

-- 1. pg_net, so Postgres can call an HTTP endpoint. The two existing cron jobs
--    call plain SQL functions, so this has never been needed here before.
create extension if not exists pg_net with schema extensions;

-- 2. Keep the key in Vault rather than inline in the job body.
--    A cron job's SQL is stored in cron.job in plain text and is readable by
--    anyone who can query that table. Pasting a service role key -- which can
--    read and write every table, bypassing RLS -- straight into it leaves a
--    full-database credential sitting in a system catalogue forever.
select vault.create_secret(
  'PASTE_SERVICE_ROLE_KEY_HERE',
  'campaign_scheduler_key',
  'Service role key used by the campaign-scheduler cron job'
);

-- 3. The schedule itself.
--
--    pg_cron runs in UTC, always. '7 20,21,22 * * *' is 8:07, 9:07 and 10:07am
--    NZST, or 9:07-11:07am once daylight saving starts -- inside business hours
--    either way, with no DST edit needed twice a year.
--
--    Three runs rather than one: the daily cap means only the first does any
--    work, and the other two are free retries if a run fails or times out.
--    Every 15 minutes would also work, but would fire the day's 50 emails at
--    ten past midnight.
--
--    Off-the-hour on purpose -- :07 rather than :00. Providers see a spike of
--    bulk mail on the hour, and being in it is a small avoidable cost.
select cron.schedule(
  'campaign-scheduler',
  '7 20,21,22 * * *',
  $$
  select net.http_post(
    url     := 'https://zagwhnnxjtimzvvjaujm.supabase.co/functions/v1/campaign-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret
                                       from vault.decrypted_secrets
                                      where name = 'campaign_scheduler_key'),
      'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  )
  $$
);

-- 4. Confirm it registered.
select jobname, schedule, active from cron.job order by jobname;

-- Later, to see whether it actually ran and what came back:
--   select start_time, status, return_message
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'campaign-scheduler')
--    order by start_time desc limit 5;
