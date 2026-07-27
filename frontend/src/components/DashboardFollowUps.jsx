import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { followUpBucket } from '../utils/quoteStatus'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const fnHeaders = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }

const DAY = 86400000

// Presentation for each follow-up cadence bucket (from followUpBucket()).
const BUCKETS = {
  final:    { label: 'Final nudge', hint: 'Sent over 14 days ago', dot: '#C0392B', bg: '#FFF0EE', color: '#C0392B', order: 0 },
  chase:    { label: 'Follow up',   hint: 'No reply after 3 days',  dot: '#D4851A', bg: '#FDF3E3', color: '#D4851A', order: 1 },
  unopened: { label: 'Unopened',    hint: 'Not opened after 12h',   dot: '#4A7FA5', bg: '#EEF4FA', color: '#4A7FA5', order: 2 },
}

function nzd(v) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function daysAgo(dateStr) {
  if (!dateStr) return ''
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY)
  if (d < 1) return 'today'
  if (d === 1) return '1 day ago'
  return `${d} days ago`
}

export default function DashboardFollowUps() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [menuId, setMenuId] = useState(null)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('quotes')
      .select('id, status, total, sent_at, viewed_at, opened_count, followup_count, last_followup_at, jobs ( title, address, clients ( name ) )')
      .in('status', ['sent', 'viewed'])
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: true })
    const withBucket = (data ?? [])
      .map(q => ({ ...q, bucket: followUpBucket(q) }))
      .filter(q => q.bucket)
      .sort((a, b) => BUCKETS[a.bucket].order - BUCKETS[b.bucket].order || new Date(a.sent_at) - new Date(b.sent_at))
    setItems(withBucket)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function followUp(q, channel) {
    setBusyId(q.id)
    setMenuId(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/quote-followup`, {
        method: 'POST', headers: fnHeaders,
        body: JSON.stringify({ quote_id: q.id, channel }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setNote(body?.error || 'Follow-up failed')
      } else {
        setNote('Follow-up sent to ' + (q.jobs?.clients?.name || 'client'))
        // Drop it from the list optimistically — it's been actioned.
        setItems(list => list.filter(x => x.id !== q.id))
      }
    } catch (err) {
      setNote(err?.message || 'Follow-up failed')
    } finally {
      setBusyId(null)
      setTimeout(() => setNote(''), 3000)
    }
  }

  if (loading) return null
  if (items.length === 0) return null

  return (
    <div style={st.card}>
      <div style={st.head}>
        <span style={{ fontSize: 18 }}>⏰</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--bark)', flex: 1 }}>
          Quotes to follow up
          <span style={st.count}>{items.length}</span>
        </span>
        <button onClick={() => nav('/quotes')} style={st.linkBtn}>Sent quotes →</button>
      </div>

      {note && <div style={st.note}>{note}</div>}

      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map(q => {
          const b = BUCKETS[q.bucket]
          const client = q.jobs?.clients?.name || 'Unknown client'
          return (
            <div key={q.id} style={{ ...st.row, background: b.bg, borderColor: b.color + '30' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.dot, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => nav('/quotes/' + q.id)}>
                <div style={st.rowTitle}>
                  {client}
                  <span style={{ ...st.tag, color: b.color }}>{b.label}</span>
                </div>
                <div style={st.rowSub}>
                  {q.jobs?.title || q.jobs?.address || '—'} · {nzd(q.total)} · sent {daysAgo(q.sent_at)}
                  {(q.followup_count ?? 0) > 0 ? ` · ${q.followup_count} follow-up${q.followup_count === 1 ? '' : 's'}` : ''}
                </div>
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button style={st.followBtn} disabled={busyId === q.id}
                  onClick={() => setMenuId(menuId === q.id ? null : q.id)}>
                  {busyId === q.id ? 'Sending…' : 'Follow up ▾'}
                </button>
                {menuId === q.id && (
                  <>
                    <div style={st.scrim} onClick={() => setMenuId(null)} />
                    <div style={st.menu}>
                      {[['email', 'Email'], ['sms', 'SMS'], ['both', 'Both']].map(([ch, label]) => (
                        <button key={ch} style={st.menuItem} onClick={() => followUp(q, ch)}>{label}</button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const st = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 28 },
  head: { display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', background: '#FBF8F2', borderBottom: '1px solid var(--border)' },
  count: { marginLeft: 8, fontSize: 11, fontWeight: 700, background: '#F0E7D3', color: '#9A6A1A', borderRadius: 20, padding: '2px 8px' },
  linkBtn: { fontSize: 12, color: 'var(--moss)', background: 'none', border: '1px solid var(--moss)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)' },
  note: { margin: '10px 14px 0', background: '#E8F0E6', color: '#4A6741', fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8, border: '1px solid #C8D8C0' },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid' },
  rowTitle: { fontSize: 13, fontWeight: 600, color: 'var(--bark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  tag: { marginLeft: 8, fontSize: 11, fontWeight: 700 },
  rowSub: { fontSize: 11.5, color: '#8A857D', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  followBtn: { fontSize: 12, background: '#fff', border: '1px solid var(--moss)', color: 'var(--moss)', borderRadius: 6, padding: '6px 11px', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  scrim: { position: 'fixed', inset: 0, zIndex: 10 },
  menu: { position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, minWidth: 120 },
  menuItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 10px', fontSize: 13, color: 'var(--bark)', cursor: 'pointer', borderRadius: 5, fontFamily: 'var(--font)' },
}
