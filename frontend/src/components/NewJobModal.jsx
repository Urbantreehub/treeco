import { useState } from 'react'
import { supabase } from '../config/supabase'
import AddressInput from './AddressInput'

const JOB_TYPES = ['pruning', 'removal', 'stump grinding', 'hedge trimming', 'emergency', 'consultation', 'planting', 'mulching', 'other']

// Kāinga Ora / Spencers priority codes (code → label) for portal jobs.
const KO_CODES = [
  ['URG', 'URG — Urgent'],
  ['EPS', 'EPS — Emergency'],
  ['URS', 'URS — Urgent Response'],
  ['GNL', 'GNL — General'],
  ['RSC', 'RSC — Responsive'],
  ['VSC', 'VSC — Void'],
  ['RM',  'RM — Responsive Maintenance'],
  ['PM',  'PM — Planned Maintenance'],
]

const CATEGORIES = [
  { key: 'residential', label: 'Residential', icon: '🏡', desc: 'Private client — quote & tree work' },
  { key: 'spencers',    label: 'Spencers',    icon: '🏢', desc: 'Spencers (DBS) portal job — KO reference & KPI' },
  { key: 'downer',      label: 'Downer',      icon: '🚧', desc: 'Downer portal job — KO reference & KPI, GPS photos' },
]

// Columns that only exist once migration 017 is applied — insert falls back to
// the base columns if the DB doesn't have them yet, so job creation never breaks.
const OPTIONAL_JOB_COLS = ['category', 'ko_reference', 'priority', 'sla_due_at']
async function insertJob(payload) {
  let { error } = await supabase.from('jobs').insert(payload)
  if (error && /(column|schema cache|could not find)/i.test(error.message)) {
    const base = { ...payload }
    OPTIONAL_JOB_COLS.forEach(c => delete base[c])
    ;({ error } = await supabase.from('jobs').insert(base))
  }
  return error
}

export default function NewJobModal({ onClose, onCreated }) {
  const [step, setStep] = useState('category') // 'category' | 'client' | 'job' | 'portal'
  const [category, setCategory] = useState('') // 'residential' | 'spencers' | 'downer'
  const [portal, setPortal] = useState({ address: '', lat: null, lng: null, ko_reference: '', code: '', sla_due: '', description: '', contact_name: '', contact_phone: '' })
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', address: '', lat: null, lng: null })
  const [job, setJob] = useState({ address: '', job_type: '', description: '', lat: null, lng: null })

  // Move to the job step with the address prefilled from the chosen client, so
  // the (now mandatory) address is populated and editable rather than blank.
  function pickClient(c) {
    setSelectedClient(c)
    setJob(p => ({ ...p, address: c.address ?? '', lat: c.lat ?? null, lng: c.lng ?? null }))
    setStep('job')
  }
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function searchClients(q) {
    setClientSearch(q)
    if (q.length < 2) { setClientResults([]); return }
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, address, lat, lng')
      .ilike('name', `%${q}%`)
      .limit(6)
    setClientResults(data ?? [])
  }

  async function createClient() {
    if (!newClient.name.trim() || !newClient.phone.trim() || !newClient.email.trim() || !newClient.address.trim()) {
      setError('All client fields are required.')
      return
    }
    setSaving(true)
    setError(null)
    const { data, error } = await supabase.from('clients').insert({
      name: newClient.name,
      phone: newClient.phone,
      email: newClient.email,
      address: newClient.address,
      lat: newClient.lat,
      lng: newClient.lng,
      geocoded_at: newClient.lat != null ? new Date().toISOString() : null,
    }).select().single()
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    pickClient(data)
  }

  async function createJob() {
    if (!job.address.trim() || !job.job_type || !job.description.trim()) {
      setError('Address, job type and description are all required.')
      return
    }
    setSaving(true)
    setError(null)
    // The address doubles as the job title now — no separate title field.
    const address = job.address.trim()
    const error = await insertJob({
      client_id: selectedClient?.id ?? null,
      category: 'residential',
      title: address,
      address,
      job_type: job.job_type,
      description: job.description,
      // Verified coords from autocomplete let the Planner place the job at once;
      // a manually-typed address has none and is geocoded later by the Planner.
      lat: job.lat,
      lng: job.lng,
      geocoded_at: job.lat != null ? new Date().toISOString() : null,
      status: 'new_lead',
      status_changed_at: new Date().toISOString(),
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    onCreated()
    onClose()
  }

  async function createPortalJob() {
    if (!portal.address.trim() || !portal.description.trim()) {
      setError('Address and description are required.')
      return
    }
    setSaving(true)
    setError(null)
    // Optional contact becomes a lightweight client so it shows as the job's
    // secondary contact (Spencers/Downer cards lead with the address).
    let clientId = null
    if (portal.contact_name.trim()) {
      const { data: c } = await supabase.from('clients').insert({
        name: portal.contact_name.trim(),
        phone: portal.contact_phone.trim() || null,
      }).select().single()
      clientId = c?.id ?? null
    }
    const address = portal.address.trim()
    const error = await insertJob({
      client_id: clientId,
      category,                       // 'spencers' | 'downer'
      title: address,
      address,
      description: portal.description,
      ko_reference: portal.ko_reference.trim() || null,
      priority: portal.code || null,  // the KO code (GNL/VSC/…)
      sla_due_at: portal.sla_due ? new Date(portal.sla_due).toISOString() : null,
      lat: portal.lat,
      lng: portal.lng,
      geocoded_at: portal.lat != null ? new Date().toISOString() : null,
      status: 'new_lead',
      status_changed_at: new Date().toISOString(),
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    onCreated()
    onClose()
  }

  function chooseCategory(c) {
    setCategory(c)
    setError(null)
    setStep(c === 'residential' ? 'client' : 'portal')
  }

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {step === 'category' ? 'New job'
              : step === 'portal' ? `New ${category === 'downer' ? 'Downer' : 'Spencers'} job`
              : step === 'client' ? 'New job — select client' : 'Job details'}
          </h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {step === 'category' && (
          <div style={styles.body}>
            <p style={styles.hint}>What type of job is this?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {CATEGORIES.map(c => (
                <button key={c.key} onClick={() => chooseCategory(c.key)} style={styles.catBtn}>
                  <span style={{ fontSize: '22px' }}>{c.icon}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <div style={styles.catLabel}>{c.label}</div>
                    <div style={styles.catDesc}>{c.desc}</div>
                  </span>
                  <span style={styles.catArrow}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'portal' && (
          <div style={styles.body}>
            <div style={styles.clientPill}>
              {category === 'downer' ? '🚧 Downer' : '🏢 Spencers'} portal job — <button onClick={() => setStep('category')} style={styles.linkBtn}>change</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <AddressInput
                autoFocus
                placeholder="Site address *"
                inputStyle={styles.input}
                value={portal.address}
                onChange={v => setPortal(p => ({ ...p, address: v, lat: null, lng: null }))}
                onResolve={({ address, lat, lng }) => setPortal(p => ({ ...p, address, lat, lng }))}
              />
              <p style={styles.addrHint}>The address is used as the job title.</p>
              <input placeholder="KO reference" value={portal.ko_reference} onChange={e => setPortal(p => ({ ...p, ko_reference: e.target.value }))} style={styles.input} />
              <select value={portal.code} onChange={e => setPortal(p => ({ ...p, code: e.target.value }))} style={styles.input}>
                <option value="">Priority code…</option>
                {KO_CODES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
              <label style={styles.fieldLabel}>KPI due (optional)</label>
              <input type="datetime-local" value={portal.sla_due} onChange={e => setPortal(p => ({ ...p, sla_due: e.target.value }))} style={styles.input} />
              <textarea placeholder="Work description / scope *" rows={3} value={portal.description} onChange={e => setPortal(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <input placeholder="Contact name" value={portal.contact_name} onChange={e => setPortal(p => ({ ...p, contact_name: e.target.value }))} style={styles.input} />
                <input placeholder="Contact phone" value={portal.contact_phone} onChange={e => setPortal(p => ({ ...p, contact_phone: e.target.value }))} style={styles.input} />
              </div>
              {error && <p style={styles.error}>{error}</p>}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createPortalJob} disabled={saving || !portal.address.trim() || !portal.description.trim()} style={styles.primaryBtn}>
                  {saving ? 'Creating…' : 'Create job'}
                </button>
                <button onClick={() => setStep('category')} style={styles.ghostBtn}>Back</button>
              </div>
            </div>
          </div>
        )}

        {step === 'client' && (
          <div style={styles.body}>
            <p style={styles.hint}>Search for an existing client or create a new one. <button onClick={() => setStep('category')} style={styles.linkBtn}>Change type</button></p>

            <input
              autoFocus
              placeholder="Search by name…"
              value={clientSearch}
              onChange={e => searchClients(e.target.value)}
              style={styles.input}
            />

            {clientResults.length > 0 && (
              <div style={styles.results}>
                {clientResults.map(c => (
                  <button key={c.id} style={styles.clientRow} onClick={() => pickClient(c)}>
                    <div style={styles.clientName}>{c.name}</div>
                    <div style={styles.clientSub}>{c.phone} {c.address}</div>
                  </button>
                ))}
              </div>
            )}

            <div style={styles.divider}>
              <span>or create new client</span>
            </div>

            {creatingClient ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input placeholder="Full name *" value={newClient.name} onChange={e => setNewClient(p => ({ ...p, name: e.target.value }))} style={styles.input} />
                <input placeholder="Phone *" value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} style={styles.input} />
                <input placeholder="Email *" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} style={styles.input} />
                <AddressInput
                  placeholder="Address *"
                  inputStyle={styles.input}
                  value={newClient.address}
                  onChange={v => setNewClient(p => ({ ...p, address: v, lat: null, lng: null }))}
                  onResolve={({ address, lat, lng }) => setNewClient(p => ({ ...p, address, lat, lng }))}
                />
                <p style={styles.addrHint}>No match shown? Just type the full address and continue.</p>
                {error && <p style={styles.error}>{error}</p>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={createClient} disabled={saving || !newClient.name.trim() || !newClient.phone.trim() || !newClient.email.trim() || !newClient.address.trim()} style={styles.primaryBtn}>
                    {saving ? 'Creating…' : 'Create & continue'}
                  </button>
                  <button onClick={() => setCreatingClient(false)} style={styles.ghostBtn}>Back</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreatingClient(true)} style={styles.ghostBtn}>+ New client</button>
            )}
          </div>
        )}

        {step === 'job' && (
          <div style={styles.body}>
            <div style={styles.clientPill}>
              👤 {selectedClient?.name ?? 'No client'} — <button onClick={() => setStep('client')} style={styles.linkBtn}>change</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <AddressInput
                autoFocus
                placeholder="Job address *"
                inputStyle={styles.input}
                value={job.address}
                onChange={v => setJob(p => ({ ...p, address: v, lat: null, lng: null }))}
                onResolve={({ address, lat, lng }) => setJob(p => ({ ...p, address, lat, lng }))}
              />
              <p style={styles.addrHint}>The address is used as the job title. No match shown? Just type the full address.</p>

              <select value={job.job_type} onChange={e => setJob(p => ({ ...p, job_type: e.target.value }))} style={styles.input}>
                <option value="">Job type… *</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>

              <textarea placeholder="Description / notes *" rows={3} value={job.description} onChange={e => setJob(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, resize: 'vertical' }} />

              {error && <p style={styles.error}>{error}</p>}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createJob} disabled={saving || !job.address.trim() || !job.job_type || !job.description.trim()} style={styles.primaryBtn}>
                  {saving ? 'Creating…' : 'Create lead'}
                </button>
                <button onClick={() => setStep('client')} style={styles.ghostBtn}>Back</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

const styles = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.3)', zIndex: 200, backdropFilter: 'blur(2px)' },
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
    background: '#fff', borderRadius: 'var(--radius)', width: '480px', maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto', zIndex: 201,
    boxShadow: '0 8px 40px rgba(44,36,22,0.2)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 0' },
  title: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', color: '#aaa', cursor: 'pointer' },
  body: { padding: '16px 24px 24px' },
  hint: { fontSize: '13px', color: '#888', marginBottom: '12px' },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)',
    fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', background: 'var(--cream)',
    boxSizing: 'border-box',
  },
  results: { border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginTop: '6px' },
  clientRow: {
    display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
    background: 'none', border: 'none', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  clientName: { fontWeight: '600', fontSize: '14px', color: 'var(--bark)' },
  clientSub: { fontSize: '12px', color: '#888', marginTop: '2px' },
  divider: {
    textAlign: 'center', fontSize: '12px', color: '#aaa', margin: '16px 0',
    borderTop: '1px solid var(--border)', paddingTop: '12px',
  },
  clientPill: { fontSize: '13px', color: 'var(--bark)', marginBottom: '14px', background: 'var(--moss-pale)', padding: '8px 12px', borderRadius: '8px' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--moss)', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: '600' },
  primaryBtn: {
    background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '10px 20px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  ghostBtn: {
    background: 'none', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '10px 16px', fontSize: '14px', color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  error: { color: 'var(--danger)', fontSize: '13px' },
  addrHint: { fontSize: '11px', color: '#999', margin: '-4px 0 2px' },
  fieldLabel: { fontSize: '11px', color: '#888', fontWeight: '600', margin: '2px 0 -4px' },
  catBtn: {
    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
    padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--border)',
    background: '#fff', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
  },
  catLabel: { fontSize: '15px', fontWeight: '700', color: 'var(--bark)' },
  catDesc: { fontSize: '12px', color: '#888', marginTop: '2px' },
  catArrow: { color: 'var(--moss)', fontSize: '16px', fontWeight: '700' },
}
