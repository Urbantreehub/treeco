# Urban Tree Services — Google Ads (Search) Build

Ready-to-launch Google Ads Search campaign structure for **Urban Tree Services**
(urbantreeservices.net), a qualified-arborist business serving greater Wellington, NZ.

Currency: **NZ$** · Starting budget: **NZ$1,500/month** · Networks: **Search only**
(Google Local Services Ads are **not available in NZ** — do not build around LSAs.
Consider **Performance Max** as a later add-on *only after* conversion tracking is proven.)

---

## Files in this folder

| File | What it is | How to use |
|---|---|---|
| `keywords.csv` | Positive keywords: Campaign, Ad Group, Keyword, Match Type | Import into Google Ads Editor → Keywords |
| `negatives.csv` | Full negative keyword list (Level, Applies To, Keyword, Match Type) | Build as one **shared negative list**, apply to all 4 campaigns |
| `responsive-search-ads.csv` | One tailored RSA per ad group (15 headlines, 4 descriptions, Final URL, Path 1/2) | Import into Google Ads Editor → Ads |
| `campaign-structure.csv` | Master overview: settings block + all keywords + condensed negatives in one sheet | Human reference / quick review |
| `suburb-keywords.csv` | NEW optional **Suburb – Local** campaign: 8 suburb ad groups (phrase+exact), each pointing to its live `/tree-services/<suburb>/` page | Import into Google Ads Editor → Keywords |
| `suburb-ads.csv` | One tailored RSA per suburb ad group (13 headlines, 4 descriptions) | Import into Google Ads Editor → Ads |
| `launch-runbook.md` | Click-by-click import & go-live guide (Editor import, hand-set settings, QA checklist, Post, first-2-weeks watch-list) | Follow start to finish to launch |
| `README.md` | This document | Strategy overview |

**Recommended import path (cleanest):** in Google Ads Editor import
`keywords.csv`, then `responsive-search-ads.csv`, then add the negatives from
`negatives.csv` as a shared list. Create the 4 campaigns + ad groups first (they are
referenced by name in every file). `campaign-structure.csv` is the all-in-one reference;
the split files import most reliably.

> Character limits verified on every asset: **headlines ≤ 30 chars, descriptions ≤ 90 chars,
> path fields ≤ 15 chars.** (★ symbols and emoji are intentionally avoided in headlines/callouts —
> Google restricts them. Reviews are written as "4.9 Stars, 79 Reviews".)

---

## Campaign structure & budget split (NZ$1,500/mo)

| # | Campaign | Share | Monthly | Daily* | Ad groups |
|---|---|---|---|---|---|
| 1 | **Core – Removal/Arborist** | 45% | ~NZ$675 | NZ$22.20 | Tree Removal · Arborist · Section Clearing · Tree Felling |
| 2 | **Pruning/Stump** | 30% | ~NZ$450 | NZ$14.80 | Tree Pruning · Crown Reduction · Stump Grinding · Hedge Trimming · Dead-wooding |
| 3 | **Emergency/Storm** | 15% | ~NZ$225 | NZ$7.40 | Emergency Tree Removal · Storm Damage · Dangerous/Fallen Tree |
| 4 | **Brand** | 5% | ~NZ$75 | NZ$2.50 | Brand Terms |

*Daily = monthly ÷ 30.4. Google may spend up to 2× the daily amount on high-traffic
days but never more than the monthly cap. Round daily budgets up slightly if you want to
guarantee the full NZ$1,500 is available.

- **13 ad groups**, tightly themed (4–7 keywords each).
- **Phrase + Exact match only at launch.** No Broad match until Smart Bidding + solid
  negatives are proven, or you'll waste budget on loose matches.
- Each ad group points to its matching landing page and has its own tailored RSA.

### Landing pages by ad group
| Ad group | Final URL |
|---|---|
| Tree Removal | /services/tree-removal/ |
| Arborist (general) | /services/tree-removal/ *(no dedicated page; main service page)* |
| Section Clearing | /services/tree-removal/section-clearing/ |
| Tree Felling | /services/tree-removal/ |
| Tree Pruning | /services/tree-pruning/ |
| Crown Reduction | /services/tree-pruning/ *(point to the crown-reduction subpage if a specific slug exists)* |
| Stump Grinding | /services/stump/stump-grinding/ |
| Hedge Trimming | /services/tree-pruning/ |
| Dead-wooding | /services/tree-pruning/ *(point to dead-wooding subpage if it exists)* |
| Emergency Tree Removal | /services/emergency/ |
| Storm Damage | /services/emergency/ |
| Dangerous/Fallen Tree | /services/emergency/ |
| Brand Terms | / (homepage) |

> Action: if dedicated subpages exist for crown-reduction, crown-lifting, power-line,
> and dead-wooding, swap the Final URLs to those exact pages for a better Quality Score.

---

## Recommended settings

- **Campaign type:** Search. **Search Partners: OFF** at launch. **Display Network: OFF**
  (never leave "Include Display" ticked — it dumps budget into low-intent placements).
- **Geo-targeting:** greater Wellington — Wellington City, Lower Hutt, Upper Hutt,
  Porirua, and Kapiti Coast (incl. Paraparaumu). Add the suburbs as needed (Karori,
  Khandallah, Newtown, Miramar, Island Bay, Kelburn, Thorndon, Tawa, Churton Park, Ngaio,
  Wadestown, Brooklyn, Berhampore, Wilton, Crofton Downs).
  **Location option = "Presence: people in your targeted locations"** — NOT the default
  "presence or interest," which would show ads to people merely searching about Wellington
  from other cities.
- **Language:** English.
- **Ad rotation:** Optimise for best-performing ads.
- **Ad schedule:** all hours. Keep **Emergency/Storm running 24/7.** After 2–3 weeks,
  consider a modest bid boost 7am–7pm Mon–Sat on the Core/Pruning campaigns.
- **Devices:** all. Watch mobile call volume — most tree-service leads call from mobile.

## Bidding roadmap
1. **Launch → Maximize Clicks** with a manual **max-CPC cap** (Core/Pruning NZ$9,
   Emergency NZ$14, Brand NZ$2). Goal: gather click + conversion data fast.
2. **~15–30 conversions in → Maximize Conversions.** Let Smart Bidding optimise once it
   has signal.
3. **~30+ conversions/month → Target CPA.** Start tCPA around **NZ$45–60** (a removal job
   is worth NZ$500–3,000, so this is comfortably profitable) and tune from there.

Realistic NZ CPCs: core arborist/removal terms ~**NZ$3–9**, emergency/storm terms higher.
NZ home-service CPCs generally run NZ$2–8; tree work trends to the top of that band.

## Conversion tracking (set up BEFORE spending meaningfully)
- **Quote form submit** — primary conversion (the /request-a-quote/ form).
- **Phone calls ≥ 60s** — primary conversion. Use Google **call-from-ads** tracking and
  **website call tracking** on the 027 203 1446 number.
- Optional secondary: click-to-call taps, "get directions" on the GBP location asset.
- Import into Maximize Conversions / tCPA only once these are firing cleanly.

---

## Ad assets (create at account/campaign level)

- **Call asset:** 027 203 1446 (enable call reporting; schedule to business hours except
  Emergency campaign = 24/7).
- **Location asset:** link the Google Business Profile so the Wellington location shows.
- **Sitelinks (4–6):**
  - Tree Removal → /services/tree-removal/
  - Tree Pruning → /services/tree-pruning/
  - Stump Grinding → /services/stump/stump-grinding/
  - Emergency Tree Care → /services/emergency/
  - Free Quote → /request-a-quote/
  - Section Clearing → /services/tree-removal/section-clearing/
- **Callouts:** `4.9 Stars 79 Reviews` · `Qualified Arborists` · `Council-Trusted` ·
  `Free Quotes` · `Tidy Clean-Up` · `11+ Years Experience` · `Fast Storm Response` ·
  `Free On-Site Quotes` (each ≤ 25 chars; no ★ symbol — Google strips/rejects it).
- **Structured snippets:**
  - Header **Services:** Tree Removal, Tree Pruning, Stump Grinding, Section Clearing,
    Crown Reduction, Hedge Trimming, Emergency Storm Response
- **Image assets:** upload 3–5 real job photos (before/after removals, the crew/truck,
  a tidy finished site). Landscape 1.91:1 + square 1:1 minimum.
- **Business name + logo assets** for the account.

---

## Differentiators woven through the copy
Qualified arborist (top-tier arboriculture qualification) · 11+ years' experience · the
**same qualified arborist quotes AND does the work** · trusted by Wellington city councils
& national agencies · 4.9★ / 79 Google reviews · tidy clean-up ("as if we were never
there") · free no-obligation quotes · fast storm response.

---

## Pre-launch checklist
- [ ] Conversion tracking live and verified (form submit + calls ≥60s) — test both.
- [ ] Create 4 campaigns + 13 ad groups (names must match the CSVs exactly).
- [ ] Import `keywords.csv` and `responsive-search-ads.csv` via Google Ads Editor.
- [ ] Build the shared negative list from `negatives.csv`; apply to all 4 campaigns.
- [ ] Confirm each ad group's Final URL resolves (no redirects/404s) and page is mobile-fast.
- [ ] Set geo = greater Wellington with **Presence** location option.
- [ ] Search Partners OFF, Display OFF.
- [ ] Set daily budgets per the table; bidding = Maximize Clicks + max-CPC caps.
- [ ] Add all assets: call, location/GBP, sitelinks, callouts, structured snippets, images.
- [ ] Each RSA shows "Excellent"/"Good" Ad Strength; pin nothing unless needed for compliance.
- [ ] Set a review reminder for day 7 and day 14 (search-terms report → new negatives;
      check call quality; shift budget to top ad groups).
- [ ] After ~30 conversions, move to Maximize Conversions, then Target CPA (~NZ$45–60).
- [ ] Later, once tracking is proven, test a Performance Max campaign as an add-on.
