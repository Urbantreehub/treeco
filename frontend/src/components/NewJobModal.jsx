import { useState } from 'react'
import { supabase } from '../config/supabase'
import AddressInput from './AddressInput'

const JOB_TYPES = ['pruning', 'removal', 'stump grinding', 'hedge trimming', 'emergency', 'consultation', 'planting', 'mulching', 'other']

export default function NewJobModal({ onClose, onCreated }) {
  const [step, setStep] = useState('client') // 'client' | 'job'
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClient, setNewClient] = useState({ name: '', phone: '', email: '', address: '', lat: null, lng: null })
  const [job, setJob] = useState({ title: '', address: '', job_type: '', description: '', lat: null, lng: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function searchClients(q) {
    setClientSearch(q)
    if (q.length < 2) { setClientResults([]); return }
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, email, address')
      .ilike('name', `%${q}%`)
      .limit(6)
    setClientResults(data ?? [])
  }

  async function createClient() {
    if (!newClient.name.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('clients').insert({
      name: newClient.name,
      phone: newClient.phone || null,
      email: newClient.email || null,
      address: newClient.address || null,
      lat: newClient.lat,
      lng: newClient.lng,
      geocoded_at: newClient.lat != null ? new Date().toISOString() : null,
    }).select().single()
    if (error) { setError(error.message); setSaving(false); return }
    setSelectedClient(data)
    setStep('job')
    setSaving(false)
  }

  async function createJob() {
    if (!job.title.trim()) return
    setSaving(true)
    setError(null)
    // Prefer the job's own verified coords; else inherit the client's. Storing
    // them here means the Planner can place the job immediately — no reliance on
    // the after-the-fact geocode that silently fails on vague addresses.
    const usingJobAddr = !!job.address
    const lat = usingJobAddr ? job.lat : (selectedClient?.lat ?? null)
    const lng = usingJobAddr ? job.lng : (selectedClient?.lng ?? null)
    const { error } = await supabase.from('jobs').insert({
      client_id: selectedClient?.id ?? null,
      title: job.title,
      address: job.address || selectedClient?.address || null,
      job_type: job.job_type || null,
      description: job.description || null,
      lat,
      lng,
      geocoded_at: lat != null ? new Date().toISOString() : null,
      status: 'new_lead',
      status_changed_at: new Date().toISOString(),
    })
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    onCreated()
    onClose()
  }

  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>{step === 'client' ? 'New job — select client' : 'Job details'}</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        {step === 'client' && (
          <div style={styles.body}>
            <p style={styles.hint}>Search for an existing client or create a new one.</p>

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
                  <button key={c.id} style={styles.clientRow} onClick={() => { setSelectedClient(c); setStep('job') }}>
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
                <input placeholder="Phone" value={newClient.phone} onChange={e => setNewClient(p => ({ ...p, phone: e.target.value }))} style={styles.input} />
                <input placeholder="Email" value={newClient.email} onChange={e => setNewClient(p => ({ ...p, email: e.target.value }))} style={styles.input} />
                <AddressInput
                  placeholder="Address"
                  inputStyle={styles.input}
                  value={newClient.address}
                  onChange={v => setNewClient(p => ({ ...p, address: v, lat: null, lng: null }))}
                  onResolve={({ address, lat, lng }) => setNewClient(p => ({ ...p, address, lat, lng }))}
                />
                {error && <p style={styles.error}>{error}</p>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={createClient} disabled={saving || !newClient.name} style={styles.primaryBtn}>
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
              <input autoFocus placeholder="Job title *" value={job.title} onChange={e => setJob(p => ({ ...p, title: e.target.value }))} style={styles.input} />
              <AddressInput
                placeholder="Address (defaults to client address)"
                inputStyle={styles.input}
                value={job.address}
                onChange={v => setJob(p => ({ ...p, address: v, lat: null, lng: null }))}
                onResolve={({ address, lat, lng }) => setJob(p => ({ ...p, address, lat, lng }))}
              />

              <select value={job.job_type} onChange={e => setJob(p => ({ ...p, job_type: e.target.value }))} style={styles.input}>
                <option value="">Job type…</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>

              <textarea placeholder="Description / notes" rows={3} value={job.description} onChange={e => setJob(p => ({ ...p, description: e.target.value }))} style={{ ...styles.input, resize: 'vertical' }} />

              {error && <p style={styles.error}>{error}</p>}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={createJob} disabled={saving || !job.title} style={styles.primaryBtn}>
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
}
