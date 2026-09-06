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
