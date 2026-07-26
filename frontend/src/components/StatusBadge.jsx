import { getStatus } from '../config/statuses'

export default function StatusBadge({ status, size = 'sm' }) {
  const s = getStatus(status)
  if (!s) return null

  const pad = size === 'lg' ? '6px 14px' : '4px 11px'
  const font = size === 'lg' ? '13px' : '11px'
  const dot  = size === 'lg' ? 8 : 6

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      background: s.color + '1F',
      color: s.color,
      borderRadius: 'var(--radius-pill)',
      padding: pad,
      fontSize: font,
      fontWeight: '700',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  )
}
