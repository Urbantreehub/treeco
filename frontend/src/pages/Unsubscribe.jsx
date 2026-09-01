import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { COMPANY } from '../config/company'

// Public, no-auth unsubscribe (/unsubscribe/:token).
//
// This page is a legal requirement, not a feature: the Unsolicited Electronic
// Messages Act 2007 requires a functional unsubscribe facility that stays live
// for 30 days after a send and is actioned within 5 working days. So it is kept
// deliberately dumb — two RPCs, no auth, no data loading beyond the one contact,
// no dependency on anything that can be broken by a change elsewhere in the app.
//
// It does NOT unsubscribe on page load. Corporate mail scanners prefetch every
// link in an email; a GET that opts someone out would silently unsubscribe
// people who never clicked. One explicit button press, then done.

const REASONS = [
  { value: '',                label: 'Prefer not to say' },
  { value: 'too_frequent',    label: 'Too many emails' },
  { value: 'not_relevant',    label: 'Not relevant to me' },
  { value: 'never_signed_up', label: "I never signed up for this" },
  { value: 'other',           label: 'Something else' },
]

export default function Unsubscribe() {
  const { token } = useParams()
  const [state, setState]   = useState('loading')  // loading | ready | done | unknown | error
  const [contact, setContact] = useState(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!token) { setState('unknown'); return }
      try {
        const { data, error } = await supabase.rpc('campaign_unsubscribe_info', { p_token: token })
        if (!alive) return
        if (error) { setState('error'); return }
        const row = Array.isArray(data) ? data[0] : data
        if (!row) { setState('unknown'); return }
        setContact(row)
        setState(row.unsubscribed ? 'done' : 'ready')
      } catch {
        if (alive) setState('error')
      }
    }
    load()
    return () => { alive = false }
  }, [token])

  async function confirm() {
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('campaign_unsubscribe', {
        p_token: token,
        p_reason: reason || null,
      })
      if (error) throw error
      const row = Array.isArray(data) ? data[0] : data
      if (row?.email) setContact(c => ({ ...(c ?? {}), email: row.email }))
      setState('done')
    } catch {
      setState('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={s.page}>
      <header style={s.brandBar}>
        <a href={`https://${COMPANY.website}`} style={s.brand}>🌲 {COMPANY.shortName}</a>
        <a href={`tel:${COMPANY.phoneRaw}`} style={s.brandPhone}>{COMPANY.phone}</a>
      </header>

      <div style={s.wrap}>
        <div style={s.card}>
          {state === 'loading' && (
            <>
              <h1 style={s.h1}>Just a moment…</h1>
              <p style={s.body}>Looking up your email preferences.</p>
            </>
          )}

          {state === 'ready' && (
            <>
              <h1 style={s.h1}>
                {contact?.first_name ? `Sorry to see you go, ${contact.first_name}.` : 'Unsubscribe'}
              </h1>
              <p style={s.body}>
                Click below and we'll stop sending marketing emails to:
              </p>
              <div style={s.email}>{contact?.email}</div>

              <label style={s.label} htmlFor="unsub-reason">If you don't mind saying why (optional)</label>
              <select id="unsub-reason" style={s.select} value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>

              <button style={{ ...s.btn, opacity: busy ? 0.6 : 1 }} onClick={confirm} disabled={busy}>
                {busy ? 'Unsubscribing…' : 'Unsubscribe me'}
              </button>

              <p style={s.fine}>
                This only stops marketing emails. We'll still email you about any job, quote or
                invoice you have with us.
              </p>
            </>
          )}

          {state === 'done' && (
            <>
              <div style={s.tick}>✓</div>
              <h1 style={s.h1}>You're unsubscribed</h1>
              <p style={s.body}>
                {contact?.email ? <><strong>{contact.email}</strong> has been removed from our mailing list.</>
                  : 'That address has been removed from our mailing list.'}
                {' '}You won't get any more marketing emails from us.
              </p>
              <p style={s.fine}>
                If you ever want tree work done, we're still just a phone call away —{' '}
                <a href={`tel:${COMPANY.phoneRaw}`} style={s.link}>{COMPANY.phone}</a>.
              </p>
              <a href={`https://${COMPANY.website}`} style={s.btnGhost}>Back to our website</a>
            </>
          )}

          {state === 'unknown' && (
            <>
              <h1 style={s.h1}>We couldn't find that link</h1>
              <p style={s.body}>
                This unsubscribe link doesn't match anyone on our list. It may have already been
                used, or been broken by your email app when it wrapped the line.
              </p>
              <p style={s.body}>
                Either way, we don't want to email anyone who'd rather we didn't. Email{' '}
                <a href={`mailto:${COMPANY.email}?subject=Unsubscribe`} style={s.link}>{COMPANY.email}</a>{' '}
                or call <a href={`tel:${COMPANY.phoneRaw}`} style={s.link}>{COMPANY.phone}</a> and we'll
                take you off by hand.
              </p>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 style={s.h1}>Something went wrong</h1>
              <p style={s.body}>
                We couldn't process that just now. Please try again — or, so you're not stuck,
                email <a href={`mailto:${COMPANY.email}?subject=Unsubscribe`} style={s.link}>{COMPANY.email}</a>{' '}
                and we'll remove you manually.
              </p>
              <button style={s.btn} onClick={() => { setState('loading'); window.location.reload() }}>Try again</button>
            </>
          )}
        </div>

        <div style={s.footer}>
          {COMPANY.name} · {COMPANY.phone} · {COMPANY.email}
        </div>
      </div>
    </div>
  )
}

const s = {
  page:       { minHeight: '100dvh', background: 'var(--cream)', color: 'var(--ink)' },
  brandBar:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ink)', color: '#fff' },
  brand:      { color: '#fff', fontWeight: 800, fontSize: 16, textDecoration: 'none' },
  brandPhone: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600, textDecoration: 'none' },
  wrap:       { maxWidth: 520, margin: '0 auto', padding: '40px 20px 60px' },
  card:       { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  tick:       { width: 44, height: 44, borderRadius: '50%', background: '#E8F0E6', color: '#3A5C2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800 },
  h1:         { fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: '-0.4px', lineHeight: 1.25 },
  body:       { fontSize: 15, color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 },
  email:      { fontSize: 15, fontWeight: 700, color: 'var(--ink)', background: '#FAF8F5', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', wordBreak: 'break-all' },
  label:      { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 },
  select:     { padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--line)', fontSize: 15, color: 'var(--ink)', fontFamily: 'var(--font)', background: '#fff', width: '100%' },
  btn:        { marginTop: 6, padding: '14px 22px', borderRadius: 10, border: 'none', background: 'var(--terra)', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font)', width: '100%' },
  btnGhost:   { marginTop: 6, padding: '13px 22px', borderRadius: 10, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--ink-2)', fontSize: 15, fontWeight: 700, textDecoration: 'none', textAlign: 'center' },
  fine:       { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.6, margin: 0 },
  link:       { color: 'var(--terra)', fontWeight: 700, textDecoration: 'underline' },
  footer:     { textAlign: 'center', fontSize: 12, color: 'var(--ink-3)', marginTop: 22, lineHeight: 1.6 },
}
