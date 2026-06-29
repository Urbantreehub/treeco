import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../config/supabase'
import { DEMO_PROFILE } from '../demo/mockData'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const IS_PURE_DEMO = IS_DEMO && !import.meta.env.VITE_SUPABASE_URL
const AUTO_LOGIN = !!import.meta.env.VITE_DEMO_EMAIL
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(IS_PURE_DEMO ? { user: DEMO_PROFILE } : undefined)
  const [profile, setProfile] = useState(IS_PURE_DEMO ? DEMO_PROFILE : null)

  useEffect(() => {
    if (IS_PURE_DEMO) return

    if (IS_DEMO || AUTO_LOGIN) {
      // Auto-login: sign in silently so anyone can open the link without a login screen
      const email = import.meta.env.VITE_DEMO_EMAIL
      const password = import.meta.env.VITE_DEMO_PASSWORD
      supabase.auth.getSession().then(({ data: { session: existing } }) => {
        if (existing) {
          setSession(existing)
          fetchProfile(existing.user.id)
        } else {
          supabase.auth.signInWithPassword({ email, password }).then(({ data, error }) => {
            if (!error && data.session) {
              setSession(data.session)
              fetchProfile(data.session.user.id)
            } else {
              setSession({ user: DEMO_PROFILE })
              setProfile(DEMO_PROFILE)
            }
          })
        }
      })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Don't set session during password recovery — let Login.jsx handle it
      if (event === 'PASSWORD_RECOVERY') return
      setSession(session)
      if (session) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    // Select all existing columns rather than a fixed list — if one column
    // (e.g. resource_id) hasn't been added to the DB yet, an explicit list
    // makes the whole query 400 and the profile silently null, which drops
    // the user to restricted access. '*' stays resilient to schema drift.
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) console.error('fetchProfile failed:', error.message)
    setProfile(data)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isFullAccess = profile?.access_level === 'full'
  const isStaff = profile?.access_level === 'full' || profile?.access_level === 'office'
  const loading = session === undefined

  return (
    <AuthContext.Provider value={{ session, profile, isFullAccess, isStaff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
