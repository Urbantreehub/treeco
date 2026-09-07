import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import JobCard from './JobCard'

function nzd(v) {
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// For a job, get its accepted quote (or most recent sent/viewed quote as fallback)
function acceptedQuote(job) {
  const qs = job.quotes ?? []
  return (
    qs.find(q => q.status === 'accepted') ||
    qs.find(q => q.status === 'viewed') ||
    qs.find(q => q.status === 'sent') ||
    null
  )
}

export default function StatusGroup({ status, jobs, onCardClick, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const { setNodeRef, isOver } = useDroppable({ id: status.key })

  // Real quote totals — only for accepted_to_schedule where quotes exist
  const isAccepted = status.key === 'accepted_to_schedule'
  const quoteTotals = isAccepted
    ? jobs.reduce((acc, j) => {
        const q = acceptedQuote(j)
        if (q) {
          acc.exGst += Number(q.subtotal) || 0
          acc.inclGst += Number(q.total) || 0
          acc.gst += Number(q.gst) || 0
          acc.withQuote++
        }
        return acc
      }, { exGst: 0, inclGst: 0, gst: 0, withQuote: 0 })
    : null

  return (
    <div style={styles.group}>
      {/* Folder header */}
      <button
        style={{ ...styles.header, borderLeft: `4px solid ${status.color}` }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={styles.headerLeft}>
          <span style={styles.arrow}>{open ? '▾' : '▸'}</span>
          <div style={{ ...styles.dot, background: status.color }} />
          <span style={styles.label}>{status.label}</span>
          <span style={{ ...styles.count, background: status.color + '22', color: status.color }}>
            {jobs.length}
          </span>
        </div>

        {/* Totals */}
        {jobs.length > 0 && (
          isAccepted && quoteTotals && quoteTotals.withQuote > 0 ? (
            <div style={styles.quoteTotals}>
              <span style={styles.totalItem}>
                <span style={styles.totalLbl}>Ex GST</span>
                <span style={styles.totalVal}>{nzd(quoteTotals.exGst)}</span>
              </span>
              <span style={styles.totalDivider}>·</span>
              <span style={styles.totalItem}>
                <span style={styles.totalLbl}>Incl GST</span>
                <span style={{ ...styles.totalVal, color: 'var(--moss)', fontWeight: '700' }}>{nzd(quoteTotals.inclGst)}</span>
              </span>
            </div>
          ) : null
        )}
      </button>

      {/* Drop zone + cards */}
      {open && (
        <div
          ref={setNodeRef}
          style={{
            ...styles.cards,
            background: isOver ? status.color + '08' : 'transparent',
            outline: isOver ? `2px dashed ${status.color}55` : '2px dashed transparent',
          }}
        >
          <SortableContext items={jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
            {jobs.map(job => (
              <JobCard key={job.id} job={job} onClick={onCardClick} showStatus={false} />
            ))}
          </SortableContext>
          {jobs.length === 0 && (
            <div style={styles.empty}>No jobs — drag here to move</div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  group: {
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid var(--border)',
    background: '#fff',
  },
  header: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    borderBottom: '1px solid var(--border)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  arrow: {
    fontSize: '12px',
    color: '#aaa',
    width: '12px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--bark)',
  },
  count: {
    fontSize: '12px',
    fontWeight: '700',
    borderRadius: '12px',
    padding: '1px 8px',
  },
  quoteTotals: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  totalItem: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  totalLbl: {
    fontSize: '11px',
    color: '#aaa',
    fontWeight: '500',
  },
  totalVal: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#666',
  },
  totalDivider: {
    color: '#ddd',
    fontSize: '13px',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '10px',
    padding: '12px',
    borderRadius: '0 0 10px 10px',
    outline: '2px dashed transparent',
    transition: 'background 0.15s, outline-color 0.15s',
    minHeight: '60px',
  },
  empty: {
    gridColumn: '1 / -1',
    textAlign: 'center',
    fontSize: '12px',
    color: '#ccc',
    padding: '16px',
  },
}
