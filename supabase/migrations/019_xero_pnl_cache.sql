-- Cache for the Xero Profit & Loss report.
--
-- xero-pnl builds the dashboard figure from ~13 sequential Xero report calls
-- (full-year summary + one call per month for the sparkline). That's too slow
-- and too rate-limit-prone to run on every dashboard load, so the result is
-- cached here for 30 minutes, keyed by tenant + financial-year window.
--
-- Only the service role (edge functions) touches this table; there are no
-- client-facing policies. Safe to re-run.

create table if not exists xero_pnl_cache (
  cache_key   text primary key,
  payload     jsonb       not null,
  computed_at timestamptz not null default now()
);

alter table xero_pnl_cache enable row level security;
