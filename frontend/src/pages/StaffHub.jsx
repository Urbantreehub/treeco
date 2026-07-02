import { useState, useEffect } from 'react'

const STORAGE_KEY = 'treeco_staff_hub_v1'
const SEEDED_KEY  = 'treeco_staff_hub_seeded_v1'

const DEFAULT_STAFF = [
  { id: 's1', name: 'Josh Micallef',             role: 'Director / Climber', startDate: null },
  { id: 's2', name: 'Lea Molloy',                role: 'Climber',            startDate: '2026-02-17' },
  { id: 's3', name: 'Stuart Fraser Wilson',       role: 'Climber',            startDate: '2026-01-20' },
  { id: 's4', name: 'Joshua Jack Curran Mongan',  role: 'Groundsman',         startDate: '2025-02-03' },
  { id: 's5', name: 'Sen Aupouri',                role: 'Arborist',           startDate: '2026-06-15' },
  { id: 's6', name: 'Ashley Rapana',              role: 'Admin Officer',      startDate: '2026-06-08' },
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

// ─── Seed records ─────────────────────────────────────────────────────────
// Real records pulled from Gmail + Google Drive (July 2026 audit).
// Categories: employment | certifications | health_safety | notes
const SEED_CREATED = '2026-07-02T00:00:00.000Z'

const SEED_RECORDS = {
  s1: [
    { id: 'seed-s1-1', category: 'certifications', name: 'Cert III & Diploma of Arboriculture (AQF 3 & 5)', type: 'Certificate', date: '', expiry: '', status: 'Pending', notes: 'Self-stated in Josh\'s email signature. No certificate copy on file — needs to be uploaded.', created_at: SEED_CREATED },
    { id: 'seed-s1-2', category: 'employment', name: 'Passport copy (Australian, PA8292256)', type: 'Other', date: '2018-08-16', expiry: '2028-08-16', status: 'On File', notes: 'JOSHMPASSPORT.jpeg — https://drive.google.com/file/d/128IiS2-x4shhjyF4DLGQnQff2-3EdFs4/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s1-3', category: 'employment', name: 'Statutory declaration — criminal record (Downer interim)', type: 'Other', date: '2026-03-10', expiry: '', status: 'On File', notes: 'Interim while MOJ check outstanding. https://drive.google.com/file/d/1lp9ptz7kop2jpB2g1AcOUKt1R6g7A1ay/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s1-4', category: 'employment', name: 'Ministry of Justice check (Downer/Kainga Ora requirement)', type: 'Other', date: '', expiry: '', status: 'Missing', notes: 'Still outstanding per Downer email 22 May 2026 (F.SioneTLeasi@downergroup.com). Statutory declaration provided as interim.', created_at: SEED_CREATED },
    { id: 'seed-s1-5', category: 'employment', name: 'Downer/Wellington Subcontractor ID Request FY2026-27', type: 'Other', date: '2026-03-10', expiry: '', status: 'On File', notes: 'JOSH M FORM.pdf — https://drive.google.com/file/d/1s6H89BqngkZoVVnLlLE1naTUqQGke5Dl/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s1-6', category: 'health_safety', name: 'Spencers WorkEd online courses — enrolled', type: 'Note', date: '2025-11-19', expiry: '', status: 'Pending', notes: 'Enrolments (WorkEd@spencersnz.co.nz, username 27803): Incident Reporting (19 Nov 2025), Stay Safe Take 5! (14 Jan 2026), Squatter Safety + Site Safety: The Hazard Board (16 Feb 2026). No completion confirmations on file.', created_at: SEED_CREATED },
  ],
  s2: [
    { id: 'seed-s2-1', category: 'certifications', name: 'NZ Certificate in Horticulture (Arboriculture) Level 3 (NZ2678)', type: 'Certificate', date: '2024-11-27', expiry: '', status: 'On File', notes: 'Otago Polytechnic / Te Pukenga. https://drive.google.com/file/d/16axPlHfOaPqX9DJC3LL89M7VtSie3zMZ/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s2-2', category: 'certifications', name: 'NZ Certificate in Horticulture Services (Arboriculture) Level 4 (NZ2674)', type: 'Certificate', date: '2024-11-27', expiry: '', status: 'On File', notes: 'Otago Polytechnic / Te Pukenga. https://drive.google.com/file/d/1wihzy3lJ0zPQgg0vJ2omF0gXp0KXBO2b/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s2-3', category: 'certifications', name: 'Spencers Risk Contractor Training Part One — completed', type: 'Certificate', date: '2025-01-16', expiry: '', status: 'On File', notes: 'Provider: Spencers WorkEd (WorkEd@spencersnz.co.nz, username 27860). Completion record printable via WorkEd login.', created_at: SEED_CREATED },
    { id: 'seed-s2-4', category: 'employment', name: 'Passport copy (NZ, RA590930)', type: 'Other', date: '2023-03-22', expiry: '2033-03-22', status: 'On File', notes: 'https://drive.google.com/file/d/1WqH_DBsg9gIWHwdiN_IaAkt8cgD1Neks/view?usp=drivesdk (duplicate copy: https://drive.google.com/file/d/1lcTmF-IYdq_yPxf7ik007FlKdlGuKrs1/view?usp=drivesdk)', created_at: SEED_CREATED },
    { id: 'seed-s2-5', category: 'employment', name: 'MOJ criminal conviction check — no convictions', type: 'Other', date: '2026-04-16', expiry: '', status: 'On File', notes: 'lea-moj.pdf — https://drive.google.com/file/d/1sDfsiIGH91ylF0UHHGlZU-ayBCKcfy4T/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s2-6', category: 'employment', name: 'Downer/Wellington Subcontractor ID Request FY2026-27', type: 'Other', date: '2026-03-10', expiry: '', status: 'On File', notes: 'LEA-SUBCONTRACTORID.pdf — https://drive.google.com/file/d/19oTzGw30ezfP8kG3Kk3HUtoONOX1LiUY/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s2-7', category: 'employment', name: 'Employment agreement', type: 'Contract', date: '', expiry: '', status: 'Missing', notes: 'Flagged outstanding by Downer (21-22 May 2026). Not found in Drive or email. Re-hired 17 Feb 2026 after resignation effective 23 Dec 2025.', created_at: SEED_CREATED },
    { id: 'seed-s2-8', category: 'health_safety', name: 'Incident investigation form — 24 Nov 2025', type: 'Note', date: '2025-11-24', expiry: '', status: 'On File', notes: '"Incident investigation form Lea 24112025" shared via Microsoft 365 with leamolloy@gmail.com.', created_at: SEED_CREATED },
    { id: 'seed-s2-9', category: 'health_safety', name: 'Spencers WorkEd online courses — enrolled', type: 'Note', date: '2025-11-19', expiry: '', status: 'Pending', notes: 'Enrolments: Incident Reporting (19 Nov 2025), Stay Safe Take 5! (14 Jan 2026), Risk Contractor Training Part Two (2 Feb 2026), Squatter Safety + Site Safety: The Hazard Board (16 Feb 2026). Only Part One completion confirmed.', created_at: SEED_CREATED },
  ],
  s3: [
    { id: 'seed-s3-1', category: 'employment', name: 'Employment agreement — Crew Leader / Climber / Truck Driver ($50/hr)', type: 'Contract', date: '2026-06-29', expiry: '', status: 'On File', notes: 'Start date on agreement 29/06/2026. https://drive.google.com/file/d/1XkhyveRtN-K4QTbnU3Oyphel6qhaQwE9/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s3-2', category: 'employment', name: 'Letter of offer', type: 'Contract', date: '2026-06-29', expiry: '', status: 'On File', notes: 'https://drive.google.com/file/d/1bq_wGXAOEZzMBLdlJGRWqFCDcKkFgcXV/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s3-3', category: 'employment', name: 'Position description — Crew Leader / Climber / Truck Driver', type: 'Other', date: '2026-06-29', expiry: '', status: 'On File', notes: 'https://drive.google.com/file/d/1ViRcjIQQQAqFW5Ff3DKKMQg-SOfFF98w/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s3-4', category: 'employment', name: 'Payroll details — IRD 070 748 525, ASB bank, address', type: 'Other', date: '2026-01-13', expiry: '', status: 'On File', notes: 'Emailed by Stuart (stuarborist@gmail.com), "Stu wilson details." 21 Omega St, Newlands.', created_at: SEED_CREATED },
    { id: 'seed-s3-5', category: 'employment', name: 'MOJ criminal conviction check — no convictions', type: 'Other', date: '2026-01-22', expiry: '', status: 'On File', notes: 'STU MOJ.pdf — https://drive.google.com/file/d/1ca6_j6KT-WMyZMlKKnXaP_rwd9-q9DbY/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s3-6', category: 'employment', name: 'Passport copy (NZ, RA018264)', type: 'Other', date: '2021-12-14', expiry: '2031-12-14', status: 'On File', notes: 'STU-ID2.jpg — https://drive.google.com/file/d/1DhML16QVFIbKgbSC7CXVnCEAdY1EtO-V/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s3-7', category: 'employment', name: 'Downer/Wellington Subcontractor ID Request FY2026-27', type: 'Other', date: '2026-03-10', expiry: '', status: 'On File', notes: 'STU WILSON DOWNER ID FORM.pdf — https://drive.google.com/file/d/10Eh1-ifQ6SyKwe5pDgA0h7bqC8NDykjf/view?usp=drivesdk. Spencers site ID held for Stu (only Urban Tree ID Spencers had as at 29 Jun 2026).', created_at: SEED_CREATED },
    { id: 'seed-s3-8', category: 'employment', name: 'KiwiSaver savings suspension approved (myIR)', type: 'Other', date: '2026-03-04', expiry: '', status: 'On File', notes: 'myIR letter forwarded by Stuart 4 Mar 2026.', created_at: SEED_CREATED },
    { id: 'seed-s3-9', category: 'certifications', name: 'Australian Cert III in Arboriculture (15 yrs experience)', type: 'Certificate', date: '', expiry: '', status: 'Pending', notes: 'Referenced in email to Primary ITO (14 Apr 2026) proposing Stuart as Workplace Assessor/foreman. No certificate copy on file — needs to be uploaded.', created_at: SEED_CREATED },
    { id: 'seed-s3-10', category: 'health_safety', name: 'Spencers WorkEd — Squatter Safety enrolment', type: 'Note', date: '2026-02-16', expiry: '', status: 'Pending', notes: 'Enrolled as "Stu Wilson", WorkEd username 28457. No completion confirmation on file.', created_at: SEED_CREATED },
    { id: 'seed-s3-11', category: 'notes', name: 'Pay-rate dispute — Resolve Legal engaged', type: 'Note', date: '2026-06-29', expiry: '', status: 'On File', notes: 'Dispute email 25 Jun 2026; Josh confirmed $50/hr stands. Resolve Legal (luke@resolvelegal.co.nz) engaged — signed Letter of Engagement, three docs prepared for Stuart.', created_at: SEED_CREATED },
  ],
  s4: [
    { id: 'seed-s4-1', category: 'certifications', name: 'CPR First Aid (includes unit standard) — Meditrain', type: 'Certificate', date: '2025-11-19', expiry: '2027-11-19', status: 'On File', notes: 'Provider: Meditrain (Peter Monk). Cert emailed 23 Nov 2025 by rochelle@meditrain.co.nz — "Josh Curran - CPR First Aid (includes unit standard).pdf".', created_at: SEED_CREATED },
    { id: 'seed-s4-2', category: 'certifications', name: 'NZ Certificate in Arboriculture Level 3 — in progress (Primary ITO)', type: 'Certificate', date: '2025-09-09', expiry: '', status: 'Pending', notes: 'Training Plans TIM:0922004373 (9 Sep 2025) and TIM:0922004894 (26 Mar 2026). As at 14 Apr 2026: 7 units remaining, target Sept 2026. Needs new plan/assessor after Joel Ewan left (meeting 17 Jun 2026).', created_at: SEED_CREATED },
    { id: 'seed-s4-3', category: 'certifications', name: 'NZ Driver Licence — RESTRICTED (ED714033, v225)', type: 'Licence', date: '', expiry: '', status: 'On File', notes: 'JOSHCM-ID.jpeg — https://drive.google.com/file/d/1aw5jL73E9icJdVDBr0PwaBRwZPXMIJtj/view?usp=drivesdk. Expiry not visible on copy — check card.', created_at: SEED_CREATED },
    { id: 'seed-s4-4', category: 'employment', name: 'MOJ Conviction History — no convictions (ref W0H976K30)', type: 'Other', date: '2026-05-09', expiry: '', status: 'On File', notes: 'JOSH-CM MOJ.pdf — https://drive.google.com/file/d/1WeFBuzuKJKRsW2-bAVMTa_RuHAuhN2yv/view?usp=drivesdk', created_at: SEED_CREATED },
    { id: 'seed-s4-5', category: 'employment', name: 'Employment agreement (builders.business.govt.nz)', type: 'Contract', date: '2025-02-13', expiry: '', status: 'On File', notes: 'Employment Agreement Builder completed 13 Feb 2025, 10 days after start — likely Josh CM\'s. Copy not found in Drive.', created_at: SEED_CREATED },
    { id: 'seed-s4-6', category: 'employment', name: 'Downer/Wellington Subcontractor ID Request FY2026-27', type: 'Other', date: '2026-03-10', expiry: '', status: 'On File', notes: 'JOSHCM-FORM.pdf (as "Joshua Jack Curran-Mongan") — https://drive.google.com/file/d/144EYlGf5lTyGvwYL9nxo5EjM-Zu-GwLE/view?usp=drivesdk. Photo supplied to Downer 22 May 2026.', created_at: SEED_CREATED },
    { id: 'seed-s4-7', category: 'employment', name: 'Passport or birth certificate (Downer requirement)', type: 'Other', date: '', expiry: '', status: 'Missing', notes: 'Still outstanding per Downer as at 24 May 2026.', created_at: SEED_CREATED },
    { id: 'seed-s4-8', category: 'health_safety', name: 'Spencers WorkEd online courses — enrolled', type: 'Note', date: '2025-11-19', expiry: '', status: 'Pending', notes: 'Enrolments (username 27939): Incident Reporting (19 Nov 2025), Stay Safe Take 5! (14 Jan 2026), Squatter Safety + Site Safety: The Hazard Board (16 Feb 2026). No completion confirmations on file.', created_at: SEED_CREATED },
  ],
  s5: [
    { id: 'seed-s5-1', category: 'employment', name: 'Employment agreement + letter of offer (builders.business.govt.nz)', type: 'Contract', date: '2026-06-29', expiry: '', status: 'On File', notes: 'Agreement Builder completed 29 Jun 2026 with "Employment agreement.docx" + "Basic letter of offer.docx" — no name in email, timing fits Sen (started 15 Jun 2026). Verify and file copy.', created_at: SEED_CREATED },
    { id: 'seed-s5-2', category: 'health_safety', name: 'Spencers induction / site ID', type: 'Note', date: '2026-06-29', expiry: '', status: 'Pending', notes: 'Induction/portal setup requested via "New Employee - Sen for inductions" (Tyron.Rountree@spencersnz.co.nz); Spencers IDs ready for collection 29 Jun 2026.', created_at: SEED_CREATED },
    { id: 'seed-s5-3', category: 'notes', name: 'Onboarding note — "Sen onboarding"', type: 'Note', date: '2026-06-16', expiry: '', status: 'On File', notes: 'Email josh → urbantreeinvoices@gmail.com, 16 Jun 2026.', created_at: SEED_CREATED },
  ],
  s6: [
    { id: 'seed-s6-1', category: 'employment', name: 'Signed employment agreement (IEA)', type: 'Contract', date: '2026-06-02', expiry: '', status: 'On File', notes: 'IEA_Urban_Tree_Services_Ashley_Rapana.pdf returned signed by ashleyrapana@outlook.com, 2 Jun 2026.', created_at: SEED_CREATED },
    { id: 'seed-s6-2', category: 'employment', name: 'Job offer — Administration Officer', type: 'Other', date: '2026-06-01', expiry: '', status: 'On File', notes: 'Offer sent 1 Jun 2026, accepted same day (ashleyrapana@outlook.com).', created_at: SEED_CREATED },
    { id: 'seed-s6-3', category: 'health_safety', name: 'Spencers site ID', type: 'Note', date: '2026-06-29', expiry: '', status: 'Pending', notes: 'Being checked/chased by Leanne.England@spencersnz.co.nz ("Have you checked the IDs for Ashley at Urban?"), 29 Jun 2026.', created_at: SEED_CREATED },
  ],
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const existing = raw ? JSON.parse(raw) : null
    const hasDocs = existing && Object.values(existing).some(docs => Array.isArray(docs) && docs.length > 0)
    if (!localStorage.getItem(SEEDED_KEY) && !hasDocs) {
      localStorage.setItem(SEEDED_KEY, '1')
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_RECORDS))
      return SEED_RECORDS
    }
    return existing || {}
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
