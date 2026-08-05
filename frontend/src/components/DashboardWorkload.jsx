import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { jobCategory, JOB_CATEGORIES } from '../config/statuses'

// Josh's dashboard workload panel: a live counter of new jobs coming in by type
// (Private / Spencers / Downer) + a to-do list of open Actions alerts. Both stay
// live via realtime so he can watch workload without refreshing.

const ALERT_ICON = {
  new_lead: '🆕', to_invoice: '💰', unsent_quote: '✉️', not_pushed: '📤',
  portal_approval: '✅', portal_status: '🔄', comment: '💬', acceptance: '🤝',
}

export default function DashboardWorkload() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState({ residential: 0, spencers: 0, downer: 0 })
  const [alerts, setAlerts] = useState([])

  useEffect(() => {
    let active = true
    const refresh = () => {
      supabase.from('jobs')
        .select('id, category, ko_reference, title, clients(name)')
        .eq('status', 'new_lead')
        .then(({ data }) => {
          if (!active) return
          const c = { residential: 0, spencers: 0, downer: 0 }
          for (const j of (data ?? [])) { const k = jobCategory(j); c[k] = (c[k] ?? 0) + 1 }
          setCounts(c)
        })
      supabase.from('job_alerts')
        .select('id, kind, title, job_id, jobs(address, title)')
        .eq('status', 'open').order('created_at', { ascending: false }).limit(6)
        .then(({ data }) => { if (active) setAlerts(data ?? []) })
    }
    refresh()
    const ch = supabase.channel('dash-workload')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_alerts' }, refresh)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [])

  const cards = ['residential', 'spencers', 'downer'].map(k => ({ key: k, ...JOB_CATEGORIES[k] }))
  const totalNew = counts.residential + counts.spencers + counts.downer

  return (
    <div style={s.grid}>
      {/* New jobs by type */}
      <div style={s.panel}>
        <div style={s.head}>
          <span style={s.title}>New jobs coming in</span>
          <span style={s.total}>{totalNew}</span>
        </div>
        <div style={s.counts}>
          {cards.map(c => (
            <button key={c.key} onClick={() => navigate('/pipeline')} style={{ ...s.count, borderColor: c.color + '44' }}>
              <span style={{ ...s.countNum, color: c.color }}>{counts[c.key]}</span>
              <span style={s.countLabel}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* To-do list (open alerts) */}
      <div style={s.panel}>
        <div style={s.head}>
          <span style={s.title}>To do</span>
          <button onClick={() => navigate('/actions')} style={s.link}>Open Actions →</button>
        </div>
        {/* F1: Actions is the single inbox — this card is just the doorway,
            not a second copy of the list. */}
        {alerts.length === 0 ? (
          <div style={s.empty}>🎉 Nothing waiting.</div>
        ) : (
          <button onClick={() => navigate('/actions')} style={{ ...s.todo, justifyContent: 'space-between' }}>
            <span style={s.todoText}>
              <span style={s.todoTitle}>{alerts.length}{alerts.length === 6 ? '+' : ''} item{alerts.length === 1 ? '' : 's'} waiting to be actioned</span>
              <span style={s.todoJob}>Portal updates, new leads & quote activity</span>
            </span>
            <span style={{ fontSize: 14, color: '#4A7FA5', flexShrink: 0 }}>→</span>
          </button>
        )}
      </div>
    </div>
  )
}

const s = {
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' },
  panel: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius, 12px)', padding: '16px 18px' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  title: { fontSize: '13px', fontWeight: 700, color: 'var(--ink)' },
  total: { fontSize: '13px', fontWeight: 800, color: '#fff', background: 'var(--moss)', borderRadius: 20, minWidth: 24, textAlign: 'center', padding: '2px 9px' },
  link: { fontSize: '12px', color: '#4A7FA5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)' },
  counts: { display: 'flex', gap: '10px' },
  count: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '12px 8px', borderRadius: 10, border: '1.5px solid', background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },
  countNum: { fontSize: '26px', fontWeight: 800, lineHeight: 1 },
  countLabel: { fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' },
  empty: { fontSize: '13px', color: '#6A8C61', padding: '8px 0' },
  todoList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  todo: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#FAFAF7', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)', width: '100%' },
  todoIcon: { fontSize: 15, flexShrink: 0 },
  todoText: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  todoTitle: { fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  todoJob: { fontSize: 11, color: '#999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
}
