import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// ── Vault configs ───────────────────────────────────────────────────────────
const STAFF_TYPES = [
  ['qualification', 'Qualification'], ['licence', 'Licence'], ['moj', 'MOJ check'],
  ['drug_test', 'Drug test'], ['asbestos', 'Asbestos cert'], ['employment_agreement', 'Employment agreement'],
  ['id_document', 'ID / Passport'], ['medical', 'Medical'], ['induction', 'Induction'], ['other', 'Other'],
]
const COMPANY_TYPES = [
  ['insurance', 'Insurance'], ['certificate', 'Certificate'], ['registration', 'Registration'],
  ['prequalification', 'Prequalification'], ['policy', 'Policy'], ['other', 'Other'],
]
const DOC_TYPES = [
  ['swms', 'SWMS'], ['sop', 'SOP'], ['sssp', 'SSSP'], ['policy', 'Policy'],
  ['procedure', 'Procedure'], ['register', 'Register'], ['other', 'Other'],
]
const label = (pairs, v) => (pairs.find(p => p[0] === v)?.[1]) ?? v

// ── Expiry helpers ──────────────────────────────────────────────────────────
function daysUntil(date) {
  if (!date) return null
  const d = Math.ceil((new Date(date) - new Date()) / 86400000)
  return d
}
function expiryBadge(date) {
  const d = daysUntil(date)
  if (d === null) return null
  if (d < 0)   return { text: `Expired ${-d}d ago`, bg: '#FFF0EE', color: '#C0392B' }
  if (d <= 30) return { text: `Due in ${d}d`,       bg: '#FDF3E3', color: '#D4851A' }
  return { text: `${d}d`, bg: '#E8F0E6', color: '#4A6741' }
}
function fmt(d) { return d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }

async function openFile(file_url) {
  if (!file_url) return
  if (/^https?:\/\//.test(file_url)) { window.open(file_url, '_blank'); return }
  const { data } = await supabase.storage.from('safety').createSignedUrl(file_url, 120)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

export default function Safety() {
  const { profile } = useAuth()
  const [tab, setTab] = useState('overview')
  const [staff, setStaff] = useState([])
  const [company, setCompany] = useState([])
  const [docs, setDocs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { vault, row }

  const load = useCallback(async () => {
    setLoading(true)
    const [s, c, d, u] = await Promise.all([
      supabase.from('staff_records').select('*').order('expiry_date', { nullsFirst: false }),
      supabase.from('company_documents').select('*').order('expiry_date', { nullsFirst: false }),
      supabase.from('safety_documents').select('*').order('updated_at', { ascending: false }),
      supabase.from('users').select('id, name').order('name'),
    ])
    setStaff(s.data ?? []); setCompany(c.data ?? []); setDocs(d.data ?? []); setUsers(u.data ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const userName = id => users.find(u => u.id === id)?.name

  // Expiring across staff + company + doc reviews
  const expiring = [
    ...staff.map(r => ({ when: r.expiry_date, what: `${userName(r.user_id) || r.staff_name || 'Staff'} — ${r.title}`, kind: label(STAFF_TYPES, r.record_type), vault: 'staff', row: r })),
    ...company.map(r => ({ when: r.expiry_date, what: r.title, kind: label(COMPANY_TYPES, r.doc_type), vault: 'company', row: r })),
    ...docs.filter(r => r.review_date).map(r => ({ when: r.review_date, what: `${r.title} (review)`, kind: label(DOC_TYPES, r.doc_type), vault: 'docs', row: r })),
  ].filter(x => x.when).sort((a, b) => new Date(a.when) - new Date(b.when))
  const flagged = expiring.filter(x => daysUntil(x.when) <= 30)

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Safety &amp; Compliance</h1>
          <div style={s.sub}>Documents, staff records, insurances · {profile?.access_level === 'office' ? 'Office' : 'Admin'} access</div>
        </div>
      </div>

      <div style={s.tabs}>
        {[['overview', `Overview${flagged.length ? ` (${flagged.length})` : ''}`], ['staff', 'Staff Records'], ['company', 'Company & Insurance'], ['docs', 'Documents']].map(([k, t]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...s.tab, ...(tab === k ? s.tabOn : {}) }}>{t}</button>
        ))}
      </div>

      {loading ? <div style={s.empty}>Loading…</div> : (
        <div style={s.body}>
          {tab === 'overview' && (
            <Overview flagged={flagged} expiring={expiring} staff={staff} company={company} docs={docs}
              onOpen={x => setTab(x.vault === 'docs' ? 'docs' : x.vault)} />
          )}
          {tab === 'staff' && (
            <Vault title="Staff Records" rows={staff} types={STAFF_TYPES}
              cols={[['title', 'Document'], ['who', 'Staff'], ['issued_date', 'Issued'], ['expiry_date', 'Expires']]}
              render={r => ({ who: userName(r.user_id) || r.staff_name || '—' })}
              onAdd={() => setModal({ vault: 'staff', row: {} })} onEdit={r => setModal({ vault: 'staff', row: r })} />
          )}
          {tab === 'company' && (
            <Vault title="Company & Insurance" rows={company} types={COMPANY_TYPES}
              cols={[['title', 'Document'], ['issuer', 'Issuer'], ['reference', 'Ref'], ['expiry_date', 'Expires']]}
              render={() => ({})}
              onAdd={() => setModal({ vault: 'company', row: {} })} onEdit={r => setModal({ vault: 'company', row: r })} />
          )}
          {tab === 'docs' && (
            <Vault title="Documents (SWMS / SOP / SSSP / Policy)" rows={docs} types={DOC_TYPES}
              cols={[['title', 'Title'], ['version', 'Ver'], ['status', 'Status'], ['review_date', 'Review']]}
              render={r => ({ version: `v${r.version}` })}
              onAdd={() => setModal({ vault: 'docs', row: {} })} onEdit={r => setModal({ vault: 'docs', row: r })} />
          )}
        </div>
      )}

      {modal && <RecordModal {...modal} users={users} onClose={() => setModal(null)} onSaved={() => { setModal(null); load() }} createdBy={profile?.id} />}
    </div>
  )
}

function Overview({ flagged, expiring, staff, company, docs, onOpen }) {
  const stat = (n, l) => <div style={s.statCard}><div style={s.statNum}>{n}</div><div style={s.statLbl}>{l}</div></div>
  return (
    <div>
      <div style={s.statRow}>
        {stat(staff.length, 'Staff records')}
        {stat(company.length, 'Company docs')}
        {stat(docs.length, 'Safety documents')}
        {stat(flagged.length, 'Expiring / overdue')}
      </div>
      <div style={s.sectionTitle}>Needs attention</div>
      {flagged.length === 0 ? <div style={s.empty}>Nothing expiring in the next 30 days ✓</div> : (
        <div style={s.list}>
          {flagged.map((x, i) => {
            const b = expiryBadge(x.when)
            return (
              <div key={i} style={s.row} onClick={() => onOpen(x)}>
                <div style={{ flex: 1 }}>
                  <div style={s.rowTitle}>{x.what}</div>
                  <div style={s.rowMeta}>{x.kind} · {fmt(x.when)}</div>
                </div>
                {b && <span style={{ ...s.badge, background: b.bg, color: b.color }}>{b.text}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Vault({ title, rows, types, cols, render, onAdd, onEdit }) {
  return (
    <div>
      <div style={s.vaultHead}>
        <span style={s.sectionTitle}>{title} · {rows.length}</span>
        <button style={s.addBtn} onClick={onAdd}>+ Add</button>
      </div>
      {rows.length === 0 ? <div style={s.empty}>Nothing here yet — add the first record.</div> : (
        <div style={s.list}>
          {rows.map(r => {
            const extra = render(r)
            const b = expiryBadge(r.expiry_date ?? r.review_date)
            return (
              <div key={r.id} style={s.row} onClick={() => onEdit(r)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.rowTitle}>{r.title}</div>
                  <div style={s.rowMeta}>
                    {label(types, r.doc_type ?? r.record_type)}
                    {cols.slice(1).map(([k]) => { const v = extra[k] ?? (k.includes('date') ? fmt(r[k]) : r[k]); return v ? ` · ${v}` : '' }).join('')}
                  </div>
                </div>
                {r.file_url && <button style={s.fileBtn} onClick={e => { e.stopPropagation(); openFile(r.file_url) }}>📄 View</button>}
                {b && <span style={{ ...s.badge, background: b.bg, color: b.color }}>{b.text}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RecordModal({ vault, row, users, onClose, onSaved, createdBy }) {
  const cfg = {
    staff:   { table: 'staff_records',     types: STAFF_TYPES,   typeKey: 'record_type', dateKeys: ['issued_date', 'expiry_date'] },
    company: { table: 'company_documents', types: COMPANY_TYPES, typeKey: 'doc_type',    dateKeys: ['effective_date', 'expiry_date'] },
    docs:    { table: 'safety_documents',  types: DOC_TYPES,     typeKey: 'doc_type',    dateKeys: ['effective_date', 'review_date'] },
  }[vault]
  const [form, setForm] = useState({ [cfg.typeKey]: row[cfg.typeKey] ?? cfg.types[0][0], ...row })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function upload(file) {
    setUploading(true)
    const path = `${vault}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
    const { error } = await supabase.storage.from('safety').upload(path, file)
    if (!error) set('file_url', path)
    setUploading(false)
  }

  async function save() {
    setSaving(true)
    const payload = { ...form, created_by: form.created_by ?? createdBy }
    delete payload.id
    Object.keys(payload).forEach(k => payload[k] === '' && (payload[k] = null))
    const res = row.id
      ? await supabase.from(cfg.table).update(payload).eq('id', row.id)
      : await supabase.from(cfg.table).insert(payload)
    setSaving(false)
    if (!res.error) onSaved()
    else alert('Save failed: ' + res.error.message)
  }
  async function remove() {
    if (!confirm('Delete this record?')) return
    await supabase.from(cfg.table).delete().eq('id', row.id)
    onSaved()
  }

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <span style={s.modalTitle}>{row.id ? 'Edit' : 'Add'} record</span>
          <button style={s.x} onClick={onClose}>✕</button>
        </div>
        <div style={s.modalBody}>
          <Field label="Type"><select style={s.input} value={form[cfg.typeKey]} onChange={e => set(cfg.typeKey, e.target.value)}>
            {cfg.types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Title"><input style={s.input} value={form.title ?? ''} onChange={e => set('title', e.target.value)} placeholder="e.g. Public Liability $2M" /></Field>
          {vault === 'staff' && (
            <Field label="Staff member"><select style={s.input} value={form.user_id ?? ''} onChange={e => set('user_id', e.target.value || null)}>
              <option value="">— (or type a name below) —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <input style={{ ...s.input, marginTop: 6 }} value={form.staff_name ?? ''} onChange={e => set('staff_name', e.target.value)} placeholder="Name if not in list" /></Field>
          )}
          {vault === 'company' && <Field label="Issuer"><input style={s.input} value={form.issuer ?? ''} onChange={e => set('issuer', e.target.value)} placeholder="e.g. Chubb / Protecsure" /></Field>}
          <Field label="Reference"><input style={s.input} value={form.reference ?? ''} onChange={e => set('reference', e.target.value)} placeholder="Policy / cert number" /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label={cfg.dateKeys[0].replace(/_/g, ' ')}><input type="date" style={s.input} value={form[cfg.dateKeys[0]] ?? ''} onChange={e => set(cfg.dateKeys[0], e.target.value)} /></Field>
            <Field label={cfg.dateKeys[1].replace(/_/g, ' ')}><input type="date" style={s.input} value={form[cfg.dateKeys[1]] ?? ''} onChange={e => set(cfg.dateKeys[1], e.target.value)} /></Field>
          </div>
          <Field label="File">
            {form.file_url && <div style={s.fileChip}>📄 attached <button style={s.linkBtn} onClick={() => openFile(form.file_url)}>view</button> <button style={s.linkBtn} onClick={() => set('file_url', null)}>remove</button></div>}
            <input type="file" onChange={e => e.target.files[0] && upload(e.target.files[0])} disabled={uploading} />
            <input style={{ ...s.input, marginTop: 6 }} value={/^https?:/.test(form.file_url ?? '') ? form.file_url : ''} onChange={e => set('file_url', e.target.value)} placeholder="…or paste a link (e.g. Drive)" />
          </Field>
          <Field label="Notes"><textarea style={{ ...s.input, minHeight: 60 }} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} /></Field>
        </div>
        <div style={s.modalFoot}>
          {row.id && <button style={s.delBtn} onClick={remove}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} onClick={save} disabled={saving || uploading || !form.title}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
const Field = ({ label, children }) => <div style={{ flex: 1, marginBottom: 12 }}><div style={s.fieldLabel}>{label}</div>{children}</div>

const s = {
  page: { padding: '24px 28px', maxWidth: 920, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--bark)' },
  sub: { fontSize: 13, color: '#888', marginTop: 2 },
  tabs: { display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 18, flexWrap: 'wrap' },
  tab: { background: 'none', border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 600, color: '#888', cursor: 'pointer', borderBottom: '2px solid transparent', fontFamily: 'var(--font)' },
  tabOn: { color: 'var(--bark)', borderBottom: '2px solid var(--moss)' },
  body: {},
  statRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 },
  statCard: { flex: 1, minWidth: 120, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' },
  statNum: { fontSize: 26, fontWeight: 800, color: 'var(--bark)' },
  statLbl: { fontSize: 12, color: '#888', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  vaultHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' },
  rowTitle: { fontSize: 14, fontWeight: 600, color: 'var(--bark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 },
  fileBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#666', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)' },
  addBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  empty: { color: '#bbb', fontSize: 14, padding: '24px 0', textAlign: 'center' },
  scrim: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.35)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal: { background: '#fff', borderRadius: 12, width: 480, maxWidth: '95vw', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontSize: 15, fontWeight: 800, color: 'var(--bark)' },
  x: { background: 'none', border: 'none', fontSize: 18, color: '#bbb', cursor: 'pointer' },
  modalBody: { padding: '14px 18px', overflowY: 'auto' },
  modalFoot: { display: 'flex', gap: 8, alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)' },
  fieldLabel: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  input: { width: '100%', padding: '9px 11px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', boxSizing: 'border-box', background: '#fff' },
  fileChip: { fontSize: 12, color: '#666', marginBottom: 6 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--sky)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 },
  saveBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 16px', fontSize: 13, color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },
  delBtn: { background: '#fff', border: '1px solid #E0B4B0', borderRadius: 7, padding: '9px 14px', fontSize: 13, color: 'var(--danger)', cursor: 'pointer', fontFamily: 'var(--font)' },
}
