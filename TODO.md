# TreeCo — Unfinished Code Projects

_A working to-do list of the loose ends in the repo, in the order I'd tackle them.
Generated 2026-07-26. The app itself is in good shape — there are no scattered
stub functions or broken pages; the unfinished work is mostly the tail end of the
terracotta redesign plus a few roadmap features._

---

## 1. Finish the terracotta / cream redesign

The redesign is ~80% done — the design tokens, the light translucent bottom tab
bar, and the sign-in screen are all in. What's left is cleanup and the app-chrome
colours that still show the **old bark brown**.

### 1a. Fix the PWA app-chrome colours ✅ DONE
Phone status bar / splash / install icon no longer show the old bark brown.
- `frontend/public/manifest.json` — `theme_color` → terracotta `#C15A34`, `background_color` → cream `#FCF5EC`.
- `frontend/index.html` — `<meta name="theme-color">` → terracotta `#C15A34`.
- Blueprint §6, step 6.

### 1b. Retire the legacy colour tokens ✅ DONE
All 260 `var(--moss)` / `var(--bark)` usages across 30 files swapped to the canonical
`var(--terra)` / `var(--ink)` names, the dead aliases removed from `theme.css`, and a
stale `#4A6741` moss-green fallback in Calendar.jsx corrected. Build + all 21 tests
pass. Blueprint §6, step 2.

### 1c. Move hardcoded hex values to semantic tokens — TOP 4 FILES DONE ✅ (rest to do)
Completed the semantic token set in `theme.css` (added `--ok`/`--ok-pale`,
`--sky-pale`, `--danger-pale` — there was previously no green/"ok" token or pale-tint
tokens at all) and swapped every exact-value status hex to a token in the four worst
offenders: **Layout.jsx, JobCard.jsx, JobDetailPanel.jsx, Dashboard.jsx**. All swaps
were exact value matches, so zero visual change; build + 21 tests pass.

Mapping used: `#C0392B`→`--danger`, `#FFF0EE`→`--danger-pale`, `#D4851A`→`--amber`,
`#FDF3E3`→`--amber-pale`, `#4A7FA5`→`--sky`, `#EBF3FA`→`--sky-pale`,
`#4A6741`→`--ok`, `#F0F7EE`→`--ok-pale`.

**Still to do (rest of the app):** apply the same mapping to the other ~13 files
(Calendar, Safety, QuoteBuilder, QuoteView, Pipeline, SWMS, MulchDump, WorkOrder,
HSDocuments, Chat, SentQuotes, ToolRequests, RiskAssessment). Deliberately left for a
human eye: neutral greys (`#888`/`#aaa`…), pure `#fff`, one-off brighter greens
(`#2e7d32` checkmarks), Xero brand blue (`#13B5EA`), and near-duplicate tints
(`#E8F0E6`, `#EEF4FA`) — these aren't clean status-token matches.

### 1d. Per-screen redesign passes (larger)
Blueprint §5 names six priority screens for a full visual pass (Dashboard, Pipeline,
JobDetailPanel, Calendar, Safety, Login). Confirm each matches the mockup, then apply
the same tokens/patterns to the remaining pages (Planner, Mulch, Tools, Team,
Clients, Settings, Quote Builder/View, Work Order, SWMS/SOP/Risk Assessment).

---

## 2. Roadmap features from the main blueprint (`TreeCo-Blueprint.md`)

These are planned but not fully built. Much of the plumbing already exists
(Supabase functions for Xero, SMS, geocode, reminders), so several are "wire up +
finish" rather than "build from scratch." Confirm current state before starting each.

- **Phase 1b — Xero integration.** AUDITED ✅ — it's substantively built (real OAuth,
  token refresh, invoice write-back, P&L parsing; all functions have live callers), NOT
  stubbed. One concrete bug breaks half the loop, plus a few smaller issues:
  1. **BLOCKING BUG — OAuth scope.** `Settings.jsx:583` (and `Clients.jsx:345`) request
     only `accounting.contacts.read`. So connect + contact-sync work, but **invoicing
     and P&L always fail** (token lacks `accounting.transactions` and
     `accounting.reports.read`). Fix: add those two scopes. ⚠️ Existing Xero
     connections must re-authorize after this change.
  2. `xero-invoice/index.ts:97` sends the contact by **name only**, ignoring the
     `xero_contact_id` it already loads (`:73`) → risks duplicate Xero contacts. Use
     the linked ID like `mulch-invoice:77-79` does.
  3. `xero-auth` never validates the OAuth `state` param (CSRF gap); `Clients.jsx`
     connect flow doesn't send a `state` at all.
  4. No deploy/secret health check — a missing `XERO_CLIENT_ID`/secret only surfaces as
     a runtime failure. Consider a status indicator in Settings.
  5. `xero-pnl` fires ~13 sequential Xero report calls per dashboard load (rate-limit
     risk) and classifies revenue/expenses by fuzzy title matching — cache + harden.
- **Phase 1b — expanded SMS/email triggers.** Currently only two triggers ship (lead
  ack + internal new-lead notify). Blueprint lists the rest (quote follow-ups, booking
  confirmations, on-the-way texts). `Planner.jsx` already drafts "on my way" texts —
  automate them. (Blueprint §"Expanded SMS/Email Automation Triggers".)
- **Phase 3+ — time-window booking with geographic clustering.** `BookQuote.jsx` takes
  enquiries but doesn't offer bookable time slots or cluster jobs by area.
- **Phase 2+ — offline PWA.** Service worker / offline caching for low-signal job
  sites. Manifest exists but there's no offline strategy yet.

---

## 3. Smaller loose ends

- **HSDocuments** flags "{n} SiteWise-recommended documents not yet added"
  (`pages/HSDocuments.jsx:176`) — the add/upload flow for those may be incomplete.
- **Staff training register** has a hardcoded "Primary ITO … Not yet completed"
  note (`pages/StaffTrainingRegister.jsx:76`) — check if this should be data-driven.
- **WorkSafe notified** shows a plain "Not yet" (`pages/RiskAssessment.jsx:693`) —
  no actual notify action wired up.

---

### Suggested order for tomorrow
1. ~~**1a**~~ ✅, ~~**1b**~~ ✅, and ~~**1c** (top 4 files)~~ ✅ are done.
2. **Xero blocking bug (#1 above)** — a ~2-line scope fix that makes invoicing + P&L
   actually work. Highest business value on the list. (Forces one-time re-consent.)
3. Finish **1c** across the remaining ~13 files using the mapping above.
4. **1d** per-screen redesign passes, then the other Phase 1b feature (SMS triggers).
