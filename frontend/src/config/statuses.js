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
  if (job.ko_reference) return true
  const title = job.title ?? ''
  const client = job.clients?.name ?? ''
  return title.startsWith('SP —') || /spencer|downer/i.test(title) || /spencer|downer/i.test(client)
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

export function getStatus(key) {
  return JOB_STATUSES[key] ?? null
}

export function getStatusColor(key) {
  return JOB_STATUSES[key]?.color ?? '#7C93A8'
}

export function getStatusLabel(key) {
  return JOB_STATUSES[key]?.label ?? key
}
