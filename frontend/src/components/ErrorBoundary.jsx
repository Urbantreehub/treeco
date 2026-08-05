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
      // Section variant: contain the failure to one panel so the rest of the
      // page stays usable, instead of blanking the whole app. Used to wrap
      // auxiliary panels (e.g. the Spencers/Downer portal panels on a job).
      if (this.props.variant === 'section') {
        return (
          <div role="alert" data-testid="error-boundary-section" style={sectionStyles.box}>
            <div style={sectionStyles.title}>{this.props.label || 'This section'} couldn’t load</div>
            <div style={sectionStyles.msg}>The rest of the job is unaffected. It’s been reported so we can fix it.</div>
            <button type="button" onClick={this.handleReset} style={sectionStyles.btn}>Retry</button>
          </div>
        )
      }
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

const sectionStyles = {
  box: { margin: '16px', padding: '14px 16px', background: '#FFF8F8', border: '1px solid #E6C9C4', borderRadius: 10 },
  title: { fontSize: 13, fontWeight: 700, color: '#A8402F', marginBottom: 4 },
  msg: { fontSize: 12, color: '#8a5a52', lineHeight: 1.5 },
  btn: { marginTop: 10, padding: '7px 14px', borderRadius: 8, border: '1px solid #E0B0AA', background: '#fff', color: '#A8402F', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font)' },
}
