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

## 2. How Downer sync actually runs — "Downer Desk" (NOT Fly.io)

**Important discovery:** MyWork is a SharePoint site behind Microsoft Entra
(Azure AD) SSO, and the tenant has "keep me signed in" **disabled**. The login
therefore only lives in a *running* browser's memory — it does **not** survive
being saved to disk or reopening the browser. Verified the hard way:
`storage_state` reuse and a persistent user-data-dir profile both dropped back to
the login page on relaunch. So the headless "capture a session file, run it on
Fly" model (old `downer_to_treeco.py` / `--capture-downer`) **cannot work** for
Downer.

What does work: keep **one authenticated browser open** and poll in a loop. That
session survives indefinitely in-process. That's `scripts/downer_desk.py`, run on
an always-on office machine with a screen. It loads the **Issued** order list and
reads the exact JSON feed the page itself fetches —
`as-myworkapi-prod.azurewebsites.net/api/serviceorders/getbyquery/issued` — so
there's **no DOM scraping**. New orders become `category:'downer'` `new_lead`
jobs (never auto-accepted; the office quotes them). If Microsoft forces a
re-login, it raises the `downer_mfa` alert (red banner in TreeCo), waits for the
human to re-approve in the same window, then resumes.

### Start it (office machine, macOS)
1. In `scripts/`, double-click **`Setup Downer Desk.command`** once — paste the
   Supabase service_role key at the hidden prompt (writes `scripts/.env`, chmod 600).
2. Double-click **`Downer Desk.command`** — a browser opens on MyWork → sign in +
   approve MFA → land on the home page → press Enter in the Terminal window.
3. Leave the window open. It pulls new Issued orders every `DOWNER_POLL_SECONDS`
   (default 300). Ctrl+C to stop.

Field mapping (MyWork → TreeCo): `TaskDescription.OrderNumber` → `ko_reference`
(R-number); `JobLocation.BuildingAddress` → address; `TaskDescription.JobTitle` →
description; `TaskDescription.ResponseTypeCode` → priority;
`ClientAndContactDetails.Customer` → client; `DatesTargets.CompleteDateTime` → due.

## 3. Turn Downer sync on
Downer Desk respects the pause gate (or use `DOWNER_FORCE=1` for a manual run):
```sql
update app_settings set value = 'true'::jsonb where key = 'downer_sync_enabled';
```

## 4. Spencer's + outbound stay on Fly.io (unchanged)
Downer's inbound sync is the office-machine Downer Desk (above). The other
workers are still Fly.io:
| Script | Role | Poll env | Notes |
|---|---|---|---|
| `dbs_to_treeco.py` | Spencer's inbound | `DBS_POLL_SECONDS=600` | live |
| `portal_actions_worker.py` | Outbound push (Spencer's) | `POLL_SECONDS=120` | MFA-free |

Downer **outbound** (Push-to-Portal for Downer) needs the same live MyWork
session, so it belongs in Downer Desk too — not yet wired in (next increment).

## 6. Merge the app PR
PR #18 — https://github.com/Urbantreehub/treeco/pull/18 (migrations above are its
deploy step). Josh can reply "merge" to Claude, or merge on GitHub.

---

## When the Downer login later expires
TreeCo automatically shows a **red banner on every screen** + an **Actions** entry
("Downer login expired — reconnect"). Because Downer Desk keeps the browser open,
fixing it is just: go to the Downer Desk window, sign in to MyWork again + approve
MFA, then press Enter in the Terminal. The banner clears itself on the next good
login. No session files, no redeploy, no data loss. (If the machine was rebooted
and Downer Desk isn't running, double-click `Downer Desk.command` and sign in.)
