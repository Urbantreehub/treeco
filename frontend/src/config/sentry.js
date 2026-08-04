import * as Sentry from '@sentry/react'

// Sentry is opt-in: it only initialises when a DSN is provided at build time.
// This keeps demo builds, local dev, and the e2e suite completely offline —
// no network calls, no noise — while production (with VITE_SENTRY_DSN set)
// gets full error + performance reporting.
const DSN = import.meta.env.VITE_SENTRY_DSN

export const sentryEnabled = Boolean(DSN)

export function initSentry() {
  if (!sentryEnabled) return

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.VITE_SENTRY_ENV ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    // Browser tracing + session replay give us the request/route context that
    // makes an uncaught error actionable. Sample rates are conservative and can
    // be tuned per-environment via env vars without a code change.
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_RATE ?? 0.1),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  })
}

// Thin re-export so callers (e.g. the error boundary) never import the SDK
// directly — if Sentry is disabled these become no-ops.
export function captureException(error, context) {
  if (!sentryEnabled) return
  Sentry.captureException(error, context)
}

export { Sentry }
