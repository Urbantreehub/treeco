// Shared helpers for how a job presents on cards and in the detail view.
// Spencers/Downer (DBS portal) jobs lead with the site address, carry a KO
// job-type code (GNL, VSC, …) and a KPI completion clock.

import { isSpencersJob } from '../config/statuses'

// KO job-type / priority code (GNL, VSC, URG, URS, EPS, RSC, RM, PM). There's no
// dedicated column — the scraper writes it as a "[CODE]" title prefix or a
// "Priority: CODE" tag in the description.
export function koCode(job) {
  // Manually-created portal jobs store the code in the priority column; the
  // scraper stores free text there ("Emergency") so only accept a 2-4 letter code.
  if (job?.priority && /^[A-Z]{2,4}$/.test(job.priority.trim())) return job.priority.trim()
  const t = (job?.title || '').match(/^\[([A-Z]{2,4})\]/)
  if (t) return t[1]
  const d = (job?.description || '').match(/Priority:\s*([A-Z]{2,4})/)
  if (d) return d[1]
  return null
}

// KPI completion due date (Date | null): the synced sla_due_at column, else a
// "Due: DD/MM/YYYY HH:MM" tag the scraper leaves in the description.
export function kpiDue(job) {
  if (job?.sla_due_at) return new Date(job.sla_due_at)
  const m = (job?.description || '').match(/Due:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`)
  return null
}

// Compact KPI countdown for a due date → { text, expired } or null.
export function kpiCountdown(job) {
  const due = kpiDue(job)
  if (!due) return null
  const ms = due.getTime() - Date.now()
  const expired = ms < 0
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86400000)
  const hrs  = Math.floor((abs % 86400000) / 3600000)
  const mins = Math.floor((abs % 3600000) / 60000)
  const body = days > 0 ? `${days}d ${hrs}h` : hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
  return { text: `${expired ? '-' : ''}${body}`, expired }
}

// Card heading: Spencers/Downer jobs lead with the site address and move the
// contact name to the secondary line; everyone else leads with the client name.
export function jobHeading(job) {
  const contact = (job?.clients?.name || '').replace(/^SP — /, '') || null
  if (isSpencersJob(job)) {
    return { primary: job?.address || job?.title || contact || '—', secondary: contact }
  }
  return { primary: job?.clients?.name || job?.address || job?.title || '—', secondary: job?.address || null }
}
