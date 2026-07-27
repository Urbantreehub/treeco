import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { ACCEPTED_STATUSES, isExpired, effectiveStatus } from '../utils/quoteStatus'

// ── Quote-status presentation ───────────────────────────────────────────────
// The quotes table uses its own status vocabulary ('viewed' = client opened the
// link). Mirrors the map in SentQuotes.jsx, extended with the post-acceptance
// statuses (complete / invoiced) and a derived "expired" state.
const QUOTE_STATUS = {
  draft:    { label: 'Draft',    color: '#7C93A8' },
  sent:     { label: 'Sent',     color: '#D4851A' },
  viewed:   { label: 'Opened',   color: '#4A7FA5' },
  accepted: { label: 'Accepted', color: '#4A6741' },
  declined: { label: 'Declined', color: '#C0392B' },
  complete: { label: 'Complete', color: '#7FA650' },
  invoiced: { label: 'Invoiced', color: '#2F5233' },
  expired:  { label: 'Expired',  color: '#A85C5C' },
}
function statusColor(k) { return QUOTE_STATUS[k]?.color ?? '#7C93A8' }
function statusLabel(k) { return QUOTE_STATUS[k]?.label ?? (k || '—') }

function nzd(v) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function timeAgo(dateStr) {
  if (!dateStr) return null
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return null
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const day = Math.floor(diff / 86400000)
  if (day < 1) return 'today'
  if (day === 1) return 'yesterday'
  if (day < 30) return `${day}d ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}mo ago`
  return `${Math.floor(mon / 12)}y ago`
}

function daysBetween(a, b) {
  if (!a || !b) return null
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000
}

// ── Status filter chips ─────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'draft',    label: 'Draft' },
  { key: 'sent',     label: 'Sent' },
  { key: 'viewed',   label: 'Opened' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'expired',  label: 'Expired' },
]

export default function DashboardQuotesTable() {
  const nav = useNavigate()
  const [quotes, setQuotes] = useState([])
  const [owners, setOwners] = useState([])   // [{ id, name }]
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState('all')
  const [ownerFilter, setOwnerFilter]   = useState('all')  // 'all' | userId | 'unassigned'
  const [search, setSearch]             = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [qRes, uRes] = await Promise.all([
      supabase
        .from('quotes')
        .select('id, status, total, subtotal, created_at, sent_at, viewed_at, responded_at, valid_until, opened_count, last_opened_at, followup_count, created_by, jobs ( title, address, job_type, clients ( name ) )')
        .order('created_at', { ascending: false }),
      supabase.from('users').select('id, name').eq('active', true).order('name'),
    ])
    if (qRes.data) setQuotes(qRes.data)
    if (uRes.data) setOwners(uRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const ownerName = useCallback((uid) => {
    if (!uid) return 'Unassigned'
    return owners.find(o => o.id === uid)?.name ?? 'Unknown'
  }, [owners])

  // ── Funnel metrics (respect the owner filter so per-person stats work) ──────
  const scoped = useMemo(() => {
    if (ownerFilter === 'all') return quotes
    if (ownerFilter === 'unassigned') return quotes.filter(q => !q.created_by)
    return quotes.filter(q => q.created_by === ownerFilter)
  }, [quotes, ownerFilter])

  const stats = useMemo(() => {
    const sent = scoped.filter(q => q.status !== 'draft')
    const accepted = scoped.filter(q => ACCEPTED_STATUSES.includes(q.status))
    const declined = scoped.filter(q => q.status === 'declined')
    const winRate = (accepted.length + declined.length) > 0
      ? Math.round((accepted.length / (accepted.length + declined.length)) * 100)
      : null
    // Average days from sent → responded, over accepted quotes that have both.
    const times = accepted
      .map(q => daysBetween(q.sent_at, q.responded_at))
      .filter(d => d != null && d >= 0)
    const avgToAccept = times.length ? (times.reduce((s, d) => s + d, 0) / times.length) : null
    const openValue = scoped
      .filter(q => ['sent', 'viewed'].includes(q.status) && !isExpired(q))
      .reduce((s, q) => s + (Number(q.total) || 0), 0)
    return { total: scoped.length, sentCount: sent.length, acceptedCount: accepted.length, winRate, avgToAccept, openValue }
  }, [scoped])

  // ── Row list (status + search on top of the owner-scoped set) ───────────────
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return scoped.filter(q => {
      const eff = effectiveStatus(q)
      const statusOk =
        statusFilter === 'all' ? true :
        statusFilter === 'accepted' ? ACCEPTED_STATUSES.includes(q.status) :
        eff === statusFilter
      if (!statusOk) return false
      if (!term) return true
      const client = q.jobs?.clients?.name ?? ''
      const title = q.jobs?.title ?? ''
      const addr = q.jobs?.address ?? ''
      return (client + ' ' + title + ' ' + addr).toLowerCase().includes(term)
    })
  }, [scoped, statusFilter, search])

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quotes</div>
        <button onClick={() => nav('/quotes')} style={st.linkBtn}>Sent quotes tracker →</button>
      </div>

      {/* Funnel stat strip */}
      <div style={st.statStrip}>
        <MiniStat label="Total quotes" value={stats.total} />
        <MiniStat label="Sent" value={stats.sentCount} />
        <MiniStat label="Accepted" value={stats.acceptedCount} color="var(--moss)" />
        <MiniStat label="Win rate" value={stats.winRate != null ? `${stats.winRate}%` : '—'}
          color={stats.winRate != null && stats.winRate < 40 ? '#D4851A' : 'var(--bark)'} />
        <MiniStat label="Avg to accept" value={stats.avgToAccept != null ? `${stats.avgToAccept.toFixed(1)}d` : '—'} />
        <MiniStat label="Open value" value={nzd(stats.openValue)} />
      </div>

      {/* Filters: status chips · team member · search */}
      <div style={st.filterRow}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {STATUS_FILTERS.map(f => {
            const on = statusFilter === f.key
            return (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                style={{ ...st.chip, ...(on ? st.chipOn : null) }}>
                {f.label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} style={st.select}>
            <option value="all">All team members</option>
            {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search client, job, address…"
            style={st.searchInput}
          />
        </div>
      </div>

      {/* Table */}
      <div style={st.tableWrap}>
        <table style={st.table}>
          <thead>
            <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
              {['Client', 'Job', 'Amount', 'Status', 'Owner', 'Activity', ''].map(h => (
                <th key={h} style={st.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={st.empty}>Loading quotes…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} style={st.empty}>
                {quotes.length === 0 ? 'No quotes yet' : 'No quotes match these filters'}
              </td></tr>
            ) : rows.map(q => {
              const eff = effectiveStatus(q)
              const opened = !!q.viewed_at || (q.opened_count ?? 0) > 0
              return (
                <tr key={q.id} style={st.row} onClick={() => nav('/quotes/' + q.id)}>
                  <td style={st.td}>
                    <div style={{ fontWeight: 600, color: 'var(--bark)' }}>{q.jobs?.clients?.name || 'Unknown client'}</div>
                    {q.jobs?.address && <div style={st.sub}>{q.jobs.address}</div>}
                  </td>
                  <td style={st.td}>
                    <span style={{ color: 'var(--bark)' }}>{q.jobs?.title || '—'}</span>
                  </td>
                  <td style={{ ...st.td, fontWeight: 700, color: 'var(--bark)', whiteSpace: 'nowrap' }}>{nzd(q.total)}</td>
                  <td style={st.td}>
                    <span style={{ ...st.pill, background: statusColor(eff) }}>{statusLabel(eff)}</span>
                  </td>
                  <td style={{ ...st.td, color: q.created_by ? 'var(--bark)' : '#bbb', whiteSpace: 'nowrap' }}>{ownerName(q.created_by)}</td>
                  <td style={{ ...st.td, whiteSpace: 'nowrap' }}>
                    {opened ? (
                      <span style={{ color: 'var(--moss)', fontWeight: 600, fontSize: 12 }}>
                        👁 Opened{(q.opened_count ?? 0) > 0 ? ` ${q.opened_count}×` : ''}
                      </span>
                    ) : q.sent_at ? (
                      <span style={{ color: '#A8A29A', fontSize: 12 }}>Not opened</span>
                    ) : (
                      <span style={{ color: '#bbb', fontSize: 12 }}>Draft</span>
                    )}
                    <div style={st.sub}>
                      {q.sent_at ? `Sent ${timeAgo(q.sent_at)}` : `Created ${timeAgo(q.created_at)}`}
                      {(q.followup_count ?? 0) > 0 ? ` · ${q.followup_count} follow-up${q.followup_count === 1 ? '' : 's'}` : ''}
                    </div>
                  </td>
                  <td style={{ ...st.td, textAlign: 'right' }}>
                    <span style={{ color: 'var(--moss)', fontSize: 12, fontWeight: 600 }}>Open →</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color }) {
  return (
    <div style={st.miniStat}>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--ink)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const st = {
  linkBtn: { fontSize: 12, color: 'var(--moss)', background: 'none', border: '1px solid var(--moss)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)' },

  statStrip: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 14 },
  miniStat: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 14px', textAlign: 'center' },

  filterRow: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 },
  chip: { border: '1px solid var(--border)', background: '#fff', color: 'var(--bark)', borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  chipOn: { background: 'var(--moss)', borderColor: 'var(--moss)', color: '#fff' },
  select: { border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', background: '#fff', cursor: 'pointer' },
  searchInput: { border: '1px solid var(--border)', borderRadius: 8, padding: '7px 11px', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', minWidth: 200, outline: 'none' },

  tableWrap: { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  row: { borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  td: { padding: '11px 14px', verticalAlign: 'top' },
  sub: { fontSize: 11, color: '#8A857D', marginTop: 2 },
  pill: { display: 'inline-block', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap' },
  empty: { padding: '30px', color: '#aaa', textAlign: 'center', fontSize: 14 },
}
