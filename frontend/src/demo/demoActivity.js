// Demo rows for the job_activity table (the unified activity feed).
// Owned by the job-record work; keep ids stable so e2e specs can target them.
//
// Shape mirrors migration 038: { id, job_id, quote_id, kind, actor_type,
// actor_id, actor_name, body, meta, created_at }. Timestamps are computed
// relative to "now" so the feed always reads as live ("2h", "Tue", "12 Jul").
//
// Job ids match src/demo/mockData.js DEMO_JOBS: 1 Margaret Thompson (quote
// sent), 2 Richard Tait (scheduled), 4 Dave & Sue Wilson (to invoice),
// 5 Anna Ferreira (new lead), 6 Heritage Homes Trust (visit booked).

const HOUR = 3600000
const DAY = 86400000
const now = Date.now()
const ago = (days, hours = 0) => new Date(now - days * DAY - hours * HOUR).toISOString()

const JOSH = { actor_type: 'staff', actor_id: 'demo-josh', actor_name: 'Josh Micallef' }
const ASHLEY = { actor_type: 'staff', actor_id: 'demo-ashley', actor_name: 'Ashley Rapana' }
const SYSTEM = { actor_type: 'system', actor_id: null, actor_name: null }
const client = name => ({ actor_type: 'client', actor_id: null, actor_name: name })

export const DEMO_ACTIVITY = [
  // ── Job 1 · Margaret Thompson · 14 Hillcrest Ave · quote sent ─────────────
  { id: 'act-1-01', job_id: '1', quote_id: null, kind: 'lead', ...SYSTEM, body: null,
    meta: { source: 'website form' }, created_at: ago(14, 3) },
  { id: 'act-1-02', job_id: '1', quote_id: null, kind: 'visit_booked', ...ASHLEY, body: null,
    meta: { run: 'Tue quote run', date: ago(9) }, created_at: ago(13, 1) },
  { id: 'act-1-03', job_id: '1', quote_id: 'q1', kind: 'photo', ...JOSH, body: null,
    meta: { count: 4, phase: 'before', note: 'Site visit' }, created_at: ago(9, -2) },
  { id: 'act-1-04', job_id: '1', quote_id: 'q1', kind: 'edited', ...JOSH, body: null,
    meta: { from_version: 1, to_version: 2, summary: 'added stump grind option' }, created_at: ago(6, 4) },
  { id: 'act-1-05', job_id: '1', quote_id: 'q1', kind: 'sent', ...JOSH, body: null,
    meta: { version: 2, total: 3220, subject: 'Your quote from Urban Tree Services — $3,220', channel: 'email' }, created_at: ago(6, 3) },
  { id: 'act-1-06', job_id: '1', quote_id: 'q1', kind: 'opened', ...client('Margaret Thompson'), body: null,
    meta: { count: 1 }, created_at: ago(5, 20) },
  { id: 'act-1-07', job_id: '1', quote_id: 'q1', kind: 'opened', ...client('Margaret Thompson'), body: null,
    meta: { count: 2 }, created_at: ago(4, 1) },
  { id: 'act-1-08', job_id: '1', quote_id: 'q1', kind: 'followed_up', ...JOSH, body: null,
    meta: { channel: 'email', count: 1 }, created_at: ago(2, 5) },
  { id: 'act-1-09', job_id: '1', quote_id: 'q1', kind: 'comment', ...client('Margaret Thompson'),
    body: 'Could this happen before the 25th? We have family staying.',
    meta: { comment_id: 'demo-cm-1' }, created_at: ago(0, 2) },

  // ── Job 2 · Richard Tait · 8 Miramar Rd · scheduled ────────────────────────
  { id: 'act-2-01', job_id: '2', quote_id: null, kind: 'lead', ...SYSTEM, body: null,
    meta: { source: 'phone' }, created_at: ago(21) },
  { id: 'act-2-02', job_id: '2', quote_id: 'q2', kind: 'sent', ...JOSH, body: null,
    meta: { version: 1, total: 747.5, channel: 'email' }, created_at: ago(18, 2) },
  { id: 'act-2-03', job_id: '2', quote_id: 'q2', kind: 'opened', ...client('Richard Tait'), body: null,
    meta: { count: 1 }, created_at: ago(18) },
  { id: 'act-2-04', job_id: '2', quote_id: 'q2', kind: 'accepted', ...client('Richard Tait'), body: null,
    meta: { signed_name: 'Richard Tait', total: 747.5 }, created_at: ago(15, 6) },
  { id: 'act-2-05', job_id: '2', quote_id: null, kind: 'scheduled', ...ASHLEY, body: null,
    meta: { resource: 'Isuzu', date: ago(-1) }, created_at: ago(12, 1) },
  { id: 'act-2-06', job_id: '2', quote_id: null, kind: 'note', ...ASHLEY,
    body: 'Client asked us to text 30 min before arrival — gate code 4471.',
    meta: {}, created_at: ago(3, 2) },

  // ── Job 4 · Dave & Sue Wilson · 3 Karori Rd · done, to invoice ────────────
  { id: 'act-4-01', job_id: '4', quote_id: 'q4', kind: 'accepted', ...client('Dave Wilson'), body: null,
    meta: { signed_name: 'Dave Wilson', total: 1104 }, created_at: ago(20) },
  { id: 'act-4-02', job_id: '4', quote_id: null, kind: 'scheduled', ...ASHLEY, body: null,
    meta: { resource: 'Navara', date: ago(8) }, created_at: ago(16, 3) },
  { id: 'act-4-03', job_id: '4', quote_id: null, kind: 'photo', ...{ actor_type: 'staff', actor_id: 'demo-stu', actor_name: 'Stuart Wilson' }, body: null,
    meta: { count: 6, phase: 'after' }, created_at: ago(8, -6) },
  { id: 'act-4-04', job_id: '4', quote_id: null, kind: 'status', ...{ actor_type: 'staff', actor_id: 'demo-stu', actor_name: 'Stuart Wilson' }, body: null,
    meta: { from: 'scheduled', to: 'complete_to_invoice', source: 'work order' }, created_at: ago(8, -7) },

  // ── Job 5 · Anna Ferreira · 22 Brooklyn Rd · new lead ──────────────────────
  { id: 'act-5-01', job_id: '5', quote_id: null, kind: 'lead', ...SYSTEM, body: 'Kowhai overhanging the drive, would like it tidied and the dead wood out. Mornings best.',
    meta: { source: 'website form' }, created_at: ago(1, 4) },

  // ── Job 6 · Heritage Homes Trust · 101 Mt Victoria Blvd · visit booked ─────
  { id: 'act-6-01', job_id: '6', quote_id: null, kind: 'lead', ...SYSTEM, body: null,
    meta: { source: 'email' }, created_at: ago(5, 2) },
  { id: 'act-6-02', job_id: '6', quote_id: null, kind: 'visit_booked', ...ASHLEY, body: null,
    meta: { run: 'Thu quote run', date: ago(-2) }, created_at: ago(4, 1) },
  { id: 'act-6-03', job_id: '6', quote_id: null, kind: 'note', ...JOSH,
    body: 'Council permit needed for the Rimu — trust has the arborist report from 2024, ask for a copy at the visit.',
    meta: {}, created_at: ago(2, 6) },
]
