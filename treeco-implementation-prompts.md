# TreeCo — Claude Code Implementation Prompts

**How to use:** Open Claude Code in the TreeCo repo. First copy `treeco-ui-audit.md` and `quote-day-mockup.html` into the repo root (Claude Code will read them). Then paste **Prompt 0** to start the session, and the numbered prompts **in order, one at a time** — each ends with a commit, so any problem is isolated to one change. Prompt 8 runs your Playwright suite before anything ships; Prompt 9 deploys and re-tests live.

---

## Prompt 0 — Session setup (paste first)

```
You are implementing an approved UI/UX overhaul of TreeCo, a job-management PWA for a tree services company (React/Supabase, deployed at app.urbantreeservices.net). Read treeco-ui-audit.md in the repo root — it contains numbered findings (F1–F28) that the following prompts reference — and quote-day-mockup.html, which is the approved visual reference for the quoting flow (colors, layout, interactions).

Ground rules for this whole session:
- Work on a new branch: ui-overhaul-aug26.
- One prompt = one commit with a message referencing the finding numbers.
- Never make destructive schema changes. New columns are nullable or defaulted; never drop or rename existing columns, routes, or components until a prompt explicitly says to.
- Preserve all existing functionality unless a prompt explicitly removes it.
- Reuse the app's existing design tokens (cream background, dark brown ink, rust primary, green/orange source colors) — do not introduce new colors beyond those in the mockup.
- After each prompt, run the build and fix any type/lint errors before committing.
- Do not deploy anything until I say so (Prompt 9).

Confirm you've read both files, tell me the framework/stack you found, and list the files that render: the Jobs list, the job drawer, the quote builder, and the Calendar. Then wait.
```

---

## Prompt 1 — Zero-risk polish sweep (F6, F16, F25, F27b + cuts)

```
Implement the polish sweep — presentation-only, no logic changes:

1. tel: links (F27b): everywhere a client phone number renders (job drawer, Actions cards, Clients list), wrap it in <a href="tel:+64..."> styled as the app's chip/pill with min 44px tap height. Strip spaces from the number in the href only.
2. Title-case portal imports (F6): display-transform ALL-CAPS job titles/addresses/client names from Downer/Spencers to title case (keep raw data unchanged in the DB). Handle "159 MAZENGARB RD" → "159 Mazengarb Rd"; preserve NZ abbreviations (St, Rd, Cres, Grv, Tce) and don't lowercase "NZ".
3. Fleet table (F25): remove the "FLEET — COF & RUC" section from the dashboard entirely (the empty state currently tells users to "run the SQL in Supabase"). Leave the underlying component in the codebase, just unmounted.
4. Marketing Blog tab: remove the Blog tab from the Marketing screen. Posts tab stays.
5. Xero-unconnected state (F16): when Xero has no data/connection, replace the three $0 revenue tiles and the revenue chart with a single "Connect Xero to see revenue" card, and suppress the "Pipeline thin — push advertising" alert whenever its inputs come from an unconnected source.
6. Small fixes (F25): "(SUPERSEDED)" in document names renders as a muted badge, not part of the shouting title; "Text Upper" style truncated button labels become "Text client"; the Planner's unplaced-jobs list shows each job once (name + address on one row, not two columns repeating the address).

Acceptance: build passes; tapping a phone number on a phone opens the dialer; dashboard shows no fleet table and no $0 tiles when Xero is unconnected. Commit: "Polish sweep: tel links, title-case imports, remove fleet/blog, Xero empty state (F6,F16,F25,F27b)".
```

---

## Prompt 2 — Status simplification (F2, F3)

```
Simplify job statuses. Current manual list: New Lead, Quote Scheduled, Quote Sent, Accepted — To Be Scheduled, Scheduled, Stump Grinding, Complete — To Be Invoiced, Invoiced, On Hold, Declined.

1. Derive automatically (set by system events, shown as a read-only chip):
   - Quote Scheduled → when the job is saved into a quote run
   - Quote Sent → when a quote is sent
   - Accepted — To Be Scheduled → on client acceptance (this event already exists — the drawer shows "Accepted: <timestamp>")
   - Invoiced → when the job is invoiced (Xero event if wired, else stays manual for now)
2. The manual status menu shrinks to: Scheduled, On Hold, Declined, plus the existing "Mark Complete" button for completion. Keep the underlying status values/enum unchanged in the DB so history and integrations are untouched — this is a UI + event-hook change, not a migration.
3. Remove "Stump Grinding" from the status menu (F3). It remains as the Work Order completion-gate flag; jobs with grinding outstanding show a small 🌱 badge on their pipeline card.
4. Performance (F24): render the status dropdown menu on demand (portal/popover), not as hidden DOM inside every card.

Acceptance: a job card's manual menu shows exactly 4 choices; sending a quote flips the chip to "Quote Sent" with no manual step; existing jobs keep their current statuses untouched. Add/update unit tests for the derivation logic if a test setup exists. Commit: "Derive pipeline statuses, 4-option manual menu, grinding badge (F2,F3,F24)".
```

---

## Prompt 3 — Calendar day run view (F26)

```
Build the compact-width Calendar day view per quote-day-mockup.html — open that file in a browser first and copy its interactions and visual hierarchy exactly. No new route: this is how the existing Calendar renders a day at phone width when the signed-in user has a run booked that day.

1. Header: back chevron + "Thu 6 Aug ▾" — the date is a dropdown that expands a week strip on tap (no permanent week strip). Subtitle: "Your quote run · N stops · X km".
2. Crew switcher: small avatar buttons (initials, colored to match the Calendar's existing resource colors) beside the date. Tapping another user shows their day read-only: stops as rows, current stop outlined, no action buttons, subtitle appends "viewing only".
3. Progress bar: one segment per stop (done=green, current=rust, todo=neutral).
4. Current stop card: source color bar (green private / orange Downer), stop number + ETA, client name large, address, chips row (meeting status F27a, job type, source), then buttons: Navigate (primary) and Quote, plus full-width green "Quote sent — next stop".
5. Navigate opens the platform maps app with the address pre-filled (maps.apple.com/?daddr= works cross-platform; use geo: fallback if you already have a helper).
6. "Quote sent — next stop": sets the derived Quote Sent status (Prompt 2), collapses the stop into a Done list (strikethrough row + amount), promotes the next stop, shows a toast, scrolls to top. Sticky bottom bar always shows "Next: {name} — {address}" + full-width Navigate button; on the last stop it becomes "Finish run".
7. Upcoming stops: large rows (≥76px) in run order — number, meeting icon + name, address + ETA, and a 52px navigate icon button per row.
8. Navigate icon: use the 3D-beveled SVG location-arrow from the mockup (the NAV() function) — extract it into a shared icon component. Use it for every navigate control; remove any compass/emoji icons.
9. Regular width (iPad/Mac): calendar day rendering is unchanged.

Acceptance: with a run booked today, opening Calendar on a narrow viewport shows the run list; "Quote sent — next stop" advances and updates the pipeline status; crew avatars switch to a read-only view of that resource's day. Commit: "Calendar compact day view: quote run list with navigate + auto-advance (F26)".
```

---

## Prompt 4 — On-site quote view (F27, F27a)

```
Tapping "Quote" (or the current stop card) in the day run view opens a bottom sheet — the on-site quote view. Copy the sheet in quote-day-mockup.html. It contains ONLY:

1. Client name, address, and the tap-to-call phone pill (from Prompt 1).
2. Meeting banner, full width, colored: green "🤝 Client is meeting you on site" or orange "🚪 No one home — quote from the street", driven by the job's meeting_status (Prompt 5 adds the field; until then render from a nullable field and hide the banner when unset).
3. ONE info panel, by source:
   - Private jobs: "Client notes" — the enquiry notes + any client-submitted photos as a thumbnail strip.
   - Downer/Spencers jobs: "Job info" — a 2-column facts grid parsed from the portal payload: Priority (URG/GNL/VSC/PM + plain-English label), Complete-by (date + countdown), Type, Order number, Access notes. Reuse/extract the parsing needed for F5. Raw portal text goes behind a "View original" disclosure.
4. One full-width primary button: "Open quote builder" → routes to the existing quote builder for this job (creating a draft quote if none exists, same as "+ New quote" does today).
5. A small muted "All job details" link at the bottom opening the existing full job drawer.
Nothing else appears in this sheet: no status controls, Mark Complete, Work Order, Job Pack PDF, text-client, or forms.
6. F27a: the meeting status also renders as a colored chip on the current stop card and as a small 🤝/🚪 icon prefix on upcoming rows (already scaffolded in Prompt 3's chips row).

Acceptance: from the day run, one tap opens the sheet; a Downer stop shows the facts grid, a private stop shows notes/photos; one more tap lands in the quote builder for that job. Commit: "On-site quote sheet: meeting banner, source-aware info panel, builder shortcut (F27,F27a)".
```

---

## Prompt 5 — Required meeting status at booking (F28)

```
Add the meeting-status field, captured when Ashley books a quote run.

1. Schema: add nullable column meeting_status to the job/stop table ('meeting' | 'not_meeting' | null). Additive migration only — no other schema changes.
2. Planner "Save as quote run" flow: the confirmation step lists every stop with a required two-option segmented control: "🤝 Meeting the client" / "🚪 Not meeting — quote from street". NO default selection. The Save button is disabled until every stop is set; unset stops get a highlighted hint "Set meeting status to save this run".
3. The control is editable afterwards from the stop's entry in the Calendar (and the job drawer), and edits reflect immediately in the day run view and quote sheet.
4. Existing jobs with null meeting_status: banner hidden, chip shows nothing — no fake defaults.

Acceptance: attempting to save a run with any stop unset is blocked with a visible reason; setting all stops enables Save; the chosen value appears on Josh's stop card, row icon, and sheet banner. Add a unit test for the save-gating if a test setup exists. Commit: "Required meeting-status at run booking, editable after (F28)".
```

---

## Prompt 6 — Quote builder restructure (F8, F9) — bigger change, take care

```
Restructure the quote builder screen into four collapsible stages with a sticky action bar. Do NOT change any data model, pricing math, GST handling, or the quote locking/reopen/history behavior — this is layout only.

1. Stages, one open at a time, with a sticky header stepper: Items → Crew pack → Terms → Review & send. Collapsed stages show one-line summaries ("2 items · $2,875 incl GST"; "3 staff · large chipper · difficulty 3"; first line of terms).
2. Sticky bottom bar on compact width: running total (incl GST) + the primary action (Save / Send / Reopen to edit — same states as today), always visible.
3. Line items collapse to "title · line total" once valid; tap to expand. The formatting hint paragraph ("Title = location…") becomes a dismissible one-time tooltip.
4. Crew pack (F9): tools checklist becomes wrap-around tappable chips (≥44px); equipment rows become segmented controls; nothing about what's stored changes.
5. Discussion stays at the bottom of Review & send, unchanged.

Acceptance: an existing locked quote renders identically in content (all fields present, still locked); creating a quote walks the four stages; totals update live in the sticky bar; nothing about saved quote data changes shape. Commit: "Quote builder: staged sections + sticky total bar, layout only (F8,F9)".
```

---

## Prompt 7 — Actions inbox cleanup (F1, F5)

```
1. F5: Actions cards get a parsed summary header — address (title-cased), onsite date, complete-by countdown chip, response code — with the raw portal text collapsed behind "View original". Reuse the parser from Prompt 4.
2. F1: the Dashboard "To do" card becomes a one-line summary ("10 new leads → Open Actions") linking to the Actions tab — remove the duplicated per-item list from the dashboard.
Keep Mark done / Dismiss / Open job exactly as they are.

Acceptance: dashboard no longer lists individual leads; an Actions card is readable at a glance without scrolling a text dump. Commit: "Actions as sole inbox with parsed cards (F1,F5)".
```

---

## Prompt 8 — Full test pass (run BEFORE deploying)

```
1. Run the full existing Playwright e2e suite. Fix every failure you introduced; if a test fails because the UI intentionally changed (e.g. it expects the old 10-option status menu, the dashboard fleet table, or the old quote builder layout), update the test to assert the NEW approved behavior and note each such change in the commit message.
2. Add new e2e specs:
   - status-simplification.spec: manual menu shows exactly Scheduled/On Hold/Declined; sending a quote sets "Quote Sent" automatically.
   - day-run.spec (mobile viewport 390×844): calendar day renders run list; "Quote sent — next stop" advances current stop and updates status; navigate links have correct maps href; crew switcher shows read-only view.
   - quote-sheet.spec: sheet shows meeting banner + correct panel per source + builder button; none of the excluded controls (Mark Complete, Work Order, etc.) are present.
   - booking-gate.spec: saving a run with an unset meeting status is blocked; setting all statuses enables Save.
   - quote-builder.spec: locked quote still shows all content and stays locked; stage summaries match entered data; total in sticky bar equals summary total.
3. Run the whole suite again until green. Then give me a summary of everything changed this session, any tests you modified and why, and anything you deliberately left alone.
```

---

## Prompt 9 — Deploy + live verification

```
Merge ui-overhaul-aug26 to the deploy branch and push live using this repo's existing deploy process (tell me what that process is before running it, and wait for my OK).

After deploy: run the Playwright suite against the production URL (or at minimum the day-run, booking-gate, and quote-builder specs), and manually verify on production: 1) an existing accepted quote renders complete and locked; 2) pipeline statuses on existing jobs are unchanged; 3) the dashboard loads with the Xero card, no fleet table; 4) booking a test quote run demands meeting status. Report results. If anything critical fails, revert the deploy first, diagnose second.
```

---

## Pulled-forward prompts (Peak-End + Doherty)

*Added after the UX-law audit of the shipped overhaul: two laws scored weak. **Peak-End** — the run's ending has no closing moment (Prompt 3b fixes it). **Doherty** — skeletons/optimistic UI/caching were parked in "later batches" but are quick wins that touch every screen, and are the only law the overhaul currently fails (Prompt 10 pulls them forward). Both are drop-ins for the same session: 3b runs any time after Prompt 3; 10 runs any time after Prompt 3 (ideally before Prompt 8 so its specs are covered by the test pass).*

---

## Prompt 3b — End-of-run summary card (F29 — Peak-End Rule)

```
Add a closing "run complete" moment to the Calendar day run view built in Prompt 3. Peak-End rule: the loop has a good peak ("Quote sent — next stop") but no ending — give it one. Reuse the tokens and card styling from quote-day-mockup.html; no new colors.

1. Trigger: when the final stop is completed — i.e. the user taps the sticky bottom bar's "Finish run" state (last stop), or marks the last remaining stop "Quote sent". Detect "no upcoming stops remain" rather than hard-coding a count.
2. Present a full-screen (compact width) / centered-card (regular width) summary over the day, using the app's bottom-sheet or a dedicated view — not a browser alert:
   - Heading: "Run complete" with the date ("Thu 6 Aug").
   - Three stat tiles in the app's card style: quotes sent (count of done stops), total quoted (sum of the per-stop amounts already shown on the Done rows — incl GST, same figure), and round-trip distance (the km already computed for the run).
   - A compact list of the day's stops: client name + amount, in run order (reuse the Done-row style, no navigate buttons).
   - One primary button "Back to calendar" (rust, ≥56px) and a muted secondary "View today's jobs".
3. Motion: a brief, tasteful celebratory flourish (e.g. the stat tiles rising/fading in, or a lightweight confetti burst) that respects `prefers-reduced-motion: reduce` — no animation when reduced motion is set. Keep it under ~800ms; this is polish, not a loading screen.
4. Data only, no new writes: the card is derived entirely from the run's already-completed stops. It does not change any status, send anything, or hit the network. Dismissing returns to the normal Calendar day.
5. Read-only crew view (Prompt 3, item 2): when viewing another user's day, NO finish card ever appears — it's their run, view-only.
6. Empty/edge cases: a run where every stop was already done on entry still shows the card only in response to an explicit finish tap, never auto-popped on load; a single-stop run still shows all three tiles.

Acceptance: completing the last stop of a booked run shows the summary with correct count/total/km derived from the done stops; "Back to calendar" returns to the day; reduced-motion users see no animation; switching to a crew member's read-only day never shows it. Add a day-run.spec assertion (Prompt 8) that finishing the last stop renders the summary with the expected totals. Commit: "End-of-run summary card on day run view (F29, Peak-End)".
```

---

## Prompt 10 — Perceived-speed batch: skeletons, optimistic UI, cache-then-refresh (F21, F22, F23 — Doherty Threshold)

```
Implement the perceived-speed work from the audit — the Doherty Threshold batch (feedback under ~0.4s, or optimistic instantly). Presentation/interaction only; do not change data shapes, pricing, or business logic.

1. Skeleton screens (F21): replace bare text loading states ("Loading dashboard…" and any spinner-only first paint) on Dashboard, Jobs, and Calendar with skeletons that mirror the real layout — tile blocks, list rows, chart frame, calendar grid — using a subtle shimmer in the app's neutral tokens (var(--line)/var(--bg)). Never a spinner alone for a 2–10s load. Extract a shared <Skeleton> primitive (block, text-line, circle variants) and compose per screen.
2. Optimistic UI (F22): for status changes (the 4-option menu from Prompt 2), the day-run "Quote sent — next stop" advance (Prompt 3), Work Order checkbox/gate toggles, and additions chips — update the UI immediately, then sync behind. On failure: revert the exact change and show a toast ("Couldn't save — tap to retry"), reusing the day-run toast component. No full-screen blocking spinner on these interactions.
3. Cache-then-refresh (F23): on Jobs, Calendar, and Dashboard, render last-known data from an in-memory/persisted cache instantly on revisit, then refresh in the background and reconcile (stale-while-revalidate). Tab-switching between these should never show a skeleton on a screen already visited this session — skeletons are for the first, cold load only.
4. Scope guard: do NOT re-do F24 (on-demand status menu rendering / list virtualization) — it shipped in Prompt 2. If the Jobs list still renders eagerly past ~50 rows, note it but leave it for its own change.
5. Consistency: one skeleton primitive, one toast component, one cache helper — reused across all three screens, not per-screen reimplementations (design-system discipline).

Acceptance: cold-loading Dashboard/Jobs/Calendar shows a layout-matching skeleton, not text or a bare spinner; changing a status or advancing a day-run stop reflects instantly and reverts with a toast if the sync is forced to fail; returning to an already-visited Jobs/Calendar tab paints cached content with no skeleton flash. Add specs (Prompt 8): a perceived-speed.spec asserting the skeleton renders on cold load and that an optimistic status change appears before the network resolves (mock a delayed/failed response to assert revert + toast). Commit: "Perceived speed: skeletons, optimistic UI, cache-then-refresh (F21,F22,F23, Doherty)".
```

---

## Later batches (from the audit, when ready)

These are specced in `treeco-ui-audit.md` but intentionally not in this session — each is a session of its own: **iPad split view + sidebar** (F11), **Planner rebuild: single map, area groups, build-a-run, inline geocoding** (F19, F20), **Truck "Today" home + role-trimmed navigation** (F17, F13, F14). *(F21–F23 moved up into Prompt 10 above.)*
