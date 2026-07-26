// Copy for the staff-facing one-tap "Notify client" texts on the job panel.
// These pre-fill the SMS composer so staff can review/tweak (e.g. the ETA or
// delay minutes) before sending. Kept in sync with the automated-trigger copy
// in supabase/functions/_shared/notify.ts.

const COMPANY = 'Urban Tree Services'

export function firstName(name) {
  return String(name ?? 'there').trim().split(/\s+/)[0] || 'there'
}

// Each entry: { key, label, kind, build(first, ctx) }
// `kind` is logged on sms_messages so sends are categorised.
// The numbers in "on the way" / "running late" are sensible defaults the sender
// edits in the composer before sending.
export const STAGE_TEXTS = [
  {
    key: 'confirmed',
    label: 'Confirm booking',
    kind: 'job_confirmed',
    build: (first, ctx) =>
      `Hi ${first}, your tree job with ${COMPANY} is confirmed for ${ctx?.date || '[date]'}. Any questions, just reply to this text.`,
  },
  {
    key: 'on_way',
    label: 'On the way',
    kind: 'crew_departed',
    build: (first) =>
      `Hi ${first}, our ${COMPANY} crew is on the way — ETA approximately 30 minutes.`,
  },
  {
    key: 'arrived',
    label: 'Arrived',
    kind: 'crew_arrived',
    build: (first) =>
      `Hi ${first}, our ${COMPANY} crew has arrived at your property.`,
  },
  {
    key: 'late',
    label: 'Running late',
    kind: 'job_running_late',
    build: (first) =>
      `Hi ${first}, our ${COMPANY} crew is running approximately 15 minutes behind. Thanks for your patience.`,
  },
  {
    key: 'complete',
    label: 'All done',
    kind: 'job_complete',
    build: (first) =>
      `Hi ${first}, all done! Thanks for choosing ${COMPANY}. We'll send your invoice through shortly.`,
  },
]
