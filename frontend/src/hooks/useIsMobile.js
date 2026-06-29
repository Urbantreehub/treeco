import { useState, useEffect } from 'react'

// Touch-first boundary: phones and tablets in portrait (< 1024px) get the
// touch-optimized layout (bottom nav, agenda calendar, accordion pipeline,
// stacked quote builder). Laptops and landscape tablets (>= 1024px) get the
// desktop sidebar. Single source of truth — keep in sync with theme.css.
export function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= breakpoint)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const handler = e => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}
