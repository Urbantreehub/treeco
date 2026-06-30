import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from './StatusBadge'
import { JOB_STATUSES, STATUS_ORDER } from '../config/statuses'

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

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

export default function JobDetailPanel({ job, onClose, onUpdated }) {
  const { isFullAccess } = useAuth()
  const navigate = useNavigate()
  const [changingStatus, setChangingStatus] = useState(false)
  const [editing, setEditing] = useState(false)
  const [xeroStatus, setXeroStatus] = useState(null) // null | 'pushing' | 'ok' | 'err' | 'not_connected'
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

  function buildFormUrl(f) {
    const p = new URLSearchParams({
      job_id: job.id,
      job_address: job.address ?? '',
      job_date: new Date().toISOString().slice(0, 10),
      job_type: job.job_type ?? '',
      form_id: f.id,
    })
    return `${f.url}?${p}`
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
    onUpdated()
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

          {/* Status badge + change */}
          <div style={styles.section}>
            <StatusBadge status={job.status} size="lg" />
          </div>

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
                  {/* Xero invoice push — show for accepted/invoiced quotes */}
                  {job.quotes.some(q => ['accepted','invoiced'].includes(q.status)) && (
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
          </div>

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

          {/* Status change */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Move to</div>
            <div style={styles.statusGrid}>
              {STATUS_ORDER.filter(k => k !== job.status).map(key => {
                const s = JOB_STATUSES[key]
                return (
                  <button
                    key={key}
                    disabled={changingStatus}
                    onClick={() => handleStatusChange(key)}
                    style={{
                      ...styles.statusBtn,
                      borderColor: s.color + '66',
                      color: s.color,
                      background: s.color + '11',
                    }}
                  >
                    {s.label}
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
  statusGrid: { display: 'flex', flexDirection: 'column', gap: '6px' },
  statusBtn: {
    border: '1px solid', borderRadius: '8px', padding: '8px 12px',
    fontSize: '13px', fontWeight: '500', textAlign: 'left',
    cursor: 'pointer', transition: 'opacity 0.1s',
    fontFamily: 'var(--font)',
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
