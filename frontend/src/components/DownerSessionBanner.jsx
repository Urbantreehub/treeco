import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// Sticky red banner shown when the Downer (MyWork) portal session has expired.
// The backend writes an open job_alerts row (kind='downer_mfa') when the portal
// login lapses, and resolves it (status='done') on the next successful login.
// Office/full only; kept live via realtime so it appears/disappears without a
// reload. Degrades to null if job_alerts isn't there yet.
export default function DownerSessionBanner() {
  const { isStaff } = useAuth()
  const [alert, setAlert] = useState(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!isStaff) { setAlert(null); return }
    let active = true

    const refresh = () => {
      supabase.from('job_alerts')
        .select('id, title, detail')
        .eq('kind', 'downer_mfa')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!active) return
          setAlert(error ? null : (data ?? null))
        })
    }
    refresh()

    // Unique per instance — this banner renders twice (mobile + desktop headers),
    // and a shared channel name would make the second mount attach `.on()` to an
    // already-subscribed channel, which Supabase rejects (crashing the page).
    const channel = supabase
      .channel(`downer-mfa-banner-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_alerts' }, refresh)
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [isStaff])

  if (!isStaff || !alert || dismissed) return null

  return (
    <div style={s.bar}>
      <span style={s.icon} aria-hidden="true">🔒</span>
      <div style={s.body}>
        <div style={s.title}>{alert.title}</div>
        {alert.detail && <div style={s.detail}>{alert.detail}</div>}
      </div>
      <button style={s.close} onClick={() => setDismissed(true)} title="Hide until reload" aria-label="Dismiss">×</button>
    </div>
  )
}

const s = {
  bar: {
    position: 'sticky', top: 0, zIndex: 9,
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '12px 18px',
    background: '#C0392B', color: '#fff',
    borderBottom: '1px solid #9B2D22',
    fontFamily: 'var(--font)',
    boxShadow: '0 2px 8px rgba(192,57,43,0.35)',
  },
  icon: { fontSize: 20, lineHeight: 1.2, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: 800, lineHeight: 1.3 },
  detail: {
    fontSize: 13, fontWeight: 500, lineHeight: 1.5, marginTop: 4,
    whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.92)',
  },
  close: {
    flexShrink: 0, background: 'rgba(255,255,255,0.18)', border: 'none',
    color: '#fff', width: 26, height: 26, borderRadius: 6, cursor: 'pointer',
    fontSize: 18, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
}
