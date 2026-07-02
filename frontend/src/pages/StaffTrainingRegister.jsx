import { useState, useEffect } from 'react'

// ── Staff roster ──────────────────────────────────────────────────────────────
const STAFF = [
  { id: 'josh',    name: 'Josh Micallef',              role: 'Director / Climber', start: '2015-01-01' },
  { id: 'lea',     name: 'Lea Molloy',                 role: 'Climber',            start: '2026-02-17' },
  { id: 'stuart',  name: 'Stuart Fraser Wilson',       role: 'Climber',            start: '2026-01-20' },
  { id: 'joshua',  name: 'Joshua Jack Curran Mongan',  role: 'Groundsman',         start: '2025-02-03' },
  { id: 'sen',     name: 'Sen Aupouri',                role: 'Arborist',           start: '2026-06-15' },
  { id: 'ashley',  name: 'Ashley Rapana',              role: 'Admin Officer',      start: '2026-06-08' },
]

// ── Qualifications ────────────────────────────────────────────────────────────
// expiryYears: null = no expiry, number = years from obtained date
const QUALS = [
  { key: 'first_aid',     label: 'First Aid',             expiryYears: 3,    note: '3-year expiry' },
  { key: 'chainsaw',      label: 'Chainsaw Cert',         expiryYears: null, note: 'NZ Unit Standards' },
  { key: 'nzarb_l3',     label: 'NZArb Level 3+',        expiryYears: null, note: 'No expiry' },
  { key: 'climbing',      label: 'Climbing Cert',         expiryYears: null, note: 'No expiry' },
  { key: 'aerial_rescue', label: 'Aerial Rescue',         expiryYears: null, note: 'Annual practice' },
  { key: 'ttm',           label: 'TTM',                   expiryYears: 3,    note: 'Traffic Management' },
  { key: 'growsafe',      label: 'GROWSAFE / EPA',        expiryYears: 5,    note: 'Approved Handler' },
  { key: 'driver_lic',    label: 'Driver Licence',        expiryYears: null, note: 'Check class type' },
]

const LS_KEY = 'treeco_training_v1'
const SEED_FLAG_KEY = 'treeco_training_seeded_v1'
const DUE_SOON_DAYS = 90

// ── Seed data ─────────────────────────────────────────────────────────────────
// Built from verified records found in Gmail + Google Drive (Jul 2026 audit).
// Only records actually sighted are seeded — no invented dates or certs.
// Key format matches cellKey(): `${staffId}__${qualKey}`
const SEED_RECORDS = {
  // Joshua Jack Curran Mongan — Meditrain CPR First Aid (incl. unit standard),
  // completed 19 Nov 2025 with Peter Monk, expires 19 Nov 2027. Cert PDF emailed
  // by rochelle@meditrain.co.nz on 23 Nov 2025 and saved to the drive.
  joshua__first_aid: {
    date: '2025-11-19',
    expiry: '2027-11-19',
    provider: 'Meditrain (Peter Monk)',
    notes: 'CPR First Aid incl. unit standard — cert PDF on Drive ("Josh Curran - CPR First Aid (includes unit standard).pdf")',
  },

  // Lea Molloy — NZ Certificate in Horticulture (Arboriculture) L3 (NZ2678) +
  // NZ Certificate in Horticulture Services (Arboriculture) L4 (NZ2674),
  // both awarded 27 Nov 2024, Otago Polytechnic / Te Pukenga. Certs on Drive.
  lea__nzarb_l3: {
    date: '2024-11-27',
    expiry: '',
    provider: 'Otago Polytechnic / Te Pukenga (via SIT)',
    notes: 'L3 (NZ2678) + L4 (NZ2674) certificates on Drive (Lea staff folder / qualifications)',
  },

  // Josh Micallef — Cert III & Diploma of Arboriculture (AQF 3 & 5), self-stated
  // in email signature. No certificate or award date on file — note only.
  josh__nzarb_l3: {
    date: '',
    expiry: '',
    provider: '',
    notes: 'Cert III & Diploma of Arboriculture (AQF 3 & 5) per email signature — no certificate/date on file, chase copy',
  },

  // Stuart Fraser Wilson — Australian Cert III in Arboriculture (15 yrs experience),
  // referenced in Primary ITO workplace-assessor email 14 Apr 2026. No cert on file.
  stuart__nzarb_l3: {
    date: '',
    expiry: '',
    provider: '',
    notes: 'Australian Cert III in Arboriculture referenced (Primary ITO email, Apr 2026) — no certificate on file, chase copy',
  },

  // Joshua Jack Curran Mongan — NZ Cert in Arboriculture L3 IN PROGRESS via
  // Primary ITO (Training Plan TIM:0922004894). Not yet completed — note only.
  joshua__nzarb_l3: {
    date: '',
    expiry: '',
    provider: '',
    notes: 'IN PROGRESS — NZ Cert Arboriculture L3, Primary ITO (TIM:0922004894); 7 units remaining Apr 2026, target Sept 2026; needs new assessor',
  },

  // Joshua Jack Curran Mongan — NZ Driver Licence (RESTRICTED), ED714033 v225.
  // Copy on Drive (JOSHCM-ID.jpeg); expiry not visible on the copy.
  joshua__driver_lic: {
    date: '',
    expiry: '',
    provider: 'NZTA',
    notes: 'RESTRICTED licence ED714033 v225 — copy on Drive (JOSHCM-ID.jpeg); expiry not recorded, verify from card',
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const data = raw ? JSON.parse(raw) : {}
    const isEmpty = !data || Object.keys(data).length === 0

    // One-time seed: only when register is empty and never seeded before
    if (isEmpty && !localStorage.getItem(SEED_FLAG_KEY)) {
      localStorage.setItem(LS_KEY, JSON.stringify(SEED_RECORDS))
      localStorage.setItem(SEED_FLAG_KEY, '1')
      return { ...SEED_RECORDS }
    }

    return data || {}
  } catch {
    return {}
  }
}

function saveToLS(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

function cellKey(staffId, qualKey) {
  return `${staffId}__${qualKey}`
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function fmtDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Returns { label, bg, color }
function statusChip(record, qual) {
  if (!record || (!record.date && !record.expiry)) {
    return { label: '—', bg: '#f3f4f6', color: '#9ca3af' }
  }

  // Determine effective expiry
  let expiry = record.expiry || null

  // If no manual expiry but qual has expiryYears, compute from obtained date
  if (!expiry && qual.expiryYears && record.date) {
    const d = new Date(record.date)
    d.setFullYear(d.getFullYear() + qual.expiryYears)
    expiry = d.toISOString().slice(0, 10)
  }

  if (expiry) {
    const days = daysUntil(expiry)
    if (days < 0)              return { label: 'EXPIRED',  bg: '#fee2e2', color: '#991b1b' }
    if (days <= DUE_SOON_DAYS) return { label: 'DUE SOON', bg: '#fef3c7', color: '#92400e' }
  }

  return { label: 'CURRENT', bg: '#dcfce7', color: '#15803d' }
}

// ── Modal component ───────────────────────────────────────────────────────────
function EditModal({ staffName, qualLabel, qualNote, form, onChange, onSave, onClear, onClose }) {
  function field(label, key, type = 'text', placeholder = '') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</label>
        <input
          type={type}
          value={form[key] || ''}
          onChange={e => onChange(key, e.target.value)}
          placeholder={placeholder}
          style={{
            padding: '8px 10px', borderRadius: 7, border: '1px solid #d1d5db',
            fontSize: 14, color: '#111827', fontFamily: 'var(--font, system-ui)',
            background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
          }}
        />
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: 420, maxWidth: '95vw',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          padding: '16px 18px 14px', borderBottom: '1px solid #e5e7eb',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{qualLabel}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{staffName} · {qualNote}</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: 20, color: '#9ca3af',
            cursor: 'pointer', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {field('Date Obtained', 'date', 'date')}
          {field('Expiry Date', 'expiry', 'date')}
          {field('Provider / Issuer', 'provider', 'text', 'e.g. NZ Red Cross, WorkSafe…')}
          {field('Notes', 'notes', 'text', 'Optional notes…')}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 18px 16px', borderTop: '1px solid #e5e7eb', gap: 8,
        }}>
          <button onClick={onClear} style={{
            background: 'none', border: '1px solid #e5e7eb', borderRadius: 7,
            color: '#9ca3af', fontSize: 13, padding: '8px 12px', cursor: 'pointer',
            fontFamily: 'var(--font, system-ui)',
          }}>Clear record</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              background: 'none', border: '1px solid #d1d5db', borderRadius: 7,
              color: '#374151', fontSize: 13, padding: '8px 14px', cursor: 'pointer',
              fontFamily: 'var(--font, system-ui)',
            }}>Cancel</button>
            <button onClick={onSave} style={{
              background: '#16a34a', border: 'none', borderRadius: 7,
              color: '#fff', fontSize: 13, fontWeight: 600, padding: '8px 16px',
              cursor: 'pointer', fontFamily: 'var(--font, system-ui)',
            }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StaffTrainingRegister() {
  const [records, setRecords] = useState(() => loadFromLS())
  const [editingCell, setEditingCell] = useState(null) // { staffId, qualKey }
  const [editForm, setEditForm] = useState({ date: '', expiry: '', provider: '', notes: '' })

  // Persist on every change
  useEffect(() => { saveToLS(records) }, [records])

  function openCell(staffId, qualKey) {
    const key = cellKey(staffId, qualKey)
    const existing = records[key] || {}
    setEditForm({
      date:     existing.date     || '',
      expiry:   existing.expiry   || '',
      provider: existing.provider || '',
      notes:    existing.notes    || '',
    })
    setEditingCell({ staffId, qualKey })
  }

  function handleFormChange(field, value) {
    setEditForm(f => ({ ...f, [field]: value }))
  }

  function handleSave() {
    if (!editingCell) return
    const key = cellKey(editingCell.staffId, editingCell.qualKey)
    setRecords(r => ({ ...r, [key]: { ...editForm } }))
    setEditingCell(null)
  }

  function handleClear() {
    if (!editingCell) return
    const key = cellKey(editingCell.staffId, editingCell.qualKey)
    setRecords(r => {
      const next = { ...r }
      delete next[key]
      return next
    })
    setEditingCell(null)
  }

  function handleClose() {
    setEditingCell(null)
  }

  const editingStaff = editingCell ? STAFF.find(s => s.id === editingCell.staffId) : null
  const editingQual  = editingCell ? QUALS.find(q => q.key === editingCell.qualKey)  : null

  // ── Print styles injected inline ──────────────────────────────────────────
  const printStyle = `
    @media print {
      body * { visibility: hidden !important; }
      #training-register, #training-register * { visibility: visible !important; }
      #training-register { position: fixed; top: 0; left: 0; width: 100%; }
      .no-print { display: none !important; }
    }
  `

  return (
    <>
      <style>{printStyle}</style>

      <div id="training-register" style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px 20px 48px' }}>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 24, flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.3px' }}>
              Staff Training Register
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
              Urban Tree Services — NZ Arborist Qualifications
            </p>
          </div>
          <button
            className="no-print"
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
              color: '#374151', fontSize: 13, fontWeight: 600, padding: '9px 14px',
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              fontFamily: 'var(--font, system-ui)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Export / Print
          </button>
        </div>

        {/* ── Legend ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }} className="no-print">
          {[
            { label: 'CURRENT',  bg: '#dcfce7', color: '#15803d' },
            { label: 'DUE SOON', bg: '#fef3c7', color: '#92400e' },
            { label: 'EXPIRED',  bg: '#fee2e2', color: '#991b1b' },
            { label: '—',        bg: '#f3f4f6', color: '#9ca3af' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
              <span style={{
                padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                background: s.bg, color: s.color,
              }}>{s.label}</span>
              {s.label === 'DUE SOON' && <span>= within {DUE_SOON_DAYS} days</span>}
              {s.label === '—' && <span>= not recorded</span>}
            </div>
          ))}
        </div>

        {/* ── Scrollable table wrapper ── */}
        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflowX: 'auto',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', minWidth: 900,
            tableLayout: 'fixed', fontSize: 13,
          }}>
            <colgroup>
              <col style={{ width: 180 }} />
              {QUALS.map(q => <col key={q.key} style={{ width: 120 }} />)}
            </colgroup>

            {/* ── Column headers ── */}
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{
                  padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em',
                  position: 'sticky', left: 0, background: '#f9fafb', zIndex: 2,
                  borderRight: '1px solid #e5e7eb',
                }}>
                  Staff Member
                </th>
                {QUALS.map(q => (
                  <th key={q.key} style={{
                    padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em',
                    borderRight: '1px solid #f3f4f6',
                  }}>
                    <div>{q.label}</div>
                    <div style={{ fontSize: 10, fontWeight: 400, color: '#9ca3af', marginTop: 2, textTransform: 'none', letterSpacing: 0 }}>
                      {q.note}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* ── Staff rows ── */}
            <tbody>
              {STAFF.map((staff, si) => (
                <tr key={staff.id} style={{
                  borderBottom: si < STAFF.length - 1 ? '1px solid #f3f4f6' : 'none',
                  background: si % 2 === 0 ? '#fff' : '#fafafa',
                }}>
                  {/* Staff name cell */}
                  <td style={{
                    padding: '14px 14px', verticalAlign: 'middle',
                    position: 'sticky', left: 0, background: si % 2 === 0 ? '#fff' : '#fafafa',
                    zIndex: 1, borderRight: '1px solid #e5e7eb',
                  }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: 13 }}>{staff.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{staff.role}</div>
                  </td>

                  {/* Qualification cells */}
                  {QUALS.map(qual => {
                    const key = cellKey(staff.id, qual.key)
                    const record = records[key]
                    const chip = statusChip(record, qual)
                    const hasData = record && (record.date || record.expiry)

                    // Compute effective expiry for display
                    let displayExpiry = record?.expiry || null
                    if (!displayExpiry && qual.expiryYears && record?.date) {
                      const d = new Date(record.date)
                      d.setFullYear(d.getFullYear() + qual.expiryYears)
                      displayExpiry = d.toISOString().slice(0, 10)
                    }

                    return (
                      <td
                        key={qual.key}
                        onClick={() => openCell(staff.id, qual.key)}
                        style={{
                          padding: '10px 8px', textAlign: 'center', verticalAlign: 'middle',
                          cursor: 'pointer', borderRight: '1px solid #f3f4f6',
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                        title={[
                          record?.date     ? `Obtained: ${fmtDate(record.date)}` : null,
                          displayExpiry    ? `Expires: ${fmtDate(displayExpiry)}` : null,
                          record?.provider ? `Provider: ${record.provider}` : null,
                          record?.notes    ? `Notes: ${record.notes}` : null,
                        ].filter(Boolean).join('\n') || 'Click to add record'}
                      >
                        {/* Status chip */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: 20,
                            fontSize: 10, fontWeight: 700, background: chip.bg, color: chip.color,
                            letterSpacing: '0.03em', whiteSpace: 'nowrap',
                          }}>
                            {chip.label}
                          </span>

                          {/* Date obtained */}
                          {record?.date && (
                            <span style={{ fontSize: 10, color: '#6b7280' }}>
                              {fmtDate(record.date)}
                            </span>
                          )}

                          {/* Expiry date (if relevant) */}
                          {displayExpiry && (
                            <span style={{ fontSize: 10, color: daysUntil(displayExpiry) < 0 ? '#991b1b' : '#9ca3af' }}>
                              exp {fmtDate(displayExpiry)}
                            </span>
                          )}

                          {/* Add prompt if empty */}
                          {!hasData && (
                            <span className="no-print" style={{ fontSize: 10, color: '#d1d5db', marginTop: 1 }}>+ add</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Footer note ── */}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
          Click any cell to add or edit a qualification record. Data is saved locally in your browser.
        </p>
      </div>

      {/* ── Edit modal ── */}
      {editingCell && editingStaff && editingQual && (
        <EditModal
          staffName={editingStaff.name}
          qualLabel={editingQual.label}
          qualNote={editingQual.note}
          form={editForm}
          onChange={handleFormChange}
          onSave={handleSave}
          onClear={handleClear}
          onClose={handleClose}
        />
      )}
    </>
  )
}
