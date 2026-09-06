# TreeCo Workflow Redesign

September 2026. Companion to `TreeCo-Workflow-Redesign.html` (the illustrated report) and the editable design canvas. Research notes with sources are in `research/`; mockup sources are in `mockups/`.

## In short

Recommendation: Direction A ("Quote Desk") for the job record, with Direction C's "Today" inbox as the home screen. Every job becomes one quote-first record with a price, a status stepper, the quote description, photos and a live activity feed. Leads and acceptances email both Josh and Ashley. The scheduler gets truck rows, people as chips, and leave greyed out. The original nine statuses come back as a forward-only stepper. Menus hide everything that isn't the next step.

Direction B ("Flow Board") is the most visual and the most drag-and-drop, but the least phone-friendly. All three share the same job record, scheduler and emails, so the choice is about the home screen, not a rewrite.

## The workflow the app should understand

Lead comes in → Quote visit on a Tue/Thu run → Quote sent → Accepted → Scheduled on a truck → Stump grind → Done, to invoice → Invoiced in Xero. Side states: On hold, Declined. Spencers and Downer portal work joins the same line with its own KO reference, SLA clock and SOR items.

- Josh does every quote visit and writes every quote. Needs instant notice of leads and acceptances, and the price and description of any quote without opening the builder.
- Ashley books visits, chases quotes, schedules trucks, invoices, confirms portal changes. Needs one place that says what to action now and a scheduler that shows who is available.
- Crews open the truck iPad, see today's stops, take photos, mark done. Should never see quoting or office menus.

## The app today: eight findings

1. Activity is buried and passive. It renders only inside stage 4 of the quote builder, collapsed, and only "opened" events are real; it has no buttons.
2. The quote is invisible from the job. The drawer shows address, phone, notes and enquiry photos; the price is a button label; the description is never shown.
3. Three status lists compete: the full ten in dropdowns, a trimmed seven and a four-item manual list shipped as dead code, and per-status forward-action buttons beside the dropdown.
4. Nobody is assigned to a job. `schedule.assigned_to` is never written; only the truck lane is. No leave or availability exists.
5. Lead notifications are split: email leads go to office@ only, website leads to josh@ only; acceptances reach Josh only for residential; declines reach only office@. Addresses are hard-coded in five edge functions.
6. Many quotes per job, four separate "best quote" heuristics, versions only on accept or reopen.
7. The Sent Quotes page, the best quote-tracking screen, is unlinked from navigation.
8. Eleven top-level nav items, four of them for occasional tasks.

## What the best apps do (summary)

See `research/02-scheduling-apps.md`, `research/03-quote-crm-patterns.md`, `research/04-cross-device-design.md`.

Ten recurring patterns: one record whose status moves it; status set by events, overrides in one menu; one primary button computed from status; rows are trucks or crews with an Unassigned lane; a tray you drag from holding only ready work; conflict feedback at the moment of assignment; one chronological feed per job; a "needs you" home rather than a stats dashboard; prompted, never automatic, follow-ups; few tabs and more panels.

## The status list, restored

| Status | Set by |
|---|---|
| New Lead | form, email, phone entry |
| Quote Visit Booked (was Quote Scheduled) | dropped on a quote run |
| Quote Sent (Opened ×N shown underneath) | send |
| Accepted, to be scheduled | client, or "accept on behalf" |
| Scheduled | dropped on a truck-day |
| Stump Grinding | crew, from the work order |
| Done, To Invoice | crew, from the work order |
| Invoiced | pushed to Xero / portal |
| On Hold (side state) | person, via … |
| Declined (side state, reason kept) | client, or person via … |

Rendered as a stepper, not a dropdown. Events drive the steps so the stepper cannot lie; the exception menu is the only manual control.

## Three directions

### A · Quote Desk
Mail-style three panes: navigation, list grouped by what needs you first, the full record with activity always visible. Closest to Quotient and Apple Mail. Best for Josh writing and chasing quotes and Ashley scanning accepted and new. Tradeoff: no whole-pipeline picture in one view. Phone: the same list, tap pushes to the record.

### B · Flow Board
The restored statuses as lanes grouped into Quoting / Doing / Getting paid, each with a dollar total. Drag right to move on; drag an Accepted card down onto a truck-day to schedule. Dropping into a lane that needs information opens a small sheet. Best for seeing the whole business at once. Tradeoff: needs a wide screen; phone shows one lane at a time with swipe-to-advance.

### C · Today
An inbox of decisions, one button each: new leads (book a visit or decline), accepted (schedule), questions (reply), quotes gone quiet (follow up or snooze), finished jobs (invoice). Right rail: who is on the road and a live feed. Best for Ashley's morning and Josh between visits. Tradeoff: the full pipeline lives under All jobs.

They combine: C as the home tab, A as the Jobs tab, B's board as an optional view on the Jobs tab.

## Shared pieces

Job record: price, stepper, quote description, photos, activity beside it. Under "…": versions, copy to new quote, preview as client, client details, enquiry and site notes, work order and job pack, text the client, put on hold, mark declined. One quote per job with automatic versions after send. Copy to new quote creates a new job number linked to the source. Old jobs are recallable from the client page.

Scheduler: trucks and the grinder trailer are rows; every staff member is a chip dropped on a truck for the week or a day; leave and sick days grey the person out; the tray holds only Accepted work and quote visits awaiting a run; dropping shows "Dan + Mike free, fits" before you let go.

Emails: one event, one line, one button, sent to every address in Settings → Notifications. Instant for new lead, accepted, declined, client question. In-app only for opened, followed up, crew finished.

## Feature specs

- Notifications: recipients list in `app_settings`, read by notify-office, inbound-lead, book-quote, send-quote-email, quote-followup.
- At a glance: New leads and Accepted are always the first two groups on the home screen, with counts and totals. The Actions page merges into this.
- Quote-first job: record leads with price, stepper, description, photos; pre-quote material collapses behind "…" once past Quote Sent (extend `showsQuoteReference`).
- Staff, trucks, availability: new `resources` table replaces the hard-coded lanes; `schedule.assigned_to` written on drop; new `availability` table for leave, sick and part days; truck iPads unchanged.
- Activity feed: write `quote_events` for sent, followed up, edited, accepted, declined, comment, photo, scheduled, invoiced; feed becomes the single source for Sent Quotes, follow-ups and the record.
- Versions and copies: snapshot on every edit after send; Versions control from v2; copy to new quote creates a linked job; accepted quotes stay locked.
- Menus, not pages: three or four primary nav items per role; Mulch, Tools, Marketing, Team, Chat, Clients, Settings under More.
- Access levels unchanged.

## Desktop, iPad, iPhone

| Width | Navigation | Job record | Scheduler |
|---|---|---|---|
| under 768px | bottom tab bar, 4 tabs, push navigation | full screen, full-width primary button, sheets for edits | day list; move via "…" menu |
| 768–1023px | collapsible sidebar over list + detail | detail pane, activity stacked below | week grid, tray as bottom sheet, touch-and-hold to lift |
| 1024px and up | sidebar + list + detail | description left, activity right | week grid with tray on the right; drag, resize, shortcuts |

44pt targets; one accent for the primary action; touch drag after a 250ms hold; undo toast after every drop; dark mode from existing tokens.

## Nothing is lost

Dashboard money tiles → Reports under More; the workload and to-do widgets become the home screen. Jobs list → Jobs tab. Actions → merged into Today and each job's feed. Calendar + Planner → one Schedule tab with quote runs as a row. Sent Quotes → the Sent filter on Jobs. Quote builder → "Edit quote" with stages as tabs. Work order, job pack, SSSP, text client → under "…" and on the truck day run. Clients → More, showing every job number per client. Portal panels, KO SLA banner, SOR codes → unchanged inside the record. Mulch, Tools, Marketing, Team, Chat, Safety, Settings → More (Safety stays a tab for crews).

## Roadmap

1. Week 1: notifications and the feed. Recipients list; all lead and quote functions email it; write every event to `quote_events`; restore the ten statuses as the single list and delete the dead trimmed lists.
2. Weeks 2–3: the job record. Rewrite `JobDetailPanel.jsx`; one quote per job with auto-versions; migration for `quotes.job_id` unique and a version trigger.
3. Week 4: home and navigation. Today inbox from Actions + DashboardWorkload + DashboardFollowUps; Jobs list grouped by need; 3–4 item nav with More.
4. Weeks 5–6: scheduler. `resources` and `availability` tables; people chips; write `assigned_to`; leave blocks; merge Planner quote runs into the grid.
5. Week 7: board view, dark mode pass, e2e specs.

Quick wins needing no design decision: email both Josh and Ashley on every lead and acceptance; link Sent Quotes from Jobs; show the quote price and first line on the job row and drawer header; delete the ~600 lines of dead kanban and dashboard-table code.

## Decisions needed

1. Home screen: A, B, C, or the recommended C-home + A-jobs combination.
2. Ashley's email address for notifications, and whether office@ still receives copies.
3. Truck names and the grinder as a row; anything else that gets double-booked (chipper, Avant).
4. Status labels: original wording or the shorter stepper labels.
5. Keep Tuesday / Thursday as the default quote-run rows.
