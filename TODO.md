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

### 1c. Move hardcoded hex values to semantic tokens ✅ DONE (whole app)
Completed the semantic token set in `theme.css` (added `--ok`/`--ok-pale`,
`--sky-pale`, `--danger-pale` — there was previously no green/"ok" token or pale-tint
tokens at all) and swapped every exact-value status hex to a token across **all ~26
files**. All swaps were exact value matches, so zero visual change; build + 21 tests
pass.

Mapping used: `#C0392B`→`--danger`, `#FFF0EE`→`--danger-pale`, `#D4851A`→`--amber`,
`#FDF3E3`→`--amber-pale`, `#4A7FA5`→`--sky`, `#EBF3FA`→`--sky-pale`,
`#4A6741`→`--ok`, `#F0F7EE`→`--ok-pale`.

Deliberately left as-is (not clean status-token matches): neutral greys
(`#888`/`#aaa`…), pure `#fff`, one-off brighter greens (`#2e7d32` checkmarks), Xero
brand blue (`#13B5EA`), 8-digit alpha hexes (`#C0392B33` — can't append alpha to a
`var()`), and near-duplicate tints (`#E8F0E6`, `#EEF4FA`).

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

- **Phase 1b — Xero integration.** AUDITED ✅ and all 5 audit items FIXED ✅ (it was
  substantively built, not stubbed — one blocking bug plus smaller issues):
  1. ✅ **OAuth scope (was the blocking bug).** Added `accounting.transactions` +
     `accounting.reports.read` to the connect flow in `Settings.jsx` and `Clients.jsx`,
     so invoicing and P&L can now work. ⚠️ **Manual step:** any existing Xero connection
     must **Disconnect → reconnect** once to pick up the new permissions.
  2. ✅ **Duplicate-contact fix.** `xero-invoice` now sends the linked `xero_contact_id`
     (falls back to name/email), matching `mulch-invoice`.
  3. ✅ **CSRF hardening.** `Clients.jsx` now generates a `state`; `xero-auth` round-trips
     it back; both callbacks verify it matches before trusting the connection.
     (Residual: ideal is a server-side state store validated *before* token exchange —
     noted for later; current check is client-side after redirect.)
  4. ✅ **Health check.** Settings shows a "credentials not configured" warning and a
     **Test** button that pings `xero-pnl` and reports whether invoicing/P&L are
     authorised (surfaces a scope/secret problem instead of it failing silently).
  5. ✅ **P&L caching.** `xero-pnl` now caches results for 30 min (new migration
     `019_xero_pnl_cache.sql`; `?refresh=1` bypasses). Cache is best-effort so a
     missing table can't break the endpoint. ⚠️ **Manual step:** apply migration 019
     in the Supabase SQL editor. (Residual: the revenue/expense title-matching in
     `xero-pnl` is still fuzzy — left as-is since it needs real Xero data to tune.)

  ⚠️ **After deploying:** redeploy the edge functions (`xero-auth`, `xero-invoice`,
  `xero-pnl`) and apply migration 019.
- **Phase 1b — expanded SMS/email triggers.** BUILT ✅ (hybrid model — one-tap for
  crew/stage events, automated for the time-based ones):
  - **One-tap stage texts** on the job panel (JobDetailPanel): Confirm booking / On the
    way / Arrived / Running late / All done — pre-fill the SMS composer to review & send.
    Templates in `frontend/src/utils/smsTemplates.js`; logged with per-stage `kind`.
  - **Automated day-3 quote follow-up** — new scheduled function
    `supabase/functions/daily-notifications`. Idempotent, opt-out-aware. (Invoice/payment
    reminders are deliberately left to Xero, not sent from here.)
  - **Booking acknowledgement** — `book-quote` (SMS, falls back to email) and
    `inbound-lead` (email) now reply to the enquirer, not just the office.
  - **Opt-out**: new `clients.sms_opt_out` (migration `020`), gates the automated sends;
    toggle + status shown on the job panel.
  - Shared edge helper `supabase/functions/_shared/notify.ts` (E.164, sendTwilio, log,
    templates) replaces the copy-pasted versions for the new senders.
  - ⚠️ **Deploy steps** (see `daily-notifications/README.md`): apply migration 020;
    deploy `send-sms`, `book-quote`, `inbound-lead`, `daily-notifications`; and add a
    daily schedule for `daily-notifications` (`0 18 * * *`).
  - **Residuals / not done:** existing senders (quote-followup, send-job-reminders) were
    left on their own copies rather than refactored onto `_shared` (lower risk); email
    sends still aren't logged (only SMS are, in `sms_messages`).
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
1. ~~**1a**~~ ✅, ~~**1b**~~ ✅, ~~**1c** (whole app)~~ ✅, and ~~**all 5 Xero fixes**~~ ✅ are done.
2. **Deploy the Xero work:** redeploy edge functions (`xero-auth`, `xero-invoice`,
   `xero-pnl`), apply migration `019`, then Disconnect→reconnect Xero once and hit
   **Test** in Settings to confirm invoicing + P&L are authorised.
3. **Deploy the SMS/email triggers:** apply migration 020, deploy the messaging
   functions, and schedule `daily-notifications` (see its README).
4. **1d** per-screen redesign passes.
