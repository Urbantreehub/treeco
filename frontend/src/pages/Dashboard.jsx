import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import CartrackMap from '../components/CartrackMap'

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
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
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
