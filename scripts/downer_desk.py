#!/usr/bin/env python3
"""
downer_desk.py — the reliable Downer (MyWork/Spotless) inbound sync.

Why this exists (and supersedes the headless downer_to_treeco.py approach):
MyWork sits behind Microsoft Entra (Azure AD) SSO on a SharePoint site, with the
tenant's "keep me signed in" DISABLED. That means the login only lives in a
*running* browser's memory — it does NOT survive being saved to disk and
reloaded, and it does NOT survive closing/reopening the browser. We proved this:
storage_state reuse and a persistent user-data-dir profile BOTH dropped back to
the login page on the next launch, but the session survives indefinitely inside
one long-lived browser process.

So this worker keeps a single authenticated browser OPEN and polls in a loop:
  • You log in once at startup (approve MFA on your phone).
  • Every few minutes it loads the "Issued" order list and reads the SAME data
    feed the page fetches — the MyWork API at
    as-myworkapi-prod.azurewebsites.net/api/serviceorders/getbyquery/issued —
    which returns clean JSON (no scraping). New orders become TreeCo
    category:'downer' new_lead jobs (never auto-accepted; the office quotes them).
  • If Microsoft ever forces a re-login, it raises the 'downer_mfa' alert (red
    banner in TreeCo), prints "log in again in this window", waits for you to
    re-approve, then resumes — no restart, no session files.

This is meant to run on an always-on office machine with a screen (it's headful
by design — MFA needs a human at startup). It is NOT a Fly.io worker.

Env:  SUPABASE_URL, SUPABASE_SERVICE_KEY  (put them in scripts/.env)
      DOWNER_POLL_SECONDS  (default 300)
      DOWNER_FORCE=1       (ignore the app_settings pause gate)
"""

import os
import sys
import asyncio


def _load_dotenv(path=".env"):
    """Load scripts/.env before importing anything that reads os.environ at import
    time — so `python3 downer_desk.py` works with no shell `export`/`set -a` step
    (that's exactly where keys get mangled). Robust to `export KEY=…`, quotes, and
    blank/comment lines; .env wins over an existing (possibly mangled) env var."""
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.replace("export ", "").strip()
                v = v.strip().strip('"').strip("'")
                if k:
                    os.environ[k] = v
    except FileNotFoundError:
        pass


_load_dotenv()

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

from downer_common import flag_downer_mfa
from downer_to_treeco import (
    SUPABASE_KEY, sb_get, sb_write_resilient, find_or_create_client,
    create_alert, sync_enabled, log,
)

ROOT   = os.environ.get("DOWNER_URL", "https://mywork.spotless.com.au")
ISSUED = ("https://spotlessau1prod.sharepoint.com/sites/mywork/subcontractor/"
          "serviceOrders/pages/orderlist.aspx?q=issued")
API_ISSUED = "getbyquery/issued"          # the data feed the page fetches
POLL_SECONDS = int(os.environ.get("DOWNER_POLL_SECONDS", "300"))


# ── Map a MyWork ServiceOrder → a TreeCo job ─────────────────────────────────
def map_order(o):
    """Turn one ServiceOrder record (from the getbyquery/issued feed) into the
    fields TreeCo stores. Every path is defensive — MyWork omits/nulls fields
    depending on the order's stage."""
    loc = o.get("JobLocation") or {}
    td  = o.get("TaskDescription") or {}
    cc  = o.get("ClientAndContactDetails") or {}
    dt  = o.get("DatesTargets") or {}

    order_no = (td.get("OrderNumber") or "").strip()          # R6622028-1  (human ref)
    so_id    = str(o.get("ServiceOrder_ID") or "").strip()
    job_title = (td.get("JobTitle") or "").strip()            # the actual work description
    full_addr = (loc.get("BuildingAddress") or "").strip()
    line1     = (loc.get("BuildingAddressLine1") or "").strip()
    suburb    = (loc.get("BuildingSuburb") or "").strip()
    resp_code = (td.get("ResponseTypeCode") or "").strip()    # GNL / URG / ...
    resp_name = (td.get("ResponseType") or "").strip()

    short_addr = ", ".join([p for p in (line1, suburb) if p]) or full_addr
    title = short_addr or order_no or "Downer work order"

    parts = []
    if order_no:                       parts.append(f"Order: {order_no}")
    if resp_code:                      parts.append(f"Response: {resp_name or resp_code} ({resp_code})")
    if td.get("JobType"):              parts.append(f"Type: {td.get('JobType')}")
    if td.get("SubStatus"):            parts.append(f"Status: {td.get('SubStatus')}")
    if dt.get("OnsiteDateTime"):       parts.append(f"Onsite: {str(dt['OnsiteDateTime'])[:16].replace('T', ' ')}")
    if dt.get("CompleteDateTime"):     parts.append(f"Complete by: {str(dt['CompleteDateTime'])[:10]}")
    if loc.get("AccessNotes"):         parts.append(str(loc["AccessNotes"]))
    contact = (cc.get("JobContact") or "").strip()
    if contact:                        parts.append(f"Contact: {contact} {cc.get('JobContactNo') or ''}".strip())
    if job_title:                      parts.append("\n" + job_title)

    return {
        "customer": (cc.get("Customer") or "").strip() or None,   # e.g. "Kāinga Ora"
        "ref":      order_no or so_id,                            # dedupe / match key
        "job": {
            "title":        title[:160],
            "address":      full_addr or None,
            "job_type":     "Tree work",
            "status":       "new_lead",          # sync never auto-accepts
            "description":  "\n".join(parts) or None,
            "category":     "downer",
            "ko_reference": order_no or so_id,
            "priority":     resp_code or None,
        },
    }


def upsert_orders(mapped):
    """Insert new Downer jobs, refresh existing ones (details only — NEVER the
    status; the sync must never move a job through the pipeline)."""
    existing = {}
    try:
        for row in sb_get("jobs", {"select": "id,ko_reference", "ko_reference": "not.is.null"}):
            if row.get("ko_reference"):
                existing[row["ko_reference"].strip()] = row["id"]
    except Exception as e:
        log(f"  ⚠  couldn't load existing jobs ({e})")

    created = updated = skipped = 0
    for m in mapped:
        ref = (m["ref"] or "").strip()
        if not ref:
            skipped += 1
            continue
        job = dict(m["job"])
        client_id = find_or_create_client(m.get("customer"))
        if client_id:
            job["client_id"] = client_id

        if ref in existing:
            jid = existing[ref]
            sb_write_resilient(
                "PATCH", "jobs",
                {k: job[k] for k in ("title", "address", "description", "priority") if k in job},
                params={"id": f"eq.{jid}"},
            )
            updated += 1
        else:
            res = sb_write_resilient("POST", "jobs", job)
            jid = res[0]["id"] if (res and isinstance(res, list)) else None
            created += 1
            log(f"   ✚ {ref}  {job.get('address') or job.get('title')}")
            if jid:
                create_alert(jid, "New Downer work order — quote it",
                             detail=job.get("description"),
                             dedupe_key=f"{jid}:new_lead")
    return {"created": created, "updated": updated, "skipped": skipped}


# ── Read the Issued feed through the live, logged-in page ─────────────────────
async def fetch_issued(page):
    """Load the Issued list and capture the JSON the page fetches from the MyWork
    API. Raises PWTimeout if the feed never arrives (i.e. we've been bounced to
    the login page) so the caller can trigger the reconnect flow."""
    async with page.expect_response(
        lambda r: API_ISSUED in r.url and r.status == 200, timeout=45_000
    ) as ri:
        await page.goto(ISSUED, wait_until="domcontentloaded")
    resp = await ri.value
    data = await resp.json()
    so = (data.get("d") or {}).get("ServiceOrderSet") or {}
    orders = so.get("ServiceOrders") or []
    try:
        match = int((so.get("QueryControl") or {}).get("QueryMatchCount") or len(orders))
    except (TypeError, ValueError):
        match = len(orders)

    # The page asks for take=10; if there are more, re-request the full set using
    # the same auth header the page just used.
    if match > len(orders):
        try:
            hdrs = await resp.request.all_headers()
            auth = {k: v for k, v in hdrs.items()
                    if k.lower() in ("authorization", "accept", "x-requested-with")}
            base = resp.url.split("?")[0]
            more = await page.context.request.get(f"{base}?skip=0&take={match + 5}", headers=auth)
            j = await more.json()
            orders = (((j.get("d") or {}).get("ServiceOrderSet") or {}).get("ServiceOrders")) or orders
        except Exception as e:
            log(f"   (using {len(orders)} of {match}; full fetch failed: {e})")
    return orders


async def wait_for_relogin(page):
    """MyWork bounced us to the login page. Flag it in TreeCo, ask the human to
    re-auth in the SAME window, and wait — no restart, no session files."""
    flag_downer_mfa(True)
    log("⚠️  MyWork wants a fresh login.")
    print("\n" + "=" * 62)
    print("  Please LOG IN again in the open browser window (approve MFA).")
    print("  When you're back on the MyWork home page, press Enter here.")
    print("=" * 62, flush=True)
    try:
        await page.goto(ROOT, wait_until="domcontentloaded")
    except Exception:
        pass
    await asyncio.get_event_loop().run_in_executor(None, input)
    flag_downer_mfa(False)
    log("Thanks — resuming sync.")


async def main():
    if not SUPABASE_KEY:
        print("SUPABASE_SERVICE_KEY not set — put it in scripts/.env (see the launcher).")
        sys.exit(1)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()
        await page.goto(ROOT)
        print("\n" + "=" * 62)
        print("  A browser opened on MyWork. Sign in + approve MFA, get to the")
        print("  MyWork home page, then come back here and press Enter.")
        print("=" * 62, flush=True)
        await asyncio.get_event_loop().run_in_executor(None, input)
        flag_downer_mfa(False)
        log(f"Downer Desk running — checking Issued orders every {POLL_SECONDS}s. "
            f"Leave this window open. Ctrl+C to stop.")

        while True:
            try:
                if not sync_enabled():
                    log("Sync is paused (app_settings.downer_sync_enabled=false). "
                        "Flip it on, or set DOWNER_FORCE=1.")
                else:
                    orders = await fetch_issued(page)
                    summary = upsert_orders([map_order(o) for o in orders])
                    log(f"✓ {len(orders)} issued order(s) — {summary}")
                    flag_downer_mfa(False)
            except PWTimeout:
                await wait_for_relogin(page)
                continue
            except KeyboardInterrupt:
                break
            except Exception as e:
                log(f"pass error: {e}")
            await asyncio.sleep(POLL_SECONDS)

        await browser.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDowner Desk stopped.")
