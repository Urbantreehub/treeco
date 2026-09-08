# Database changes for the redesign

Three migrations in `supabase/migrations/`. `supabase/schema.sql` stays the week-1 baseline; migrations are the source of truth.

## 042_job_activity.sql — one activity feed per job

Table `job_activity(id, job_id, quote_id, kind, actor_type, actor_id, actor_name, body, meta, created_at)`, index on `(job_id, created_at desc)`, added to the `supabase_realtime` publication.

RLS: full/office read all and insert; truck/restricted read rows for jobs they are scheduled on (`auth.uid() = any(schedule.assigned_to)` **or** `schedule.resource_id = users.resource_id`, via `job_activity_visible(job_id)`); anon nothing.

Rows are written by `SECURITY DEFINER` AFTER triggers. Every trigger body is wrapped in an exception handler that downgrades to a `WARNING`, so the feed can never block a write.

| Trigger | Table | Produces |
|---|---|---|
| `trg_job_activity_job` | jobs insert / update of status | `lead`, `status`, `visit_booked`, `invoiced` |
| `trg_zz_job_activity_quote` | quotes update | `sent`, `followed_up`, `accepted`, `declined`, `edited` |
| `trg_quote_version` (re-created) | quotes update | version snapshot, now also on edit |
| `trg_job_activity_quote_event` | quote_events insert (`opened` only) | `opened` |
| `trg_job_activity_quote_comment` | quote_comments insert | `comment` (client), `reply` (staff, not internal), `note` (internal) |
| `trg_job_activity_job_photo` | job_photos insert | `photo` |
| `trg_job_activity_schedule` | schedule insert / delete / update of date, resource_id | `scheduled`, `unscheduled`, `scheduled` with `moved: true` |
| `trg_job_activity_job_alert` | job_alerts insert | `portal` (kind like `portal%`), `alert` (others) |

`actor_type` is `staff` when `auth.uid()` resolves to a `users` row (falling back to `quotes.updated_by` / `job_photos.uploaded_by`), `client` for opens/accept/decline/comment, `portal` for portal alerts, otherwise `system`.

### Kinds and `meta` shapes

All `meta` keys are optional (nulls are stripped). Backfilled rows carry `backfilled: true`.

| kind | actor_type | body | meta |
|---|---|---|---|
| `lead` | staff / system | — | `lead_source`, `category`, `status` |
| `visit_booked` | staff | — | `meeting_status` |
| `sent` | staff | — | `total`, `version_no`, `quote_number`, `channel` (`email` \| `sms`) |
| `opened` | client (`actor_name` = client) | — | `quote_event_id`, plus whatever `quote_events.meta` held; backfilled first-open rows have `first_open: true` |
| `followed_up` | staff / system | — | `count`, `channel` |
| `edited` | staff | — | `from_total`, `to_total`, `version_no`, `quote_number` |
| `accepted` | client (`actor_name` = signed name, else client) | — | `total`, `signed_name`, `quote_number`, `selected_optional: [{id, description}]` |
| `declined` | client | decline reason | `total`, `quote_number` |
| `comment` | client | comment text | `comment_id`, `attachments` (array of URLs, if any) |
| `reply` | staff | reply text | `comment_id`, `attachments` |
| `note` | staff | note text | `comment_id` (when it came from an internal quote_comment) |
| `photo` | staff / system | caption | `photo_id`, `url`, `phase`, `line_ref`, `kind` |
| `status` | staff / system | — | `from`, `to` |
| `scheduled` | staff / system | — | `schedule_id`, `date`, `start_time`, `end_time`, `resource_id`, `assigned_to`; when moved also `moved: true`, `from_date`, `from_resource_id` |
| `unscheduled` | staff / system | — | same shape as `scheduled` (the removed block) |
| `invoiced` | staff / system | — | `xero_invoice_number` |
| `portal` | portal (`actor_name` = alert source) | alert detail | `alert_id`, `kind`, `title`, `suggested_status`, `source` |
| `alert` | system | alert detail / title | same as `portal` |

Deliberate de-duplication: `job_alerts` of kind `acceptance`, `comment`, `new_lead`, `to_invoice` are **not** mirrored as `alert` rows, because the quote/comment/status change that raised them already produced its own feed row. One client acceptance therefore yields `accepted` (from quotes) plus `status` `quote_sent → accepted_to_schedule` (from jobs) — the UI can collapse those.

### Quote versions

`quote_version_on_change` now also snapshots when `line_items`, `subtotal`, `gst`, `total` or `notes` change while the quote stays `sent`/`viewed`: reason `edited` (and, if it is the quote's first version, a `sent` snapshot of the pre-edit state first so history starts from what the client saw). `quote_versions.reason` has no check constraint, so nothing to alter. The accepted/complete/invoiced lock is unchanged.

### Backfill

Runs once, only when `job_activity` is empty: `lead` per job, `sent` from `sent_at`, `opened` from `quote_events` (or from `viewed_at` when a quote has no events), `accepted`/`declined` from `responded_at`, comments, photos and schedule rows, all at their original timestamps.

## 043_resources_availability.sql — lanes, crews, leave

- `resources(id text pk, name, kind truck|equipment|person, color, sort, active, note)`, seeded with `josh`, `isuzu`, `nissan`, `navara`, `avant`, `grinder`. Read by every signed-in user; written by full access.
- `schedule.equipment_ids text[] default '{}'`. Data fix: `resource_id = 'stump'` → `navara` + `['grinder']` (on `schedule` and `users`).
- `crew_assignments(resource_id → resources, date, user_id → users, created_by, created_at, unique(resource_id, date, user_id))`. full/office write, truck/restricted read.
- `availability(user_id → users, date, kind leave|sick|part_day|other, note, created_by, created_at, unique(user_id, date))`. full/office write, everyone reads their own rows.
- `users.default_view text check in ('quoting','full')`, null = app decides.

`schedule.resource_id` deliberately has no FK to `resources` (`unassigned` is a valid lane in the UI).

## 044_activity_helpers.sql — `add_job_note`

`add_job_note(p_job_id uuid, p_body text, p_kind text default 'note') → jsonb` (`SECURITY DEFINER`, granted to `authenticated`).

- Validates `p_kind in ('note','reply')` and non-empty body; stamps `actor_id`/`actor_name` from `auth.uid()` and `users.name`.
- Permission: same rule as the read policy (`job_activity_visible`), so truck logins can leave a note on a job they are on. `reply` is office/full only.
- `reply` is inserted as a staff `quote_comments` row on the job's latest-sent quote so the client sees it on `/q/:token`; the 038 trigger mirrors it into the feed. A `reply` on a job with no quote falls back to a plain feed row.
- Returns `{ok: true, activity: <job_activity row>}` or `{ok: false, error: not_signed_in | invalid_kind | empty | not_found | no_profile | forbidden}`.

`respond_to_quote` (023) already writes `signed_name`, `decline_reason` and `status` in one UPDATE, so no change. `notify-office` needs no change either: it still emails and upserts `job_alerts`; the accept/decline/comment feed rows come from the triggers.

## Deploy order

```
supabase db push
supabase functions deploy notify-office inbound-lead book-quote
```

Nothing in the edge functions changed for this work; the redeploy is to pick up any parallel frontend-driven changes to them. If 038 is applied to a database that already has feed rows, the backfill is skipped automatically.
