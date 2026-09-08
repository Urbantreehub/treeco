# TreeCo Workflow Redesign

September 2026. Companion to `TreeCo-Workflow-Redesign.html` (the illustrated report) and the editable design canvas. Research notes with sources are in `research/`; mockup sources are in `mockups/`.

## In short

Decision (6 Sep): Direction A ("Quote Desk"), with three refinements: Josh's default is a Quoting view (Quotes + Quote runs only) with one button to open the full app; photos sit on the quote line they belong to, and Spencers / Downer jobs carry their own colour tag, KO reference and SLA clock everywhere they appear (list rows, filter chips, record header, scheduler blocks). B and C are kept for reference; B may return as a board toggle on the Quotes list, C's one-button cards become the default "Needs me" filter.

Original recommendation was Direction A for the job record with Direction C's "Today" inbox as the home screen. Every job becomes one quote-first record with a price, a status stepper, the quote description, photos and a live activity feed. Leads and acceptances email both Josh and Ashley. The scheduler gets truck rows, people as chips, and leave greyed out. The original nine statuses come back as a forward-only stepper. Menus hide everything that isn't the next step.

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

## Josh's default: the Quoting view

On open, Josh sees Quotes and Quote runs only. A Full app button at the bottom of the sidebar (third tab on the phone) reveals Schedule (trucks), Clients, Reports and the occasional pages. The preference is per user and per device. Quote runs is a week strip with Tuesday and Thursday opened up: ordered stops with time, meeting / access note, phone, and a Write quote button after the visit; a tray of leads waiting for a run and quotes still to write. Dragging a lead onto a run books it and moves the job to Visit booked. Trucks never appear in the Quoting view.

## Shared pieces

Job record: price, stepper, quote description, photos, activity beside it. Under "…": versions, copy to new quote, preview as client, client details, enquiry and site notes, work order and job pack, text the client, put on hold, mark declined. One quote per job with automatic versions after send. Copy to new quote creates a new job number linked to the source. Old jobs are recallable from the client page.

Scheduler: the Isuzu, the Nissan and the Navara are rows (the Navara carries the Avant or the stump grinder, dropped on it per day, with a warning if both are wanted); every staff member is a chip dropped on a truck for the week or a day; leave and sick days grey the person out; the tray holds only Accepted work and quote visits awaiting a run; dropping shows "Dan + Mike free, fits" before you let go.

Emails: one event, one line, one button, sent to Josh and office@ (Ashley); the list lives in `supabase/functions/_shared/notify.ts` and can be overridden with the `NOTIFY_EMAILS` secret. Instant for new lead, accepted, declined, client question. In-app only for opened, followed up, crew finished.

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


## Build status (7 Sep 2026)

Everything in the roadmap below is built on `main`, verified with the unit tests (49), the route smoke suite (208 routes across four roles and two tenants) and the click-every-control sweep (53 passed, 38 skipped by design). Screenshots of the built screens are in `build-screenshots/`.

- Database: migrations 042 (unified `job_activity` feed written by triggers on jobs, quotes, quote_events, comments, photos, schedule and alerts; quote versions snapshot on every edit after send; backfill), 043 (`resources` seeded with Josh, Isuzu, Nissan, Navara, Avant, Grinder; `schedule.equipment_ids`; `crew_assignments`; `availability`; `users.default_view`) and 044 (`add_job_note` rpc). They were numbered 038 to 040 until 8 September; they now sit after the mailing-list migrations 038 to 041 that production already has. Verified against a real Postgres 16 replay of all migrations. See `research/05-database-changes.md`.
- Notifications: Josh and office@ on every lead, acceptance, decline and question (`supabase/functions/_shared/notify.ts`).
- Job record: `JobDetailPanel` rewritten as the quote-first record with `StatusStepper`, `QuoteLines` (photos on their line, SOR chips, quotable pre-approval), `ActivityFeed` (live feed, reply to client, confirm portal notes, internal notes) and the … menu. Enquiry and site notes show inline only until the quote is sent.
- Quotes list: grouped by what needs you first, Needs me / Active / Waiting / Done chips, Spencers and Downer tags and filters, no row status dropdown.
- Quoting view: Josh's default, two tabs plus Full app; office defaults to the full app; per-device preference in `treeco:view`.
- Quote runs: week strip with Tuesday and Thursday runs, tray of visits to book and quotes to write, drag or "Book visit…" to book, reorder by distance, text clients, phone day view.
- Scheduler: rows from the `resources` table (Josh, Isuzu, Nissan, Navara), crew chips per truck-day writing `crew_assignments` and `schedule.assigned_to`, Avant and Grinder chips on the Navara, leave blocks from `availability`, tray limited to ready work and visits.
- Mailing list (8 Sep): the Campaigns feature that had only ever lived on Josh's Mac is merged back in. Campaigns sits in the Full app next to Marketing; the public unsubscribe page, the send, track, unsubscribe, webhook and scheduler functions, the Xero and Quotient contact importer, the lead-source question on new jobs and the Leads and conversions report on Reports all come with it. Its data was never touched, because it lives in the database, not the code. Setup and operating notes: `CAMPAIGNS-SETUP.md` at the repo root.
- Deploy: `supabase db push` then `supabase functions deploy notify-office inbound-lead book-quote`; the frontend deploys with the usual Vercel build. If the campaign functions were last deployed from the Mac, redeploy them too: `supabase functions deploy campaign-send campaign-scheduler campaign-track campaign-unsubscribe campaign-webhook import-marketing-contacts`.
- Not yet built: the optional Flow Board toggle on the Quotes list, and a dark-mode pass.

## Roadmap

1. Week 1: notifications and the feed. Recipients list; all lead and quote functions email it; write every event to `quote_events`; restore the ten statuses as the single list and delete the dead trimmed lists.
2. Weeks 2–3: the job record. Rewrite `JobDetailPanel.jsx`; one quote per job with auto-versions; migration for `quotes.job_id` unique and a version trigger.
3. Week 4: home and navigation. Today inbox from Actions + DashboardWorkload + DashboardFollowUps; Jobs list grouped by need; 3–4 item nav with More.
4. Weeks 5–6: scheduler. `resources` and `availability` tables; people chips; write `assigned_to`; leave blocks; merge Planner quote runs into the grid.
5. Week 7: board view, dark mode pass, e2e specs.

Quick wins needing no design decision: email both Josh and Ashley on every lead and acceptance; link Sent Quotes from Jobs; show the quote price and first line on the job row and drawer header; delete the ~600 lines of dead kanban and dashboard-table code.

## Decisions needed

1. Home screen: decided, Direction A.
2. Notifications: decided, Josh plus office@ (Ashley) on every lead, acceptance, decline and question. Implemented, awaiting deploy.
3. Scheduler rows: decided, Isuzu, Nissan, Navara (carrying the Avant or the grinder).
4. Status labels: original wording or the shorter stepper labels.
5. Keep Tuesday / Thursday as the default quote-run rows.
