import { useState, useMemo } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core'
import { JOB_STATUSES, STATUS_ORDER } from '../config/statuses'
import { useJobs } from '../hooks/useJobs'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import StatusGroup from '../components/StatusGroup'
import JobCard from '../components/JobCard'
import JobDetailPanel from '../components/JobDetailPanel'
import NewJobModal from '../components/NewJobModal'

export default function Pipeline() {
  const { jobs, loading, updateJobStatus, fetchJobs } = useJobs()
  const { isFullAccess } = useAuth()
  const isMobile = useIsMobile()
  const [activeJob, setActiveJob] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)
  const [showNewJob, setShowNewJob] = useState(false)
  const [textFilter, setTextFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState(new Set()) // empty = show all

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } })
  )

  const filteredJobs = useMemo(() => {
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

  const jobsByStatus = useMemo(() =>
    STATUS_ORDER.reduce((acc, key) => {
      acc[key] = filteredJobs.filter(j => j.status === key)
      return acc
    }, {}),
    [filteredJobs]
  )

  // Which statuses to show — if status filter active, only those; else all
  const visibleStatuses = statusFilter.size > 0
    ? STATUS_ORDER.filter(k => statusFilter.has(k))
    : STATUS_ORDER

  function toggleStatusFilter(key) {
    setStatusFilter(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function handleDragStart({ active }) {
    setActiveJob(jobs.find(j => j.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }) {
    setActiveJob(null)
    if (!over) return
    const draggedJob = jobs.find(j => j.id === active.id)
    if (!draggedJob) return
    const targetStatus = STATUS_ORDER.includes(over.id)
      ? over.id
      : jobs.find(j => j.id === over.id)?.status
    if (targetStatus && targetStatus !== draggedJob.status) {
      updateJobStatus(draggedJob.id, targetStatus)
    }
  }

  return (
    <div style={styles.page}>

      {/* ── Toolbar ── */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarTop}>
          <div style={styles.titleRow}>
            <h1 style={styles.pageTitle}>Pipeline</h1>
            <div style={styles.stats}>
              <span style={styles.stat}>{filteredJobs.length} jobs</span>
            </div>
          </div>

          <div style={styles.controls}>
            {/* Text search */}
            <div style={styles.searchWrap}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                placeholder="Search by client, address, job type…"
                value={textFilter}
                onChange={e => setTextFilter(e.target.value)}
                style={styles.searchInput}
              />
              {textFilter && (
                <button onClick={() => setTextFilter('')} style={styles.clearBtn}>✕</button>
              )}
            </div>

            {isFullAccess && (
              <button onClick={() => setShowNewJob(true)} style={styles.addBtn}>
                + New job
              </button>
            )}
          </div>
        </div>

        {/* Status filter chips */}
        <div style={styles.chipRow}>
          <span style={styles.chipLabel}>Filter by status:</span>
          <div style={styles.chips}>
            {STATUS_ORDER.map(key => {
              const s = JOB_STATUSES[key]
              const active = statusFilter.has(key)
              const count = jobs.filter(j => j.status === key).length
              return (
                <button
                  key={key}
                  onClick={() => toggleStatusFilter(key)}
                  style={{
                    ...styles.chip,
                    background: active ? s.color : 'transparent',
                    color: active ? '#fff' : s.color,
                    border: `1.5px solid ${s.color}`,
                    opacity: count === 0 ? 0.4 : 1,
                  }}
                >
                  {s.label}
                  <span style={{ ...styles.chipCount, background: active ? 'rgba(255,255,255,0.25)' : s.color + '22' }}>
                    {count}
                  </span>
                </button>
              )
            })}
            {statusFilter.size > 0 && (
              <button onClick={() => setStatusFilter(new Set())} style={styles.clearChips}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Board ── */}
      <div style={styles.board}>
        {loading ? (
          <div style={styles.loading}>Loading jobs…</div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div style={styles.groups}>
              {visibleStatuses.map(key => (
                <StatusGroup
                  key={key}
                  status={JOB_STATUSES[key]}
                  jobs={jobsByStatus[key] ?? []}
                  onCardClick={setSelectedJob}
                  defaultOpen={false}
                />
              ))}
            </div>

            <DragOverlay>
              {activeJob && <JobCard job={activeJob} onClick={() => {}} showStatus />}
            </DragOverlay>
          </DndContext>
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

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--cream)',
  },
  toolbar: {
    background: '#fff',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    padding: '14px 16px 0',
  },
  toolbarTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
    gap: '10px',
    flexWrap: 'wrap',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--bark)',
  },
  stats: {
    display: 'flex',
    gap: '8px',
  },
  stat: {
    fontSize: '12px',
    color: '#888',
    background: 'var(--cream)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '2px 9px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    minWidth: 0,
  },
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    fontSize: '13px',
    pointerEvents: 'none',
  },
  searchInput: {
    padding: '8px 32px 8px 32px',
    borderRadius: '8px',
    border: '1.5px solid var(--border)',
    fontSize: '13px',
    fontFamily: 'var(--font)',
    color: 'var(--bark)',
    background: 'var(--cream)',
    width: '100%',
    minWidth: '160px',
    outline: 'none',
  },
  clearBtn: {
    position: 'absolute',
    right: '8px',
    background: 'none',
    border: 'none',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '0',
    lineHeight: 1,
  },
  addBtn: {
    background: 'var(--moss)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '9px 18px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
  },
  chipRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    paddingBottom: '14px',
    flexWrap: 'wrap',
  },
  chipLabel: {
    fontSize: '12px',
    color: '#aaa',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  chips: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '4px 10px 4px 10px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'background 0.15s, color 0.15s',
    whiteSpace: 'nowrap',
  },
  chipCount: {
    fontSize: '10px',
    fontWeight: '700',
    borderRadius: '10px',
    padding: '1px 5px',
  },
  clearChips: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '4px 10px',
    fontSize: '12px',
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  board: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  groups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: '#888',
  },
}
