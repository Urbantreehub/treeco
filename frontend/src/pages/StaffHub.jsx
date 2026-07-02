import { useState, useEffect } from 'react'

const STORAGE_KEY = 'treeco_staff_hub_v1'

const DEFAULT_STAFF = [
  { id: 's1', name: 'Josh Micallef',             role: 'Director / Climber', startDate: null },
  { id: 's2', name: 'Lea Molloy',                role: 'Climber',            startDate: '2026-02-17' },
  { id: 's3', name: 'Stuart Fraser Wilson',       role: 'Climber',            startDate: '2026-01-20' },
  { id: 's4', name: 'Joshua Jack Curran Mongan',  role: 'Groundsman',         startDate: '2025-02-03' },
  { id: 's5', name: 'Sen Aupouri',                role: 'Arborist',           startDate: '2026-06-15' },
  { id: 's6', name: 'Ashley Rapana',              role: 'Arborist',           startDate: '2026-06-08' },
]

const CATEGORIES = [
  { id: 'employment',    label: 'Employment Docs' },
  { id: 'certifications', label: 'Certifications & Licences' },
  { id: 'health_safety', label: 'Health & Safety' },
  { id: 'notes',         label: 'Notes & Performance' },
]

const DOC_TYPES   = ['Contract', 'Licence', 'Certificate', 'Medical', 'Note', 'Other']
const DOC_STATUSES = ['On File', 'Missing', 'Pending', 'Expired']

const STATUS_CHIP = {
  'On File':  { background: '#dcfce7', color: '#15803d' },
  'Missing':  { background: '#fee2e2', color: '#991b1b' },
  'Pending':  { background: '#fef3c7', color: '#92400e' },
  'Expired':  { background: '#fee2e2', color: '#991b1b' },
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

function initials(name) {
  return name ? name[0].toUpperCase() : '?'
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const EMPTY_FORM = { name: '', type: 'Contract', date: '', expiry: '', status: 'On File', notes: '' }

// ─── Inline add-document form ─────────────────────────────────────────────
function AddDocForm({ onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM })

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    if (!form.name.trim()) return
    onSave({ ...form, name: form.name.trim() })
  }

  return (
    <div style={s.addForm}>
      <div style={s.formGrid}>
        <div style={s.formGroup}>
          <label style={s.label}>Document Name *</label>
          <input
            style={s.input}
            type="text"
            placeholder="e.g. Employment Contract"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Type</label>
          <select style={s.select} value={form.type} onChange={e => set('type', e.target.value)}>
            {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Date</label>
          <input style={s.input} type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Expiry (optional)</label>
          <input style={s.input} type="date" value={form.expiry} onChange={e => set('expiry', e.target.value)} />
        </div>
        <div style={s.formGroup}>
          <label style={s.label}>Status</label>
          <select style={s.select} value={form.status} onChange={e => set('status', e.target.value)}>
            {DOC_STATUSES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={s.formGroup}>
        <label style={s.label}>Notes</label>
        <textarea
          style={{ ...s.input, resize: 'vertical', minHeight: 64 }}
          placeholder="Optional notes..."
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>
      <div style={s.formActions}>
        <button style={s.btnSave} onClick={handleSave}>Save</button>
        <button style={s.btnCancel} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ─── Document row ─────────────────────────────────────────────────────────
function DocRow({ doc, onDelete }) {
  const chip = STATUS_CHIP[doc.status] || STATUS_CHIP['On File']
  return (
    <div style={s.docRow}>
      <div style={s.docMain}>
        <span style={s.docName}>{doc.name}</span>
        <span style={s.docType}>{doc.type}</span>
      </div>
      <div style={s.docMeta}>
        {doc.date && <span style={s.docDate}>{formatDate(doc.date)}</span>}
        {doc.expiry && <span style={s.docExpiry}>Exp: {formatDate(doc.expiry)}</span>}
        <span style={{ ...s.statusChip, ...chip }}>{doc.status}</span>
        <button style={s.deleteBtn} onClick={() => onDelete(doc.id)} title="Delete">✕</button>
      </div>
      {doc.notes && <div style={s.docNotes}>{doc.notes}</div>}
    </div>
  )
}

// ─── Category accordion section ───────────────────────────────────────────
function CategorySection({ category, docs, onAdd, onDelete }) {
  const [open,    setOpen]    = useState(true)
  const [adding,  setAdding]  = useState(false)

  function handleSave(formData) {
    onAdd(category.id, formData)
    setAdding(false)
  }

  return (
    <div style={s.section}>
      <button style={s.sectionHeader} onClick={() => setOpen(o => !o)}>
        <span style={s.sectionTitle}>{category.label}</span>
        <span style={s.sectionCount}>{docs.length}</span>
        <span style={{ ...s.chevron, transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>

      {open && (
        <div style={s.sectionBody}>
          {docs.length === 0 && !adding && (
            <div style={s.empty}>No documents yet</div>
          )}
          {docs.map(doc => (
            <DocRow key={doc.id} doc={doc} onDelete={onDelete} />
          ))}
          {adding ? (
            <AddDocForm
              onSave={handleSave}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button style={s.addBtn} onClick={() => setAdding(true)}>
              + Add Document
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Staff card + file area ───────────────────────────────────────────────
function StaffFileArea({ staff, allData, onChange }) {
  const staffDocs = allData[staff.id] || []

  function getDocsForCategory(catId) {
    return staffDocs.filter(d => d.category === catId)
  }

  function handleAdd(catId, formData) {
    const newDoc = {
      id:         uid(),
      category:   catId,
      name:       formData.name,
      type:       formData.type,
      date:       formData.date,
      expiry:     formData.expiry,
      status:     formData.status,
      notes:      formData.notes,
      created_at: new Date().toISOString(),
    }
    const updated = { ...allData, [staff.id]: [...staffDocs, newDoc] }
    onChange(updated)
  }

  function handleDelete(docId) {
    const updated = { ...allData, [staff.id]: staffDocs.filter(d => d.id !== docId) }
    onChange(updated)
  }

  return (
    <div style={s.fileArea}>
      {/* Staff card */}
      <div style={s.staffCard}>
        <div style={s.avatar}>{initials(staff.name)}</div>
        <div>
          <div style={s.staffName}>{staff.name}</div>
          <div style={s.staffRole}>{staff.role}</div>
          {staff.startDate && (
            <div style={s.staffStart}>Started {formatDate(staff.startDate)}</div>
          )}
        </div>
      </div>

      {/* Category sections */}
      <div style={s.sections}>
        {CATEGORIES.map(cat => (
          <CategorySection
            key={cat.id}
            category={cat}
            docs={getDocsForCategory(cat.id)}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main StaffHub page ───────────────────────────────────────────────────
export default function StaffHub() {
  const [selected, setSelected] = useState(DEFAULT_STAFF[0].id)
  const [data,     setData]     = useState(() => loadData())

  useEffect(() => {
    saveData(data)
  }, [data])

  const activeStaff = DEFAULT_STAFF.find(s => s.id === selected)

  return (
    <div style={s.page}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>Staff Hub</h1>
          <div style={s.pageSubtitle}>Urban Tree Services</div>
        </div>
      </div>

      <div style={s.layout}>
        {/* Left sidebar — staff tabs */}
        <div style={s.sidebar}>
          <div style={s.sidebarInner}>
            {DEFAULT_STAFF.map(staff => {
              const isActive = staff.id === selected
              const docCount = (data[staff.id] || []).length
              return (
                <button
                  key={staff.id}
                  onClick={() => setSelected(staff.id)}
                  style={{
                    ...s.staffTab,
                    ...(isActive ? s.staffTabActive : {}),
                  }}
                >
                  <div style={{ ...s.tabAvatar, ...(isActive ? s.tabAvatarActive : {}) }}>
                    {initials(staff.name)}
                  </div>
                  <div style={s.tabInfo}>
                    <div style={{ ...s.tabName, ...(isActive ? s.tabNameActive : {}) }}>
                      {staff.name}
                    </div>
                    <div style={s.tabRole}>{staff.role}</div>
                  </div>
                  {docCount > 0 && (
                    <span style={{ ...s.tabCount, ...(isActive ? s.tabCountActive : {}) }}>
                      {docCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right — file area */}
        <div style={s.content}>
          {activeStaff && (
            <StaffFileArea
              key={activeStaff.id}
              staff={activeStaff}
              allData={data}
              onChange={setData}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: '100%',
    background: '#f9fafb',
    display: 'flex',
    flexDirection: 'column',
  },
  pageHeader: {
    padding: '24px 24px 0',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pageTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--bark)',
    lineHeight: 1.1,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 3,
  },

  layout: {
    display: 'flex',
    flex: 1,
    gap: 0,
    padding: '20px 24px 24px',
    overflow: 'hidden',
    minHeight: 0,
  },

  // ── Sidebar ──────────────────────────────────────────────────────────
  sidebar: {
    width: 240,
    minWidth: 240,
    overflowY: 'auto',
    paddingRight: 16,
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  staffTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
    transition: 'background 0.15s',
  },
  staffTabActive: {
    background: '#f0fdf4',
    boxShadow: 'inset 3px 0 0 #16a34a',
  },
  tabAvatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#d1fae5',
    color: '#065f46',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  tabAvatarActive: {
    background: '#16a34a',
    color: '#fff',
  },
  tabInfo: {
    flex: 1,
    minWidth: 0,
  },
  tabName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  tabNameActive: {
    color: '#16a34a',
  },
  tabRole: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  tabCount: {
    background: '#e5e7eb',
    color: '#6b7280',
    borderRadius: 10,
    padding: '1px 6px',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  tabCountActive: {
    background: '#bbf7d0',
    color: '#15803d',
  },

  // ── Content area ──────────────────────────────────────────────────────
  content: {
    flex: 1,
    minWidth: 0,
    overflowY: 'auto',
  },
  fileArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },

  // ── Staff card ────────────────────────────────────────────────────────
  staffCard: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: '#16a34a',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 20,
    flexShrink: 0,
  },
  staffName: {
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--bark)',
  },
  staffRole: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  staffStart: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },

  // ── Sections ──────────────────────────────────────────────────────────
  sections: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  section: {
    background: '#fff',
    borderRadius: 8,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '13px 16px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f3f4f6',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--bark)',
  },
  sectionCount: {
    fontSize: 12,
    color: '#9ca3af',
    background: '#f3f4f6',
    borderRadius: 10,
    padding: '1px 7px',
    fontWeight: 600,
  },
  chevron: {
    color: '#9ca3af',
    fontSize: 14,
    transition: 'transform 0.2s',
    display: 'inline-block',
  },
  sectionBody: {
    padding: '8px 0',
  },
  empty: {
    padding: '10px 16px',
    fontSize: 13,
    color: '#9ca3af',
    fontStyle: 'italic',
  },

  // ── Document rows ─────────────────────────────────────────────────────
  docRow: {
    padding: '9px 16px',
    borderBottom: '1px solid #f9fafb',
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  docMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  docName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#111827',
    flex: 1,
  },
  docType: {
    fontSize: 11,
    color: '#9ca3af',
    background: '#f3f4f6',
    borderRadius: 4,
    padding: '1px 6px',
  },
  docMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  docDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  docExpiry: {
    fontSize: 12,
    color: '#9ca3af',
  },
  statusChip: {
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 20,
    padding: '2px 8px',
  },
  docNotes: {
    fontSize: 12,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 2,
    paddingLeft: 2,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#d1d5db',
    cursor: 'pointer',
    fontSize: 13,
    padding: '2px 4px',
    borderRadius: 4,
    marginLeft: 'auto',
    lineHeight: 1,
    transition: 'color 0.15s',
  },

  // ── Add doc form ──────────────────────────────────────────────────────
  addBtn: {
    display: 'block',
    margin: '8px 16px 4px',
    padding: '7px 14px',
    background: '#f0fdf4',
    border: '1px dashed #86efac',
    borderRadius: 6,
    color: '#16a34a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    width: 'calc(100% - 32px)',
    textAlign: 'left',
  },
  addForm: {
    margin: '8px 16px',
    padding: '14px',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 10,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  input: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    color: '#111827',
    background: '#fff',
    outline: 'none',
    fontFamily: 'var(--font, inherit)',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '7px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    color: '#111827',
    background: '#fff',
    outline: 'none',
    fontFamily: 'var(--font, inherit)',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  formActions: {
    display: 'flex',
    gap: 8,
  },
  btnSave: {
    padding: '8px 18px',
    background: '#16a34a',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font, inherit)',
  },
  btnCancel: {
    padding: '8px 14px',
    background: 'none',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    color: '#6b7280',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'var(--font, inherit)',
  },
}
