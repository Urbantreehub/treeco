import { getStatus } from '../config/statuses'

export default function StatusBadge({ status, size = 'sm' }) {
  const s = getStatus(status)
  if (!s) return null

  const pad = size === 'lg' ? '6px 14px' : '3px 10px'
  const font = size === 'lg' ? '13px' : '11px'

  return (
    <span style={{
      display: 'inline-block',
      background: s.color + '22',
      color: s.color,
      border: `1px solid ${s.color}55`,
      borderRadius: '20px',
      padding: pad,
      fontSize: font,
      fontWeight: '600',
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}
