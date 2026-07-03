import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// Crew flag gear that needs replacing or wishlist items; office/full manage
// them through a status workflow and get an email when new ones come in.

const KINDS = {
  replace:  { label: 'Needs replacing', emoji: '🔧' },
  wishlist: { label: 'Wishlist',        emoji: '✨' },
}
const URGENCY = {
  low:    { label: 'Low',    color: '#8AA', bg: '#EEF2F2' },
  normal: { label: 'Normal', color: '#6B9463', bg: '#EAF2E7' },
  high:   { label: 'High',   color: '#C0392B', bg: '#FBECEA' },
}
const STATUS = {
  requested: { label: 'Requested', color: '#D4851A', bg: '#FDF3E3' },
  approved:  { label: 'Approved',  color: '#4A7FA5', bg: '#EBF3FA' },
  ordered:   { label: 'Ordered',   color: '#6B9463', bg: '#EAF2E7' },
  done:      { label: 'Done',      color: '#2F5233', bg: '#E6F4EC' },
  declined:  { label: 'Declined',  color: '#C0392B', bg: '#FFF0EE' },
}
// Allowed forward transitions the office can apply per current status.
const NEXT = {
  requested: [['approved', 'Approve'], ['declined', 'Decline']],
  approved:  [['ordered', 'Mark ordered'], ['declined', 'Decline']],
  ordered:   [['done', 'Mark done']],
  done:      [],
  declined:  [['requested', 'Reopen']],
}
const FILTERS = [['open', 'Open'], ['all', 'All'], ['requested', 'New'], ['ordered', 'Ordered'], ['done', 'Done']]

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 30) return `${d}d ago`
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

export default function ToolRequests() {
  const { profile, isStaff } = useAuth()
  const meId = profile?.id
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ kind: 'replace', item: '', notes: '', urgency: 'normal' })
  const [submitting, setSubmitting] = useState(false)
  const [filter, setFilter] = useState('open')
  const [toast, setToast] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800) }

  const load = useCallback(async () => {
    let q = supabase
      .from('tool_requests')
      .select('*, users:requested_by ( name )')
      .order('created_at', { ascending: false })
    // Crew only see their own requests; office/full see all.
    if (!isStaff && meId) q = q.eq('requested_by', meId)
    const { data } = await q
    setRequests(data ?? [])
    setLoading(false)
  }, [isStaff, meId])

  useEffect(() => {
    load()
    const channel = supabase
      .channel('tool-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tool_requests' }, () => load())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  async function submit(e) {
    e.preventDefault()
    if (!form.item.trim() || !meId) return
    setSubmitting(true)
    const { data, error } = await supabase
      .from('tool_requests')
      .insert({ kind: form.kind, item: form.item.trim(), notes: form.notes.trim() || null, urgency: form.urgency, requested_by: meId })
      .select('*, users:requested_by ( name )')
      .single()
    setSubmitting(false)
    if (error) { showToast('Could not submit — try again'); return }
    setForm({ kind: 'replace', item: '', notes: '', urgency: 'normal' })
    if (data) setRequests(prev => [data, ...prev.filter(r => r.id !== data.id)])
    showToast('Sent to the office ✓')
    // Fire-and-forget email notification.
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${SUPABASE_URL}/functions/v1/notify-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ request_id: data?.id }),
    }).catch(() => {})
  }

  async function setStatus(r, status) {
    const patch = { status }
    if (status === 'done' || status === 'declined') { patch.resolved_by = meId; patch.resolved_at = new Date().toISOString() }
    if (status === 'requested') { patch.resolved_by = null; patch.resolved_at = null }
    setRequests(prev => prev.map(x => x.id === r.id ? { ...x, ...patch } : x))
    const { error } = await supabase.from('tool_requests').update(patch).eq('id', r.id)
    if (error) { showToast('Update failed'); load() }
  }

  const visible = requests.filter(r => {
    if (filter === 'all') return true
    if (filter === 'open') return !['done', 'declined'].includes(r.status)
    return r.status === filter
  })
  const openCount = requests.filter(r => r.status === 'requested').length

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <div style={s.title}>Tools &amp; Wishlist</div>
          <div style={s.sub}>{isStaff ? 'Requests from the crew' : 'Flag gear that needs replacing or add a wishlist item'}</div>
        </div>
        {isStaff && openCount > 0 && <span style={s.newBadge}>{openCount} new</span>}
      </div>

      <div style={s.body}>
        {/* Submit form — available to everyone */}
        <form style={s.card} onSubmit={submit}>
          <div style={s.cardTitle}>New request</div>
          <div style={s.kindRow}>
            {Object.entries(KINDS).map(([k, v]) => (
              <button type="button" key={k}
                style={{ ...s.kindBtn, ...(form.kind === k ? s.kindBtnActive : {}) }}
                onClick={() => setForm(f => ({ ...f, kind: k }))}>
                {v.emoji} {v.label}
              </button>
            ))}
          </div>
          <input style={s.input} placeholder={form.kind === 'replace' ? 'What needs replacing? e.g. Stihl MS201T chainsaw' : 'What would you like? e.g. New pole saw'}
            value={form.item} onChange={e => setForm(f => ({ ...f, item: e.target.value }))} maxLength={120} />
          <textarea style={s.textarea} placeholder="Any details — why, brand/model, where to buy… (optional)"
            value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} maxLength={500} />
          <div style={s.formFooter}>
            <div style={s.urgRow}>
              {Object.entries(URGENCY).map(([k, v]) => (
                <button type="button" key={k}
                  style={{ ...s.urgBtn, ...(form.urgency === k ? { background: v.bg, color: v.color, borderColor: v.color } : {}) }}
                  onClick={() => setForm(f => ({ ...f, urgency: k }))}>
                  {v.label}
                </button>
              ))}
            </div>
            <button type="submit" style={{ ...s.submitBtn, opacity: form.item.trim() && !submitting ? 1 : 0.5 }} disabled={!form.item.trim() || submitting}>
              {submitting ? 'Sending…' : 'Submit'}
            </button>
          </div>
        </form>

        {/* Filters (office) */}
        {isStaff && (
          <div style={s.filterRow}>
            {FILTERS.map(([k, label]) => (
              <button key={k} style={{ ...s.filterChip, ...(filter === k ? s.filterChipActive : {}) }} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={s.empty}>{isStaff ? 'No requests here.' : 'You haven’t submitted any requests yet.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {visible.map(r => {
              const st = STATUS[r.status] ?? STATUS.requested
              const urg = URGENCY[r.urgency] ?? URGENCY.normal
              return (
                <div key={r.id} style={s.reqCard}>
                  <div style={s.reqTop}>
                    <span style={s.kindTag}>{KINDS[r.kind]?.emoji} {KINDS[r.kind]?.label}</span>
                    <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>
                    {r.urgency !== 'normal' && <span style={{ ...s.badge, background: urg.bg, color: urg.color }}>{urg.label}</span>}
                  </div>
                  <div style={s.reqItem}>{r.item}</div>
                  {r.notes && <div style={s.reqNotes}>{r.notes}</div>}
                  <div style={s.reqMeta}>
                    {isStaff && <>By {r.users?.name ?? 'Unknown'} · </>}{timeAgo(r.created_at)}
                  </div>
                  {isStaff && NEXT[r.status]?.length > 0 && (
                    <div style={s.actions}>
                      {NEXT[r.status].map(([st2, label]) => (
                        <button key={st2} style={{ ...s.actionBtn, ...(st2 === 'declined' ? s.actionBtnDanger : {}) }} onClick={() => setStatus(r, st2)}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}

const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--cream)' },
  header: { padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  title: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)' },
  sub: { fontSize: '12px', color: '#999', marginTop: '2px' },
  newBadge: { background: '#D4851A', color: '#fff', fontSize: '12px', fontWeight: '700', borderRadius: '12px', padding: '3px 10px' },

  body: { flex: 1, overflowY: 'auto', padding: '16px', maxWidth: '640px', width: '100%', margin: '0 auto', boxSizing: 'border-box' },

  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 4px rgba(44,36,22,0.06)' },
  cardTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--bark)', marginBottom: '12px' },
  kindRow: { display: 'flex', gap: '8px', marginBottom: '10px' },
  kindBtn: { flex: 1, padding: '10px', borderRadius: '9px', border: '1.5px solid var(--border)', background: '#fff', color: '#777', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  kindBtnActive: { borderColor: 'var(--moss)', background: 'var(--moss-pale)', color: 'var(--moss)' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' },
  textarea: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: '10px' },
  formFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' },
  urgRow: { display: 'flex', gap: '6px' },
  urgBtn: { padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: '#fff', color: '#999', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  submitBtn: { padding: '11px 22px', borderRadius: '9px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },

  filterRow: { display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' },
  filterChip: { padding: '7px 14px', borderRadius: '18px', border: '1px solid var(--border)', background: '#fff', color: '#777', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  filterChipActive: { background: 'var(--bark)', color: '#fff', borderColor: 'var(--bark)' },

  empty: { textAlign: 'center', color: '#aaa', fontSize: '14px', marginTop: '30px' },
  reqCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(44,36,22,0.06)' },
  reqTop: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
  kindTag: { fontSize: '12px', fontWeight: '600', color: '#888' },
  badge: { fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '2px 9px' },
  reqItem: { fontSize: '16px', fontWeight: '700', color: 'var(--bark)', marginBottom: '3px' },
  reqNotes: { fontSize: '13px', color: '#666', lineHeight: 1.5, marginBottom: '6px', whiteSpace: 'pre-wrap' },
  reqMeta: { fontSize: '12px', color: '#aaa' },
  actions: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' },
  actionBtn: { padding: '8px 14px', borderRadius: '8px', border: '1.5px solid var(--moss)', background: '#fff', color: 'var(--moss)', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  actionBtnDanger: { borderColor: '#E0B0AA', color: 'var(--danger)' },

  toast: { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bark)', color: '#fff', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 500 },
}
