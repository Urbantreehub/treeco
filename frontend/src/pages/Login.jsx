import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../config/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'reset' | 'set-password'
  const [resetSent, setResetSent] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [settingPassword, setSettingPassword] = useState(false)

  // Supabase clears window.location.hash before Login mounts, so we read
  // window.__initialHash set in index.html before any module scripts run.
  // Only switch to set-password if there is NO existing session — prevents
  // a logged-in user accidentally triggering this by visiting /login with a hash.
  useEffect(() => {
    const hash = window.__initialHash || ''
    if (hash) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const type = params.get('type')
      const accessToken = params.get('access_token')
      if ((type === 'invite' || type === 'recovery') && accessToken) {
        // Only show set-password if not already logged in
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) setMode('set-password')
        })
        return
      }
    }
    // Fallback: catch PASSWORD_RECOVERY event if hash already processed by Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setMode('set-password')
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSetPassword(e) {
    e.preventDefault()
    if (!newPassword || newPassword.length < 8) { setError('Password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return }
    setError(null)
    setSettingPassword(true)
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    setSettingPassword(false)
    if (err) { setError(err.message); return }
    navigate('/', { replace: true })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const err = await signIn(email, password)
    if (err) {
      setError('Incorrect email or password.')
      setLoading(false)
    } else {
      navigate('/', { replace: true })
    }
  }

  async function handleReset(e) {
    e.preventDefault()
    if (!resetEmail.trim()) return
    setResetLoading(true)
    setError(null)
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/settings?tab=account`,
    })
    setResetLoading(false)
    if (resetErr) {
      setError(resetErr.message)
    } else {
      setResetSent(true)
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🌲</span>
          <h1 style={styles.logoText}>TreeCo</h1>
        </div>

        {mode === 'set-password' ? (
          <form onSubmit={handleSetPassword} style={styles.form}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--bark)', marginBottom: '4px' }}>Set your password</div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '16px', lineHeight: 1.5 }}>
              Choose a password to complete your account setup.
            </div>
            <label style={styles.label}>
              New password
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                required autoFocus autoComplete="new-password" style={styles.input} placeholder="At least 8 characters" />
            </label>
            <label style={styles.label}>
              Confirm password
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                required autoComplete="new-password" style={styles.input} />
            </label>
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" disabled={settingPassword} style={styles.button}>
              {settingPassword ? 'Setting password…' : 'Set password & sign in'}
            </button>
          </form>
        ) : mode === 'login' ? (
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>
              Email
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={styles.input}
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={styles.label}>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={styles.input}
                />
              </label>
              <button
                type="button"
                style={styles.forgotLink}
                onClick={() => { setMode('reset'); setResetEmail(email); setError(null) }}
              >
                Forgot your password?
              </button>
            </div>

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : resetSent ? (
          <div style={styles.resetSuccess}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>✉️</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--bark)', marginBottom: '8px' }}>Check your email</div>
            <div style={{ fontSize: '14px', color: '#888', lineHeight: 1.6, textAlign: 'center' }}>
              We sent a password reset link to <strong>{resetEmail}</strong>. Click the link in the email to set a new password.
            </div>
            <button
              type="button"
              style={{ ...styles.button, marginTop: '24px', background: 'none', color: 'var(--moss)', border: '1.5px solid var(--moss)' }}
              onClick={() => { setMode('login'); setResetSent(false) }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleReset} style={styles.form}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--bark)', marginBottom: '4px' }}>Reset your password</div>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '4px', lineHeight: 1.5 }}>
              Enter your email and we'll send you a link to set a new password.
            </div>

            <label style={styles.label}>
              Email
              <input
                type="email"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
                style={styles.input}
              />
            </label>

            {error && <p style={styles.error}>{error}</p>}

            <button type="submit" disabled={resetLoading} style={styles.button}>
              {resetLoading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              style={{ ...styles.forgotLink, textAlign: 'center' }}
              onClick={() => { setMode('login'); setError(null) }}
            >
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--cream)',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '400px',
    border: '1px solid var(--border)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '36px',
    justifyContent: 'center',
  },
  logoIcon: { fontSize: '32px' },
  logoText: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'var(--bark)',
    letterSpacing: '-0.5px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--bark)',
  },
  input: {
    padding: '12px 14px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--border)',
    fontSize: '16px',
    fontFamily: 'var(--font)',
    background: 'var(--cream)',
    color: 'var(--bark)',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  button: {
    marginTop: '8px',
    padding: '14px',
    background: 'var(--moss)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.15s',
    fontFamily: 'var(--font)',
  },
  forgotLink: {
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'right',
    fontFamily: 'var(--font)',
    padding: 0,
    textDecoration: 'underline',
  },
  error: {
    color: 'var(--danger)',
    fontSize: '14px',
    textAlign: 'center',
    margin: 0,
  },
  resetSuccess: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '8px 0',
  },
}
