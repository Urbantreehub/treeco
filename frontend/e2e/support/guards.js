import { expect } from '@playwright/test'

// Substrings of URLs whose failures we deliberately ignore. These are
// third-party or best-effort resources whose failure is not an app crash:
// favicons, source maps, and map tiles (Leaflet/CarTrack) that legitimately
// won't load inside a sandboxed CI runner with no outbound network.
const IGNORED_REQUEST_SUBSTRINGS = [
  'favicon',
  '.map',
  'tile.openstreetmap',
  'openstreetmap.org',
  'basemaps',
  'cartrack',
  'unpkg.com',
  'leaflet',
  'google',
  'gstatic',
  'fonts.googleapis',
]

// Console messages we never treat as failures. Kept deliberately tiny — the
// point of the smoke suite is to be strict. Production React (the preview build
// the suite runs against) does not emit dev warnings, so this list stays short.
const IGNORED_CONSOLE_SUBSTRINGS = [
  'Download the React DevTools',
  '[vite]',
]

function isIgnoredRequest(url) {
  return IGNORED_REQUEST_SUBSTRINGS.some((s) => url.includes(s))
}

function isIgnoredConsole(text) {
  return IGNORED_CONSOLE_SUBSTRINGS.some((s) => text.includes(s))
}

/**
 * Attaches listeners to a page and accumulates every signal the smoke suite
 * cares about: console errors, uncaught exceptions, and failed same-origin
 * network requests. Returns a handle with the collected problems plus an
 * `assertClean()` helper.
 */
export function attachPageGuard(page, baseURL) {
  const origin = baseURL ? new URL(baseURL).origin : null
  const consoleErrors = []
  const pageErrors = []
  const failedRequests = []

  const sameOrigin = (url) => !origin || url.startsWith(origin)

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isIgnoredConsole(text)) return
    // A failed resource load (image, stylesheet, script) surfaces as a generic
    // "Failed to load resource" console error whose URL lives in the location,
    // not the text. Apply the same origin/ignore filter we use for requests so a
    // sandboxed CI runner blocking a CDN asset isn't mistaken for an app bug.
    const locUrl = msg.location()?.url ?? ''
    if (locUrl && (!sameOrigin(locUrl) || isIgnoredRequest(locUrl))) return
    consoleErrors.push(locUrl ? `${text} — ${locUrl}` : text)
  })

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err))
  })

  page.on('requestfailed', (req) => {
    const url = req.url()
    if (!sameOrigin(url) || isIgnoredRequest(url)) return
    // net::ERR_ABORTED fires for navigations the browser intentionally cancels
    // (e.g. client-side redirects) — not a real failure.
    const failure = req.failure()
    if (failure && failure.errorText === 'net::ERR_ABORTED') return
    failedRequests.push(`${req.method()} ${url} — ${failure?.errorText ?? 'failed'}`)
  })

  page.on('response', (res) => {
    const url = res.url()
    if (!sameOrigin(url) || isIgnoredRequest(url)) return
    if (res.status() >= 400) {
      failedRequests.push(`${res.status()} ${res.request().method()} ${url}`)
    }
  })

  return {
    consoleErrors,
    pageErrors,
    failedRequests,
    problems() {
      return [
        ...consoleErrors.map((e) => `console.error: ${e}`),
        ...pageErrors.map((e) => `uncaught: ${e}`),
        ...failedRequests.map((e) => `network: ${e}`),
      ]
    },
    assertClean(context = '') {
      const problems = this.problems()
      expect(problems, `${context} produced runtime problems:\n${problems.join('\n')}`).toEqual([])
    },
  }
}

/**
 * Asserts the page actually rendered something — guards against the blank-white
 * "app mounted but crashed to nothing" failure mode. Checks both that #root has
 * element children and that the visible text is non-trivial.
 */
export async function assertNonEmptyBody(page, context = '') {
  const rootChildren = await page.locator('#root > *').count()
  expect(rootChildren, `${context}: #root has no children (empty page body)`).toBeGreaterThan(0)

  const text = (await page.locator('body').innerText()).trim()
  expect(text.length, `${context}: page body has no visible text`).toBeGreaterThan(0)
}
