import { existsSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

// Local sandboxes ship a pre-installed Chromium at a fixed path (browser
// revision won't match the npm package). Point Playwright at it when present;
// in CI we `playwright install` the matching revision and this stays unset.
const LOCAL_CHROMIUM = '/opt/pw-browsers/chromium'
const executablePath = existsSync(LOCAL_CHROMIUM) ? LOCAL_CHROMIUM : undefined
const launchOptions = executablePath ? { executablePath } : undefined

// Target selection:
//   • E2E_BASE_URL set  → run against that real deployment (real Supabase login).
//                         e.g. E2E_BASE_URL=https://app.urbantreeservices.net
//   • unset             → build + serve the local demo build (mock backend).
const LIVE_URL = process.env.E2E_BASE_URL
const PORT = 4173
const baseURL = LIVE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
    launchOptions,
  },

  projects: [
    // Smoke: visit every route, fail on any console error / uncaught exception /
    // failed fetch / empty body. Run once per tenant. Safe against production
    // (loads pages only, no writes).
    {
      name: 'smoke-seeded',
      testMatch: /smoke\.spec\.js/,
      use: { ...devices['Desktop Chrome'], tenant: 'seeded', launchOptions },
    },
    {
      name: 'smoke-empty',
      testMatch: /smoke\.spec\.js/,
      use: { ...devices['Desktop Chrome'], tenant: 'empty', launchOptions },
    },
    // Per-page interaction suite: click every visible button/link, assert
    // something happens. Destructive → demo build only (skipped when LIVE).
    {
      name: 'pages',
      testMatch: /pages\.spec\.js/,
      use: { ...devices['Desktop Chrome'], tenant: 'seeded', launchOptions },
    },
  ],

  // Only stand up a local server for the demo target. Against a live deployment
  // there is nothing to build — we hit the already-running site.
  webServer: LIVE_URL
    ? undefined
    : {
        // Build once in demo mode (no Supabase → auto-login as the seeded tenant,
        // mock data, no outbound network) then serve the production build.
        command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
        url: baseURL,
        env: { VITE_DEMO: 'true' },
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
})
