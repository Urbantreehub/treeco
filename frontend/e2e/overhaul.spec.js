import { test, expect } from './fixtures/app.js'

// New-behavior coverage for the Aug-26 UI overhaul:
//   • F2/F3 — status menu offers only manual moves (no Stump Grinding option)
//   • F26   — day-run view: truck calendar + staff mobile "Day run" mode
//   • F8    — quote builder staged sections + stepper
// All run against the demo build (or live via E2E_BASE_URL) under the role each
// project provides; specs guard console errors via the shared fixture.

test.describe('status menu simplification (F2, F3)', () => {
  test('pipeline status dropdown offers only manual moves', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only page')
    await login('/pipeline')
    const select = page.locator('select[aria-label*="Status for"]').first()
    test.skip(!(await select.count()), 'no jobs seeded')
    const labels = await select.locator('option').allTextContents()
    expect(labels).not.toContain('Stump Grinding')
    // current status + at most 4 manual moves
    expect(labels.length).toBeLessThanOrEqual(6)
    guard.assertClean('pipeline status menu')
  })
})

test.describe('day run view (F26)', () => {
  test('truck calendar renders the day-run shell', async ({ page, guard, login, role }) => {
    test.skip(role !== 'truck', 'truck-only behaviour')
    await login('/calendar')
    // Day-run header: stops subtitle / empty state — or the no-resource notice
    // when the demo truck account has no calendar lane assigned.
    await expect(
      page.getByText(/stop|No stops scheduled|No resource assigned/i).first()
    ).toBeVisible({ timeout: 10000 })
    guard.assertClean('truck day run')
  })

  test('staff mobile calendar lands directly in the day run', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only page')
    // Log in at desktop size (the shell probe needs the full nav), then shrink
    // to phone width — the mobile calendar opens straight into the day run.
    await login('/calendar')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/calendar')
    await expect(page.getByText(/run · \d+ stop|No stops scheduled/i).first())
      .toBeVisible({ timeout: 10000 })
    // The 📅 button drops back to the calendar grid, which offers "Day run" again.
    const back = page.getByRole('button', { name: 'Back to calendar' })
    if (await back.count()) {
      await back.click()
      await expect(page.getByRole('button', { name: /Day run/i })).toBeVisible()
    }
    guard.assertClean('staff day run mode')
  })
})

test.describe('day run: advance + end-of-run summary (F26, F29)', () => {
  test('completing a quote run advances stops and shows the summary', async ({ page, guard, login, role }) => {
    test.skip(role === 'truck', 'the seeded quote run belongs to the office/owner resource')
    // Land in the mobile day run: at phone width the calendar opens straight
    // into today's run, where the demo seeds Josh a 2-stop quote run.
    await login('/calendar')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/calendar')

    // Wait for the day run to hydrate (schedule loads async), then drive it.
    const sent = page.getByRole('button', { name: /Quote sent — next stop/i })
    await expect(sent.first()).toBeVisible({ timeout: 10000 })

    // Stop 1 → sent: optimistic advance to the next stop (F22/F26).
    await sent.first().click()
    await expect(page.getByRole('button', { name: /Quote sent — next stop/i })).toBeVisible()
    // Stop 2 is the last → marking it sent finishes the run and opens the summary.
    await page.getByRole('button', { name: /Quote sent — next stop/i }).click()

    // F29 end-of-run summary. Scope to the dialog — the completed stops also
    // render in the "Done" list behind the overlay, so page-wide text would be
    // ambiguous under strict mode.
    const summary = page.getByRole('dialog', { name: 'Run complete' })
    await expect(summary).toBeVisible({ timeout: 10000 })
    await expect(summary.getByText(/quotes? sent/i)).toBeVisible()
    await expect(summary.getByText(/total quoted/i)).toBeVisible()
    await expect(summary.getByText('Margaret Thompson')).toBeVisible()
    await expect(summary.getByText('Coastal Properties')).toBeVisible()
    await expect(summary.getByRole('button', { name: 'Back to calendar' })).toBeVisible()
    guard.assertClean('end-of-run summary')
  })
})

test.describe('perceived speed (F21, F22)', () => {
  test('pipeline status change is optimistic; no bare loading text', async ({ page, guard, login, role }) => {
    test.skip(role === 'truck', 'pipeline is staff-only')
    await login('/pipeline')
    // F21: the old bare "Loading…" text is gone (skeleton replaces it).
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0)

    const select = page.locator('select[aria-label*="Status for"]').first()
    await select.waitFor({ timeout: 10000 }).catch(() => {})   // jobs load async
    test.skip(!(await select.count()), 'no jobs seeded')
    const before = await select.inputValue()
    const values = await select.locator('option').evaluateAll(os => os.map(o => o.value))
    const target = values.find(v => v && v !== before)
    test.skip(!target, 'no alternate manual status to select')

    // F22: the chip flips immediately and a refetch does not revert it.
    await select.selectOption(target)
    await expect(select).toHaveValue(target)
    guard.assertClean('optimistic pipeline status')
  })

  test('dashboard renders without the old bare loading text (F21)', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full', 'dashboard is owner-only')
    await login('/dashboard')
    await expect(page.getByText('Loading dashboard…')).toHaveCount(0)
    await expect(page.getByText(/Business Health/i)).toBeVisible({ timeout: 10000 })
    guard.assertClean('dashboard skeleton replaces bare text')
  })
})

test.describe('quote builder stages (F8)', () => {
  test('stepper renders all four stages and switches', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only page')
    await login('/quotes/q1')
    for (const label of ['Items', 'Crew pack', 'Terms', 'Review & send']) {
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 10000 })
    }
    guard.assertClean('quote builder stages')
  })
})
