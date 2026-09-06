import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { getStatusLabel, isSpencersJob } from '../config/statuses'
import { nzd, relWhen } from '../utils/quotes'

// One chronological feed per job, read from `job_activity` (migration 038) with
// a realtime subscription on the job. Client questions and portal notes render
// as full-width cards with Reply / Confirm buttons; staff add internal notes
// through the composer at the bottom (rpc add_job_note) and client-visible
// replies through quote_comments (the DB trigger mirrors those into the feed).
//
// If the table is empty for the job — or the query errors because the migration
// is not live yet — the feed is derived from the quote's own columns (created,
// sent, opened, followed up, accepted / declined), exactly as QuoteActivity
// does, so nothing regresses.
//
//   job              the job row (id, status, clients…)
//   quote            the primary quote row (sent_at, opened_count, …) or null
//   onStatusApplied  called with the new status after a "Confirm → …" click
//   embedded         phone layout: no own scroll, the page scrolls

const SPENCERS = '#6D4AA8'
const CLIENT_BLUE = '#4A6DA8'

const KIND = {
  lead:         { verb: 'Lead came in',   color: '#7C93A8',   glyph: '·' },
  visit_booked: { verb: 'Visit booked',   color: '#4A7FA5',   glyph: '·' },
  sent:         { verb: 'Sent',           color: '#D4851A',   glyph: '·' },
  opened:       { verb: 'Opened',         color: '#4A7FA5',   glyph: '·' },
  followed_up:  { verb: 'Followed up',    color: 'var(--ink-2)', glyph: '↗' },
  edited:       { verb: 'Edited',         color: 'var(--ink-3)', glyph: 'v' },
  accepted:     { verb: 'Accepted',       color: '#3A8A82',   glyph: '✓' },
  declined:     { verb: 'Declined',       color: '#8C4A4A',   glyph: '✕' },
  comment:      { verb: 'asked',          color: CLIENT_BLUE, glyph: '?', card: true },
  reply:        { verb: 'Replied',        color: 'var(--ink)', glyph: '↩', card: true },
  note:         { verb: 'Note',           color: 'var(--ink-2)', glyph: '≡', card: true },
  photo:        { verb: 'Photos',         color: '#4A6741',   glyph: '▣' },
  status:       { verb: 'Moved',          color: 'var(--ink-3)', glyph: '·' },
  scheduled:    { verb: 'Scheduled',      color: '#4A6741',   glyph: '·' },
  unscheduled:  { verb: 'Unscheduled',    color: '#A85C5C',   glyph: '·' },
  invoiced:     { verb: 'Invoiced',       color: '#2F5233',   glyph: '$' },
  portal:       { verb: 'Portal note',    color: SPENCERS,    glyph: 'P', card: true },
  alert:        { verb: 'Needs a decision', color: 'var(--terra)', glyph: '!', card: true },
  created:      { verb: 'Quote created',  color: 'var(--ink-3)', glyph: '·' },
}

function firstName(name) { return (name || '').split(' ')[0] || 'the client' }
function fmtDay(d) { return d ? new Date(d).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' }) : '' }
function fmtTime(d) { return d ? new Date(d).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }) : '' }

// One-line detail under the verb, per kind.
function detailFor(r, clientName) {
  const m = r.meta ?? {}
  const who = r.actor_name
  switch (r.kind) {
    case 'lead':         return m.source ? `via ${m.source}` : (who ? `by ${who}` : null)
    case 'visit_booked': return [m.run, m.date ? fmtDay(m.date) : null, who ? `by ${who}` : null].filter(Boolean).join(' · ')
    case 'sent':         return [m.version ? `v${m.version}` : null, m.total != null ? nzd(m.total) : null, who ? `by ${who}` : null].filter(Boolean).join(' · ')
    case 'opened':       return [m.count ? `${m.count}×` : null, who || clientName].filter(Boolean).join(' · ')
    case 'followed_up':  return [m.channel ? `by ${m.channel}` : null, who].filter(Boolean).join(' · ')
    case 'edited':       return [m.from_version && m.to_version ? `v${m.from_version} → v${m.to_version}` : null, m.summary, who].filter(Boolean).join(' · ')
    case 'accepted':     return [m.signed_name ? `signed ${m.signed_name}` : (who || clientName), m.total != null ? nzd(m.total) : null].filter(Boolean).join(' · ')
    case 'declined':     return [who || clientName, m.reason].filter(Boolean).join(' · ')
    case 'photo':        return [m.count ? `${m.count} photo${m.count === 1 ? '' : 's'}` : null, m.phase, m.note, who].filter(Boolean).join(' · ')
    case 'status':       return [m.from && m.to ? `${getStatusLabel(m.from)} → ${getStatusLabel(m.to)}` : (m.to ? `to ${getStatusLabel(m.to)}` : null), m.source, who].filter(Boolean).join(' · ')
    case 'scheduled':    return [m.resource, m.date ? fmtDay(m.date) : null, who].filter(Boolean).join(' · ')
    case 'unscheduled':  return who ? `by ${who}` : null
    case 'invoiced':     return [m.invoice_number ? `#${m.invoice_number}` : null, m.total != null ? nzd(m.total) : null, who].filter(Boolean).join(' · ')
    case 'portal':       return who ? `from ${who}` : (m.source || null)
    case 'alert':        return m.title || null
    case 'note':         return who || null
    case 'reply':        return who ? `${who} · visible to the client` : null
    case 'created':      return who ? `by ${who}` : null
    default:             return who || null
  }
}

// Derived feed from the quote's columns — the pre-migration fallback.
function derivedRows(quote, clientName, ownerName) {
  if (!quote) return []
  const rows = []
  const by = ownerName(quote.created_by)
  if (quote.created_at) rows.push({ id: 'd-created', kind: 'created', actor_type: 'staff', actor_name: by, created_at: quote.created_at, meta: {} })
  if (quote.sent_at) rows.push({ id: 'd-sent', kind: 'sent', actor_type: 'staff', actor_name: by, created_at: quote.sent_at, meta: { total: quote.total } })
  const count = quote.opened_count ?? 0
  if (quote.last_opened_at) rows.push({ id: 'd-open-last', kind: 'opened', actor_type: 'client', actor_name: clientName, created_at: quote.last_opened_at, meta: { count: count > 1 ? count : null } })
  if (quote.viewed_at && quote.viewed_at !== quote.last_opened_at) rows.push({ id: 'd-open-first', kind: 'opened', actor_type: 'client', actor_name: clientName, created_at: quote.viewed_at, meta: {} })
  if ((quote.followup_count ?? 0) > 0 && quote.last_followup_at) rows.push({ id: 'd-followup', kind: 'followed_up', actor_type: 'staff', actor_name: ownerName(quote.updated_by), created_at: quote.last_followup_at, meta: { channel: quote.followup_count > 1 ? `email · ${quote.followup_count} sent` : 'email' } })
  if (quote.responded_at && ['accepted', 'declined', 'complete', 'invoiced'].includes(quote.status)) {
    const kind = quote.status === 'declined' ? 'declined' : 'accepted'
    rows.push({ id: 'd-responded', kind, actor_type: 'client', actor_name: clientName, created_at: quote.responded_at, meta: { signed_name: quote.signed_name, reason: quote.decline_reason, total: quote.total } })
  }
  return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export default function ActivityFeed({ job, quote, onStatusApplied, embedded = false, headInset = 0 }) {
  const { session, profile } = useAuth()
  const [rows, setRows] = useState(null)        // server rows, or null while loading / when falling back
  const [fallback, setFallback] = useState(false)
  const [localRows, setLocalRows] = useState([]) // optimistic notes/replies
  const [hidden, setHidden] = useState(() => new Set())
  const [owners, setOwners] = useState([])
  const [filter, setFilter] = useState('all')   // all | client | portal
  const [mode, setMode] = useState('note')      // note | reply
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null)        // 'post' | row id
  const [notice, setNotice] = useState('')
  const textRef = useRef(null)

  const jobId = job?.id
  const clientName = job?.clients?.name || 'the client'
  const portal = isSpencersJob(job)
  const ownerName = useCallback(uid => (uid ? (owners.find(o => o.id === uid)?.name ?? 'a team member') : 'a team member'), [owners])

  const load = useCallback(async () => {
    if (!jobId) return
    try {
      const { data, error } = await supabase.from('job_activity')
        .select('*').eq('job_id', jobId).order('created_at', { ascending: false })
      if (error) { setFallback(true); setRows([]); return }
      // Demo mode serves the whole table regardless of filters — narrow it here.
      const mine = (data ?? []).filter(r => r && r.job_id === jobId)
      if (mine.length === 0) { setFallback(true); setRows([]); return }
      mine.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setFallback(false)
      setRows(mine)
      // Drop optimistic rows the server now has.
      setLocalRows(prev => prev.filter(l => !mine.some(r => r.kind === l.kind && r.body === l.body)))
    } catch {
      setFallback(true); setRows([])
    }
  }, [jobId])

  useEffect(() => { setRows(null); setLocalRows([]); setHidden(new Set()); load() }, [load])

  useEffect(() => {
    supabase.from('users').select('id, name').then(({ data }) => setOwners(Array.isArray(data) ? data : []))
  }, [])

  // Realtime: new rows for this job. Guarded so demo mode's no-op channel and
  // any older client without .channel() both degrade to a static feed.
  useEffect(() => {
    if (!jobId || typeof supabase.channel !== 'function') return undefined
    let ch = null
    try {
      ch = supabase.channel(`job-activity-${jobId}-${Math.random().toString(36).slice(2)}`)
      ch = ch.on?.('postgres_changes', { event: '*', schema: 'public', table: 'job_activity', filter: `job_id=eq.${jobId}` }, () => load()) ?? ch
      ch = ch.subscribe?.() ?? ch
    } catch { ch = null }
    return () => { try { if (ch && typeof supabase.removeChannel === 'function') supabase.removeChannel(ch) } catch { /* no-op */ } }
  }, [jobId, load])

  const all = useMemo(() => {
    const base = fallback ? derivedRows(quote, clientName, ownerName) : (rows ?? [])
    return [...localRows, ...base].filter(r => !hidden.has(r.id))
  }, [fallback, rows, localRows, hidden, quote, clientName, ownerName])

  const hasPortalRows = portal || all.some(r => r.actor_type === 'portal' || r.kind === 'portal')
  const visible = useMemo(() => all.filter(r => {
    if (filter === 'client') return r.actor_type === 'client' || ['comment', 'opened', 'accepted', 'declined', 'reply'].includes(r.kind)
    if (filter === 'portal') return r.actor_type === 'portal' || ['portal', 'alert'].includes(r.kind)
    return true
  }), [all, filter])

  function startReply() {
    setMode('reply'); setNotice('')
    setTimeout(() => textRef.current?.focus(), 0)
  }

  async function post() {
    const body = text.trim()
    if (!body || busy) return
    setBusy('post'); setNotice('')
    const now = new Date().toISOString()
    const me = { actor_type: 'staff', actor_id: session?.user?.id ?? null, actor_name: profile?.name ?? 'Staff' }
    try {
      if (mode === 'reply') {
        if (!quote?.id) { setNotice('There is no quote to reply on yet.'); return }
        // Client-visible: goes on the quote thread; the DB trigger mirrors it here.
        const { error } = await supabase.from('quote_comments').insert({
          quote_id: quote.id, author_type: 'staff', author_id: me.actor_id, author_name: me.actor_name, body, internal: false,
        })
        if (error) { setNotice(`Reply failed: ${error.message}`); return }
        setLocalRows(prev => [{ id: `local-${Date.now()}`, job_id: jobId, quote_id: quote.id, kind: 'reply', ...me, body, meta: {}, created_at: now }, ...prev])
      } else {
        const { error } = await supabase.rpc('add_job_note', { p_job_id: jobId, p_body: body, p_kind: 'note' })
        if (error) { setNotice(`Note failed: ${error.message}`); return }
        setLocalRows(prev => [{ id: `local-${Date.now()}`, job_id: jobId, quote_id: quote?.id ?? null, kind: 'note', ...me, body, meta: {}, created_at: now }, ...prev])
      }
      setText(''); setMode('note')
      setTimeout(load, 600)
    } finally {
      setBusy(null)
    }
  }

  async function confirmRow(r) {
    const target = r.meta?.suggested_status
    if (!target || busy) return
    setBusy(r.id)
    const { error } = await supabase.from('jobs')
      .update({ status: target, status_changed_at: new Date().toISOString() }).eq('id', jobId)
    if (!error && r.meta?.alert_id) {
      await supabase.from('job_alerts')
        .update({ status: 'done', actioned_at: new Date().toISOString(), actioned_by: session?.user?.id ?? null })
        .eq('id', r.meta.alert_id)
    }
    setBusy(null)
    if (error) { setNotice(`Could not update status: ${error.message}`); return }
    onStatusApplied?.(target)
  }

  async function dismissRow(r) {
    setBusy(r.id)
    if (r.meta?.alert_id) {
      await supabase.from('job_alerts')
        .update({ status: 'dismissed', actioned_at: new Date().toISOString(), actioned_by: session?.user?.id ?? null })
        .eq('id', r.meta.alert_id)
    }
    setBusy(null)
    setHidden(prev => new Set(prev).add(r.id))
  }

  function onKey(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); post() }
  }

  const first = firstName(clientName)
  const canReply = !!quote?.id

  return (
    <div style={{ ...st.wrap, ...(embedded ? st.wrapEmbedded : {}) }}>
      <div style={{ ...st.head, paddingRight: 20 + headInset }}>
        <span style={st.h2}>Activity</span>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>All</Chip>
        <Chip on={filter === 'client'} onClick={() => setFilter('client')}>Client</Chip>
        {hasPortalRows && <Chip on={filter === 'portal'} onClick={() => setFilter('portal')} color={SPENCERS}>Portal</Chip>}
      </div>

      <div style={{ ...st.body, ...(embedded ? st.bodyEmbedded : {}) }}>
        {rows === null ? (
          <div style={st.empty}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={st.empty}>{filter === 'all' ? 'Nothing has happened on this job yet.' : 'Nothing here for this filter.'}</div>
        ) : (
          <div style={st.tl}>
            <span style={st.rail} aria-hidden="true" />
            {visible.map(r => {
              const k = KIND[r.kind] ?? KIND.status
              const isClientCard = r.kind === 'comment'
              const verb = isClientCard ? `${firstName(r.actor_name || clientName)} asked` : k.verb
              const detail = detailFor(r, clientName)
              const suggested = r.meta?.suggested_status
              const showConfirm = suggested && ['portal', 'alert'].includes(r.kind)
              const isBusy = busy === r.id
              return (
                <div key={r.id} style={{ ...st.ev, ...(k.card ? st.evBig : {}) }}>
                  <span style={{ ...st.dot, borderColor: k.color, color: k.color }}>
                    {r.kind === 'edited' && r.meta?.to_version ? `v${r.meta.to_version}` : k.glyph}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={st.evLine}>
                      <b style={st.verb}>{verb}</b>
                      {detail && <span style={{ ...st.detail, ...(isClientCard ? st.faint : {}) }}>{' '}{isClientCard ? 'on the quote' : detail}</span>}
                    </div>
                    {r.kind === 'sent' && r.meta?.subject && <div style={st.sub}>“{r.meta.subject}”</div>}
                    {r.kind === 'opened' && r.created_at && (r.meta?.count ?? 0) > 1 && (
                      <div style={st.sub}>last {fmtDay(r.created_at)} {fmtTime(r.created_at)}</div>
                    )}
                    {k.card && (r.body || r.meta?.detail) && (
                      <div style={{ ...st.card, ...(r.kind === 'note' ? st.cardNote : {}) }}>
                        {r.body || r.meta?.detail}
                      </div>
                    )}
                    {k.card && (isClientCard || showConfirm) && (
                      <div style={st.cardBtns}>
                        {isClientCard && (
                          <button type="button" style={{ ...st.smBtn, height: embedded ? 44 : 32, opacity: canReply ? 1 : 0.5 }} disabled={!canReply} onClick={startReply} title={canReply ? `Reply to ${first} on the quote` : 'No quote to reply on yet'}>
                            Reply
                          </button>
                        )}
                        {showConfirm && (
                          <button type="button" style={{ ...st.smBtn, height: embedded ? 44 : 32, borderColor: 'var(--terra)', color: 'var(--terra)' }} disabled={isBusy} onClick={() => confirmRow(r)}>
                            {isBusy ? 'Working…' : `Confirm → ${getStatusLabel(suggested)}`}
                          </button>
                        )}
                        {showConfirm && (
                          <button type="button" style={{ ...st.smBtn, ...st.quiet, height: embedded ? 44 : 32 }} disabled={isBusy} onClick={() => dismissRow(r)}>Dismiss</button>
                        )}
                      </div>
                    )}
                  </div>
                  <span style={st.when} title={r.created_at ? new Date(r.created_at).toLocaleString('en-NZ') : ''}>{relWhen(r.created_at)}</span>
                </div>
              )
            })}
          </div>
        )}
        {fallback && rows !== null && all.length > 0 && (
          <div style={st.fallbackNote}>Showing quote history — the full feed appears once activity is recorded on this job.</div>
        )}
      </div>

      <div style={st.compose}>
        <div style={st.modeRow}>
          <button type="button" onClick={() => setMode('note')} style={{ ...st.modeBtn, ...(mode === 'note' ? st.modeOn : {}) }}>Internal note</button>
          <button type="button" onClick={() => setMode('reply')} disabled={!canReply} style={{ ...st.modeBtn, ...(mode === 'reply' ? st.modeOn : {}), opacity: canReply ? 1 : 0.5 }} title={canReply ? '' : 'No quote to reply on yet'}>
            Reply to {first}
          </button>
          <span style={st.kbd}>⌘↩</span>
        </div>
        <textarea
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder={mode === 'reply' ? `Reply to ${first} — shows on their quote…` : 'Add an internal note…'}
          style={st.textarea}
          aria-label={mode === 'reply' ? 'Reply to client' : 'Add a note'}
        />
        <div style={st.composeFoot}>
          {notice ? <span style={st.notice}>{notice}</span> : <span style={st.hint}>{mode === 'reply' ? 'Visible to the client on the quote.' : 'Never shown to the client.'}</span>}
          <button type="button" onClick={post} disabled={!text.trim() || busy === 'post'} style={{ ...st.postBtn, height: embedded ? 44 : 36, opacity: !text.trim() || busy === 'post' ? 0.5 : 1 }}>
            {busy === 'post' ? 'Posting…' : mode === 'reply' ? 'Send reply' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ on, onClick, children, color }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...st.chip,
      ...(on ? { background: color || 'var(--ink)', borderColor: color || 'var(--ink)', color: '#fff' } : color ? { color, borderColor: color } : {}),
    }}>{children}</button>
  )
}

const st = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--cream)' },
  wrapEmbedded: { height: 'auto' },
  head: { display: 'flex', alignItems: 'center', gap: 6, padding: '16px 20px 12px', borderBottom: '1px solid var(--line)', flexShrink: 0 },
  h2: { fontSize: 15, fontWeight: 750, flex: 1, color: 'var(--ink)' },
  chip: {
    display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  body: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 20px', WebkitOverflowScrolling: 'touch' },
  bodyEmbedded: { overflowY: 'visible', flex: 'none' },
  empty: { fontSize: 13, color: 'var(--ink-3)', padding: '10px 0' },
  tl: { position: 'relative', display: 'flex', flexDirection: 'column' },
  rail: { position: 'absolute', left: 9, top: 8, bottom: 8, width: 2, background: 'var(--line)' },
  ev: { display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: 10, alignItems: 'start', padding: '7px 0', position: 'relative' },
  evBig: { padding: '8px 0' },
  dot: {
    width: 20, height: 20, borderRadius: '50%', background: '#fff', border: '2px solid var(--line)', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, lineHeight: 1, flexShrink: 0,
  },
  evLine: { fontSize: 13, lineHeight: 1.35, color: 'var(--ink)' },
  verb: { fontWeight: 700 },
  detail: { color: 'var(--ink-2)', marginLeft: 5 },
  faint: { color: 'var(--ink-3)' },
  sub: { fontSize: 11, color: 'var(--ink-3)', marginTop: 1 },
  card: { marginTop: 6, background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '8px 10px', fontSize: 13, lineHeight: 1.4, color: 'var(--ink)', whiteSpace: 'pre-wrap' },
  cardNote: { background: '#FFFBF3' },
  cardBtns: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  smBtn: {
    display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  quiet: { background: 'transparent', borderColor: 'transparent', color: 'var(--ink-2)' },
  when: { fontSize: 11, color: 'var(--ink-3)', whiteSpace: 'nowrap', paddingTop: 2 },
  fallbackNote: { marginTop: 12, fontSize: 11, color: 'var(--ink-3)', lineHeight: 1.4 },
  compose: { padding: '10px 20px 16px', borderTop: '1px solid var(--line)', flexShrink: 0, background: 'var(--cream)' },
  modeRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  modeBtn: {
    height: 28, padding: '0 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: '1px solid var(--line)',
    background: '#fff', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  modeOn: { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' },
  kbd: { marginLeft: 'auto', fontSize: 11, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 6, padding: '1px 6px' },
  textarea: {
    width: '100%', boxSizing: 'border-box', border: '1px solid var(--line)', borderRadius: 12, background: '#fff', padding: '9px 12px',
    fontSize: 14, fontFamily: 'var(--font)', color: 'var(--ink)', resize: 'vertical', outline: 'none', minHeight: 44,
  },
  composeFoot: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  hint: { fontSize: 11, color: 'var(--ink-3)' },
  notice: { fontSize: 11, color: 'var(--danger)' },
  postBtn: {
    height: 36, padding: '0 14px', borderRadius: 'var(--radius-ctrl)', border: 'none', background: 'var(--terra)', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)',
  },
}
