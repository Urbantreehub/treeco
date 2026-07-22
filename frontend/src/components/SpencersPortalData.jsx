import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'

// Read-only panel that surfaces everything pulled from the DBS/Spencers portal
// for a job: current status, KPI clock, the scraped notes, any attached data,
// and the history of actions sent back to the portal (with timestamps).

const ACTION_LABEL = {
  accept: 'Accepted', schedule: 'Schedule sent', complete: 'Marked complete',
  upload_invoice: 'Invoice uploaded', preapproval_note: 'Pre-approval note',
  preapproval_request: 'Pre-approval requested',
}

function fmt(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Pull the human notes out of the scraper-written description: drop the tag
// lines (KO Ref / Priority / Due) and keep the free-text remainder.
function descriptionNotes(description) {
  if (!description) return null
  const kept = description.split('\n')
    .filter(l => l.trim() && !/^\s*(KO Ref|Priority|Due)\s*:/i.test(l))
    .join('\n')
    .trim()
  return kept || null
}

// Portal notes arrive in more than one shape: free text from the job
// description, or structured entries from the scraper ({date, text, author}).
// Rendering the structured form directly took down the whole job detail panel —
// React can't render an object as a child — so everything is coerced to text
// here and unknown shapes fall back to JSON rather than throwing.
function asText(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v) } catch { return '' }
}

function PortalNotes({ value }) {
  if (typeof value === 'string') return <div style={s.notes}>{value}</div>

  const entries = Array.isArray(value) ? value : [value]
  return (
    <div style={s.noteList}>
      {entries.map((n, i) => {
        if (n == null) return null
        if (typeof n !== 'object') return <div key={i} style={s.notes}>{asText(n)}</div>
        const { date, author, text, note, body, ...rest } = n
        const meta = [date, author].map(asText).filter(Boolean).join(' · ')
        const main = asText(text ?? note ?? body)
          || (Object.keys(rest).length ? asText(rest) : '')
        return (
          <div key={i} style={s.notes}>
            {meta && <div style={s.noteMeta}>{meta}</div>}
            {main}
          </div>
        )
      })}
    </div>
  )
}

// Flatten raw_snapshot into readable key/value rows, skipping fields already
// shown elsewhere and any nested objects/arrays (shown as compact JSON).
const SKIP = new Set(['ko_reference', 'priority', 'status', 'portal_status', 'sla_due_at', 'due', 'description', 'notes', 'address'])
function snapshotRows(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw)
    .filter(([k, v]) => !SKIP.has(k) && v != null && v !== '')
    .map(([k, v]) => [
      k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      typeof v === 'object' ? JSON.stringify(v) : String(v),
    ])
}

export default function SpencersPortalData({ job }) {
  const [sync, setSync] = useState(undefined)   // undefined = loading, null = none
  const [actions, setActions] = useState([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const [{ data: s }, { data: acts }] = await Promise.all([
        supabase.from('portal_sync')
          .select('portal_status, last_seen_portal_status, priority, sla_due_at, kpi, raw_snapshot, first_seen_at, last_polled_at')
          .eq('job_id', job.id).order('last_polled_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('portal_actions')
          .select('action, status, created_at, processed_at')
          .eq('job_id', job.id).order('created_at', { ascending: false }),
      ])
      if (!live) return
      setSync(s ?? null)
      setActions(acts ?? [])
    })()
    return () => { live = false }
  }, [job.id])

  const notes = descriptionNotes(job.description)
  const rawNotes = sync?.raw_snapshot?.notes || null
  const rows = snapshotRows(sync?.raw_snapshot)
  const kpiRows = sync?.kpi && typeof sync.kpi === 'object'
    ? Object.entries(sync.kpi).filter(([, v]) => v != null && v !== '') : []

  // Nothing at all to show → render a minimal reference block from the job row.
  const hasAnything = sync || notes || actions.length || job.ko_reference

  return (
    <div style={s.section}>
      <div style={s.title}>Portal data</div>

      <div style={s.grid}>
        {job.ko_reference && <Row label="KO reference" value={job.ko_reference} />}
        {(sync?.portal_status) && <Row label="Portal status" value={sync.portal_status} />}
        {(sync?.priority || job.priority) && <Row label="Priority" value={sync?.priority || job.priority} />}
        {(sync?.sla_due_at || job.sla_due_at) && <Row label="KPI due" value={fmt(sync?.sla_due_at || job.sla_due_at)} />}
        {sync?.first_seen_at && <Row label="Pulled in" value={fmt(sync.first_seen_at)} />}
        {sync?.last_polled_at && <Row label="Last synced" value={fmt(sync.last_polled_at)} />}
      </div>

      {kpiRows.length > 0 && (
        <div style={s.block}>
          <div style={s.blockLabel}>KPI</div>
          <div style={s.grid}>
            {kpiRows.map(([k, v]) => <Row key={k} label={k.replace(/_/g, ' ')} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />)}
          </div>
        </div>
      )}

      {(rawNotes || notes) && (
        <div style={s.block}>
          <div style={s.blockLabel}>Notes</div>
          <PortalNotes value={rawNotes || notes} />
        </div>
      )}

      {rows.length > 0 && (
        <div style={s.block}>
          <div style={s.blockLabel}>Attached data</div>
          <div style={s.grid}>
            {rows.map(([k, v]) => <Row key={k} label={k} value={v} />)}
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <div style={s.block}>
          <div style={s.blockLabel}>Sent to portal</div>
          {actions.map((a, i) => (
            <div key={i} style={s.actRow}>
              <span style={s.actName}>{ACTION_LABEL[a.action] ?? a.action}</span>
              <span style={{ ...s.actStatus, color: a.status === 'done' ? '#4A6741' : a.status === 'failed' ? '#C0392B' : '#B7791F' }}>
                {a.status === 'done' ? '✓ sent' : a.status === 'failed' ? 'failed' : 'queued'}
              </span>
              <span style={s.actTime}>{fmt(a.processed_at || a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {sync === null && !hasAnything && <div style={s.muted}>No portal record synced for this job yet.</div>}
    </div>
  )
}

function Row({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div style={s.row}>
      <div style={s.rowLabel}>{label}</div>
      <div style={s.rowValue}>{value}</div>
    </div>
  )
}

const s = {
  section: { marginBottom: '20px', padding: '14px', background: '#F7F4FB', border: '1px solid #E4DCF0', borderRadius: '10px' },
  title: { fontSize: '12px', fontWeight: '700', color: '#6D4AA8', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px 14px' },
  block: { marginTop: '12px' },
  blockLabel: { fontSize: '11px', fontWeight: '700', color: '#8A7CA8', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  row: { minWidth: 0 },
  rowLabel: { fontSize: '10px', color: '#A99CC0', fontWeight: '600', textTransform: 'capitalize' },
  rowValue: { fontSize: '13px', color: '#2C2416', wordBreak: 'break-word' },
  notes: { fontSize: '13px', color: '#2C2416', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: '#fff', border: '1px solid #E4DCF0', borderRadius: '7px', padding: '9px 11px' },
  noteList: { display: 'flex', flexDirection: 'column', gap: '6px' },
  noteMeta: { fontSize: '11px', fontWeight: '600', color: '#8A8378', marginBottom: '3px' },
  actRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderTop: '1px solid #EBE4F5', fontSize: '12px' },
  actName: { flex: 1, color: '#2C2416', fontWeight: '600' },
  actStatus: { fontWeight: '700', whiteSpace: 'nowrap' },
  actTime: { color: '#8A7CA8', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  muted: { fontSize: '12px', color: '#A99CC0' },
}
