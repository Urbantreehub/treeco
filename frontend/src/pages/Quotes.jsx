import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { DEMO_JOBS } from '../demo/mockData'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const IS_PURE_DEMO = IS_DEMO && !import.meta.env.VITE_SUPABASE_URL

const DEMO_QUOTES = DEMO_JOBS
  .filter(j => j.quotes?.length > 0)
  .flatMap(j => j.quotes.map(q => ({
    ...q,
    created_at: j.created_at,
    sent_at: q.status === 'sent' ? j.created_at : null,
    jobs: { id: j.id, address: j.address, job_type: j.job_type, clients: j.clients },
  })))

const STATUS_STYLES = {
  draft:    { label: 'Draft',    bg: '#F5F5F5', color: '#888' },
  sent:     { label: 'Sent',     bg: '#FDF3E3', color: '#D4851A' },
  viewed:   { label: 'Viewed',   bg: '#EBF3FA', color: '#4A7FA5' },
  accepted: { label: 'Accepted', bg: '#E8F0E6', color: '#4A6741' },
  declined: { label: 'Declined', bg: '#FFF0EE', color: '#C0392B' },
  complete: { label: 'Complete', bg: '#E6F4EC', color: '#1A7A4A' },
  invoiced: { label: 'Invoiced', bg: '#E8EEFA', color: '#2A4AB0' },
}

const STATUS_KEYS = ['draft', 'sent', 'viewed', 'accepted', 'complete', 'invoiced', 'declined']

function nzd(v) {
  if (!v) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Quotes() {
  const { isFullAccess } = useAuth()
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState(IS_PURE_DEMO ? DEMO_QUOTES : [])
  const [loading, setLoading] = useState(!IS_PURE_DEMO)
  const [statusFilter, setStatusFilter] = useState(new Set())
  const [textFilter, setTextFilter] = useState('')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    if (IS_PURE_DEMO) return
    async function load() {
      const { data } = await supabase
        .from('quotes')
        .select(`id, status, subtotal, gst, total, created_at, sent_at,
          jobs (id, address, job_type, clients (name))`)
        .order('created_at', { ascending: false })
      setQuotes(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    if (!showFilterMenu) return
    function handler(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilterMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilterMenu])

  function toggleStatus(key) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filtered = quotes.filter(q => {
    const matchesStatus = statusFilter.size === 0 || statusFilter.has(q.status)
    const t = textFilter.toLowerCase()
    const matchesText = !t ||
      q.jobs?.clients?.name?.toLowerCase().includes(t) ||
      q.jobs?.address?.toLowerCase().includes(t) ||
      q.jobs?.job_type?.toLowerCase().includes(t)
    return matchesStatus && matchesText
  })

  const filterActive = statusFilter.size > 0

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Quotes</h1>
          <span style={styles.countBadge}>{filtered.length}</span>
          {isFullAccess && (
            <button onClick={() => navigate('/quotes/new')} style={styles.newBtn}>+ New quote</button>
          )}
        </div>

        <div style={styles.controls}>
          {/* Search */}
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="#aaa" strokeWidth="1.8"/>
              <path d="M13.5 13.5L17 17" stroke="#aaa" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              placeholder="Search client, address, job type…"
              value={textFilter}
              onChange={e => setTextFilter(e.target.value)}
              style={styles.searchInput}
            />
            {textFilter && (
              <button onClick={() => setTextFilter('')} style={styles.clearBtn}>✕</button>
            )}
          </div>

          {/* Filter button */}
          <div style={{ position: 'relative' }} ref={filterRef}>
            <button
              onClick={() => setShowFilterMenu(v => !v)}
              style={{ ...styles.filterBtn, ...(filterActive ? styles.filterBtnActive : {}) }}
            >
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none">
                <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Filter
              {filterActive && (
                <span style={styles.filterCount}>{statusFilter.size}</span>
              )}
            </button>

            {showFilterMenu && (
              <div style={styles.filterMenu}>
                <div style={styles.filterMenuHeader}>
                  <span style={styles.filterMenuTitle}>Filter by status</span>
                  {filterActive && (
                    <button onClick={() => setStatusFilter(new Set())} style={styles.clearAllBtn}>
                      Clear all
                    </button>
                  )}
                </div>
                {STATUS_KEYS.map(key => {
                  const s = STATUS_STYLES[key]
                  const checked = statusFilter.has(key)
                  const count = quotes.filter(q => q.status === key).length
                  return (
                    <label key={key} style={styles.filterItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleStatus(key)}
                        style={{ display: 'none' }}
                      />
                      <span style={{
                        ...styles.filterCheck,
                        background: checked ? s.color : '#fff',
                        borderColor: checked ? s.color : '#ddd',
                      }}>
                        {checked && <svg viewBox="0 0 12 10" width="10" height="10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>}
                      </span>
                      <span style={{ ...styles.filterDot, background: s.color }} />
                      <span style={styles.filterLabel}>{s.label}</span>
                      <span style={{ ...styles.filterCountBadge, color: s.color, background: s.color + '18' }}>
                        {count}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.body}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>
            {textFilter || filterActive ? 'No quotes match your search.' : 'No quotes yet.'}
          </div>
        ) : (
          <div style={styles.list}>
            {filtered.map(q => {
              const st = STATUS_STYLES[q.status] ?? STATUS_STYLES.draft
              return (
                <div
                  key={q.id}
                  style={styles.row}
                  onClick={() => navigate(`/quotes/${q.id}`)}
                >
                  <div style={styles.rowMain}>
                    <div style={styles.client}>{q.jobs?.clients?.name ?? '—'}</div>
                    <div style={styles.meta}>
                      {q.jobs?.job_type && <span style={styles.jobType}>{q.jobs.job_type}</span>}
                      {q.jobs?.address && <span style={styles.address}>{q.jobs.address}</span>}
                    </div>
                  </div>

                  <div style={styles.rowRight}>
                    <span style={{ ...styles.statusBadge, background: st.bg, color: st.color }}>
                      {st.label}
                    </span>
                    <div style={styles.total}>{nzd(q.total)}</div>
                    <div style={styles.date}>
                      {q.sent_at
                        ? `Sent ${new Date(q.sent_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`
                        : `Created ${new Date(q.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}`}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cream)' },
  toolbar: {
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    padding: '14px 20px 12px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
  searchWrap: {
    position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0,
  },
  searchIcon: {
    position: 'absolute', left: '10px', width: '15px', height: '15px', pointerEvents: 'none',
  },
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
  filterBtnActive: {
    borderColor: 'var(--moss)', color: 'var(--moss)', background: 'var(--moss-pale)',
  },
  filterCount: {
    background: 'var(--moss)', color: '#fff', borderRadius: '10px',
    padding: '1px 6px', fontSize: '11px', fontWeight: '700',
  },
  filterMenu: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: '#fff', border: '1.5px solid var(--border)', borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: '210px', zIndex: 200,
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
  filterItem: {
    display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 14px', cursor: 'pointer',
  },
  filterCheck: {
    width: '17px', height: '17px', borderRadius: '4px', border: '1.5px solid #ddd',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    transition: 'background 0.1s, border-color 0.1s',
  },
  filterDot: { width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0 },
  filterLabel: { fontSize: '13px', color: 'var(--bark)', flex: 1 },
  filterCountBadge: {
    fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '1px 7px',
  },
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
  meta: { display: 'flex', alignItems: 'center', gap: '8px' },
  jobType: {
    fontSize: '11px', background: 'var(--moss-pale)', color: 'var(--moss)',
    borderRadius: '4px', padding: '2px 6px', fontWeight: '500', textTransform: 'capitalize',
  },
  address: { fontSize: '12px', color: '#aaa' },
  rowRight: { display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 },
  statusBadge: { fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px' },
  total: { fontSize: '14px', fontWeight: '700', color: 'var(--bark)', minWidth: '80px', textAlign: 'right' },
  date: { fontSize: '11px', color: '#aaa', minWidth: '80px', textAlign: 'right' },
  empty: { textAlign: 'center', color: '#ccc', padding: '60px 0', fontSize: '14px' },
}
