-- Archive jobs once they're invoiced.
--
-- Invoiced jobs drop off the active Jobs list but stay viewable under the
-- "Archived" toggle. Archiving is driven by a trigger so it happens no matter
-- which path sets the job to 'invoiced' (the Xero invoice function, a manual
-- status change, etc.). Restoring is a plain archived_at = NULL update, which
-- the trigger won't undo. Safe to re-run.

alter table jobs add column if not exists archived_at timestamptz;
create index if not exists idx_jobs_archived_at on jobs(archived_at);

-- Backfill any jobs already invoiced.
update jobs
   set archived_at = coalesce(status_changed_at, now())
 where status = 'invoiced' and archived_at is null;

-- Auto-archive on transition into 'invoiced' (only sets when not already set,
-- so a manual restore sticks even if the row is updated again later).
create or replace function archive_on_invoice() returns trigger
language plpgsql as $$
begin
  if new.status = 'invoiced'
     and new.status is distinct from old.status
     and new.archived_at is null then
    new.archived_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_archive_on_invoice on jobs;
create trigger trg_archive_on_invoice
  before update on jobs
  for each row execute function archive_on_invoice();
