import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import CartrackMap from '../components/CartrackMap'
import { useScheduledChecks } from '../hooks/useScheduledChecks'

const CREW_DAY_RATE = 2500   // $ per crew per day

const CARTRACK_VEHICLES = [
  {
    name: 'Isuzu Elf',
    plate: 'GWL756',
    type: 'Truck',
    icon: '🚛',
    shareUrl: 'https://fleetweb-nz.cartrack.com/share?vehicle=459011881&account=97050&token=Bzjoj8NRntLrqllho0SfyyRc90R3lHA1xaEgZQMKlNrRcyfqsdW',
  },
  {
    name: 'Nissan Diesel',
    plate: 'WA2244',
    type: 'Truck',
    icon: '🚚',
    shareUrl: 'https://fleetweb-nz.cartrack.com/share?vehicle=459011884&account=97050&token=CtdiymYxmNZmgINXD5UDrl3r0hcZDuipTkqbPk87F8gCampj6VG',
  },
]
const STUMP_TYPES   = ['stump', 'stump grinding', 'stump grind']

function isStumpJob(type) {
  return STUMP_TYPES.some(s => (type || '').toLowerCase().includes(s))
}

function nzd(v, decimals = 0) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function cofColor(days) {
  if (days == null) return '#888'
  if (days < 0)  return '#C0392B'
  if (days < 30) return '#D4851A'
  if (days < 60) return '#4A7FA5'
  return '#4A6741'
}

function rucColor(km) {
  if (km == null) return '#888'
  if (km < 0)    return '#C0392B'
  if (km < 500)  return '#D4851A'
  if (km < 2000) return '#4A7FA5'
  return '#4A6741'
}

// ─── Add event to app schedule ───────────────────────────────────────────────
async function addToAppSchedule({ title, description, date, startTime, endTime, resourceId }) {
  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .insert({ title, job_type: 'safety_event', description, status: 'scheduled' })
    .select('id').single()
  if (jobErr) throw jobErr
  const { error: schedErr } = await supabase.from('schedule').insert({
    job_id: job.id, date, start_time: startTime || null, end_time: endTime || null,
    resource_id: resourceId || 'unassigned', status: 'scheduled',
  })
  if (schedErr) throw schedErr
  return job.id
}

// ─── Schedule modal ───────────────────────────────────────────────────────────
const SCHED_RESOURCES = [
  { id:'josh',       label:'Josh Micallef' },
  { id:'isuzu',      label:'Isuzu (whole crew)' },
  { id:'nissan',     label:'Nissan crew' },
  { id:'unassigned', label:'Unassigned' },
]

function AddToScheduleModal({ item, onClose, onSaved }) {
  const [date,      setDate]      = useState(item.suggestedDate ?? '')
  const [startTime, setStartTime] = useState('07:00')
  const [endTime,   setEndTime]   = useState('08:00')
  const [resource,  setResource]  = useState('josh')
  const [saving,    setSaving]    = useState(false)

  async function save() {
    if (!date) return
    setSaving(true)
    try {
      await addToAppSchedule({ title: item.title, description: item.desc, date, startTime, endTime, resourceId: resource })
      onSaved()
    } catch (err) {
      alert('Could not add to schedule: ' + err.message)
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(44,36,22,0.4)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:14, width:380, maxWidth:'95vw', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 18px', borderBottom:'1px solid #eee' }}>
          <span style={{ fontSize:15, fontWeight:800, color:'var(--bark)' }}>Add to Schedule</span>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:'#bbb', cursor:'pointer' }}>✕</button>
        </div>
        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={ms.lbl}>Event</div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--bark)', padding:'8px 10px', background:'#f8f8f6', borderRadius:7, border:'1px solid #eee' }}>{item.title}</div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={ms.lbl}>Date</div>
              <input type="date" style={ms.inp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ flex:1 }}>
              <div style={ms.lbl}>Start time</div>
              <input type="time" style={ms.inp} value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div style={{ flex:1 }}>
              <div style={ms.lbl}>End time</div>
              <input type="time" style={ms.inp} value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <div style={ms.lbl}>Assign to</div>
            <select style={ms.inp} value={resource} onChange={e => setResource(e.target.value)}>
              {SCHED_RESOURCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, padding:'12px 18px', borderTop:'1px solid #eee', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={ms.cancelBtn}>Cancel</button>
          <button onClick={save} disabled={!date || saving}
            style={{ ...ms.saveBtn, opacity: !date || saving ? 0.5 : 1 }}>
            {saving ? 'Adding…' : 'Add to Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ms = {
  lbl:       { fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 },
  inp:       { width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #ddd', fontSize:13, color:'var(--bark)', fontFamily:'var(--font)', boxSizing:'border-box', background:'#fff' },
  saveBtn:   { background:'var(--moss)', color:'#fff', border:'none', borderRadius:7, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)' },
  cancelBtn: { background:'#fff', border:'1px solid #ddd', borderRadius:7, padding:'9px 16px', fontSize:13, color:'#666', cursor:'pointer', fontFamily:'var(--font)' },
}

// ─── Safety actions widget ────────────────────────────────────────────────────
function SafetyActionsWidget({ onNavigate }) {
  const [staffRecs,   setStaffRecs]   = useState([])
  const [companyDocs, setCompanyDocs] = useState([])
  const [safetyLoading, setSafetyLoading] = useState(true)
  const [schedModal,  setSchedModal]  = useState(null) // { title, desc, suggestedDate, jobType }
  const [toast,       setToast]       = useState('')
  const { overdue: checksOverdue, dueSoon: checksDue } = useScheduledChecks()

  function showToastMsg(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + 60)
    const cs = cutoff.toISOString().split('T')[0]
    Promise.all([
      supabase.from('staff_records').select('id,title,staff_name,expiry_date').lte('expiry_date', cs).not('expiry_date', 'is', null),
      supabase.from('company_documents').select('id,title,expiry_date').lte('expiry_date', cs).not('expiry_date', 'is', null),
    ]).then(([sr, cd]) => {
      setStaffRecs(sr.data ?? [])
      setCompanyDocs(cd.data ?? [])
      setSafetyLoading(false)
    })
  }, [])

  const urgCfg = {
    overdue:  { dot:'#C0392B', bg:'#FFF0EE', color:'#C0392B' },
    soon:     { dot:'#D4851A', bg:'#FDF3E3', color:'#D4851A' },
    upcoming: { dot:'#4A7FA5', bg:'#EEF4FA', color:'#4A7FA5' },
  }
  function urg(dateStr) {
    const d = daysUntil(dateStr)
    return d == null ? 'upcoming' : d < 0 ? 'overdue' : d <= 14 ? 'soon' : 'upcoming'
  }
  function dLabel(dateStr) {
    const d = daysUntil(dateStr)
    if (d == null) return ''
    if (d < 0) return `${Math.abs(d)}d overdue`
    if (d === 0) return 'today'
    return `${d}d`
  }

  const items = [
    ...checksOverdue.map(c => ({ id:'c'+c.id, title:c.title, urgency:'overdue',  dueDate:c.next_due, desc:'Scheduled H&S check' })),
    ...checksDue.map(c    => ({ id:'d'+c.id, title:c.title, urgency:'soon',     dueDate:c.next_due, desc:'Scheduled H&S check' })),
    ...staffRecs.map(r    => ({ id:'s'+r.id, title:`${r.staff_name||'Staff'} — ${r.title}`, urgency:urg(r.expiry_date), dueDate:r.expiry_date, desc:'Staff qualification / licence' })),
    ...companyDocs.map(r  => ({ id:'co'+r.id, title:r.title, urgency:urg(r.expiry_date), dueDate:r.expiry_date, desc:'Company document / insurance' })),
  ].sort((a,b) => { const o={overdue:0,soon:1,upcoming:2}; return o[a.urgency]-o[b.urgency] || new Date(a.dueDate)-new Date(b.dueDate) })

  const overdueCount = items.filter(i => i.urgency === 'overdue').length

  // Next Monday 7am for toolbox suggestion
  const nextToolbox = (() => {
    const d = new Date(); const day = d.getDay()
    d.setDate(d.getDate() + (day === 0 ? 1 : day === 1 ? 7 : 8 - day))
    d.setHours(7, 0, 0, 0); return d
  })()

  return (
    <div style={{ background:'#fff', border:`1.5px solid ${overdueCount > 0 ? '#F0C0B8' : '#D8EBD0'}`, borderRadius:12, overflow:'hidden', marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 18px', background: overdueCount > 0 ? '#FFF8F6' : '#F6FAF4', borderBottom:'1px solid #E8EDE4' }}>
        <span style={{ fontSize:18 }}>🦺</span>
        <span style={{ fontSize:14, fontWeight:700, color:'var(--bark)', flex:1 }}>
          Safety Actions
          {items.length > 0 && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, background: overdueCount > 0 ? '#FFF0EE':'#FDF3E3', color: overdueCount > 0 ? '#C0392B':'#D4851A', borderRadius:20, padding:'2px 8px' }}>{items.length} need attention</span>}
        </span>
        <button onClick={() => onNavigate('/safety')} style={{ fontSize:12, color:'var(--moss)', background:'none', border:'1px solid var(--moss)', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontWeight:600, fontFamily:'var(--font)' }}>Safety →</button>
      </div>

      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:7 }}>
        {toast && (
          <div style={{ background:'#E8F0E6', color:'#4A6741', fontSize:13, fontWeight:600, padding:'8px 12px', borderRadius:8, border:'1px solid #C8D8C0' }}>
            ✓ {toast}
          </div>
        )}
        {safetyLoading ? (
          <div style={{ color:'#bbb', fontSize:13, padding:'8px 0' }}>Loading safety data…</div>
        ) : items.length === 0 ? (
          <div style={{ color:'#4A6741', fontSize:13, padding:'8px 0', display:'flex', alignItems:'center', gap:8 }}>
            <span>✓</span><span>All clear — no outstanding safety actions</span>
          </div>
        ) : items.map(item => {
          const u = urgCfg[item.urgency]
          const suggestedDate = item.dueDate
            ? new Date(new Date(item.dueDate).getTime() - 14*86400000).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0]
          return (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:u.bg, borderRadius:8, border:`1px solid ${u.color}30` }}>
              <span style={{ width:8, height:8, borderRadius:'50%', background:u.dot, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--bark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.title}</div>
                <div style={{ fontSize:11, color:'#888', marginTop:1 }}>{item.desc}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:u.color, flexShrink:0 }}>{dLabel(item.dueDate)}</span>
              <button
                onClick={() => setSchedModal({ title: item.title, desc: item.desc, suggestedDate })}
                style={{ fontSize:11, background:'#fff', border:'1px solid #ddd', borderRadius:6, padding:'4px 9px', cursor:'pointer', flexShrink:0, fontFamily:'var(--font)', color:'#555', whiteSpace:'nowrap' }}>
                📅 Add
              </button>
            </div>
          )
        })}

        {/* Toolbox meeting row — always shown */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#F0F5EE', borderRadius:8, border:'1px solid #C8D8C0', marginTop: items.length > 0 ? 4 : 0 }}>
          <span style={{ fontSize:16, flexShrink:0 }}>🧰</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--bark)' }}>Schedule Toolbox Meeting</div>
            <div style={{ fontSize:11, color:'#777', marginTop:1 }}>
              Monthly H&S briefing — SWMS review, hazard debrief &amp; crew sign-off
              <span style={{ marginLeft:6, color:'#4A6741', fontWeight:600 }}>Suggested: {nextToolbox.toLocaleDateString('en-NZ',{weekday:'short',day:'numeric',month:'short'})}</span>
            </div>
          </div>
          <button
            onClick={() => setSchedModal({
              title: 'Toolbox Meeting — Monthly H&S Briefing',
              desc:  'Monthly H&S briefing: site hazard debrief, SWMS/SOP review, PPE check, near-miss review, crew sign-off.',
              suggestedDate: nextToolbox.toISOString().split('T')[0],
            })}
            style={{ fontSize:11, color:'#4A6741', background:'#fff', border:'1px solid #4A6741', borderRadius:6, padding:'4px 9px', cursor:'pointer', flexShrink:0, fontFamily:'var(--font)', fontWeight:600, whiteSpace:'nowrap' }}>
            📅 Schedule
          </button>
        </div>
      </div>

      {schedModal && (
        <AddToScheduleModal
          item={schedModal}
          onClose={() => setSchedModal(null)}
          onSaved={() => {
            setSchedModal(null)
            showToastMsg('Added to schedule — check your calendar')
          }}
        />
      )}
    </div>
  )
}

// ─── Mini bar chart ──────────────────────────────────────────────────────────
function MiniBar({ months }) {
  if (!months.length) return null
  const max = Math.max(...months.map(m => m.revenue), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '64px' }}>
      {months.map((m, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '100%',
            height: `${Math.max(4, (m.revenue / max) * 56)}px`,
            background: i === months.length - 1 ? 'var(--moss)' : 'var(--border)',
            borderRadius: '3px 3px 0 0',
            transition: 'height 0.4s',
          }} />
          <span style={{ fontSize: '9px', color: '#aaa', textAlign: 'center' }}>{m.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: '10px',
      padding: '20px 22px',
      cursor: onClick ? 'pointer' : 'default',
      flex: 1,
      minWidth: '160px',
    }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: '700', color: color || 'var(--bark)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#aaa', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

// ─── Section heading ─────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <div style={{ fontSize: '12px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>{title}</div>
      {children}
    </div>
  )
}

export default function Dashboard() {
  const nav = useNavigate()
  const [quotes,   setQuotes]   = useState([])
  const [jobs,     setJobs]     = useState([])
  const [vehicles, setVehicles] = useState([])
  const [xeroPnl,  setXeroPnl]  = useState(null)   // { revenue, expenses, netProfit, months, source }
  const [editVeh,  setEditVeh]  = useState(null)
  const [savingVeh, setSavingVeh] = useState(false)
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)

    const [qRes, jRes, vRes] = await Promise.all([
      supabase.from('quotes').select('id, status, subtotal, total, created_at, jobs(job_type)'),
      supabase.from('jobs').select('id, status, job_type, created_at'),
      supabase.from('vehicles').select('*').eq('active', true).order('name'),
    ])
    if (qRes.data) setQuotes(qRes.data)
    if (jRes.data) setJobs(jRes.data)
    if (vRes.data) setVehicles(vRes.data)

    // Try to load Xero P&L — silently skip if not connected
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-pnl`,
        { headers: { Authorization: `Bearer ${session?.access_token}` } }
      )
      const body = await res.json()
      if (res.ok && body.revenue != null) setXeroPnl(body)
    } catch { /* Xero not set up */ }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Revenue calcs — Xero P&L if connected, else accepted quotes ──────────
  const REVENUE_STATUSES = ['accepted', 'complete', 'invoiced']
  const treeQuotes   = quotes.filter(q => !isStumpJob(q.jobs?.job_type))
  const acceptedTree = treeQuotes.filter(q => REVENUE_STATUSES.includes(q.status))
  const quotesTreeRevenue = acceptedTree.reduce((s, q) => s + (Number(q.subtotal) || 0), 0)

  const stumpQuotes  = quotes.filter(q => isStumpJob(q.jobs?.job_type))
  const stumpRevenue = stumpQuotes.filter(q => REVENUE_STATUSES.includes(q.status))
    .reduce((s, q) => s + (Number(q.subtotal) || 0), 0)

  // Use Xero if available
  const usingXero   = !!xeroPnl
  const treeRevenue = usingXero ? xeroPnl.revenue : quotesTreeRevenue
  const crewDays    = treeRevenue / CREW_DAY_RATE
  const monthlyData = usingXero
    ? xeroPnl.months
    : (() => {
        const now = new Date()
        return Array.from({ length: 6 }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
          const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
          const label = d.toLocaleString('en-NZ', { month: 'short' })
          const revenue = acceptedTree
            .filter(q => { const c = new Date(q.created_at); return c >= d && c < next })
            .reduce((s, q) => s + (Number(q.subtotal) || 0), 0)
          return { label, revenue }
        })
      })()

  // ── Quote success rate ───────────────────────────────────────────────────
  const sent        = quotes.filter(q => ['sent', 'viewed', 'accepted', 'declined', 'complete', 'invoiced'].includes(q.status))
  const accepted    = quotes.filter(q => REVENUE_STATUSES.includes(q.status))
  const successRate = sent.length ? Math.round((accepted.length / sent.length) * 100) : null

  // ── Pipeline snapshot ────────────────────────────────────────────────────
  const newJobs     = jobs.filter(j => j.status === 'new_lead').length
  const toSchedule  = jobs.filter(j => j.status === 'accepted_to_schedule').length
  const totalActive = jobs.filter(j => !['completed', 'cancelled', 'declined'].includes(j.status)).length

  // ── Advertising suggestion ────────────────────────────────────────────────
  const advice = (() => {
    if (crewDays >= 15) return null  // booked out 3 weeks — no action needed
    if (crewDays < 5) return {
      level: 'urgent',
      icon: '📢',
      text: `Pipeline thin — only ${crewDays.toFixed(1)} crew days booked. Push advertising now to fill the schedule.`,
      color: '#C0392B', bg: '#FFF0EE',
    }
    if (crewDays < 10) return {
      level: 'warn',
      icon: '📣',
      text: `${crewDays.toFixed(1)} crew days booked. Consider a social post or letterbox drop to top up work for the coming fortnight.`,
      color: '#D4851A', bg: '#FDF3E3',
    }
    return {
      level: 'ok',
      icon: '✅',
      text: `${crewDays.toFixed(1)} crew days booked. Pipeline healthy — no advertising urgency.`,
      color: '#4A6741', bg: '#F0F7EE',
    }
  })()

  // ── Vehicle save ─────────────────────────────────────────────────────────
  async function saveVehicle(v) {
    setSavingVeh(true)
    await supabase.from('vehicles').update({
      plate: v.plate,
      cof_due: v.cof_due || null,
      ruc_km_remaining: v.ruc_km_remaining ? Number(v.ruc_km_remaining) : null,
      notes: v.notes,
    }).eq('id', v.id)
    setSavingVeh(false)
    setEditVeh(null)
    load()
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#aaa', fontSize: '14px' }}>
      Loading dashboard…
    </div>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--bark)', margin: 0 }}>Business Health</h1>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '3px' }}>
            {new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <button onClick={load} style={{ fontSize: '12px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer' }}>↻ Refresh</button>
      </div>

      {/* Advertising suggestion banner */}
      {advice && (
        <div style={{
          background: advice.bg, color: advice.color,
          border: `1px solid ${advice.color}44`,
          borderRadius: '10px', padding: '14px 18px',
          marginBottom: '24px', fontSize: '13px', fontWeight: '500',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span style={{ fontSize: '18px' }}>{advice.icon}</span>
          <span>{advice.text}</span>
        </div>
      )}

      {/* ── KPI row ── */}
      <Section title={`Revenue snapshot${usingXero ? ' — from Xero' : ' — from accepted quotes'}`}>
        {usingXero && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <StatCard label="Total revenue (FY)" value={nzd(xeroPnl.revenue)} sub="This financial year · Xero" color="var(--moss)" />
            <StatCard label="Total expenses (FY)" value={nzd(xeroPnl.expenses)} sub="This financial year · Xero" color="#D4851A" />
            <StatCard label="Net profit (FY)" value={nzd(xeroPnl.netProfit)} sub="Revenue minus expenses · Xero"
              color={xeroPnl.netProfit >= 0 ? 'var(--moss)' : '#C0392B'} />
          </div>
        )}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <StatCard
            label="Crew days booked"
            value={crewDays.toFixed(1)}
            sub={`${nzd(treeRevenue)} revenue ÷ $2,500/day`}
            color={crewDays < 5 ? '#C0392B' : crewDays < 10 ? '#D4851A' : 'var(--moss)'}
            onClick={() => nav('/quotes')}
          />
          <StatCard
            label="Quote success rate"
            value={successRate != null ? `${successRate}%` : '—'}
            sub={`${accepted.length} accepted of ${sent.length} sent`}
            color={successRate != null && successRate < 40 ? '#D4851A' : 'var(--bark)'}
            onClick={() => nav('/quotes')}
          />
          {!usingXero && (
            <StatCard
              label="Tree work revenue"
              value={nzd(treeRevenue)}
              sub="Accepted quotes (ex GST)"
              onClick={() => nav('/quotes')}
            />
          )}
          {!usingXero && (
            <StatCard
              label="Stump grinding"
              value={nzd(stumpRevenue)}
              sub="Accepted quotes (ex GST)"
            />
          )}
          <StatCard
            label="Active jobs"
            value={totalActive}
            sub={`${newJobs} new leads · ${toSchedule} to schedule`}
            onClick={() => nav('/pipeline')}
          />
        </div>

      </Section>

      {/* Safety actions */}
      <SafetyActionsWidget onNavigate={nav} />

      <Section title="Revenue">
        {/* Monthly trend */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 22px' }}>
          <div style={{ fontSize: '12px', color: '#aaa', fontWeight: '600', marginBottom: '12px' }}>
            {usingXero ? 'Monthly revenue — Xero P&L (this financial year)' : 'Tree work — monthly revenue (last 6 months, accepted quotes)'}
          </div>
          <MiniBar months={monthlyData} />
          {!usingXero && (
            <div style={{ marginTop: '12px', fontSize: '11px', color: '#bbb', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>💼</span>
              <span>Connect Xero in <button onClick={() => nav('/settings')} style={{ background: 'none', border: 'none', color: '#4A7FA5', fontSize: '11px', cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'var(--font)' }}>Settings → Integrations</button> to pull live P&L data instead.</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Coming soon integrations ── */}
      <Section title="Integrations">
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { name: 'Xero', desc: 'Invoices, P&L, cash position', icon: '💼', color: '#0082C3' },
            { name: 'Google Analytics', desc: 'Website traffic & lead sources', icon: '📈', color: '#E37400' },
          ].map(it => (
            <div key={it.name} style={{
              flex: 1, minWidth: '200px', background: '#fff',
              border: '1px solid var(--border)', borderRadius: '10px',
              padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'center',
              opacity: 0.6,
            }}>
              <span style={{ fontSize: '24px' }}>{it.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--bark)' }}>{it.name}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '2px' }}>{it.desc}</div>
                <div style={{ fontSize: '10px', color: it.color, fontWeight: '600', marginTop: '4px' }}>Coming soon</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Fleet ── */}
      <Section title="Fleet — COF & RUC">
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', minWidth: '560px' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                {['Vehicle', 'Plate', 'COF Due', 'RUC Remaining', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '20px', color: '#aaa', textAlign: 'center', fontSize: '13px' }}>
                  No vehicles yet — run the SQL in Supabase to seed your fleet.
                </td></tr>
              )}
              {vehicles.map(v => {
                const isEditing = editVeh?.id === v.id
                const ev = isEditing ? editVeh : v
                const cofDays = daysUntil(ev.cof_due)

                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '600', color: 'var(--bark)' }}>{v.name}</td>

                    <td style={{ padding: '12px 14px' }}>
                      {isEditing
                        ? <input value={ev.plate || ''} onChange={e => setEditVeh({ ...ev, plate: e.target.value })}
                            style={styles.cell_input} placeholder="ABC123" />
                        : <span style={{ color: ev.plate ? 'var(--bark)' : '#ccc' }}>{ev.plate || '—'}</span>
                      }
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {isEditing
                        ? <input type="date" value={ev.cof_due || ''} onChange={e => setEditVeh({ ...ev, cof_due: e.target.value })}
                            style={styles.cell_input} />
                        : ev.cof_due
                          ? <span style={{ fontWeight: '600', color: cofColor(cofDays) }}>
                              {new Date(ev.cof_due).toLocaleDateString('en-NZ')}
                              {cofDays != null && <span style={{ fontSize: '11px', marginLeft: '6px', opacity: 0.8 }}>
                                {cofDays < 0 ? `(${Math.abs(cofDays)}d overdue)` : `(${cofDays}d)`}
                              </span>}
                            </span>
                          : <span style={{ color: '#ccc' }}>—</span>
                      }
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {isEditing
                        ? <input type="number" value={ev.ruc_km_remaining ?? ''} onChange={e => setEditVeh({ ...ev, ruc_km_remaining: e.target.value })}
                            style={styles.cell_input} placeholder="km" />
                        : ev.ruc_km_remaining != null
                          ? <span style={{ fontWeight: '600', color: rucColor(ev.ruc_km_remaining) }}>
                              {Number(ev.ruc_km_remaining).toLocaleString()} km
                            </span>
                          : <span style={{ color: '#ccc' }}>—</span>
                      }
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      {isEditing
                        ? <input value={ev.notes || ''} onChange={e => setEditVeh({ ...ev, notes: e.target.value })}
                            style={{ ...styles.cell_input, width: '180px' }} placeholder="Notes…" />
                        : <span style={{ color: '#888', fontSize: '12px' }}>{ev.notes || ''}</span>
                      }
                    </td>

                    <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => saveVehicle(ev)} disabled={savingVeh}
                            style={styles.btn_save}>Save</button>
                          <button onClick={() => setEditVeh(null)}
                            style={styles.btn_cancel}>Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setEditVeh({ ...v })}
                          style={styles.btn_edit}>Edit</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: '#bbb', marginTop: '8px' }}>
          COF = Certificate of Fitness &nbsp;·&nbsp; RUC = Road User Charges &nbsp;·&nbsp; Red = overdue/critical, Orange = due soon
        </div>
      </Section>

      {/* ── Cartrack GPS ── */}
      <Section title="Fleet tracking — live GPS">
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--bark)' }}>GWL756 · WA2244 — refreshes every 30s</span>
            <a href="https://fleetweb-nz.cartrack.com/map/fleet" target="_blank" rel="noreferrer"
              style={{ fontSize: '12px', color: 'var(--moss)', fontWeight: '600', textDecoration: 'none', border: '1px solid var(--moss)', borderRadius: '5px', padding: '4px 10px' }}>
              Open Cartrack ↗
            </a>
          </div>
          <CartrackMap />
        </div>
      </Section>

    </div>
  )
}

const styles = {
  cell_input: {
    border: '1px solid var(--border)',
    borderRadius: '5px',
    padding: '5px 8px',
    fontSize: '13px',
    width: '110px',
    outline: 'none',
  },
  btn_save: {
    background: 'var(--moss)',
    color: '#fff',
    border: 'none',
    borderRadius: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btn_cancel: {
    background: 'none',
    color: '#aaa',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  btn_edit: {
    background: 'none',
    color: 'var(--moss)',
    border: '1px solid var(--moss)',
    borderRadius: '5px',
    padding: '4px 10px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  btn_primary: {
    background: 'var(--moss)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    padding: '9px 18px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
  },
}
