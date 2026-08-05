import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSpencersJob } from '../../config/statuses'
import { displayCase, telHref, koCode, kpiDue, kpiCountdown } from '../../utils/jobDisplay'

// On-site quote sheet — the slide-up bottom sheet opened from the day-run view.
// Deliberately minimal: who/where, call, meeting status, one info panel and a
// single path into the quote builder. No status controls, no work order.

// Kāinga Ora priority code labels (same wording as the job detail panel).
const KO_LABELS = {
  URG: 'URG — Urgent',
  URS: 'URS — Urgent Response',
  EPS: 'EPS — Emergency',
  GNL: 'GNL — General',
  RSC: 'RSC — Responsive',
  VSC: 'VSC — Void',
  RM:  'RM — Responsive Maintenance',
  PM:  'PM — Planned Maintenance',
}

// Best quote to open, same preference order the calendar uses.
function bestQuote(job) {
  const qs = job?.quotes ?? []
  return qs.find(q => q.status === 'accepted') || qs.find(q => q.status === 'viewed')
      || qs.find(q => q.status === 'sent') || qs.find(q => q.status === 'draft') || qs[0] || null
}

// Pull an "Access: …" line out of a portal job's raw description, if present.
function accessLine(description) {
  const m = (description || '').match(/Access:\s*([^\n]+)/i)
  return m ? m[1].trim() : null
}

export default function QuoteSheet({ job, onClose }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // Slide up on mount, slide down before unmount.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  function close() {
    setOpen(false)
    setTimeout(onClose, 280)
  }

  if (!job) return null

  const name = displayCase(job.clients?.name || job.title || '—')
  const address = displayCase(job.address || '')
  const phone = job.clients?.phone || null
  const tel = telHref(phone)
  const portal = isSpencersJob(job)
  const code = koCode(job)
  const due = kpiDue(job)
  const kpi = kpiCountdown(job)
  const access = accessLine(job.description)
  const q = bestQuote(job)

  function openQuote() {
    close()
    if (q) navigate(`/quotes/${q.id}`)
    else navigate(`/quotes/new?job=${job.id}`)
  }

  function openDetails() {
    close()
    navigate(`/pipeline?job=${job.id}`)
  }

  const meet = job.meeting_status === 'meeting'
    ? { style: qs.meetYes, text: '🤝  Client is meeting you on site' }
    : job.meeting_status === 'not_meeting'
      ? { style: qs.meetNo, text: '🚪  No one home — quote from the street' }
      : null

  return (
    <>
      <div
        style={{ ...qs.backdrop, opacity: open ? 1 : 0 }}
        onClick={close}
      />
      <div style={{ ...qs.sheet, transform: open ? 'translateY(0)' : 'translateY(105%)' }}>
        <div style={qs.grab} />
        <h2 style={qs.name}>{name}</h2>
        {address && <div style={qs.addr}>{address}</div>}

        {tel && (
          <a href={tel} style={qs.callPill}>📞 {phone}</a>
        )}

        {meet && <div style={{ ...qs.meetBanner, ...meet.style }}>{meet.text}</div>}

        {portal ? (
          <div style={qs.panel}>
            <div style={qs.panelLabel}>Job info</div>
            <div style={qs.facts}>
              <div>
                <b style={qs.factLabel}>Priority</b>
                {code ? (KO_LABELS[code] ?? code) : '—'}
              </div>
              <div>
                <b style={qs.factLabel}>Complete by</b>
                {due
                  ? <span style={kpi?.expired ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                      {due.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
                      {kpi ? ` (${kpi.expired ? 'overdue ' : ''}${kpi.text.replace(/^-/, '')})` : ''}
                    </span>
                  : '—'}
              </div>
              <div>
                <b style={qs.factLabel}>Type</b>
                {job.job_type || '—'}
              </div>
              {access && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <b style={qs.factLabel}>Access</b>
                  {access}
                </div>
              )}
            </div>
            {job.description && (
              <details style={qs.details}>
                <summary style={qs.detailsSummary}>View original</summary>
                <div style={qs.rawDesc}>{job.description}</div>
              </details>
            )}
          </div>
        ) : (
          <div style={qs.panel}>
            <div style={qs.panelLabel}>Client notes</div>
            <p style={qs.notes}>{job.description || '—'}</p>
          </div>
        )}

        <button style={qs.quoteBtn} onClick={openQuote}>📄  Open quote builder</button>
        <span style={qs.allDetails} onClick={openDetails}>All job details</span>
      </div>
    </>
  )
}

const qs = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.45)',
    zIndex: 500, transition: 'opacity 0.28s ease',
  },
  sheet: {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 501,
    maxWidth: '430px', margin: '0 auto',
    background: 'var(--cream)', borderRadius: '22px 22px 0 0',
    padding: '10px 16px calc(16px + env(safe-area-inset-bottom, 0px))',
    maxHeight: '88vh', overflowY: 'auto',
    transition: 'transform 0.28s ease',
    boxShadow: '0 -8px 40px rgba(44,36,22,0.25)',
    fontFamily: 'var(--font)',
  },
  grab: { width: '44px', height: '5px', borderRadius: '3px', background: 'var(--line)', margin: '4px auto 12px' },
  name: { margin: '0 0 2px', fontSize: '22px', letterSpacing: '-0.02em', color: 'var(--ink)', fontWeight: 800 },
  addr: { color: 'var(--ink-2)', fontSize: '16px', lineHeight: 1.35 },
  callPill: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    marginTop: '10px', padding: '10px 16px', minHeight: '44px',
    borderRadius: 'var(--radius-pill)', background: '#fff',
    border: '1.5px solid var(--line)', color: 'var(--terra)',
    fontWeight: 700, fontSize: '16px', textDecoration: 'none',
  },
  meetBanner: {
    display: 'flex', alignItems: 'center', gap: '10px',
    margin: '14px 0', padding: '14px', borderRadius: '14px',
    fontWeight: 700, fontSize: '16px', width: '100%',
  },
  meetYes: { background: '#E9EFE0', color: '#3F5230', border: '1.5px solid #C9D6B6' },
  meetNo:  { background: '#FDECE2', color: '#9A431F', border: '1.5px solid #F3C9AF' },
  panel: {
    background: '#fff', border: '1px solid var(--line)', borderRadius: '16px',
    padding: '14px 16px', margin: '14px 0 12px',
  },
  panelLabel: {
    fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
    color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: '8px',
  },
  facts: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px',
    fontSize: '15px', color: 'var(--ink)',
  },
  factLabel: {
    display: 'block', fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em',
    color: 'var(--ink-2)', textTransform: 'uppercase', marginBottom: '1px',
  },
  details: { marginTop: '10px', borderTop: '1px solid var(--line)', paddingTop: '8px' },
  detailsSummary: { fontSize: '13px', fontWeight: 600, color: 'var(--ink-2)', cursor: 'pointer' },
  rawDesc: {
    marginTop: '8px', fontSize: '13px', lineHeight: 1.5, color: 'var(--ink-2)',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
  notes: { margin: 0, fontSize: '16px', lineHeight: 1.45, color: 'var(--ink)', whiteSpace: 'pre-wrap' },
  quoteBtn: {
    width: '100%', minHeight: '58px', fontSize: '18px', fontWeight: 700,
    border: 'none', borderRadius: '14px', background: 'var(--terra)', color: '#fff',
    cursor: 'pointer', fontFamily: 'var(--font)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  },
  allDetails: {
    display: 'block', textAlign: 'center', color: 'var(--ink-2)', fontSize: '14px',
    margin: '14px 0 4px', textDecoration: 'underline', cursor: 'pointer',
  },
}
