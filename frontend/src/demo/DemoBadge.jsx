import { useState } from 'react'
import { resetDemoData } from '../config/supabase'

const IS_PURE_DEMO = import.meta.env.VITE_DEMO === 'true' && !import.meta.env.VITE_SUPABASE_URL

// Small floating badge shown only in the standalone demo build. It tells a
// prospect the app is a sandbox filled with sample data, and lets them reset
// everything back to the clean seed after clicking around.
export default function DemoBadge() {
  const [open, setOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (!IS_PURE_DEMO) return null

  function reset() {
    setResetting(true)
    try { resetDemoData() } catch { /* ignore */ }
    // Reload so every page re-reads the fresh seed.
    window.location.reload()
  }

  return (
    <div style={s.wrap}>
      {open && (
        <div style={s.panel} onClick={e => e.stopPropagation()}>
          <div style={s.title}>You're viewing a live demo</div>
          <div style={s.body}>
            Everything here is sample data — invented clients, jobs and records.
            Click around, drag jobs, fill in a safety form, upload a file. Nothing
            leaves your browser. Reset any time to start fresh.
          </div>
          <button style={s.reset} onClick={reset} disabled={resetting}>
            {resetting ? 'Resetting…' : '↺ Reset demo data'}
          </button>
          <button style={s.close} onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
      <button style={s.pill} onClick={() => setOpen(o => !o)} title="This is a demo">
        <span style={s.dot} /> Live demo
      </button>
    </div>
  )
}

const s = {
  wrap: {
    position: 'fixed',
    right: 'max(16px, env(safe-area-inset-right, 0px))',
    bottom: 'calc(var(--bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px)',
    zIndex: 900,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 10,
    fontFamily: 'var(--font)',
  },
  pill: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'var(--bark, #2C2416)', color: '#fff',
    border: 'none', borderRadius: 999, padding: '9px 15px',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(40,25,10,0.28)', fontFamily: 'var(--font)',
  },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#7CC06B', boxShadow: '0 0 0 3px rgba(124,192,107,0.28)' },
  panel: {
    width: 288, maxWidth: 'calc(100vw - 32px)', background: '#fff',
    border: '1px solid var(--border, #E8EDE4)', borderRadius: 14, padding: 16,
    boxShadow: '0 16px 44px rgba(40,25,10,0.22)',
  },
  title: { fontSize: 14, fontWeight: 800, color: 'var(--bark, #2C2416)', marginBottom: 6 },
  body: { fontSize: 12.5, lineHeight: 1.5, color: '#6b6357', marginBottom: 14 },
  reset: {
    width: '100%', background: 'var(--moss, #4A6741)', color: '#fff', border: 'none',
    borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font)', marginBottom: 8,
  },
  close: {
    width: '100%', background: '#fff', color: '#8a8378', border: '1px solid var(--border, #E8EDE4)',
    borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
}
