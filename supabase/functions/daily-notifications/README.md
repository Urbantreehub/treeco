# Automated SMS/email triggers

This documents the Phase-1b SMS/email triggers. There are two kinds: **one-tap**
(staff taps a button on the job) and **automated** (fire on a schedule).

## Triggers

| Trigger | Type | Where | `sms_messages.kind` |
|---|---|---|---|
| Quote sent (link) | one-tap | QuoteBuilder / SentQuotes | `quote_link` |
| Booking confirmed | one-tap | Job panel → "Confirm booking" | `job_confirmed` |
| Crew on the way | one-tap | Job panel → "On the way" | `crew_departed` |
| Crew arrived | one-tap | Job panel → "Arrived" | `crew_arrived` |
| Running late | one-tap | Job panel → "Running late" | `job_running_late` |
| Job complete | one-tap | Job panel → "All done" | `job_complete` |
| Quote follow-up (day 3) | **automated** | `daily-notifications` | `quote_followup` |
| Invoice overdue (7 days) | **automated** | `daily-notifications` | `invoice_overdue` |
| Booking acknowledgement | automated | `book-quote` / `inbound-lead` | `booking_ack` |

One-tap texts pre-fill the composer (staff reviews the ETA/delay, then sends).
The automated sends respect `clients.sms_opt_out`; one-tap texts do not (they're a
deliberate human action, but the job panel shows the opt-out state).

## `daily-notifications`

Run once a day. It:
1. **Quote follow-ups** — texts clients whose quote was sent 3+ days ago and is
   still `sent`/`viewed` with `followup_count = 0`; bumps `followup_count`.
2. **Invoice overdue** — texts clients whose job has been `invoiced` for 7+ days,
   at most once every 7 days (idempotent via a look-back on `sms_messages`).

Assumption: "overdue" = 7 days after the job moved to `invoiced`
(`jobs.status_changed_at`). If/when Xero due-dates are synced locally, switch the
overdue check to the real due date.

### Deploy + schedule

```bash
supabase functions deploy send-sms
supabase functions deploy book-quote
supabase functions deploy inbound-lead
supabase functions deploy daily-notifications
```

Schedule the daily run (06:00 NZ ≈ 18:00 UTC) — Supabase Dashboard → Edge
Functions → daily-notifications → Schedules (`0 18 * * *`), or via SQL:

```sql
select cron.schedule(
  'daily-notifications', '0 18 * * *',
  $$ select net.http_post('https://<project-ref>.supabase.co/functions/v1/daily-notifications') $$
);
```

Requires the usual secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`,
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, and `RESEND_API_KEY` for
the email acknowledgements.

### Migration

Apply `020_client_sms_opt_out.sql` (adds `clients.sms_opt_out`).
