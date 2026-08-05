import { useId } from 'react'

// Maps-style 3D navigation arrow (gradient bevel + soft drop shadow).
// Fills with currentColor so it inherits the button's text colour. Gradient and
// filter ids are namespaced per instance via useId so multiple arrows on one
// page never collide.
const ARROW_PATH = 'M444.52 3.52L28.74 195.42c-47.97 22.39-31.98 92.75 19.19 92.75h175.91v175.91c0 51.17 70.36 67.17 92.75 19.19l191.9-415.78c16.78-35.98-19.2-71.99-63.97-63.97z'

export default function NavArrow({ size = 18, style }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const gradId = `navarrow-g-${uid}`
  const shadowId = `navarrow-s-${uid}`
  return (
    <svg
      viewBox="-40 -40 592 592"
      width={size}
      height={size}
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="22" stdDeviation="22" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <g filter={`url(#${shadowId})`}>
        <path fill="currentColor" d={ARROW_PATH} />
        <path fill={`url(#${gradId})`} d={ARROW_PATH} />
      </g>
    </svg>
  )
}
