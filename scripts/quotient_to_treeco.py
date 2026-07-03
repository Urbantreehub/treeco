#!/usr/bin/env python3
"""
Quotient → TreeCo import
========================
Takes the accepted-but-not-completed Quotient quotes (scraped separately into a
JSON file via the logged-in browser session) and creates matching TreeCo jobs,
clients, quotes, line items, photos and notes in the Supabase database.

Quotient has no read API, so the data is captured from the logged-in web app and
handed to this script as JSON. Image URLs on go.quotientapp.com/file-s/... are
publicly readable, so photos are downloaded and re-hosted in the `job-images`
Supabase bucket (matching scripts/dbs_to_treeco.py).

Idempotent: each job is tagged `Quotient #<number>` in its description. Re-running
updates the existing job rather than creating a duplicate.

Environment (scripts/.env):
    SUPABASE_URL            required
    SUPABASE_SERVICE_KEY    required (service_role / sb_secret_ key)

Usage:
    source scripts/.env && python3 scripts/quotient_to_treeco.py path/to/quotes.json           # live
    python3 scripts/quotient_to_treeco.py path/to/quotes.json --dry-run                         # validate only
    python3 scripts/quotient_to_treeco.py path/to/quotes.json --dry-run --download <dir>        # + fetch images
"""

import hashlib
import os
import re
import sys
import json
import argparse
from datetime import datetime

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://zagwhnnxjtimzvvjaujm.supabase.co").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
STORAGE_BUCKET = "job-images"
GST_RATE = 0.15

MONTHS = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"], 1)}


def log(m):
    print(m, file=sys.stderr, flush=True)


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_headers(extra=None):
    h = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def sb_get(path, params=None):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=sb_headers(), params=params)
    r.raise_for_status()
    return r.json()


def sb_post(table, rows, upsert=False):
    prefer = "return=representation"
    if upsert:
        prefer = "resolution=merge-duplicates," + prefer
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}",
                      headers=sb_headers({"Prefer": prefer}), json=rows)
    r.raise_for_status()
    return r.json()


def sb_patch(table, params, payload):
    r = requests.patch(f"{SUPABASE_URL}/rest/v1/{table}",
                       headers=sb_headers({"Prefer": "return=representation"}),
                       params=params, json=payload)
    r.raise_for_status()
    return r.json()


# ── Parsing / mapping helpers ─────────────────────────────────────────────────

def parse_nz_date(s):
    """'3 July 2026 at 1:09 PM' or '3 July 2026' -> ISO date string, or None."""
    if not s:
        return None
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})", s)
    if not m:
        return None
    day, mon, yr = int(m.group(1)), m.group(2), int(m.group(3))
    mon_n = MONTHS.get(mon.capitalize())
    if not mon_n:
        return None
    return f"{yr:04d}-{mon_n:02d}-{day:02d}"


def client_name(contact):
    company = (contact.get("company") or "").strip()
    person = (contact.get("person") or "").strip()
    if company and company.lower() != person.lower():
        return company, person       # business, with a site contact person
    return (company or person), None


def infer_job_type(items):
    """Pick a job_type from the selected line-item names/codes."""
    text = " ".join((it.get("name") or "") for it in items if it.get("selected")).lower()
    # Removal/cut-down dominates (stump grinding is usually ancillary to it).
    if re.search(r"cut down|removal|remove|\brem\b|fell", text):
        return "removal"
    if re.search(r"prune|pruning|trim", text):
        return "pruning"
    if re.search(r"stump", text):
        return "stump_grinding"
    return None


def strip_address(title):
    """Drop a leading work-order code (e.g. 'R6603451-1 ' or 'DOW - YMG555 : ')."""
    t = title.strip()
    t = re.sub(r"^R\d+\S*\s*[:\-]?\s*", "", t)
    t = re.sub(r"^(DOW|SP)\s*-\s*\S+\s*[:\-]?\s*", "", t)
    return t.strip() or title.strip()


def clean_comment(c):
    """Comments arrive as 'AWAnna Welanyk1 May 2026 at 4:01 PMHello...'.
    Split the timestamp from the message body."""
    m = re.search(r"(\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\s+at\s+\d{1,2}:\d{2}\s*[AP]M)", c)
    name, when, body = "", "", c
    if m:
        head = c[:m.start()]
        when = m.group(1)
        body = c[m.end():]
        # head is '<initials><Full Name>' glued (e.g. 'STShelley Tucker').
        # Drop the leading initials run, keeping the capitalised name.
        name = re.sub(r"^[A-Z]+(?=[A-Z][a-z])", "", head).strip()
    # Strip trailing UI button text captured from the comment widget.
    for marker in ("AnswerAnswer", "Answer Question", "DismissNot", "Not SentAttach", "Not Sent"):
        i = body.find(marker)
        if i != -1:
            body = body[:i]
    body = body.strip()
    if m:
        return f"{name} ({when}): {body}".strip(" :")
    return body.strip()


# ── Images ────────────────────────────────────────────────────────────────────

def download_image(url):
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200 and r.content:
            return r.content, r.headers.get("Content-Type", "image/jpeg")
    except Exception as e:
        log(f"      ! image fetch error: {e}")
    return None, None


def upload_image(image_bytes, filename, mime="image/jpeg"):
    path = f"quotient/{filename}"
    r = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": mime, "x-upsert": "true"},
        data=image_bytes,
    )
    if r.status_code in (200, 201):
        return f"{SUPABASE_URL}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    log(f"      ! image upload failed ({r.status_code}): {r.text[:150]}")
    return None


def rehost_images(quote_num, code, urls, dry_run, download_dir, uniq=""):
    """Return list of public URLs (or original urls in dry-run)."""
    out = []
    for idx, u in enumerate(urls):
        fname_raw = u.split("/")[-1].split("?")[0]
        safe = re.sub(r"[^A-Za-z0-9._-]", "_",
                      f"{quote_num}_{(code or 'x')}_{uniq}{idx}_{fname_raw}")
        if dry_run:
            if download_dir:
                data, mime = download_image(u)
                if data:
                    with open(os.path.join(download_dir, safe), "wb") as f:
                        f.write(data)
                    out.append(f"[local]{safe} ({len(data)}b)")
                else:
                    out.append(f"[FAILED]{u}")
            else:
                out.append(u)
            continue
        data, mime = download_image(u)
        if not data:
            continue
        pub = upload_image(data, safe, mime or "image/jpeg")
        if pub:
            out.append(pub)
    return out


# ── Client find/create ────────────────────────────────────────────────────────

_client_cache = {}


def find_or_create_client(contact, dry_run):
    name, site_contact = client_name(contact)
    if not name:
        return None, None
    key = name.lower()
    if key in _client_cache:
        return _client_cache[key], site_contact
    phone = (contact.get("phone") or "").strip() or None
    email = (contact.get("email") or "").strip() or None
    if dry_run:
        _client_cache[key] = f"DRY-{key}"
        return _client_cache[key], site_contact
    existing = sb_get("clients", {"name": f"eq.{name}", "select": "id"})
    if existing:
        cid = existing[0]["id"]
    else:
        created = sb_post("clients", [{"name": name, "phone": phone, "email": email}])
        cid = created[0]["id"]
    _client_cache[key] = cid
    return cid, site_contact


# ── Build job + quote ─────────────────────────────────────────────────────────

def build_description(q, site_contact):
    parts = [f"Quotient #{q['quoteNumber']}"]
    if q.get("reference"):
        parts[0] += f"   ·   Ref: {q['reference']}"
    if site_contact:
        parts.append(f"Site contact: {site_contact}")
    if q.get("acceptedDate"):
        parts.append(f"Accepted: {q['acceptedDate']}")
    parts.append("")
    parts.append("─── Scope ───")
    for it in q["items"]:
        mark = "•" if it.get("selected") else "  (declined option)"
        line = f"{mark} {(it.get('code') or '').strip()} {it.get('name') or ''}".strip()
        if it.get("qty") and it.get("rate") is not None:
            line += f"  — {it['qty']} × ${it['rate']}"
        if it.get("total") is not None:
            line += f" = ${it['total']}"
        parts.append(line)
        if it.get("desc"):
            parts.append(f"    {it['desc']}")
    if q.get("paymentTerms"):
        parts += ["", f"Terms: {q['paymentTerms']}"]
    if q.get("comments"):
        parts += ["", "─── Q&A ───"]
        for c in q["comments"]:
            parts.append(clean_comment(c))
    return "\n".join(parts)


def build_line_items(q, quote_num, dry_run, download_dir):
    items = []
    for i, it in enumerate(q["items"]):
        imgs = rehost_images(quote_num, it.get("code"), it.get("images") or [],
                             dry_run, download_dir, uniq=f"i{i}_")
        li = {
            "id": str(i + 1),
            "description": f"{(it.get('code') or '').strip()} {it.get('name') or ''}".strip(),
            "detail": it.get("desc") or "",
            "qty": it.get("qty") if it.get("qty") is not None else 1,
            "rate": it.get("rate") if it.get("rate") is not None else 0,
            "optional": bool(it.get("optional")),
            "selected": bool(it.get("selected")),
            "sort_order": i,
        }
        if imgs and not dry_run:
            li["image_url"] = imgs[0]
            li["images"] = imgs
        elif imgs:
            li["images"] = imgs
        items.append(li)
    return items


def import_quote(q, dry_run, download_dir):
    quote_num = str(q["quoteNumber"])
    tag = f"Quotient #{quote_num}"
    client_id, site_contact = find_or_create_client(q["contact"], dry_run)

    subtotal = q["totals"].get("subtotal") or 0
    gst = q["totals"].get("gst")
    total = q["totals"].get("total")
    if gst is None and total is not None:
        gst = round(total - subtotal, 2)
    if total is None:
        gst = round(subtotal * GST_RATE, 2)
        total = round(subtotal + gst, 2)

    title = q["title"].strip()
    job_row = {
        "title": title,
        "address": strip_address(title),
        "job_type": infer_job_type(q["items"]),
        "description": build_description(q, site_contact),
        "status": "accepted_to_schedule",
        "estimated_value": subtotal,
        "client_id": client_id,
    }

    line_items = build_line_items(q, quote_num, dry_run, download_dir)
    responded = parse_nz_date(q.get("acceptedDate"))
    valid_until = parse_nz_date(q.get("expiry"))

    if dry_run:
        return {"tag": tag, "job": job_row, "line_items": line_items,
                "quote_totals": {"subtotal": subtotal, "gst": gst, "total": total},
                "responded_at": responded}

    # Idempotency: find an existing job carrying this Quotient tag
    existing = sb_get("jobs", {"select": "id", "description": f"like.*{tag}*"})
    if existing:
        job_id = existing[0]["id"]
        sb_patch("jobs", {"id": f"eq.{job_id}"}, {
            "title": job_row["title"], "address": job_row["address"],
            "job_type": job_row["job_type"], "description": job_row["description"],
            "estimated_value": job_row["estimated_value"], "client_id": client_id,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        })
        action = "updated"
    else:
        job_id = sb_post("jobs", [job_row])[0]["id"]
        action = "created"

    # Quote (one per job; upsert-ish: delete existing quotes tagged, then insert)
    token = hashlib.md5(f"{job_id}-quotient-{quote_num}".encode()).hexdigest()[:14]
    quote_row = {
        "job_id": job_id, "client_id": client_id, "status": "accepted",
        "line_items": line_items, "subtotal": subtotal, "gst": gst, "total": total,
        "client_view_token": token, "notes": q.get("paymentTerms"),
        "private_notes": f"Imported from Quotient #{quote_num}",
        "valid_until": valid_until, "responded_at": responded,
    }
    existing_q = sb_get("quotes", {"select": "id", "job_id": f"eq.{job_id}"})
    if existing_q:
        sb_patch("quotes", {"id": f"eq.{existing_q[0]['id']}"},
                 {k: v for k, v in quote_row.items() if k != "job_id"})
    else:
        sb_post("quotes", [quote_row])

    # job_photos (selected items' images)
    photos = []
    for it in line_items:
        for url in it.get("images", []):
            if url.startswith("http"):
                photos.append({"job_id": job_id, "url": url,
                               "caption": it.get("description")})
    if photos:
        # avoid dupes: only insert if job has no photos yet
        have = sb_get("job_photos", {"select": "id", "job_id": f"eq.{job_id}"})
        if not have:
            sb_post("job_photos", photos)

    return {"tag": tag, "action": action, "job_id": job_id,
            "photos": len(photos), "items": len(line_items)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("quotes_json")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--download", metavar="DIR", help="in dry-run, fetch images to DIR")
    args = ap.parse_args()

    with open(args.quotes_json) as f:
        quotes = json.load(f)
    quotes.sort(key=lambda q: int(q["quoteNumber"]))

    if not args.dry_run and not SUPABASE_KEY:
        log("✗ SUPABASE_SERVICE_KEY not set — cannot write. Use --dry-run to validate.")
        sys.exit(1)

    if args.download:
        os.makedirs(args.download, exist_ok=True)

    log("═" * 55)
    log(f"  Quotient → TreeCo  ({'DRY RUN' if args.dry_run else 'LIVE'})  {len(quotes)} quotes")
    log("═" * 55)

    results = []
    for q in quotes:
        try:
            res = import_quote(q, args.dry_run, args.download)
            results.append(res)
            if args.dry_run:
                jt = res["job"]["job_type"] or "—"
                log(f"  Q{q['quoteNumber']:>5}  {res['job']['title'][:40]:40} "
                    f"[{jt:13}] ${res['quote_totals']['total']:>9} "
                    f"items={len(res['line_items'])} client={res['job']['client_id']}")
            else:
                log(f"  Q{q['quoteNumber']:>5}  {res['action']:8} job={res['job_id']} "
                    f"items={res['items']} photos={res['photos']}")
        except Exception as e:
            log(f"  Q{q['quoteNumber']}: ERROR {e}")

    if args.dry_run:
        out = args.quotes_json.replace(".json", "_dryrun.json")
        with open(out, "w") as f:
            json.dump(results, f, indent=1)
        log(f"\n  Dry-run mapping written to {out}")
    else:
        # Populate lat/lng so jobs show up in the scheduling Planner (which
        # clusters by coordinates). Runs the batch geocode edge function.
        try:
            r = requests.post(
                f"{SUPABASE_URL}/functions/v1/geocode",
                headers=sb_headers(), json={"batch": True}, timeout=120)
            log(f"  Geocode: {r.json()}")
        except Exception as e:
            log(f"  Geocode step failed (run the Planner's geocode later): {e}")
    log(f"\n  Done — {len(results)}/{len(quotes)} processed.")


if __name__ == "__main__":
    main()
