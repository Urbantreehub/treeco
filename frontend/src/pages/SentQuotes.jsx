import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useIsMobile } from '../hooks/useIsMobile'
import { useNavigate } from 'react-router-dom'
import { exGst, quoteEx } from '../utils/money'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const fnHeaders = {
  'Content-Type': 'application/json',
  apikey: ANON,
  Authorization: `Bearer ${ANON}`,
}

// ── Quote-status presentation ───────────────────────────────────────────────
// The quotes table uses its own status vocabulary ('viewed' = client opened the
// quote link). config/statuses.js is keyed for *job* statuses, so we map quote
// statuses locally rather than misuse those keys.
const QUOTE_STATUS = {
  draft:    { label: 'Draft',    color: '#7C93A8' },
  sent:     { label: 'Sent',     color: '#D4851A' },
  viewed:   { label: 'Opened',   color: '#4A7FA5' },
  accepted: { label: 'Accepted', color: '#4A6741' },
  declined: { label: 'Declined', color: '#C0392B' },
}
function qStatusColor(k) { return QUOTE_STATUS[k]?.color ?? '#7C93A8' }
function qStatusLabel(k) { return QUOTE_STATUS[k]?.label ?? (k || '—') }

// ── Relative time ───────────────────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return null
  const then = new Date(dateStr).getTime()
  if (Number.isNaN(then)) return null
  const diff = Date.now() - then
  if (diff < 0) return 'just now'
  const sec = Math.floor(diff / 1000)
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon} month${mon === 1 ? '' : 's'} ago`
  const yr = Math.floor(mon / 12)
  return `${yr} year${yr === 1 ? '' : 's'} ago`
}

const DAY_MS = 24 * 60 * 60 * 1000
function needsFollowUp(q) {
  if (!['sent', 'viewed'].includes(q.status)) return false
  if (!q.sent_at) return false
  return Date.now() - new Date(q.sent_at).getTime() > 3 * DAY_MS
}
function isOpened(q) {
  return !!q.viewed_at || (q.opened_count ?? 0) > 0
}
function isResolved(q) {
  return q.status === 'accepted' || q.status === 'declined'
}

// ── Toast ───────────────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null
  const color =
    toast.kind === 'error' ? 'var(--danger)' :
    toast.kind === 'success' ? 'var(--moss)' : 'var(--bark)'
  return (
    <div style={{ ...s.toast, borderLeft: `4px solid ${color}` }}>
      {toast.msg}
    </div>
  )
}

// ── Follow-up menu ──────────────────────────────────────────────────────────
function FollowUpMenu({ onPick, onClose, busy }) {
  return (
    <div style={s.menu} onClick={e => e.stopPropagation()}>
      <div style={s.menuTitle}>Follow up via…</div>
      {[['email', 'Email'], ['sms', 'SMS'], ['both', 'Both']].map(([ch, label]) => (
        <button
          key={ch}
          style={s.menuItem}
          disabled={busy}
          onClick={() => onPick(ch)}
        >
          {label}
        </button>
      ))}
      <button style={s.menuCancel} onClick={onClose} disabled={busy}>Cancel</button>
    </div>
  )
}

// ── Quote card ──────────────────────────────────────────────────────────────
function QuoteCard({ q, isMobile, onFollowUp, onTextLink, onOpen, busy }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const job = q.jobs ?? {}
  const client = job.clients ?? {}
  const opened = isOpened(q)
  const resolved = isResolved(q)
  const overdue = needsFollowUp(q)

  async function pick(channel) {
    await onFollowUp(q, channel)
    setMenuOpen(false)
  }

  return (
    <div style={{ ...s.card, ...(overdue ? s.cardOverdue : null) }}>
      <div style={s.cardTop}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={s.clientName}>{client.name || 'Unknown client'}</div>
          {job.address && <div style={s.address}>{job.address}</div>}
          {job.title && <div style={s.jobTitle}>{job.title}</div>}
        </div>
        <div style={s.rightCol}>
          {/* Staff tracking view — ex-GST, labelled; the client's copy stays incl-GST. */}
          <div style={s.total}>{exGst(quoteEx(q)) ?? '—'}</div>
          <span style={{ ...s.pill, background: qStatusColor(q.status) }}>
            {qStatusLabel(q.status)}
          </span>
        </div>
      </div>

      <div style={s.meta}>
        {opened ? (
          <span style={s.openedTag}>
            👁 Opened{(q.opened_count ?? 0) > 0 ? ` ${q.opened_count}×` : ''}
            {timeAgo(q.last_opened_at || q.viewed_at) ? ` · last ${timeAgo(q.last_opened_at || q.viewed_at)}` : ''}
          </span>
        ) : (
          <span style={s.notOpened}>Not opened yet</span>
        )}
        {q.sent_at && <span style={s.sentAgo}>Sent {timeAgo(q.sent_at)}</span>}
      </div>

      {(q.followup_count ?? 0) > 0 && (
        <div style={s.followNote}>
          Followed up {q.followup_count}×
          {timeAgo(q.last_followup_at) ? ` · last ${timeAgo(q.last_followup_at)}` : ''}
        </div>
      )}

      <div style={s.actions}>
        {!resolved && (
          <div style={{ position: 'relative' }}>
            <button
              style={s.btnPrimary}
              disabled={busy}
              onClick={() => setMenuOpen(o => !o)}
            >
              Follow up
            </button>
            {menuOpen && (
              <>
                <div style={s.menuScrim} onClick={() => setMenuOpen(false)} />
                <FollowUpMenu onPick={pick} onClose={() => setMenuOpen(false)} busy={busy} />
              </>
            )}
          </div>
        )}
        {!resolved && (
          <button style={s.btnGhost} disabled={busy} onClick={() => onTextLink(q)}>
            Text link
          </button>
        )}
        <button style={s.btnGhost} onClick={() => onOpen(q)}>Open</button>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',      label: 'All' },
  { key: 'awaiting', label: 'Awaiting response' },
  { key: 'opened',   label: 'Opened, no reply' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
]

export default function SentQuotes() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [toast, setToast] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, status, subtotal, total, client_view_token, sent_at, viewed_at, responded_at, opened_count, last_opened_at, followup_count, last_followup_at, jobs ( title, address, clients ( name, email, phone ) )')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: false })
      if (error) throw error
      setQuotes(Array.isArray(data) ? data : [])
    } catch (err) {
      showToast(err?.message || 'Could not load quotes', 'error')
      setQuotes([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleFollowUp(q, channel) {
    setBusyId(q.id)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/quote-followup`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({ quote_id: q.id, channel }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        showToast(body?.error || 'Follow-up failed', 'error')
        return
      }
      // Build a per-channel result message
      const parts = []
      const r = body.results || {}
      if (r.email) parts.push(`Email ${r.email.ok ? 'sent' : `failed${r.email.error ? `: ${r.email.error}` : ''}`}`)
      if (r.sms) parts.push(`SMS ${r.sms.ok ? 'sent' : `failed${r.sms.error ? `: ${r.sms.error}` : ''}`}`)
      const anyFail = (r.email && !r.email.ok) || (r.sms && !r.sms.ok)
      showToast(parts.length ? parts.join(' · ') : 'Follow-up sent', anyFail ? 'error' : 'success')
      // Optimistically bump follow-up count
      setQuotes(qs => qs.map(x =>
        x.id === q.id
          ? { ...x, followup_count: (x.followup_count ?? 0) + 1, last_followup_at: new Date().toISOString() }
          : x
      ))
    } catch (err) {
      showToast(err?.message || 'Follow-up failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleTextLink(q) {
    setBusyId(q.id)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: fnHeaders,
        body: JSON.stringify({ quote_id: q.id, kind: 'quote_link' }),
      })
      const body = await res.json().catch(() => ({}))
      if (body?.notConfigured) {
        showToast('Add Twilio keys in Settings to send SMS', 'error')
        return
      }
      if (!res.ok || !body.ok) {
        showToast(body?.error || 'Could not send text', 'error')
        return
      }
      showToast('Quote link texted', 'success')
    } catch (err) {
      showToast(err?.message || 'Could not send text', 'error')
    } finally {
      setBusyId(null)
    }
  }

  function handleOpen(q) {
    navigate('/quotes/' + q.id)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const counts = {
    sent: quotes.filter(q => q.status === 'sent').length,
    opened: quotes.filter(q => q.status === 'viewed').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    declined: quotes.filter(q => q.status === 'declined').length,
    followUp: quotes.filter(needsFollowUp).length,
  }

  const filtered = quotes.filter(q => {
    switch (filter) {
      case 'awaiting': return q.status === 'sent'
      case 'opened':   return q.status === 'viewed'
      case 'accepted': return q.status === 'accepted'
      case 'declined': return q.status === 'declined'
      default:         return true
    }
  })

  return (
    <div style={s.page}>
      <div style={s.head}>
        <h1 style={s.h1}>Sent Quotes</h1>
        <p style={s.sub}>Track opens &amp; follow up</p>
      </div>

      {/* Summary bar */}
      <div style={{ ...s.summary, gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)' }}>
        <Stat label="Sent (awaiting)" value={counts.sent} color="var(--amber)" />
        <Stat label="Opened, no reply" value={counts.opened} color="var(--sky)" />
        <Stat label="Accepted" value={counts.accepted} color="var(--moss)" />
        <Stat label="Declined" value={counts.declined} color="var(--danger)" />
        <Stat label="Needs follow-up" value={counts.followUp} color="var(--amber)" highlight />
      </div>

      {/* Filter chips */}
      <div style={s.chips}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            style={{ ...s.chip, ...(filter === f.key ? s.chipActive : null) }}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={s.state}>Loading sent quotes…</div>
      ) : quotes.length === 0 ? (
        <div style={s.state}>No quotes sent yet</div>
      ) : filtered.length === 0 ? (
        <div style={s.state}>No quotes match this filter</div>
      ) : (
        <div style={s.list}>
          {filtered.map(q => (
            <QuoteCard
              key={q.id}
              q={q}
              isMobile={isMobile}
              busy={busyId === q.id}
              onFollowUp={handleFollowUp}
              onTextLink={handleTextLink}
              onOpen={handleOpen}
            />
          ))}
        </div>
      )}

      <Toast toast={toast} />
    </div>
  )
}

function Stat({ label, value, color, highlight }) {
  return (
    <div style={{ ...s.stat, ...(highlight ? s.statHighlight : null) }}>
      <div style={{ ...s.statValue, color }}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────
const s = {
  page: { padding: '24px', maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font)' },
  head: { marginBottom: 20 },
  h1: { margin: 0, fontSize: 26, color: 'var(--bark)', fontWeight: 700 },
  sub: { margin: '4px 0 0', color: '#8A857D', fontSize: 14 },

  summary: { display: 'grid', gap: 10, marginBottom: 18 },
  stat: {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '12px 14px', textAlign: 'center',
  },
  statHighlight: { background: 'var(--amber-pale)', borderColor: 'var(--amber)' },
  statValue: { fontSize: 24, fontWeight: 700, lineHeight: 1.1 },
  statLabel: { fontSize: 12, color: '#8A857D', marginTop: 4 },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  chip: {
    border: '1px solid var(--border)', background: '#fff', color: 'var(--bark)',
    borderRadius: 999, padding: '6px 14px', fontSize: 13, cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  chipActive: { background: 'var(--moss)', borderColor: 'var(--moss)', color: '#fff' },

  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: 16,
  },
  cardOverdue: { borderLeft: '4px solid var(--amber)' },
  cardTop: { display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' },
  clientName: { fontWeight: 600, fontSize: 16, color: 'var(--bark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  address: { fontSize: 13, color: '#8A857D', marginTop: 2 },
  jobTitle: { fontSize: 13, color: '#8A857D', marginTop: 2 },
  rightCol: { textAlign: 'right', flexShrink: 0 },
  total: { fontWeight: 700, fontSize: 16, color: 'var(--bark)' },
  pill: {
    display: 'inline-block', color: '#fff', fontSize: 11, fontWeight: 600,
    padding: '3px 10px', borderRadius: 999, marginTop: 6,
  },

  meta: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12, fontSize: 13, alignItems: 'center' },
  openedTag: { color: 'var(--moss)', fontWeight: 600 },
  notOpened: { color: '#A8A29A' },
  sentAgo: { color: '#8A857D' },
  followNote: { marginTop: 6, fontSize: 12, color: 'var(--sky)' },

  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  btnPrimary: {
    background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },
  btnGhost: {
    background: '#fff', color: 'var(--bark)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)',
  },

  menu: {
    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20,
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 8, minWidth: 160,
  },
  menuScrim: { position: 'fixed', inset: 0, zIndex: 10 },
  menuTitle: { fontSize: 11, color: '#8A857D', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.4 },
  menuItem: {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    padding: '9px 8px', fontSize: 14, color: 'var(--bark)', cursor: 'pointer', borderRadius: 6,
    fontFamily: 'var(--font)',
  },
  menuCancel: {
    display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
    padding: '9px 8px', fontSize: 13, color: '#8A857D', cursor: 'pointer', borderRadius: 6,
    fontFamily: 'var(--font)',
  },

  state: {
    background: '#fff', border: '1px dashed var(--border)', borderRadius: 'var(--radius)',
    padding: '40px 20px', textAlign: 'center', color: '#8A857D', fontSize: 15,
  },

  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
    background: 'var(--bark)', color: '#fff', padding: '12px 18px', borderRadius: 'var(--radius)',
    fontSize: 14, maxWidth: '90vw', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
  },
}
