#!/usr/bin/env python3
"""Convert the raw browser scrape (quotient_scrape_raw.json: token,title,items,bodyText)
into the importer schema quotient_to_treeco.py expects, parsing meta from bodyText.
Tags each quote with _category (spencers/downer/council/residential) for dedup."""
import json, re, sys

RAW = sys.argv[1] if len(sys.argv) > 1 else "scripts/quotient_scrape_raw.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "scripts/quotient_quotes.json"

def find(pat, s, flags=0, grp=1, default=""):
    m = re.search(pat, s, flags)
    return m.group(grp).strip() if m else default

def parse(q):
    bt = q["bodyText"]
    head = bt.split("Prepared by")[0]           # client contact block only
    name = find(r"Prepared for\s*\n\s*([^\n]+)", head)
    email = find(r"Email\s*\n\s*([^\s@]+@[^\s\n]+)", head)
    address = find(r"Address\s*\n\s*([^\n]+)", head)
    phone = find(r"Phone\s*\n\s*([0-9 +()\-]+)", head).strip()
    number = find(r"Quote Number\s*#?\s*(\d{3,})", bt)
    date = find(r"\nDate\s*\n\s*(\d{1,2} [A-Za-z]+ \d{4})", bt)
    expiry = find(r"Expiry Date\s*\n\s*(\d{1,2} [A-Za-z]+ \d{4}(?: at [\d:]+ ?[AP]M)?)", bt)
    subtotal = find(r"Subtotal\s*\n\s*\$?([\d,]+\.\d{2})", bt)
    gst = find(r"GST[^\n]*\n\s*\$?([\d,]+\.\d{2})", bt)
    total = find(r"Total NZD\s*\n?\s*\$?\s*([\d,]+\.\d{2})", bt)
    accepted = find(r"(Accepted on behalf of [^\n]+)", bt)
    accepted_date = find(r"by [^\n]+ on (\d{1,2} [A-Za-z]+ \d{4} at [\d:]+ ?[AP]M)", bt)
    ref = find(r"Order/reference number\s*\n\s*([^\n]+)", bt)
    if ref.lower().startswith("accepted"):    # blank ref → regex ran into next section
        ref = ""

    def num(s):
        s = (s or "").replace(",", "")
        return float(s) if re.match(r"^-?\d+(\.\d+)?$", s) else None

    # Category (for dedup against the Spencers portal)
    hay = f"{name} {email} {q['title']} {bt[:1200]}".lower()
    if "downer" in hay:
        cat = "downer"
    elif "spencer" in hay or re.search(r"\bSP\s*-\s*YMG", bt):
        cat = "spencers"
    elif "council" in hay or "uhcc" in hay or "hutt city" in hay:
        cat = "council"
    else:
        cat = "residential"
    commercial = cat in ("spencers", "downer", "council")

    # Pull a leading SOR code out of each item's desc ("SP - YMG570", "DOW - YMG550", "YMG555")
    items = []
    for it in q["items"]:
        desc = it.get("desc", "") or ""
        code = ""
        m = re.match(r"\s*((?:SP|DOW)\s*-\s*[A-Z]{2,4}\d{2,4}|[A-Z]{2,4}\d{2,4})\b\s*", desc)
        if m:
            code = re.sub(r"\s*-\s*", " - ", m.group(1)).strip()
            desc = desc[m.end():].strip()
        items.append({
            "code": code,
            "name": it.get("name", ""),
            "desc": desc,
            "qty": it.get("qty") if it.get("qty") is not None else 1,
            "rate": it.get("rate"),
            "total": it.get("total"),
            "images": it.get("images", []),
            "selected": it.get("selected", True),
            "optional": it.get("optional", False),
        })

    return {
        "token": q["token"],
        "title": q["title"].strip(),
        "quoteNumber": number,
        "date": date,
        "expiry": expiry,
        "accepted": accepted,
        "acceptedDate": accepted_date,
        "contact": {
            "company": name if commercial else "",
            "person": "" if commercial else name,
            "email": email,
            "phone": phone,
            "address": address,
        },
        "reference": ref,
        "items": items,
        "totals": {"subtotal": num(subtotal), "gst": num(gst), "total": num(total)},
        "paymentTerms": "Payment due upon completion of job\nCash or direct bank transfer is accepted",
        "comments": [],
        "_category": cat,
    }

raw = json.load(open(RAW))
out = [parse(q) for q in raw if not q.get("error")]
json.dump(out, open(OUT, "w"), indent=2)
from collections import Counter
print("parsed:", len(out))
print("by category:", dict(Counter(q["_category"] for q in out)))
for q in out:
    t = q["totals"]
    print(f"  #{q['quoteNumber']:>5} {q['_category']:11} {q['title'][:42]:42} "
          f"items={len(q['items'])} sub={t['subtotal']} gst={t['gst']} tot={t['total']} "
          f"client={ (q['contact']['company'] or q['contact']['person'])[:22] }")
