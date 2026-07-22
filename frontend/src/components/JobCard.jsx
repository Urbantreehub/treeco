import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState, useEffect } from 'react'
import { getStatusColor, getStatus } from '../config/statuses'

function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function extractDueDate(description) {
  if (!description) return null
  // Format: "Due: 18/06/2026 12:31"
  const m = description.match(/Due:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (!m) return null
  // NZ date is DD/MM/YYYY
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`)
}

function useCountdown(dueDate) {
  const [diff, setDiff] = useState(() => dueDate ? dueDate.getTime() - Date.now() : null)
  useEffect(() => {
    if (!dueDate) return
    const id = setInterval(() => setDiff(dueDate.getTime() - Date.now()), 60_000)
    return () => clearInterval(id)
  }, [dueDate])
  return diff
}

function formatCountdown(ms) {
  if (ms == null) return null
  const expired = ms < 0
  const abs = Math.abs(ms)
  const days = Math.floor(abs / 86400000)
  const hrs  = Math.floor((abs % 86400000) / 3600000)
  const mins = Math.floor((abs % 3600000) / 60000)
  if (days > 0) return { text: `${expired ? '-' : ''}${days}d ${hrs}h`, expired }
  if (hrs  > 0) return { text: `${expired ? '-' : ''}${hrs}h ${mins}m`, expired }
  return { text: `${expired ? '-' : ''}${mins}m`, expired }
}

const PRIORITY_COLORS = {
  URG: { bg: '#FFF0EE', color: '#C0392B' },
  URS: { bg: '#FDF3E3', color: '#D4851A' },
  EPS: { bg: '#FFF0EE', color: '#C0392B' },
  GNL: { bg: '#EBF3FA', color: '#4A7FA5' },
  RSC: { bg: '#EBF3FA', color: '#4A7FA5' },
  VSC: { bg: '#EBF3FA', color: '#4A7FA5' },
  RM:  { bg: '#EBF3FA', color: '#4A7FA5' },
  PM:  { bg: '#F5F5F5', color: '#7A7A7A' },
}

function extractPriority(job) {
  const titleMatch = (job.title || '').match(/^\[([A-Z]{2,4})\]/)
  if (titleMatch) return titleMatch[1]
  const descMatch = (job.description || '').match(/Priority:\s*([A-Z]{2,4})/)
  if (descMatch) return descMatch[1]
  return null
}


export default function JobCard({ job, onClick, showStatus = true }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const days = daysSince(job.status_changed_at || job.created_at)
  const color = getStatusColor(job.status)
  const status = getStatus(job.status)
  const overdue = days > 7
  const priority = extractPriority(job)
  const priStyle = priority ? PRIORITY_COLORS[priority] : null
  const dueDate = extractDueDate(job.description)
  const countdownMs = useCountdown(dueDate)
  const countdown = formatCountdown(countdownMs)

  return (
    <div
      ref={setNodeRef}
      style={{ ...styles.card, ...style }}
      {...attributes}
      {...listeners}
      onClick={() => onClick(job)}
    >
      <div style={{ ...styles.colorBar, background: color }} />
      <div style={styles.body}>
        <div style={styles.topRow}>
          <div style={styles.clientName}>{job.clients?.name ?? '—'}</div>
          <span style={{ ...styles.daysBadge, background: overdue ? '#FFF0EE' : 'var(--border)', color: overdue ? 'var(--danger)' : '#888' }}>
            {days === 0 ? 'Today' : `${days}d`}
          </span>
        </div>

        {job.address && <div style={styles.address}>{job.address}</div>}

        <div style={styles.midRow}>
          {priStyle && (
            <span style={{ ...styles.typeTag, background: priStyle.bg, color: priStyle.color, fontWeight: '700' }}>
              {priority}
            </span>
          )}
          {job.job_type && !priStyle && (
            <span style={styles.typeTag}>{job.job_type}</span>
          )}
          {countdown && (
            <span style={{
              ...styles.typeTag,
              background: countdown.expired ? '#FFF0EE' : countdownMs < 86400000 ? '#FDF3E3' : '#F0F7EE',
              color: countdown.expired ? '#C0392B' : countdownMs < 86400000 ? '#D4851A' : '#4A6741',
              fontWeight: '600',
              fontVariantNumeric: 'tabular-nums',
            }}>
              ⏱ {countdown.text}
            </span>
          )}
        </div>

        {showStatus && status && (
          <div style={{ marginTop: '8px' }}>
            {/* Was a bordered pill. Every card carrying one added two more
                drawn rectangles to the screen; across a full pipeline that's
                the bulk of the visual clutter. Colour alone reads the status. */}
            <span style={{
              fontSize: '12px',
              fontWeight: 'var(--w-medium)',
              fontStyle: 'italic',
              color: color,
            }}>
              {status.label}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: 'var(--surface)',
    borderRadius: '8px',
    // No outline. The 1px border was doing all the separation work while the
    // 6%-opacity shadow contributed nothing perceptible — so the screen read as
    // a grid of rectangles. A real (still soft) shadow lets the card sit on the
    // cream ground instead of being drawn onto it.
    boxShadow: 'var(--shadow)',
    cursor: 'grab',
    userSelect: 'none',
    overflow: 'hidden',
    display: 'flex',
    transition: 'box-shadow 0.15s',
  },
  colorBar: { width: '4px', flexShrink: 0 },
  body: { padding: '14px 16px', flex: 1, minWidth: 0 },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '3px',
  },
  clientName: {
    // Bold and a step larger, so it's clearly the thing you read first. The
    // supporting lines drop to regular weight to give it something to beat.
    fontWeight: 'var(--w-bold)',
    fontSize: '15px',
    color: 'var(--ink-1)',
    lineHeight: 1.3,
    flex: 1,
  },
  daysBadge: {
    fontSize: '10px',
    fontWeight: '600',
    borderRadius: '10px',
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  address: {
    fontSize: '13px',
    fontWeight: 'var(--w-body)',
    color: 'var(--ink-3)',
    marginBottom: '9px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  midRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  typeTag: {
    fontSize: '10px',
    background: 'var(--moss-pale)',
    color: 'var(--moss)',
    borderRadius: '4px',
    padding: '2px 6px',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  value: {
    fontSize: '14px',
    fontWeight: 'var(--w-bold)',
    color: 'var(--ink-1)',
    fontVariantNumeric: 'tabular-nums',
  },
}
