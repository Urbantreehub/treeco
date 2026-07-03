import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from './StatusBadge'
import QuoteReference from './QuoteReference'
import { JOB_STATUSES, STATUS_ORDER } from '../config/statuses'

// Contextual forward-only transitions per status.
// Legacy statuses (quote_scheduled, accepted_to_schedule, stump_grinding) are
// handled so jobs already in those states can still be moved forward.
const FORWARD_ACTIONS = {
  new_lead:            [{ status: 'quote_sent',          label: 'Quote Sent',       variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }, { status: 'declined', label: 'Decline', variant: 'danger' }],
  quote_scheduled:     [{ status: 'quote_sent',          label: 'Quote Sent',       variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }, { status: 'declined', label: 'Decline', variant: 'danger' }],
  quote_sent:          [{ status: 'scheduled',           label: 'Accept & Schedule', variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }, { status: 'declined', label: 'Decline', variant: 'danger' }],
  accepted_to_schedule:[{ status: 'scheduled',           label: 'Schedule',         variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }],
  scheduled:           [{ status: 'complete_to_invoice', label: 'Mark Complete',    variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }],
  stump_grinding:      [{ status: 'complete_to_invoice', label: 'Mark Complete',    variant: 'primary' }, { status: 'on_hold', label: 'On Hold', variant: 'ghost' }],
  complete_to_invoice: [],
  invoiced:            [],
  on_hold:             [{ status: 'scheduled',           label: 'Reschedule',       variant: 'primary' }, { status: 'new_lead', label: 'Reopen as Lead', variant: 'ghost' }],
  declined:            [{ status: 'new_lead',            label: 'Reopen',           variant: 'ghost' }],
}

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

function timeAgo(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return 'just now'
  const min = Math.floor(diff / 60000), hr = Math.floor(min / 60), day = Math.floor(hr / 24)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  if (hr < 24) return `${hr}h ago`
  if (day < 30) return `${day}d ago`
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

const QUOTE_STATUS_BG = { draft: '#F5F5F5', sent: '#FDF3E3', viewed: '#EBF3FA', accepted: '#E8F0E6', declined: '#FFF0EE' }
const QUOTE_STATUS_COLOR = { draft: '#888', sent: '#D4851A', viewed: '#4A7FA5', accepted: '#4A6741', declined: '#C0392B' }

const JOB_FORMS = [
  { id: 'risk_assessment', label: 'SSSP', url: '/forms/risk-assessment.html', icon: '📋', required: true },
  { id: 'toolbox_meeting', label: 'Toolbox Meeting', url: '/forms/toolbox-meeting.html', icon: '🧰', required: true },
  { id: 'prestart', label: 'Pre-start Check', url: '/forms/prestart-daily.html', icon: '🔧', required: true },
  { id: 'incident_report', label: 'Incident Report', url: '/forms/incident-report.html', icon: '🚨', required: false },
]

// Kāinga Ora SLA timeframes by priority code
const KO_SLA = {
  URG: { label: 'URG — Urgent', respond: 'Respond & complete within 4 hours', color: '#C0392B', bg: '#FFF0EE' },
  URS: { label: 'URS — Urgent Response', respond: 'Respond within 12 hours, complete within 48 hours', color: '#D4851A', bg: '#FDF3E3' },
  EPS: { label: 'EPS — Emergency', respond: 'Respond & complete within 4 hours', color: '#C0392B', bg: '#FFF0EE' },
  GNL: { label: 'GNL — General', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  RSC: { label: 'RSC — Responsive', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  VSC: { label: 'VSC — Void', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  RM:  { label: 'RM — Responsive Maintenance', respond: 'Respond within 48 hours, complete within 10 days', color: '#4A7FA5', bg: '#EBF3FA' },
  PM:  { label: 'PM — Planned Maintenance', respond: 'Respond within 48 hours, complete within 10 days', color: '#7A7A7A', bg: '#F5F5F5' },
}

function extractPriority(job) {
  // Try [PRIORITY] prefix in title first
  const titleMatch = (job.title || '').match(/^\[([A-Z]{2,4})\]/)
  if (titleMatch) return titleMatch[1]
  // Fall back to "Priority: XXX" in description
  const descMatch = (job.description || '').match(/Priority:\s*([A-Z]{2,4})/)
  if (descMatch) return descMatch[1]
  return null
}

export default function JobDetailPanel({ job, onClose, onUpdated, onFieldSaved }) {
  const { isFullAccess } = useAuth()
  const navigate = useNavigate()
  const [changingStatus, setChangingStatus] = useState(false)
  const [editing, setEditing] = useState(false)
  const [xeroStatus, setXeroStatus] = useState(null) // null | 'pushing' | 'ok' | 'err' | 'not_connected'
  const [quoteFollowUp, setQuoteFollowUp] = useState(null) // { opened_count, last_opened_at, followup_count, last_followup_at, sent_at, id }
  const [followingUp, setFollowingUp] = useState(false)
  const [smsOpen, setSmsOpen] = useState(false)
  const [smsText, setSmsText] = useState('')
  const [smsSending, setSmsSending] = useState(false)
  const [smsNote, setSmsNote] = useState(null)
  const [formStatus, setFormStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_job_forms_${job.id}`) ?? '{}') } catch { return {} }
  })
  const [activeForm, setActiveForm] = useState(null)

  useEffect(() => {
    function handleMsg(e) {
      if (e.data?.type === 'form_complete' && e.data.job_id === job.id) {
        setFormStatus(prev => {
          const next = { ...prev, [e.data.form_id]: { completed: true, at: new Date().toISOString() } }
          localStorage.setItem(`treeco_job_forms_${job.id}`, JSON.stringify(next))
          return next
        })
        setActiveForm(null)
      }
    }
    window.addEventListener('message', handleMsg)
    return () => window.removeEventListener('message', handleMsg)
  }, [job.id])

  // Fetch quote follow-up data when job is in quote_sent state
  useEffect(() => {
    if (job.status !== 'quote_sent') { setQuoteFollowUp(null); return }
    supabase
      .from('quotes')
      .select('id, sent_at, opened_count, last_opened_at, followup_count, last_followup_at')
      .eq('job_id', job.id)
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setQuoteFollowUp(data) })
  }, [job.id, job.status])

  async function sendFollowUp(channel) {
    if (!quoteFollowUp?.id) return
    setFollowingUp(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/quote-followup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ quote_id: quoteFollowUp.id, channel }),
      })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.ok) {
        setQuoteFollowUp(prev => ({ ...prev, followup_count: (prev.followup_count ?? 0) + 1, last_followup_at: new Date().toISOString() }))
      }
    } finally {
      setFollowingUp(false)
    }
  }

  function buildFormUrl(f) {
    const d = new Date() // local date — toISOString() would give yesterday during the NZ morning
    const p = new URLSearchParams({
      job_id: job.id,
      job_address: job.address ?? '',
      job_date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      job_type: job.job_type ?? '',
      form_id: f.id,
    })
    return `${f.url}?${p}`
  }

  async function sendText() {
    const phone = job.clients?.phone
    if (!phone || !smsText.trim()) return
    setSmsSending(true); setSmsNote(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ to: phone, message: smsText.trim(), job_id: job.id, kind: 'manual' }),
      })
      const b = await res.json()
      if (!res.ok) { setSmsNote({ err: true, msg: b.notConfigured ? 'SMS not live yet — Twilio account upgrade pending' : (b.error || 'Send failed') }); return }
      setSmsNote({ err: false, msg: `Sent to ${b.to} ✓` }); setSmsText(''); setSmsOpen(false)
    } catch (e) {
      setSmsNote({ err: true, msg: 'Send failed' })
    } finally {
      setSmsSending(false)
    }
  }

  async function pushToXero(quoteId) {
    setXeroStatus('pushing')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/xero-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ quote_id: quoteId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setXeroStatus(body?.error?.includes('not connected') ? 'not_connected' : 'err')
      } else {
        setXeroStatus('ok')
      }
    } catch {
      setXeroStatus('err')
    }
  }
  const [form, setForm] = useState({
    title: job.title,
    address: job.address ?? '',
    job_type: job.job_type ?? '',
    description: job.description ?? '',
    estimated_value: job.estimated_value ?? '',
  })

  const isSD = /spencer|downer/i.test(job.clients?.name ?? '') || /spencer|downer/i.test(job.title ?? '')
  const sdPhotosReady = !isSD || (() => {
    try {
      const during = JSON.parse(localStorage.getItem(`treeco_wo_during_${job.id}`) ?? '[]')
      const after  = JSON.parse(localStorage.getItem(`treeco_wo_after_${job.id}`)  ?? '[]')
      return during.length > 0 && after.length > 0
    } catch { return false }
  })()

  async function handleStatusChange(newStatus) {
    const isComplete = newStatus === 'complete_to_invoice'
    if (isComplete && !sdPhotosReady) {
      alert('During and After photos must be uploaded in the Work Order before this job can be marked complete.')
      return
    }
    setChangingStatus(true)
    const { error } = await supabase
      .from('jobs')
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) { alert(`Failed to update status: ${error.message}`); setChangingStatus(false); return; }
    setChangingStatus(false)
    onUpdated()
    if (newStatus === 'scheduled') {
      // Auto-open Work Order so estimator can review what crew will see
      navigate(`/workorder/${job.id}`)
    }
    onClose()
  }

  async function handleSave() {
    const { error } = await supabase
      .from('jobs')
      .update({
        title: form.title,
        address: form.address,
        job_type: form.job_type,
        description: form.description,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      })
      .eq('id', job.id)
    if (error) { alert(`Save failed: ${error.message}`); return; }
    setEditing(false)
    if (onFieldSaved) onFieldSaved()
    else onUpdated()
  }

  const priority = extractPriority(job)
  const sla = priority ? KO_SLA[priority] : null

  return (
    <>
      {/* Form overlay — full-screen iframe when a form is open */}
      {activeForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #E8EDE4', flexShrink: 0, background: '#fff' }}>
            <button
              onClick={() => setActiveForm(null)}
              style={{ background: 'none', border: '1px solid #D0D9C8', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#4A6741', fontFamily: 'var(--font)' }}
            >
              ← Back to Job
            </button>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#2C2416' }}>{activeForm.label}</span>
            {formStatus[activeForm.id]?.completed && (
              <span style={{ marginLeft: 'auto', color: '#2e7d32', fontWeight: 700, fontSize: 13 }}>✓ Complete</span>
            )}
          </div>
          <iframe src={buildFormUrl(activeForm)} style={{ flex: 1, border: 'none', width: '100%' }} title={activeForm.label} />
        </div>
      )}

      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Slide-over panel */}
      <div style={styles.panel}>
        <div style={styles.panelInner}>
          {/* KO SLA banner */}
          {sla && (
            <div style={{ background: sla.bg, border: `1px solid ${sla.color}33`, borderRadius: '8px', padding: '10px 14px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: sla.color, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Kāinga Ora SLA — {sla.label}
              </div>
              <div style={{ fontSize: '13px', color: sla.color, fontWeight: '500' }}>{sla.respond}</div>
              {(priority === 'URG' || priority === 'EPS') && (
                <div style={{ fontSize: '11px', color: sla.color, marginTop: '4px', opacity: 0.8 }}>
                  Notify KO immediately if timeframe cannot be met.
                </div>
              )}
              {priority === 'URS' && (
                <div style={{ fontSize: '11px', color: sla.color, marginTop: '4px', opacity: 0.8 }}>
                  Log contact attempts or appointment in the work order.
                </div>
              )}
              {priority === 'GNL' && (
                <div style={{ fontSize: '11px', color: sla.color, marginTop: '4px', opacity: 0.8 }}>
                  If 10 days cannot be achieved, notify admin by day 5 to request EOT.
                </div>
              )}
            </div>
          )}

          {/* Header */}
          <div style={styles.panelHeader}>
            <div>
              <div style={styles.panelTitle}>{job.title}</div>
              <div style={styles.panelClient}>{job.clients?.name ?? '—'}</div>
            </div>
            <button onClick={onClose} style={styles.closeBtn}>✕</button>
          </div>

          {/* Status + contextual forward actions */}
          <div style={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: FORWARD_ACTIONS[job.status]?.length ? '12px' : '0', flexWrap: 'wrap' }}>
              <StatusBadge status={job.status} size="lg" />
              {changingStatus && <span style={{ fontSize: '12px', color: '#aaa' }}>Updating…</span>}
            </div>
            {FORWARD_ACTIONS[job.status]?.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {FORWARD_ACTIONS[job.status].map(({ status, label, variant }) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(status)}
                    disabled={changingStatus}
                    style={{
                      ...styles.actionBtn,
                      ...(variant === 'primary' ? styles.actionBtnPrimary : {}),
                      ...(variant === 'danger'  ? styles.actionBtnDanger  : {}),
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* Escape hatch — unusual or backwards moves */}
            <details>
              <summary style={{ fontSize: '11px', color: '#bbb', cursor: 'pointer', userSelect: 'none', listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>▸</span> Move to different status…
              </summary>
              <select
                value=""
                disabled={changingStatus}
                onChange={e => { if (e.target.value) handleStatusChange(e.target.value) }}
                style={{ ...styles.statusSelect, marginTop: '8px', width: '100%' }}
                aria-label="Change status"
              >
                <option value="">Select status…</option>
                {Object.keys(JOB_STATUSES)
                  .filter(k => k !== job.status)
                  .filter(k => k !== 'invoiced' || job.status === 'complete_to_invoice')
                  .map(key => (
                    <option key={key} value={key}>{JOB_STATUSES[key].label}</option>
                  ))}
              </select>
            </details>
          </div>

          {/* Quote follow-up — shown when awaiting client response */}
          {job.status === 'quote_sent' && quoteFollowUp && (
            <div style={{ ...styles.section }}>
              <div style={styles.sectionTitle}>Quote follow-up</div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '10px' }}>
                {(quoteFollowUp.opened_count ?? 0) > 0
                  ? `Opened ${quoteFollowUp.opened_count}× · last ${timeAgo(quoteFollowUp.last_opened_at)}`
                  : 'Not opened yet'
                }
                {quoteFollowUp.sent_at && <span style={{ color: '#aaa', marginLeft: '8px' }}>· sent {timeAgo(quoteFollowUp.sent_at)}</span>}
              </div>
              {(quoteFollowUp.followup_count ?? 0) > 0 && (
                <div style={{ fontSize: '12px', color: '#4A7FA5', marginBottom: '10px' }}>
                  Followed up {quoteFollowUp.followup_count}× · last {timeAgo(quoteFollowUp.last_followup_at)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button disabled={followingUp} onClick={() => sendFollowUp('email')} style={styles.ghostBtn}>
                  {followingUp ? 'Sending…' : 'Follow up by email'}
                </button>
                <button disabled={followingUp} onClick={() => sendFollowUp('sms')} style={styles.ghostBtn}>
                  SMS follow-up
                </button>
              </div>
            </div>
          )}

          {/* Job details */}
          {editing && isFullAccess ? (
            <div style={styles.section}>
              <Label>Title</Label>
              <Input value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} />
              <Label>Address</Label>
              <Input value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))} />
              <Label>Job type</Label>
              <Input value={form.job_type} onChange={v => setForm(p => ({ ...p, job_type: v }))} placeholder="pruning, removal, stump..." />
              <Label>Estimated value ($)</Label>
              <Input value={form.estimated_value} onChange={v => setForm(p => ({ ...p, estimated_value: v }))} type="number" />
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={4}
                style={{ ...styles.input, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button onClick={handleSave} style={styles.primaryBtn}>Save</button>
                <button onClick={() => setEditing(false)} style={styles.ghostBtn}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={styles.section}>
              <Row label="Address" value={job.address} />
              <Row label="Job type" value={job.job_type} />
              <Row label="Estimated value" value={job.estimated_value ? `$${Number(job.estimated_value).toLocaleString('en-NZ')}` : null} />
              <Row label="Client phone" value={job.clients?.phone} />
              <Row label="Client email" value={job.clients?.email} />
              {job.description && (
                <div style={{ marginTop: '8px' }}>
                  <div style={styles.rowLabel}>Notes</div>
                  <div style={styles.description}>{job.description}</div>
                </div>
              )}
              <div style={{ marginTop: '16px' }}>
                <QuoteReference jobId={job.id} />
              </div>
              {isFullAccess && (
                <button onClick={() => setEditing(true)} style={{ ...styles.ghostBtn, marginTop: '12px' }}>
                  Edit details
                </button>
              )}
            </div>
          )}

          {/* Quote action */}
          {isFullAccess && (
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Quote</div>
              {job.quotes && job.quotes.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {job.quotes.map(q => (
                    <button
                      key={q.id}
                      style={styles.quoteOpenBtn}
                      onClick={() => { onClose(); navigate(`/quotes/${q.id}`) }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '18px' }}>📄</span>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: '600', fontSize: '14px' }}>Open quote</div>
                          {q.total != null && (
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '1px' }}>
                              ${Number(q.total).toLocaleString('en-NZ')} incl GST
                            </div>
                          )}
                        </div>
                      </div>
                      <span style={{
                        fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px',
                        background: QUOTE_STATUS_BG[q.status] ?? '#eee',
                        color: QUOTE_STATUS_COLOR[q.status] ?? '#888',
                      }}>
                        {q.status}
                      </span>
                    </button>
                  ))}
                  <button
                    style={{ ...styles.ghostBtn, marginTop: '2px' }}
                    onClick={() => { onClose(); navigate(`/quotes/new?job=${job.id}`) }}
                  >
                    + New quote
                  </button>
                  {/* Xero invoice push — only once the job is Complete — To Be Invoiced */}
                  {job.status === 'complete_to_invoice' && job.quotes.some(q => ['accepted','invoiced'].includes(q.status)) && (
                    <div style={{ marginTop: '6px' }}>
                      <button
                        style={{
                          ...styles.ghostBtn,
                          borderColor: '#13B5EA44',
                          color: xeroStatus === 'ok' ? '#1a7a4a' : xeroStatus === 'err' ? '#c0392b' : '#0E7DC2',
                          background: xeroStatus === 'ok' ? '#f0fff4' : xeroStatus === 'err' ? '#fff0ee' : '#EBF7FD',
                          width: '100%',
                        }}
                        disabled={xeroStatus === 'pushing'}
                        onClick={() => pushToXero(job.quotes.find(q => ['accepted','invoiced'].includes(q.status))?.id)}
                      >
                        {xeroStatus === 'pushing' && '⏳ Pushing to Xero…'}
                        {xeroStatus === 'ok'      && '✅ Invoice created in Xero'}
                        {xeroStatus === 'err'     && '❌ Xero push failed — retry?'}
                        {xeroStatus === 'not_connected' && '⚠️ Xero not connected (Settings)'}
                        {!xeroStatus              && '📤 Push invoice to Xero'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  style={styles.primaryBtn}
                  onClick={() => { onClose(); navigate(`/quotes/new?job=${job.id}`) }}
                >
                  Create quote
                </button>
              )}
            </div>
          )}

          {/* Work Order */}
          <div style={styles.section}>
            <button
              onClick={() => { onClose(); navigate(`/workorder/${job.id}`) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 16px', borderRadius: '10px',
                background: '#F0F7EE', border: '1.5px solid #D0E4CC',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#3A5C2E' }}>Work Order</div>
                <div style={{ fontSize: '12px', color: '#6A8C61', marginTop: '2px' }}>Scope · Forms · Additions · Photos</div>
              </div>
              <span style={{ fontSize: '18px', color: '#4A6741' }}>→</span>
            </button>
            <button
              onClick={() => { onClose(); navigate(`/jobpack/${job.id}`) }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', padding: '12px 16px', borderRadius: '10px', marginTop: '8px',
                background: '#FAF6EF', border: '1.5px solid #E6D9C4',
                cursor: 'pointer', fontFamily: 'var(--font)',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#8B6238' }}>Job Pack PDF</div>
                <div style={{ fontSize: '12px', color: '#A98B63', marginTop: '2px' }}>Printable crew sheet — scope, plan, tools</div>
              </div>
              <span style={{ fontSize: '18px', color: '#8B6238' }}>📄</span>
            </button>
          </div>

          {/* Text the client */}
          {job.clients?.phone && (
            <div style={styles.section}>
              {!smsOpen ? (
                <button
                  onClick={() => { setSmsOpen(true); setSmsNote(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    width: '100%', padding: '12px 16px', borderRadius: '10px',
                    background: '#EEF6EC', border: '1.5px solid #CFE6C9',
                    cursor: 'pointer', fontFamily: 'var(--font)',
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#3A5C2E' }}>💬 Text {job.clients?.name?.split(' ')[0] || 'client'}</div>
                    <div style={{ fontSize: '12px', color: '#6A8C61', marginTop: '2px' }}>{job.clients.phone}</div>
                  </div>
                  <span style={{ fontSize: '16px', color: '#4A6741' }}>→</span>
                </button>
              ) : (
                <div style={{ border: '1.5px solid #CFE6C9', borderRadius: '10px', padding: '12px', background: '#F7FBF6' }}>
                  <textarea
                    autoFocus
                    value={smsText}
                    onChange={e => setSmsText(e.target.value)}
                    placeholder={`Message to ${job.clients?.name?.split(' ')[0] || 'client'}…`}
                    rows={3}
                    maxLength={480}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#aaa' }}>{smsText.length}/480</span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => { setSmsOpen(false); setSmsText('') }} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: '#888', fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)' }}>Cancel</button>
                      <button onClick={sendText} disabled={!smsText.trim() || smsSending} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', opacity: !smsText.trim() || smsSending ? 0.5 : 1 }}>{smsSending ? 'Sending…' : 'Send text'}</button>
                    </div>
                  </div>
                </div>
              )}
              {smsNote && <div style={{ fontSize: '12px', marginTop: '6px', color: smsNote.err ? 'var(--danger)' : 'var(--moss)' }}>{smsNote.msg}</div>}
            </div>
          )}

          {/* Job Forms */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Job Forms</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {JOB_FORMS.map(f => {
                const done = formStatus[f.id]?.completed
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveForm(f)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', width: '100%', textAlign: 'left',
                      border: done ? '1.5px solid #2e7d3244' : f.required ? '1.5px solid #C0392B33' : '1.5px dashed #D0D9C8',
                      background: done ? '#F0FFF4' : f.required ? '#FFF8F8' : '#FAFAFA',
                      cursor: 'pointer', fontFamily: 'var(--font)',
                    }}
                  >
                    <span style={{ fontSize: '15px' }}>{f.icon}</span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#2C2416' }}>{f.label}</span>
                    {done
                      ? <span style={{ color: '#2e7d32', fontSize: '17px', fontWeight: '700' }}>✓</span>
                      : f.required
                        ? <span style={{ color: '#C0392B', fontSize: '17px', fontWeight: '700' }}>✕</span>
                        : <span style={{ color: '#aaa', fontSize: '12px', fontWeight: '600' }}>+ add</span>
                    }
                  </button>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={styles.rowLabel}>{label}</div>
      <div style={styles.rowValue}>{value}</div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ ...styles.rowLabel, marginBottom: '4px', marginTop: '10px' }}>{children}</div>
}

function Input({ value, onChange, type = 'text', placeholder }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={styles.input}
    />
  )
}

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.25)',
    zIndex: 100, backdropFilter: 'blur(2px)',
  },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0,
    width: '420px', maxWidth: '95vw',
    background: '#fff', zIndex: 101,
    boxShadow: '-4px 0 24px rgba(44,36,22,0.15)',
    overflowY: 'auto',
  },
  panelInner: { padding: '24px' },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: '16px',
  },
  panelTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)', marginBottom: '2px' },
  panelClient: { fontSize: '14px', color: '#888' },
  closeBtn: {
    background: 'none', border: 'none', fontSize: '18px',
    color: '#aaa', padding: '0', cursor: 'pointer', lineHeight: 1,
  },
  section: {
    borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px',
  },
  sectionTitle: { fontSize: '12px', fontWeight: '600', color: '#888', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' },
  rowLabel: { fontSize: '11px', color: '#aaa', fontWeight: '500', marginBottom: '1px' },
  rowValue: { fontSize: '14px', color: 'var(--bark)' },
  description: { fontSize: '14px', color: 'var(--bark)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  statusSelect: {
    padding: '8px 12px', borderRadius: '8px', border: '1.5px solid var(--border)',
    background: '#fff', color: 'var(--bark)', fontSize: '13px', fontWeight: '600',
    fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none',
  },
  actionBtn: {
    padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
    background: '#fff', color: 'var(--bark)', fontSize: '13px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'opacity 0.1s',
  },
  actionBtnPrimary: {
    background: 'var(--moss)', color: '#fff', borderColor: 'var(--moss)',
  },
  actionBtnDanger: {
    borderColor: '#E0B0AA', color: 'var(--danger)',
  },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: '8px',
    border: '1px solid var(--border)', fontSize: '14px',
    fontFamily: 'var(--font)', color: 'var(--bark)',
    background: 'var(--cream)', boxSizing: 'border-box',
  },
  primaryBtn: {
    background: 'var(--moss)', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '9px 20px', fontSize: '14px',
    fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  ghostBtn: {
    background: 'none', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '9px 16px', fontSize: '14px',
    color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  quoteOpenBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: '#F0F7EE', border: '1.5px solid #4A6741',
    borderRadius: '10px', padding: '12px 14px', fontSize: '14px',
    color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%',
  },
  quoteBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--cream)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '9px 14px', fontSize: '14px',
    color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%',
  },
}
