// Shared helper for the H&S Documents list shown on Safety → H&S Policy &
// Documents. That list is stored per-device in localStorage (see
// pages/HSDocuments.jsx), so uploaded/completed safety forms are appended here
// to appear in the same browsable, audit-trail list — with date, category and a
// viewable copy of the file.

const LS_KEY = 'treeco_hs_documents'
const MAX_INLINE_BYTES = 3.5 * 1024 * 1024 // keep localStorage well under quota

// Map a form id to an H&S Documents category (must match HSDocuments CATEGORIES).
export function formCategory(formId) {
  const map = {
    sssp: 'swms', risk_assessment: 'swms',
    'hs-policy': 'policy',
    'permit-to-work': 'permit',
    'aerial-rescue-plan': 'plan', 'return-to-work': 'plan',
    'subcontractor-prequalification': 'certificate',
  }
  return map[formId] ?? 'register'
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function readList() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function writeList(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* quota — ignore */ }
}

function readAsDataURL(file) {
  return new Promise(resolve => {
    if (!file || file.size > MAX_INLINE_BYTES) { resolve(null); return }
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => resolve(null)
    r.readAsDataURL(file)
  })
}

// Append an uploaded document to the H&S Documents list. Returns the new doc
// (including a `view` URL usable immediately to open the file).
export async function addHsDocument({ name, category = 'register', file, fileUrl = '', notes = '', expiry_date = '' }) {
  const file_data = await readAsDataURL(file)
  // If the file was too big to inline, fall back to an in-session object URL so
  // it's still viewable now (it just won't survive a reload).
  const objectUrl = (!file_data && file) ? URL.createObjectURL(file) : ''
  const doc = {
    id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    category,
    version: '',
    file_data: file_data || null,
    file_name: file?.name ?? null,
    file_url: fileUrl || objectUrl || '',
    uploaded_date: todayStr(),
    expiry_date,
    notes,
  }
  writeList([doc, ...readList()])
  return { ...doc, view: file_data || fileUrl || objectUrl || '' }
}

// Open a stored document's file in a new tab (data URL or link).
export function openHsDoc(target) {
  if (!target) return
  const a = document.createElement('a')
  a.href = target
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}
