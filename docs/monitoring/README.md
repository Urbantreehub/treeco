# Urban Tree Services — Monitoring & Safe Auto-Actions

Two pieces. Piece 1 (Ads) is ready to install now. Piece 2 (SEO) needs a one-time connect.

---

## Piece 1 — Google Ads Monitor  ✅ ready
`google-ads-monitor.js` — runs inside your Google Ads account, no servers/API token.

**What it does**
- Emails you a digest (spend, leads, cost/lead, per-campaign, budget-limited flags).
- **Safe auto-action:** adds obvious junk search terms (jobs / DIY / other cities / "for sale" etc.) as exact negatives — capped at 15/run, junk-list only.
- **Reports (no auto-action):** expensive-but-no-lead search terms to review, disapproved ads, anomalies. These wait for you.
- Never raises a budget, changes a bid, or edits the website.

**Install (5 min, one-time)**
1. Google Ads → **Tools** (wrench) → **Bulk actions** → **Scripts**.
2. Click **+** → name it "UTS Monitor" → delete the sample code → paste the whole `google-ads-monitor.js`.
3. Click **Authorise** (grant it access to the account + to send email as you).
4. Click **Preview** — it runs without making changes and shows the log. Check the log looks sane.
5. Click **Run** once to get your first email, then **Schedule** → e.g. **Weekly, Monday 7am** (or Daily if you want).

**Dials (top of the file)**
- `AUTO_ADD_NEGATIVES: true` → set `false` to make it report-only while you build trust.
- `WASTE_REVIEW_MIN_COST: 8` → NZ$ threshold for flagging no-lead terms.
- `JUNK: [...]` → add/remove junk words as you learn what searches waste money.
- `LOOKBACK_DAYS: 7` → digest window.

**Best started AFTER** the UTS campaigns have a couple of weeks of data (so the search-terms report is meaningful).

---

## Piece 2 — SEO / Site Monitor  ✅ scheduled (external version live)
Scheduled task **`uts-seo-site-monitor`** — runs **weekly, Monday ~8am**, read-only, no account access needed. Delivers a digest to you in-app each run.

**What it does (works with zero setup):**
- **Indexing/liveness:** tracks how fast Google indexes the new suburb pages + blog posts (via `site:` searches + fetching pages).
- **Site health:** homepage + key pages load OK; PageSpeed / Core Web Vitals check.
- **Rankings (approximate, via search):** where the site sits vs the Wellington competitors on target queries.
- **Content gaps + Top 3 actions this week.** Any content change is a **suggestion only — never auto-published.**

Manage it in the app's **Scheduled** section. Dials: edit the task to change cadence or queries.

**Optional upgrade → real data (needs your one-time OAuth connect):**
Connecting **Google Search Console** + **GA4** would swap the "approximate rankings via search" for *actual* impressions/clicks/positions and organic traffic. That connect is a consent step only you can do; until then the external version above runs fine on estimates.

---

## The guardrail (both pieces)
Auto-do only money-SAVING, low-risk things (junk negatives). Everything that **raises spend or publishes to the live site waits for your one-click approval.**
