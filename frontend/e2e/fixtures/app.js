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
// secrets) — never hardcoded. Each tenant has its own account.
const CREDENTIALS = {
  seeded: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  empty: { email: process.env.E2E_EMPTY_EMAIL, password: process.env.E2E_EMPTY_PASSWORD },
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
  // Per-project option. Set via `use: { tenant: 'empty' }` in playwright.config.
  tenant: ['seeded', { option: true }],

  context: async ({ context, tenant }, use) => {
    if (!LIVE && tenant === 'empty') {
      await context.addInitScript(() => {
        try {
          window.localStorage.setItem('treeco:e2e:empty-tenant', '1')
        } catch {
          /* localStorage unavailable — nothing to do */
        }
      })
    }
    await use(context)
  },

  guard: async ({ page, baseURL }, use) => {
    const guard = attachPageGuard(page, baseURL)
    await use(guard)
  },

  login: async ({ page, tenant }, use) => {
    let authed = false

    async function realLogin() {
      const { email, password } = CREDENTIALS[tenant]
      if (!email || !password) {
        test.skip(true, `Live run needs ${tenant} tenant credentials (E2E_${tenant === 'empty' ? 'EMPTY_' : ''}EMAIL / _PASSWORD)`)
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
