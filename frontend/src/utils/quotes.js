// One quote per job, in practice: the record the app shows for a job.
// The database still allows several rows per job (history), so every screen
// picks the same one through this helper instead of its own heuristic.
const RANK = { invoiced: 7, complete: 6, accepted: 5, viewed: 4, sent: 3, declined: 2, draft: 1 }

export function primaryQuote(job) {
  const quotes = job?.quotes ?? []
  if (!quotes.length) return null
  return [...quotes].sort((a, b) => {
    const r = (RANK[b.status] ?? 0) - (RANK[a.status] ?? 0)
    if (r !== 0) return r
    return new Date(b.updated_at ?? b.created_at ?? 0) - new Date(a.updated_at ?? a.created_at ?? 0)
  })[0]
}

export function quoteTotal(job) {
  const q = primaryQuote(job)
  return q ? Number(q.total ?? 0) : null
}

export function nzd(v, { cents = false } = {}) {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}

// ── Job record helpers ───────────────────────────────────────────────────────

// Short job number for the record header: the quote number when there is one,
// else the last four characters of the job id (uppercased).
export function jobNumber(job, quote) {
  if (quote?.quote_number) return String(quote.quote_number)
  const id = String(job?.id ?? '')
  return id.slice(-4).toUpperCase() || '—'
}

// Every image attached to a quote line, read defensively: the builder stores
// `images` (array of URLs) and mirrors the first into `image_url`; older rows
// only have `image_url`.
export function lineImages(item) {
  if (!item) return []
  if (Array.isArray(item.images) && item.images.length) return item.images.filter(Boolean)
  return item.image_url ? [item.image_url] : []
}

// SOR (schedule of rates) code on a line, if any: an explicit `sor_code`, else
// the "CODE — description" prefix the builder writes when a SOR is picked.
export function lineSorCode(item) {
  if (!item) return null
  if (item.sor_code) return String(item.sor_code)
  if (item.sor === true) {
    const m = String(item.description || '').match(/^([A-Z]{1,4}[\w.-]*)\s+—/)
    if (m) return m[1]
    return 'SOR'
  }
  return null
}

// Line title without the SOR code prefix.
export function lineTitle(item) {
  const d = String(item?.description || '').trim()
  if (item?.sor === true) return d.replace(/^[A-Z]{1,4}[\w.-]*\s+—\s*/, '') || d
  return d || 'Untitled item'
}

// Crew-pack chips for the record footer, from quotes.job_pack.
export function crewPackChips(pack) {
  if (!pack || typeof pack !== 'object') return []
  const parts = []
  if (typeof pack.time_required === 'string' && pack.time_required.trim()) parts.push(pack.time_required.trim())
  if (pack.staff_count) parts.push(`${pack.staff_count} staff`)
  if (pack.chipper && pack.chipper !== 'None') parts.push(`${String(pack.chipper).toLowerCase()} chipper`)
  if (pack.avant === true) parts.push('Avant')
  if (pack.stump_grinder === true) parts.push('stump grinder')
  if (pack.mewp === true) parts.push('MEWP')
  if (pack.difficulty) parts.push(`difficulty ${pack.difficulty}`)
  const tools = Object.values(pack.tools ?? {}).filter(Boolean).length
  if (tools > 0) parts.push(`${tools} tool${tools === 1 ? '' : 's'}`)
  return parts
}

// Compact relative time for the feed: "now", "5m", "2h", "Tue", "12 Jul", "12 Jul 25".
export function relWhen(dateStr, now = Date.now()) {
  if (!dateStr) return ''
  const t = new Date(dateStr).getTime()
  if (Number.isNaN(t)) return ''
  const diff = now - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const d = new Date(t)
  if (diff < 7 * 86400000) return d.toLocaleDateString('en-NZ', { weekday: 'short' })
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString('en-NZ', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' })
}

// Days a job has sat in its current status (for the "Quote Sent · 6 days" pill).
export function daysInStatus(job, now = Date.now()) {
  const at = job?.status_changed_at ?? job?.created_at
  if (!at) return null
  const d = Math.floor((now - new Date(at).getTime()) / 86400000)
  return d < 0 ? 0 : d
}
