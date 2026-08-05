# Urban Tree Services — Google Ads Launch Runbook

A plain-English, click-by-click guide to import this build and go live. No prior Google Ads
experience assumed. Do every step in order. **Nothing you do spends money until the very last
step (Post).** Read Step 9 (Pre-Launch QA) and Step 10 (Post) before you start clicking.

- **Currency:** NZ$ · **Total budget:** NZ$1,500/month core + optional NZ$150–250/mo suburb test
- **Networks:** Google Search only · **Google tag:** AW-746524681
- **Phone:** 027 203 1446 · **Website:** https://urbantreeservices.net

Files you'll import (all in this `docs/ads-build/` folder):
`keywords.csv`, `responsive-search-ads.csv`, `negatives.csv`, plus the new
`suburb-keywords.csv` and `suburb-ads.csv`.

---

## Before you start — one-time prep

1. Make sure you have a Google Ads account created and you can sign in at
   https://ads.google.com. (If the account is brand new and has never spent, you may be pushed
   into a simplified "Smart" setup — click **"Switch to Expert Mode"** / "Create an account
   without a campaign" so you land in the full interface.)
2. **Set up conversion tracking FIRST** (details in Step 8). Ads can run without it, but you'll
   be flying blind. Ideally do this a day ahead so it has time to verify.
3. Download and install **Google Ads Editor** (free desktop app, Mac & Windows):
   https://ads.google.com/home/tools/ads-editor/ — this is what we import the CSVs into. It lets
   you build everything offline and review before anything goes live.

---

## Step 1 — Open Google Ads Editor and download the account

1. Open the **Google Ads Editor** desktop app.
2. Click **Add** (or **Manage accounts** on first run).
3. Click **Open** next to a Google login → sign in with the account that owns the Ads account →
   grant access.
4. Select the **Urban Tree Services** account in the list → click **Download**.
5. Choose **Download all campaigns** (basic) → click **OK**. Wait for it to finish. You now have
   a local copy of the (currently empty) account to build into.

> Tip: everything you do in Editor is **local only** until you click **Post**. You cannot spend
> money by accident in Editor. Post is the one and only "go live" button.

---

## Step 2 — Create the campaigns and ad groups (shells first)

The CSVs reference campaigns and ad groups **by name**, so these must exist before you import.
The fastest reliable way is to let the keyword import create them, but doing the shells by hand
first gives you cleaner control. Either works — here's the by-hand version:

1. In the left tree, click **Campaigns** → **+ Add campaign** (or the **+** button). Create these
   five campaigns (type: **Search**). Exact names matter — copy them character-for-character:
   - `Core – Removal/Arborist`
   - `Pruning/Stump`
   - `Emergency/Storm`
   - `Brand`
   - `Suburb – Local`  *(the new optional suburb test campaign)*

   > The dash in the names is an **en-dash "–"**, not a hyphen "-". Easiest way to get it right:
   > copy the names straight from the `Campaign` column of the CSV files. Editor matches on the
   > exact text, so a hyphen vs en-dash mismatch will create duplicate campaigns.

2. For each campaign, set **Networks = Search only** for now (full settings in Step 7).
3. You can skip manually adding ad groups — the keyword import in Step 3 will create any ad group
   named in the CSV automatically. (If you prefer, add them by hand from the `Ad Group` column.)

---

## Step 3 — Import the keywords

1. Menu bar: **Account → Import → From file…**
2. Browse to `docs/ads-build/keywords.csv` → **Open**.
3. Editor shows a **column-mapping / preview** screen. It auto-detects columns by their header
   names. Confirm the mapping reads:
   - `Campaign` → **Campaign**
   - `Ad Group` → **Ad group**
   - `Keyword` → **Keyword**
   - `Match Type` → **Match type**
4. Leave **"Create new campaigns/ad groups if they don't exist"** ticked so any missing ad groups
   are made automatically.
5. Click **Finish / Import**. Editor shows a **"Proposed changes"** summary (e.g. "68 keywords
   added"). Read it. Nothing is live yet.
6. Repeat **Account → Import → From file…** for the new **`suburb-keywords.csv`** (64 keywords,
   8 ad groups under the `Suburb – Local` campaign). Same column mapping.

> All keywords in this build are **Phrase** or **Exact** only — this is deliberate. Do **not**
> add Broad match at launch.

---

## Step 4 — Import the responsive search ads (RSAs)

1. **Account → Import → From file…** → choose `responsive-search-ads.csv` → **Open**.
2. On the mapping screen confirm the headline/description columns map correctly:
   - `Headline 1…15` → **Headline 1…15**
   - `Description 1…4` → **Description 1…4**
   - `Final URL` → **Final URL**
   - `Path 1` / `Path 2` → **Path 1** / **Path 2**
   - `Campaign` / `Ad Group` map to Campaign / Ad group as before.
3. Click **Finish / Import** and review the proposed changes (13 RSAs, one per ad group).
4. Repeat for the new **`suburb-ads.csv`** (8 RSAs — this file has **Headline 1…13** and
   **Description 1…4**; the mapping screen will show only 13 headline columns, which is correct —
   RSAs can have anywhere from 3 to 15 headlines).
5. Check the **Ad Strength** column shows "Good" or "Excellent" for each ad. Don't pin anything
   unless you have a compliance reason to.

---

## Step 5 — Import the negatives as a shared list

Negatives are best held as **one shared list** applied to all campaigns, so you maintain them in
one place. Editor imports negatives slightly differently:

1. In the left tree click **Shared library → Negative keyword lists** (under the account, not a
   single campaign).
2. Click **+ Add negative keyword list**, name it exactly: `UTS – Master Negatives`.
3. Open `negatives.csv` (in this folder) in a spreadsheet or text editor. Copy the **Keyword**
   column values (skip the header row). Each row's match type is in the file — the account-level
   negatives are mostly **Broad** with some **Phrase** (see the `Match Type` column).
4. In Editor, with the new list selected, paste the negatives into the negative-keywords grid.
   The simplest reliable method: use **Make multiple changes** (top toolbar) → **Negative
   keywords → Add/update** → paste rows in the form `List name, Keyword, Match type`.
5. Apply the list to **all campaigns**: select the `UTS – Master Negatives` list → **Applied to**
   → tick `Core – Removal/Arborist`, `Pruning/Stump`, `Emergency/Storm`, `Brand`, and
   `Suburb – Local`.

> If the shared-list flow is fiddly in your Editor version, a simpler fallback: paste the same
> negatives directly into **each** campaign's campaign-level negatives. It's less tidy to maintain
> but works identically at launch. Either way, every one of the 5 campaigns must have the full
> negative set covering it.

---

## Step 6 — Review all proposed changes

1. Click the **"Manage" / green pending-changes** counter (top of window) to see everything
   staged: 5 campaigns, all ad groups, ~132 keywords total, 21 RSAs, negatives.
2. Click **Check changes** (top-right) — Editor validates for errors (over-length text, missing
   final URLs, duplicate keywords). Fix any red errors before continuing. Warnings (yellow) are
   usually fine.
3. **Do NOT click Post yet.** Several critical settings can't come from CSV and must be set by
   hand first (Step 7), and you must finish QA (Step 9).

---

## Step 7 — Settings that CANNOT come via CSV (set these by hand)

These are set per campaign. You can set them in Editor (select the campaign → edit fields in the
lower pane) **or** after posting, in the web interface at ads.google.com. Setting them in Editor
before Post is cleaner.

### 7a. Daily budgets (per campaign)
Google works in **daily** budgets (monthly ÷ 30.4). Set each campaign's daily budget:

| Campaign | Monthly | **Daily budget to enter** |
|---|---|---|
| Core – Removal/Arborist | ~NZ$675 | **NZ$22.20** |
| Pruning/Stump | ~NZ$450 | **NZ$14.80** |
| Emergency/Storm | ~NZ$225 | **NZ$7.40** |
| Brand | ~NZ$75 | **NZ$2.50** |
| Suburb – Local *(optional test)* | ~NZ$150–250 | **NZ$5.00–8.20** (start at **NZ$5.00**) |

> Google may spend up to **2× the daily budget** on a busy day but never more than the daily ×
> 30.4 in a month. See the suburb-budget note at the bottom of this runbook before funding
> `Suburb – Local`.

### 7b. Location targeting
- Target: **greater Wellington region** — Wellington City, Lower Hutt, Upper Hutt, Porirua, and
  Kāpiti Coast (incl. Paraparaumu). Add the individual suburbs (Karori, Khandallah, Newtown,
  Miramar, Island Bay, Kelburn, Thorndon, Tawa, Churton Park, Ngaio, Wadestown, Brooklyn,
  Berhampore, Wilton, Crofton Downs) if you want tighter control.
- **CRITICAL — Location options:** set to **"Presence: People in or regularly in your targeted
  locations."** Do **NOT** leave the default *"Presence or interest"* — that shows your ads to
  people anywhere in the world merely searching *about* Wellington, and burns budget on clicks
  that will never become jobs.
  - In the web UI: Campaign → **Settings → Locations → Location options** → choose **Presence**.
  - In Editor: this specific option may not be exposed; if not, set it in the web UI right after
    posting and **before** the campaigns have had time to serve much.

### 7c. Language
- **English.**

### 7d. Networks
- **Search only.** Turn **OFF** "Search Partners" and **OFF** "Display Network / Include Google
  Display Network." Never leave "Include Display" ticked — it dumps budget into low-intent
  placements.

### 7e. Bidding
- Start every campaign on **Maximize Clicks**.
- Add a **maximum CPC bid limit** so a single click can't run away:
  - Core / Pruning / Suburb: **NZ$9**
  - Emergency/Storm: **NZ$14** (these terms cost more; you want to win them)
  - Brand: **NZ$2**
- (Roadmap: move to Maximize Conversions after ~15–20 conversions — see Step 11.)

### 7f. Ad rotation
- **"Optimise: prefer best-performing ads."**

### 7g. Ad schedule
- **All hours** for Core, Pruning, Brand, and Suburb.
- **Emergency/Storm: run 24/7** (storm calls come at night). Leave it all-hours.
- (Later, after ~2–3 weeks of data, you can add a small bid boost 7am–7pm Mon–Sat on Core/Pruning.)

### 7h. Devices
- **All devices.** Most tree-service leads call from a mobile — watch mobile call volume in the
  first fortnight.

---

## Step 8 — Conversion tracking (set up and verify BEFORE meaningful spend)

Do this in the **web interface** (Tools → Goals/Conversions), not Editor. The Google tag
**AW-746524681** should already be on the site — confirm it via the tag's "Diagnostics" or Google
Tag Assistant.

Create at least these two **Primary** conversion actions:
1. **Quote form submit** — fires when the `/request-a-quote/` form is successfully submitted.
2. **Phone calls ≥ 60 seconds** — use Google's **calls from ads** tracking and **website call
   tracking** on 027 203 1446.

Optional secondary: click-to-call taps, "Get directions" taps on the location asset.

**Verify both fire** before launch: submit a test quote form and place a test call; confirm each
shows in Tools → Conversions within a few hours (status "Recording conversions"). Do not switch
to Maximize Conversions / Target CPA until these are firing cleanly.

---

## Step 9 — Ad assets (add at account or campaign level)

Assets (formerly "extensions") lift click-through and are effectively free real estate. Add them
in the web UI (**Ads & assets → Assets**) or in Editor (**Shared library / Assets**). At minimum:

- **Sitelinks (add 4–6):**
  - Tree Removal → https://urbantreeservices.net/services/tree-removal/
  - Tree Pruning → https://urbantreeservices.net/services/tree-pruning/
  - Stump Grinding → https://urbantreeservices.net/services/stump/stump-grinding/
  - Emergency Tree Care → https://urbantreeservices.net/services/emergency/
  - Free Quote → https://urbantreeservices.net/request-a-quote/
  - *(For the `Suburb – Local` campaign you can optionally add a **Service Areas** sitelink →
    https://urbantreeservices.net/tree-services/ )*
- **Callouts (short, no ★ symbol):** `Qualified Arborists` · `Free Quotes` ·
  `4.9 Stars 79 Reviews` · `Council-Trusted` · `Tidy Clean-Up` · `Fast Storm Response`
- **Structured snippets:** Header **Services** → Tree Removal, Tree Pruning, Stump Grinding,
  Section Clearing, Crown Reduction, Hedge Trimming, Emergency Storm Response.
- **Call asset:** 027 203 1446 (enable call reporting; schedule to business hours except the
  Emergency campaign = 24/7).
- **Location asset:** link the **Google Business Profile** so the Wellington location shows.
- **Image assets:** upload 3–5 real job photos (before/after removals, the crew/truck, a tidy
  finished site). Landscape 1.91:1 **and** square 1:1.
- **Business name + logo** assets for the account.

---

## Step 10 — PRE-LAUNCH QA CHECKLIST (run this before you Post)

Tick every box. If any fails, fix it before posting.

- [ ] **Conversion tracking is LIVE and verified** — test form submit AND test call both recorded
      (Step 8).
- [ ] **Geo-targeting correct** — greater Wellington, and **Location option = Presence** (not
      presence-or-interest).
- [ ] **Networks = Search only** — Search Partners OFF, Display OFF on every campaign.
- [ ] **Negatives loaded** — the master negative set covers all 5 campaigns (Step 5).
- [ ] **Budgets correct** — NZ$22.20 / 14.80 / 7.40 / 2.50, and Suburb test at NZ$5.00 (Step 7a).
- [ ] **Bidding = Maximize Clicks** with max-CPC caps (NZ$9 / 14 / 2).
- [ ] **Final URLs resolve** — click each ad group's Final URL and confirm it loads a live page,
      no 404, no redirect. All service pages plus the 8 suburb pages
      (`/tree-services/karori/`, `/khandallah/`, `/miramar/`, `/island-bay/`, `/newtown/`,
      `/lower-hutt/`, `/porirua/`, `/kelburn/`) are confirmed live as of this build.
- [ ] **Ad Strength** is "Good"/"Excellent" on every RSA; nothing pinned unnecessarily.
- [ ] **Assets added** — sitelinks, callouts, structured snippets, call, location/GBP, images.
- [ ] **Campaign names match the CSVs exactly** (en-dash, not hyphen) — no accidental duplicates.
- [ ] **Editor "Check changes" shows no red errors.**

---

## Step 11 — Go live: click POST

1. Back in Google Ads Editor, click **Check changes** one last time (top-right) — resolve any
   errors.
2. Click **Post** (top-right corner).

> ⚠️ **Post is the moment spend begins.** The instant you Post, campaigns become eligible to
> serve and Google can start charging for clicks. There is no "preview live" — Post = live.
> Because of that:
> - **Start budgets conservatively** (the daily figures above already are). You can always raise
>   them once you see the money is buying quality leads.
> - Consider posting in the **morning** so you can watch the first few hours of traffic.
> - If you want to stage it, **pause the `Suburb – Local` and `Brand` campaigns** at Post and
>   enable them a few days later once the core campaigns look healthy (see suburb note below).

3. After posting, immediately open ads.google.com and re-confirm the **Location option = Presence**
   and **Display = off** settings took effect (these are the two that most often need a manual
   check in the web UI).

---

## Step 12 — First 2 weeks watch-list

Don't over-tinker. Early data is noisy. Focus on these:

1. **Day 1:** confirm ads are actually showing (search one of your terms from a Wellington
   location, or use **Tools → Ad Preview & Diagnosis** — never repeatedly Google your own live ad,
   it skews data and costs you clicks). **Don't panic on day 1** — impressions and clicks take a
   little time to build, and conversions are lumpy.
2. **Every 2–3 days: Search Terms report** (Keywords → Search terms). This shows the *actual*
   searches that triggered your ads. Add anything irrelevant (DIY, jobs, other cities, firewood,
   equipment hire, etc.) as a **negative** to the master list. This is the single highest-value
   habit — it stops wasted spend.
3. **Check which keywords/ad groups convert** vs just spend. Shift budget toward the ad groups
   producing quote forms and calls; pause or lower bids on those that only burn clicks.
4. **Watch call quality** — most leads call. Listen to a few recorded/tracked calls to confirm
   they're real jobs, not wrong numbers or sales calls.
5. **Suburb test:** judge `Suburb – Local` on its own small budget. Suburb-name searches are
   low-volume, so give it 2–4 weeks before deciding. If a suburb converts, consider a dedicated
   larger push there; if some suburbs get zero impressions, that's normal — demand is thin.
6. **After ~15–20 conversions** across the account and tracking proven, switch the main campaigns
   from **Maximize Clicks → Maximize Conversions**. Later, at ~30+ conversions/month, move to
   **Target CPA** starting around **NZ$45–60** (a removal job is worth NZ$500–3,000, so that's
   comfortably profitable). Change bidding on **one campaign at a time** and give each a week.

---

## Suburb campaign — budget note (read before funding `Suburb – Local`)

The `Suburb – Local` campaign is **optional and experimental**. It targets suburb-specific
searches (e.g. "arborist karori", "tree removal island bay") and sends each ad group to its
**matching live suburb landing page** (`/tree-services/<suburb>/`), which gives a better Quality
Score than a generic page.

**Do NOT let it cannibalise the core NZ$1,500 on day one.** Recommended approach:
- **Fund it from a small separate test slice of NZ$150–250/month** (daily ~NZ$5.00–8.20), *on top
  of* or clearly ring-fenced from the core budget — not by cutting the core campaigns.
- **Better still, launch it a week or two after the core campaigns** have proven they convert.
  Post the core four first; enable `Suburb – Local` once you trust the tracking and the core
  numbers.
- Suburb search volume is **low** — expect modest impressions. The payoff is high intent and
  cheap, highly-relevant clicks, not volume. Judge it over 2–4 weeks, per suburb.
- If the test proves out, the natural next step is to expand to the other live suburb pages
  (Thorndon, Tawa, Churton Park, Ngaio, Wadestown, Brooklyn, Berhampore, Wilton, Crofton Downs,
  Upper Hutt, Paraparaumu, Wilton, Wadestown) using the same ad-group template.

---

*Build files: `keywords.csv`, `responsive-search-ads.csv`, `negatives.csv`,
`suburb-keywords.csv`, `suburb-ads.csv`, `campaign-structure.csv`. See `README.md` for the
strategy overview.*
