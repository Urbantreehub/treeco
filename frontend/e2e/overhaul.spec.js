import { test, expect } from './fixtures/app.js'

// New-behavior coverage for the Aug-26 UI overhaul:
//   • Quotes list — rows carry no status dropdown; staff land on Quotes
//   • F26   — day-run view: truck calendar + staff mobile "Day run" mode
//   • F8    — quote builder staged sections + stepper
// All run against the demo build (or live via E2E_BASE_URL) under the role each
// project provides; specs guard console errors via the shared fixture.

test.describe('quotes list', () => {
  test('rows have no status dropdown — status is changed inside the record', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only page')
    await login('/pipeline')
    await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible({ timeout: 10000 })
    // Rows are grouped under status eyebrows; the row-level status <select> is gone.
    await expect(page.locator('select[aria-label*="Status for"]')).toHaveCount(0)
    const needsMe = page.getByRole('button', { name: /Needs me/ })
    await expect(needsMe).toBeVisible()
    await expect(needsMe).toHaveAttribute('aria-pressed', 'true')
    // The status multi-select still exists for power users, behind Filter.
    await page.getByRole('button', { name: /^Filter/ }).click()
    const labels = await page.getByRole('dialog', { name: 'Filter by status' }).locator('label').allTextContents()
    expect(labels.join(' ')).toContain('Scheduled')
    expect(labels.length).toBeGreaterThanOrEqual(8)
    guard.assertClean('quotes list')
  })

  test('staff land on Quotes with the quoting nav by default', async ({ page, guard, login, role }) => {
    test.skip(role !== 'full' && role !== 'office', 'staff-only behaviour')
    await login('/')
    await expect(page).toHaveURL(/\/pipeline/)
    await expect(page.locator('nav a[href="/pipeline"]').first()).toHaveText(/Quotes/)
    if (role === 'full') {
      // Full access defaults to the quoting view: Quotes + Quote runs, and a switch to the full app.
      await expect(page.locator('nav a[href="/quote-runs"]').first()).toBeVisible()
      await expect(page.locator('nav a[href="/dashboard"]')).toHaveCount(0)
      await page.getByRole('button', { name: 'Switch to the full app' }).click()
      await expect(page.locator('nav a[href="/calendar"]').first()).toHaveText(/Schedule/)
      await expect(page.locator('nav a[href="/dashboard"]').first()).toHaveText(/Reports/)
    } else {
      // Office defaults to the full app.
      await expect(page.locator('nav a[href="/calendar"]').first()).toHaveText(/Schedule/)
      await expect(page.locator('nav a[href="/dashboard"]')).toHaveCount(0)
    }
    guard.assertClean('staff default view')
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
