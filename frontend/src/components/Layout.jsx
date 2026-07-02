import { Suspense } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { useScheduledChecks } from '../hooks/useScheduledChecks'

const FULL_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { to: '/pipeline',  label: 'Jobs',      icon: PipelineIcon },
  { to: '/calendar',  label: 'Calendar',  icon: CalendarIcon },
  { to: '/planner',   label: 'Planner',   icon: PlannerIcon },
  { to: '/sent-quotes', label: 'Quotes',  icon: QuotesIcon },
  { to: '/clients',   label: 'Clients',   icon: ClientsIcon },
  { to: '/safety',    label: 'Safety',    icon: SafetyIcon },
  { to: '/staff',     label: 'Staff Hub', icon: StaffHubIcon },
]

const OFFICE_NAV = [
  { to: '/pipeline',  label: 'Jobs',      icon: PipelineIcon },
  { to: '/calendar',  label: 'Calendar',  icon: CalendarIcon },
  { to: '/planner',   label: 'Planner',   icon: PlannerIcon },
  { to: '/sent-quotes', label: 'Quotes',  icon: QuotesIcon },
  { to: '/clients',   label: 'Clients',   icon: ClientsIcon },
  { to: '/safety',    label: 'Safety',    icon: SafetyIcon },
  { to: '/staff',     label: 'Staff Hub', icon: StaffHubIcon },
]

const CREW_NAV = [
  { to: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { to: '/safety',   label: 'Safety',   icon: SafetyIcon },
]

export default function Layout() {
  const { profile, isFullAccess, isStaff, signOut } = useAuth()
  const navigate   = useNavigate()
  const isMobile   = useIsMobile()
  const { overdue, dueSoon } = useScheduledChecks()
  const alertCount = overdue.length + dueSoon.length

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const navItems = isFullAccess ? FULL_NAV : isStaff ? OFFICE_NAV : CREW_NAV

  if (isMobile) {
    return (
      <div style={m.shell}>
        <main style={m.main}>
          <Suspense fallback={<div style={pageFallback}>Loading…</div>}>
            <Outlet />
          </Suspense>
        </main>
        <nav style={m.bottomNav}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({ ...m.tabItem, ...(isActive ? m.tabActive : {}) })}>
              {({ isActive }) => (
                <>
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <Icon active={isActive} />
                    {to === '/safety' && alertCount > 0 && (
                      <span style={{ position: 'absolute', top: -4, right: -6, background: '#e53935', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{alertCount > 9 ? '9+' : alertCount}</span>
                    )}
                  </div>
                  <span style={m.tabLabel}>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          {isFullAccess && (
            <NavLink to="/settings" style={({ isActive }) => ({ ...m.tabItem, ...(isActive ? m.tabActive : {}) })}>
              {({ isActive }) => (
                <>
                  <SettingsIcon active={isActive} />
                  <span style={m.tabLabel}>Settings</span>
                </>
              )}
            </NavLink>
          )}
        </nav>
      </div>
    )
  }

  // ── Desktop sidebar layout ────────────────────────────────────────────────
  return (
    <div style={d.shell}>
      <nav style={d.nav}>
        <div style={d.navTop}>
          <NavLink to={isFullAccess ? '/dashboard' : '/calendar'} style={d.brand}>
            <span style={{ fontSize: '20px' }}>🌲</span>
            <span style={d.brandName}>TreeCo</span>
          </NavLink>
          <ul style={d.navList}>
            {navItems.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} style={({ isActive }) => ({ ...d.navLink, ...(isActive ? d.navLinkActive : {}) })}>
                  <Icon active={false} size={16} />
                  {label}
                  {to === '/safety' && alertCount > 0 && (
                    <span style={{ marginLeft: 'auto', background: '#e53935', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{alertCount > 9 ? '9+' : alertCount}</span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
        <div style={d.navBottom}>
          {isFullAccess && (
            <NavLink to="/settings" style={({ isActive }) => ({ ...d.settingsLink, ...(isActive ? d.navLinkActive : {}) })}>
              <SettingsIcon size={16} />
              Settings
            </NavLink>
          )}
          <div style={d.userInfo}>
            <div style={d.avatar}>{profile?.name?.[0]?.toUpperCase() ?? '?'}</div>
            <div>
              <div style={d.userName}>{profile?.name ?? '—'}</div>
              <div style={d.accessBadge}>{isFullAccess ? 'Full access' : 'Crew'}</div>
            </div>
          </div>
          <button onClick={handleSignOut} style={d.signOutBtn}>Sign out</button>
        </div>
      </nav>
      <main style={d.main}>
        <Suspense fallback={<div style={pageFallback}>Loading…</div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

// ── SVG icon components ───────────────────────────────────────────────────
function DashboardIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}
function PipelineIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="7" width="5" height="14" rx="1"/><rect x="17" y="11" width="5" height="10" rx="1"/>
    </svg>
  )
}
function CalendarIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function ClientsIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function PlannerIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/><line x1="8" y1="3" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="21"/>
    </svg>
  )
}
function QuotesIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
function FormsIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function SafetyIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>
    </svg>
  )
}
function StaffHubIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/>
    </svg>
  )
}
function SettingsIcon({ active, size = 22 }) {
  const c = active ? '#fff' : 'rgba(255,255,255,0.55)'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

const pageFallback = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  height: '100%', minHeight: '40vh', color: 'var(--bark)', opacity: 0.5, fontSize: '14px',
}

// ── Mobile styles ─────────────────────────────────────────────────────────
const m = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    overflow: 'auto',
    background: 'var(--cream)',
    paddingBottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    background: 'var(--bark)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: '10px',
    zIndex: 200,
    borderTop: '1px solid var(--bark-mid)',
  },
  tabItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '3px',
    flex: 1,
    textDecoration: 'none',
    padding: '4px 0',
    color: 'rgba(255,255,255,0.5)',
    transition: 'color 0.15s',
  },
  tabActive: {
    color: '#fff',
  },
  tabLabel: {
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.02em',
  },
}

// ── Desktop styles ────────────────────────────────────────────────────────
const d = {
  shell:   { display: 'flex', height: '100vh', overflow: 'hidden' },
  nav: {
    width: 'var(--nav-width)', minWidth: 'var(--nav-width)',
    background: 'var(--bark)', display: 'flex', flexDirection: 'column',
    justifyContent: 'space-between', padding: '20px 0', overflowY: 'auto',
  },
  navTop:  { display: 'flex', flexDirection: 'column', gap: '32px' },
  brand:   { display: 'flex', alignItems: 'center', gap: '10px', padding: '0 20px', textDecoration: 'none' },
  brandName: { color: '#fff', fontWeight: '700', fontSize: '18px', letterSpacing: '-0.3px' },
  navList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '2px', padding: '0 8px' },
  navLink: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: '8px',
    color: 'rgba(255,255,255,0.65)', fontSize: '14px', fontWeight: '500',
    transition: 'background 0.15s, color 0.15s', textDecoration: 'none',
  },
  navLinkActive: { background: 'var(--bark-mid)', color: '#fff' },
  settingsLink: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
    borderRadius: '8px', color: 'rgba(255,255,255,0.55)', fontSize: '13px',
    fontWeight: '500', textDecoration: 'none', transition: 'background 0.15s, color 0.15s',
    marginBottom: '4px',
  },
  navBottom: {
    padding: '16px 12px 0', borderTop: '1px solid var(--bark-mid)',
    display: 'flex', flexDirection: 'column', gap: '12px',
  },
  userInfo:    { display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' },
  avatar:      { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--moss)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', flexShrink: 0 },
  userName:    { color: '#fff', fontSize: '13px', fontWeight: '600', lineHeight: 1.2 },
  accessBadge: { color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginTop: '2px' },
  signOutBtn:  { background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '13px', padding: '8px 12px', width: '100%', cursor: 'pointer', fontFamily: 'var(--font)' },
  main:        { flex: 1, overflow: 'auto', background: 'var(--cream)' },
}
