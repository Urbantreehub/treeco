# TreeCo — Full UI/UX & Functional Audit

*Audited live at app.urbantreeservices.net on 5 August 2026, logged in as the owner (Full access). Every finding below references a screen I actually opened and captured.*

---

## Step 0 — The model this audit is built on (confirm or correct)

**Purpose.** TreeCo runs Urban Tree Services' entire job lifecycle: leads arrive (from the Downer and Spencers portals as raw work orders, or as private enquiries), get clustered into quote runs, quoted, accepted, scheduled onto crew days, executed by the trucks with safety forms and photos, then invoiced. Success for a session is: Josh sends a quote in minutes from his phone; Ashley books a full, geographically sensible day; a truck closes out a job with nothing missing.

**Users in context.**

| Role | Person | Device & conditions | Frequency |
|---|---|---|---|
| Full access | Josh (Director/Climber) | Phone in the field (quoting, oversight), Mac in office | Many times daily |
| Office | Ashley (Admin Officer) | Mac at a desk — books quote runs and work runs, keeps the pipeline moving | All day, daily |
| Truck | Big Truck / Small Truck (shared crew logins) | iPad in the vehicle — gloves, sunlight, time pressure, one hand busy | Start/end of every job |

**Job lifecycle → screen map.** Lead intake (Actions inbox, Jobs) → Quote run planning (Planner: Quote Runs) → Quoting (Quote builder) → Acceptance (quote portal + Actions) → Work scheduling (Planner: Work Schedule, Calendar) → Execution (Work Order, Safety forms, Chat, Tools) → Invoicing (status "Complete — To Be Invoiced" → Xero). Screens that don't map to a lifecycle stage: Marketing (incl. Blog), Mulch, Fleet table on the dashboard — these are side-operations, which matters for curation later.

**Frequency ranking (the audit optimizes hardest for the top):** 1) Truck: view today's job, progress status, add photos; 2) Josh: build & send a quote from phone; 3) Ashley: cluster jobs into runs and book them; 4) Josh: business-health glance; 5) everything else (safety admin, team docs, clients, mulch, marketing).

> **Assumption to flag:** I audited as Full access only. I could not see the actual Truck or Office logged-in views, so role findings are based on the access levels in Settings → Team and what the interface exposes. If Truck logins already hide most tabs, some Section 5 items are already done — tell me and I'll adjust.

---

## The rulebook (research summary — sources cited inline throughout)

Touch targets ≥ 44×44 pt (Apple HIG — developer.apple.com/design/tips) with ≥ 24 px spacing floors (WCAG 2.5.8). Primary actions belong in the middle/bottom of phone screens (HIG designing-for-ios); tab bars suit ≤ 5 frequent destinations (NN/g mobile-navigation-patterns). On iPad, don't stretch the phone layout: use 2–3 column split views, sidebars, popovers, and minimize full-screen modals (HIG designing-for-ipados, split-views, tab-bars). Show the few most important options first and defer the rest — progressive disclosure (NN/g progressive-disclosure). Decision time grows with the number of choices (Hick's Law, lawsofux.com); working memory holds ~7±2 chunks (Miller's Law). Cut marginally useful features that burden the majority (NN/g simplicity-vs-choice). Question every form field; labels above fields; right keyboard types (NN/g mobile-input-checklist). Skeleton screens for 2–10 s loads, real-layout previews, never bare spinners (NN/g skeleton-screens); UI feedback within 0.1 s → optimistic updates (NN/g response-times).

---

## Section 1 — Workflow & Navigation

**F1. New leads live in three places at once — Critical.** A new Downer work order appears on the Dashboard "To do" list, as a card in Jobs, and as an item in the Actions inbox. Three surfaces, one task ("quote it"), no indication of which is canonical. This violates the single-source-of-mind principle behind NN/g's simplicity guidance and makes the 8-item Actions badge feel like a second, competing to-do list.
*Fix:* Make **Actions the only inbox**. The Dashboard "To do" card becomes a one-line summary ("10 new leads → Open Actions"); Jobs stays the pipeline of record but new-lead triage happens in Actions only. Tap depth to "quote it" from the dashboard: currently 3+ taps and a decision about where to go; after: Dashboard → Actions → Open job = 2 taps, no decision.

**F2. The 10-option status dropdown is the app's heaviest decision — Major.** Every job card carries a status chip whose menu offers: New Lead, Quote Scheduled, Quote Sent, Accepted — To Be Scheduled, Scheduled, Stump Grinding, Complete — To Be Invoiced, Invoiced, On Hold, Declined. Ten choices on every card (Hick's Law) — and at least four of them are states the system already knows: a quote run booking should set *Quote Scheduled*, sending a quote sets *Quote Sent*, client acceptance already sets *Accepted* (the drawer shows "Accepted: 4 Aug at 8:58 PM"), and invoicing via Xero can set *Invoiced*.
*Fix:* Derive those four automatically and shrink the manual menu to the decisions only a human makes: **Scheduled, On Hold, Declined, Complete** (the drawer's "Mark Complete" button already exists for the last one). Show the derived state as a read-only chip. Menu shrinks 10 → 4.

**F3. "Stump Grinding" is a task, not a lifecycle stage — Major.** It sits in the status menu *and* reappears as a completion-gate item on the Work Order ("Stump grinding outstanding"). A job that's had its trees felled but awaits the grinder isn't in a different lifecycle stage — it has an outstanding sub-task. Keeping it in the status list means a job "loses" its Scheduled/Complete position to record a sub-task.
*Fix:* Remove it from the status menu; keep it solely as the Work Order gate flag it already is, surfaced on the job card as a small badge (🌱 grinding due).

**F4. The job drawer buries crew actions below owner actions — Minor.** The drawer's order is: status → Mark Complete → contact details → scope → quote → Work Order → Job Pack PDF → Text client → forms. "Mark Complete" (an end-of-job action) is at the top; "Work Order" (the start-of-job action) needs a scroll. *Fix:* Order by lifecycle: details → Work Order/Job Pack → quote → status controls → Mark Complete last, or make the action row context-aware (job Scheduled → lead with "Open Work Order").

**F5. Actions inbox shows raw portal dumps — Major.** Each Downer item prints the whole work-order text (Order:, Response:, Access: AM: YYYYYNN…) inside the card. The crew-relevant facts — address, onsite date, complete-by date, urgency — are buried in a text block, and the YYYYYNN access strings are noise to everyone.
*Fix:* Parse into a compact header (address · onsite date · complete-by countdown · type) with the raw text behind a "View original" disclosure — classic progressive disclosure (NN/g).

**F6. Case soup from portal imports — Minor.** Imported jobs shout ("159 MAZENGARB RD PARAPARAUMU"), private jobs don't ("Jenny O'Brien"). Title-case portal imports on ingest; it's the single cheapest polish win in the pipeline list.

---

## Section 2 — iPhone layout & controls

The bones are right: bottom tab bar with 5 labeled destinations (NN/g's exact ceiling), search at top, drawer-style detail. The issues are density and small targets.

**F7. Status chips and drawer close (✕) are under-sized — Major.** The status chip is ~28 pt tall and the drawer's ✕ sits in the top corner — both under the 44 pt HIG minimum and at the hardest-to-reach position for one-handed use. *Fix:* Chip tap area ≥ 44 pt (padding, not visual size); add swipe-down-to-dismiss and a bottom "Close" affordance on the drawer sheet on phones.

**F8. The quote builder is one very long page — Critical (Josh's own pain point).** On the phone — where most quoting happens — one screen stacks: lock banner, activity, line items (each with title, type toggle, description, formatting buttons, client-sees preview, photo strip, disposal + grindings dropdowns, price, qty), common items, GST summary, Job Pack (time, staff 1–6, three equipment toggle groups, difficulty 1–5, nine tool checkboxes), private notes, payment terms, discussion. That's far beyond Miller's 7±2 chunks visible at once, and the primary action (send/save) isn't anchored anywhere.
*Fix — restructure, don't rebuild:*
1. Four collapsible stages with a sticky header stepper: **Items → Crew pack → Terms → Review & send.** One stage open at a time; the others show one-line summaries ("2 items · $2,875 incl GST", "3 staff · large chipper · difficulty 3").
2. A **sticky bottom bar** on phones: running total + primary CTA (Save / Send) always in thumb reach (HIG bottom-placement guidance).
3. Line-item cards collapsed by default to `title · price` once filled; tap to expand and edit.
4. The formatting hint paragraph ("Title = location… no need to type dashes") should be a one-time tooltip, not permanent copy.

**F9. Job Pack inputs are checkbox/segment walls — Minor.** Nine tool checkboxes and three yes/no groups render as a grid of small targets. *Fix:* Convert tools to wrap-around tappable chips (44 pt), and collapse equipment rows to segmented controls with the common default pre-selected (chipper: Large, Avant: No, grinder: from scope).

**F10. Dashboard loads with bare text "Loading dashboard…" — Minor.** Replace with a skeleton mirroring the real layout (tiles, to-do list, chart frame) per NN/g skeleton-screens; cache last-known figures and refresh silently (stale-while-revalidate) so re-entry is instant.

---

## Section 3 — iPad layout & controls

**F11. The iPad gets a stretched phone UI everywhere — Critical.** At tablet width, TreeCo shows the same single column with a bottom tab bar: 1,100-px-wide job cards, full-width list rows, giant per-run maps, and a More… bottom sheet — precisely the antipattern Apple calls out ("take advantage of the large display… minimizing modal interfaces," HIG designing-for-ipados). The trucks — TreeCo's most important iPad users — get the least iPad-appropriate screens.
*Fixes, in priority order:*
1. **Jobs:** two-pane split view — pipeline list left (~380 pt), job detail right, replacing the overlay drawer. The drawer content already is a right-hand panel; promote it to a persistent pane (HIG split-views).
2. **Navigation:** at regular width, convert the tab bar + More-sheet into a **sidebar** listing all destinations — the More sheet disappears entirely on iPad (HIG tab-bars sidebarAdaptable).
3. **Calendar:** the agenda list becomes a proper week grid with resource colors; crew totals move to a right rail.
4. **Work Order (the truck screen):** two columns — scope, forms and completion gate left; photos and additions right — so the whole close-out state is visible without scrolling, in a truck, in sunlight.
5. Popovers instead of full-screen sheets for small pickers (status, date) at regular width (HIG popovers).

**F12. Split View / Slide Over — Untested, flagged.** As a PWA in a single column the app will function, but the fixed bottom sheet (More) and full-width maps will cramp at 320 pt Slide Over width. Verify once F11's responsive breakpoints exist.

---

## Section 4 — Feature & function audit

Inventory classification (Core = prominent · Secondary = behind progressive disclosure · Redundant = merge · Cut = remove):

| Function | Class | Note |
|---|---|---|
| Jobs / pipeline | Core | The spine of the app |
| Job drawer + Work Order + Job Pack PDF | Core | Crew execution path |
| Quote builder | Core | Restructure per F8 |
| Actions inbox | Core | Becomes the *only* inbox (F1) |
| Calendar | Core | Absorbs Planner "Work Schedule" (F15) |
| Planner (quote runs) | Core | Rework per Section 6 |
| Safety suite | Secondary | Deep but well-contained; keep under one entry |
| Chat, Tool requests | Secondary | Crew-facing; belongs on the Truck home |
| Clients, Team | Secondary | Office-facing lookup |
| Mulch | Secondary | Niche; fold under an "Office" group in the sidebar |
| Dashboard "To do" list | **Redundant** | Duplicate of Actions (F1) — reduce to summary link |
| Planner "Work Schedule" tab | **Redundant** | Same anatomy as Quote Runs; scheduling belongs with Calendar (F15) |
| Marketing → Blog tab | **Cut** | Zero connection to the job lifecycle; no channels connected; the website already handles content. Migration: none needed — Posts tab covers social when channels connect |
| Dashboard Fleet (COF & RUC) table | **Cut (for now)** | Ships a developer empty state ("run the SQL in Supabase to seed your fleet") to end users. Remove until fleet data exists; re-add as a Safety → Fleet card. Migration: none — table is empty |
| Revenue tiles showing $0 (Xero unconnected) | **Fix or hide** | $0 revenue/expenses/profit reads as catastrophe, and feeds a false "Pipeline thin — 0.0 crew days" alarm. Show "Connect Xero" card until connected (F16) |

**F13. The More sheet is a nine-item junk drawer — Major.** Planner, Mulch, Tools, Safety, Chat, Marketing, Team, Settings, Clients in one flat grid mixes daily tools with once-a-quarter admin (Hick's Law). *Fix:* On phone, group the sheet: **Plan** (Planner, Mulch) · **Crew** (Chat, Tools, Safety) · **Office** (Clients, Team, Marketing, Settings). On iPad, the sidebar makes this moot (F11.2).

**F14. Proposed information architecture:**

```
Dashboard (owner)          Jobs            Actions (inbox)      Calendar (+ scheduling)
More/Sidebar:
  Plan:    Planner · Mulch
  Crew:    Chat · Tool requests · Safety
  Office:  Clients · Team · Marketing (Posts only) · Settings
```

**F15. Merge "Work Schedule" into Calendar — Major.** The Planner's second tab generates one-stop "Crew day" cards that you then… drag onto the Calendar anyway (the tip on the card says exactly that). Two screens own scheduling. *Fix:* Calendar gains an "Unscheduled (accepted)" tray grouped by area; drag from tray to day. Planner keeps only quote runs. One screen per question: *Planner = where should we go? Calendar = when do we go?*

**F16. Unconnected Xero renders as $0 everywhere — Major.** The dashboard shows Total Revenue $0, Expenses $0, Profit $0, a flat revenue chart, and — worst — a red alert built on the bad data: "Pipeline thin — only 0.0 crew days booked. Push advertising now." A $20,717 week total sits on the Calendar at the same time. False alarms teach the owner to ignore real ones. *Fix:* Until Xero is connected, replace the tiles with a single "Connect Xero" card and suppress every derived alert.

---

## Section 5 — Role-based curation

Access levels already exist (Full / Office / Truck) — the win is trimming each role's surface to its actual workflow.

| Feature | Full (Josh) | Office (Ashley) | Truck (crew iPad) |
|---|---|---|---|
| Business Health dashboard | Show | Hide (already) | Hide |
| Jobs pipeline | Show | Show | Hide (see Today) |
| **Today screen (new)** | Optional | Show | **Show — home** |
| Actions inbox | Show | Show | Hide |
| Quote builder | Show | Show (edit) | Hide |
| Work Order | Show | Show | Show |
| Calendar (full) | Show | Show | Defer (own day only) |
| Planner / Mulch | Show | Show | Hide |
| Chat | Show | Show | Show |
| Tool requests | Show (approve) | Show | Show (submit) |
| Safety | Show (admin) | Show (admin) | Show (forms + sign-off only) |
| Clients / Team / Marketing / Settings | Show | Clients+Team show; Settings hide | Hide |

**F17. The Truck home should be a "Today" screen — Critical (highest-frequency task in the app).** A truck doesn't need a pipeline, an inbox, or a business dashboard; it needs: today's stops in route order, each opening straight into its Work Order, plus persistent Chat, Tool request, and safety sign-off shortcuts. Tab bar for Truck role: **Today · Chat · Safety · More(Tools)**. Everything else hidden — not because crews can't be trusted, but because every removed option makes the remaining ones faster under gloves and sunlight (NN/g simplicity-vs-choice).

**F18. Ashley's home = Jobs or a booking-focused Today, not Business Health.** She already can't see Josh's dashboard; make her landing screen the Actions inbox or Planner so her first tap of the day is her actual first task. Nothing is lost — she never had the dashboard.

---

## Section 6 — The Planner, rebuilt around areas (your request)

What exists: two tabs (Quote Runs / Work Schedule) with identical card anatomy; an abstract "Cluster radius — 5 km" slider; each suggested run is a card with a huge map; with sparse data that degenerates into a scroll of one-stop runs each carrying its own full-width map; 9 of 10 jobs "couldn't be placed on the map," listed at the bottom in a table that repeats the address in both columns.

Why it's confusing: the unit on screen is the *run*, but Ashley thinks in *areas* ("what have we got out in the Hutt?"). The radius slider is a clustering parameter, not a planning concept. And with 90% of jobs un-geocoded, the tool is planning blind.

**F19. One map, one area-grouped list — Critical.**
1. **Single persistent map** at the top showing *all* unscheduled jobs as pins — color = quote-needed vs work-to-schedule, badge = urgency countdown. Below it, one list grouped by **named area** (Wellington City · Hutt Valley · Porirua · Kāpiti — derived from suburb/postcode), each group header showing count and value: *"Hutt Valley — 6 jobs · $8,940."* This is Ashley's mental model made literal.
2. **Build-a-run by tapping:** tap pins or tick list rows; a bottom bar accumulates *"4 stops · 42 km round trip"* with a date field and one Save button. Auto-suggested clusters become a "Suggest runs" button that pre-ticks a sensible group — a starting point, not a fait accompli.
3. **Demote the radius slider** to an options popover. Ashley plans by area names, not kilometres.
4. **Merge the two tabs.** Identical anatomy = one screen with a Quotes/Work filter chip (and per F15, saved *work* runs land in the Calendar tray). One Planner, one question: where should we go, and with which stops?
5. **Fix geocoding inline — prerequisite.** 9 unplaced jobs make any map planner useless. Each unplaced job gets a tap-to-fix row (pre-filled address search); imported Kāinga Ora addresses should geocode on ingest, with failures surfacing in Actions, not silently at the bottom of the Planner.
6. **Shrink run maps to thumbnails** on saved-run cards; full map on tap. Kills the wall-of-maps scroll.

**F20. "Text clients a heads-up" is a great feature in the wrong hierarchy — Minor.** It sits as a co-equal primary button beside "Save as quote run." Make saving the run the single primary action, then offer texting as the natural next step in the confirmation ("Run saved for Thu 6 Aug — text the 4 clients?").

---

## Section 7 — Perceived speed & polish

**F21.** Skeletons for Dashboard, Jobs and Calendar first paint (2–10 s rule, NN/g); never a text-only loading state. — Minor
**F22.** Optimistic UI on status changes, additions chips, checkbox toggles: update instantly, sync behind, toast + revert on failure (0.1 s rule). — Minor
**F23.** Cache-then-refresh on revisited screens (Jobs, Calendar) so tab-switching feels instant. — Minor
**F24.** Each job card renders the full hidden 10-status menu in the DOM (33 cards × 10 options in the page text). Render menus on demand and virtualize the Jobs list as it grows past ~50. — Minor
**F25.** Polish list: developer empty state on Fleet table ("run the SQL in Supabase") must never reach users; "(SUPERSEDED)" insurance row shouts in caps on the dashboard; map pin labels truncate ("Mark…"); unplaced-jobs table duplicates the address in two columns; "Text Upper" truncates the client name mid-word ("Text Upper Hutt City Council" → "Text client" is safer); ALL-CAPS imports (F6). Individually trivial — together they're the gap between "works" and "premium." — Minor severity, Major compound effect

---

## Section 8 — Addendum: the "Quote run" day view (Josh's request, 6 Aug)

**F26. The Calendar day view doubles as the quote-run driving view — Critical.** No new screen. Ashley books Josh's quote runs onto the Calendar; when Josh opens that day on his phone, the run renders as a big ordered stop list instead of a thin agenda: one large current-stop card (client, address, source color, ETA, urgency chip) with **Navigate** (opens Maps, address pre-filled) and **Quote** buttons, then upcoming stops as large rows in run order — each with its own one-tap navigate icon. Tapping **"Quote sent — next stop"** marks the quote sent (auto-setting the F2 derived status), collapses the stop into a Done line with the amount, promotes the next stop, and the **sticky bottom bar** — always in thumb reach — offers "Navigate to next stop." On Mac/iPad regular width, the same day stays the normal calendar grid; the big-list treatment is the compact-width presentation of a day containing your own run (HIG: adapt presentation to size class, not separate features). The header shows only the current date as a tappable "Thu 6 Aug ▾" dropdown that reveals the week picker on demand — no permanent week strip stealing vertical space from the stop list (progressive disclosure; today is the answer 95% of the time). Beside the date, small **crew avatars (J · BT · ST)** switch the day view to another user's run — read-only, action buttons hidden, subtitle marked "viewing only" — so Josh can check where a truck is at a glance and jump back to his own day with one tap. Crew colors match the Calendar's existing resource dots. The loop *finish quote → drive to next* becomes one tap, with zero new navigation for anyone to learn.

**F27. On-site quote view: three things, nothing else — Critical.** When Josh opens a stop from his run to quote it, the job view shows exactly: (1) **client notes and photos** submitted with the enquiry; (2) a **meeting banner** — "Client is meeting you" / "No one home — quote from street" (a field Ashley sets when booking the run, surfaced as a colored banner, not a buried note); (3) one big **Open quote builder** button. For Downer/Spencers jobs, a compact panel of *their* job facts replaces client notes: priority/response code (URG/GNL/VSC/PM), job type, complete-by countdown, and access notes — parsed per F5, raw text behind a disclosure. Everything else in today's drawer — status controls, Mark Complete, Work Order, Job Pack PDF, Text client, job forms — is hidden in quoting context (progressive disclosure, NN/g): those belong to scheduled/execution stages, not to a lead being quoted. The full drawer remains reachable via a small "All details" link for the rare exception.

**F27a. Meeting status is visible on the stop card itself — Major.** The 🤝 Meeting you / 🚪 Not meeting state (set by Ashley per F28) shows as a colored chip on the current-stop card and as a small leading icon on every upcoming row in the run list — so Josh can see at a glance from the driver's seat which stops have a person waiting, before ever opening the job. The full banner still appears inside the on-site quote view (F27).

**F27b. Tap-to-call phone number on the job card — Minor, trivial to ship.** The client's number appears on the on-site quote view (and the job drawer) as a `tel:` hyperlink styled as a 44-pt pill button — one tap rings the client from the truck ("running late," "I'm at the gate," "no one home?"). The existing drawer already shows the number as plain text; wrapping it in `tel:` is a one-line change. Applies everywhere a phone number renders: quote view, job drawer, Actions cards, Clients list.

**F28. Meeting status is a required field at booking — Major.** The F27 meeting banner is only trustworthy if it's always filled in, so it's captured at the moment Ashley books the run — as a blocking step, not an optional note. When she hits "Save as quote run" (Planner, F19) the confirmation sheet lists every stop with a required two-option segmented control: **🤝 Meeting the client / 🚪 Not meeting — quote from street.** No default is pre-selected, the Save button stays disabled until every stop is set, and unset stops are highlighted with "Set meeting status to save this run." The same control is editable later from the stop's calendar entry (plans change), and any edit updates Josh's banner live. Rationale: a required choice with no default is the only pattern that guarantees the field is *decided* rather than defaulted — an unset banner shown to Josh as "unknown" would quietly become the norm (NN/g forms guidance: make required decisions explicit; never default safety-relevant fields).

## Prioritized roadmap

**Tier 1 — Quick wins (days, high impact):**
1. Truck "Today" home screen + role-trimmed tab bar (F17) — biggest daily win per tap.
2. Status menu 10 → 4 with derived states; drop "Stump Grinding" status (F2, F3).
3. Sticky total + CTA bar on the quote builder (F8.2).
4. Actions cards: parsed summary header, raw text behind disclosure (F5).
5. Skeletons + optimistic status changes (F21, F22).
6. Polish sweep: dev empty state, casing, truncations, duplicate columns (F6, F25).
7. Xero-unconnected state replaces $0 tiles and the false "pipeline thin" alarm (F16).

**Tier 2 — Structural (weeks):**
8. iPad split view: Jobs list + detail pane; sidebar navigation replaces More sheet at regular width (F11).
9. Quote builder staged sections: Items → Crew pack → Terms → Review & send (F8.1).
10. Planner rebuild: single map, area-grouped list, build-a-run, inline geocode fixing (F19).
10b. Calendar day view as quote-run driving view: current-stop card, one-tap navigate, auto-advance on quote sent (F26); on-site quote view with meeting banner + client notes/portal facts + quote-builder button (F27); required meeting-status field when Ashley saves a run (F28).
11. Calendar absorbs work scheduling with an "Unscheduled" tray; Planner keeps quote runs only (F15).
12. Actions becomes the sole inbox; dashboard To-do reduces to a summary link (F1).
13. Grouped More sheet on phone (F13); role landing screens (F18).

**Tier 3 — Cuts & consolidations:**
14. Cut Marketing → Blog tab (migration: none — nothing depends on it) (Section 4).
15. Remove Fleet table until data exists; re-home under Safety later (Section 4).
16. Merge Planner "Work Schedule" into Calendar (migration: saved runs appear as calendar tray items) (F15).
17. Retire the cluster-radius slider from the primary UI (migration: advanced options popover) (F19.3).

---

*Every roadmap item traces to a numbered finding. Severity counts: 5 Critical (F1, F8, F11, F17, F19), 8 Major, rest Minor. The four Criticals share one theme: the app currently shows everyone everything — the wins come from showing each person only their next action.*
