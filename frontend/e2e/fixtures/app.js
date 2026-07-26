import { test as base, expect } from '@playwright/test'
import { attachPageGuard } from '../support/guards.js'

// A link present in every navigation variant (full / office / crew), so it's a
// reliable "the authenticated app shell has rendered" signal.
const APP_SHELL_SELECTOR = 'a[href="/calendar"]'

// When E2E_BASE_URL is set the suite runs against a real deployment
// (e.g. https://app.urbantreeservices.net) with a real Supabase backend, so the
// auth fixture drives the actual login form. Otherwise it runs against the local
// demo build, which auto-logs-in as the seeded tenant with mock data.
const LIVE = Boolean(process.env.E2E_BASE_URL)

// Credentials for the live run come from the environment (GitHub Actions
// secrets) — never hardcoded. On a live deployment a role isn't a toggle; it's a
// property of the account you log into. So each (role × tenant) maps to its own
// real test account. Combinations with no configured account are skipped, so you
// only need to provide the accounts you actually have.
const LIVE_ACCOUNTS = {
  'full:seeded': ['E2E_EMAIL', 'E2E_PASSWORD'],
  'full:empty': ['E2E_EMPTY_EMAIL', 'E2E_EMPTY_PASSWORD'],
  'office:seeded': ['E2E_OFFICE_EMAIL', 'E2E_OFFICE_PASSWORD'],
  'crew:seeded': ['E2E_CREW_EMAIL', 'E2E_CREW_PASSWORD'],
}

function liveCredentials(role, tenant) {
  const [emailVar, passwordVar] = LIVE_ACCOUNTS[`${role}:${tenant}`] ?? []
  return { email: process.env[emailVar], password: process.env[passwordVar], emailVar }
}

/**
 * Extended Playwright test with:
 *
 *  - `tenant`   a per-project option: 'seeded' (default) or 'empty'.
 *               • demo target: flips a runtime flag (src/demo/mockData.js) so the
 *                 same server behaves like a brand-new account with no data.
 *               • live target: selects which real test-tenant account to log in as.
 *  - `context`  overridden to inject the demo empty-tenant flag before any page
 *               script runs (no-op on the live target).
 *  - `guard`    auto-attached collector of console errors, uncaught exceptions,
 *               and failed same-origin requests. Attached before navigation.
 *  - `login`    helper that authenticates as the tenant and lands on the given
 *               app route with the shell rendered. Real form login on the live
 *               target; demo auto-login otherwise. Session is reused across a
 *               worker so we log in once, not per test.
 */
export const test = base.extend({
  // Per-project options. Set via `use: { tenant, role }` in playwright.config.
  tenant: ['seeded', { option: true }],
  // 'full' | 'office' | 'crew' — which access level the demo tenant assumes.
  role: ['full', { option: true }],

  context: async ({ context, tenant, role }, use) => {
    // Demo target only: inject the empty-tenant and role flags before any page
    // script runs, so every navigation sees them. On a live target these are
    // no-ops — the tenant's data and the account's role are whatever they are.
    if (!LIVE && (tenant === 'empty' || role !== 'full')) {
      await context.addInitScript(
        ({ empty, roleValue }) => {
          try {
            if (empty) window.localStorage.setItem('treeco:e2e:empty-tenant', '1')
            if (roleValue && roleValue !== 'full') window.localStorage.setItem('treeco:e2e:role', roleValue)
          } catch {
            /* localStorage unavailable — nothing to do */
          }
        },
        { empty: tenant === 'empty', roleValue: role }
      )
    }
    await use(context)
  },

  guard: async ({ page, baseURL }, use) => {
    const guard = attachPageGuard(page, baseURL)
    await use(guard)
  },

  login: async ({ page, tenant, role }, use) => {
    let authed = false

    async function realLogin() {
      const { email, password, emailVar } = liveCredentials(role, tenant)
      if (!email || !password) {
        test.skip(true, `Live run needs a ${role}/${tenant} test account (${emailVar ?? `${role}:${tenant}`} not configured)`)
      }
      await page.goto('/login')
      await page.getByLabel('Email').fill(email)
      await page.getByLabel('Password', { exact: true }).fill(password)
      await page.getByRole('button', { name: /sign in/i }).click()
      await expect(page.locator(APP_SHELL_SELECTOR).first()).toBeVisible({ timeout: 20000 })
      authed = true
    }

    /**
     * Navigate to an authenticated route and wait for the app shell.
     * @param {string} path
     */
    const login = async (path = '/') => {
      if (LIVE && !authed) await realLogin()
      await page.goto(path)
      await expect(page.locator(APP_SHELL_SELECTOR).first()).toBeVisible({ timeout: 20000 })
      return page
    }

    await use(login)
  },
})

export { expect }
export { APP_SHELL_SELECTOR, LIVE }
