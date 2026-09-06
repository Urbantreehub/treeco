# TreeCo — current-state audit (September 2026)

Factual map of the app as it is on `main`, gathered from the code and from running the demo build at desktop, iPad and iPhone sizes. Line numbers refer to HEAD at the time of the audit.

## Navigation

- Routes: `frontend/src/App.jsx`. Guards: `RequireAuth`, `RequireFullAccess` (full), `RequireStaff` (full or office), `RequireSchedule` (full, office or truck).
- Landing per role (`homePath`, App.jsx:53): full → `/dashboard`, office → `/pipeline`, truck → `/calendar`, crew → `/safety`.
- Nav arrays in `frontend/src/components/Layout.jsx`: `FULL_NAV` has 11 items (Dashboard, Jobs, Actions, Calendar, Planner, Mulch, Tools, Safety, Chat, Marketing, Team); `OFFICE_NAV` 10; `TRUCK_NAV` 3 (Calendar, Safety, Chat); `CREW_NAV` 3 (Safety, Chat, My Docs); `MORE_NAV` holds Clients.
- Mobile bottom bar caps at 5 slots; items beyond the first four collapse into a "More" sheet. For a full-access user only Dashboard, Jobs, Actions and Calendar are visible tabs.
- Not linked from any nav: `/sent-quotes` (the best quote-tracking screen), `/quotes/:id`, `/workorder/:jobId`, `/jobpack/:jobId`.

## Statuses

- `frontend/src/config/statuses.js` defines 10 statuses (the original 9 plus `declined`): new_lead, quote_scheduled, quote_sent, accepted_to_schedule, scheduled, stump_grinding, complete_to_invoice, invoiced, on_hold, declined.
- `STATUS_ORDER` was cut from 10 to 7 on 4 Jul (commit 1c1a64b) removing quote_scheduled, accepted_to_schedule, stump_grinding. `MANUAL_STATUSES` (4 items) was added 6 Aug (a201ca2).
- Both narrowings were reverted the same day at the owner's request (c1cd980, af95697): the pipeline and drawer dropdowns now list all 10. `STATUS_ORDER` and `manualStatusOptions` are imported but unused in `Pipeline.jsx` and `JobDetailPanel.jsx`.
- `JobDetailPanel.FORWARD_ACTIONS` (lines 19–30) shows a third, contextual set of status buttons beside the full dropdown.
- Quote lifecycle is separate: `frontend/src/utils/quoteStatus.js` (draft, sent, viewed shown as "Opened", accepted, declined, complete, invoiced, expired derived). `followUpBucket()` implements Quotient's 12h / 3d / 14d cadence.
- DB enum drift: `supabase/schema.sql` `job_status` lacks `declined` (added in migration 015).

## Data model (key points)

- `users.access_level` ∈ full, office, truck, restricted. `users.resource_id` (text) is the only link from a person to a calendar lane.
- `jobs` carries `status`, `category` (residential / spencers / downer), `ko_reference`, `sla_due_at`, `priority`, `meeting_status`, plus `directions`, `work_specs`, `enquiry_raw`, `lead_source` (written by lead intake, never displayed).
- `quotes.job_id` is a plain FK: many quotes per job. `bestQuote()` heuristics are redefined in `Pipeline.jsx:17`, `Calendar.jsx:31`, `dayrun/QuoteSheet.jsx:24` and inline in `JobDetailPanel.jsx:214`. `quote_number` is read in three places but exists in no migration.
- `quote_versions` (migration 020) snapshots only when a quote becomes accepted or leaves a locked status; edits between sends create no version.
- `quote_events` (029) is written from exactly one place: `register_quote_open` inserts `kind='opened'`. Sent, followed up, accepted, declined, edited and created are never written.
- `quote_comments` (022, attachments 028): client and staff thread, internal flag.
- `schedule` has `resource_id` (lane) and `assigned_to UUID[]`. The frontend never writes `assigned_to` (only `Planner.jsx:358` writes `[]`). Truck and crew RLS policies keyed on `assigned_to` therefore match nothing; the truck day run works because `DayRunView.jsx:110` filters by `resource_id`.
- Calendar resources are hard-coded in `Calendar.jsx:82–88` (josh, isuzu, nissan, stump, unassigned), re-declared with different labels in `Dashboard.jsx:62` and `Settings.jsx:21`. One person is mixed with three vehicles. No trucks table, no availability or leave concept anywhere.
- `job_alerts` (032, 034, 035) is the office to-do list surfaced on `/actions`. Kinds: portal_note, portal_approval, portal_status, comment, acceptance, new_lead, to_invoice, unsent_quote, not_pushed, downer_mfa.
- `app_settings` (018) key/value store currently holds only the two portal sync flags.
- SWMS, SOPs, H&S documents, Staff Hub and the training register are stored in `localStorage` only.

## Job detail panel (`JobDetailPanel.jsx`, 876 lines)

Order on screen: KO SLA banner (portal jobs) → title (address) and client → status badge with a transparent `<select>` of all statuses → `FORWARD_ACTIONS` buttons → quote follow-up block (only in quote_sent) → address, job type, phone pill, email, notes → `QuoteReference` (enquiry photos and description, only in new_lead / quote_scheduled / quote_sent) → one "Open quote" button per quote showing `$X incl GST` and the raw DB status string → Xero push / portal staging → Work Order and Job Pack links → portal panels → Text the client → Job Forms (SSSP, completion in localStorage).

The quote's description and line items are never shown. Crew Before / During / After photos are never shown to the office here.

## Quotes

- `QuoteBuilder.jsx` (2,197 lines): four accordion stages (Items, Crew pack, Terms, Review & send). `QuoteActivity`, `QuoteVersionHistory` and `QuoteComments` render only inside stage 4 (lines 1888–1894), collapsed by default.
- `QuoteActivity.jsx` is read-only; rows are derived from `sent_at`, `opened_count`, `followup_count`, `responded_at`, with real `quote_events` rows only for opens.
- `QuoteView.jsx` (public `/q/:token`): registers opens, accept requires T&Cs tick and typed signature, decline captures a reason, client Q&A via `QuoteClientComments`.
- `SentQuotes.jsx`: Quotient-style list with Sent / Opened / Accepted / Declined / Needs follow-up counters and inline follow-up buttons. Unlinked.

## Notifications (all recipients hard-coded)

| Trigger | Function | Recipients |
|---|---|---|
| New lead by email | `inbound-lead` | office@ only |
| New lead by website form | `book-quote` | josh@ only |
| Quote accepted | `notify-office` | office@, plus josh@ if residential |
| Quote declined | `notify-office` | office@ only |
| Client comment | `notify-office` | office@, plus josh@ if residential |
| Tool request | `notify-request` | josh@ |

Ashley appears only in comments and seed data; there is no address for her anywhere in code.

## Scheduling

- `Calendar.jsx` (1,821 lines): FullCalendar resource timeline (desktop), custom week grid, list week (mobile), day-run mode for trucks. Drag from tray inserts a `schedule` row with `resource_id` and auto-advances status (new_lead → quote_scheduled, else → scheduled). Tray lists seven statuses by default.
- `Planner.jsx` (734 lines): quote runs (clusters leads by proximity, defaults to next Tue/Thu, requires a meeting / not-meeting choice per stop) and work schedule tab.
- `dayrun/DayRunView.jsx`: the truck iPad's day sheet, filtered by the truck login's `resource_id`.

## Dashboard and Actions

- `Dashboard.jsx` (full access only): `DashboardWorkload` (new leads by category, newest six alerts), revenue tiles, safety actions, `DashboardFollowUps`, revenue trend.
- `Actions.jsx`: open `job_alerts` with Confirm → suggested status, Mark done, Dismiss, Open job.
- `DashboardQuotesTable.jsx`, `PipelineColumn.jsx`, `StatusGroup.jsx`, `JobCard.jsx` (~610 lines) are dead code from the earlier kanban.

## Largest files

QuoteBuilder 2,197 · Calendar 1,821 · Settings 1,058 · QuoteView 1,042 · SOP 1,014 · RiskAssessment 916 · WorkOrder 908 · JobDetailPanel 876 · StaffHub 851 · SWMS 816 · Planner 734 · Dashboard 704 · Clients 662 · Marketing 626 · Layout 585. Total frontend: 27,339 lines.
