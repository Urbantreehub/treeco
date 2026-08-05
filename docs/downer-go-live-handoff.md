# Downer + portal workers — go-live handoff (for the dev)

TreeCo now has the full Spencer's + Downer portal integration. This is the
deploy checklist to switch it on. Josh has a working **MyWork** login with MFA
set up (username `Josh.Micallef@mywork.spotless.com`) — he needs to be present
for step 2 (the interactive login).

Everything else (all the app code) is merged/ready; this is purely ops.

---

## 0. Prerequisites
- Repo cloned; Python 3.11; `pip install -r scripts/requirements.txt`;
  `python3 -m playwright install chromium`.
- Supabase project URL + **service_role** key.
- The existing Spencer's worker already runs on Fly.io (`treeco-dbs-sync`) — the
  two new workers sit alongside it.

## 1. Database migrations (Supabase → SQL editor)
Paste and run each file's contents **in order**: `031`, `032`, `033`, `034`,
`035`, `036` (in `supabase/migrations/`). For `035` (the daily 3pm sweep) enable
**pg_cron** first: Database → Extensions → enable `pg_cron`; the migration then
schedules it (and prints a NOTICE with the manual command if it isn't enabled).

## 2. Capture the Downer session (needs Josh + a real screen)
MyWork requires MFA, so the workers run off a saved browser session. On a laptop
(headful), with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` exported:
```bash
cd scripts
python3 portal_actions_worker.py --capture-downer
```
A browser opens on the MyWork login → **Josh signs in + approves MFA** → press
Enter. This writes `scripts/downer_session.json` — a live session, treat it like
a credential.

## 3. Test the inbound scraper (supervised)
```bash
DOWNER_HEADLESS=0 DOWNER_FORCE=1 python3 downer_to_treeco.py
```
Watch it open MyWork → Service Orders → Issued and pull work orders into TreeCo.
The MyWork list/row selectors are **heuristic** (marked `# VERIFY` in
`downer_to_treeco.py`) — if it grabs nothing/wrong data, tighten them against the
live DOM (send Claude a screenshot and it'll patch them).

## 4. Deploy the workers (Fly.io)
Three always-on scripts:
| Script | Role | Poll env |
|---|---|---|
| `dbs_to_treeco.py` | Spencer's inbound (already live) | `DBS_POLL_SECONDS=600` |
| `downer_to_treeco.py` | Downer inbound (new) | `DOWNER_POLL_SECONDS=600` |
| `portal_actions_worker.py` | Outbound push, both portals (new) | `POLL_SECONDS=120` |

Run them as separate Fly processes (or apps). Secrets:
- **Shared:** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_BASE_URL`, `RESEND_API_KEY`
- **Spencer's:** `DBS_USERNAME`, `DBS_PASSWORD`
- **Downer:** `DOWNER_STORAGE_STATE` (path to the session file), `DOWNER_URL`
- `HEADLESS=1` / `DOWNER_HEADLESS=1`

> **Session-persistence gotcha:** Fly containers are ephemeral, so put
> `downer_session.json` on a **Fly volume**, or store its JSON as a Fly secret and
> write it to `DOWNER_STORAGE_STATE` at container start. Both Downer workers read
> the same file.

## 5. Turn Downer sync on
```sql
update app_settings set value = 'true'::jsonb where key = 'downer_sync_enabled';
```

## 6. Merge the app PR
PR #18 — https://github.com/Urbantreehub/treeco/pull/18 (migrations above are its
deploy step). Josh can reply "merge" to Claude, or merge on GitHub.

---

## When the Downer login later expires
TreeCo automatically shows a **red banner on every screen** + an **Actions** entry
("Downer login expired — reconnect"). To fix: re-run **step 2**, replace the
session file / secret, redeploy. The banner clears itself on the next good login.
No code changes, no data loss.
