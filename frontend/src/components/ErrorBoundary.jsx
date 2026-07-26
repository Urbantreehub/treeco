import { Component } from 'react'
import { captureException } from '../config/sentry'

// App-wide error boundary. React only surfaces render/lifecycle errors to class
// components, so this stays a class. It reports the crash to Sentry (a no-op
// when Sentry is disabled) and renders a recoverable fallback instead of the
// blank white screen React shows for an unhandled render error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    captureException(error, { extra: { componentStack: info?.componentStack } })
    // Keep a console trail too — the e2e smoke suite asserts on console errors,
    // so a caught crash still fails the build loudly rather than passing silently.
    console.error('ErrorBoundary caught an error:', error)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid="error-boundary"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            minHeight: '100dvh',
            padding: 24,
            textAlign: 'center',
            color: 'var(--ink)',
            background: 'var(--cream)',
            font: 'var(--font)',
          }}
        >
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--bark)' }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: 420, color: 'var(--ink-mid)' }}>
            The page hit an unexpected error. You can try again, and the problem has been
            reported so we can fix it.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: 'var(--terra)',
                color: 'var(--cream)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/' }}
              style={{
                padding: '10px 20px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              Go home
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
