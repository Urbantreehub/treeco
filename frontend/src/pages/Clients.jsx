import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { DEMO_CLIENTS, DEMO_JOBS } from '../demo/mockData'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const IS_PURE_DEMO = IS_DEMO && !import.meta.env.VITE_SUPABASE_URL
const SUPABASE_FN = import.meta.env.VITE_SUPABASE_URL + '/functions/v1'
const XERO_CLIENT_ID = import.meta.env.VITE_XERO_CLIENT_ID ?? ''
const XERO_REDIRECT_URI = import.meta.env.VITE_XERO_REDIRECT_URI ?? ''

// ── Helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

function avatarColor(name = '') {
  const COLORS = ['#4A6741','#4A7FA5','#6B5EA8','#8B4513','#C0392B','#2E7D52','#B8860B','#5D6D7E']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

// ── Client form modal ──────────────────────────────────────────────────────
function ClientModal({ client, onSave, onClose }) {
  const isNew = !client?.id
  const [form, setForm] = useState({
    name:    client?.name    ?? '',
    email:   client?.email   ?? '',
    phone:   client?.phone   ?? '',
    address: client?.address ?? '',
    notes:   client?.notes   ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const { error: err } = isNew
      ? await supabase.from('clients').insert(payload)
      : await supabase.from('clients').update(payload).eq('id', client.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSave()
  }

  return (
    <div style={m.scrim} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <div style={m.header}>
          <h2 style={m.title}>{isNew ? 'New Client' : 'Edit Client'}</h2>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={m.form}>
          <label style={m.label}>Name *</label>
          <input style={m.input} value={form.name} onChange={set('name')} placeholder="Client name" autoFocus />

          <div style={m.row2}>
            <div style={{ flex: 1 }}>
              <label style={m.label}>Email</label>
              <input style={m.input} type="email" value={form.email} onChange={set('email')} placeholder="email@example.com" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={m.label}>Phone</label>
              <input style={m.input} type="tel" value={form.phone} onChange={set('phone')} placeholder="021 xxx xxxx" />
            </div>
          </div>

          <label style={m.label}>Address</label>
          <input style={m.input} value={form.address} onChange={set('address')} placeholder="Street address" />

          <label style={m.label}>Notes</label>
          <textarea style={{ ...m.input, height: '80px', resize: 'vertical' }} value={form.notes} onChange={set('notes')} placeholder="Internal notes…" />

          {error && <div style={m.error}>{error}</div>}

          <div style={m.footer}>
            <button type="button" style={m.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={m.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create Client' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Xero import modal ──────────────────────────────────────────────────────
function XeroImportModal({ contacts, existingXeroIds, onImport, onClose }) {
  const newContacts = contacts.filter(c => !existingXeroIds.has(c.xero_contact_id))
  const [selected, setSelected] = useState(new Set(newContacts.map(c => c.xero_contact_id)))
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')

  function toggle(id) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const visible = filtered.map(c => c.xero_contact_id)
    const allOn = visible.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      visible.forEach(id => allOn ? next.delete(id) : next.add(id))
      return next
    })
  }

  const filtered = newContacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleImport() {
    setImporting(true)
    const toImport = contacts.filter(c => selected.has(c.xero_contact_id))
    await onImport(toImport)
    setImporting(false)
  }

  return (
    <div style={m.scrim} onClick={onClose}>
      <div style={{ ...m.modal, width: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={m.header}>
          <div>
            <h2 style={m.title}>Import from Xero</h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#aaa' }}>
              {newContacts.length} new contacts · {contacts.length - newContacts.length} already imported
            </p>
          </div>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>

        {newContacts.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '14px' }}>
            All Xero contacts are already imported ✓
          </div>
        ) : (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2DDD6', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                style={{ ...m.input, margin: 0, flex: 1 }}
                placeholder="Search contacts…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button style={xi.selAll} onClick={toggleAll}>
                {filtered.every(c => selected.has(c.xero_contact_id)) ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filtered.map(c => (
                <label key={c.xero_contact_id} style={xi.row}>
                  <input
                    type="checkbox"
                    checked={selected.has(c.xero_contact_id)}
                    onChange={() => toggle(c.xero_contact_id)}
                    style={{ accentColor: '#4A6741', width: '15px', height: '15px', flexShrink: 0 }}
                  />
                  <div style={{ ...xi.avatar, background: avatarColor(c.name) }}>{initials(c.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={xi.name}>{c.name}</div>
                    <div style={xi.meta}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                  </div>
                  {c.address && <div style={xi.addr}>{c.address.split(',')[0]}</div>}
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ ...m.footer, borderTop: '1px solid #E2DDD6', padding: '14px 20px' }}>
          <button style={m.cancelBtn} onClick={onClose}>Cancel</button>
          {newContacts.length > 0 && (
            <button style={m.saveBtn} disabled={importing || selected.size === 0} onClick={handleImport}>
              {importing ? 'Importing…' : `Import ${selected.size} contact${selected.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Client detail panel ────────────────────────────────────────────────────
function ClientPanel({ client, jobs, onEdit, onDelete, onClose }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={p.panel}>
      <div style={p.header}>
        <div style={{ ...p.avatar, background: avatarColor(client.name) }}>{initials(client.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={p.name}>{client.name}</h2>
          {client.xero_contact_id && <span style={p.xeroBadge}>✓ Xero</span>}
        </div>
        <button style={p.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={p.body}>
        {client.email   && <InfoRow icon="✉" label="Email"   value={<a href={`mailto:${client.email}`} style={p.link}>{client.email}</a>} />}
        {client.phone   && <InfoRow icon="📞" label="Phone"  value={<a href={`tel:${client.phone}`}   style={p.link}>{client.phone}</a>} />}
        {client.address && <InfoRow icon="📍" label="Address" value={client.address} />}
        {client.notes   && <InfoRow icon="📝" label="Notes"   value={client.notes} />}

        <div style={p.section}>
          <div style={p.sectionTitle}>Jobs ({jobs.length})</div>
          {jobs.length === 0
            ? <div style={p.empty}>No jobs yet</div>
            : jobs.map(j => (
              <div key={j.id} style={p.jobRow}>
                <div style={{ ...p.statusDot, background: JOB_STATUS_COLOR[j.status] ?? '#ccc' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={p.jobTitle}>{j.title}</div>
                  <div style={p.jobMeta}>{j.status?.replace(/_/g, ' ')} · {j.address?.split(',')[0] ?? '—'}</div>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      <div style={p.footer}>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: '12px', color: '#C0392B', flex: 1 }}>Delete this client?</span>
            <button style={p.cancelSmall} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button style={p.deleteConfirm} onClick={onDelete}>Yes, delete</button>
          </>
        ) : (
          <>
            <button style={p.deleteBtn} onClick={() => setConfirmDelete(true)}>Delete</button>
            <button style={p.editBtn} onClick={onEdit}>Edit Client</button>
          </>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }) {
  return (
    <div style={p.infoRow}>
      <span style={p.infoIcon}>{icon}</span>
      <div>
        <div style={p.infoLabel}>{label}</div>
        <div style={p.infoValue}>{value}</div>
      </div>
    </div>
  )
}

const JOB_STATUS_COLOR = {
  new_lead: '#F5C842', quote_scheduled: '#D4851A', quote_sent: '#4A7FA5',
  accepted_to_schedule: '#6B5EA8', scheduled: '#4A6741', in_progress: '#2E7D52',
  complete_to_invoice: '#8B4513', invoiced: '#aaa', on_hold: '#C0392B',
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Clients() {
  const [clients,    setClients]    = useState(IS_PURE_DEMO ? DEMO_CLIENTS : [])
  const [jobs,       setJobs]       = useState(IS_PURE_DEMO ? DEMO_JOBS : [])
  const [loading,    setLoading]    = useState(!IS_PURE_DEMO)
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(null)   // null | 'new' | { client }
  const [panel,      setPanel]      = useState(null)   // selected client
  const [toast,      setToast]      = useState(null)
  const [xeroStatus, setXeroStatus] = useState(null)  // null | 'connected' | 'not_connected' | 'loading'
  const [xeroModal,  setXeroModal]  = useState(null)  // null | { contacts, existingXeroIds }

  function showToast(msg, err) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 3500)
  }

  async function load() {
    if (IS_PURE_DEMO) return
    setLoading(true)
    const [{ data: c }, { data: j }] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase.from('jobs').select('id, client_id, title, status, address'),
    ])
    setClients(c ?? [])
    setJobs(j ?? [])
    setLoading(false)
  }

  async function checkXeroConnection() {
    const { data } = await supabase
      .from('xero_connections')
      .select('tenant_name, expires_at')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()
    setXeroStatus(data ? { connected: true, tenant: data.tenant_name } : { connected: false })
  }

  useEffect(() => {
    load()
    checkXeroConnection()

    // Handle OAuth callback params
    const params = new URLSearchParams(window.location.search)
    if (params.get('xero') === 'connected') {
      showToast('Xero connected successfully')
      checkXeroConnection()
      window.history.replaceState({}, '', '/clients')
    } else if (params.get('xero_error')) {
      showToast(`Xero error: ${params.get('xero_error')}`, true)
      window.history.replaceState({}, '', '/clients')
    }
  }, [])

  function connectXero() {
    if (!XERO_CLIENT_ID || !XERO_REDIRECT_URI) {
      showToast('VITE_XERO_CLIENT_ID and VITE_XERO_REDIRECT_URI not set in .env', true)
      return
    }
    const params = new URLSearchParams({
      response_type: 'code',
      client_id:     XERO_CLIENT_ID,
      redirect_uri:  XERO_REDIRECT_URI,
      scope:         'openid profile email accounting.contacts.read offline_access',
    })
    window.location.href = `https://login.xero.com/identity/connect/authorize?${params}`
  }

  async function openXeroImport() {
    setXeroStatus(s => ({ ...s, syncing: true }))
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_FN}/xero-sync`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setXeroStatus(s => ({ ...s, syncing: false }))

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (body.error === 'not_connected') {
        showToast('Xero is not connected yet', true)
      } else {
        showToast(body.error ?? 'Xero sync failed', true)
      }
      return
    }

    const { contacts } = await res.json()
    const existingXeroIds = new Set(clients.map(c => c.xero_contact_id).filter(Boolean))
    setXeroModal({ contacts, existingXeroIds })
  }

  async function importXeroContacts(toImport) {
    const rows = toImport.map(c => ({
      name:            c.name,
      email:           c.email,
      phone:           c.phone,
      address:         c.address,
      xero_contact_id: c.xero_contact_id,
    }))
    const { error } = await supabase
      .from('clients')
      .upsert(rows, { onConflict: 'xero_contact_id', ignoreDuplicates: false })
    if (error) { showToast(error.message, true); return }
    showToast(`${toImport.length} client${toImport.length !== 1 ? 's' : ''} imported from Xero`)
    setXeroModal(null)
    load()
  }

  async function deleteClient(id) {
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) { showToast(error.message, true); return }
    setPanel(null)
    showToast('Client deleted')
    load()
  }

  const filtered = clients.filter(c =>
    !search || [c.name, c.email, c.phone, c.address].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  )

  const panelClient = panel ? clients.find(c => c.id === panel) : null
  const panelJobs   = panelClient ? jobs.filter(j => j.client_id === panelClient.id) : []

  return (
    <div style={s.shell}>

      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.hLeft}>
          <h1 style={s.pageTitle}>Clients</h1>
          {!loading && <span style={s.count}>{clients.length}</span>}
        </div>
        <div style={s.hRight}>
          <button style={s.addBtn} onClick={() => setModal('new')}>+ New Client</button>
        </div>
      </div>

      {/* ── Search ── */}
      <div style={s.searchBar}>
        <span style={s.searchIcon}>🔍</span>
        <input
          style={s.searchInput}
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && <button style={s.clearBtn} onClick={() => setSearch('')}>✕</button>}
      </div>

      {/* ── Content ── */}
      <div style={{ ...s.content, paddingRight: panelClient ? '360px' : 0 }}>
        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            {search ? 'No clients match your search.' : 'No clients yet. Add one or import from Xero.'}
          </div>
        ) : (
          <div style={s.grid}>
            {filtered.map(c => {
              const jobCount = jobs.filter(j => j.client_id === c.id).length
              return (
                <div
                  key={c.id}
                  style={{ ...s.card, ...(panel === c.id ? s.cardActive : {}) }}
                  onClick={() => setPanel(panel === c.id ? null : c.id)}
                >
                  <div style={{ ...s.cardAvatar, background: avatarColor(c.name) }}>
                    {initials(c.name)}
                  </div>
                  <div style={s.cardBody}>
                    <div style={s.cardName}>{c.name}</div>
                    <div style={s.cardMeta}>
                      {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
                    </div>
                    {c.address && <div style={s.cardAddr}>{c.address.split(',')[0]}</div>}
                  </div>
                  <div style={s.cardRight}>
                    {jobCount > 0 && (
                      <span style={s.jobBadge}>{jobCount} job{jobCount !== 1 ? 's' : ''}</span>
                    )}
                    {c.xero_contact_id && <span style={s.xeroBadge}>Xero</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Detail panel ── */}
      {panelClient && (
        <ClientPanel
          client={panelClient}
          jobs={panelJobs}
          onEdit={() => setModal({ client: panelClient })}
          onDelete={() => deleteClient(panelClient.id)}
          onClose={() => setPanel(null)}
        />
      )}

      {/* ── Modals ── */}
      {modal === 'new' && (
        <ClientModal
          client={null}
          onSave={() => { setModal(null); load(); showToast('Client created') }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.client && (
        <ClientModal
          client={modal.client}
          onSave={() => { setModal(null); load(); showToast('Client updated') }}
          onClose={() => setModal(null)}
        />
      )}


      {toast && (
        <div style={{ ...s.toast, background: toast.err ? '#C0392B' : '#2C2416' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Xero logo SVG ──────────────────────────────────────────────────────────
function XeroLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 50 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="25" cy="25" r="25" fill="#13B5EA"/>
      <path d="M13 25l8-8 4 4 4-4 8 8-8 8-4-4-4 4-8-8z" fill="#fff"/>
    </svg>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  shell: { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0', overflow: 'hidden', position: 'relative' },

  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 24px 12px', background: '#fff', borderBottom: '1px solid #E2DDD6', flexShrink: 0,
  },
  hLeft:     { display: 'flex', alignItems: 'center', gap: '10px' },
  hRight:    { display: 'flex', alignItems: 'center', gap: '8px' },
  pageTitle: { fontSize: '20px', fontWeight: '800', color: '#2C2416', margin: 0 },
  count:     { fontSize: '12px', fontWeight: '700', background: '#F5F3F0', color: '#888', borderRadius: '20px', padding: '2px 9px' },

  xeroBtn: {
    display: 'flex', alignItems: 'center', gap: '7px',
    padding: '8px 14px', borderRadius: '7px',
    background: '#fff', border: '1.5px solid #13B5EA', color: '#0B8AAB',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
    transition: 'all 0.12s',
  },
  addBtn: {
    padding: '8px 16px', borderRadius: '7px',
    background: '#2C2416', color: '#fff', border: 'none',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },

  searchBar: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '10px 24px', background: '#fff', borderBottom: '1px solid #E2DDD6', flexShrink: 0,
  },
  searchIcon:  { fontSize: '14px', color: '#bbb' },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', fontSize: '14px',
    color: '#2C2416', background: 'transparent', fontFamily: 'var(--font)',
  },
  clearBtn: { background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: '14px', padding: '2px 4px' },

  content: { flex: 1, overflowY: 'auto', padding: '16px 24px', transition: 'padding-right 0.2s' },
  empty:   { textAlign: 'center', color: '#bbb', fontSize: '14px', padding: '60px 0' },

  grid: { display: 'flex', flexDirection: 'column', gap: '6px' },
  card: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '12px 16px', background: '#fff', borderRadius: '10px',
    border: '1.5px solid #E2DDD6', cursor: 'pointer',
    transition: 'all 0.12s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardActive: { borderColor: '#4A6741', boxShadow: '0 0 0 3px rgba(74,103,65,0.12)' },
  cardAvatar: {
    width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '14px', fontWeight: '700', color: '#fff',
  },
  cardBody:  { flex: 1, minWidth: 0 },
  cardName:  { fontSize: '14px', fontWeight: '700', color: '#2C2416', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardMeta:  { fontSize: '12px', color: '#888', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardAddr:  { fontSize: '11px', color: '#bbb', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 },
  jobBadge:  { fontSize: '10px', fontWeight: '600', background: '#F5F3F0', color: '#888', borderRadius: '20px', padding: '2px 8px' },
  xeroBadge: { fontSize: '10px', fontWeight: '700', background: '#E8F7FC', color: '#0B8AAB', borderRadius: '20px', padding: '2px 8px' },

  toast: {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    color: '#fff', padding: '10px 22px', borderRadius: '8px',
    fontSize: '13px', fontWeight: '600', zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
  },
}

// ── Modal styles ───────────────────────────────────────────────────────────
const m = {
  scrim:  { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.35)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:  { background: '#fff', borderRadius: '12px', width: '480px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #E2DDD6' },
  title:  { fontSize: '16px', fontWeight: '800', color: '#2C2416', margin: 0 },
  closeBtn: { background: 'none', border: 'none', color: '#bbb', fontSize: '18px', cursor: 'pointer', lineHeight: 1, padding: '2px' },
  form:   { padding: '20px', display: 'flex', flexDirection: 'column', gap: '4px' },
  label:  { fontSize: '11px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px' },
  input:  {
    width: '100%', padding: '9px 12px', borderRadius: '7px',
    border: '1.5px solid #E2DDD6', outline: 'none', fontSize: '14px',
    color: '#2C2416', fontFamily: 'var(--font)', background: '#fff',
    boxSizing: 'border-box',
  },
  row2:   { display: 'flex', gap: '12px' },
  error:  { background: '#FFF0EE', border: '1px solid #FCC', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#C0392B', marginTop: '4px' },
  footer: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' },
  cancelBtn: { padding: '9px 18px', borderRadius: '7px', border: '1.5px solid #E2DDD6', background: '#fff', color: '#666', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  saveBtn:   { padding: '9px 20px', borderRadius: '7px', border: 'none', background: '#2C2416', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
}

// ── Panel styles ───────────────────────────────────────────────────────────
const p = {
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '340px',
    background: '#fff', borderLeft: '1px solid #E2DDD6',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.08)',
    display: 'flex', flexDirection: 'column', zIndex: 100,
  },
  header: { display: 'flex', alignItems: 'center', gap: '14px', padding: '20px 16px 16px', borderBottom: '1px solid #E2DDD6' },
  avatar: { width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: '#fff' },
  name:   { fontSize: '16px', fontWeight: '800', color: '#2C2416', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  xeroBadge: { fontSize: '10px', fontWeight: '700', background: '#E8F7FC', color: '#0B8AAB', borderRadius: '20px', padding: '2px 8px' },
  closeBtn: { background: 'none', border: 'none', color: '#bbb', fontSize: '18px', cursor: 'pointer', flexShrink: 0 },
  body:   { flex: 1, overflowY: 'auto', padding: '16px' },
  infoRow:   { display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F5F3F0' },
  infoIcon:  { fontSize: '14px', flexShrink: 0, marginTop: '2px' },
  infoLabel: { fontSize: '10px', fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em' },
  infoValue: { fontSize: '13px', color: '#2C2416', marginTop: '2px', lineHeight: 1.5 },
  link: { color: '#4A7FA5', textDecoration: 'none', fontSize: '13px' },
  section:      { marginTop: '16px' },
  sectionTitle: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' },
  empty:    { fontSize: '13px', color: '#ccc', padding: '8px 0' },
  jobRow:   { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F5F3F0' },
  statusDot:{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  jobTitle: { fontSize: '13px', fontWeight: '600', color: '#2C2416', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  jobMeta:  { fontSize: '11px', color: '#aaa', marginTop: '1px', textTransform: 'capitalize' },
  footer:   { display: 'flex', gap: '8px', padding: '14px 16px', borderTop: '1px solid #E2DDD6', alignItems: 'center' },
  deleteBtn:     { padding: '8px 14px', borderRadius: '7px', border: '1.5px solid #FCC', background: '#FFF0EE', color: '#C0392B', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  deleteConfirm: { padding: '8px 14px', borderRadius: '7px', border: 'none', background: '#C0392B', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelSmall:   { padding: '8px 12px', borderRadius: '7px', border: '1.5px solid #E2DDD6', background: '#fff', color: '#666', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  editBtn:  { flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: '#2C2416', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'center' },
}

// ── Xero import modal styles ───────────────────────────────────────────────
const xi = {
  selAll: { padding: '6px 12px', borderRadius: '6px', border: '1.5px solid #E2DDD6', background: '#fff', color: '#555', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  row: { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid #F5F3F0', cursor: 'pointer' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: '#fff' },
  name: { fontSize: '13px', fontWeight: '600', color: '#2C2416', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: '11px', color: '#aaa', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  addr: { fontSize: '11px', color: '#bbb', flexShrink: 0, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
