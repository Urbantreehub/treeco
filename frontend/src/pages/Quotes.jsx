import { useState, useEffect } from 'react'
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

function nzd(v) {
  if (!v) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Quotes() {
  const { isFullAccess } = useAuth()
  const navigate = useNavigate()
  const [quotes, setQuotes] = useState(IS_PURE_DEMO ? DEMO_QUOTES : [])
  const [loading, setLoading] = useState(!IS_PURE_DEMO)
  const [filter, setFilter] = useState('all')

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

  const STATUS_TABS = ['all', 'draft', 'sent', 'viewed', 'accepted', 'complete', 'invoiced', 'declined']
  const filtered = filter === 'all' ? quotes : quotes.filter(q => q.status === filter)

  return (
    <div style={styles.page}>
      <div style={styles.toolbar}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Quotes</h1>
          <span style={styles.count}>{filtered.length}</span>
          {isFullAccess && (
            <button onClick={() => navigate('/quotes/new')} style={styles.newBtn}>+ New quote</button>
          )}
        </div>

        <div style={styles.tabs}>
          {STATUS_TABS.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              style={{ ...styles.tab, ...(filter === t ? styles.tabActive : {}) }}
            >
              {t === 'all' ? 'All' : STATUS_STYLES[t]?.label ?? t}
              <span style={styles.tabCount}>
                {t === 'all' ? quotes.length : quotes.filter(q => q.status === t).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={styles.body}>
        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={styles.empty}>No quotes yet.</div>
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
    padding: '16px 24px 0',
    flexShrink: 0,
  },
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' },
  newBtn: { marginLeft: 'auto', background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  title: { fontSize: '20px', fontWeight: '700', color: 'var(--bark)' },
  count: {
    fontSize: '12px', color: '#888', background: 'var(--cream)',
    border: '1px solid var(--border)', borderRadius: '10px', padding: '2px 9px',
  },
  tabs: { display: 'flex', gap: '2px' },
  tab: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', background: 'none', border: 'none',
    borderBottom: '2px solid transparent', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500', color: '#888',
    fontFamily: 'var(--font)', marginBottom: '-1px',
    transition: 'color 0.1s',
  },
  tabActive: { color: 'var(--bark)', borderBottomColor: 'var(--bark)' },
  tabCount: {
    fontSize: '11px', fontWeight: '700', background: '#F0EDE8',
    borderRadius: '10px', padding: '1px 6px', color: '#888',
  },
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px' },
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
  statusBadge: {
    fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px',
  },
  total: { fontSize: '14px', fontWeight: '700', color: 'var(--bark)', minWidth: '80px', textAlign: 'right' },
  date: { fontSize: '11px', color: '#aaa', minWidth: '80px', textAlign: 'right' },
  empty: { textAlign: 'center', color: '#ccc', padding: '60px 0', fontSize: '14px' },
}
