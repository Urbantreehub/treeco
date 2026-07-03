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

# ── Notifications + always-on loop ──────────────────────────────────────────
# New-job emails go out via Resend (same account the edge functions use). Set
# RESEND_API_KEY to enable; leave it unset to skip email silently.
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
APP_BASE_URL   = os.environ.get("APP_BASE_URL", "https://app.urbantreeservices.net").rstrip("/")
OFFICE_EMAIL   = os.environ.get("OFFICE_EMAIL", "office@urbantreeservices.net")
EMAIL_FROM     = os.environ.get("EMAIL_FROM", "Urban Tree Services <noreply@urbantreeservices.net>")
NOTIFY_NEW     = os.environ.get("DBS_NOTIFY", "1").strip() not in ("0", "false", "no", "")
# When > 0, run forever polling every N seconds (the always-on worker). When 0
# (default), run a single pass — preserves the manual "Sync now" trigger.
POLL_SECONDS   = int(os.environ.get("DBS_POLL_SECONDS", "0") or "0")

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


# PostgREST reports an unknown column as: "Could not find the 'X' column …".
# We strip any column it complains about and retry, so the scraper keeps working
# even before migration 015 is applied (it just skips the new columns).
_UNKNOWN_COL_RE = re.compile(r"'([a-z_]+)' column")

def parse_due_date(raw):
    """Portal dates look like '25/07/2026' (DD/MM/YYYY). Return ISO or None."""
    raw = (raw or "").strip()
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None

def sb_write_resilient(method, path, payload, params=None):
    """POST/PATCH that drops columns the schema doesn't have yet, then retries."""
    p = dict(payload)
    for _ in range(8):
        r = requests.request(
            method, f"{SUPABASE_URL}/rest/v1/{path}",
            headers={**sb_headers(), "Prefer": "return=representation"},
            params=params, json=p,
        )
        if r.status_code == 400:
            m = _UNKNOWN_COL_RE.search(r.text)
            if m and m.group(1) in p:
                col = m.group(1)
                log(f"    ⚠  '{path}' has no '{col}' column — omitting it")
                p.pop(col, None)
                continue
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            return None
    return None

def upsert_portal_sync(job_id, dbs, prev, sla_due, notified_at=None):
    """Mirror the portal job's last-seen state so future polls can diff it.
    Degrades to a no-op (with a warning) if the portal_sync table isn't there."""
    row = {
        "source":                  "dbs",
        "shl_job_id":              dbs["shl_job_id"],
        "ko_reference":            dbs["ko_reference"].strip() or None,
        "job_id":                  job_id,
        "portal_status":           dbs["portal_status"].strip() or None,
        "last_seen_portal_status": (prev.get("portal_status") if prev else dbs["portal_status"].strip()) or None,
        "priority":                dbs["priority"].strip() or None,
        "sla_due_at":              sla_due,
        "raw_snapshot":            {k: v for k, v in dbs.items() if k != "charge_lines"},
        "last_polled_at":          datetime.utcnow().isoformat() + "Z",
        "updated_at":              datetime.utcnow().isoformat() + "Z",
    }
    if notified_at:
        row["notified_new_at"] = notified_at
    try:
        return sb_write_resilient(
            "POST", "portal_sync", row,
            # upsert on the (source, shl_job_id) unique index
        ) if not prev else sb_write_resilient(
            "PATCH", "portal_sync", row,
            params={"source": "eq.dbs", "shl_job_id": f"eq.{dbs['shl_job_id']}"},
        )
    except requests.HTTPError as e:
        log(f"    ⚠  portal_sync write skipped ({e}) — apply migration 015 for diffing")
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

    # Title: the site address (Spencers jobs are identified by address). Fall
    # back to tenant / KO ref / SHL id only when there's no address.
    tenant = dbs.get("tenant_name", "").strip()
    title = addr or (f"SP — {tenant}" if tenant else f"SP — {ko}" if ko else f"SP — Job {dbs['shl_job_id']}")

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
        # First-class portal fields (migration 015). Stripped automatically if
        # the columns aren't there yet, so this is safe pre-migration.
        "ko_reference":    ko or None,
        "priority":        pri or None,
        "sla_due_at":      parse_due_date(dbs.get("due_date")),
    }


# ── Supabase upsert ───────────────────────────────────────────────────────────

def _try_post(payload):
    return sb_write_resilient("POST", "jobs", payload)


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

        # Rate = total / qty; fallback to 0. NOTE: we mirror the portal price
        # exactly — no 0.87 transform is applied to any amount.
        rate_val = round(total_val / qty_val, 2) if qty_val else 0.0

        # Classify SOR vs non-SOR "quotable". Guide: codebook codes with a rate
        # of 0.87 (Spencers' GST factor) are the quotable, pre-approval codes
        # that belong on the invoice. This is a hint — the app allows override.
        portal_rate_raw = re.sub(r"[^\d.]", "", cl.get("rate", "") or "")
        portal_rate = float(portal_rate_raw) if portal_rate_raw else rate_val
        quotable = abs(portal_rate - 0.87) < 0.02

        code = (cl.get("code") or "").strip()
        desc = f"{code} — {cl['desc']}"
        detail = cl.get("line_note", "") or ""
        if cl.get("location"):
            detail = f"{cl['location']} {detail}".strip()

        item = {
            "id":          str(i + 1),
            "code":        code,       # SOR job code, surfaced as a badge in-app
            "description": desc,
            "detail":      detail,
            "qty":         qty_val,
            "rate":        rate_val,
            "quotable":    quotable,   # non-SOR quotable (rate≈0.87 guide) → invoice + pre-approval
            "sor":         not quotable,
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
    return sb_write_resilient("PATCH", "jobs", payload, params={"id": f"eq.{job_id}"})

# ── New-job email (Resend) ──────────────────────────────────────────────────

def _charge_lines_html(charge_lines):
    if not charge_lines:
        return ""
    rows = ""
    for cl in charge_lines:
        bits = f"<strong>{cl.get('code','')}</strong> {cl.get('desc','')}"
        meta = []
        if cl.get("qty"):   meta.append(f"×{cl['qty']}")
        if cl.get("total"): meta.append(f"${cl['total']}")
        if cl.get("images"): meta.append(f"📷{len(cl['images'])}")
        rows += (f"<tr><td style='padding:4px 10px 4px 0;color:#2b3a2b'>{bits}</td>"
                 f"<td style='padding:4px 0;color:#6b7a6b;white-space:nowrap'>{'  '.join(meta)}</td></tr>")
    return (f"<p style='margin:18px 0 6px;font-weight:700;color:#2b3a2b'>Charge lines</p>"
            f"<table style='border-collapse:collapse;font-size:14px'>{rows}</table>")

def send_new_job_email(dbs, job_id):
    """Email the office that a new DBS job has landed. Returns True on send."""
    if not RESEND_API_KEY:
        log("    ⚠  RESEND_API_KEY not set — new-job email skipped")
        return False

    ko    = dbs["ko_reference"].strip()
    addr  = dbs["address"].strip()
    pri   = dbs["priority"].strip()
    due   = dbs.get("due_date", "").strip()
    tenant = dbs.get("tenant_name", "").strip()
    is_emerg = any(w in pri.lower() for w in ("emerg", "p1", "urgent"))
    flag  = "🔴 EMERGENCY — " if is_emerg else ""
    subject = f"{flag}New DBS job: {addr or ko}" + (f" · due {due}" if due else "")
    link  = f"{APP_BASE_URL}/workorder/{job_id}"

    meta_rows = "".join(
        f"<tr><td style='padding:2px 14px 2px 0;color:#6b7a6b'>{k}</td>"
        f"<td style='padding:2px 0;color:#2b3a2b;font-weight:600'>{v}</td></tr>"
        for k, v in [("Address", addr), ("Tenant", tenant), ("KO Ref", ko),
                     ("Priority", pri), ("Due", due)] if v
    )
    html = f"""
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#2b3a2b">
      <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#4A6741;font-weight:700;margin:0 0 4px">New job from Spencers</p>
      <h1 style="font-size:22px;margin:0 0 14px;color:#1f2e1f">{flag}{addr or ko or 'New DBS job'}</h1>
      <table style="border-collapse:collapse;font-size:14px;margin-bottom:8px">{meta_rows}</table>
      {_charge_lines_html(dbs.get('charge_lines', []))}
      <p style="margin:22px 0">
        <a href="{link}" style="background:#4A6741;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700;display:inline-block">Open in TreeCo →</a>
      </p>
      <p style="font-size:12px;color:#8a978a;margin-top:18px">Pulled automatically from the DBS portal. Accept &amp; schedule it in TreeCo — the portal will be updated for you.</p>
    </div>"""

    try:
        r = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
            json={"from": EMAIL_FROM, "reply_to": OFFICE_EMAIL, "to": OFFICE_EMAIL,
                  "subject": subject, "html": html},
            timeout=20,
        )
        if r.status_code in (200, 201):
            log(f"    ✉  New-job email sent: {subject[:60]}")
            return True
        log(f"    ⚠  Email failed ({r.status_code}): {r.text[:160]}")
    except Exception as e:
        log(f"    ⚠  Email error: {e}")
    return False


def notify_new_jobs(new_jobs):
    """Send emails for newly-seen jobs; stamp portal_sync so we never re-send."""
    for item in new_jobs:
        if send_new_job_email(item["dbs"], item["job_id"]):
            try:
                sb_write_resilient(
                    "PATCH", "portal_sync",
                    {"notified_new_at": datetime.utcnow().isoformat() + "Z"},
                    params={"source": "eq.dbs", "shl_job_id": f"eq.{item['dbs']['shl_job_id']}"},
                )
            except requests.HTTPError:
                pass


def sync_jobs_to_supabase(dbs_jobs):
    # Existing TreeCo jobs, matched by the KO Ref tag in their description.
    existing = sb_get("jobs", {
        "select": "id,description,status",
        "description": "like.*KO Ref:*",
    })
    ko_to_id = {}
    for row in existing:
        m = re.search(r"KO Ref: (\S+)", row.get("description", ""))
        if m:
            ko_to_id[m.group(1)] = row["id"]

    # Last-seen portal state, keyed by the portal's own job id. If the
    # portal_sync table isn't there yet, we fall back to "created == new".
    portal_by_shl = {}
    try:
        for r in sb_get("portal_sync", {
            "select": "shl_job_id,portal_status,notified_new_at,job_id",
            "source": "eq.dbs",
        }):
            portal_by_shl[r["shl_job_id"]] = r
    except requests.HTTPError:
        log("    ⚠  portal_sync not readable yet — diffing off (apply migration 015)")

    created = updated = skipped = 0
    changed = 0
    new_jobs = []   # [{dbs, job_id}] — jobs to email about this run

    for dbs in dbs_jobs:
        ko = dbs["ko_reference"].strip()
        if not ko:
            skipped += 1
            continue

        prev            = portal_by_shl.get(dbs["shl_job_id"])
        cur_status      = dbs["portal_status"].strip()
        is_changed      = bool(prev and (prev.get("portal_status") or "") != cur_status)
        already_notified = bool(prev and prev.get("notified_new_at"))

        client_id = find_or_create_client(dbs["tenant_name"], dbs["tenant_phone"])
        row = map_to_treeco(dbs, client_id)

        if ko in ko_to_id:
            job_id = ko_to_id[ko]
            _try_patch(job_id, {
                "title":           row["title"],
                "status":          row["status"],
                "estimated_value": row["estimated_value"],
                "description":     row["description"],
                "private_notes":   row.get("private_notes"),
                "ko_reference":    row.get("ko_reference"),
                "priority":        row.get("priority"),
                "sla_due_at":      row.get("sla_due_at"),
                "updated_at":      datetime.utcnow().isoformat() + "Z",
            })
            updated += 1
            was_created = False
        else:
            result = _try_post(row)
            created += 1
            log(f"    ✚ Created: {row['title'][:60]}")
            job_id = result[0]["id"] if (result and isinstance(result, list) and result) else None
            if job_id:
                charge_lines = dbs.get("charge_lines", [])
                if charge_lines:
                    create_quote_from_charge_lines(job_id, row.get("client_id"), charge_lines)
            was_created = True

        if is_changed:
            changed += 1
            log(f"    ↻ Portal status: {prev.get('portal_status')!r} → {cur_status!r}")

        # A job is "new" (email-worthy) the first time we see it in the portal.
        should_notify = NOTIFY_NEW and job_id and not already_notified and (prev is None or was_created)

        # Mirror the portal state for next time's diff. notified_new_at is
        # stamped separately, only after the email actually sends.
        upsert_portal_sync(job_id, dbs, prev, row.get("sla_due_at"))

        if should_notify:
            new_jobs.append({"dbs": dbs, "job_id": job_id})

    return {"created": created, "updated": updated, "skipped": skipped,
            "changed": changed, "new_jobs": new_jobs}


# ── One sync pass ───────────────────────────────────────────────────────────

async def run_once():
    """Scrape the portal once and sync into TreeCo. Returns a summary dict."""
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
        try:
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
                log("  → No jobs in portal list this pass.")
                return {"created": 0, "updated": 0, "skipped": 0, "changed": 0, "new": 0}

            jobs_to_process = dbs_jobs[:1] if TEST_ONE else dbs_jobs
            log(f"\n  → Scraping detail pages for {len(jobs_to_process)} job(s)…")

            for i, job in enumerate(jobs_to_process):
                log(f"\n  [{i+1}/{len(jobs_to_process)}] {job['shl_job_id']} — {job['ko_reference']}")
                jobs_to_process[i] = await extract_job_detail(page, job)
                if i < len(jobs_to_process) - 1:
                    await page.goto(f"{DBS_URL}{JOBS_PATH}", timeout=15_000)
                    await page.wait_for_load_state("networkidle", timeout=10_000)
                    await page.wait_for_timeout(1500)
        finally:
            await browser.close()

    log(f"\n  → Syncing {len(jobs_to_process)} job(s) to Supabase…")
    counts = sync_jobs_to_supabase(jobs_to_process)

    # Fire the new-job emails after the DB writes have landed.
    notify_new_jobs(counts.get("new_jobs", []))

    summary = {"created": counts["created"], "updated": counts["updated"],
               "skipped": counts["skipped"], "changed": counts["changed"],
               "new": len(counts.get("new_jobs", []))}
    log("\n══════════════════════════════════════════════════")
    log(f"  ✓ Done — created: {summary['created']}  updated: {summary['updated']}  "
        f"changed: {summary['changed']}  new-emailed: {summary['new']}  skipped: {summary['skipped']}")
    log("══════════════════════════════════════════════════")
    return summary


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not DBS_PASSWORD:
        print("✗  DBS_PASSWORD is not set.", file=sys.stderr)
        sys.exit(1)
    if not SUPABASE_KEY:
        print("✗  SUPABASE_SERVICE_KEY is not set.", file=sys.stderr)
        sys.exit(1)

    # Always-on mode: loop forever, poll every POLL_SECONDS, survive errors.
    if POLL_SECONDS > 0:
        log(f"  ⟳  Always-on worker — polling every {POLL_SECONDS}s")
        while True:
            try:
                await run_once()
            except Exception as e:
                log(f"  ✗  Poll failed: {e}")
            await asyncio.sleep(POLL_SECONDS)

    # Single pass (manual "Sync now" trigger): emit summary JSON on stdout.
    summary = await run_once()
    print(json.dumps(summary))


if __name__ == "__main__":
    asyncio.run(main())
