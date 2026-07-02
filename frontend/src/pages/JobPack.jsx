import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { downloadPdf } from '../utils/downloadPdf'
import { getStatusLabel } from '../config/statuses'

// Printable Job Pack — everything the crew needs for a job on one sheet:
// scope of work (from the quote, no pricing), ops plan, equipment/tools, access
// notes and contacts. Opens as a document with a Download PDF button; append
// ?download=1 to auto-generate the PDF (used by the "PDF" buttons elsewhere).

const TOOL_LABELS = {
  chainsaw: 'Chainsaws', pole_saw: 'Pole saw', hand_saw: 'Hand saw', rigging: 'Rigging kit',
  chipper: 'Chipper', stump_grinder: 'Stump grinder', avant: 'Avant', mewp: 'MEWP / cherry picker',
  climbing: 'Climbing kit', rakes: 'Rakes', tarps: 'Tarps', ppe: 'PPE', first_aid: 'First aid kit',
}
const prettyTool = (k) => TOOL_LABELS[k] || k.replace(/_/g, ' ')
const nz = (d) => new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })

export default function JobPack() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const autoDownload = new URLSearchParams(window.location.search).get('download') === '1'
  const [job, setJob] = useState(null)
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const docRef = useRef(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: j } = await supabase.from('jobs').select('*, clients(name, phone, email)').eq('id', jobId).single()
      const { data: q } = await supabase.from('quotes')
        .select('line_items, notes, job_pack, created_at').eq('job_id', jobId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (!active) return
      setJob(j); setQuote(q); setLoading(false)
    })()
    return () => { active = false }
  }, [jobId])

  async function handleDownload() {
    setDownloading(true)
    const name = `JobPack-${job?.clients?.name?.replace(/\s+/g, '-') || 'job'}.pdf`
    await downloadPdf(docRef, name)
    setDownloading(false)
  }
  useEffect(() => {
    if (autoDownload && !loading && docRef.current) {
      const t = setTimeout(handleDownload, 700); return () => clearTimeout(t)
    }
  }, [autoDownload, loading]) // eslint-disable-line

  if (loading) return <div style={s.center}>Loading job pack…</div>
  if (!job) return <div style={s.center}>Job not found.</div>

  const pack = quote?.job_pack || {}
  const items = (quote?.line_items || []).filter(i => !i.optional || i.selected)
  const tools = Object.entries(pack.tools || {}).filter(([, v]) => v).map(([k]) => prettyTool(k))
  const equipment = [
    pack.chipper && pack.chipper !== 'None' ? `Chipper (${pack.chipper})` : null,
    pack.avant === true ? 'Avant' : null,
    pack.stump_grinder === true ? 'Stump grinder' : null,
  ].filter(Boolean)

  return (
    <div style={s.page}>
      <div style={s.toolbar}>
        <button style={s.back} onClick={() => navigate(-1)}>← Back</button>
        <button style={{ ...s.dl, opacity: downloading ? 0.6 : 1 }} onClick={handleDownload} disabled={downloading}>
          {downloading ? '⏳ Generating…' : '⬇ Download PDF'}
        </button>
      </div>

      <div ref={docRef} style={s.doc}>
        <div style={s.head}>
          <img src="/logo.png" alt="Urban Tree Services" style={s.logo} />
          <div style={{ textAlign: 'right' }}>
            <div style={s.docTitle}>JOB PACK</div>
            <div style={s.docDate}>{nz(new Date())}</div>
          </div>
        </div>
        <div style={s.rule} />

        <div style={s.grid}>
          <Field label="Client">{job.clients?.name || '—'}</Field>
          <Field label="Status">{getStatusLabel(job.status)}</Field>
          <Field label="Job type">{job.job_type || '—'}</Field>
          <Field label="Phone">{job.clients?.phone || '—'}</Field>
          <Field label="Address" wide>{job.address || '—'}</Field>
        </div>

        {(pack.time_required || pack.staff_count || pack.difficulty) && (
          <Section title="Plan">
            <div style={s.pills}>
              {pack.time_required && <span style={s.pill}>⏱ {pack.time_required}</span>}
              {pack.staff_count && <span style={s.pill}>👥 {pack.staff_count} staff</span>}
              {pack.difficulty && <span style={s.pill}>⚙ Difficulty {pack.difficulty}/5</span>}
            </div>
          </Section>
        )}

        <Section title="Scope of work">
          {items.length > 0 ? (
            <ul style={s.list}>
              {items.map((it, i) => (
                <li key={i} style={s.li}>
                  <strong>{it.description}</strong>{it.detail ? ` — ${it.detail}` : ''}
                  {it.qty ? <span style={s.qty}> ×{it.qty}</span> : null}
                </li>
              ))}
            </ul>
          ) : job.description ? <div style={s.body}>{job.description}</div> : <div style={s.muted}>No scope recorded.</div>}
        </Section>

        {(equipment.length > 0 || tools.length > 0) && (
          <Section title="Equipment & tools">
            {equipment.length > 0 && <div style={s.body}><strong>Machinery:</strong> {equipment.join(', ')}</div>}
            {tools.length > 0 && <div style={s.body}><strong>Tools:</strong> {tools.join(', ')}</div>}
          </Section>
        )}

        {quote?.notes && <Section title="Site / access notes"><div style={s.body}>{quote.notes}</div></Section>}

        <Section title="Before you start — safety">
          <ul style={s.list}>
            <li style={s.li}>Complete the on-site SSSP / hazard check in the Safety section.</li>
            <li style={s.li}>Confirm access, overhead lines, and drop zones before cutting.</li>
            <li style={s.li}>PPE on. Brief the crew on the plan above.</li>
          </ul>
        </Section>

        <div style={s.footer}>
          Urban Tree Services · 027 203 1446 · office@urbantreeservices.net
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, wide }) {
  return (
    <div style={{ ...fs.field, ...(wide ? { gridColumn: '1 / -1' } : {}) }}>
      <div style={fs.label}>{label}</div>
      <div style={fs.value}>{children}</div>
    </div>
  )
}
function Section({ title, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionTitle}>{title}</div>
      {children}
    </div>
  )
}

const fs = {
  field: {},
  label: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' },
  value: { fontSize: '14px', color: '#2C2416', fontWeight: '600' },
}
const s = {
  page: { minHeight: '100%', background: '#F4F2EF' },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#888' },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', position: 'sticky', top: 0, background: '#F4F2EF', zIndex: 5 },
  back: { background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },
  dl: { background: 'var(--moss)', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },

  doc: { maxWidth: '760px', margin: '0 auto 40px', background: '#fff', padding: '36px 40px', boxShadow: '0 2px 16px rgba(44,36,22,0.1)', borderRadius: '4px' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  logo: { height: '52px', objectFit: 'contain' },
  docTitle: { fontSize: '22px', fontWeight: '800', color: 'var(--bark)', letterSpacing: '0.04em' },
  docDate: { fontSize: '12px', color: '#aaa', marginTop: '2px' },
  rule: { height: '2px', background: 'var(--moss)', margin: '18px 0 22px' },

  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', marginBottom: '8px' },
  section: { marginTop: '22px' },
  sectionTitle: { fontSize: '11px', fontWeight: '800', color: '#8B6238', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingBottom: '5px', borderBottom: '1px solid #Eee' },
  body: { fontSize: '14px', color: '#333', lineHeight: 1.6, marginBottom: '4px', whiteSpace: 'pre-wrap' },
  muted: { fontSize: '13px', color: '#bbb' },
  list: { margin: 0, paddingLeft: '18px' },
  li: { fontSize: '14px', color: '#333', lineHeight: 1.7 },
  qty: { color: '#888', fontWeight: '600' },
  pills: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  pill: { fontSize: '13px', fontWeight: '600', color: 'var(--bark)', background: '#F4F0EA', border: '1px solid var(--border)', borderRadius: '18px', padding: '5px 12px' },
  footer: { marginTop: '32px', paddingTop: '16px', borderTop: '1px solid #eee', textAlign: 'center', fontSize: '11px', color: '#bbb' },
}
