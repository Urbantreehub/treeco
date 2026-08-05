// Single source of truth for the e2e route walk.
//
// Every route declared in src/App.jsx appears here. Param routes are given
// concrete sample values that exist in the seeded demo tenant (see
// src/demo/mockData.js) so the page has something real to render. Keep this in
// sync with the <Route> table in App.jsx — a route missing here is a route the
// smoke suite never visits.
//
// `access` mirrors the router guards in App.jsx:
//   'public'   — no auth
//   'any'      — any signed-in user
//   'schedule' — RequireSchedule (full | office | truck)
//   'staff'    — RequireStaff    (full | office)
//   'full'     — RequireFullAccess

/**
 * @typedef {Object} AppRoute
 * @property {string} name    Stable, human-readable id (used in test titles).
 * @property {string} path    Concrete URL to visit.
 * @property {boolean} [auth] Whether the route sits behind the auth gate.
 * @property {boolean} [redirects] Route intentionally redirects elsewhere.
 * @property {'public'|'any'|'schedule'|'staff'|'full'} access  Minimum access level.
 */

/** @type {AppRoute[]} */
export const PUBLIC_ROUTES = [
  { name: 'login', path: '/login', auth: false, redirects: true, access: 'public' }, // demo auto-login bounces to /pipeline
  { name: 'public-quote', path: '/q/demo-quote-token', auth: false, access: 'public' },
  { name: 'book-quote', path: '/book', auth: false, access: 'public' },
  { name: 'blog', path: '/blog', auth: false, access: 'public' },
  { name: 'blog-post', path: '/blog/demo-post', auth: false, access: 'public' },
]

/** @type {AppRoute[]} */
export const APP_ROUTES = [
  { name: 'root', path: '/', auth: true, redirects: true, access: 'any' }, // index → role-based redirect
  { name: 'dashboard', path: '/dashboard', auth: true, access: 'full' },
  { name: 'pipeline', path: '/pipeline', auth: true, access: 'staff' },
  { name: 'actions', path: '/actions', auth: true, access: 'staff' },
  { name: 'calendar', path: '/calendar', auth: true, access: 'schedule' },
  { name: 'planner', path: '/planner', auth: true, access: 'staff' },
  { name: 'sent-quotes', path: '/sent-quotes', auth: true, access: 'staff' },
  { name: 'clients', path: '/clients', auth: true, access: 'staff' },
  { name: 'quotes-redirect', path: '/quotes', auth: true, redirects: true, access: 'staff' }, // → /pipeline
  { name: 'quote-builder', path: '/quotes/q1', auth: true, access: 'staff' },
  { name: 'marketing', path: '/marketing', auth: true, access: 'staff' },
  { name: 'settings', path: '/settings', auth: true, access: 'full' },
  { name: 'safety', path: '/safety', auth: true, access: 'any' },
  { name: 'chat', path: '/chat', auth: true, access: 'any' },
  { name: 'my-docs', path: '/my-docs', auth: true, access: 'any' },
  { name: 'requests', path: '/requests', auth: true, access: 'staff' },
  { name: 'mulch', path: '/mulch', auth: true, access: 'staff' },
  { name: 'staff', path: '/staff', auth: true, access: 'staff' },
  { name: 'work-order', path: '/workorder/1', auth: true, access: 'schedule' },
  { name: 'job-pack', path: '/jobpack/1', auth: true, access: 'staff' },
]

export const ALL_ROUTES = [...PUBLIC_ROUTES, ...APP_ROUTES]

// The four access levels a demo/live user can have (mirrors AuthContext).
export const ROLES = ['full', 'office', 'truck', 'restricted']

// Which access levels each role satisfies (mirrors the guards in App.jsx:
// office === staff; truck === schedule-only; restricted === docs/chat/safety).
const ROLE_GRANTS = {
  full: ['public', 'any', 'schedule', 'staff', 'full'],
  office: ['public', 'any', 'schedule', 'staff'],
  truck: ['public', 'any', 'schedule'],
  restricted: ['public', 'any'],
}

export function roleCanAccess(role, access) {
  return (ROLE_GRANTS[role] ?? ROLE_GRANTS.restricted).includes(access)
}

// Routes worth exercising interactively (click every button/link). Skip pure
// redirects — they never render their own UI — and the public quote pages, which
// render whatever a client sees with no privileged actions.
export const INTERACTIVE_ROUTES = APP_ROUTES.filter((r) => !r.redirects)

// Interactive routes a given role can actually reach (others just redirect away).
export function interactiveRoutesForRole(role) {
  return INTERACTIVE_ROUTES.filter((r) => roleCanAccess(role, r.access))
}
