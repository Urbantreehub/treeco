import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🌲</span>
          <h1 style={styles.logoText}>TreeCo</h1>
        </div>

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

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
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
  logoIcon: {
    fontSize: '32px',
  },
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
    transition: 'background 0.15s',
  },
  error: {
    color: 'var(--danger)',
    fontSize: '14px',
    textAlign: 'center',
  },
}
