import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// ── My Documents — crew-facing, self-service ──────────────────────────────────
// A crew member sees THEIR OWN records (read-only) from `staff_records` and can
// upload photos of IDs / tickets to their own private folder. RLS scopes reads +
// writes to auth.uid(); uploads also surface in the office Staff Records vault.

const UPLOAD_TYPES = [
  ['id_document', 'ID / Passport / Licence'],
  ['qualification', 'Qualification / Ticket'],
  ['medical', 'Medical'],
  ['induction', 'Induction'],
  ['other', 'Other'],
]
const TYPE_LABELS = {
  qualification: 'Qualification', licence: 'Licence', moj: 'MOJ check', drug_test: 'Drug test',
  asbestos: 'Asbestos cert', employment_agreement: 'Employment agreement', id_document: 'ID / Passport',
  medical: 'Medical', induction: 'Induction', other: 'Other',
}
const BUCKET = 'staff-uploads'

function fmt(d) { return d ? new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' }) : null }
function daysUntil(d) { return d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null }

async function openFile(file_url) {
  if (!file_url) return
  if (/^https?:\/\//.test(file_url)) { window.open(file_url, '_blank'); return }
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file_url, 120)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

export default function MyDocs() {
  const { profile } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase.from('staff_records')
      .select('*').eq('user_id', profile.id).order('created_at', { ascending: false })
    if (error && /relation|does not exist|schema cache/i.test(error.message)) setTableMissing(true)
    else { setRows(data ?? []); setTableMissing(false) }
    setLoading(false)
  }, [profile?.id])
  useEffect(() => { load() }, [load])

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>My Documents</h1>
        <div style={s.sub}>{profile?.name ? `${profile.name} — ` : ''}your certs, licences & IDs</div>
      </div>

      <div style={s.infoCard}>
        Anything you upload here goes to the office for your staff file. Take a clear photo of the
        whole document — all four corners in frame.
      </div>

      {adding
        ? <UploadForm userId={profile?.id} onDone={() => { setAdding(false); load() }} onCancel={() => setAdding(false)} />
        : <button style={s.uploadBtn} onClick={() => setAdding(true)}>📷 Upload a document / photo</button>}

      {loading ? <div style={s.empty}>Loading…</div>
        : tableMissing ? (
          <div style={s.notice}>
            <b>Not activated yet.</b> Run migration <code style={s.code}>026_crew_portal.sql</code> in the Supabase SQL editor.
          </div>
        ) : rows.length === 0 ? (
          <div style={s.empty}>No documents on file yet — upload your ID, licence or tickets above.</div>
        ) : (
          <div style={s.list}>
            {rows.map(r => {
              const exp = daysUntil(r.expiry_date)
              return (
                <div key={r.id} style={s.row}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.rowTitle}>{r.title}</div>
                    <div style={s.rowMeta}>
                      {TYPE_LABELS[r.record_type] ?? r.record_type}
                      {r.expiry_date && ` · expires ${fmt(r.expiry_date)}`}
                      {r.verified ? ' · ✓ verified' : ' · pending review'}
                    </div>
                  </div>
                  {exp !== null && exp < 30 && (
                    <span style={{ ...s.badge, background: exp < 0 ? '#FFF0EE' : '#FDF3E3', color: exp < 0 ? '#C0392B' : '#D4851A' }}>
                      {exp < 0 ? 'Expired' : `${exp}d`}
                    </span>
                  )}
                  {r.file_url && <button style={s.viewBtn} onClick={() => openFile(r.file_url)}>View</button>}
                </div>
              )
            })}
          </div>
        )}
    </div>
  )
}

function UploadForm({ userId, onDone, onCancel }) {
  const [file, setFile] = useState(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('id_document')
  const [expiry, setExpiry] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    if (!file || !title.trim() || !userId) return
    setBusy(true); setError(null)
    const path = `${userId}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file)
    if (up.error) { setError(up.error.message); setBusy(false); return }
    const ins = await supabase.from('staff_records').insert({
      user_id: userId, record_type: type, title: title.trim(),
      file_url: path, expiry_date: expiry || null, verified: false, created_by: userId,
    })
    setBusy(false)
    if (ins.error) { setError(ins.error.message); return }
    onDone()
  }

  return (
    <div style={s.form}>
      <div style={s.field}>
        <div style={s.label}>Photo or file</div>
        {/* capture prompts the camera on mobile; still allows gallery/file pick */}
        <input type="file" accept="image/*,application/pdf" capture="environment"
          onChange={e => { const f = e.target.files?.[0]; setFile(f ?? null); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')) }} />
      </div>
      <div style={s.field}>
        <div style={s.label}>What is it?</div>
        <select style={s.input} value={type} onChange={e => setType(e.target.value)}>
          {UPLOAD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div style={s.field}>
        <div style={s.label}>Title</div>
        <input style={s.input} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Driver licence (front)" />
      </div>
      <div style={s.field}>
        <div style={s.label}>Expiry (if any)</div>
        <input type="date" style={s.input} value={expiry} onChange={e => setExpiry(e.target.value)} />
      </div>
      {error && <div style={s.errorBox}>Couldn’t upload: {error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={s.saveBtn} disabled={!file || !title.trim() || busy} onClick={submit}>{busy ? 'Uploading…' : 'Save document'}</button>
        <button style={s.cancelBtn} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}

const s = {
  page: { padding: '24px 28px', maxWidth: 720, margin: '0 auto' },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: 800, color: 'var(--bark)' },
  sub: { fontSize: 13, color: '#888', marginTop: 2 },
  infoCard: { background: '#F7FAF3', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#5c6b4c', marginBottom: 16, lineHeight: 1.5 },
  uploadBtn: { display: 'block', width: '100%', background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: 18 },
  form: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 12 },
  field: {},
  label: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 14, color: 'var(--bark)', fontFamily: 'var(--font)', boxSizing: 'border-box', background: '#fff' },
  saveBtn: { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 16px', fontSize: 14, color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' },
  rowTitle: { fontSize: 14, fontWeight: 600, color: 'var(--bark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  badge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 },
  viewBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 12, color: '#666', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font)' },
  empty: { color: '#bbb', fontSize: 14, padding: '28px 0', textAlign: 'center' },
  notice: { background: '#FDF3E3', border: '1px solid #E6D3A8', borderRadius: 10, padding: '14px 16px', fontSize: 14, color: '#7a5c12' },
  code: { background: '#00000010', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 },
  errorBox: { background: '#FFF0EE', border: '1px solid #E0B4B0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#C0392B' },
}
