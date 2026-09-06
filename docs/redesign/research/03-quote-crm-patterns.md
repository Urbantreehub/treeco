# Quote-first CRM patterns — Quotient and friends

## Quotient, in detail

- Statuses: Draft, Sent (shown as "Awaiting acceptance"), Viewed, Accepted, Declined (customer must give feedback), Expired (from the expiry date; edit-and-resend resets it). Working states: Editing ("take offline", customer cannot view or accept) and an optional Waiting status so the Active tab only holds things needing attention.
- All overrides in one menu, Actions → Change Status to: Sent – skip email, Editing – take offline, Accepted – on behalf, Sent – undo acceptance, Sent – undo expired, decline on behalf. Also under Actions: Copy to → New Quote / Template, Send Follow-up.
- Viewed tracking: unique link per recipient; an "Open" counts after 3 seconds on screen; repeat views within 30 minutes collapse; a live "Active" indicator shows a customer on the quote right now.
- Activity feed: sends, opens, questions, comments, acceptances, private notes, version creation. The Versions button appears only once versions exist.
- Q&A: customers ask questions on the quote; the author gets an email and a dashboard message that persists until answered or dismissed. Private notes visible to the team only.
- Versions: created automatically whenever a quote is taken offline to edit. "Highlights" diffs any version against now. Restore snapshots first. For a variation after acceptance Quotient recommends a new quote, not editing the accepted one.
- Follow-ups: dashboard flags unopened after 12 hours, first follow-up at 3 days, second at 14 days. Never sent automatically.
- Dashboard: recent quotes, questions and notifications in one glance; Active / Waiting / All tabs.
- Notifications: email on view (opt-in), on question, on acceptance.

Sources: quotientapp.com/help pages the-stages-of-a-quote, quote-actions, viewed-vs-open, quote-versions, ask-a-question-comments-and-private-notes, private-notes, following-up-quotes, dashboard-stats, edit-an-accepted-quote, templates-getting-started; quotientapp.com/blog posts introducing-waiting, quote-versions, our-biggest-little-update.

## Comparable tools

| Tool | Statuses | Versions | Quote → job | Expiry |
|---|---|---|---|---|
| Jobber | Draft → Awaiting Response → Changes Requested → Approved → Converted → Archived; no return to Draft after send | Edit in place; "Request changes" hides the quote from the client | Explicit Convert | Manual |
| Tradify | Sent, Accepted, Declined, Expired | "Revise" copies and cancels the original | Accept prompts Create Job | Due date |
| ServiceM8 | Job-level: Quote → Work Order → Completed / Unsuccessful | Versions and options inside one job | Same record | Follow-up automation |
| Xero Quotes | Draft, Sent, Accepted, Declined, Invoiced; no Expired state | Edit in place | Copy to invoice | Date only |
| PandaDoc | Draft, Sent, Viewed, Completed, Expired, Declined | Editing a sent doc creates a new version and resets signatures; audit trail | n/a | Auto |
| Proposify | Draft, Sent, Viewed, Unsigned, Won, Lost; per-section view time | Edit | n/a | Yes |
| HoneyBook / Dubsado | Project pipeline stages, kanban drag updates stage | — | Lead → Job on signature | — |

Every quote-first tool separates customer-driven states (Viewed, Accepted, Declined, Changes requested) from author-driven states (Draft, Editing, Waiting, Archived). The two job-management tools closest to tree work (Jobber, ServiceM8) both make the accepted quote flow straight into a job without re-keying.

## Recommended lifecycle for TreeCo (one quote per job)

Primary, ordered, drives the stepper: New Lead → Quote Visit Booked → Quote Sent (Opened ×N shown underneath) → Accepted → Scheduled → Stump Grinding → Done, To Invoice → Invoiced. Side states as badges, never steps: On Hold, Declined. Author-side modifiers: Editing (offline until re-sent).

Rules:
- Customer events move the status; the owner rarely does. Overrides under one "…" menu: accept on behalf, decline on behalf, undo acceptance, put on hold.
- Post-acceptance is the job phase of the same record (ServiceM8 model), no conversion.
- Versions: editing a sent quote auto-snapshots, takes it offline, returns to Sent on re-send with the expiry reset. Show the Versions control only from v2.
- Copy to new quote = new job number, linked back to the source. Used for variations and repeat work.
- Expiry is a real state with a one-step "edit and resend".
- The activity log is the source of truth for sent / viewed / accepted timestamps; the status column is derived.

## UI patterns to adopt

1. Status stepper in the header with "in this stage for N days" and off-ramp badges (Linear, HubSpot deal tracker).
2. Primary action computed from status: Draft → Send; Sent → Follow up; Accepted → Schedule; Scheduled → Mark done and invoice. Everything else in an overflow menu.
3. A "needs attention" home instead of a stats dashboard: questions to answer, follow up today, new leads, accepted to schedule, then recent activity (Quotient dashboard, Linear Triage with snooze, Things 3 Today).
4. List by default grouped by status, with stale highlighting after N days (Pipedrive "rotting"); board optional.
5. Quote page shows the quote first: client, address, total, stepper, primary action above the fold; line items next; activity beside; contact, terms and settings behind a disclosure (Attio record pages, NN/g progressive disclosure).
6. One activity timeline: vertical line, icon per event type, relative times, minor system events condensed, comments and questions full-width, older system events collapsed between comments (Linear, GitHub Primer, Intercom).
7. Client questions as persistent to-dos until answered.
8. Versions as a disclosure with a diff (Quotient, PandaDoc).
9. Copy to new quote and copy to template in the overflow menu, pre-linked to the source.
10. Follow-up nudges at configurable thresholds, never auto-sent.
11. Notification emails: one event, one line, one button. Subject like `Accepted · Richard Tait · 8 Miramar Rd · $2,415`. Instant for accepted, question, new lead, declined; "viewed" in-app or in a digest (Postmark subject guidance, Linear read-suppressed digest).

## Anti-patterns

Separate Lead / Quote / Job / Invoice objects that must be converted; free-choice status dropdowns; editing sent quotes with no snapshot; "Sent forever" with no expiry; auto-sending follow-ups; emailing every event; reports-first dashboards; kanban as the only view (WCAG 2.5.7 needs a non-drag alternative); multiple entry points to the same secondary action; deleting anything but drafts.

Further sources: help.getjobber.com 115009378727 and 115012715008; help.tradifyhq.com 23490604634777 and 20038896093209; support.servicem8.com 115005715963 and 360000470895; central.xero.com Mark-a-quote-as-accepted-or-declined; support.pandadoc.com 9714842, 9714684, 9714819; linear.app/docs/configuring-workflows and /docs/triage; linear.app/changelog/2025-04-03-collapsed-issue-history; primer.style/product/components/timeline; attio.com/help configure-record-pages; nngroup.com/articles/progressive-disclosure and contextual-menus-guidelines; postmarkapp.com/guides/transactional-email-best-practices; culturedcode.com/things/support/articles/4001304.
