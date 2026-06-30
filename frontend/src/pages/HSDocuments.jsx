import { useState, useCallback } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = 'treeco_hs_documents'
const SEED_KEY = 'treeco_hs_docs_seeded_v1'
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB

const CATEGORIES = [
  ['policy',      'Policy'],
  ['certificate', 'Certificate / Prequal'],
  ['register',    'Register'],
  ['plan',        'Plan / Procedure'],
  ['swms',        'SWMS / SOP / SSSP'],
  ['permit',      'Permit / Consent'],
  ['training',    'Training Record'],
  ['other',       'Other'],
]

const CAT_COLORS = {
  policy:      { background: '#E8F0E6', color: '#4A6741' },
  certificate: { background: '#EBF4FA', color: '#2E6A8E' },
  register:    { background: '#F3F4F6', color: '#6B7280' },
  plan:        { background: '#FDF3E3', color: '#B5770F' },
  swms:        { background: '#F0EBF8', color: '#6B3FA0' },
  permit:      { background: '#FFF0EE', color: '#C0392B' },
  training:    { background: '#E8F4F0', color: '#2E7A5E' },
  other:       { background: '#F3F4F6', color: '#6B7280' },
}

// Key documents expected for SiteWise compliance
const SUGGESTED_DOCS = [
  { name: 'Health & Safety Policy',                  category: 'policy' },
  { name: 'Emergency Evacuation Plan',               category: 'plan' },
  { name: 'Hazard & Risk Register',                  category: 'register' },
  { name: 'SiteWise Grading Certificate',            category: 'certificate' },
  { name: 'Site Safe Membership Certificate',        category: 'certificate' },
  { name: 'Public Liability Insurance Certificate',  category: 'certificate' },
  { name: 'Incident & Near Miss Register',           category: 'register' },
  { name: 'Training & Competency Register',          category: 'training' },
  { name: 'SWMS — General Arborist Operations',      category: 'swms' },
  { name: 'SSSP Template (Site-Specific Safety Plan)', category: 'plan' },
  { name: 'Contractor Induction Checklist',          category: 'plan' },
  { name: 'Toolbox Talk Register',                   category: 'register' },
  { name: 'Hazardous Substances Inventory',          category: 'register' },
  { name: 'Mental Health & Wellbeing Policy',        category: 'policy' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadDocs() {
  try {
    if (!localStorage.getItem(SEED_KEY)) {
      const existing = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
      const policy = blankDoc({
        name: 'Health & Safety Policy',
        category: 'policy',
        version: '1.0',
        file_url: '/forms/hs-policy.html',
        uploaded_date: '2026-06-30',
        expiry_date: '2027-06-30',
        notes: 'v1.0 — aligned with HSWA 2015, NZArb, ArbAus MIS 01–14, ECP 34, WorkSafe NZ. Review June 2027.',
      })
      const merged = [policy, ...existing.filter(d => d.name !== 'Health & Safety Policy')]
      localStorage.setItem(LS_KEY, JSON.stringify(merged))
      localStorage.setItem(SEED_KEY, '1')
      return merged
    }
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch { return [] }
}
function saveDocs(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)) }
function genId() { return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return new Date(Number(y), Number(m) - 1, Number(day))
    .toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}
function daysUntil(date) {
  if (!date) return null
  const [y, m, d] = date.split('-')
  return Math.ceil((new Date(Number(y), Number(m) - 1, Number(d)) - new Date()) / 86400000)
}
function expiryBadge(date) {
  const d = daysUntil(date)
  if (d === null) return null
  if (d < 0)   return { text: `Expired ${-d}d ago`, bg: '#FFF0EE', color: '#C0392B' }
  if (d <= 30) return { text: `Due in ${d}d`,        bg: '#FDF3E3', color: '#D4851A' }
  if (d <= 90) return { text: `${d}d`,               bg: '#FDF3E3', color: '#D4851A' }
  return              { text: fmtDate(date),          bg: '#E8F0E6', color: '#4A6741' }
}
function catLabel(cat) { return CATEGORIES.find(([v]) => v === cat)?.[1] ?? cat }

function blankDoc(preset = {}) {
  return {
    id: genId(),
    name: '', category: 'policy', version: '',
    file_data: null, file_name: null, file_url: '',
    uploaded_date: todayStr(), expiry_date: '', notes: '',
    ...preset,
  }
}

// ── Main component ───────────────────────────────────────────────────────────

export default function HSDocuments() {
  const [docs, setDocs]           = useState(loadDocs)
  const [modal, setModal]         = useState(null)
  const [showSuggested, setShow]  = useState(false)

  const persist = useCallback((list) => { setDocs(list); saveDocs(list) }, [])

  const handleSave = useCallback((doc) => {
    const list = docs.some(d => d.id === doc.id)
      ? docs.map(d => d.id === doc.id ? doc : d)
      : [doc, ...docs]
    persist(list); setModal(null)
  }, [docs, persist])

  const handleDelete = useCallback((id) => {
    if (!confirm('Delete this document?')) return
    persist(docs.filter(d => d.id !== id)); setModal(null)
  }, [docs, persist])

  function openFile(doc) {
    const target = doc.file_data || doc.file_url
    if (!target) return
    const a = document.createElement('a')
    a.href = target; a.target = '_blank'; a.rel = 'noopener'; a.click()
  }
  function downloadFile(doc) {
    if (!doc.file_data) return
    const a = document.createElement('a')
    a.href = doc.file_data
    a.download = doc.file_name || doc.name || 'document'
    a.click()
  }

  // Sort: expired/expiring first, then by name
  const sorted = [...docs].sort((a, b) => {
    const da = daysUntil(a.expiry_date) ?? 9999
    const db = daysUntil(b.expiry_date) ?? 9999
    return da !== db ? da - db : (a.name || '').localeCompare(b.name || '')
  })

  const expiring = docs.filter(d => { const days = daysUntil(d.expiry_date); return days !== null && days <= 30 })
  const addedNames = new Set(docs.map(d => d.name.toLowerCase().trim()))
  const missing = SUGGESTED_DOCS.filter(s => !addedNames.has(s.name.toLowerCase()))

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={s.sectionTitle}>H&amp;S Documents · {docs.length}</div>
        <button style={s.addBtn} onClick={() => setModal(blankDoc())}>+ Add Document</button>
      </div>

      {/* Expiry alert */}
      {expiring.length > 0 && (
        <div style={s.alertBanner}>
          <strong>⚠ {expiring.length} document{expiring.length !== 1 ? 's' : ''} expiring or overdue:</strong>
          <span style={{ marginLeft: 6 }}>{expiring.map(d => d.name).join(', ')}</span>
        </div>
      )}

      {/* Suggested documents */}
      {missing.length > 0 && (
        <div style={s.suggestBanner}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#5A4A32', fontWeight: 600 }}>
              {missing.length} SiteWise-recommended documents not yet added
            </span>
            <button style={s.linkBtn} onClick={() => setShow(v => !v)}>
              {showSuggested ? 'Hide' : 'Show'}
            </button>
          </div>
          {showSuggested && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {missing.map(m => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#444' }}>{m.name}</span>
                  <span style={{ ...s.catBadge, ...CAT_COLORS[m.category] }}>{catLabel(m.category)}</span>
                  <button style={s.quickBtn} onClick={() => setModal(blankDoc({ name: m.name, category: m.category }))}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Document list */}
      {sorted.length === 0 ? (
        <div style={s.empty}>
          No documents yet. Use "+ Add Document" or expand the suggested list above to get started.
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map(doc => {
            const eb = expiryBadge(doc.expiry_date)
            const catStyle = CAT_COLORS[doc.category] ?? CAT_COLORS.other
            const hasFile = !!(doc.file_data || doc.file_url)
            return (
              <div key={doc.id} style={s.row}>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setModal({ ...doc })}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <div style={s.rowTitle}>{doc.name}</div>
                    <span style={{ ...s.catBadge, ...catStyle }}>{catLabel(doc.category)}</span>
                    {doc.version && <span style={s.verBadge}>v{doc.version}</span>}
                  </div>
                  <div style={s.rowMeta}>
                    Uploaded {fmtDate(doc.uploaded_date)}
                    {doc.file_name && ` · ${doc.file_name}`}
                    {!hasFile && <span style={{ color: '#e8a020' }}> · No file attached</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  {eb && <span style={{ ...s.expiryBadge, background: eb.bg, color: eb.color }}>{eb.text}</span>}
                  {hasFile && <button style={s.fileBtn} onClick={() => openFile(doc)}>View</button>}
                  {doc.file_data && <button style={s.fileBtn} onClick={() => downloadFile(doc)}>↓</button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <DocModal
          doc={modal}
          isExisting={docs.some(d => d.id === modal.id)}
          onSave={handleSave}
          onDelete={() => handleDelete(modal.id)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Add / Edit modal ──────────────────────────────────────────────────────────

function DocModal({ doc, isExisting, onSave, onDelete, onClose }) {
  const [form, setForm]           = useState(doc)
  const [uploading, setUploading] = useState(false)
  const [sizeErr, setSizeErr]     = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function handleFile(file) {
    if (file.size > MAX_FILE_BYTES) { setSizeErr(true); return }
    setSizeErr(false); setUploading(true)
    const reader = new FileReader()
    reader.onload = e => {
      set('file_data', e.target.result)
      set('file_name', file.name)
      if (!form.name) set('name', file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={s.scrim} onClick={onClose}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.modalHead}>
          <span style={s.modalTitle}>{isExisting ? 'Edit Document' : 'Add Document'}</span>
          <button style={s.xBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.modalBody}>
          <MF label="Document name">
            <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Health & Safety Policy" autoFocus />
          </MF>

          <div style={{ display: 'flex', gap: 10 }}>
            <MF label="Category">
              <select style={s.input} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </MF>
            <MF label="Version">
              <input style={s.input} value={form.version} onChange={e => set('version', e.target.value)} placeholder="e.g. 2.1" />
            </MF>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <MF label="Date uploaded / issued">
              <input type="date" style={s.input} value={form.uploaded_date} onChange={e => set('uploaded_date', e.target.value)} />
            </MF>
            <MF label="Expiry date (if applicable)">
              <input type="date" style={s.input} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
            </MF>
          </div>

          <MF label="Upload file (PDF, Word, image — max 5 MB)">
            {form.file_data ? (
              <div style={s.fileChip}>
                📄 {form.file_name || 'File attached'}
                <button style={s.inlineBtn} onClick={() => { set('file_data', null); set('file_name', null) }}>Remove</button>
              </div>
            ) : (
              <label style={s.uploadLabel}>
                <input type="file" style={{ display: 'none' }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  disabled={uploading}
                  onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
                {uploading ? 'Reading file…' : '📎 Click to choose a file'}
              </label>
            )}
            {sizeErr && <div style={s.errMsg}>File exceeds 5 MB — paste a Drive link below instead.</div>}
          </MF>

          <MF label="Or paste an external link (Google Drive, SharePoint, Dropbox…)">
            <input style={s.input} value={form.file_url} onChange={e => set('file_url', e.target.value)}
              placeholder="https://drive.google.com/…" />
          </MF>

          <MF label="Notes">
            <textarea style={{ ...s.input, minHeight: 56 }} value={form.notes}
              onChange={e => set('notes', e.target.value)} placeholder="Any notes…" />
          </MF>
        </div>

        <div style={s.modalFoot}>
          {isExisting && <button style={s.delBtn} onClick={onDelete}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button style={s.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={s.saveBtn} disabled={!form.name.trim()} onClick={() => onSave(form)}>Save</button>
        </div>
      </div>
    </div>
  )
}

const MF = ({ label, children }) => (
  <div style={{ flex: 1, marginBottom: 12 }}>
    <div style={s.fieldLabel}>{label}</div>
    {children}
  </div>
)

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  addBtn:  { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },

  alertBanner:  { background: '#FFF0EE', border: '1px solid #F5C5BE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#C0392B', marginBottom: 12 },
  suggestBanner: { background: '#FDF8EE', border: '1px solid #E8D5A3', borderRadius: 8, padding: '10px 14px', marginBottom: 14 },
  linkBtn: { background: 'none', border: 'none', color: 'var(--sky)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)', textDecoration: 'underline' },
  quickBtn:{ background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },

  list:  { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 },
  row:   { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' },
  rowTitle: { fontSize: 14, fontWeight: 600, color: 'var(--bark)', lineHeight: 1.3 },
  rowMeta:  { fontSize: 11, color: '#999' },

  catBadge:   { fontSize: 10, fontWeight: 700, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap', letterSpacing: '0.02em' },
  verBadge:   { fontSize: 10, fontWeight: 600, background: '#F3F4F6', color: '#888', borderRadius: 4, padding: '2px 6px' },
  expiryBadge:{ fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' },
  fileBtn:    { background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#555', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0 },
  empty:      { color: '#bbb', fontSize: 14, padding: '24px 0', textAlign: 'center' },

  // Modal
  scrim:     { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.35)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modal:     { background: '#fff', borderRadius: 12, width: 500, maxWidth: '95vw', maxHeight: '90dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  modalTitle:{ fontSize: 15, fontWeight: 800, color: 'var(--bark)' },
  xBtn:      { background: 'none', border: 'none', fontSize: 18, color: '#bbb', cursor: 'pointer', lineHeight: 1 },
  modalBody: { padding: '14px 18px', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  modalFoot: { display: 'flex', gap: 8, alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)' },

  fieldLabel: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  input:      { width: '100%', padding: '9px 11px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', boxSizing: 'border-box', background: '#fff', resize: 'vertical' },

  uploadLabel:{ display: 'block', padding: '10px 14px', border: '1.5px dashed var(--border)', borderRadius: 7, fontSize: 13, color: '#888', cursor: 'pointer', textAlign: 'center' },
  fileChip:   { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555', background: '#f8f8f6', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px' },
  inlineBtn:  { background: 'none', border: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)', marginLeft: 'auto' },
  errMsg:     { fontSize: 12, color: 'var(--danger)', marginTop: 6 },

  saveBtn:   { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 16px', fontSize: 13, color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },
  delBtn:    { background: '#fff', border: '1px solid #E0B4B0', borderRadius: 7, padding: '9px 14px', fontSize: 13, color: 'var(--danger)', cursor: 'pointer', fontFamily: 'var(--font)' },
}
