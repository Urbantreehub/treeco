import { useState, useCallback, useRef } from 'react'

// Shared toast (F22) — the day-run toast promoted to a reusable component so
// optimistic actions surface success/failure the same way everywhere, instead
// of alert() or a per-screen reimplementation.
//
//   const { toast, showToast } = useToast()
//   ...
//   showToast('Saved')                 // neutral
//   showToast('Could not save', true)  // error (danger colour)
//   return <>{...}<Toast toast={toast} /></>

export function useToast(duration = 2600) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const showToast = useCallback((msg, err = false) => {
    if (timer.current) clearTimeout(timer.current)
    setToast({ msg, err })
    timer.current = setTimeout(() => setToast(null), duration)
  }, [duration])
  return { toast, showToast }
}

export function Toast({ toast }) {
  if (!toast) return null
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 'calc(14px + env(safe-area-inset-top, 0px))',
        left: '50%', transform: 'translateX(-50%)',
        background: toast.err ? 'var(--danger)' : 'var(--ink)', color: '#fff',
        padding: '10px 18px', borderRadius: 'var(--radius-pill)',
        fontSize: '14px', fontWeight: 600, zIndex: 650, pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)', textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      }}
    >
      {toast.msg}
    </div>
  )
}
