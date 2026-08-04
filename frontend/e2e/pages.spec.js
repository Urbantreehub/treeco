import { test } from './fixtures/app.js'
import { INTERACTIVE_ROUTES, roleCanAccess } from './support/routes.js'
import { clickEverything } from './support/interactions.js'

// Per-page interaction suite: on each app page, click every visible button and
// link and assert something happens (URL change, DOM mutation, or a dialog) with
// no console error or uncaught exception. Runs once per access level so each
// role's navigation and page controls are exercised.
//
// This suite clicks Save/Create actions, so it writes data. Against the demo
// build that's a mock backend (no-op). Against the live app it writes to the
// test database — controls with real *external* side effects (send SMS/email,
// Xero sync) are skipped in interactions.js so nothing leaves the system.
test.describe('page interactions', () => {
  for (const route of INTERACTIVE_ROUTES) {
    test(`every control does something on ${route.name} (${route.path})`, async ({ page, guard, login, role }, testInfo) => {
      test.skip(!roleCanAccess(role, route.access), `${role} cannot access ${route.name} — it redirects away`)
      const reset = () => login(route.path)
      await reset()
      await clickEverything(page, { reset, guard, testInfo })
    })
  }
})
