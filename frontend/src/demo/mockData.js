// ── Empty-tenant toggle ──────────────────────────────────────────────────────
// A single demo build can act as either a *seeded* tenant (has jobs/clients) or
// an *empty* tenant (a brand-new account with no data). The e2e smoke suite runs
// twice — once per tenant — to catch null / empty-state crashes. The flag is
// evaluated at runtime (not baked at build time) so the Playwright suite can flip
// it per project via localStorage/URL against one running server.
export function isEmptyTenant() {
  if (import.meta.env.VITE_DEMO_EMPTY === 'true') return true
  if (typeof window === 'undefined') return false
  try {
    if (new URLSearchParams(window.location.search).get('tenant') === 'empty') return true
    return window.localStorage.getItem('treeco:e2e:empty-tenant') === '1'
  } catch {
    return false
  }
}

// Getters (not constants) so the toggle above is read at component-mount time,
// after the e2e harness has had a chance to set it.
export const seededJobs = () => (isEmptyTenant() ? [] : DEMO_JOBS)
export const seededClients = () => (isEmptyTenant() ? [] : DEMO_CLIENTS)

// ── Role toggle ──────────────────────────────────────────────────────────────
// The demo tenant is a 'full'-access owner by default, but the e2e suite runs as
// every access level ('full' | 'office' | 'crew') so role-guarded routes and
// role-specific navigation are all exercised. Like the empty-tenant flag, this is
// read at runtime so one demo build can act as any user.
const DEMO_ROLES = ['full', 'office', 'crew']

export function demoAccessLevel() {
  const fromEnv = import.meta.env.VITE_DEMO_ROLE
  if (DEMO_ROLES.includes(fromEnv)) return fromEnv
  if (typeof window === 'undefined') return 'full'
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('role')
    if (DEMO_ROLES.includes(fromUrl)) return fromUrl
    const fromStore = window.localStorage.getItem('treeco:e2e:role')
    if (DEMO_ROLES.includes(fromStore)) return fromStore
  } catch {
    /* ignore */
  }
  return 'full'
}

export const DEMO_PROFILE = {
  id: 'demo',
  name: 'Demo User',
  email: 'demo@treeco.app',
  access_level: 'full',
  avatar_url: null,
}

// Profile with the currently-selected demo role applied. A getter so the role
// toggle is read at mount time, after the e2e harness has set it.
export const demoProfile = () => ({ ...DEMO_PROFILE, access_level: demoAccessLevel() })

export const DEMO_JOBS = [
  {
    id: '1', status: 'quote_sent', title: 'Large Macrocarpa Removal',
    address: '14 Hillcrest Ave, Wellington', job_type: 'Tree Removal',
    created_at: '2026-06-10T08:00:00Z', status_changed_at: '2026-06-10T08:00:00Z',
    clients: { id: 'c1', name: 'Margaret Thompson', phone: '021 456 789', email: 'margaret@example.com' },
    quotes: [{ id: 'q1', status: 'sent', subtotal: 2800, gst: 420, total: 3220 }],
  },
  {
    id: '2', status: 'scheduled', title: 'Hedge Trimming x3',
    address: '8 Miramar Rd, Wellington', job_type: 'Pruning',
    created_at: '2026-06-12T09:00:00Z', status_changed_at: '2026-06-14T10:00:00Z',
    clients: { id: 'c2', name: 'Richard Tait', phone: '027 111 222', email: 'richard@example.com' },
    quotes: [{ id: 'q2', status: 'accepted', subtotal: 650, gst: 97.5, total: 747.5 }],
  },
  {
    id: '3', status: 'scheduled', title: 'Pine Tree Crown Reduction',
    address: '55 Oriental Parade, Wellington', job_type: 'Pruning',
    created_at: '2026-06-15T07:30:00Z', status_changed_at: '2026-06-22T07:30:00Z',
    clients: { id: 'c3', name: 'Coastal Properties Ltd', phone: '04 999 8888', email: 'info@coastalprops.nz' },
    quotes: [{ id: 'q3', status: 'accepted', subtotal: 1800, gst: 270, total: 2070 }],
  },
  {
    id: '4', status: 'complete_to_invoice', title: 'Stump Grinding — 4 stumps',
    address: '3 Karori Rd, Wellington', job_type: 'Stump Grinding',
    created_at: '2026-06-01T10:00:00Z', status_changed_at: '2026-06-05T16:00:00Z',
    clients: { id: 'c4', name: 'Dave & Sue Wilson', phone: '021 333 444', email: 'davesuewilson@gmail.com' },
    quotes: [{ id: 'q4', status: 'accepted', subtotal: 960, gst: 144, total: 1104 }],
  },
  {
    id: '5', status: 'new_lead', title: 'Kowhai Pruning & Cleanup',
    address: '22 Brooklyn Rd, Wellington', job_type: 'Pruning',
    created_at: '2026-06-20T14:00:00Z', status_changed_at: '2026-06-20T14:00:00Z',
    clients: { id: 'c5', name: 'Anna Ferreira', phone: '022 777 888', email: 'anna.f@gmail.com' },
    quotes: [],
  },
  {
    id: '6', status: 'quote_scheduled', title: 'Rimu Removal — council permit required',
    address: '101 Mt Victoria Blvd, Wellington', job_type: 'Tree Removal',
    created_at: '2026-06-18T11:00:00Z', status_changed_at: '2026-06-19T09:00:00Z',
    clients: { id: 'c6', name: 'Heritage Homes Trust', phone: '04 555 7777', email: 'admin@heritagehomes.nz' },
    quotes: [{ id: 'q5', status: 'draft', subtotal: 5400, gst: 810, total: 6210 }],
  },
  {
    id: '7', status: 'invoiced', title: 'Emergency Fallen Branch Removal',
    address: '9 Newlands Ave, Wellington', job_type: 'Emergency',
    created_at: '2026-06-08T06:00:00Z', status_changed_at: '2026-06-08T18:00:00Z',
    clients: { id: 'c7', name: 'Jason Park', phone: '021 234 567', email: 'jpark@gmail.com' },
    quotes: [{ id: 'q6', status: 'accepted', subtotal: 1200, gst: 180, total: 1380 }],
  },
]

export const DEMO_CLIENTS = [
  { id: 'c1', name: 'Margaret Thompson', phone: '021 456 789', email: 'margaret@example.com', address: '14 Hillcrest Ave, Wellington', notes: 'Prefers morning appointments', xero_contact_id: null, created_at: '2026-05-01T00:00:00Z' },
  { id: 'c2', name: 'Richard Tait', phone: '027 111 222', email: 'richard@example.com', address: '8 Miramar Rd, Wellington', notes: '', xero_contact_id: null, created_at: '2026-05-10T00:00:00Z' },
  { id: 'c3', name: 'Coastal Properties Ltd', phone: '04 999 8888', email: 'info@coastalprops.nz', address: '55 Oriental Parade, Wellington', notes: 'Commercial client — invoice to accounts dept', xero_contact_id: 'xero_001', created_at: '2026-04-15T00:00:00Z' },
  { id: 'c4', name: 'Dave & Sue Wilson', phone: '021 333 444', email: 'davesuewilson@gmail.com', address: '3 Karori Rd, Wellington', notes: '', xero_contact_id: null, created_at: '2026-05-22T00:00:00Z' },
  { id: 'c5', name: 'Anna Ferreira', phone: '022 777 888', email: 'anna.f@gmail.com', address: '22 Brooklyn Rd, Wellington', notes: 'New lead from website', xero_contact_id: null, created_at: '2026-06-20T00:00:00Z' },
  { id: 'c6', name: 'Heritage Homes Trust', phone: '04 555 7777', email: 'admin@heritagehomes.nz', address: '101 Mt Victoria Blvd, Wellington', notes: 'Requires council approval for all removals', xero_contact_id: 'xero_002', created_at: '2026-03-10T00:00:00Z' },
  { id: 'c7', name: 'Jason Park', phone: '021 234 567', email: 'jpark@gmail.com', address: '9 Newlands Ave, Wellington', notes: '', xero_contact_id: null, created_at: '2026-06-08T00:00:00Z' },
]
