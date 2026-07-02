import { useState } from 'react'

// Public, no-login quote-request / self-booking page (route /book). Submits to
// the book-quote edge function, which lands it in the pipeline as a new lead.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const JOB_TYPES = ['Tree removal', 'Pruning / trimming', 'Stump grinding', 'Hedge work', 'Storm / emergency', 'Other']
const WINDOWS = ['Morning', 'Afternoon', 'Either']

// Highlight the next few Tuesdays/Thursdays (the quote-run days) as suggestions.
function upcomingQuoteDays(n = 6) {
  const out = []
  const d = new Date()
  while (out.length < n) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day === 2 || day === 4) out.push(new Date(d))
  }
  return out
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const label = (d) => d.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

export default function BookQuote() {
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', job_type: '', job_description: '', preferred_date: '', window: '' })
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const quoteDays = upcomingQuoteDays()

  function onPhoto(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPhoto(reader.result)
    reader.readAsDataURL(file)
  }

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!f.name.trim()) { setErr('Please enter your name'); return }
    if (!f.phone.trim() && !f.email.trim()) { setErr('Please add a phone or email so we can reach you'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/book-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ ...f, photo_base64: photo }),
      })
      const b = await res.json()
      if (!res.ok) throw new Error(b.error || 'Something went wrong')
      setDone(true)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) return (
    <div style={s.page}>
      <div style={s.card}>
        <img src="/logo.png" alt="Urban Tree Services" style={s.logo} />
        <div style={{ fontSize: '40px', margin: '8px 0' }}>✓</div>
        <h1 style={s.title}>Request received</h1>
        <p style={s.lead}>Thanks {f.name.split(' ')[0]} — we've got your enquiry and will be in touch within 1 business day to confirm a time.</p>
        <p style={s.small}>Need us sooner? Call <a href="tel:0272031446" style={s.link}>027 203 1446</a>.</p>
      </div>
    </div>
  )

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={submit}>
        <img src="/logo.png" alt="Urban Tree Services" style={s.logo} />
        <h1 style={s.title}>Request a free quote</h1>
        <p style={s.lead}>Tell us about your tree job and we'll come take a look. It only takes a minute.</p>

        <label style={s.label}>Your name *</label>
        <input style={s.input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />

        <div style={s.row}>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Phone</label>
            <input style={s.input} value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="021 234 567" inputMode="tel" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={s.label}>Email</label>
            <input style={s.input} value={f.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" inputMode="email" />
          </div>
        </div>

        <label style={s.label}>Property address</label>
        <input style={s.input} value={f.address} onChange={e => set('address', e.target.value)} placeholder="Street, suburb" />

        <label style={s.label}>What do you need done?</label>
        <div style={s.chips}>
          {JOB_TYPES.map(t => (
            <button type="button" key={t} onClick={() => set('job_type', t)} style={{ ...s.chip, ...(f.job_type === t ? s.chipOn : {}) }}>{t}</button>
          ))}
        </div>
        <textarea style={s.textarea} rows={3} value={f.job_description} onChange={e => set('job_description', e.target.value)} placeholder="A few details — e.g. large gum near the house needs removing" />

        <label style={s.label}>Preferred day for us to visit</label>
        <div style={s.chips}>
          {quoteDays.map(d => {
            const v = ymd(d)
            return <button type="button" key={v} onClick={() => set('preferred_date', f.preferred_date === v ? '' : v)} style={{ ...s.chip, ...(f.preferred_date === v ? s.chipOn : {}) }}>{label(d)}</button>
          })}
        </div>
        <div style={{ ...s.small, marginTop: '-4px', marginBottom: '10px' }}>We quote on Tuesdays &amp; Thursdays — pick what suits, we'll confirm.</div>

        <label style={s.label}>Preferred time</label>
        <div style={s.chips}>
          {WINDOWS.map(w => (
            <button type="button" key={w} onClick={() => set('window', f.window === w ? '' : w)} style={{ ...s.chip, ...(f.window === w ? s.chipOn : {}) }}>{w}</button>
          ))}
        </div>

        <label style={s.label}>Photo (optional)</label>
        <label style={s.photoBtn}>
          {photo ? '📷 Photo added — tap to change' : '📷 Add a photo of the tree'}
          <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onPhoto} />
        </label>
        {photo && <img src={photo} alt="" style={s.preview} />}

        {err && <div style={s.err}>{err}</div>}
        <button type="submit" style={{ ...s.submit, opacity: submitting ? 0.6 : 1 }} disabled={submitting}>
          {submitting ? 'Sending…' : 'Request my free quote'}
        </button>
        <p style={s.small}>Or call us directly on <a href="tel:0272031446" style={s.link}>027 203 1446</a>.</p>
      </form>
    </div>
  )
}

const s = {
  page: { minHeight: '100dvh', background: '#F4F2EF', padding: '24px 16px', fontFamily: 'var(--font)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' },
  card: { width: '100%', maxWidth: '520px', background: '#fff', borderRadius: '16px', padding: '28px 24px 24px', boxShadow: '0 4px 24px rgba(44,36,22,0.1)', display: 'flex', flexDirection: 'column' },
  logo: { height: '48px', objectFit: 'contain', alignSelf: 'center', marginBottom: '14px' },
  title: { fontSize: '22px', fontWeight: '800', color: 'var(--bark)', margin: '0 0 6px', textAlign: 'center' },
  lead: { fontSize: '14px', color: '#666', lineHeight: 1.5, textAlign: 'center', margin: '0 0 20px' },
  label: { fontSize: '12px', fontWeight: '700', color: '#777', margin: '10px 0 5px' },
  input: { width: '100%', padding: '12px 13px', borderRadius: '9px', border: '1.5px solid var(--border)', fontSize: '15px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '12px 13px', borderRadius: '9px', border: '1.5px solid var(--border)', fontSize: '15px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: '2px' },
  row: { display: 'flex', gap: '10px' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: '7px', marginBottom: '8px' },
  chip: { padding: '9px 13px', borderRadius: '20px', border: '1.5px solid var(--border)', background: '#fff', color: '#666', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  chipOn: { background: 'var(--moss-pale)', borderColor: 'var(--moss)', color: 'var(--moss)' },
  photoBtn: { display: 'block', padding: '13px', borderRadius: '9px', border: '1.5px dashed var(--border)', background: '#FAFAF8', color: '#777', fontSize: '14px', fontWeight: '600', cursor: 'pointer', textAlign: 'center' },
  preview: { width: '100%', maxHeight: '200px', objectFit: 'cover', borderRadius: '10px', marginTop: '10px' },
  err: { background: '#FFF0EE', color: '#C0392B', border: '1px solid #F0C8C2', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginTop: '14px' },
  submit: { marginTop: '18px', padding: '15px', borderRadius: '11px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 2px 8px rgba(74,103,65,0.3)' },
  small: { fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '12px' },
  link: { color: 'var(--moss)', fontWeight: '600', textDecoration: 'none' },
}
