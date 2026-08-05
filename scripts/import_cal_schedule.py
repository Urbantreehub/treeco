#!/usr/bin/env python3
"""Insert truck-calendar bookings (scripts/cal_matches.json) into TreeCo's schedule
table, and bump matched accepted_to_schedule jobs to 'scheduled'. Idempotent-ish:
clears any existing schedule rows for the affected jobs first (safe re-run)."""
import os, re, json, sys, requests

URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}

matches = json.load(open("scripts/cal_matches.json"))
DRY = "--dry-run" in sys.argv

# Map each truck calendar onto its calendar resource + Cartrack vehicle so imported
# bookings land under the right truck's row (Isuzu/Nissan) instead of "Unassigned",
# and the live truck-progress rail can track them. resource_id must match
# RESOURCES in frontend/src/pages/Calendar.jsx; vehicle_reg matches the Cartrack
# registrations in frontend/src/components/CartrackMap.jsx.
TRUCK_RESOURCE = {"Big Truck": "isuzu", "Small Truck": "nissan"}
TRUCK_REG      = {"Big Truck": "GWL756", "Small Truck": "WA2244"}

def parse_iso(s):
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})", s)
    if not m:
        return None, None
    d = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    t = f"{m.group(4)}:{m.group(5)}:{m.group(6)}"
    return d, t

rows = []
job_ids = set()
for m in matches:
    d, st = parse_iso(m["start"])
    _, et = parse_iso(m["end"])
    if not d:
        continue
    allday = m.get("allday", "").lower() == "true"
    rows.append({
        "job_id": m["job_id"],
        "date": d,
        "start_time": None if allday else st,
        "end_time": None if allday else et,
        "status": "scheduled",
        "resource_id": TRUCK_RESOURCE.get(m["truck"]),
        "vehicle_reg": TRUCK_REG.get(m["truck"]),
        "notes": f"{m['truck']} · {m['summary']}  (imported from Apple Calendar)",
    })
    job_ids.add(m["job_id"])

print(f"{len(rows)} schedule rows across {len(job_ids)} jobs")
for r in rows:
    print(f"  {r['date']} {r['start_time'] or 'all-day'}  [{r['resource_id'] or 'UNMAPPED'}]  {r['notes'][:50]}")
if DRY:
    print("DRY RUN — nothing written"); sys.exit(0)

# 1) clear existing schedule rows for these jobs (safe re-run)
for jid in job_ids:
    requests.delete(f"{URL}/rest/v1/schedule?job_id=eq.{jid}", headers=H)
# 2) insert
r = requests.post(f"{URL}/rest/v1/schedule", headers={**H, "Prefer": "return=minimal"}, json=rows)
print("insert schedule:", r.status_code, r.text[:200])
# 3) bump accepted_to_schedule jobs to scheduled (they now have a booking)
r2 = requests.patch(f"{URL}/rest/v1/jobs?id=in.({','.join(job_ids)})&status=eq.accepted_to_schedule",
                    headers={**H, "Prefer": "return=minimal"}, json={"status": "scheduled"})
print("bump jobs to scheduled:", r2.status_code)
