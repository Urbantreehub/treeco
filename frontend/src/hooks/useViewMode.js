import { useCallback, useSyncExternalStore } from 'react'
import { useAuth } from '../context/AuthContext'

// Staff view mode — 'quoting' (Quotes + Quote runs only, Josh's default) or
// 'full' (the whole app). Remembered per device in localStorage; the first
// visit falls back to the user's profile.default_view, then to a role default
// (full access → quoting, office → full). Truck and crew logins are never
// affected — they always see their own nav.

export const VIEW_STORAGE_KEY = 'treeco:view'
export const VIEW_MODES = ['quoting', 'full']

const listeners = new Set()

function readStored() {
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY)
    return VIEW_MODES.includes(v) ? v : null
  } catch {
    return null
  }
}

function writeStored(v) {
  try {
    if (v) window.localStorage.setItem(VIEW_STORAGE_KEY, v)
    else window.localStorage.removeItem(VIEW_STORAGE_KEY)
  } catch {
    /* storage unavailable — the choice just won't persist */
  }
  listeners.forEach(fn => fn())
}

function subscribe(fn) {
  listeners.add(fn)
  const onStorage = e => { if (e.key === VIEW_STORAGE_KEY) fn() }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage) }
}

// Pure resolver — exported so the redirect logic in App.jsx can share it.
export function resolveView({ stored, profile, isStaff, isFullAccess }) {
  if (!isStaff) return 'full'
  if (stored) return stored
  const pref = profile?.default_view
  if (VIEW_MODES.includes(pref)) return pref
  return isFullAccess ? 'quoting' : 'full'
}

export function useViewMode() {
  const { profile, isStaff, isFullAccess } = useAuth()
  const stored = useSyncExternalStore(subscribe, readStored, () => null)
  const view = resolveView({ stored, profile, isStaff, isFullAccess })

  const setView = useCallback(v => {
    if (!VIEW_MODES.includes(v)) return
    writeStored(v)
  }, [])

  const toggle = useCallback(() => {
    writeStored(view === 'quoting' ? 'full' : 'quoting')
  }, [view])

  return { view, setView, toggle, isQuoting: view === 'quoting' }
}
