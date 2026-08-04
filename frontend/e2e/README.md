# End-to-end tests (Playwright)

Fast, crash-hunting e2e coverage for the TreeCo PWA.

## What it checks

| Spec | Project(s) | What it does |
| --- | --- | --- |
| `smoke.spec.js` | `smoke-<role>-<tenant>` | Visits **every route** in `src/App.jsx` and fails on any **console error**, **uncaught exception**, **failed same-origin request**, or **empty page body**. |
| `pages.spec.js` | `pages-<role>` | On each app page, **clicks every visible button and link** and asserts *something happens* (URL change, DOM mutation, dialog, or focus) with no console error / exception. Destructive → demo build only. |

**Every user is covered.** The demo build runs as each access level —
`full` (owner), `office` (staff), `truck` (shared crew iPad: calendar + work
orders), and `restricted` (crew/individual staff: docs, chat, safety) — so role
guards, redirects, and role-specific navigation are all exercised. Smoke
additionally runs against a **seeded** tenant and a tenant with **no data** (to
catch null / empty-state crashes), giving `role × tenant` smoke coverage. The
interaction sweep skips any route a role can't reach (it would just redirect away).

The route list — with each route's minimum access level — lives in
`support/routes.js`. Keep it in sync with the `<Route>` table in `src/App.jsx`.

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

The live app (`app.urbantreeservices.net`) is a **test environment**, so the full
suite — smoke *and* the destructive interaction sweep — runs against it:

```bash
E2E_BASE_URL=https://app.urbantreeservices.net \
E2E_EMAIL=... E2E_PASSWORD=... \
npm run test:e2e
```

The auth fixture drives the **real login form**. On a live target a role isn't a
toggle — it's a property of the account you log into — so each `role × tenant`
project logs in as its **own real test account**, read from env:

| Project(s) | Account env vars |
| --- | --- |
| `smoke-full-*`, `pages-full` (seeded) | `E2E_EMAIL` / `E2E_PASSWORD` |
| `smoke-full-empty` (no data) | `E2E_EMPTY_EMAIL` / `E2E_EMPTY_PASSWORD` |
| `smoke-office-seeded`, `pages-office` | `E2E_OFFICE_EMAIL` / `E2E_OFFICE_PASSWORD` |
| `smoke-truck-seeded`, `pages-truck` | `E2E_TRUCK_EMAIL` / `E2E_TRUCK_PASSWORD` |
| `smoke-restricted-seeded`, `pages-restricted` | `E2E_CREW_EMAIL` / `E2E_CREW_PASSWORD` |

Any project whose account isn't configured **skips automatically**, so you only
provide the accounts you have. The interaction sweep writes to the test database,
but every Supabase **edge-function** call is intercepted and stubbed during the
sweep (see `support/interactions.js`), so real external side effects (send
SMS/email via Twilio, push to Xero) never fire no matter which button is clicked.
Obvious external-comms buttons are also skipped by label (`SKIP_TEXT`).

## CI

`.github/workflows/e2e.yml` runs on every push / PR:

- **`e2e-demo`** — full suite against the demo build (no secrets).
- **`e2e-live`** — full suite against `https://app.urbantreeservices.net` using
  the account secrets in the table above. Add them in **Settings → Secrets and
  variables → Actions**. Any account you don't add just skips.

> ⚠️ The live accounts should be **test accounts** on the test deployment. The
> interaction sweep creates records; external-comms/integration buttons are
> skipped, but everything else (Save/Create) writes to that database.

## Handy commands

```bash
npm run test:e2e                       # full demo suite (all projects)
npm run test:e2e -- --project=pages    # one project
npm run test:e2e:ui                    # Playwright UI mode
npm run test:e2e:report                # open the last HTML report
```
