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

---

# portal_actions worker (write-back / "Push to Portal")

`portal_actions_worker.py` is the outbound counterpart: it drains the
`portal_actions` queue (rows the app's "Push to Portal" button inserts) and
**stages** each completed job into its portal — per-line Before/During/After
photos + the quote PDF — stopping before the final Claim/submit. Mapping spec:
`docs/portal-upload-mapping.md`.

- **Spencers** (`source = 'dbs'`) — reuses the same login as the scraper; opens the
  job, uploads each line's photos via its "streetlight" popup (Before/WIP/After),
  and uploads the quote PDF to the Documents tab under **Other**.
- **Downer** (`source = 'downer'`) — MyWork has **MFA**, so capture a session once:
  ```bash
  cd scripts && python3 portal_actions_worker.py --capture-downer
  # finish the login + MFA in the window, press Enter → saves downer_session.json
  ```
  Then set `DOWNER_STORAGE_STATE` to that file (a Fly.io secret/volume in prod).

Run it:
```bash
cd scripts && set -a && . .env && set +a
python3 portal_actions_worker.py            # single drain pass (prints {"done":N,"failed":N})
POLL_SECONDS=120 python3 portal_actions_worker.py   # forever loop
```

Secrets it reads: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_BASE_URL`,
`DBS_URL`/`DBS_USERNAME`/`DBS_PASSWORD` (Spencers), `DOWNER_URL`/`DOWNER_STORAGE_STATE`
(Downer), `POLL_SECONDS`, `HEADLESS`.

> ⚠️ First-run verification: the login, job-open and per-line "streetlight"
> selectors are proven (shared with the scraper), but the **upload-popup internals**
> (category dropdown + file input), the **Documents tab**, and the **entire Downer
> MyWork DOM** are not yet confirmed against the live portals. Those steps use
> robust text selectors and **fail loudly** (never silently) — do the first run
> **headful** (`HEADLESS=0`) on one job and adjust the `# VERIFY` selectors as needed.
