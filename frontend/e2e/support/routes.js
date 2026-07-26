// Single source of truth for the e2e route walk.
//
// Every route declared in src/App.jsx appears here. Param routes are given
// concrete sample values that exist in the seeded demo tenant (see
// src/demo/mockData.js) so the page has something real to render. Keep this in
// sync with the <Route> table in App.jsx — a route missing here is a route the
// smoke suite never visits.

/**
 * @typedef {Object} AppRoute
 * @property {string} name    Stable, human-readable id (used in test titles).
 * @property {string} path    Concrete URL to visit.
 * @property {boolean} [auth] Whether the route sits behind the auth gate.
 * @property {boolean} [redirects] Route intentionally redirects elsewhere.
 */

/** @type {AppRoute[]} */
export const PUBLIC_ROUTES = [
  { name: 'login', path: '/login', auth: false, redirects: true }, // demo auto-login bounces to /pipeline
  { name: 'public-quote', path: '/q/demo-quote-token', auth: false },
  { name: 'book-quote', path: '/book', auth: false },
]

/** @type {AppRoute[]} */
export const APP_ROUTES = [
  { name: 'root', path: '/', auth: true, redirects: true }, // index → role-based redirect
  { name: 'dashboard', path: '/dashboard', auth: true },
  { name: 'pipeline', path: '/pipeline', auth: true },
  { name: 'calendar', path: '/calendar', auth: true },
  { name: 'planner', path: '/planner', auth: true },
  { name: 'sent-quotes', path: '/sent-quotes', auth: true },
  { name: 'clients', path: '/clients', auth: true },
  { name: 'quotes-redirect', path: '/quotes', auth: true, redirects: true }, // → /pipeline
  { name: 'quote-builder', path: '/quotes/q1', auth: true },
  { name: 'settings', path: '/settings', auth: true },
  { name: 'safety', path: '/safety', auth: true },
  { name: 'chat', path: '/chat', auth: true },
  { name: 'requests', path: '/requests', auth: true },
  { name: 'mulch', path: '/mulch', auth: true },
  { name: 'staff', path: '/staff', auth: true },
  { name: 'work-order', path: '/workorder/1', auth: true },
  { name: 'job-pack', path: '/jobpack/1', auth: true },
]

export const ALL_ROUTES = [...PUBLIC_ROUTES, ...APP_ROUTES]

// Routes worth exercising interactively (click every button/link). We skip the
// pure redirect routes — they never render their own UI — and the public quote
// pages, which render whatever a client would see with no privileged actions.
export const INTERACTIVE_ROUTES = APP_ROUTES.filter((r) => !r.redirects)
