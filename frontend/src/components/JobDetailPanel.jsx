import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from './StatusBadge'
import { JOB_STATUSES, STATUS_ORDER } from '../config/statuses'

export default function JobDetailPanel({ job, onClose, onUpdated }) {
  const { isFullAccess } = useAuth()
  const navigate = useNavigate()
  const [changingStatus, setChangingStatus] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    title: job.title,
    address: job.address ?? '',
    job_type: job.job_type ?? '',
    description: job.description ?? '',
    estimated_value: job.estimated_value ?? '',
  })

  async function handleStatusChange(newStatus) {
    setChangingStatus(true)
    await supabase
      .from('jobs')
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq('id', job.id)
    setChangingStatus(false)
    onUpdated()
    onClose()
  }

  async function handleSave() {
    await supabase
      .from('jobs')
      .update({
        title: form.title,
        address: form.address,
        job_type: form.job_type,
        description: form.description,
        estimated_value: form.estimated_value ? Number(form.estimated_value) : null,
      })
      .eq('id', job.id)
    setEditing(false)
    onUpdated()
  }

  return (
    <>
      {/* Backdrop */}
      <div style={styles.backdrop} onClick={onClose} />

      {/* Slide-over panel */}
      <div style={styles.panel}>
        <div style={styles.panelInner}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {job.quotes.map(q => (
                    <button
                      key={q.id}
                      style={styles.quoteBtn}
                      onClick={() => { onClose(); navigate(`/quotes/${q.id}`) }}
                    >
                      <span>View quote</span>
                      <span style={{
                        fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '2px 8px',
                        background: QUOTE_STATUS_BG[q.status] ?? '#eee',
                        color: QUOTE_STATUS_COLOR[q.status] ?? '#888',
                      }}>
                        {q.status}
                      </span>
                    </button>
                  ))}
                  <button
                    style={{ ...styles.ghostBtn, marginTop: '4px' }}
                    onClick={() => { onClose(); navigate(`/quotes/new?job=${job.id}`) }}
                  >
                    + New quote
                  </button>
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

const QUOTE_STATUS_BG = { draft: '#F5F5F5', sent: '#FDF3E3', viewed: '#EBF3FA', accepted: '#E8F0E6', declined: '#FFF0EE' }
const QUOTE_STATUS_COLOR = { draft: '#888', sent: '#D4851A', viewed: '#4A7FA5', accepted: '#4A6741', declined: '#C0392B' }

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
  quoteBtn: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'var(--cream)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '9px 14px', fontSize: '14px',
    color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%',
  },
}
