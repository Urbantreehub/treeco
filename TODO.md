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
1. ~~**1a**~~ ✅ and ~~**1b**~~ ✅ are done.
2. **1c** semantic-colour cleanup on the top 3–4 files (Layout, JobCard, JobDetailPanel, Dashboard).
3. **1d** per-screen redesign passes.
4. Then pick one Phase 1b feature (Xero verify or SMS triggers) to make real progress.
