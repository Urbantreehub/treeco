// Single source of truth for all 9 job statuses.
// Used identically in the pipeline board, calendar event colours, and job detail badges.
// Never hardcode a status colour anywhere else — always import from here.

export const JOB_STATUSES = {
  new_lead: {
    key: 'new_lead',
    label: 'New Lead',
    color: '#7C93A8',
    description: 'Enquiry received, not yet actioned',
  },
  quote_scheduled: {
    key: 'quote_scheduled',
    label: 'Quote Scheduled',
    color: '#4A7FA5',
    description: 'Site visit booked to quote',
  },
  quote_sent: {
    key: 'quote_sent',
    label: 'Quote Sent',
    color: '#D4851A',
    description: 'Quote sent, awaiting client response',
  },
  accepted_to_schedule: {
    key: 'accepted_to_schedule',
    label: 'Accepted — To Be Scheduled',
    color: '#3A8A82',
    description: 'Client accepted, needs a calendar slot',
  },
  scheduled: {
    key: 'scheduled',
    label: 'Scheduled',
    color: '#4A6741',
    description: 'Has a confirmed date/crew on the calendar',
  },
  stump_grinding: {
    key: 'stump_grinding',
    label: 'Stump Grinding',
    color: '#8B6238',
    description: 'Main job done, stump grind outstanding',
  },
  complete_to_invoice: {
    key: 'complete_to_invoice',
    label: 'Complete — To Be Invoiced',
    color: '#7FA650',
    description: 'Work finished, invoice not yet raised',
  },
  invoiced: {
    key: 'invoiced',
    label: 'Invoiced',
    color: '#2F5233',
    description: 'Invoice sent, awaiting payment',
  },
  on_hold: {
    key: 'on_hold',
    label: 'On Hold',
    color: '#A85C5C',
    description: 'Paused — client delay, weather, access issue etc.',
  },
  declined: {
    key: 'declined',
    label: 'Declined',
    color: '#8C4A4A',
    description: 'Client declined the quote',
  },
}

// Spencer Henshaw (DBS / Kāinga Ora) jobs get their own accent colour so they
// stand out from regular work at a glance — a deep violet, distinct from every
// status and job-type colour. Detection: DBS jobs carry a ko_reference, an
// "SP —" title prefix, or "spencer" in the title/client name.
export const SPENCERS_COLOR = '#6D4AA8'

export function isSpencersJob(job) {
  if (!job) return false
  if (job.category === 'spencers' || job.category === 'downer') return true
  if (job.ko_reference) return true
  const title = job.title ?? ''
  const client = job.clients?.name ?? ''
  return title.startsWith('SP —') || /spencer|downer/i.test(title) || /spencer|downer/i.test(client)
}

// Job category (template): 'residential' | 'spencers' | 'downer'. Stored on the
// job; falls back to detection for legacy rows created before the category field.
export function jobCategory(job) {
  if (job?.category) return job.category
  if (job?.ko_reference || /downer/i.test(job?.title ?? '') || /downer/i.test(job?.clients?.name ?? '')) {
    return /downer/i.test(job?.title ?? '') || /downer/i.test(job?.clients?.name ?? '') ? 'downer' : 'spencers'
  }
  if (isSpencersJob(job)) return 'spencers'
  return 'residential'
}

// Per-category accent colour + display label. Each job pill is tagged with the
// kind of work it is (private residential vs the two commercial portals) so it's
// obvious at a glance. Colours are distinct from each other and from every
// status colour. Spencers keeps its established violet (SPENCERS_COLOR).
export const JOB_CATEGORIES = {
  residential: { key: 'residential', label: 'Private',  color: '#4A6741' },
  spencers:    { key: 'spencers',    label: 'Spencers', color: SPENCERS_COLOR },
  downer:      { key: 'downer',      label: 'Downer',   color: '#C77D1A' },
}

// Category accent/label for a job (falls back to Private for anything unknown).
export function categoryMeta(job) {
  return JOB_CATEGORIES[jobCategory(job)] ?? JOB_CATEGORIES.residential
}

// Ordered list for pipeline column rendering.
// quote_scheduled, accepted_to_schedule, stump_grinding removed — these were
// transitional micro-states that added columns without adding clarity.
// Jobs still in those statuses in the DB remain visible via their detail panel.
export const STATUS_ORDER = [
  'new_lead',
  'quote_sent',
  'scheduled',
  'complete_to_invoice',
  'invoiced',
  'on_hold',
  'declined',
]

// Quote-reference material (raw enquiry photos + site notes) is only relevant
// while the job is still a lead or in the quoting phase. Once the client accepts
// and the job moves on to scheduling/invoicing, the quote itself supersedes the
// reference, so it's hidden to keep the view uncluttered.
export const QUOTE_REFERENCE_STATUSES = ['new_lead', 'quote_scheduled', 'quote_sent']

export function showsQuoteReference(status) {
  return QUOTE_REFERENCE_STATUSES.includes(status)
}

// ── Manual pipeline moves (F2) ──────────────────────────────────────────────
// Everything else is set by events, not menus: quote_scheduled when a run is
// booked, quote_sent when the quote goes out (QuoteBuilder auto-advances),
// accepted_to_schedule on client acceptance, invoiced when the invoice is
// raised. stump_grinding is a crew close-out flag set from the Work Order (F3),
// not an office menu choice — so the office menu offers only the decisions a
// human actually makes.
export const MANUAL_STATUSES = ['scheduled', 'on_hold', 'declined', 'complete_to_invoice']

export function manualStatusOptions(current) {
  const opts = MANUAL_STATUSES.filter(k => k !== current)
  if (current === 'complete_to_invoice') opts.push('invoiced')
  return opts
}

export function getStatus(key) {
  return JOB_STATUSES[key] ?? null
}

export function getStatusColor(key) {
  return JOB_STATUSES[key]?.color ?? '#7C93A8'
}

export function getStatusLabel(key) {
  return JOB_STATUSES[key]?.label ?? key
}
