// Shared skeleton primitive (F21). One shimmer (defined in theme.css, honours
// prefers-reduced-motion) with three shapes; compose these per screen instead
// of reimplementing a loading state each time.
//
//   <Skeleton line width="60%" />        text line
//   <Skeleton block height={120} />      card / tile block
//   <Skeleton circle size={40} />        avatar / dot

export default function Skeleton({
  variant,
  line,           // shorthand booleans: <Skeleton line />, <Skeleton circle />
  circle,
  block,
  width,
  height,
  size,           // circle diameter (overrides width/height)
  radius,
  style,
  ...rest
}) {
  variant = variant ?? (circle ? 'circle' : line ? 'line' : 'block')
  const base = { flexShrink: 0 }
  let shape
  if (variant === 'circle') {
    const d = size ?? 40
    shape = { width: d, height: d, borderRadius: '50%' }
  } else if (variant === 'line') {
    shape = { width: width ?? '100%', height: height ?? 12, borderRadius: radius ?? 6 }
  } else {
    shape = { width: width ?? '100%', height: height ?? 80, borderRadius: radius ?? 'var(--radius)' }
  }
  return <div className="skeleton" style={{ ...base, ...shape, ...style }} aria-hidden="true" {...rest} />
}

// A stack of skeleton list rows — the common case for pipeline / tray / agenda.
export function SkeletonRows({ count = 6, height = 76, gap = 10, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} block height={height} />
      ))}
    </div>
  )
}
