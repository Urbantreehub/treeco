import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

const STATUS_LABEL = {
  draft: 'Draft', sent: 'Sent', viewed: 'Opened', accepted: 'Accepted',
  declined: 'Declined', complete: 'Complete', invoiced: 'Invoiced',
}
const REASON_LABEL = {
  accepted: 'Accepted by client',
  reopened: 'Reopened for editing',
}

function nzd(v) {
  if (v == null) return '—'
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function when(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Read-only history of quote snapshots (captured on acceptance and on reopen).
// Only renders once at least one version exists, so it stays invisible for
// brand-new quotes that have never been accepted.
export default function QuoteVersionHistory({ quoteId, refreshKey }) {
  const [versions, setVersions] = useState([])
  const [owners, setOwners] = useState([])
  const [openId, setOpenId] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!quoteId || quoteId === 'new') return
    const [vRes, uRes] = await Promise.all([
      supabase.from('quote_versions').select('*').eq('quote_id', quoteId).order('version_no', { ascending: false }),
      supabase.from('users').select('id, name'),
    ])
    setVersions(vRes.data ?? [])
    setOwners(uRes.data ?? [])
    setLoaded(true)
  }, [quoteId])

  // refreshKey (the quote's current status) changes when it's accepted/reopened,
  // so the list re-fetches to show the newly captured snapshot.
  useEffect(() => { load() }, [load, refreshKey])

  const ownerName = (uid) => uid ? (owners.find(o => o.id === uid)?.name ?? 'Unknown') : 'Client'

  if (!loaded || versions.length === 0) return null

  return (
    <div style={st.card}>
      <div style={st.title}>Version history <span style={st.count}>{versions.length}</span></div>
      <div style={st.hint}>Snapshots captured when the quote was accepted or reopened for editing.</div>
      <div>
        {versions.map(v => {
          const open = openId === v.id
          const items = Array.isArray(v.line_items) ? v.line_items : []
          return (
            <div key={v.id} style={st.row}>
              <button style={st.rowHead} onClick={() => setOpenId(open ? null : v.id)}>
                <span style={st.vno}>v{v.version_no}</span>
                <span style={{ ...st.badge, background: v.reason === 'accepted' ? '#4A6741' : '#A85C5C' }}>
                  {REASON_LABEL[v.reason] ?? STATUS_LABEL[v.status] ?? v.status}
                </span>
                <span style={st.meta}>{when(v.created_at)} · {ownerName(v.snapshot_by)}</span>
                <span style={st.total}>{nzd(v.total)}</span>
                <span style={st.chev}>{open ? '▲' : '▼'}</span>
              </button>
              {open && (
                <div style={st.detail}>
                  {items.length === 0 ? (
                    <div style={st.emptyItems}>No line items in this version.</div>
                  ) : (
                    <table style={st.table}>
                      <tbody>
                        {items.map((it, i) => (
                          <tr key={it.id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={st.itemDesc}>
                              {it.description || '—'}
                              {it.optional ? <span style={st.optTag}>{it.selected ? 'optional · selected' : 'optional'}</span> : null}
                            </td>
                            <td style={st.itemQty}>{it.qty ?? 1} × {nzd(it.rate)}</td>
                            <td style={st.itemAmt}>{nzd((Number(it.qty) || 0) * (Number(it.rate) || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  <div style={st.totals}>
                    <span>Subtotal {nzd(v.subtotal)}</span>
                    <span>GST {nzd(v.gst)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--bark)' }}>Total {nzd(v.total)}</span>
                  </div>
                  {v.notes && <div style={st.notes}>{v.notes}</div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const st = {
  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 16 },
  title: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', display: 'flex', alignItems: 'center', gap: 8 },
  count: { fontSize: 11, fontWeight: 700, background: 'var(--bg)', color: '#8A857D', borderRadius: 999, padding: '1px 8px' },
  hint: { fontSize: 11, color: '#8A857D', margin: '4px 0 10px' },
  row: { borderTop: '1px solid var(--border)' },
  rowHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: '10px 2px', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  vno: { fontSize: 12, fontWeight: 700, color: '#8A857D', minWidth: 26 },
  badge: { color: '#fff', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, whiteSpace: 'nowrap' },
  meta: { fontSize: 11.5, color: '#8A857D', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  total: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', whiteSpace: 'nowrap' },
  chev: { fontSize: 9, color: '#bbb' },
  detail: { padding: '4px 2px 12px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  itemDesc: { padding: '6px 8px 6px 0', color: 'var(--bark)' },
  optTag: { marginLeft: 6, fontSize: 10, color: '#8A857D', fontStyle: 'italic' },
  itemQty: { padding: '6px 8px', color: '#8A857D', whiteSpace: 'nowrap', textAlign: 'right' },
  itemAmt: { padding: '6px 0 6px 8px', color: 'var(--bark)', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right' },
  totals: { display: 'flex', gap: 16, justifyContent: 'flex-end', fontSize: 12, color: '#8A857D', marginTop: 10 },
  notes: { fontSize: 12, color: '#8A857D', marginTop: 8, whiteSpace: 'pre-wrap' },
  emptyItems: { fontSize: 12, color: '#8A857D', padding: '4px 0' },
  optTagSel: {},
}
