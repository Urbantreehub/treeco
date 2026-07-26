import { expect } from '@playwright/test'

const CONTROLS_SELECTOR = 'button, a[href], [role="button"], [role="tab"]'

// Controls we skip clicking, because their effect is either unobservable via the
// DOM (download / print / clipboard), destructive to the session (sign out), or —
// importantly on the live target — a real EXTERNAL side effect that fires to a
// third party regardless of whether the tenant's *data* is test data: sending an
// SMS (Twilio) or email, pushing to Xero, etc. Writes to the app's own database
// (Save / Create) are fine and are exercised.
const SKIP_TEXT = /download|\bpdf\b|print|export|sign\s?out|log\s?out|\bdelete\b|\bremove\b|copy|share|\bcall\b|email|\bsend\b|\bsms\b|invoice|xero|\bsync\b|notify|resend|reset\s?password/i

/**
 * Enumerate every visible, enabled button/link on the current page and, one at a
 * time, click it and assert *something happens* — a URL change, a DOM mutation,
 * or a dialog opening — with no console error or uncaught exception. The page is
 * reset (re-navigated) before each click so controls are tested in isolation and
 * state from one doesn't mask the next.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {() => Promise<void>} opts.reset  Re-navigate to the page under test.
 * @param {import('./guards.js').attachPageGuard extends (...a:any)=>infer R ? R : any} opts.guard
 * @param {import('@playwright/test').TestInfo} [opts.testInfo]
 * @param {number} [opts.max]  Cap on controls exercised (bounds runtime).
 */
export async function clickEverything(page, { reset, guard, testInfo, max = 24 }) {
  // Native dialogs (confirm/alert) would otherwise block the click forever.
  page.on('dialog', (d) => d.dismiss().catch(() => {}))

  const meta = await page.$$eval(CONTROLS_SELECTOR, (els) =>
    els.map((el, i) => {
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.pointerEvents !== 'none'
      return {
        i,
        text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 60),
        href: el.getAttribute('href'),
        target: el.getAttribute('target'),
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        inNav: !!el.closest('nav'),
        visible,
      }
    })
  )

  const keepers = meta.filter((m) => {
    if (!m.visible || m.disabled) return false
    if (m.inNav) return false // nav links are already exercised by the smoke walk
    if (m.target === '_blank') return false
    if (m.href && /^(https?:|tel:|mailto:)/i.test(m.href)) return false
    if (SKIP_TEXT.test(m.text)) return false
    return true
  })

  const total = keepers.length

  // A page with no actionable controls (e.g. a data-dependent detail page that
  // has nothing to show in the mock-backend demo) has nothing to interact with —
  // annotate and skip rather than fail. The smoke suite already asserts it rendered.
  if (total === 0) {
    if (testInfo) testInfo.annotations.push({ type: 'note', description: 'No interactive controls to exercise' })
    return
  }

  const exercised = keepers.slice(0, max)
  if (total > max && testInfo) {
    testInfo.annotations.push({ type: 'note', description: `Capped interactions: ${max}/${total} controls` })
  }

  const inert = []

  for (const control of exercised) {
    const before = guard.problems().length

    await reset()

    // Arm a mutation counter and record the focused element, both of which
    // survive until the next navigation.
    await page.evaluate(() => {
      window.__e2eMutations = 0
      window.__e2eActiveBefore = document.activeElement
      if (window.__e2eObs) window.__e2eObs.disconnect()
      window.__e2eObs = new MutationObserver((muts) => {
        window.__e2eMutations += muts.length
      })
      window.__e2eObs.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      })
    })

    const beforeUrl = page.url()
    const target = page.locator(CONTROLS_SELECTOR).nth(control.i)

    try {
      await target.click({ timeout: 5000 })
    } catch (err) {
      // A control that can't be clicked (detached/covered) is worth surfacing,
      // but re-check it's still meant to be here rather than a transient overlay.
      inert.push(`«${control.text || control.href}» click failed: ${String(err).split('\n')[0]}`)
      continue
    }

    // Poll briefly for any observable effect: a navigation, a DOM mutation, a
    // dialog, or focus moving onto the control (which distinguishes a real
    // interactive control — e.g. an already-active tab that correctly no-ops —
    // from a truly dead element that ignores the click entirely).
    let changed = false
    for (let attempt = 0; attempt < 8 && !changed; attempt++) {
      const [mutations, dialogs, focusMoved] = await Promise.all([
        page.evaluate(() => window.__e2eMutations || 0),
        page.locator('[role="dialog"], [aria-modal="true"]').count(),
        page.evaluate(() => document.activeElement !== window.__e2eActiveBefore && document.activeElement !== document.body),
      ])
      changed = page.url() !== beforeUrl || mutations > 0 || dialogs > 0 || focusMoved
      if (!changed) await page.waitForTimeout(100)
    }

    // No new runtime problems may have appeared from this click.
    const after = guard.problems()
    expect(
      after.length,
      `clicking «${control.text || control.href}» on this page produced runtime problems:\n${after.slice(before).join('\n')}`
    ).toBe(before)

    if (!changed) inert.push(`«${control.text || control.href}» produced no visible change`)
  }

  expect(inert, `some controls did nothing / failed:\n${inert.join('\n')}`).toEqual([])
}
