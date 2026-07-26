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
| Booking acknowledgement | automated | `book-quote` / `inbound-lead` | `booking_ack` |

> Invoice / payment reminders are **not** handled here — they're managed in Xero.

One-tap texts pre-fill the composer (staff reviews the ETA/delay, then sends).
The automated sends respect `clients.sms_opt_out`; one-tap texts do not (they're a
deliberate human action, but the job panel shows the opt-out state).

## `daily-notifications`

Run once a day. It sends **quote follow-ups** — texts clients whose quote was
sent 3+ days ago and is still `sent`/`viewed` with `followup_count = 0`; bumps
`followup_count` so each quote is only nudged once.

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
