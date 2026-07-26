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

### 1a. Fix the PWA app-chrome colours (quick — 15 min)
The phone status bar, splash screen, and install icon still use the old bark brown
`#2C2416` instead of terracotta/cream. This is the most visible leftover.
- `frontend/public/manifest.json` — `theme_color` and `background_color` are still `#2C2416`.
- `frontend/index.html` — `<meta name="theme-color" content="#2C2416" />` still old.
- Blueprint calls for terracotta + cream here (`TreeCo-Redesign-Blueprint.md` §6, step 6).

### 1b. Retire the legacy colour tokens (medium — a couple of hours)
`theme.css` currently aliases the old names (`--moss` → `--terra`, `--bark` → `--ink`)
so nothing breaks, but **30 files still call `var(--moss)` / `var(--bark)` directly.**
The blueprint wants these retired page by page (§6, step 2). Files still using them:
components/ (QuoteReference, NewJobModal, JobCard, Layout, CartrackMap,
PipelineColumn, JobDetailPanel, StatusGroup), App.jsx, and pages/ (Chat,
RiskAssessment, StaffHub, Planner, SOP, QuoteBuilder, JobPack, Safety, BookQuote,
QuoteView, Calendar, SWMS, MulchDump, Settings, WorkOrder, HSDocuments, Dashboard,
Login, Pipeline, ToolRequests, SentQuotes).

### 1c. Move hardcoded hex values to semantic tokens (medium)
~49 hardcoded hex colours remain (e.g. amber `#D4851A`, red `#e53935`) across 17
files, instead of the semantic tokens (`--warn`, `--crit`, `--ok`, `--info`). Worst
offenders: Layout.jsx, JobCard.jsx, JobDetailPanel.jsx, Dashboard.jsx, Calendar.jsx.

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

- **Phase 1b — Xero integration polish.** Functions exist (`xero-auth`, `xero-sync`,
  `xero-invoice`, `xero-pnl`). Verify the full connect → sync → invoice loop works
  end to end and surface it in Settings. (Blueprint §"Phase 1b — Xero Integration".)
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
1. **1a** (15 min, high visual payoff) →
2. **1c** semantic-colour cleanup on the top 3–4 files →
3. **1b** legacy-token retirement, a few pages at a time →
4. Then pick one Phase 1b feature (Xero verify or SMS triggers) to make real progress.
