#!/usr/bin/env python3
"""Parse the truck-calendar export and match each booking to one of the imported
TreeCo jobs. Strict matching to avoid mis-scheduling:
  - residential: event summary == job client name, OR
  - address: share a distinctive street-name token (len>=4, not a locality/suffix)
    AND share a street number.
Writes scripts/cal_matches.json + preview."""
import re, json

STOP = set("""ST STREET RD ROAD DR DRIVE GR GROVE GRV CRES CRESCENT AVE AVENUE AV
TCE TERRACE LANE LN PL PLACE WAY CT COURT FL FLAT FLATS UNIT CLOSE CL PDE PARADE
LOWER UPPER HUTT CENTRAL WELLINGTON PORIRUA NEW ZEALAND NAENAE EPUNI TAITA TAITÄ
PETONE WATERLOO AVALON BOULCOTT MIRAMAR TAWA NEWLANDS KENEPURU MORNINGTON BIRCHVILLE
STRATHMORE PARK KHANDALLAH WHITBY MOERA CANNONS CREEK ASCOT ISLAND BAY TRENTHAM
STOKES VALLEY WADESTOWN BROOKLYN PINEHAVEN MAIDSTONE PARAPARAUMU BEACH RAUMATI
WAITANGIRUA HUTT""".split())

def norm(a):
    a = (a or '').upper(); a = re.sub(r'[^A-Z0-9 ]', ' ', a); a = re.sub(r'\s+', ' ', a).strip()
    return a
def street_names(text):
    return {t for t in norm(text).split() if len(t) >= 4 and not t.isdigit() and t not in STOP}
def numbers(text):
    return {t for t in norm(text).split() if t.isdigit()}

raw = open('scripts/truck_cal_events.txt').read()
recs = re.split(r'(?=utsbigtruck@gmail\.com\|~\||utssmalltruck@gmail\.com\|~\|)', raw)
events = []
for r in recs:
    r = r.strip()
    if not r or '|~|' not in r:
        continue
    p = r.split('|~|')
    if len(p) < 6:
        continue
    cal, summ, loc, sd, ed, ad = p[:6]
    events.append({'truck': 'Big Truck' if 'big' in cal else 'Small Truck',
                   'summary': ' '.join(summ.split()).strip(), 'loc': ' '.join(loc.split()).strip(),
                   'start': sd.strip(), 'end': ed.strip(), 'allday': ad.strip()})

jobs = json.load(open('/tmp/jobs24.json'))
for j in jobs:
    j['client'] = norm((j.get('clients') or {}).get('name') if j.get('clients') else '')
    j['snames'] = street_names(j['title'])
    j['nums'] = numbers(j['title'])

def match_job(ev):
    s = norm(ev['summary'])
    # 1) residential client-name match (skip generic portal names)
    if s and s not in ('SPENCERS', 'DOWNERS', 'DOWNER', 'SPENCER'):
        for j in jobs:
            if j['client'] and j['client'] == s:
                return j
    # 2) address: distinctive street name + shared number
    ev_names = street_names(ev['loc'] + ' ' + ev['summary'])
    ev_nums = numbers(ev['loc'])
    for j in jobs:
        if (ev_names & j['snames']) and (ev_nums & j['nums']):
            return j
    return None

matches = []
for ev in events:
    j = match_job(ev)
    if j:
        matches.append((ev, j))

print('parsed truck events:', len(events))
print('matched to one of the 24 jobs:', len(matches))
print()
for ev, j in sorted(matches, key=lambda x: x[0]['start']):
    print(f"  {ev['start'][:16]}  {ev['truck']:11} {ev['summary'][:18]:18} @ {ev['loc'][:30]:30} -> {j['title'][:30]} [{j['status']}]")

json.dump([{'job_id': j['id'], 'truck': ev['truck'], 'start': ev['start'], 'end': ev['end'],
            'allday': ev['allday'], 'status': j['status'], 'summary': ev['summary'], 'title': j['title']}
           for ev, j in matches], open('scripts/cal_matches.json', 'w'), indent=1)
print('\nwrote scripts/cal_matches.json')
