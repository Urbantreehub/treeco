# Field-service scheduling apps — usability research

Lens: a Wellington tree-services business with ~8 staff, two trucks, an owner and an office admin on Mac/iPad, crews on iPhone/iPad. Ratings are mid-2026 figures from Capterra, G2 and the App Store. Vendor sites were read through search summaries and help-centre pages; URLs are listed at the end.

## Comparison

| App | Ease of use | Quote ↔ job model | Schedule board | Availability / leave | Main complaints |
|---|---|---|---|---|---|
| ServiceM8 | Capterra 4.3 | One record; "Quote" is a job status (Quote → Work Order → Completed / Unsuccessful); versions inside the job; accept flips status and writes a Job Diary note | Dispatch board: job list + staff strip + map; drag onto a staff name to dispatch; "Unscheduled" list you are told to keep clear | Staff GPS status; no first-class leave | Dispatch board rendering bugs; iOS only |
| Jobber | 4.5 | Separate quote → "Convert to job"; quote statuses Draft → Awaiting Response → Changes Requested → Approved → Converted | New schedule (Oct 2025): column or row per team member, Unassigned lane, map docked beside the calendar, unscheduled panel on the right | Conflicting names turn red; free slots white; leave faked with a Task | "Too clicky" after updates; per-seat price |
| Housecall Pro | 4.6 | Estimate → copy to job; kanban pipeline (Unscheduled → Scheduled → In Progress → Completed → Invoice Sent → Paid); dragging into a column demands the required info | Colour per tech; dispatch map | Time-off Events block booking | Desktop UI weak; workflow-breaking updates |
| Tradify (NZ) | 4.7 | Enquiry → Quote → Job; quote page shows sent / delivered / viewed | Horizontal timeline, one row per staff member; unassigned bar on the left | Leave and public holidays on the scheduler | Busy past ~6 staff |
| Fergus (NZ) | 4.3 | Quote inside the job; draft / duplicate / publish versions | Status board: Pricing → Scheduling → Back Costing → Invoicing → Payments with $ per column; calendar with unassigned row | Annual leave events; conflict highlighting | Learning curve |
| simPRO | 3.7 | Quote → Job with cost centres | Employees, contractors, plant (trucks) and teams as resources | Resource-based | Far too many clicks; months of setup |
| Workiz | 4.4 | Estimate → job ("Won") | Colour by tech | — | Mobile lag |
| ArboStar | 4.6 | Lead → Estimate (portal, e-sign) → Work Order; per-tree inventory | Crew schedule with equipment conflicts; separate estimator schedule; map overlay | Crew and equipment availability | Overwhelming dashboard; many clicks |
| SingleOps | 4.3 | Proposal (options) → Active jobs → Visits | Drag unscheduled visits onto crew/time; route planner | — | 4–6 week setup; lag |
| Arborgold | 4.0 | Proposal → Work Order → Invoice; estimated vs scheduled crew | Route by crew | — | Multiple clicks for everything |
| Skedulo / Connecteam | — | n/a | Swimlanes per resource; unallocated list | Unavailability as grey blocks; staff submit availability from phone | Enterprise |

## Ten recurring patterns

1. One row (or column) per resource with an Unassigned lane inside the grid.
2. A persistent unscheduled tray you drag from, holding only work that is ready.
3. Drop on a name = dispatch; drop on a time = booked. Both offered.
4. Colour keyed to one dimension only (person or status), never both.
5. Completed work greyed or ticked, not hidden.
6. Conflict feedback at assignment time: red names, white free slots, grey unavailability.
7. Client-facing quote page with a visible view / accept / request-changes trail.
8. One chronological feed per job mixing system events and human notes (ServiceM8 Job Diary, Jobber Activity Feed).
9. A small, fixed, forward-only status set in the simplest, best-rated tools.
10. Map docked beside the schedule rather than on its own tab.

## What drives churn

Click depth (simPRO, Arborgold, ArboStar, Jobber after updates), dashboard overload, schedules that become unreadable past six staff, unstable mobile apps, updates that break muscle memory, per-seat price creep, and platform lock.

## Worth copying for TreeCo

- ServiceM8's single-object model: the job's status carries the quote lifecycle; acceptance flips it and logs to the diary.
- Jobber's one-way transitions (no going back to Draft once sent) and its admin-only push for new request / quote viewed / quote approved.
- Tradify's sent → delivered → viewed strip directly on the quote.
- Housecall Pro's "drag into a lane opens a required-action dialog".
- Fergus's dollar total per pipeline column.
- Skedulo's grey unavailability blocks, applied to crew (truck) rows with member avatars: none of the small-business tools model leave properly, which is the gap TreeCo can fill.
- The ArboStar user request nobody has shipped: on acceptance, immediately offer "schedule the crew".

## 2025–2026 redesign trend

Jobber (rebuilt schedule, docked map, refreshed job page), ServiceM8 13/14 (enhanced job card with side-by-side Diary / Photos mini-tabs), Housecall Pro Spring 2026 (tabbed job pages instead of long scroll, persistent action toolbar), Skedulo Pulse (one screen with collapsible panels). Common thread: fewer pages, more panels; tabs instead of scroll; a persistent primary action; an inbox-first lead flow feeding a very short status ladder.

## Sources

Jobber help: help.getjobber.com articles 36603691932951, 29840886387351, 33641405662359, 115009378727, 115012715008, 115009379027, 360037055533, 115010680868. ServiceM8: support.servicem8.com articles 200272704, 115005715963, 360000470895, 11692780493839, 115000282726; servicem8.com/september-2024-update and september-2025-update. Housecall Pro: help.housecallpro.com articles 6367496, 6185346, 6185127, 918072, 13975339, 9270072. Tradify: help.tradifyhq.com articles 360014393493, 9983783294873, 24422157056921, 360015471513. Fergus: help.fergus.com articles 1895377, 9971901, 1360417, 10518804. ArboStar: help.arbostar.com/en/article/92-dashboard, capterra.com/p/198069. SingleOps: docs.singleops.com articles 43339819475995, 4403230705815. Arborgold: help.arborgold.com article 4511419. Skedulo: support.skedulo.com articles 360001270435, 360001271636. Ratings: capterra.com, g2.com, contractortoolstack.com, fieldserviceguide.com, checkthat.ai. Apple Calendar and Fantastical drag conventions: support.apple.com/guide/ipad/ipadafeefacf, flexibits.com/fantastical-ios/help/calendar-views, macstories.net.
