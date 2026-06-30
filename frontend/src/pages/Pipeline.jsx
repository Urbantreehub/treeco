import { useState, useMemo, useRef, useEffect } from 'react'
import { JOB_STATUSES, STATUS_ORDER } from '../config/statuses'
import { useJobs } from '../hooks/useJobs'
import { useAuth } from '../context/AuthContext'
import JobDetailPanel from '../components/JobDetailPanel'
import NewJobModal from '../components/NewJobModal'

function nzd(v) {
  if (v == null) return null
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function bestQuote(job) {
  const qs = job.quotes ?? []
  return (
    qs.find(q => q.status === 'accepted') ||
    qs.find(q => q.status === 'viewed') ||
    qs.find(q => q.status === 'sent') ||
    qs.find(q => q.status === 'draft') ||
    null
  )
}

export default function Pipeline() {
  const { jobs, loading, fetchJobs } = useJobs()
  const { isFullAccess } = useAuth()
  const [selectedJob, setSelectedJob] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [textFilter, setTextFilter] = useState('')
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

  const filtered = useMemo(() => {
    return jobs.filter(j => {
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(j.status)
      const q = textFilter.toLowerCase()
      const matchesText = !q ||
        j.clients?.name?.toLowerCase().includes(q) ||
        j.title?.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        j.job_type?.toLowerCase().includes(q)
      return matchesStatus && matchesText
    })
  }, [jobs, textFilter, statusFilter])

  function toggleStatus(key) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filterActive = statusFilter.size > 0

  return (
    <div style={s.page}>

      {/* Toolbar */}
      <div style={s.toolbar}>
        <div style={s.titleRow}>
          <h1 style={s.title}>Jobs</h1>
          <span style={s.countBadge}>{filtered.length}</span>
          {isFullAccess && (
            <button onClick={() => setShowNewJob(true)} style={s.newBtn}>+ New job</button>
          )}
        </div>

        <div style={s.controls}>
          {/* Search */}
          <div style={s.searchWrap}>
            <svg style={s.searchIcon} viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="#aaa" strokeWidth="1.8"/>
              <path d="M13.5 13.5L17 17" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              placeholder="Search client, address, job type…"
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
              style={s.searchInput}
            />
            {textFilter && (
              <button onClick={() => setTextFilter('')} style={s.clearBtn}>✕</button>
            )}
          </div>

          {/* Filter */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              style={{ ...s.filterBtn, ...(filterActive ? s.filterBtnActive : {}) }}
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Filter
              {filterActive && <span style={s.filterCount}>{statusFilter.size}</span>}
            </button>

            {showFilterMenu && (
              <div style={s.filterMenu}>
                <div style={s.filterMenuHeader}>
                  <span style={s.filterMenuTitle}>Status</span>
                  {filterActive && (
                    <button onClick={() => setStatusFilter(new Set())} style={s.clearAllBtn}>Clear</button>
                  )}
                </div>
                {STATUS_ORDER.map(key => {
                  const st = JOB_STATUSES[key]
                  const checked = statusFilter.has(key)
                  const count = jobs.filter(j => j.status === key).length
                  return (
                    <label key={key} style={s.filterItem}>
                      <input type="checkbox" checked={checked} onChange={() => toggleStatus(key)} style={{ display: 'none' }}/>
                      <span style={{ ...s.filterCheck, background: checked ? st.color : '#fff', borderColor: checked ? st.color : '#ddd' }}>
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

      {/* List */}
      <div style={s.body}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            {textFilter || filterActive ? 'No jobs match.' : 'No jobs yet.'}
          </div>
        ) : (
          <div style={s.list}>
            {filtered.map(job => {
              const st = JOB_STATUSES[job.status]
              const quote = bestQuote(job)
              const total = quote ? nzd(quote.total) : null
              const date = job.created_at ? new Date(job.created_at) : null
              return (
                <div key={job.id} style={s.row} onClick={() => setSelectedJob(job)}>
                  <div style={s.rowMain}>
                    <div style={s.client}>{job.clients?.name ?? '—'}</div>
                    <div style={s.meta}>
                      {job.job_type && <span style={s.jobType}>{job.job_type}</span>}
                      {job.address && <span style={s.address}>{job.address}</span>}
                    </div>
                  </div>
                  <div style={s.rowRight}>
                    {st && (
                      <span style={{ ...s.statusBadge, background: st.color + '18', color: st.color }}>
                        {st.label}
                      </span>
                    )}
                    {total && <div style={s.total}>{total}</div>}
                    {date && <div style={s.date}>{date.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdated={() => { fetchJobs(); setSelectedJob(null) }}
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

const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cream)' },
  toolbar: {
    background: '#fff', borderBottom: '1px solid var(--border)',
    padding: '14px 20px 12px', flexShrink: 0,
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  title: { fontSize: '20px', fontWeight: '700', color: 'var(--bark)' },
  countBadge: {
    fontSize: '12px', color: '#888', background: 'var(--cream)',
    border: '1px solid var(--border)', borderRadius: '10px', padding: '2px 9px',
  },
  newBtn: {
    marginLeft: 'auto', background: 'var(--moss)', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  controls: { display: 'flex', alignItems: 'center', gap: '8px' },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 },
  searchIcon: { position: 'absolute', left: '10px', width: '15px', height: '15px', pointerEvents: 'none' },
  searchInput: {
    padding: '8px 32px 8px 34px', borderRadius: '8px',
    border: '1.5px solid var(--border)', fontSize: '13px',
    fontFamily: 'var(--font)', color: 'var(--bark)', background: 'var(--cream)',
    width: '100%', outline: 'none',
  },
  clearBtn: {
    position: 'absolute', right: '8px', background: 'none', border: 'none',
    color: '#aaa', cursor: 'pointer', fontSize: '13px', padding: '0', lineHeight: 1,
  },
  filterBtn: {
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '8px 13px', borderRadius: '8px', border: '1.5px solid var(--border)',
    background: '#fff', color: '#666', fontSize: '13px', fontWeight: '500',
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  filterBtnActive: { borderColor: 'var(--moss)', color: 'var(--moss)', background: 'var(--moss-pale)' },
  filterCount: {
    background: 'var(--moss)', color: '#fff', borderRadius: '10px',
    padding: '1px 6px', fontSize: '11px', fontWeight: '700',
  },
  filterMenu: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: '#fff', border: '1.5px solid var(--border)', borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: '220px', zIndex: 200,
  },
  filterMenuHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '6px 14px 10px', borderBottom: '1px solid var(--border)', marginBottom: '4px',
  },
  filterMenuTitle: {
    fontSize: '11px', fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.05em',
  },
  clearAllBtn: {
    background: 'none', border: 'none', color: 'var(--moss)',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', padding: '0',
  },
  filterItem: { display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 14px', cursor: 'pointer' },
  filterCheck: {
    width: '17px', height: '17px', borderRadius: '4px', border: '1.5px solid #ddd',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'background 0.1s, border-color 0.1s',
  },
  filterDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  filterLabel: { fontSize: '13px', color: 'var(--bark)', flex: 1 },
  filterCountBadge: { fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '1px 7px' },
  body: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  list: { display: 'flex', flexDirection: 'column', gap: '8px' },
  row: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    padding: '14px 18px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: '16px', cursor: 'pointer',
    transition: 'box-shadow 0.15s',
  },
  rowMain: { flex: 1, minWidth: 0 },
  client: { fontSize: '14px', fontWeight: '600', color: 'var(--bark)', marginBottom: '3px' },
  meta: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  jobType: {
    fontSize: '11px', background: 'var(--moss-pale)', color: 'var(--moss)',
    borderRadius: '4px', padding: '2px 6px', fontWeight: '500',
  },
  address: { fontSize: '12px', color: '#aaa' },
  rowRight: { display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 },
  statusBadge: { fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap' },
  total: { fontSize: '14px', fontWeight: '700', color: 'var(--bark)', minWidth: '70px', textAlign: 'right' },
  date: { fontSize: '11px', color: '#aaa', minWidth: '55px', textAlign: 'right' },
  empty: { textAlign: 'center', color: '#ccc', padding: '60px 0', fontSize: '14px' },
}
