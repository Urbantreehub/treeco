#!/usr/bin/env python3
"""
downer_to_treeco.py — pull Downer (MyWork/Spotless) work orders into TreeCo.

The Downer counterpart of dbs_to_treeco.py (Spencers). MyWork requires MFA, so
this runs off a persisted browser session (DOWNER_STORAGE_STATE) captured once
with:  python3 portal_actions_worker.py --capture-downer

When the session is expired/missing it raises the 'downer_mfa' alert (see
downer_common.flag_downer_mfa) so TreeCo shows the reconnect banner, and stops —
it never silently does nothing. On a good login it resolves that alert.

── Selector confidence ──────────────────────────────────────────────────────
The MyWork DOM is NOT mapped the way the Spencers portal is. Navigation follows
the MyWork Portal Guide (Home → Service Orders → Issued), but the list/row
selectors are heuristic (regex for R-numbers / WO numbers over the visible rows)
and marked `# VERIFY`. Do the first run headful (HEADLESS=0) and tighten them.

Gated by app_settings.downer_sync_enabled (default off); DOWNER_FORCE=1 overrides.
POLL_SECONDS=0 → single pass (prints a JSON summary); >0 → loop forever.
"""

import os
import re
import sys
import json
import asyncio
import requests
from datetime import datetime

from playwright.async_api import async_playwright
from downer_common import (
    SUPABASE_URL, SUPABASE_KEY, DOWNER_URL, DOWNER_STORAGE_STATE,
    flag_downer_mfa, downer_session_ok,
)

POLL_SECONDS = int(os.environ.get("DOWNER_POLL_SECONDS", "0"))
HEADLESS     = os.environ.get("DOWNER_HEADLESS", "1").lower() in ("1", "true", "yes")
FORCE        = os.environ.get("DOWNER_FORCE", "").lower() in ("1", "true", "yes")


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# ── Supabase REST ─────────────────────────────────────────────────────────────
def sb_headers():
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"}


def sb_get(path, params):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=sb_headers(), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


_UNKNOWN_COL_RE = re.compile(r"'([a-z_]+)' column")

def sb_write_resilient(method, path, payload, params=None):
    """POST/PATCH that drops columns the schema doesn't have yet, then retries —
    so it keeps working even before every migration is applied."""
    p = dict(payload)
    for _ in range(8):
        r = requests.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                             headers={**sb_headers(), "Prefer": "return=representation"},
                             params=params, json=p, timeout=30)
        if r.status_code == 400:
            m = _UNKNOWN_COL_RE.search(r.text)
            if m and m.group(1) in p:
                p.pop(m.group(1), None)
                continue
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            return None
    return None


def sync_enabled():
    if FORCE:
        return True
    try:
        rows = sb_get("app_settings", {"select": "value", "key": "eq.downer_sync_enabled", "limit": "1"})
        return bool(rows and rows[0].get("value") is True)
    except Exception as e:
        log(f"  ⚠  couldn't read downer_sync_enabled ({e}) — treating as paused")
        return False


def find_or_create_client(name, phone=None):
    name = (name or "").strip()
    if not name or name in ("VP", "VACANT"):
        return None
    existing = sb_get("clients", {"name": f"eq.{name}", "select": "id", "limit": "1"})
    if existing:
        return existing[0]["id"]
    created = sb_write_resilient("POST", "clients", {"name": name, "phone": phone or None})
    return created[0]["id"] if created else None


def create_alert(job_id, title, detail=None, dedupe_key=None):
    if not job_id:
        return
    try:
        requests.post(f"{SUPABASE_URL}/rest/v1/job_alerts",
                      headers={**sb_headers(), "Prefer": "resolution=ignore-duplicates,return=minimal"},
                      json={"job_id": job_id, "kind": "new_lead", "source": "portal",
                            "title": title, "detail": detail, "dedupe_key": dedupe_key},
                      timeout=20)
    except Exception as e:
        log(f"    ⚠  alert insert failed: {e}")


# ── Work-order → TreeCo job ───────────────────────────────────────────────────
def map_to_treeco(wo, client_id):
    parts = []
    if wo.get("ko_reference"): parts.append(f"KO Ref: {wo['ko_reference']}")
    if wo.get("priority"):     parts.append(f"Priority: {wo['priority']}")
    if wo.get("due"):          parts.append(f"Due: {wo['due']}")
    if wo.get("description"):   parts.append(wo["description"])
    return {
        "title":        wo.get("address") or wo.get("ko_reference") or "Downer work order",
        "address":      wo.get("address") or None,
        "job_type":     "Tree work",
        "status":       "new_lead",       # never auto-accepted — office quotes it
        "description":  "\n".join(parts) or None,
        "category":     "downer",
        "ko_reference": wo.get("ko_reference") or None,
        "priority":     wo.get("priority") or None,
        "client_id":    client_id,
    }


def upsert_jobs(work_orders):
    # Existing downer jobs, matched by ko_reference.
    existing = {}
    try:
        for row in sb_get("jobs", {"select": "id,ko_reference", "ko_reference": "not.is.null"}):
            if row.get("ko_reference"):
                existing[row["ko_reference"].strip()] = row["id"]
    except Exception as e:
        log(f"  ⚠  couldn't load existing jobs ({e})")

    created = updated = skipped = 0
    for wo in work_orders:
        ko = (wo.get("ko_reference") or "").strip()
        if not ko:
            skipped += 1
            continue
        client_id = find_or_create_client(wo.get("tenant_name"), wo.get("tenant_phone"))
        row = map_to_treeco(wo, client_id)
        if ko in existing:
            job_id = existing[ko]
            # Refresh details but NEVER the status (the sync never moves a job).
            sb_write_resilient("PATCH", "jobs",
                               {k: row[k] for k in ("title", "address", "description", "priority", "ko_reference")},
                               params={"id": f"eq.{job_id}"})
            updated += 1
        else:
            res = sb_write_resilient("POST", "jobs", row)
            job_id = res[0]["id"] if (res and isinstance(res, list)) else None
            created += 1
            log(f"    ✚ New Downer job: {row['title'][:60]}")
            if job_id:
                create_alert(job_id, "New Downer work order — quote it",
                             detail=wo.get("description") or f"Work order {ko} from MyWork.",
                             dedupe_key=f"{job_id}:new_lead")
    return {"created": created, "updated": updated, "skipped": skipped}


# ── Scrape the Issued work orders ─────────────────────────────────────────────
async def scrape_work_orders(page):
    """Heuristic extraction of the Issued list. VERIFY against the live DOM on the
    first supervised run and replace with precise row selectors."""
    # VERIFY: Home → Service Orders → Issued.
    for label in ("Service Orders", "Service Order"):
        el = page.get_by_text(re.compile(rf"^\s*{label}\s*$", re.I))
        if await el.count() > 0:
            await el.first.click()
            await page.wait_for_timeout(2500)
            break
    issued = page.get_by_text(re.compile(r"^\s*Issued\s*$", re.I))
    if await issued.count() > 0:
        await issued.first.click()
        await page.wait_for_timeout(2500)

    await page.wait_for_load_state("networkidle", timeout=15_000)
    await page.wait_for_timeout(1500)

    # VERIFY: work-order rows. Heuristic — scan table rows / list items for an
    # R-number (R1234567-1) or WO number; pull the address + a priority code.
    work_orders = []
    rows = await page.locator("tr, [role='row'], li").all()
    seen = set()
    for row in rows:
        text = (await row.text_content() or "").strip()
        if not text:
            continue
        ko_m = re.search(r"\bR\d{6,8}-\d+\b", text)
        wo_m = re.search(r"\bWO\d{6,9}\b", text)
        ref = (ko_m.group(0) if ko_m else (wo_m.group(0) if wo_m else None))
        if not ref or ref in seen:
            continue
        seen.add(ref)
        prio_m = re.search(r"\b(URG|URS|EPS|GNL|RSC|VSC|RM|PM)\b", text)
        # Address heuristic: a chunk with a street word / suburb in CAPS.
        addr_m = re.search(r"\d+[A-Za-z]?\s+[A-Z][A-Za-z'.\- ]+(?:ST|RD|AVE?|GRV|PL|CRES|CR|DR|TCE|WAY|CL|LANE|LN)\b[A-Za-z0-9 ,]*", text)
        work_orders.append({
            "ko_reference": ref,
            "priority": prio_m.group(1) if prio_m else None,
            "address": (addr_m.group(0).strip() if addr_m else None),
            "description": None,
        })
    return work_orders


async def run_once():
    if not sync_enabled():
        log("Downer sync is paused (app_settings.downer_sync_enabled). Set DOWNER_FORCE=1 to override.")
        return {"skipped": "paused"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        if not os.path.exists(DOWNER_STORAGE_STATE):
            log(f"✗ No Downer session ({DOWNER_STORAGE_STATE}) — flagging MFA reconnect.")
            flag_downer_mfa(True)
            await browser.close()
            return {"error": "no session"}
        context = await browser.new_context(storage_state=DOWNER_STORAGE_STATE)
        page = await context.new_page()
        try:
            await page.goto(DOWNER_URL, wait_until="networkidle", timeout=30_000)
            if not await downer_session_ok(page):
                log("✗ Downer session expired — flagging MFA reconnect and stopping.")
                flag_downer_mfa(True)
                return {"error": "session expired"}
            flag_downer_mfa(False)  # login works — clear any standing alert

            work_orders = await scrape_work_orders(page)
            log(f"  → {len(work_orders)} work order(s) found")
            summary = upsert_jobs(work_orders)
            log(f"✓ Done — {summary}")
            return summary
        finally:
            await browser.close()


async def main():
    if not SUPABASE_KEY:
        log("SUPABASE_SERVICE_KEY not set"); sys.exit(1)
    if POLL_SECONDS > 0:
        log(f"Downer sync — polling every {POLL_SECONDS}s")
        while True:
            try:
                await run_once()
            except Exception as e:
                log(f"pass error: {e}")
            await asyncio.sleep(POLL_SECONDS)
    else:
        print(json.dumps(await run_once()))


if __name__ == "__main__":
    asyncio.run(main())
