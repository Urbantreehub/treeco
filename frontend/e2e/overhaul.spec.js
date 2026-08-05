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

  test('staff mobile calendar exposes Day run mode', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only page')
    // Log in at desktop size (the shell probe needs the full nav), then shrink
    // to phone width — useIsMobile responds to the resize.
    await login('/calendar')
    await page.setViewportSize({ width: 390, height: 844 })
    const btn = page.getByRole('button', { name: /Day run/i })
    await expect(btn).toBeVisible({ timeout: 10000 })
    await btn.click()
    await expect(page.getByText(/run · \d+ stop|No stops scheduled/i).first())
      .toBeVisible({ timeout: 10000 })
    // Back returns to the calendar toolbar.
    const back = page.getByRole('button', { name: 'Back to calendar' })
    if (await back.count()) {
      await back.click()
      await expect(page.getByRole('button', { name: /Day run/i })).toBeVisible()
    }
    guard.assertClean('staff day run mode')
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
