#!/usr/bin/env python3
"""
DBS Portal → TreeCo sync
========================
Pulls active jobs from Spencer Henshaw DBS portal, navigates into each job's
detail page, extracts notes, charge lines (SOR codes) and spotlight images,
then upserts everything into the TreeCo Supabase database.

Environment:
    DBS_PASSWORD            required
    SUPABASE_URL            required
    SUPABASE_SERVICE_KEY    required
    DBS_USERNAME            optional, default URBAN
    DBS_URL                 optional
    DBS_HEADLESS            set to 1 for headless
    DBS_TEST_ONE            set to 1 to process only first job

Usage:
    source scripts/.env && python3 scripts/dbs_to_treeco.py
"""

import asyncio
import base64
import json
import os
import re
import sys
from datetime import datetime

import requests
from playwright.async_api import async_playwright, Page

# ── Config ────────────────────────────────────────────────────────────────────

DBS_URL      = os.environ.get("DBS_URL", "https://jobs.spencerhenshaw.co.nz")
DBS_USERNAME = os.environ.get("DBS_USERNAME", "URBAN")
DBS_PASSWORD = os.environ.get("DBS_PASSWORD", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zagwhnnxjtimzvvjaujm.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
HEADLESS     = os.environ.get("DBS_HEADLESS", "").strip() in ("1", "true", "yes")
TEST_ONE     = os.environ.get("DBS_TEST_ONE", "").strip() in ("1", "true", "yes")

JOBS_PATH      = "/shared_apps/job_tracking/orders/index.cfm?fuseaction=view_jobs&menu_id=483&cfroot=/shl/"
DOC_PATH       = "/shared_apps//documents/index.cfm?fuseaction=documents&cfroot=/shl/&DBSDocumentsKey_document_access_key="
STORAGE_BUCKET = "job-images"


def log(msg):
    print(msg, file=sys.stderr, flush=True)


# ── Status mapping ────────────────────────────────────────────────────────────

def map_status(portal_status, approved, notes):
    s = portal_status.strip().lower()
    has_approval = approved or bool(re.search(r'approv', notes, re.IGNORECASE))
    if s in ("completed", "complete"):
        return "complete_to_invoice"
    if s == "cancelled":
        return "on_hold"
    if s == "started":
        return "scheduled"
    return "accepted_to_schedule" if has_approval else "new_lead"


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

def sb_get(path, params=None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=sb_headers(), params=params)
    r.raise_for_status()
    return r.json()

def sb_upsert(table, rows):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}",
        headers={**sb_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        json=rows,
    )
    r.raise_for_status()
    return r.json()

def find_or_create_client(name, phone):
    if not name or name.strip() in ("", "VP", "VACANT"):
        return None
    name = name.strip()
    existing = sb_get("clients", {"name": f"eq.{name}", "select": "id"})
    if existing:
        return existing[0]["id"]
    created = sb_upsert("clients", [{"name": name, "phone": phone or None}])
    return created[0]["id"] if created else None

def upload_image(image_bytes, filename, mime="image/jpeg"):
    path = f"dbs/{filename}"
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": mime,
            "x-upsert": "true",
        },
        data=image_bytes,
    )
    if r.status_code in (200, 201):
        return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    log(f"    ⚠  Image upload failed ({r.status_code}): {r.text[:200]}")
    return None


# ── DBS login ─────────────────────────────────────────────────────────────────

async def dbs_login(page):
    if await page.locator("input#login_id").count() == 0:
        log("  ✓ Already logged in")
        return
    if not DBS_PASSWORD:
        raise RuntimeError("DBS_PASSWORD not set")
    await page.locator("input#login_id").fill(DBS_USERNAME)
    await page.locator("input#password").fill(DBS_PASSWORD)
    await page.locator("input#__DBS_button_1").click()
    await page.wait_for_timeout(6000)
    cookies = await page.context.cookies()
    names = [c["name"] for c in cookies]
    if "CFID" not in names and "JSESSIONID" not in names:
        raise RuntimeError(f"DBS login failed — cookies: {names}")
    log("  ✓ Logged in")


# ── Job list ──────────────────────────────────────────────────────────────────

async def extract_all_jobs(page):
    rows = await page.locator("table tr").all()
    jobs = []
    for row in rows:
        cells = await row.locator("td").all()
        if len(cells) < 20:
            continue
        texts = [(await c.text_content() or "").strip() for c in cells]
        job_id_raw = texts[1] if len(texts) > 1 else ""
        if not re.fullmatch(r"\d{5,8}", job_id_raw):
            continue
        jobs.append({
            "shl_job_id":    texts[1],
            "shl_order":     texts[2]  if len(texts) > 2  else "",
            "address":       texts[3]  if len(texts) > 3  else "",
            "tenant_name":   texts[4]  if len(texts) > 4  else "",
            "tenant_phone":  texts[5]  if len(texts) > 5  else "",
            "ko_reference":  texts[6]  if len(texts) > 6  else "",
            "job_type":      texts[8]  if len(texts) > 8  else "",
            "priority":      texts[12] if len(texts) > 12 else "",
            "from_date":     texts[14] if len(texts) > 14 else "",
            "due_date":      texts[15] if len(texts) > 15 else "",
            "portal_status": texts[16] if len(texts) > 16 else "",
            "description":   texts[18] if len(texts) > 18 else "",
            "approved":      "✓" in (texts[20] if len(texts) > 20 else ""),
            "value":         texts[21] if len(texts) > 21 else "",
            # Populated by detail scrape:
            "notes":         [],
            "charge_lines":  [],
        })
    log(f"  → Found {len(jobs)} jobs in DBS list")
    return jobs


# ── Download image via browser session ───────────────────────────────────────

async def browser_fetch_image(page, url):
    """Download an image URL using the browser's authenticated session."""
    try:
        result = await page.evaluate("""async (url) => {
            const resp = await fetch(url, {credentials: 'include'});
            if (!resp.ok) return null;
            const buf = await resp.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let b = '';
            bytes.forEach(x => b += String.fromCharCode(x));
            return btoa(b);
        }""", url)
        if result:
            return base64.b64decode(result)
    except Exception as e:
        log(f"      ⚠  fetch error: {e}")
    return None


# ── Spotlight image scrape ────────────────────────────────────────────────────

async def scrape_document_images(page, doc_uuid, job_id, code):
    """
    Navigate to the DBS document viewer for a charge line and return
    a list of public Supabase storage URLs for all uploaded photos.
    """
    if not doc_uuid:
        return []

    doc_url = f"{DBS_URL}{DOC_PATH}{doc_uuid}"
    doc_page = await page.context.new_page()
    try:
        await doc_page.goto(doc_url, timeout=20_000)
        await doc_page.wait_for_load_state("networkidle", timeout=15_000)
        await doc_page.wait_for_timeout(1500)

        html = await doc_page.content()
        # Thumbnails are at /thumbnails/YEAR/YEAR_M/YEAR_M_D/ORDER_ID/NAME_thumb.jpeg
        thumb_urls = re.findall(
            r'https://[^"\']*?/thumbnails/[^"\']+_thumb\.(?:jpeg|jpg|png)',
            html, re.IGNORECASE
        )

        uploaded = []
        for thumb_url in thumb_urls:
            # Full size = remove _thumb suffix
            full_url = re.sub(r'_thumb(\.(?:jpeg|jpg|png))', r'\1', thumb_url, flags=re.IGNORECASE)
            img_bytes = await browser_fetch_image(doc_page, full_url)
            if not img_bytes:
                img_bytes = await browser_fetch_image(doc_page, thumb_url)
            if img_bytes:
                # Sanitise filename
                fname_raw = full_url.split("/")[-1]
                fname = re.sub(r'[^a-zA-Z0-9._-]', '_', fname_raw)
                fname = f"{job_id}_{code}_{fname}"
                pub_url = upload_image(img_bytes, fname)
                if pub_url:
                    uploaded.append(pub_url)
                    log(f"      ✓ Photo uploaded: {fname}")
    except Exception as e:
        log(f"    ⚠  Document page error: {e}")
    finally:
        await doc_page.close()

    return uploaded


# ── Job detail scrape ─────────────────────────────────────────────────────────

async def extract_job_detail(page, job):
    job_id   = job["shl_job_id"]
    shl_order = job.get("shl_order", "")

    log(f"    → Navigating to job {job_id}…")
    try:
        await page.evaluate(f"perform_action('SELECT_JOB','{job_id}','1')")
        await page.wait_for_timeout(5000)
    except Exception as e:
        log(f"    ⚠  Navigation error: {e}")
        return job

    # ── Notes ────────────────────────────────────────────────────────────────
    # Notes are in #order_comments rows: date | author | text
    notes = []
    try:
        comment_rows = await page.locator("#order_comments tr").all()
        for row in comment_rows:
            cells = await row.locator("td").all()
            if len(cells) < 3:
                continue
            date   = (await cells[0].text_content() or "").strip()
            author = (await cells[1].text_content() or "").strip()
            text   = (await cells[-1].text_content() or "").strip()
            if text and re.match(r"\d{1,2}/\d{1,2}/\d{4}", date):
                notes.append({"date": date, "author": author, "text": text})
    except Exception as e:
        log(f"    ⚠  Notes error: {e}")

    job["notes"] = notes
    if notes:
        log(f"    → {len(notes)} notes extracted")

    # ── Charge lines ─────────────────────────────────────────────────────────
    # Existing lines are in rows: tr[id^="show_hide_line_"]
    charge_lines = []
    try:
        line_rows = await page.locator("tr[id^='show_hide_line_']").all()
        for row in line_rows:
            row_id = await row.get_attribute("id") or ""
            ord_job_id = row_id.replace("show_hide_line_", "")
            if not ord_job_id.isdigit():
                continue

            # SOR code
            code_el = page.locator(f"#show_line_job_code_{ord_job_id}")
            code = (await code_el.text_content() or "").strip() if await code_el.count() > 0 else ""
            # Full description from title attribute on code span
            full_desc_title = await code_el.get_attribute("title") or "" if await code_el.count() > 0 else ""

            # Description text (td after code td — look for the adjacent text td)
            # Row cells: location | code | desc | uom | ... | notes | qty | rate | total
            cells = await row.locator("td").all()
            cell_texts = [(await c.text_content() or "").strip() for c in cells]

            # Extract desc and uom by position relative to code cell
            desc = ""
            uom  = ""
            for i, ct in enumerate(cell_texts):
                if ct.strip() == code:
                    desc = cell_texts[i+1] if i+1 < len(cell_texts) else ""
                    uom  = cell_texts[i+2] if i+2 < len(cell_texts) else ""
                    break

            # Line-level notes
            notes_el = page.locator(f"#job_notes_dis_{ord_job_id}")
            line_note = (await notes_el.text_content() or "").strip() if await notes_el.count() > 0 else ""

            # Qty
            qty_el = page.locator(f"#show_line_job_qty_{ord_job_id}")
            qty = (await qty_el.text_content() or "").strip() if await qty_el.count() > 0 else ""

            # Rate — use title attribute for clean number
            rate_el = page.locator(f"#show_line_rate_{ord_job_id}")
            rate = ""
            if await rate_el.count() > 0:
                rate = await rate_el.get_attribute("title") or (await rate_el.text_content() or "").strip()

            # Total — use title attribute
            total_el = page.locator(f"#show_line_total_{ord_job_id}")
            total = ""
            if await total_el.count() > 0:
                total = await total_el.get_attribute("title") or (await total_el.text_content() or "").strip()

            # Document UUID (spotlight photos)
            doc_uuid = ""
            try:
                doc_onclick = await row.locator(
                    "img[onclick*='SHOW_LOAD_DOCUMENTS_POPUP']"
                ).first.get_attribute("onclick") or ""
                m = re.search(r"SHOW_LOAD_DOCUMENTS_POPUP','([^']+)'", doc_onclick)
                if m:
                    doc_uuid = m.group(1)
            except Exception:
                pass

            # Download spotlight images
            images = []
            if doc_uuid:
                images = await scrape_document_images(page, doc_uuid, job_id, code)

            if code:
                cl = {
                    "ord_job_id": ord_job_id,
                    "code":       code,
                    "desc":       desc or full_desc_title[:80],
                    "uom":        uom,
                    "line_note":  line_note,
                    "qty":        qty,
                    "rate":       rate,
                    "total":      total,
                    "doc_uuid":   doc_uuid,
                    "images":     images,
                }
                charge_lines.append(cl)
                log(f"    + {code}  {desc[:40]}  qty={qty}  total={total}  photos={len(images)}")

    except Exception as e:
        log(f"    ⚠  Charge lines error: {e}")

    job["charge_lines"] = charge_lines
    if charge_lines:
        log(f"    → {len(charge_lines)} charge lines extracted")

    return job


# ── Map to TreeCo ─────────────────────────────────────────────────────────────

def map_to_treeco(dbs, client_id):
    ko   = dbs["ko_reference"].strip()
    addr = dbs["address"].strip()
    pri  = dbs["priority"].strip()
    desc = dbs["description"].strip()

    # Title: SP — Tenant Name (KO priority + ref in description, not title)
    tenant = dbs.get("tenant_name", "").strip()
    title = f"SP — {tenant}" if tenant else f"SP — {ko}" if ko else f"SP — Job {dbs['shl_job_id']}"

    # Value
    value_raw = re.sub(r"[^\d.]", "", dbs.get("value", "") or "")
    value = float(value_raw) if value_raw else None

    # Build description with charge lines appended
    desc_parts = [
        f"KO Ref: {ko}" if ko else None,
        f"SHL Job: {dbs['shl_job_id']} / Order: {dbs['shl_order']}",
        f"Priority: {pri}" if pri else None,
        f"Due: {dbs['due_date']}" if dbs.get("due_date") else None,
        f"Type: {dbs['job_type']}" if dbs.get("job_type") else None,
        "",
        desc,
    ]

    charge_lines = dbs.get("charge_lines", [])
    if charge_lines:
        desc_parts += ["", "─── Charge Lines ───"]
        for cl in charge_lines:
            s = f"{cl['code']}  {cl['desc']}"
            if cl.get("qty"):   s += f"  ×{cl['qty']}"
            if cl.get("total"): s += f"  = ${cl['total']}"
            if cl.get("line_note"): s += f"  [{cl['line_note']}]"
            if cl.get("images"): s += f"  📷{len(cl['images'])}"
            desc_parts.append(s)

    full_desc = "\n".join(x for x in desc_parts if x is not None)

    # Private notes: combine all note entries
    notes = dbs.get("notes", [])
    private_notes = None
    if notes:
        private_notes = "\n\n".join(
            f"{n['date']} ({n['author']}):\n{n['text']}" for n in notes
        )

    status = map_status(dbs["portal_status"], dbs["approved"], desc)

    return {
        "title":           title,
        "address":         addr or None,
        "job_type":        dbs["job_type"] or None,
        "description":     full_desc,
        "private_notes":   private_notes,
        "status":          status,
        "estimated_value": value,
        "client_id":       client_id,
    }


# ── Supabase upsert ───────────────────────────────────────────────────────────

def _try_post(payload):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/jobs",
        headers={**sb_headers(), "Prefer": "return=representation"},
        json=payload,
    )
    if r.status_code == 400 and "private_notes" in r.text:
        payload.pop("private_notes", None)
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/jobs",
            headers={**sb_headers(), "Prefer": "return=representation"},
            json=payload,
        )
    r.raise_for_status()
    try:
        return r.json()
    except Exception:
        return None


def create_quote_from_charge_lines(job_id, client_id, charge_lines):
    """Create a quote with line items from DBS charge lines."""
    if not charge_lines:
        return

    # Build line_items JSONB array
    line_items = []
    subtotal = 0.0
    for i, cl in enumerate(charge_lines):
        # Parse total — strip commas and currency symbols
        total_raw = re.sub(r"[^\d.]", "", cl.get("total", "") or "")
        qty_raw   = re.sub(r"[^\d.]", "", cl.get("qty", "") or "")
        total_val = float(total_raw) if total_raw else 0.0
        qty_val   = float(qty_raw)   if qty_raw   else 1.0

        # Rate = total / qty; fallback to 0
        rate_val = round(total_val / qty_val, 2) if qty_val else 0.0

        desc = f"{cl['code']} — {cl['desc']}"
        detail = cl.get("line_note", "") or ""
        if cl.get("location"):
            detail = f"{cl['location']} {detail}".strip()

        item = {
            "id":          str(i + 1),
            "description": desc,
            "detail":      detail,
            "qty":         qty_val,
            "rate":        rate_val,
            "optional":    False,
            "selected":    True,
        }
        images = cl.get("images", [])
        if images:
            item["image_url"] = images[0]       # primary image on line item
            item["images"]    = images           # all images for gallery
        line_items.append(item)
        subtotal += total_val

    gst     = round(subtotal * 0.15, 2)
    total   = round(subtotal + gst, 2)

    # Fetch a client_view_token (random-ish slug)
    import hashlib
    token = hashlib.md5(f"{job_id}-dbs".encode()).hexdigest()[:14]

    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/quotes",
        headers={**sb_headers(), "Prefer": "return=representation"},
        json={
            "job_id":            job_id,
            "client_id":         client_id,
            "status":            "draft",
            "line_items":        line_items,
            "subtotal":          subtotal,
            "gst":               gst,
            "total":             total,
            "client_view_token": token,
        },
    )
    if r.status_code not in (200, 201):
        log(f"      ⚠  Quote create failed: {r.text[:120]}")
    else:
        log(f"      ✓ Quote created — {len(line_items)} line items  (${total:.2f} incl GST)")

def _try_patch(job_id, payload):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/jobs",
        headers={**sb_headers(), "Prefer": "return=representation"},
        params={"id": f"eq.{job_id}"},
        json=payload,
    )
    if r.status_code == 400 and "private_notes" in r.text:
        payload.pop("private_notes", None)
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/jobs",
            headers={**sb_headers(), "Prefer": "return=representation"},
            params={"id": f"eq.{job_id}"},
            json=payload,
        )
    r.raise_for_status()

def sync_jobs_to_supabase(dbs_jobs):
    existing = sb_get("jobs", {
        "select": "id,description,status",
        "description": "like.*KO Ref:*",
    })
    ko_to_id = {}
    for row in existing:
        m = re.search(r"KO Ref: (\S+)", row.get("description", ""))
        if m:
            ko_to_id[m.group(1)] = row["id"]

    created = updated = skipped = 0

    for dbs in dbs_jobs:
        ko = dbs["ko_reference"].strip()
        if not ko:
            skipped += 1
            continue

        client_id = find_or_create_client(dbs["tenant_name"], dbs["tenant_phone"])
        row = map_to_treeco(dbs, client_id)

        if ko in ko_to_id:
            _try_patch(ko_to_id[ko], {
                "title":           row["title"],
                "status":          row["status"],
                "estimated_value": row["estimated_value"],
                "description":     row["description"],
                "private_notes":   row.get("private_notes"),
                "updated_at":      datetime.utcnow().isoformat() + "Z",
            })
            updated += 1
        else:
            result = _try_post(row)
            created += 1
            log(f"    ✚ Created: {row['title'][:60]}")
            # Auto-create a quote from charge lines
            if result and isinstance(result, list) and result:
                new_job_id = result[0]["id"]
                charge_lines = dbs.get("charge_lines", [])
                if charge_lines:
                    create_quote_from_charge_lines(new_job_id, row.get("client_id"), charge_lines)

    return {"created": created, "updated": updated, "skipped": skipped}


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not DBS_PASSWORD:
        print("✗  DBS_PASSWORD is not set.", file=sys.stderr)
        sys.exit(1)
    if not SUPABASE_KEY:
        print("✗  SUPABASE_SERVICE_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    log("══════════════════════════════════════════════════")
    log("  DBS Portal → TreeCo sync (with detail scrape)")
    log(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    if TEST_ONE:
        log("  ⚠  TEST MODE — first job only")
    log("══════════════════════════════════════════════════")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context()
        page    = await context.new_page()

        log("  → Navigating to DBS portal…")
        await page.goto(f"{DBS_URL}/index.cfm", timeout=30_000)
        await page.wait_for_load_state("domcontentloaded")
        await dbs_login(page)

        log("  → Loading job list…")
        await page.goto(f"{DBS_URL}{JOBS_PATH}", timeout=20_000)
        await page.wait_for_load_state("networkidle", timeout=15_000)
        await page.wait_for_timeout(2000)

        dbs_jobs = await extract_all_jobs(page)
        if not dbs_jobs:
            log("✗  No jobs found.")
            await browser.close()
            sys.exit(1)

        jobs_to_process = dbs_jobs[:1] if TEST_ONE else dbs_jobs
        log(f"\n  → Scraping detail pages for {len(jobs_to_process)} job(s)…")

        for i, job in enumerate(jobs_to_process):
            log(f"\n  [{i+1}/{len(jobs_to_process)}] {job['shl_job_id']} — {job['ko_reference']}")
            jobs_to_process[i] = await extract_job_detail(page, job)

            # Return to job list for the next iteration
            if i < len(jobs_to_process) - 1:
                await page.goto(f"{DBS_URL}{JOBS_PATH}", timeout=15_000)
                await page.wait_for_load_state("networkidle", timeout=10_000)
                await page.wait_for_timeout(1500)

        await browser.close()

    if TEST_ONE:
        log("\n══ TEST MODE — scraped data ══")
        for job in jobs_to_process:
            log(json.dumps({
                "shl_job_id":   job["shl_job_id"],
                "ko_reference": job["ko_reference"],
                "priority":     job["priority"],
                "notes":        job["notes"],
                "charge_lines": [{k: v for k, v in cl.items() if k != "images"} for cl in job["charge_lines"]],
                "image_count":  sum(len(cl.get("images", [])) for cl in job["charge_lines"]),
            }, indent=2))

    log(f"\n  → Syncing {len(jobs_to_process)} job(s) to Supabase…")
    counts = sync_jobs_to_supabase(jobs_to_process)

    log("\n══════════════════════════════════════════════════")
    log(f"  ✓ Done — created: {counts['created']}  updated: {counts['updated']}  skipped: {counts['skipped']}")
    log("══════════════════════════════════════════════════")

    print(json.dumps(counts))


if __name__ == "__main__":
    asyncio.run(main())
