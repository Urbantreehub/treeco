import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { jobCategory } from '../config/statuses'

// Private-lead intake + conversion tracker.
//
// Answers "are my private (website / email) leads turning into work?" entirely
// from our own data — a lead IS a job (status starts at 'new_lead'), so a lead
// "converts" when that same job advances into a won status. No third-party
// analytics needed.
//
// Scope: only category === 'residential' (our "Private" work). Spencers/Downer
// are assigned portal jobs, not leads we win or lose, so they're excluded here.
//
// Lead source: we surface only what the system captures today —
//   'self_booking' → Website form  (supabase/functions/book-quote)
//   'email'        → Email          (supabase/functions/inbound-lead)
//   anything else / NULL → Other (not recorded)   — manual & imported jobs
// A source picker on manual create would move those out of "Other" later.

// Status → funnel bucket. Won = client accepted and it's moving toward invoicing.
const WON_STATUSES  = ['accepted_to_schedule', 'scheduled', 'stump_grinding', 'complete_to_invoice', 'invoiced']
const LOST_STATUSES = ['declined']
// Everything else (new_lead, quote_scheduled, quote_sent, on_hold) is still open.

const SOURCES = [
  { key: 'self_booking', label: 'Website form',        icon: '🌐', color: '#4A7FA5' },
  { key: 'email',        label: 'Email',               icon: '✉️', color: '#8B6238' },
  { key: 'other',        label: 'Other (not recorded)', icon: '•',  color: '#9AA0A6' },
]

function sourceKey(leadSource) {
  if (leadSource === 'self_booking') return 'self_booking'
  if (leadSource === 'email')        return 'email'
  return 'other'
}

// Time windows. Returns the inclusive start (Date) for the selected range, or
// null for "all time". Weeks start Monday (NZ convention).
const RANGES = [
  { key: 'week',   label: 'This week' },
  { key: 'month',  label: 'This month' },
  { key: 'd30',    label: 'Last 30 days' },
  { key: 'year',   label: 'This year' },
  { key: 'all',    label: 'All time' },
]

function rangeStart(key) {
  const now = new Date()
  if (key === 'week') {
    const d = new Date(now)
    const dow = (d.getDay() + 6) % 7           // 0 = Monday
    d.setDate(d.getDate() - dow)
    d.setHours(0, 0, 0, 0)
    return d
  }
  if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  if (key === 'd30')   return new Date(now.getTime() - 30 * 86400000)
  if (key === 'year')  return new Date(now.getFullYear(), 0, 1)
  return null
}

function nzd0(v) {
  if (!v) return '$0'
  return '$' + Number(v).toLocaleString('en-NZ', { maximumFractionDigits: 0 })
}

export default function LeadsConversions() {
  const navigate = useNavigate()
  const [jobs, setJobs]   = useState([])
  const [range, setRange] = useState('month')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    const refresh = () => {
      supabase.from('jobs')
        .select('id, status, category, lead_source, estimated_value, created_at, ko_reference, title, clients(name)')
        .then(({ data, error }) => {
          if (!active) return
          if (error) { setLoaded(true); return }   // column missing / RLS — degrade to empty
          setJobs(data ?? [])
          setLoaded(true)
        })
    }
    refresh()
    const ch = supabase.channel('dash-leads-conv')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, refresh)
      .subscribe()
    return () => { active = false; supabase.removeChannel(ch) }
  }, [])

  const view = useMemo(() => {
    const start = rangeStart(range)
    // Private leads created within the selected window.
    const inWindow = jobs.filter(j => {
      if (jobCategory(j) !== 'residential') return false
      if (!start) return true
      return new Date(j.created_at) >= start
    })

    const blank = () => ({ total: 0, won: 0, lost: 0, open: 0, wonValue: 0 })
    const bySource = { self_booking: blank(), email: blank(), other: blank() }
    const overall = blank()

    for (const j of inWindow) {
      const bucket = WON_STATUSES.includes(j.status) ? 'won'
                   : LOST_STATUSES.includes(j.status) ? 'lost' : 'open'
      const sk = sourceKey(j.lead_source)
      const s = bySource[sk]
      s.total++; s[bucket]++
      overall.total++; overall[bucket]++
      if (bucket === 'won') {
        const v = Number(j.estimated_value) || 0
        s.wonValue += v; overall.wonValue += v
      }
    }
    return { bySource, overall }
  }, [jobs, range])

  // Close rate = won of decided (won + lost). Open leads aren't counted against
  // it — a lead that hasn't been quoted yet isn't a loss.
  const closeRate = (b) => {
    const decided = b.won + b.lost
    return decided ? Math.round((b.won / decided) * 100) : null
  }

  const o = view.overall
  const rangeLabel = RANGES.find(r => r.key === range)?.label.toLowerCase()

  return (
    <div style={s.panel}>
      <div style={s.head}>
        <div>
          <div style={s.title}>Private leads &amp; conversion</div>
          <div style={s.sub}>Website &amp; email enquiries → won work</div>
        </div>
        <div style={s.chips}>
          {RANGES.map(r => {
            const on = range === r.key
            return (
              <button key={r.key} onClick={() => setRange(r.key)}
                style={{ ...s.chip, ...(on ? s.chipOn : null) }}>
                {r.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Headline */}
      <div style={s.headline}>
        <div style={s.bigNum}>{o.total}</div>
        <div style={s.bigMeta}>
          <div style={s.bigMetaTop}>
            {o.total === 1 ? 'private lead' : 'private leads'} {rangeLabel}
          </div>
          <div style={s.bigMetaBot}>
            <b style={{ color: '#4A6741' }}>{o.won} won</b>
            {o.wonValue > 0 && <span style={{ color: '#4A6741' }}> · {nzd0(o.wonValue)}</span>}
            <span style={{ color: 'var(--ink-3)' }}> · {o.open} open · {o.lost} lost</span>
          </div>
        </div>
        {closeRate(o) != null && (
          <div style={s.rate}>
            <div style={s.rateNum}>{closeRate(o)}%</div>
            <div style={s.rateLbl}>close rate</div>
          </div>
        )}
      </div>

      {/* Per-source breakdown */}
      <div style={s.rows}>
        {SOURCES.map(src => {
          const b = view.bySource[src.key]
          const rate = closeRate(b)
          return (
            <div key={src.key} style={s.row}>
              <span style={{ ...s.srcIcon, color: src.color }}>{src.icon}</span>
              <div style={s.srcName}>
                <div style={s.srcLabel}>{src.label}</div>
                <div style={s.srcFunnel}>
                  {b.total} in
                  {b.total > 0 && (
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}· {b.won} won · {b.open} open · {b.lost} lost
                    </span>
                  )}
                </div>
              </div>
              <div style={s.srcRight}>
                {b.wonValue > 0 && <div style={s.srcVal}>{nzd0(b.wonValue)}</div>}
                <div style={s.srcRate}>{rate != null ? `${rate}%` : '—'}</div>
              </div>
            </div>
          )
        })}
      </div>

      {!loaded && <div style={s.loading}>Loading leads…</div>}

      <div style={s.footer}>
        <span style={s.footNote}>
          “Other” = phone &amp; walk-in leads entered by hand — not yet source-tagged.
        </span>
        <button onClick={() => navigate('/pipeline')} style={s.link}>Open Pipeline →</button>
      </div>
    </div>
  )
}

const s = {
  panel:   { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius, 12px)', padding: '16px 18px', marginBottom: '24px' },
  head:    { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 },
  title:   { fontSize: '13px', fontWeight: 700, color: 'var(--ink)' },
  sub:     { fontSize: '11px', color: 'var(--ink-3)', marginTop: 2 },
  chips:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  chip:    { fontSize: '11.5px', fontWeight: 700, fontFamily: 'var(--font)', cursor: 'pointer', padding: '5px 10px', borderRadius: 'var(--radius-pill, 20px)', border: '1px solid var(--border)', background: '#fff', color: 'var(--ink-2)' },
  chipOn:  { border: '1px solid var(--terra)', background: 'var(--terra)', color: '#fff' },

  headline:   { display: 'flex', alignItems: 'center', gap: 14, padding: '4px 2px 14px', borderBottom: '1px solid var(--border)', marginBottom: 12 },
  bigNum:     { fontSize: '34px', fontWeight: 800, color: 'var(--ink)', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
  bigMeta:    { flex: 1, minWidth: 0 },
  bigMetaTop: { fontSize: '13px', fontWeight: 700, color: 'var(--ink)' },
  bigMetaBot: { fontSize: '12px', marginTop: 2 },
  rate:       { textAlign: 'center', flexShrink: 0 },
  rateNum:    { fontSize: '22px', fontWeight: 800, color: 'var(--moss)', lineHeight: 1 },
  rateLbl:    { fontSize: '10px', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 3 },

  rows:     { display: 'flex', flexDirection: 'column', gap: 8 },
  row:      { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: '#FAFAF7', borderRadius: 9, border: '1px solid var(--border)' },
  srcIcon:  { fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 },
  srcName:  { flex: 1, minWidth: 0 },
  srcLabel: { fontSize: 13, fontWeight: 700, color: 'var(--ink)' },
  srcFunnel:{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 1 },
  srcRight: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  srcVal:   { fontSize: 12, fontWeight: 700, color: '#4A6741' },
  srcRate:  { fontSize: 15, fontWeight: 800, color: 'var(--ink)', minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' },

  loading:  { fontSize: 12, color: 'var(--ink-3)', padding: '8px 2px 0' },
  footer:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  footNote: { fontSize: 10.5, color: 'var(--ink-3)' },
  link:     { fontSize: '12px', color: '#4A7FA5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'var(--font)' },
}
