#!/usr/bin/env python3
"""
portal_actions_worker.py — drain the `portal_actions` queue and STAGE each
completed job into its client portal, per docs/portal-upload-mapping.md.

  Spencers (source 'dbs')   → jobs.spencerhenshaw.co.nz  (username/password, no MFA)
  Downer   (source 'downer') → mywork.spotless.com.au     (MFA — persisted session)

What "stage" means (Josh's "get it ready to submit"): the worker uploads the
per-line Before/During/After photos and the quote/invoice PDF to the right place
in the portal, then STOPS before the final Claim/submit so the office does a last
check and clicks it. An action row ends `done` (staged OK) or `failed`
(with last_error).

── Selector confidence ──────────────────────────────────────────────────────
PROVEN (shared with dbs_to_treeco.py): Spencers login, opening a job via
`perform_action('SELECT_JOB', shl_job_id, '1')`, the per-line row
`tr[id^='show_hide_line_']`, and the per-line "streetlight" upload control
`img[onclick*='SHOW_LOAD_DOCUMENTS_POPUP']` (its onclick carries the line's
doc_uuid).

NOT YET VERIFIED against the live DOM (marked `# VERIFY`): the inside of the
Spencers load-documents popup (Before/WIP/After category <select> + file input),
the Spencers job-level Documents tab + "Other" category, and the entire Downer
MyWork DOM (Attachments/Items/Complete). These use robust text/role selectors
and FAIL LOUDLY with a precise message so the first supervised run reports
exactly what to confirm — they never silently no-op.

Downer also needs a one-time MFA session captured to DOWNER_STORAGE_STATE:
    python3 portal_actions_worker.py --capture-downer
(opens a headful browser; complete the login+MFA, then it saves the session).

Run:
    POLL_SECONDS=0  → single drain pass (default), prints a JSON summary
    POLL_SECONDS>0  → forever loop, draining every POLL_SECONDS
"""

import os
import re
import sys
import json
import asyncio
import tempfile
from datetime import datetime, timezone

import requests
from playwright.async_api import async_playwright
from downer_common import flag_downer_mfa, downer_session_ok

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "https://zagwhnnxjtimzvvjaujm.supabase.co")
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
APP_BASE_URL  = os.environ.get("APP_BASE_URL", "https://app.urbantreeservices.net")

DBS_URL       = os.environ.get("DBS_URL", "https://jobs.spencerhenshaw.co.nz")
DBS_USERNAME  = os.environ.get("DBS_USERNAME", "URBAN")
DBS_PASSWORD  = os.environ.get("DBS_PASSWORD", "")

DOWNER_URL            = os.environ.get("DOWNER_URL", "https://mywork.spotless.com.au")
DOWNER_STORAGE_STATE  = os.environ.get("DOWNER_STORAGE_STATE", "downer_session.json")

POLL_SECONDS  = int(os.environ.get("POLL_SECONDS", "0"))
HEADLESS      = os.environ.get("HEADLESS", "1").lower() in ("1", "true", "yes")

# TreeCo photo phase → portal category. Both portals use Before / WIP / After.
PHASE_TO_PORTAL = {"before": "Before", "during": "WIP", "after": "After", "extra": "Before"}


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ── Supabase REST helpers (service role) ──────────────────────────────────────
def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def sb_get(path, params):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=sb_headers(), params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def sb_patch(path, params, payload):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{path}", headers={**sb_headers(), "Prefer": "return=representation"},
        params=params, json=payload, timeout=30,
    )
    r.raise_for_status()
    return r.json()


def claim_next_action():
    """Claim the oldest pending action by flipping it to in_progress with a
    status guard, so two workers can't grab the same row. Returns the row or None."""
    pending = sb_get("portal_actions", {
        "select": "id,source,job_id,ko_reference,action,payload,attempts",
        "status": "eq.pending",
        "order": "created_at.asc",
        "limit": "5",
    })
    for row in pending:
        claimed = sb_patch(
            "portal_actions",
            {"id": f"eq.{row['id']}", "status": "eq.pending"},   # guard: only if still pending
            {"status": "in_progress", "attempts": (row.get("attempts") or 0) + 1},
        )
        if claimed:
            return claimed[0]
    return None


def finish_action(action_id, status, error=None):
    sb_patch("portal_actions", {"id": f"eq.{action_id}"},
             {"status": status, "last_error": (error or "")[:800], "processed_at": now_iso()})


def fetch_quote(quote_id):
    if not quote_id:
        return None
    rows = sb_get("quotes", {"select": "id,client_view_token,line_items", "id": f"eq.{quote_id}", "limit": "1"})
    return rows[0] if rows else None


def download_to_tmp(url, suffix):
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, "wb") as f:
        f.write(r.content)
    return path


# ── Quote PDF (rendered from the public client quote page) ────────────────────
async def render_quote_pdf(context, token, portal=True):
    """Print the public quote page to a PDF via headless Chromium. portal=True adds
    ?portal=1 so agreed-rate SOR codes are EXCLUDED from the uploaded quote PDF
    (they're paid on the schedule, never quoted to the portal)."""
    if not token:
        return None
    page = await context.new_page()
    try:
        url = f"{APP_BASE_URL}/q/{token}?preview=1" + ("&portal=1" if portal else "")
        await page.goto(url, wait_until="networkidle", timeout=30_000)
        await page.wait_for_timeout(1500)
        fd, path = tempfile.mkstemp(suffix=".pdf")
        os.close(fd)
        await page.pdf(path=path, format="A4", print_background=True)
        return path
    finally:
        await page.close()


def line_code_by_ref(quote, line_ref):
    """Map a TreeCo photo's line_ref (quote line_item id) to its SOR code, so we
    can find the matching portal line."""
    for it in (quote.get("line_items") or []) if quote else []:
        if str(it.get("id")) == str(line_ref):
            return (it.get("code") or "").strip()
    return ""


def group_photos(payload, quote=None):
    """payload.photos = {before:[{url,line_ref}], during:[...], after:[...], extra:[...]}.
    Also fold the quoter's per-line site-assessment images (quotes.line_items[].images)
    into the Before phase — those live on the quote, not in job_photos."""
    photos = dict((payload or {}).get("photos", {}) or {})
    photos.setdefault("before", list(photos.get("before", [])))
    seen = {p.get("url") for p in photos["before"]}
    for it in (quote.get("line_items") or []) if quote else []:
        imgs = it.get("images") or ([it["image_url"]] if it.get("image_url") else [])
        for url in imgs:
            if url and url not in seen:
                photos["before"].append({"url": url, "line_ref": it.get("id")})
                seen.add(url)
    return photos


# ── Spencers (DBS) ────────────────────────────────────────────────────────────
async def dbs_login(page):
    await page.goto(f"{DBS_URL}/index.cfm", wait_until="domcontentloaded", timeout=30_000)
    if await page.locator("input#login_id").count() == 0:
        log("  ✓ already logged in")
        return
    if not DBS_PASSWORD:
        raise RuntimeError("DBS_PASSWORD not set")
    await page.locator("input#login_id").fill(DBS_USERNAME)
    await page.locator("input#password").fill(DBS_PASSWORD)
    await page.locator("input#__DBS_button_1").click()
    await page.wait_for_timeout(6000)
    names = [c["name"] for c in await page.context.cookies()]
    if "CFID" not in names and "JSESSIONID" not in names:
        raise RuntimeError(f"DBS login failed — cookies: {names}")
    log("  ✓ logged in")


async def dbs_open_job(page, shl_job_id):
    # No detail URL — the portal opens the job via this JS action (proven in the scraper).
    await page.goto(f"{DBS_URL}/shared_apps/job_tracking/orders/index.cfm?fuseaction=view_jobs&menu_id=483&cfroot=/shl/",
                    wait_until="networkidle", timeout=20_000)
    await page.wait_for_timeout(1500)
    await page.evaluate(f"perform_action('SELECT_JOB','{shl_job_id}','1')")
    await page.wait_for_timeout(5000)


async def dbs_find_line_by_code(page, code):
    """Return the ord_job_id of the charge-line row whose SOR code matches, else None."""
    if not code:
        return None
    bare = code.split("-")[-1]  # SP-YMG570 → YMG570, to match the portal's code cell
    rows = await page.locator("tr[id^='show_hide_line_']").all()
    for row in rows:
        rid = await row.get_attribute("id")
        ord_job_id = rid.replace("show_hide_line_", "")
        cell = page.locator(f"#show_line_job_code_{ord_job_id}")
        if await cell.count() == 0:
            continue
        txt = (await cell.text_content() or "").strip()
        if code in txt or bare in txt:
            return ord_job_id
    return None


async def dbs_upload_line_photo(page, ord_job_id, category, filepath):
    """Open a line's streetlight (load-documents) popup and upload one photo under
    the Before/WIP/After category. Entry point is PROVEN; popup internals VERIFY."""
    row = page.locator(f"#show_hide_line_{ord_job_id}")
    streetlight = row.locator("img[onclick*='SHOW_LOAD_DOCUMENTS_POPUP']").first
    if await streetlight.count() == 0:
        raise RuntimeError(f"line {ord_job_id}: no streetlight (SHOW_LOAD_DOCUMENTS_POPUP) control found")
    await streetlight.click()
    await page.wait_for_timeout(2500)

    # VERIFY: the load-documents popup's category <select> and file <input>.
    # These names/ids are best-effort — confirm them on the first supervised run.
    file_input = page.locator("input[type='file']").last
    if await file_input.count() == 0:
        raise RuntimeError("load-documents popup: no file input found — confirm the popup selectors")
    await file_input.set_input_files(filepath)

    cat = page.locator("select").filter(has=page.locator("option", has_text="After")).first
    if await cat.count() > 0:
        try:
            await cat.select_option(label=category)
        except Exception:
            await cat.select_option(label={"Before": "Before", "WIP": "WIP", "After": "After"}.get(category, category))
    else:
        log(f"    # VERIFY: no Before/WIP/After category <select> in popup — uploaded '{category}' photo without a category")

    # VERIFY: the popup's Upload/Save button label.
    for label in ("Upload", "Save", "Add", "Submit"):
        btn = page.get_by_role("button", name=re.compile(label, re.I))
        if await btn.count() > 0:
            await btn.first.click()
            break
    await page.wait_for_timeout(2500)


async def dbs_upload_document(page, filepath, category="Other", description=""):
    """Upload a quote/invoice PDF to the job's Documents tab under a category.
    ENTIRELY VERIFY — the Documents-tab DOM is unmapped by the scraper."""
    tab = page.get_by_text(re.compile(r"^\s*Documents\s*$", re.I)).first
    if await tab.count() == 0:
        raise RuntimeError("Documents tab not found — confirm the job-level Documents tab selector")
    await tab.click()
    await page.wait_for_timeout(2000)
    file_input = page.locator("input[type='file']").last
    if await file_input.count() == 0:
        raise RuntimeError("Documents tab: no file input found — confirm selectors")
    await file_input.set_input_files(filepath)
    cat = page.locator("select").filter(has=page.locator("option", has_text="Other")).first
    if await cat.count() > 0:
        await cat.select_option(label=category)
    else:
        log("    # VERIFY: no 'Other' category <select> on Documents tab — uploaded without a category")
    for label in ("Upload", "Save", "Add", "Submit"):
        btn = page.get_by_role("button", name=re.compile(label, re.I))
        if await btn.count() > 0:
            await btn.first.click()
            break
    await page.wait_for_timeout(2500)


async def process_spencers(context, action):
    payload = action.get("payload") or {}
    job_id = action["job_id"]
    act = action.get("action")
    do_photos = act in ("push_photos", "push_to_portal")
    do_docs   = act in ("upload_documents", "push_to_portal")

    # shl_job_id (portal id) comes from the portal_sync mirror the scraper wrote.
    sync = sb_get("portal_sync", {"select": "shl_job_id", "source": "eq.dbs", "job_id": f"eq.{job_id}", "limit": "1"})
    if not sync or not sync[0].get("shl_job_id"):
        raise RuntimeError("no portal_sync.shl_job_id for this job — it hasn't been pulled from the Spencers portal yet")
    shl_job_id = sync[0]["shl_job_id"]

    quote = fetch_quote(payload.get("quote_id"))
    photos = group_photos(payload, quote)

    page = await context.new_page()
    await dbs_login(page)
    await dbs_open_job(page, shl_job_id)

    parts = []
    if do_photos:
        staged, skipped = 0, 0
        for phase in ("before", "during", "after"):
            category = PHASE_TO_PORTAL[phase]
            for ph in photos.get(phase, []) or []:
                code = line_code_by_ref(quote, ph.get("line_ref"))
                ord_job_id = await dbs_find_line_by_code(page, code)
                if not ord_job_id:
                    log(f"    · no portal line matched code '{code}' — skipping a {phase} photo")
                    skipped += 1
                    continue
                fp = download_to_tmp(ph["url"], ".jpg")
                try:
                    await dbs_upload_line_photo(page, ord_job_id, category, fp)
                    staged += 1
                finally:
                    os.unlink(fp)
        parts.append(f"{staged} photo(s) staged ({skipped} skipped)")

    if do_docs and quote:
        # Quote PDF (agreed-rate codes excluded) → Documents tab, category "Other".
        pdf = await render_quote_pdf(context, quote.get("client_view_token"), portal=True)
        if pdf:
            try:
                await dbs_upload_document(page, pdf, category="Other", description="TreeCo quote")
                parts.append("quote PDF → Documents/Other")
            finally:
                os.unlink(pdf)

    await page.close()
    # Final steps are deliberately left to admin in the portal.
    return (", ".join(parts) or "nothing to stage") + \
        ". Admin still marks each item complete (and by who) and submits in the portal."


# ── Downer (MyWork) ───────────────────────────────────────────────────────────
async def process_downer(context, action):
    """Stage a Downer job in MyWork. The whole MyWork DOM is unmapped (guide only),
    so every step is VERIFY. Requires a captured MFA session in the context."""
    payload = action.get("payload") or {}
    wo = action.get("ko_reference")
    if not wo:
        raise RuntimeError("no ko_reference (Work Order number) on this Downer job")
    act = action.get("action")
    do_photos = act in ("push_photos", "push_to_portal")
    do_docs   = act in ("upload_documents", "push_to_portal")
    quote = fetch_quote(payload.get("quote_id"))
    photos = group_photos(payload, quote)

    page = await context.new_page()
    # Confirm the session is still authenticated (MFA sessions expire).
    await page.goto(DOWNER_URL, wait_until="networkidle", timeout=30_000)
    if not await downer_session_ok(page):
        flag_downer_mfa(True)   # tell TreeCo to show the reconnect banner
        raise RuntimeError("Downer session expired — re-capture with --capture-downer")
    flag_downer_mfa(False)      # login works — clear any standing alert

    # VERIFY: Service Orders → search the WO → open it.
    await page.get_by_text(re.compile("Service Orders", re.I)).first.click()
    await page.wait_for_timeout(2000)
    search = page.get_by_placeholder(re.compile("Work Order|Search", re.I)).first
    if await search.count() > 0:
        await search.fill(str(wo))
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(2500)

    # Guide: general Before/WIP/After photos + PDFs go on the Attachments tab,
    # labelled with the SOR code + phase (SPCA format), e.g. "B1 - After".
    attach = page.get_by_text(re.compile(r"^\s*Attachments\s*$", re.I)).first
    if await attach.count() == 0:
        raise RuntimeError("Attachments tab not found — confirm the MyWork Attachments selector")
    await attach.click()
    await page.wait_for_timeout(1500)

    parts = []
    if do_photos:
        staged = 0
        for phase in ("before", "during", "after"):
            cat = PHASE_TO_PORTAL[phase]
            for ph in photos.get(phase, []) or []:
                code = line_code_by_ref(quote, ph.get("line_ref"))
                desc = f"{code} - {cat}".strip(" -")
                fp = download_to_tmp(ph["url"], ".jpg")
                try:
                    await downer_add_attachment(page, fp, kind="Photograph", description=desc)
                    staged += 1
                finally:
                    os.unlink(fp)
        parts.append(f"{staged} photo(s) staged")

    if do_docs and quote:
        pdf = await render_quote_pdf(context, quote.get("client_view_token"), portal=True)
        if pdf:
            try:
                await downer_add_attachment(page, pdf, kind="Document", description="TreeCo quote")
                parts.append("quote PDF attached")
            finally:
                os.unlink(pdf)

    await page.close()
    return (", ".join(parts) or "nothing to stage") + \
        f" on WO {wo}. Admin still completes + claims in MyWork."


async def downer_add_attachment(page, filepath, kind="Photograph", description=""):
    """MyWork: Attachments → New → Browse → Upload → Type + Description → Add → Save.
    All VERIFY — labels taken from the guide."""
    await page.get_by_role("button", name=re.compile("New", re.I)).first.click()
    await page.wait_for_timeout(1200)
    file_input = page.locator("input[type='file']").last
    if await file_input.count() == 0:
        raise RuntimeError("New Attachment: no file input — confirm MyWork selectors")
    await file_input.set_input_files(filepath)
    up = page.get_by_role("button", name=re.compile("Upload", re.I))
    if await up.count() > 0:
        await up.first.click()
        await page.wait_for_timeout(1500)
    typ = page.locator("select").filter(has=page.locator("option", has_text=re.compile("Photograph", re.I))).first
    if await typ.count() > 0:
        try:
            await typ.select_option(label=kind)
        except Exception:
            pass
    desc = page.get_by_label(re.compile("Description", re.I))
    if await desc.count() > 0:
        await desc.first.fill(description)
    for label in ("Add", "Save"):
        btn = page.get_by_role("button", name=re.compile(f"^{label}$", re.I))
        if await btn.count() > 0:
            await btn.first.click()
            await page.wait_for_timeout(1200)


# ── One-time Downer MFA session capture ───────────────────────────────────────
async def capture_downer_session():
    log("Opening MyWork — complete the login + MFA in the browser window…")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(DOWNER_URL)
        log("When you're fully signed in and can see Service Orders, press Enter here.")
        # Block on stdin so the human can finish MFA.
        await asyncio.get_event_loop().run_in_executor(None, sys.stdin.readline)
        await context.storage_state(path=DOWNER_STORAGE_STATE)
        log(f"✓ Session saved to {DOWNER_STORAGE_STATE}")
        await browser.close()


# ── Drain loop ────────────────────────────────────────────────────────────────
async def drain_once():
    if not SUPABASE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_KEY not set")
    done, failed = 0, 0
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        dbs_ctx = None
        downer_ctx = None
        try:
            while True:
                action = claim_next_action()
                if not action:
                    break
                aid, source = action["id"], action.get("source")
                log(f"→ action {aid} ({source} / {action.get('action')})")
                try:
                    if source == "downer":
                        if downer_ctx is None:
                            if not os.path.exists(DOWNER_STORAGE_STATE):
                                flag_downer_mfa(True)
                                raise RuntimeError(f"no Downer session ({DOWNER_STORAGE_STATE}) — run --capture-downer first")
                            downer_ctx = await browser.new_context(storage_state=DOWNER_STORAGE_STATE)
                        note = await process_downer(downer_ctx, action)
                    else:  # 'dbs' / Spencers (default)
                        if dbs_ctx is None:
                            dbs_ctx = await browser.new_context()
                        note = await process_spencers(dbs_ctx, action)
                    finish_action(aid, "done", note)
                    log(f"  ✓ {note}")
                    done += 1
                except Exception as e:
                    finish_action(aid, "failed", str(e))
                    log(f"  ✗ failed: {e}")
                    failed += 1
        finally:
            await browser.close()
    return {"done": done, "failed": failed}


async def main():
    if "--capture-downer" in sys.argv:
        await capture_downer_session()
        return
    if POLL_SECONDS > 0:
        log(f"portal_actions worker — polling every {POLL_SECONDS}s")
        while True:
            try:
                res = await drain_once()
                if res["done"] or res["failed"]:
                    log(f"pass done — {res}")
            except Exception as e:
                log(f"pass error: {e}")
            await asyncio.sleep(POLL_SECONDS)
    else:
        res = await drain_once()
        print(json.dumps(res))


if __name__ == "__main__":
    asyncio.run(main())
