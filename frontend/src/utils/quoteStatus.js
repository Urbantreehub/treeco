// Shared quote lifecycle helpers — status classification, expiry, and the
// follow-up cadence. Kept pure (with an injectable `now`) so they can be unit
// tested and reused across the dashboard widgets.

const DAY = 86400000
const HOUR = 3600000

// Statuses that count as won revenue.
export const ACCEPTED_STATUSES = ['accepted', 'complete', 'invoiced']

// A sent/opened quote past its valid_until is treated as expired without
// needing a stored status change (matches Quotient's lifecycle).
export function isExpired(q, now = Date.now()) {
  if (!q || !['sent', 'viewed'].includes(q.status)) return false
  if (!q.valid_until) return false
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  return new Date(q.valid_until) < today
}

// The status we present/filter on: the stored status unless it has expired.
export function effectiveStatus(q, now = Date.now()) {
  return isExpired(q, now) ? 'expired' : q?.status
}

// Follow-up cadence (Quotient's): unopened after 12h, chase after 3 days, final
// nudge after 14 days — only while a quote is still awaiting a response.
// Returns 'final' | 'chase' | 'unopened' | null.
export function followUpBucket(q, now = Date.now()) {
  if (!q || !['sent', 'viewed'].includes(q.status)) return null
  if (!q.sent_at) return null
  const sentAgo = now - new Date(q.sent_at).getTime()
  const opened = !!q.viewed_at || (q.opened_count ?? 0) > 0
  if (sentAgo > 14 * DAY) return 'final'
  if (sentAgo > 3 * DAY) return 'chase'
  if (!opened && sentAgo > 12 * HOUR) return 'unopened'
  return null
}
