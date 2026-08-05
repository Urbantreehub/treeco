import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { getStatusLabel, categoryMeta } from '../config/statuses'

// Ashley's "to be actioned" list. Portal syncs and quote activity raise alerts
// here (they never move a job themselves); the office reviews each one and either
// confirms the suggested change or dismisses it.

const KIND_META = {
  portal_approval: { label: 'Approval', color: '#2F5233', bg: '#E8F0E6' },
  portal_status:   { label: 'Portal update', color: '#4A7FA5', bg: '#EBF3FA' },
  portal_note:     { label: 'Portal note', color: '#6D4AA8', bg: '#F1ECF9' },
  acceptance:      { label: 'Accepted', color: '#2F5233', bg: '#E8F0E6' },
  comment:         { label: 'Comment', color: '#B7791F', bg: '#FBF1DD' },
  new_lead:        { label: 'New lead', color: '#4A7FA5', bg: '#EBF3FA' },
  to_invoice:      { label: 'To invoice', color: '#2F5233', bg: '#E8F0E6' },
  unsent_quote:    { label: 'Quote not sent', color: '#B7791F', bg: '#FBF1DD' },
  not_pushed:      { label: 'Not pushed to portal', color: '#C77D1A', bg: '#FBEFDD' },
}

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const min = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

export default function Actions() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState(null)
  const [userId, setUserId] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('job_alerts')
      .select('id, job_id, kind, title, detail, suggested_status, source, created_at, jobs(id, title, address, status, category, ko_reference, clients(name))')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
    setAlerts(data ?? [])
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id ?? null))
    load()
  }, [load])

  async function confirm(a) {
    setBusy(a.id)
    if (a.suggested_status && a.job_id) {
      await supabase.from('jobs')
        .update({ status: a.suggested_status, status_changed_at: new Date().toISOString() })
        .eq('id', a.job_id)
    }
    await supabase.from('job_alerts')
      .update({ status: 'done', actioned_at: new Date().toISOString(), actioned_by: userId })
      .eq('id', a.id)
    setBusy(null)
    load()
  }

  async function dismiss(a) {
    setBusy(a.id)
    await supabase.from('job_alerts')
      .update({ status: 'dismissed', actioned_at: new Date().toISOString(), actioned_by: userId })
      .eq('id', a.id)
    setBusy(null)
    load()
  }

  if (alerts === null) return <div style={s.page}><div style={s.loading}>Loading…</div></div>

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>To be actioned</h1>
        <span style={s.count}>{alerts.length}</span>
      </div>
      <p style={s.sub}>Changes from the Spencer’s / Downer portals and quote activity land here to confirm — nothing moves on its own.</p>

      {alerts.length === 0 ? (
        <div style={s.empty}>🎉 All caught up — nothing waiting.</div>
      ) : (
        <div style={s.list}>
          {alerts.map(a => {
            const km = KIND_META[a.kind] ?? { label: a.kind, color: '#777', bg: '#eee' }
            const job = a.jobs
            const cat = job ? categoryMeta(job) : null
            return (
              <div key={a.id} style={s.card}>
                <div style={s.cardTop}>
                  <span style={{ ...s.kindPill, color: km.color, background: km.bg }}>{km.label}</span>
                  {cat && <span style={{ ...s.catPill, color: cat.color, borderColor: cat.color }}>{cat.label}</span>}
                  <span style={s.time}>{timeAgo(a.created_at)}</span>
                </div>

                <div style={s.jobLine}
                  onClick={() => job && navigate(`/pipeline?job=${job.id}`)}
                  title="Open job">
                  {job?.address || job?.title || 'Job'}
                  {job?.clients?.name && <span style={s.client}> · {job.clients.name}</span>}
                </div>

                <div style={s.alertTitle}>{a.title}</div>
                {a.detail && <div style={s.detail}>{a.detail}</div>}

                <div style={s.actions}>
                  {a.suggested_status ? (
                    <button style={{ ...s.btn, ...s.btnPrimary }} disabled={busy === a.id} onClick={() => confirm(a)}>
                      {busy === a.id ? 'Working…' : `Confirm → ${getStatusLabel(a.suggested_status)}`}
                    </button>
                  ) : (
                    <button style={{ ...s.btn, ...s.btnPrimary }} disabled={busy === a.id} onClick={() => confirm(a)}>
                      {busy === a.id ? 'Working…' : 'Mark done'}
                    </button>
                  )}
                  <button style={s.btn} disabled={busy === a.id} onClick={() => dismiss(a)}>Dismiss</button>
                  {job && <button style={s.btnGhost} onClick={() => navigate(`/pipeline?job=${job.id}`)}>Open job →</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const s = {
  page: { maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px', fontFamily: 'var(--font)' },
  loading: { color: '#888', padding: 40, textAlign: 'center' },
  header: { display: 'flex', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--bark)', margin: 0 },
  count: { fontSize: 13, fontWeight: 700, color: '#fff', background: '#C0392B', borderRadius: 20, minWidth: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' },
  sub: { fontSize: 13, color: '#888', marginTop: 6, marginBottom: 18, lineHeight: 1.5 },
  empty: { textAlign: 'center', color: '#6A8C61', background: '#F0F7EE', border: '1px solid #D0E4CC', borderRadius: 12, padding: '32px 20px', fontSize: 15, fontWeight: 600 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  cardTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  kindPill: { fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20 },
  catPill: { fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 20, border: '1px solid', background: '#fff' },
  time: { marginLeft: 'auto', fontSize: 12, color: '#aaa' },
  jobLine: { fontSize: 15, fontWeight: 700, color: 'var(--bark)', cursor: 'pointer', marginBottom: 6 },
  client: { fontWeight: 500, color: '#888' },
  alertTitle: { fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 3 },
  detail: { fontSize: 13, color: '#666', lineHeight: 1.5, whiteSpace: 'pre-wrap', background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', marginTop: 4 },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 },
  btn: { padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--bark)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { background: 'var(--moss)', color: '#fff', border: 'none' },
  btnGhost: { padding: '8px 12px', borderRadius: 8, border: 'none', background: 'none', color: '#4A7FA5', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', marginLeft: 'auto' },
}
