import { test, expect } from './fixtures/app.js'
import { ALL_ROUTES } from './support/routes.js'
import { assertNonEmptyBody } from './support/guards.js'

// Smoke suite: visit every route declared in the router and fail on ANY
// console error, uncaught exception, failed same-origin request, or empty body.
//
// Runs twice via playwright.config projects:
//   • smoke-seeded — the seeded test tenant (has jobs, clients, quotes)
//   • smoke-empty  — a tenant with no data, to catch null / empty-state crashes
//                    the seeded run would never hit.
//
// Target is chosen by env: the local demo build by default, or a real
// deployment (E2E_BASE_URL, e.g. https://app.urbantreeservices.net) with a real
// login. Smoke only *loads* pages, so it is safe to run against production.

test.describe('route smoke', () => {
  for (const route of ALL_ROUTES) {
    test(`renders ${route.name} (${route.path})`, async ({ page, guard, login }) => {
      if (route.auth) {
        // Authenticate (real login on live, auto-login on demo), then land on route.
        await login(route.path)
      } else {
        await page.goto(route.path)
        await expect(page.locator('#root > *').first()).toBeVisible({ timeout: 15000 })
      }

      // Let effects / lazy chunks / client-side redirects settle so async errors
      // surface to the guard before we assert.
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})

      await assertNonEmptyBody(page, route.name)
      guard.assertClean(route.name)
    })
  }
})
