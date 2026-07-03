# DBS sync worker — deploy guide

The always-on worker that keeps TreeCo in sync with the Spencer Henshaw (DBS)
portal. It logs into the portal every ~10 minutes, pulls jobs into TreeCo,
and emails the office whenever a genuinely new job appears.

Runs from `scripts/dbs_to_treeco.py`:
- **Single pass** (default) — one scrape, prints a JSON summary. This is what
  the "Sync now" button in Settings triggers via `dbs_sync_server.py`.
- **Always-on** — set `DBS_POLL_SECONDS` > 0 and it loops forever, surviving
  errors. This is the mode Fly.io runs.

## Prerequisites

1. Apply migration `015_dbs_portal_sync.sql` (adds `ko_reference`, `sla_due_at`,
   `priority` columns + the `portal_sync` table). Until it's applied the worker
   still runs — it just skips the new columns and can't diff status changes.
2. A `RESEND_API_KEY` (same Resend account the Supabase edge functions use —
   copy it from Supabase → Settings → Secrets).

## Deploy to Fly.io

```bash
cd "scripts"
fly launch --no-deploy          # accept app name treeco-dbs-sync, region syd
```

Set the secrets (these are NOT baked into the image):

```bash
fly secrets set \
  DBS_USERNAME="URBAN" \
  DBS_PASSWORD="********" \
  SUPABASE_URL="https://zagwhnnxjtimzvvjaujm.supabase.co" \
  SUPABASE_SERVICE_KEY="********" \
  RESEND_API_KEY="********" \
  APP_BASE_URL="https://app.urbantreeservices.net" \
  OFFICE_EMAIL="office@urbantreeservices.net" \
  DBS_POLL_SECONDS="600"

fly deploy
```

Watch it run:

```bash
fly logs
```

You should see a poll every 10 minutes with a summary line:
`✓ Done — created: N  updated: N  changed: N  new-emailed: N  skipped: N`

## Environment variables

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `DBS_PASSWORD` | yes | — | Portal login |
| `DBS_USERNAME` | no | `URBAN` | Portal login |
| `SUPABASE_URL` | yes | project URL | |
| `SUPABASE_SERVICE_KEY` | yes | — | service_role key (bypasses RLS) |
| `RESEND_API_KEY` | no | — | unset = no new-job emails |
| `APP_BASE_URL` | no | `https://app.urbantreeservices.net` | deep-link base for emails |
| `OFFICE_EMAIL` | no | `office@urbantreeservices.net` | where new-job emails go |
| `DBS_POLL_SECONDS` | no | `0` | `0` = single pass; `600` = poll every 10 min |
| `DBS_NOTIFY` | no | `1` | `0` to disable new-job emails |
| `DBS_HEADLESS` | no | off | `1` in the container (set in Dockerfile) |

## Local test (single pass)

```bash
cd "scripts"
set -a && . .env && set +a
DBS_HEADLESS=1 python3 dbs_to_treeco.py
```

Add `RESEND_API_KEY=...` to `scripts/.env` first if you want to test the email.
