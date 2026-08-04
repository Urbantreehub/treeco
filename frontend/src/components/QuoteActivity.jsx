import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../config/supabase'
import { COMPANY } from '../config/company'

// ── Quotient-style activity feed ────────────────────────────────────────────
// Mirrors Quotient's quote "Overview / All Activity" panel: a reverse-chron
// timeline of everything that's happened to a quote — created, sent (with the
// email that went out), every client open, follow-ups, and the accept/decline.
//
// It prefers the real per-event log in `quote_events` (migration 029) so each
// open shows with its own timestamp. If that table isn't present yet it falls
// back to deriving the timeline from the columns already on the quote row
// (viewed_at / last_opened_at / opened_count / sent_at / responded_at), so it
// works against the live schema with no migration.

function fmtWhen(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${date} at ${time}`
}
function nzd2(v) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtHeaderDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Colours mirror utils/quoteStatus (the app-wide status palette) so an event
// reads the same colour here as the quote's status pill everywhere else.
const KIND_META = {
  created:     { label: 'Created',    color: '#8A857D', dot: '#C9C4BB' },
  edited:      { label: 'Edited',     color: '#8A857D', dot: '#C9C4BB' },
  sent:        { label: 'New Quote',  color: 'var(--ink)', dot: 'var(--terra)' },
  opened:      { label: 'Opened',     color: '#4A7FA5', dot: '#4A7FA5' },
  followed_up: { label: 'Followed up', color: '#4A7FA5', dot: '#4A7FA5' },
  accepted:    { label: 'Accepted',   color: '#4A6741', dot: '#4A6741' },
  declined:    { label: 'Declined',   color: '#C0392B', dot: '#C0392B' },
}

export default function QuoteActivity({ quote, owners = [] }) {
  const [events, setEvents] = useState(null)   // real quote_events rows, or null if unavailable
  const [tab, setTab] = useState('overview')   // 'overview' | 'all'
  const [emailOpen, setEmailOpen] = useState(true)

  const quoteId = quote?.id
  const client = quote?.jobs?.clients ?? {}
  const clientName = client.name || 'the client'
  const ownerName = useCallback(
    (uid) => (uid ? (owners.find(o => o.id === uid)?.name ?? 'a team member') : 'a team member'),
    [owners]
  )

  // Try the real per-event log; silently fall back to derived if it's absent.
  useEffect(() => {
    let alive = true
    if (!quoteId) return
    supabase
      .from('quote_events')
      .select('id, kind, actor, meta, created_at')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        setEvents(error ? null : (data ?? []))
      })
    return () => { alive = false }
  }, [quoteId])

  const quoteNum = quote?.quote_number ?? quote?.id?.slice(-6).toUpperCase() ?? ''

  // ── Build the timeline ────────────────────────────────────────────────────
  const timeline = useMemo(() => {
    if (!quote) return []
    const rows = []

    // Created
    if (quote.created_at) {
      rows.push({ id: 'created', kind: 'created', by: ownerName(quote.created_by), at: quote.created_at })
    }

    // Sent — carries the email-preview card
    if (quote.sent_at) {
      rows.push({ id: 'sent', kind: 'sent', by: ownerName(quote.created_by), at: quote.sent_at, email: true })
    }

    // Opens — prefer real per-open events, else derive first + last
    const realOpens = (events ?? []).filter(e => e.kind === 'opened')
    if (realOpens.length) {
      realOpens.forEach(e =>
        rows.push({ id: 'open-' + e.id, kind: 'opened', by: e.actor || clientName, at: e.created_at })
      )
    } else {
      const count = quote.opened_count ?? 0
      if (quote.last_opened_at) {
        rows.push({
          id: 'open-last', kind: 'opened', by: clientName, at: quote.last_opened_at,
          note: count > 1 ? `Opened ${count}× in total` : null,
        })
      }
      if (quote.viewed_at && quote.viewed_at !== quote.last_opened_at) {
        rows.push({ id: 'open-first', kind: 'opened', by: clientName, at: quote.viewed_at, note: 'First open' })
      }
    }

    // Follow-ups
    if ((quote.followup_count ?? 0) > 0 && quote.last_followup_at) {
      rows.push({
        id: 'followup', kind: 'followed_up', by: ownerName(quote.updated_by), at: quote.last_followup_at,
        note: quote.followup_count > 1 ? `${quote.followup_count} follow-ups sent` : null,
      })
    }

    // Response
    if (quote.responded_at && (quote.status === 'accepted' || quote.status === 'declined' ||
        quote.status === 'complete' || quote.status === 'invoiced')) {
      const kind = quote.status === 'declined' ? 'declined' : 'accepted'
      rows.push({
        id: 'responded', kind, by: clientName, at: quote.responded_at,
        note: quote.signed_name ? `Signed: ${quote.signed_name}` : null,
      })
    }

    // Newest first
    rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return rows
  }, [quote, events, clientName, ownerName])

  if (!quote || quote.status === 'draft') {
    // Nothing has happened yet on a fresh draft — keep the panel out of the way.
    return null
  }

  // Overview = milestones (created, sent, latest open, response). All Activity =
  // every row including every individual open and follow-up.
  const overview = timeline.filter(r => r.id !== 'open-first')
  const rows = tab === 'overview' ? overview : timeline

  return (
    <div style={st.card}>
      {/* Header — tabs left, quote ref/total right (mirrors Quotient) */}
      <div style={st.head}>
        <div style={st.tabs}>
          <button style={{ ...st.tab, ...(tab === 'overview' ? st.tabOn : null) }} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button style={{ ...st.tab, ...(tab === 'all' ? st.tabOn : null) }} onClick={() => setTab('all')}>
            All Activity
          </button>
        </div>
        <div style={st.headMeta}>
          {quote.sent_at && <span>{fmtHeaderDate(quote.sent_at)}</span>}
          <span style={st.headRef}>#{quoteNum}</span>
          <strong style={st.headTotal}>{nzd2(quote.total)}</strong>
        </div>
      </div>

      {/* Timeline */}
      <div>
        {rows.length === 0 ? (
          <div style={st.empty}>No activity yet.</div>
        ) : rows.map(r => {
          const meta = KIND_META[r.kind] ?? KIND_META.created
          return (
            <div key={r.id} style={st.event}>
              <div style={st.eventRow}>
                <span style={{ ...st.dot, background: meta.dot }} />
                <span style={st.eventLabel}>
                  <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
                  <span style={st.eventBy}> by {r.by}</span>
                </span>
                <span style={st.eventWhen}>{fmtWhen(r.at)}</span>
              </div>
              {r.note && <div style={st.eventNote}>{r.note}</div>}

              {/* Email that went out — shown inline on the "New Quote" event */}
              {r.email && (
                <EmailCard
                  quote={quote}
                  clientName={clientName}
                  open={emailOpen}
                  onToggle={() => setEmailOpen(o => !o)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── The sent email, reconstructed to match send-quote-email ─────────────────
function EmailCard({ quote, clientName, open, onToggle }) {
  const firstName = (clientName || 'there').split(' ')[0]
  const address = quote?.jobs?.address || 'your property'
  const token = quote?.client_view_token
  const previewUrl = token ? `/q/${token}?preview=1` : null
  // Prefer the sender's own note (stored on the quote) so the preview reflects
  // what the client actually received; else the standard system copy.
  const custom = (quote?.notes && quote.notes.trim()) ? quote.notes.trim() : ''
  const subject = `Urban Tree Services — Tree Quote: ${address}`

  return (
    <div style={st.email}>
      <button style={st.emailHead} onClick={onToggle}>
        <span style={st.emailSubject}>{subject}</span>
        <span style={st.emailChevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={st.emailBody}>
          {custom ? (
            <pre style={st.emailText}>{custom}</pre>
          ) : (
            <>
              <p style={st.emailP}>Hi {firstName},</p>
              <p style={st.emailP}>
                Please find your quote for work at <strong>{address}</strong> below. Click the button
                to view the full quote, accept or decline, and see all the details.
              </p>
              <p style={st.emailP}>Kind Regards,</p>
              <p style={{ ...st.emailP, marginBottom: 2 }}>{COMPANY.preparedBy}</p>
              <p style={st.emailSig}>
                Director · {COMPANY.shortName}<br />
                {COMPANY.phone} · {COMPANY.email}
              </p>
            </>
          )}
          {previewUrl && (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer" style={st.viewBtn}>
              View Quote
            </a>
          )}
        </div>
      )}
    </div>
  )
}

const st = {
  card: {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '4px 16px 8px', marginBottom: 16,
  },
  head: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    flexWrap: 'wrap', padding: '10px 0 4px', borderBottom: '1px solid var(--border)', marginBottom: 4,
  },
  tabs: { display: 'flex', gap: 18 },
  tab: {
    background: 'none', border: 'none', padding: '6px 0', fontSize: 14, fontWeight: 600,
    color: '#8A857D', cursor: 'pointer', fontFamily: 'var(--font)', borderBottom: '2px solid transparent',
  },
  tabOn: { color: '#4A7FA5', borderBottomColor: '#4A7FA5' },
  headMeta: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#8A857D' },
  headRef: { color: '#A8A29A' },
  headTotal: { color: 'var(--bark)', fontSize: 14 },

  empty: { fontSize: 13, color: '#8A857D', padding: '18px 2px' },

  event: { padding: '12px 2px', borderBottom: '1px solid #F0EDE8' },
  eventRow: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  eventLabel: { flex: 1, fontSize: 14, minWidth: 0 },
  eventBy: { color: 'var(--bark)' },
  eventWhen: { fontSize: 12.5, color: '#A8A29A', whiteSpace: 'nowrap', flexShrink: 0 },
  eventNote: { fontSize: 12, color: '#8A857D', margin: '4px 0 0 18px' },

  // Email card
  email: {
    margin: '12px 0 2px 18px', border: '1px solid var(--border)', borderRadius: 10,
    overflow: 'hidden', background: '#fff', boxShadow: '0 1px 4px rgba(44,36,22,0.05)',
  },
  emailHead: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
    background: '#FAFAF8', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
  emailSubject: { flex: 1, fontSize: 13.5, fontWeight: 700, color: 'var(--bark)' },
  emailChevron: { fontSize: 11, color: '#bbb' },
  emailBody: { padding: '16px 18px', borderTop: '1px solid var(--border)' },
  emailP: { margin: '0 0 12px', fontSize: 13.5, color: '#555', lineHeight: 1.6 },
  emailText: { margin: '0 0 12px', fontSize: 13.5, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' },
  emailSig: { margin: '0 0 14px', fontSize: 12.5, color: '#8A857D', lineHeight: 1.6 },
  viewBtn: {
    display: 'inline-block', padding: '9px 18px', background: '#F0EDE8', color: 'var(--bark)',
    borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--border)',
  },
}
