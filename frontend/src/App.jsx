import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const AUTO_LOGIN = !!import.meta.env.VITE_DEMO_EMAIL
import Layout from './components/Layout'
import Login from './pages/Login'
import Pipeline from './pages/Pipeline'
import Quotes from './pages/Quotes'
import QuoteBuilder from './pages/QuoteBuilder'
import QuoteView from './pages/QuoteView'
import Calendar from './pages/Calendar'
import Clients from './pages/Clients'
import Settings from './pages/Settings'
import Dashboard from './pages/Dashboard'
import Forms from './pages/Forms'

function RequireAuth({ children }) {
  const { session, loading } = useAuth()
  if (IS_DEMO || AUTO_LOGIN) {
    // Skip auth gate — auto-login handles session in the background
    if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--bark)' }}>Loading…</div>
    return children
  }
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--bark)' }}>Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function RequireFullAccess({ children }) {
  const { isFullAccess, loading, session, profile } = useAuth()
  if (loading || (session && !profile)) return null
  if (!isFullAccess) return <Navigate to="/calendar" replace />
  return children
}

function DefaultRedirect() {
  const { isFullAccess, isStaff, loading, session, profile } = useAuth()
  if (loading || (session && !profile)) return null
  if (isFullAccess) return <Navigate to="/dashboard" replace />
  if (isStaff) return <Navigate to="/pipeline" replace />
  return <Navigate to="/calendar" replace />
}

function RequireStaff({ children }) {
  const { isStaff, loading, session, profile } = useAuth()
  if (loading || (session && !profile)) return null
  if (!isStaff) return <Navigate to="/calendar" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={(IS_DEMO || AUTO_LOGIN) ? <Navigate to="/pipeline" replace /> : <Login />} />

          {/* Public client-facing quote view — no auth */}
          <Route path="/q/:token" element={<QuoteView />} />

          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<DefaultRedirect />} />
            <Route path="dashboard" element={<RequireFullAccess><Dashboard /></RequireFullAccess>} />
            <Route path="pipeline"  element={<RequireStaff><Pipeline /></RequireStaff>} />
            <Route path="calendar"  element={<Calendar />} />
            <Route path="clients"   element={<RequireStaff><Clients /></RequireStaff>} />
            <Route path="quotes"    element={<RequireStaff><Quotes /></RequireStaff>} />
            <Route path="quotes/new" element={<RequireStaff><QuoteBuilder /></RequireStaff>} />
            <Route path="quotes/:id" element={<RequireStaff><QuoteBuilder /></RequireStaff>} />
            <Route path="settings"  element={<RequireFullAccess><Settings /></RequireFullAccess>} />
            <Route path="forms"     element={<Forms />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
