import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const XERO_CLIENT_ID   = import.meta.env.VITE_XERO_CLIENT_ID   ?? ''
const XERO_REDIRECT_URI = import.meta.env.VITE_XERO_REDIRECT_URI ?? ''
const SUPABASE_FN      = SUPABASE_URL + '/functions/v1'

const RESOURCES = [
  { id: '',           label: '— None —' },
  { id: 'josh',       label: 'Josh Micallef' },
  { id: 'isuzu',      label: 'Isuzu' },
  { id: 'nissan',     label: 'Nissan' },
  { id: 'stump',      label: 'Stump Grinder' },
  { id: 'unassigned', label: 'Unassigned' },
]

const ACCESS_LABELS = { full: 'Full access', restricted: 'Crew' }

// ── Team tab ───────────────────────────────────────────────────────────────
function TeamTab({ toast }) {
  const [users,    setUsers]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [invite,   setInvite]   = useState(false)
  const [sent,     setSent]     = useState(null)  // email that was just invited
  const [form, setForm] = useState({ email: '', name: '', access_level: 'restricted', resource_id: '' })
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('users').select('*').order('name')
    setUsers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openInvite() {
    setInvite(true)
    setSent(null)
    setFormErr(null)
    setForm({ email: '', name: '', access_level: 'restricted', resource_id: '' })
  }

  async function updateUser(id, patch) {
    const { error } = await supabase.from('users').update(patch).eq('id', id)
    if (error) toast(error.message, true)
    else { toast('Saved'); load() }
  }

  async function handleInvite(e) {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr('Name is required'); return }
    if (!form.email.trim()) { setFormErr('Email is required'); return }
    setFormErr(null)
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_FN}/invite-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: form.email, name: form.name, access_level: form.access_level, resource_id: form.resource_id || null }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setFormErr(body.error ?? 'Invite failed — is the Edge Function deployed?')
      return
    }
    setSent(form.email)
    load()
  }

  return (
    <div style={t.section}>
      <div style={t.sectionHead}>
        <div>
          <div style={t.sectionTitle}>Team Members</div>
          <div style={t.sectionSub}>Invite staff and set their access level and calendar resource</div>
        </div>
        {!invite && <button style={t.inviteBtn} onClick={openInvite}>+ Invite</button>}
      </div>

      {invite && (
        <div style={t.inviteCard}>
          {sent ? (
            /* ── Success state ── */
            <div style={t.sentBox}>
              <div style={t.sentIcon}>✉</div>
              <div style={t.sentTitle}>Invite sent to {sent}</div>
              <div style={t.sentBody}>
                They'll receive an email with a link to set up their password and log in to TreeCo.
                The link expires after 24 hours — you can resend from this screen if needed.
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px' }}>
                <button style={t.cancelBtn} onClick={() => setInvite(false)}>Done</button>
                <button style={t.saveBtn} onClick={() => { setSent(null); setForm({ email: '', name: '', access_level: 'restricted', resource_id: '' }) }}>
                  Invite another
                </button>
              </div>
            </div>
          ) : (
            /* ── Form state ── */
            <form onSubmit={handleInvite}>
              <div style={t.inviteFormTitle}>Invite a team member</div>
              <div style={t.inviteFormBody}>
                <div style={t.fieldGroup}>
                  <label style={t.fieldLabel}>Full name</label>
                  <input
                    style={t.input}
                    placeholder="e.g. Ashley Jones"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div style={t.fieldGroup}>
                  <label style={t.fieldLabel}>Email address</label>
                  <input
                    style={t.input}
                    type="email"
                    placeholder="ashley@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div style={t.row2}>
                  <div style={t.fieldGroup}>
                    <label style={t.fieldLabel}>Access level</label>
                    <select style={t.select} value={form.access_level} onChange={e => setForm(f => ({ ...f, access_level: e.target.value }))}>
                      <option value="full">Full access — sees everything</option>
                      <option value="restricted">Crew — today's jobs only</option>
                    </select>
                  </div>
                  <div style={t.fieldGroup}>
                    <label style={t.fieldLabel}>Calendar resource</label>
                    <select style={t.select} value={form.resource_id} onChange={e => setForm(f => ({ ...f, resource_id: e.target.value }))}>
                      {RESOURCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
                {formErr && <div style={t.fieldErr}>{formErr}</div>}
              </div>
              <div style={t.inviteFooter}>
                <button type="button" style={t.cancelBtn} onClick={() => setInvite(false)}>Cancel</button>
                <button type="submit" style={t.saveBtn} disabled={saving}>
                  {saving ? 'Sending invite…' : 'Send invite email'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* deploy hint shown only when Edge Function isn't deployed yet */}
      {invite && !sent && (
        <div style={t.deployHint}>
          Invite emails require the <strong>invite-user</strong> Edge Function to be deployed.{' '}
          <a href="https://supabase.com/dashboard/project/zagwhnnxjtimzvvjaujm/functions" target="_blank" rel="noreferrer" style={{ color: '#4A6741' }}>
            Check deploy status →
          </a>
        </div>
      )}

      {loading ? (
        <div style={t.empty}>Loading…</div>
      ) : (
        <div style={t.userList}>
          {users.map(u => (
            <div key={u.id} style={t.userRow}>
              <div style={{ ...t.userAvatar, background: avatarColor(u.name) }}>{u.name?.[0]?.toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={t.userName}>{u.name}</div>
                <div style={t.userEmail}>{u.email}</div>
              </div>
              <select
                style={{ ...t.select, width: '130px' }}
                value={u.access_level ?? 'restricted'}
                onChange={e => updateUser(u.id, { access_level: e.target.value })}
              >
                <option value="full">Full access</option>
                <option value="restricted">Crew</option>
              </select>
              <select
                style={{ ...t.select, width: '150px' }}
                value={u.resource_id ?? ''}
                onChange={e => updateUser(u.id, { resource_id: e.target.value || null })}
              >
                {RESOURCES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function avatarColor(name = '') {
  const COLORS = ['#4A6741','#4A7FA5','#6B5EA8','#8B4513','#C0392B','#2E7D52']
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff
  return COLORS[Math.abs(h) % COLORS.length]
}

// ── Xero import modal ──────────────────────────────────────────────────────
function XeroImportModal({ contacts, onClose, onDone, toast }) {
  const [existingIds, setExistingIds] = useState(new Set())
  const [loaded,      setLoaded]      = useState(false)

  useEffect(() => {
    supabase.from('clients').select('xero_contact_id').then(({ data }) => {
      setExistingIds(new Set((data ?? []).map(c => c.xero_contact_id).filter(Boolean)))
      setLoaded(true)
    })
  }, [])

  const newContacts = contacts.filter(c => !existingIds.has(c.xero_contact_id))
  const [selected, setSelected] = useState(null) // init after load
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (loaded) setSelected(new Set(newContacts.map(c => c.xero_contact_id)))
  }, [loaded])

  if (!loaded || !selected) return null

  function toggle(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const filtered = newContacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase()) || c.email?.toLowerCase().includes(search.toLowerCase())
  )

  async function handleImport() {
    setImporting(true)
    const rows = contacts
      .filter(c => selected.has(c.xero_contact_id))
      .map(c => ({ name: c.name, email: c.email, phone: c.phone, address: c.address, xero_contact_id: c.xero_contact_id }))
    const { error } = await supabase.from('clients').upsert(rows, { onConflict: 'xero_contact_id' })
    setImporting(false)
    if (error) { toast(error.message, true); return }
    toast(`${rows.length} client${rows.length !== 1 ? 's' : ''} imported`)
    onDone()
  }

  return (
    <div style={xi.scrim} onClick={onClose}>
      <div style={xi.modal} onClick={e => e.stopPropagation()}>
        <div style={xi.header}>
          <div>
            <div style={xi.title}>Import from Xero</div>
            <div style={xi.sub}>{newContacts.length} new · {contacts.length - newContacts.length} already imported</div>
          </div>
          <button style={xi.closeBtn} onClick={onClose}>✕</button>
        </div>
        {newContacts.length === 0
          ? <div style={{ padding: '40px', textAlign: 'center', color: '#aaa', fontSize: '14px' }}>All contacts already imported ✓</div>
          : (
            <>
              <div style={{ padding: '10px 18px', borderBottom: '1px solid #E2DDD6', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input style={{ ...t.input, flex: 1, margin: 0 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
                <button style={t.saveBtn} onClick={() => {
                  const ids = filtered.map(c => c.xero_contact_id)
                  const allOn = ids.every(id => selected.has(id))
                  setSelected(prev => { const n = new Set(prev); ids.forEach(id => allOn ? n.delete(id) : n.add(id)); return n })
                }}>
                  {filtered.every(c => selected.has(c.xero_contact_id)) ? 'Deselect all' : 'Select all'}
                </button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', maxHeight: '340px' }}>
                {filtered.map(c => (
                  <label key={c.xero_contact_id} style={xi.row}>
                    <input type="checkbox" checked={selected.has(c.xero_contact_id)} onChange={() => toggle(c.xero_contact_id)} style={{ accentColor: '#4A6741', width: '14px', height: '14px', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={xi.name}>{c.name}</div>
                      <div style={xi.meta}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )
        }
        <div style={xi.footer}>
          <button style={t.inviteBtn} onClick={onClose} disabled={importing}>Cancel</button>
          {newContacts.length > 0 && (
            <button style={t.saveBtn} disabled={importing || selected.size === 0} onClick={handleImport}>
              {importing ? 'Importing…' : `Import ${selected.size} contact${selected.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Integrations tab ───────────────────────────────────────────────────────
function IntegrationsTab({ toast }) {
  const [xeroConn,     setXeroConn]     = useState(null)
  const [syncing,      setSyncing]      = useState(false)
  const [importModal,  setImportModal]  = useState(null) // null | contacts[]

  async function checkXero() {
    const { data } = await supabase
      .from('xero_connections')
      .select('tenant_name, expires_at')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single()
    setXeroConn(data ?? false)
  }

  useEffect(() => { checkXero() }, [])

  function connectXero() {
    if (!XERO_CLIENT_ID || !XERO_REDIRECT_URI) {
      toast('Set VITE_XERO_CLIENT_ID and VITE_XERO_REDIRECT_URI in frontend/.env', true)
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

  async function syncXero() {
    setSyncing(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${SUPABASE_FN}/xero-sync`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    setSyncing(false)
    if (!res.ok) { toast('Sync failed — check Edge Function logs', true); return }
    const { contacts } = await res.json()
    setImportModal(contacts)
  }

  async function disconnectXero() {
    await supabase.from('xero_connections').delete().eq('id', '00000000-0000-0000-0000-000000000001')
    setXeroConn(false)
    toast('Xero disconnected')
  }

  return (
    <div style={t.section}>
      {importModal && (
        <XeroImportModal
          contacts={importModal}
          toast={toast}
          onClose={() => setImportModal(null)}
          onDone={() => setImportModal(null)}
        />
      )}
      <div style={t.sectionTitle}>Integrations</div>

      {/* Xero */}
      <div style={t.integrationCard}>
        <div style={t.intLogo}>
          <svg width="32" height="32" viewBox="0 0 50 50" fill="none"><circle cx="25" cy="25" r="25" fill="#13B5EA"/><path d="M13 25l8-8 4 4 4-4 8 8-8 8-4-4-4 4-8-8z" fill="#fff"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={t.intName}>Xero</div>
          <div style={t.intDesc}>
            {xeroConn === null
              ? 'Checking connection…'
              : xeroConn
              ? `Connected to ${xeroConn.tenant_name ?? 'Xero'}`
              : 'Import clients and contacts from Xero'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {xeroConn ? (
            <>
              <button style={t.intBtnSecondary} onClick={disconnectXero}>Disconnect</button>
              <button style={t.intBtn} onClick={syncXero} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync contacts'}
              </button>
            </>
          ) : (
            <button style={t.intBtn} onClick={connectXero}>Connect Xero</button>
          )}
        </div>
      </div>

      {/* Edge Functions deployment note */}
      <div style={t.deployNote}>
        <div style={t.deployTitle}>Edge Functions</div>
        <div style={t.deployBody}>
          Deploy the Xero auth and sync functions to Supabase using the CLI once you have your access token:
          <pre style={t.code}>{`supabase login --token YOUR_TOKEN\nsupabase link --project-ref zagwhnnxjtimzvvjaujm\nsupabase functions deploy xero-auth\nsupabase functions deploy xero-sync`}</pre>
          Set secrets in{' '}
          <a href="https://supabase.com/dashboard/project/zagwhnnxjtimzvvjaujm/settings/functions" target="_blank" rel="noreferrer" style={{ color: '#4A6741' }}>
            Supabase → Edge Functions → Secrets
          </a>:
          <pre style={t.code}>{`XERO_CLIENT_ID=...\nXERO_CLIENT_SECRET=...\nXERO_REDIRECT_URI=https://zagwhnnxjtimzvvjaujm.supabase.co/functions/v1/xero-auth\nAPP_URL=https://your-app-url.com`}</pre>
        </div>
      </div>
    </div>
  )
}

// ── Main Settings page ─────────────────────────────────────────────────────
export default function Settings() {
  const [tab,   setTab]   = useState('team')
  const [toast, setToast] = useState(null)

  function showToast(msg, err) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 4000)
  }

  // Handle xero callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('xero') === 'connected') {
      showToast('Xero connected successfully')
      setTab('integrations')
      window.history.replaceState({}, '', '/settings')
    } else if (params.get('xero_error')) {
      showToast(`Xero error: ${params.get('xero_error')}`, true)
      setTab('integrations')
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  return (
    <div style={s.shell}>
      <div style={s.header}>
        <h1 style={s.title}>Settings</h1>
      </div>

      <div style={s.tabs}>
        {[['team', 'Team'], ['integrations', 'Integrations']].map(([id, label]) => (
          <button key={id} style={{ ...s.tab, ...(tab === id ? s.tabActive : {}) }} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {tab === 'team'         && <TeamTab         toast={showToast} />}
        {tab === 'integrations' && <IntegrationsTab toast={showToast} />}
      </div>

      {toast && (
        <div style={{ ...s.toast, background: toast.err ? '#C0392B' : '#2C2416' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  shell:  { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0', overflow: 'hidden' },
  header: { padding: '20px 32px 0', background: '#fff', borderBottom: '1px solid #E2DDD6', flexShrink: 0 },
  title:  { fontSize: '20px', fontWeight: '800', color: '#2C2416', margin: '0 0 14px' },
  tabs:   { display: 'flex', gap: '0', background: '#fff', borderBottom: '1px solid #E2DDD6', padding: '0 32px', flexShrink: 0 },
  tab:    { padding: '10px 18px', border: 'none', borderBottom: '2px solid transparent', background: 'none', fontSize: '13px', fontWeight: '600', color: '#aaa', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: '-1px' },
  tabActive: { color: '#2C2416', borderBottomColor: '#2C2416' },
  body:   { flex: 1, overflowY: 'auto', padding: '24px 32px' },
  toast:  { position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', color: '#fff', padding: '10px 22px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' },
}

const t = {
  section:     { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '700px' },
  sectionHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  sectionTitle:{ fontSize: '15px', fontWeight: '800', color: '#2C2416' },
  sectionSub:  { fontSize: '12px', color: '#aaa', marginTop: '3px' },
  inviteBtn:      { padding: '8px 16px', borderRadius: '7px', border: 'none', background: '#2C2416', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  inviteCard:     { background: '#fff', border: '1.5px solid #E2DDD6', borderRadius: '12px', overflow: 'hidden' },
  inviteFormTitle:{ fontSize: '14px', fontWeight: '800', color: '#2C2416', padding: '18px 20px 0' },
  inviteFormBody: { padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  inviteFooter:   { display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #F0EDE8', background: '#FAFAF8' },
  inviteRow:      { display: 'none' },
  deployHint:     { fontSize: '11px', color: '#aaa', lineHeight: 1.6, padding: '0 2px' },
  fieldGroup:     { display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 },
  fieldLabel:     { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  fieldErr:       { fontSize: '12px', color: '#C0392B', padding: '6px 10px', background: '#FFF0EE', borderRadius: '6px', border: '1px solid #FCC' },
  row2:           { display: 'flex', gap: '12px' },
  cancelBtn:      { padding: '8px 16px', borderRadius: '7px', border: '1.5px solid #E2DDD6', background: '#fff', color: '#666', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  sentBox:        { padding: '32px 24px', textAlign: 'center' },
  sentIcon:       { fontSize: '36px', marginBottom: '12px' },
  sentTitle:      { fontSize: '15px', fontWeight: '800', color: '#2C2416', marginBottom: '8px' },
  sentBody:       { fontSize: '13px', color: '#666', lineHeight: 1.6, maxWidth: '360px', margin: '0 auto' },
  input:  { padding: '9px 12px', borderRadius: '7px', border: '1.5px solid #E2DDD6', fontSize: '13px', color: '#2C2416', fontFamily: 'var(--font)', outline: 'none', width: '100%', boxSizing: 'border-box' },
  select: { padding: '9px 10px', borderRadius: '7px', border: '1.5px solid #E2DDD6', fontSize: '13px', color: '#2C2416', fontFamily: 'var(--font)', background: '#fff', cursor: 'pointer', outline: 'none', width: '100%' },
  saveBtn:{ padding: '9px 18px', borderRadius: '7px', border: 'none', background: '#4A6741', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
  empty:  { color: '#bbb', fontSize: '13px', padding: '20px 0' },
  userList:  { display: 'flex', flexDirection: 'column', gap: '4px' },
  userRow:   { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: '#fff', borderRadius: '8px', border: '1px solid #E2DDD6' },
  userAvatar:{ width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff' },
  userName:  { fontSize: '13px', fontWeight: '700', color: '#2C2416' },
  userEmail: { fontSize: '11px', color: '#aaa', marginTop: '2px' },

  integrationCard: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', background: '#fff', border: '1.5px solid #E2DDD6', borderRadius: '10px' },
  intLogo: { flexShrink: 0 },
  intName: { fontSize: '14px', fontWeight: '700', color: '#2C2416' },
  intDesc: { fontSize: '12px', color: '#888', marginTop: '3px' },
  intBtn:         { padding: '8px 16px', borderRadius: '7px', border: '1.5px solid #13B5EA', background: '#13B5EA', color: '#fff', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
  intBtnSecondary:{ padding: '8px 16px', borderRadius: '7px', border: '1.5px solid #E2DDD6', background: '#fff', color: '#888', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },

  deployNote:  { background: '#FAFAF8', border: '1px solid #E2DDD6', borderRadius: '10px', padding: '16px' },
  deployTitle: { fontSize: '12px', fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' },
  deployBody:  { fontSize: '12px', color: '#666', lineHeight: 1.7 },
  code:        { background: '#F0EDE8', borderRadius: '6px', padding: '10px 12px', fontFamily: 'monospace', fontSize: '11px', color: '#2C2416', margin: '8px 0', whiteSpace: 'pre', overflowX: 'auto' },
}

const xi = {
  scrim:    { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.35)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal:    { background: '#fff', borderRadius: '12px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid #E2DDD6' },
  title:    { fontSize: '15px', fontWeight: '800', color: '#2C2416' },
  sub:      { fontSize: '11px', color: '#aaa', marginTop: '2px' },
  closeBtn: { background: 'none', border: 'none', color: '#bbb', fontSize: '18px', cursor: 'pointer' },
  row:      { display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #F5F3F0', cursor: 'pointer' },
  name:     { fontSize: '13px', fontWeight: '600', color: '#2C2416' },
  meta:     { fontSize: '11px', color: '#aaa', marginTop: '1px' },
  footer:   { display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 18px', borderTop: '1px solid #E2DDD6' },
}
