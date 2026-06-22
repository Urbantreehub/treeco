import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getStatusColor, getStatus } from '../config/statuses'

function daysSince(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
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
          {job.job_type && (
            <span style={styles.typeTag}>{job.job_type}</span>
          )}
        </div>

        {showStatus && status && (
          <div style={{ marginTop: '8px' }}>
            <span style={{
              fontSize: '11px', fontWeight: '600',
              color: color,
              background: color + '18',
              border: `1px solid ${color}44`,
              borderRadius: '20px',
              padding: '2px 8px',
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
    background: '#fff',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    boxShadow: '0 1px 3px rgba(44,36,22,0.06)',
    cursor: 'grab',
    userSelect: 'none',
    overflow: 'hidden',
    display: 'flex',
    transition: 'box-shadow 0.15s',
  },
  colorBar: { width: '4px', flexShrink: 0 },
  body: { padding: '10px 12px', flex: 1, minWidth: 0 },
  topRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '8px',
    marginBottom: '3px',
  },
  clientName: {
    fontWeight: '600',
    fontSize: '13px',
    color: 'var(--bark)',
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
    fontSize: '11px',
    color: '#999',
    marginBottom: '6px',
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
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--bark)',
  },
}
