import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import JobCard from './JobCard'

export default function PipelineColumn({ status, jobs, onCardClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key })

  return (
    <div style={styles.column}>
      {/* Column header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...styles.dot, background: status.color }} />
          <span style={styles.label}>{status.label}</span>
        </div>
        <span style={styles.count}>{jobs.length}</span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          ...styles.dropZone,
          background: isOver ? status.color + '12' : 'transparent',
          borderColor: isOver ? status.color + '66' : 'transparent',
        }}
      >
        <SortableContext items={jobs.map(j => j.id)} strategy={verticalListSortingStrategy}>
          {jobs.map(job => (
            <JobCard key={job.id} job={job} onClick={onCardClick} />
          ))}
        </SortableContext>

        {jobs.length === 0 && (
          <div style={styles.empty}>Drop here</div>
        )}
      </div>
    </div>
  )
}

const styles = {
  column: {
    width: '220px',
    minWidth: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 2px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  label: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--bark)',
    lineHeight: 1.2,
  },
  count: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#888',
    background: 'var(--border)',
    borderRadius: '10px',
    padding: '1px 7px',
  },
  dropZone: {
    flex: 1,
    minHeight: '80px',
    borderRadius: '8px',
    border: '2px dashed transparent',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '4px',
    transition: 'background 0.15s, border-color 0.15s',
  },
  empty: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#bbb',
    padding: '20px 0',
  },
}
