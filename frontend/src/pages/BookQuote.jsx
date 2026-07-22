import { useState, useEffect } from 'react'
import AddressInput from '../components/AddressInput'

const IS_EMBED = new URLSearchParams(window.location.search).get('embed') === '1'

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

const MAX_PHOTOS = 6
const MAX_PHOTO_BYTES = 10 * 1024 * 1024 // ~10MB per image

export default function BookQuote() {
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', job_type: '', job_description: '', preferred_date: '', window: '' })
  const [photos, setPhotos] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))
  const quoteDays = upcomingQuoteDays()

  // When embedded via embed.js, report our height so the host iframe auto-sizes.
  useEffect(() => {
    if (!IS_EMBED) return
    const post = () => window.parent?.postMessage({ type: 'uts-book-height', height: document.documentElement.scrollHeight }, '*')
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  })

  function onPhoto(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-picking the same file(s)
    if (!files.length) return

    const room = MAX_PHOTOS - photos.length
    if (room <= 0) { setErr(`You can add up to ${MAX_PHOTOS} photos`); return }

    let tooBig = false
    const picked = []
    for (const file of files) {
      if (picked.length >= room) break
      if (file.size > MAX_PHOTO_BYTES) { tooBig = true; continue }
      picked.push(file)
    }
    if (tooBig) setErr('Some photos were skipped — each must be under 10MB')
    else if (files.length > room) setErr(`Only the first ${room} photo${room === 1 ? '' : 's'} were added (max ${MAX_PHOTOS})`)
    else setErr(null)

    picked.forEach(file => {
      const reader = new FileReader()
      reader.onload = () => setPhotos(prev => (prev.length >= MAX_PHOTOS ? prev : [...prev, reader.result]))
      reader.readAsDataURL(file)
    })
  }

  const removePhoto = (i) => setPhotos(prev => prev.filter((_, idx) => idx !== i))

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
        body: JSON.stringify({ ...f, photos_base64: photos, photo_base64: photos[0] ?? null }),
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

  function reset() {
    setF({ name: '', phone: '', email: '', address: '', job_type: '', job_description: '', preferred_date: '', window: '' })
    setPhotos([])
    setErr(null)
    setDone(false)
  }

  if (done) return (
    <div style={{ ...s.page, ...(IS_EMBED ? { background: 'transparent', padding: '0', minHeight: 0 } : {}) }}>
      <div style={{ ...s.card, alignItems: 'center', textAlign: 'center', padding: '40px 24px 32px' }}>
        <img src="/logo.png" alt="Urban Tree Services" style={s.logo} />
        <div style={s.checkCircle}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 style={s.title}>Request received!</h1>
        <p style={s.lead}>Thanks {f.name.split(' ')[0]} — we've got your details and photos. We'll be in touch, usually the same day.</p>
        <p style={s.small}>Need us sooner? Call <a href="tel:0272031446" style={s.link}>027 203 1446</a>.</p>
        <button type="button" onClick={reset} style={s.againLink}>Send another request</button>
      </div>
    </div>
  )

  return (
    <div style={{ ...s.page, ...(IS_EMBED ? { background: 'transparent', padding: '0', minHeight: 0 } : {}) }}>
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
        <AddressInput
          inputStyle={s.input}
          placeholder="Start typing your street address…"
          value={f.address}
          onChange={v => { set('address', v); set('lat', null); set('lng', null) }}
          onResolve={({ address, lat, lng }) => { set('address', address); set('lat', lat); set('lng', lng) }}
        />

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

        <label style={s.label}>Photos (optional)</label>
        {photos.length > 0 && (
          <div style={s.thumbs}>
            {photos.map((src, i) => (
              <div key={i} style={s.thumbWrap}>
                {/* PDFs have no visual preview — show a document tile instead */}
                {src.startsWith('data:application/pdf')
                  ? <div style={{ ...s.thumb, ...s.thumbDoc }}>📄</div>
                  : <img src={src} alt="" style={s.thumb} />}
                <button type="button" onClick={() => removePhoto(i)} style={s.thumbRemove} aria-label="Remove attachment">×</button>
              </div>
            ))}
          </div>
        )}
        {photos.length < MAX_PHOTOS && (
          <label style={s.photoBtn}>
            {photos.length ? `📷 Add another photo (${photos.length}/${MAX_PHOTOS})` : '📷 Add photos of the tree'}
            <input type="file" accept="image/*,application/pdf,.pdf" multiple style={{ display: 'none' }} onChange={onPhoto} />
          </label>
        )}

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
  thumbs: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' },
  thumbWrap: { position: 'relative', width: '72px', height: '72px' },
  thumb: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '9px', border: '1.5px solid var(--border)' },
  thumbDoc: { display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAFAF8', fontSize: '26px', boxSizing: 'border-box' },
  thumbRemove: { position: 'absolute', top: '-7px', right: '-7px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', background: '#2C2416', color: '#fff', fontSize: '15px', lineHeight: '20px', cursor: 'pointer', padding: 0, boxShadow: '0 1px 4px rgba(0,0,0,0.3)' },
  checkCircle: { width: '64px', height: '64px', borderRadius: '50%', background: 'var(--moss)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '4px 0 14px', boxShadow: '0 4px 14px rgba(74,103,65,0.35)' },
  againLink: { marginTop: '18px', background: 'none', border: 'none', color: 'var(--moss)', fontSize: '14px', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--font)' },
  err: { background: '#FFF0EE', color: '#C0392B', border: '1px solid #F0C8C2', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', marginTop: '14px' },
  submit: { marginTop: '18px', padding: '15px', borderRadius: '11px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 2px 8px rgba(74,103,65,0.3)' },
  small: { fontSize: '12px', color: '#999', textAlign: 'center', marginTop: '12px' },
  link: { color: 'var(--moss)', fontWeight: '600', textDecoration: 'none' },
}
