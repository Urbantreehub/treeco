// Capture hash BEFORE any Supabase imports clear it
window.__initialHash = window.location.hash

import React from 'react'
import ReactDOM from 'react-dom/client'
import './config/theme.css'
import { initSentry } from './config/sentry'
import ErrorBoundary from './components/ErrorBoundary'
import App from './App'

// Start Sentry as early as possible so init-time errors are captured too.
// No-op unless VITE_SENTRY_DSN is set.
initSentry()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
