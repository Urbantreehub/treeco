import { test, LIVE } from './fixtures/app.js'
import { INTERACTIVE_ROUTES } from './support/routes.js'
import { clickEverything } from './support/interactions.js'

// Per-page interaction suite: on each app page, click every visible button and
// link and assert something happens (URL change, DOM mutation, or a dialog) with
// no console error or uncaught exception. Runs against the seeded tenant so there
// is real data to interact with.
//
// This suite is DESTRUCTIVE — it clicks Save/Create actions — so it runs only
// against the local demo build (mock backend, no real writes), never against a
// live deployment where it could mutate a real tenant's data.
test.describe('page interactions', () => {
  test.skip(LIVE, 'destructive interaction suite runs against the demo build only')

  for (const route of INTERACTIVE_ROUTES) {
    test(`every control does something on ${route.name} (${route.path})`, async ({ page, guard, login }, testInfo) => {
      const reset = () => login(route.path)
      await reset()
      await clickEverything(page, { reset, guard, testInfo })
    })
  }
})
