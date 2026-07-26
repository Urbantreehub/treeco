# End-to-end tests (Playwright)

Fast, crash-hunting e2e coverage for the TreeCo PWA.

## What it checks

| Spec | Project(s) | What it does |
| --- | --- | --- |
| `smoke.spec.js` | `smoke-seeded`, `smoke-empty` | Visits **every route** in `src/App.jsx` and fails on any **console error**, **uncaught exception**, **failed same-origin request**, or **empty page body**. Runs once as a seeded tenant and once as a tenant with **no data** (to catch null / empty-state crashes). |
| `pages.spec.js` | `pages` | On each app page, **clicks every visible button and link** and asserts *something happens* (URL change, DOM mutation, dialog, or focus) with no console error / exception. Destructive → demo build only. |

The route list lives in `support/routes.js` — keep it in sync with the `<Route>`
table in `src/App.jsx`.

## Two run targets

The suite runs against either the local demo build or a real deployment,
selected by the `E2E_BASE_URL` env var.

### Demo build (default — safe, no secrets)

```bash
npm run test:e2e
```

Builds the app in demo mode (`VITE_DEMO=true`): auto-login as the seeded tenant,
a mock Supabase backend, mock data, and **no outbound network / no real writes**.
The `smoke-empty` project flips a runtime flag so the same server behaves like a
brand-new account with no data. This is what runs on every push (`e2e-demo` job).

### Live deployment (real login, real backend)

```bash
E2E_BASE_URL=https://app.urbantreeservices.net \
E2E_EMAIL=... E2E_PASSWORD=... \
E2E_EMPTY_EMAIL=... E2E_EMPTY_PASSWORD=... \
npx playwright test --project=smoke-seeded --project=smoke-empty
```

The auth fixture drives the **real login form** as the given test tenants. Only
the **smoke** projects run against a live target — smoke merely *loads* pages, so
it never mutates production data. The destructive `pages` sweep is auto-skipped.
Auth-gated routes are skipped for any tenant whose credentials aren't provided.

## CI

`.github/workflows/e2e.yml` runs on every push / PR:

- **`e2e-demo`** — full suite against the demo build (no secrets).
- **`e2e-live`** — smoke against `https://app.urbantreeservices.net` using repo
  secrets `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EMPTY_EMAIL`, `E2E_EMPTY_PASSWORD`.
  Add these in **Settings → Secrets and variables → Actions**. Until they exist,
  the live auth routes skip gracefully (public routes still run).

> ⚠️ Point the live tenants at **isolated test accounts**. The seeded live smoke
> logs in as `E2E_EMAIL`; if that's a real working account it will see real data
> (still read-only). The `empty` tenant should be an account with no jobs/clients.

## Handy commands

```bash
npm run test:e2e                       # full demo suite (all projects)
npm run test:e2e -- --project=pages    # one project
npm run test:e2e:ui                    # Playwright UI mode
npm run test:e2e:report                # open the last HTML report
```
