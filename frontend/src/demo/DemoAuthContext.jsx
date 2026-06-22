import { createContext, useContext } from 'react'
import { DEMO_PROFILE } from './mockData'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  return (
    <AuthContext.Provider value={{
      session: { user: DEMO_PROFILE },
      profile: DEMO_PROFILE,
      isFullAccess: true,
      loading: false,
      signIn: async () => null,
      signOut: async () => {},
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
