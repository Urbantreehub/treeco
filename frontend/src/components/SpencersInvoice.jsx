import { useState, useEffect, useRef } from 'react'
import { supabase } from '../config/supabase'
import { downloadPdf } from '../utils/downloadPdf'

// Spencers invoice — only NON-SOR "quotable" line items (codes billed at the
// 0.87 GST factor, where the crew quotes a GST-inclusive price). SOR codes are
// paid on the schedule and never invoiced. This invoice is what gets uploaded
// to the Spencers portal Documents to close the job.
const GST = 0.15
const PREAPPROVAL_THRESHOLD = 1200   // quotable total (incl GST) above which a
                                     // dedicated pre-approval is required
const COMPANY = {
  name: 'Urban Tree Services Limited',
  address: 'Wellington, New Zealand',
  phone: '027 203 1446',
  email: 'office@urbantreeservices.net',
  gstNumber: '132-299-374',
}
const PREAPPROVAL_NOTE = 'Price uploaded please advise when approved'

const nzd = v => `$${Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const round2 = v => Math.round((Number(v) || 0) * 100) / 100
// Incl-GST amount for a quotable line: the exact price the crew quoted lives in
// price_incl; fall back to reconstructing it from qty × rate (ex-GST) × 1.15.
const lineIncl = i => round2(i.price_incl != null ? i.price_incl : (i.qty || 0) * (i.rate || 0) * (1 + GST))

export default function SpencersInvoice({ job }) {
  const [items, setItems]     = useState(null)
  const [actions, setActions] = useState([])
  const [busy, setBusy]       = useState(null)   // action key currently enqueuing
  const [err, setErr]         = useState(null)
  const invoiceRef = useRef(null)

  const ko = job.ko_reference || ''

  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ data: q }, { data: acts }] = await Promise.all([
        supabase.from('quotes').select('line_items').eq('job_id', job.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('portal_actions').select('action, status, created_at')
          .eq('job_id', job.id).order('created_at', { ascending: false }),
      ])
      if (!live) return
      setItems(q?.line_items ?? [])
      setActions(acts ?? [])
    })()
    return () => { live = false }
  }, [job.id])

  if (items === null) return <div style={s.section}><div style={s.title}>Spencers invoice</div><div style={s.muted}>Loading…</div></div>

  // The PDF invoice can only be generated once the job is completed.
  const isCompleted = ['complete_to_invoice', 'invoiced'].includes(job.status)
  if (!isCompleted) {
    return (
      <div style={s.section}>
        <div style={s.title}>Spencers invoice</div>
        <div style={s.muted}>The invoice PDF becomes available once this job is marked complete.</div>
      </div>
    )
  }

  const quotable = items.filter(i => i.quotable && (i.selected !== false))
  const totalIncl = round2(quotable.reduce((sum, i) => sum + lineIncl(i), 0))
  const totalEx   = round2(totalIncl / (1 + GST))
  const gst       = round2(totalIncl - totalEx)
  const needsPreapproval = totalIncl > PREAPPROVAL_THRESHOLD

  async function enqueue(action, payload, key) {
    setBusy(key); setErr(null)
    const { error } = await supabase.from('portal_actions').insert({
      job_id: job.id, ko_reference: ko || null, action, payload,
    })
    if (error) { setErr(error.message); setBusy(null); return }
    const { data: acts } = await supabase.from('portal_actions')
      .select('action, status, created_at').eq('job_id', job.id).order('created_at', { ascending: false })
    setActions(acts ?? [])
    setBusy(null)
  }

  const lastOf = a => actions.find(x => x.action === a)
  const invoiceNo = ko ? `INV-${ko}` : `INV-${job.id.slice(0, 8)}`
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })

  if (quotable.length === 0) {
    return (
      <div style={s.section}>
        <div style={s.title}>Spencers invoice</div>
        <div style={s.muted}>No non-SOR quotable items on this job — nothing to invoice. SOR work is paid on the schedule of rates.</div>
      </div>
    )
  }

  return (
    <div style={s.section}>
      <div style={s.title}>Spencers invoice <span style={s.pill}>non-SOR · {quotable.length} item{quotable.length !== 1 ? 's' : ''}</span></div>

      {/* Printable invoice (captured to PDF) */}
      <div ref={invoiceRef} style={s.doc}>
        <div style={s.docHead}>
          <div>
            <div style={s.coName}>{COMPANY.name}</div>
            <div style={s.coLine}>{COMPANY.address}</div>
            <div style={s.coLine}>{COMPANY.phone} · {COMPANY.email}</div>
            <div style={s.coLine}>GST {COMPANY.gstNumber}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={s.invTitle}>TAX INVOICE</div>
            <div style={s.coLine}>{invoiceNo}</div>
            <div style={s.coLine}>{today}</div>
          </div>
        </div>

        <div style={s.billTo}>
          <div style={s.billLabel}>Bill to</div>
          <div style={s.billName}>Spencer Henshaw Ltd</div>
          {ko && <div style={s.coLine}>KO ref: {ko}</div>}
          {job.address && <div style={s.coLine}>Site: {job.address}</div>}
        </div>

        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, textAlign: 'left' }}>Code</th>
              <th style={{ ...s.th, textAlign: 'left' }}>Description</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Ex GST</th>
              <th style={{ ...s.th, textAlign: 'right' }}>Incl GST</th>
            </tr>
          </thead>
          <tbody>
            {quotable.map((i, idx) => {
              const incl = lineIncl(i)
              const ex = round2(incl / (1 + GST))
              const desc = i.code ? (i.description || '').replace(`${i.code} — `, '') : i.description
              return (
                <tr key={i.id ?? idx}>
                  <td style={s.td}><span style={s.code}>{i.code || '—'}</span></td>
                  <td style={s.td}>{desc}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{nzd(ex)}</td>
                  <td style={{ ...s.td, textAlign: 'right' }}>{nzd(incl)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={s.totals}>
          <div style={s.tRow}><span>Subtotal (ex GST)</span><span>{nzd(totalEx)}</span></div>
          <div style={s.tRow}><span>GST 15%</span><span>{nzd(gst)}</span></div>
          <div style={{ ...s.tRow, ...s.tBig }}><span>Total (incl GST)</span><span>{nzd(totalIncl)}</span></div>
        </div>
      </div>

      {/* Actions */}
      {err && <div style={s.err}>{err}</div>}
      <div style={s.actions}>
        <button style={s.btn} disabled={busy} onClick={() => downloadPdf(invoiceRef, `${invoiceNo}.pdf`)}>
          Download invoice PDF
        </button>

        {needsPreapproval ? (
          <button style={{ ...s.btn, ...s.btnAmber }} disabled={busy === 'preapp'}
            onClick={() => enqueue('preapproval_request', { total_incl: totalIncl, note: PREAPPROVAL_NOTE }, 'preapp')}>
            {busy === 'preapp' ? 'Queuing…' : `Request pre-approval · ${nzd(totalIncl)} (> $1,200)`}
          </button>
        ) : (
          <button style={{ ...s.btn, ...s.btnGhost }} disabled={busy === 'note'}
            onClick={() => enqueue('preapproval_note', { note: PREAPPROVAL_NOTE }, 'note')}>
            {busy === 'note' ? 'Queuing…' : 'Add “price uploaded” note to Spencers'}
          </button>
        )}

        <button style={{ ...s.btn, ...s.btnPrimary }} disabled={busy === 'upload'}
          onClick={() => enqueue('upload_invoice', { invoice_no: invoiceNo, total_incl: totalIncl }, 'upload')}>
          {busy === 'upload' ? 'Queuing…' : 'Upload invoice to Spencers'}
        </button>
      </div>

      {/* Queued action status */}
      {actions.length > 0 && (
        <div style={s.queue}>
          {['upload_invoice', 'preapproval_request', 'preapproval_note'].map(a => {
            const last = lastOf(a)
            if (!last) return null
            const label = { upload_invoice: 'Invoice upload', preapproval_request: 'Pre-approval', preapproval_note: 'Price-uploaded note' }[a]
            return <div key={a} style={s.queueRow}><span>{label}</span><span style={s.status(last.status)}>{last.status}</span></div>
          })}
          <div style={s.pendingNote}>Portal automation is pending — actions are queued and will run once the Spencers Documents flow is wired.</div>
        </div>
      )}
    </div>
  )
}

const SP = '#6D4AA8'
const s = {
  section: { padding: '16px', borderTop: '1px solid #eee' },
  title: { fontSize: '13px', fontWeight: 700, color: '#333', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: 8 },
  pill: { fontSize: '11px', fontWeight: 600, color: SP, background: SP + '18', padding: '2px 8px', borderRadius: 6 },
  muted: { fontSize: '13px', color: '#888', lineHeight: 1.5 },
  doc: { background: '#fff', border: '1px solid #e6e6e6', borderRadius: 10, padding: '20px', fontSize: '12px', color: '#222' },
  docHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: '2px solid #222', paddingBottom: 12 },
  coName: { fontSize: '15px', fontWeight: 800 },
  coLine: { fontSize: '11px', color: '#666', marginTop: 2 },
  invTitle: { fontSize: '16px', fontWeight: 800, letterSpacing: '.06em', color: SP },
  billTo: { marginTop: 14 },
  billLabel: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', color: '#999', fontWeight: 700 },
  billName: { fontSize: '13px', fontWeight: 700, marginTop: 2 },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 16 },
  th: { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em', color: '#999', fontWeight: 700, borderBottom: '1px solid #ddd', padding: '6px 8px' },
  td: { fontSize: '12px', borderBottom: '1px solid #f0f0f0', padding: '7px 8px', verticalAlign: 'top' },
  code: { fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: SP, background: SP + '14', padding: '1px 6px', borderRadius: 4 },
  totals: { marginTop: 14, marginLeft: 'auto', width: '240px' },
  tRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '4px 0', color: '#444' },
  tBig: { fontSize: '15px', fontWeight: 800, color: '#111', borderTop: '2px solid #222', marginTop: 4, paddingTop: 8 },
  actions: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 },
  btn: { padding: '11px 14px', borderRadius: 10, border: '1.5px solid #d9d2ea', background: '#fff', color: '#333', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)' },
  btnPrimary: { background: SP, borderColor: SP, color: '#fff' },
  btnAmber: { background: '#B7791F', borderColor: '#B7791F', color: '#fff' },
  btnGhost: { background: '#faf8fd', borderColor: '#e3dcf1', color: SP },
  err: { fontSize: '12px', color: '#B13A2A', background: '#F6E5E1', padding: '8px 10px', borderRadius: 8, marginTop: 10 },
  queue: { marginTop: 12, background: '#faf9fc', border: '1px solid #eee', borderRadius: 8, padding: '10px 12px' },
  queueRow: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '3px 0', color: '#555' },
  status: st => ({ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em',
    color: st === 'done' ? '#2F5233' : st === 'failed' ? '#B13A2A' : '#8a5e13' }),
  pendingNote: { fontSize: '11px', color: '#999', marginTop: 8, lineHeight: 1.4 },
}
