import { useState, useMemo, useRef, useEffect } from 'react'
import { JOB_STATUSES, STATUS_ORDER, SIDE_STATUSES, jobCategory, JOB_CATEGORIES } from '../config/statuses'
import { jobHeading, koCode, kpiCountdown, displayCase } from '../utils/jobDisplay'
import { primaryQuote, quoteTotal, nzd } from '../utils/quotes'
import { followUpBucket } from '../utils/quoteStatus'
import { useJobs } from '../hooks/useJobs'
import { useOpenAlerts } from '../hooks/useOpenAlerts'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import JobDetailPanel from '../components/JobDetailPanel'
import NewJobModal from '../components/NewJobModal'

// The Quotes list (route stays /pipeline so deep links keep working): every
// job as one row, grouped under a coloured eyebrow per status, sorted by what
// needs you first. Status is changed inside the record, not from the row.

const GROUPS = [
  { key: 'new_lead',             label: 'New leads' },
  { key: 'quote_scheduled',      label: 'Visit booked' },
  { key: 'accepted_to_schedule', label: 'Accepted · to schedule' },
  { key: 'quote_sent',           label: 'Sent · follow up' },
  { key: 'scheduled',            label: 'Scheduled' },
  { key: 'stump_grinding',       label: 'Stump grinding' },
  { key: 'complete_to_invoice',  label: 'Done · to invoice' },
  { key: 'invoiced',             label: 'Invoiced' },
  { key: 'on_hold',              label: 'On hold' },
  { key: 'declined',             label: 'Declined' },
]

const CHIPS = [
  { key: 'needs',   label: 'Needs me' },
  { key: 'active',  label: 'Active' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'done',    label: 'Done' },
]

const DONE_STATUSES = new Set(['invoiced', 'declined'])
const BUCKET_RANK = { question: 0, final: 1, chase: 2, unopened: 3 }

// Does this job need a person right now? (The default "Needs me" chip.)
function needsMe(job, hasQuestion) {
  const q = primaryQuote(job)
  switch (job.status) {
    case 'new_lead':
    case 'accepted_to_schedule':
    case 'complete_to_invoice':
      return true
    case 'quote_scheduled':
      return !q
    case 'quote_sent':
      return hasQuestion || followUpBucket(q) != null
    default:
      return false
  }
}

function chipMatches(chip, job, hasQuestion) {
  if (chip === 'needs')   return needsMe(job, hasQuestion)
  if (chip === 'active')  return !DONE_STATUSES.has(job.status) && job.status !== 'on_hold'
  if (chip === 'waiting') return job.status === 'on_hold'
  if (chip === 'done')    return DONE_STATUSES.has(job.status)
  return true
}

// Time in the current status, short: "2h ago", "Yesterday", "6 days".
function ageLabel(job) {
  const since = job.status_changed_at || job.created_at
  if (!since) return null
  const ms = Date.now() - new Date(since).getTime()
  if (ms < 0) return null
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 60) return `${d} days`
  return `${Math.floor(d / 30)} mo`
}
function ageDays(job) {
  const since = job.status_changed_at || job.created_at
  return since ? (Date.now() - new Date(since).getTime()) / 86400000 : 0
}

// Third part of the subtitle — the thing worth knowing at a glance.
function hint(job, hasQuestion) {
  const q = primaryQuote(job)
  if (job.status === 'quote_sent') {
    if (hasQuestion) return 'asked a question'
    if ((q?.opened_count ?? 0) > 0) return `opened ×${q.opened_count}`
    const b = followUpBucket(q)
    if (b === 'unopened') return 'not opened yet'
    if (b === 'chase') return 'follow up'
    if (b === 'final') return 'final nudge'
    return null
  }
  if (job.status === 'new_lead' && job.lead_source) return `via ${String(job.lead_source).toLowerCase()}`
  if (hasQuestion) return 'needs actioning'
  return null
}

function sortRows(status, rows, alertJobIds) {
  if (status === 'quote_sent') {
    const rank = j => {
      if (alertJobIds.has(j.id)) return BUCKET_RANK.question
      const b = followUpBucket(primaryQuote(j))
      return b ? BUCKET_RANK[b] : 9
    }
    return [...rows].sort((a, b) => rank(a) - rank(b) || ageDays(b) - ageDays(a))
  }
  // Everything else: newest in status first.
  return [...rows].sort((a, b) => ageDays(a) - ageDays(b))
}

export default function Pipeline() {
  const { jobs, loading, fetchJobs } = useJobs()
  const { isStaff } = useAuth()
  const { jobIds: alertJobIds } = useOpenAlerts(isStaff)
  const isMobile = useIsMobile()
  // Deep-link support: /pipeline?job=<id> (e.g. opened from the calendar) auto-opens that job.
  const [selectedJobId, setSelectedJobId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  const selectedJob = useMemo(() => jobs.find(j => j.id === selectedJobId) ?? null, [jobs, selectedJobId])
  const [showNewJob, setShowNewJob] = useState(false)
  const [textFilter, setTextFilter] = useState('')
  const [chip, setChip] = useState('needs')
  const [categories, setCategories] = useState(new Set()) // 'spencers' | 'downer'
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    if (!showFilterMenu) return
    function handler(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilterMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterMenu])

  // Search + category narrow the pool the chips count over.
  const pool = useMemo(() => {
    const q = textFilter.trim().toLowerCase()
    return jobs.filter(j => {
      if (categories.size > 0 && !categories.has(jobCategory(j))) return false
      if (!q) return true
      return (
        j.clients?.name?.toLowerCase().includes(q) ||
        j.title?.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        j.job_type?.toLowerCase().includes(q) ||
        j.ko_reference?.toLowerCase().includes(q) ||
        j.clients?.phone?.replace(/\s/g, '').includes(q.replace(/\s/g, ''))
      )
    })
  }, [jobs, textFilter, categories])

  const chipCounts = useMemo(() => {
    const c = {}
    for (const { key } of CHIPS) c[key] = pool.filter(j => chipMatches(key, j, alertJobIds.has(j.id))).length
    return c
  }, [pool, alertJobIds])

  const statusActive = statusFilter.size > 0
  const filtered = useMemo(() => pool.filter(j => (
    statusActive ? statusFilter.has(j.status) : (!chip || chipMatches(chip, j, alertJobIds.has(j.id)))
  )), [pool, statusActive, statusFilter, chip, alertJobIds])

  const groups = useMemo(() => GROUPS
    .map(g => ({ ...g, rows: sortRows(g.key, filtered.filter(j => j.status === g.key), alertJobIds) }))
    .filter(g => g.rows.length > 0), [filtered, alertJobIds])

  function pickChip(key) {
    setChip(key)
    setStatusFilter(new Set())
  }
  function toggleStatus(key) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function toggleCategory(key) {
    setCategories(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function closePanel() {
    setSelectedJobId(null)
    // Strip the ?job= deep-link param so a refresh doesn't reopen the panel.
    if (new URLSearchParams(window.location.search).has('job')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }

  const anyFilter = textFilter || statusActive || categories.size > 0

  return (
    <div style={s.page}>
      <div style={{ ...s.toolbar, ...(isMobile ? s.toolbarMobile : {}) }}>
        <div style={s.titleRow}>
          <h1 style={{ ...s.title, ...(isMobile ? { fontSize: 28 } : {}) }}>Quotes</h1>
          <span style={s.countBadge}>{filtered.length}</span>
          {isStaff && (
            <button onClick={() => setShowNewJob(true)} style={s.newBtn}>+ New</button>
          )}
        </div>

        <div style={s.searchWrap}>
          <svg style={s.searchIcon} viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            placeholder="Search name, address, KO ref…"
            value={textFilter}
            onChange={e => setTextFilter(e.target.value)}
            style={s.searchInput}
            aria-label="Search quotes"
          />
          {textFilter && (
            <button onClick={() => setTextFilter('')} style={s.clearBtn} aria-label="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          )}
        </div>

        <div style={s.chipRow}>
          {CHIPS.map(c => {
            const on = !statusActive && chip === c.key
            return (
              <button key={c.key} onClick={() => pickChip(c.key)} aria-pressed={on}
                style={{ ...s.chip, ...(on ? s.chipOn : {}) }}>
                {c.label}{chipCounts[c.key] > 0 && <span style={{ opacity: on ? 0.8 : 0.6 }}> · {chipCounts[c.key]}</span>}
              </button>
            )
          })}
          <span style={{ flex: 1 }} />
          {['spencers', 'downer'].map(key => {
            const meta = JOB_CATEGORIES[key]
            const on = categories.has(key)
            return (
              <button key={key} onClick={() => toggleCategory(key)} aria-pressed={on}
                style={{ ...s.chip, color: on ? '#fff' : meta.color, borderColor: meta.color, background: on ? meta.color : '#fff' }}>
                {meta.label}
              </button>
            )
          })}

          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              aria-expanded={showFilterMenu}
              style={{ ...s.chip, ...(statusActive ? s.chipOn : {}), gap: 5 }}
            >
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Filter{statusActive && ` · ${statusFilter.size}`}
            </button>

            {showFilterMenu && (
              <div style={s.filterMenu} role="dialog" aria-label="Filter by status">
                <div style={s.filterMenuHeader}>
                  <span style={s.filterMenuTitle}>Status</span>
                  {statusActive && (
                    <button onClick={() => setStatusFilter(new Set())} style={s.clearAllBtn}>Clear</button>
                  )}
                </div>
                {[...STATUS_ORDER, ...SIDE_STATUSES].map(key => {
                  const st = JOB_STATUSES[key]
                  const checked = statusFilter.has(key)
                  const count = pool.filter(j => j.status === key).length
                  return (
                    <label key={key} style={s.filterItem}>
                      <input type="checkbox" checked={checked} onChange={() => toggleStatus(key)} style={{ display: 'none' }}/>
                      <span style={{ ...s.filterCheck, background: checked ? st.color : '#fff', borderColor: checked ? st.color : 'var(--line)' }}>
                        {checked && <svg viewBox="0 0 12 10" width="10" height="10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>}
                      </span>
                      <span style={{ ...s.filterDot, background: st.color }}/>
                      <span style={s.filterLabel}>{st.label}</span>
                      <span style={{ ...s.filterCountBadge, color: st.color, background: st.color + '20' }}>{count}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ ...s.body, ...(isMobile ? s.bodyMobile : {}) }}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : groups.length === 0 ? (
          <div style={s.empty}>
            {anyFilter ? 'No quotes match.' : chip === 'needs' ? 'Nothing needs you right now.' : 'No quotes yet.'}
          </div>
        ) : (
          <div style={s.groups}>
            {groups.map(g => {
              const st = JOB_STATUSES[g.key]
              return (
                <section key={g.key} style={s.group} aria-label={g.label}>
                  <div style={{ ...s.eyebrow, color: st.color }}>{g.label} · {g.rows.length}</div>
                  <div style={s.groupCard}>
                    {g.rows.map((job, i) => (
                      <QuoteRow
                        key={job.id}
                        job={job}
                        status={st}
                        last={i === g.rows.length - 1}
                        isMobile={isMobile}
                        hasAlert={alertJobIds.has(job.id)}
                        selected={job.id === selectedJobId}
                        onOpen={() => setSelectedJobId(job.id)}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
            <div style={s.footNote}>Sorted by what needs you first</div>
          </div>
        )}
      </div>

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={closePanel}
          onUpdated={() => { fetchJobs(); closePanel() }}
          onFieldSaved={() => fetchJobs()}
        />
      )}

      {showNewJob && (
        <NewJobModal
          onClose={() => setShowNewJob(false)}
          onCreated={() => { fetchJobs(); setShowNewJob(false) }}
        />
      )}
    </div>
  )
}

function QuoteRow({ job, status, last, isMobile, hasAlert, selected, onOpen }) {
  const category = jobCategory(job)
  const portal = category === 'spencers' || category === 'downer'
  const cat = JOB_CATEGORIES[category]
  const { primary, secondary } = jobHeading(job)
  const code = koCode(job)
  const kpi = portal ? kpiCountdown(job) : null
  const total = quoteTotal(job)
  const age = ageLabel(job)
  const extra = hint(job, hasAlert)

  const subParts = portal
    ? [job.ko_reference ? `KO ${job.ko_reference}` : null, code, secondary ? displayCase(secondary) : null, job.job_type, extra]
    : [secondary ? displayCase(secondary) : null, job.job_type, extra]
  const sub = subParts.filter(Boolean).join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`Open ${primary}`}
      style={{
        ...s.row,
        ...(isMobile ? s.rowMobile : {}),
        ...(last ? { borderBottom: 'none' } : {}),
        ...(selected ? s.rowSelected : {}),
        ...(portal ? { boxShadow: `inset 4px 0 0 ${cat.color}` } : {}),
      }}
    >
      <span style={{ ...s.bar, background: status.color }} />
      <div style={{ minWidth: 0 }}>
        <div style={s.titleLine}>
          {portal && <span style={{ ...s.catTag, background: cat.color }}>{cat.label}</span>}
          <span style={{ ...s.rowTitle, ...(isMobile ? { fontSize: 15 } : {}) }}>{displayCase(primary)}</span>
          {hasAlert && <span style={s.alertDot} title="Needs actioning — see Actions" />}
        </div>
        {sub && <div style={s.rowSub}>{sub}</div>}
      </div>
      <div style={s.right}>
        {kpi && (
          <span style={{ ...s.kpi, background: kpi.expired ? '#FFF0EE' : '#FDF3E3', color: kpi.expired ? '#C0392B' : '#D4851A' }}>
            <ClockIcon /> {kpi.text}
          </span>
        )}
        {total != null && total > 0 && <div style={s.price}>{nzd(total)}</div>}
        {age && <div style={s.age}>{age}</div>}
      </div>
    </div>
  )
}

function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  )
}

const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cream)' },
  toolbar: {
    background: '#fff', borderBottom: '1px solid var(--line)',
    padding: '16px 20px 12px', flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  toolbarMobile: { padding: '14px 16px 12px', background: 'var(--cream)' },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: { fontSize: '22px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em', lineHeight: 1.15 },
  countBadge: {
    fontSize: '12px', color: 'var(--ink-2)', background: 'var(--cream)',
    border: '1px solid var(--line)', borderRadius: '10px', padding: '2px 9px', fontVariantNumeric: 'tabular-nums',
  },
  newBtn: {
    marginLeft: 'auto', background: 'var(--terra)', color: '#fff', border: '1px solid var(--terra)',
    borderRadius: 'var(--radius-ctrl)', height: 38, padding: '0 16px', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', width: '100%' },
  searchIcon: { position: 'absolute', left: '12px', width: '16px', height: '16px', pointerEvents: 'none' },
  searchInput: {
    height: 38, padding: '0 36px 0 36px', borderRadius: 'var(--radius-ctrl)',
    border: '1px solid var(--line)', fontSize: '13px',
    fontFamily: 'var(--font)', color: 'var(--ink)', background: '#fff',
    width: '100%', outline: 'none',
  },
  clearBtn: {
    position: 'absolute', right: '4px', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', color: 'var(--ink-3)', cursor: 'pointer', borderRadius: 8,
  },
  chipRow: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: '4px', borderRadius: 'var(--radius-pill)',
    minHeight: 32, padding: '5px 12px', fontSize: '12px', fontWeight: 600,
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)',
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  chipOn: { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' },
  filterMenu: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: '#fff', border: '1px solid var(--line)', borderRadius: '14px',
    boxShadow: '0 12px 32px -12px rgba(40,25,10,0.35)', padding: '6px 0', minWidth: '240px', zIndex: 200,
  },
  filterMenuHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 14px 10px', borderBottom: '1px solid var(--line)', marginBottom: '4px',
  },
  filterMenuTitle: {
    fontSize: '11px', fontWeight: 700, color: 'var(--ink-3)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  clearAllBtn: {
    background: 'none', border: 'none', color: 'var(--terra)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', padding: '0',
  },
  filterItem: { display: 'flex', alignItems: 'center', gap: '9px', padding: '9px 14px', cursor: 'pointer', minHeight: 40 },
  filterCheck: {
    width: '17px', height: '17px', borderRadius: '4px', border: '1.5px solid var(--line)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'background 0.1s, border-color 0.1s',
  },
  filterDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  filterLabel: { fontSize: '13px', color: 'var(--ink)', flex: 1 },
  filterCountBadge: { fontSize: '11px', fontWeight: 700, borderRadius: '10px', padding: '1px 7px' },

  body: { flex: 1, overflowY: 'auto', padding: '12px 20px 24px' },
  bodyMobile: { padding: '4px 16px 24px' },
  groups: { display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: 960 },
  group: { display: 'flex', flexDirection: 'column' },
  eyebrow: {
    fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '4px 4px 6px',
  },
  groupCard: { background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  row: {
    display: 'grid', gridTemplateColumns: '4px minmax(0,1fr) auto', gap: '0 12px', alignItems: 'center',
    padding: '10px 14px 10px 0', borderBottom: '1px solid var(--line)', background: '#fff',
    cursor: 'pointer', minHeight: 52, outline: 'none',
  },
  rowMobile: { padding: '12px 14px 12px 0', minHeight: 60 },
  rowSelected: { background: 'var(--terra-wash)' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: '0 3px 3px 0' },
  titleLine: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  rowTitle: { fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { fontSize: '12px', color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 },
  catTag: {
    display: 'inline-flex', alignItems: 'center', borderRadius: 6, padding: '2px 7px', fontSize: '10px',
    fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.3, whiteSpace: 'nowrap', flexShrink: 0,
  },
  alertDot: {
    width: 9, height: 9, borderRadius: '50%', background: '#C0392B', flexShrink: 0,
    boxShadow: '0 0 0 2px #fff',
  },
  right: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  kpi: {
    display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 'var(--radius-pill)', padding: '3px 9px',
    fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
  },
  price: { fontWeight: 800, fontSize: '15px', letterSpacing: '-0.01em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' },
  age: { fontSize: '11px', color: 'var(--ink-3)', whiteSpace: 'nowrap' },
  footNote: { fontSize: '11px', color: 'var(--ink-3)', padding: '4px 4px 0' },
  empty: { textAlign: 'center', color: 'var(--ink-3)', padding: '60px 0', fontSize: '14px' },
}
