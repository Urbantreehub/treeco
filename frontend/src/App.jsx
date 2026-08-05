import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const AUTO_LOGIN = !!import.meta.env.VITE_DEMO_EMAIL

// Route pages are code-split — heavy deps (FullCalendar, jsPDF, Leaflet) load
// only when their page is first opened, keeping the initial bundle small.
const Pipeline     = lazy(() => import('./pages/Pipeline'))
const QuoteBuilder = lazy(() => import('./pages/QuoteBuilder'))
const QuoteView    = lazy(() => import('./pages/QuoteView'))
const Calendar     = lazy(() => import('./pages/Calendar'))
const Clients      = lazy(() => import('./pages/Clients'))
const Settings     = lazy(() => import('./pages/Settings'))
const Dashboard    = lazy(() => import('./pages/Dashboard'))
const Safety       = lazy(() => import('./pages/Safety'))
const StaffHub     = lazy(() => import('./pages/StaffHub'))
const WorkOrder    = lazy(() => import('./pages/WorkOrder'))
const Planner      = lazy(() => import('./pages/Planner'))
const SentQuotes   = lazy(() => import('./pages/SentQuotes'))
const Chat         = lazy(() => import('./pages/Chat'))
const ToolRequests = lazy(() => import('./pages/ToolRequests'))
const MulchDump    = lazy(() => import('./pages/MulchDump'))
const JobPack      = lazy(() => import('./pages/JobPack'))
const BookQuote    = lazy(() => import('./pages/BookQuote'))
const MyDocs       = lazy(() => import('./pages/MyDocs'))
const Actions      = lazy(() => import('./pages/Actions'))
const Marketing    = lazy(() => import('./pages/Marketing'))
const Blog         = lazy(() => import('./pages/Blog'))
const BlogPost     = lazy(() => import('./pages/BlogPost'))

const PageFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--bark)' }}>Loading…</div>
)

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

// Landing page per role — also where blocked users get bounced.
// full → dashboard · office → pipeline · truck → calendar · individual staff → safety
function homePath({ isFullAccess, isStaff, isTruck }) {
  if (isFullAccess) return '/dashboard'
  if (isStaff)      return '/pipeline'
  if (isTruck)      return '/calendar'
  return '/safety'
}

function RequireFullAccess({ children }) {
  const a = useAuth()
  if (a.loading || (a.session && !a.profile)) return null
  if (!a.isFullAccess) return <Navigate to={homePath(a)} replace />
  return children
}

function DefaultRedirect() {
  const a = useAuth()
  if (a.loading || (a.session && !a.profile)) return null
  return <Navigate to={homePath(a)} replace />
}

// Full/office only — fences off the jobs pipeline, planner, mulch, tools, job packs
// from both truck and individual-staff logins.
function RequireStaff({ children }) {
  const a = useAuth()
  if (a.loading || (a.session && !a.profile)) return null
  if (!a.isStaff) return <Navigate to={homePath(a)} replace />
  return children
}

// Scheduled-work access — staff + truck logins (crew calendar + the work orders it
// links to). Individual-staff logins (docs & chat only) are bounced home.
function RequireSchedule({ children }) {
  const a = useAuth()
  if (a.loading || (a.session && !a.profile)) return null
  if (!(a.isStaff || a.isTruck)) return <Navigate to={homePath(a)} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={(IS_DEMO || AUTO_LOGIN) ? <Navigate to="/pipeline" replace /> : <Login />} />

          {/* Public client-facing quote view — no auth */}
          <Route path="/q/:token" element={<QuoteView />} />

          {/* Public quote-request / self-booking form — no auth */}
          <Route path="/book" element={<BookQuote />} />

          {/* Public blog — no auth (social posts link here) */}
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPost />} />

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
            <Route path="actions"   element={<RequireStaff><Actions /></RequireStaff>} />
            <Route path="calendar"  element={<RequireSchedule><Calendar /></RequireSchedule>} />
            <Route path="planner"   element={<RequireStaff><Planner /></RequireStaff>} />
            <Route path="sent-quotes" element={<RequireStaff><SentQuotes /></RequireStaff>} />
            <Route path="clients"   element={<RequireStaff><Clients /></RequireStaff>} />
            <Route path="quotes"    element={<Navigate to="/pipeline" replace />} />
            <Route path="quotes/:id" element={<RequireStaff><QuoteBuilder /></RequireStaff>} />
            <Route path="marketing" element={<RequireStaff><Marketing /></RequireStaff>} />
            <Route path="settings"  element={<RequireFullAccess><Settings /></RequireFullAccess>} />
            <Route path="safety"          element={<Safety />} />
            <Route path="chat"            element={<Chat />} />
            <Route path="my-docs"         element={<MyDocs />} />
            <Route path="requests"        element={<RequireStaff><ToolRequests /></RequireStaff>} />
            <Route path="mulch"           element={<RequireStaff><MulchDump /></RequireStaff>} />
            <Route path="staff"           element={<RequireStaff><StaffHub /></RequireStaff>} />
            <Route path="workorder/:jobId" element={<RequireSchedule><WorkOrder /></RequireSchedule>} />
            <Route path="jobpack/:jobId"   element={<RequireStaff><JobPack /></RequireStaff>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
