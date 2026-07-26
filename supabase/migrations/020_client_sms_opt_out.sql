-- Per-client opt-out for automated client texts.
--
-- Gates the *automated* sends (day-3 quote follow-up, invoice-overdue reminder,
-- booking acknowledgement). Staff-initiated one-tap texts from the job panel are
-- NOT gated by this — they're a deliberate human action.
--
-- No new sms_messages.kind values need a migration: that column is free-text
-- (no CHECK constraint), so new kinds like 'crew_departed' / 'invoice_overdue'
-- can be logged directly. Safe to re-run.

alter table clients add column if not exists sms_opt_out boolean not null default false;
