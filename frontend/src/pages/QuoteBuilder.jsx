import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import ImageMarkup from '../components/ImageMarkup'
import QuoteReference from '../components/QuoteReference'
import { searchSor, CHARGE_CODES } from '../data/sorCodes'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../config/supabase'
import { v4 as uuid } from 'uuid'

const GST = 0.15

const COMPANY = {
  name: 'Urban Tree Services Limited',
  address: 'Wellington, New Zealand',
  phone: '027 203 1446',
  website: 'www.urbantreeservices.net',
  email: 'office@urbantreeservices.net',
  gstNumber: '132-299-374',
  preparedBy: 'Josh Micallef',
}

const DEFAULT_SIGNATURE = `Payment due upon completion of job
Cash or direct bank transfer is accepted

Cheers,
Josh
Urban Tree Services · Wellington
office@urbantreeservices.net · 027 203 1446`

const JP_TOOLS = [
  { id: 'hedge_trimmers', label: 'Hedge trimmers' },
  { id: 'ladder',         label: 'Ladder' },
  { id: 'pole_saw',       label: 'Pole saw' },
  { id: 'rigging_small',  label: 'Rigging gear (small)' },
  { id: 'rigging_large',  label: 'Rigging gear (large)' },
  { id: 'winch',          label: 'Winch' },
  { id: 'plywood',        label: 'Plywood' },
  { id: 'cones',          label: 'Cones' },
  { id: 'signs',          label: 'Signs' },
]
const DIFF_COLORS = { 1: '#2e7d32', 2: '#7FA650', 3: '#D4851A', 4: '#E05C33', 5: '#C0392B' }
const jpLabel = { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '5px' }
const jpInput = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1.5px solid #E2DDD6', fontSize: '13px', fontFamily: 'var(--font)', color: '#2C2416', boxSizing: 'border-box' }

function nzd(v, dp = 2) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

// ex → incl GST
function inclGst(v) { return Number(v || 0) * (1 + GST) }

function calcTotals(items) {
  const subtotal = items
    .filter(i => !i.optional || i.selected)
    .reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
  const gst = subtotal * GST
  return { subtotal, gst, total: subtotal + gst }
}

// ── Image gallery (multiple images per line item) ──────────────────────────
function ImageGallery({ images, onAdd, onRemove, onMarkup }) {
  const ref = useRef()
  const [uploading, setUploading] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(null)

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    const path = `${uuid()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('quote-images').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('quote-images').getPublicUrl(path)
      onAdd(data.publicUrl)
    }
    setUploading(false)
  }

  return (
    <div style={iu.gallery}>
      {images.map((url, idx) => (
        <div
          key={idx}
          style={iu.wrap}
          onMouseEnter={() => setHoverIdx(idx)}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <img src={url} alt="" style={iu.img} />
          <button style={iu.deleteBtn} onClick={() => onRemove(idx)} title="Remove photo">✕</button>
          {hoverIdx === idx && (
            <button style={iu.markupBtn} onClick={() => onMarkup(idx, url)} title="Add markup">
              ✏ Mark up
            </button>
          )}
        </div>
      ))}
      <div style={iu.zone} onClick={() => ref.current?.click()}>
        <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        <span style={{ fontSize: '18px' }}>🖼</span>
        <span style={iu.hint}>{uploading ? 'Uploading…' : 'Add photo'}</span>
      </div>
    </div>
  )
}
const iu = {
  gallery: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' },
  wrap: { position: 'relative', flexShrink: 0, borderRadius: '6px', overflow: 'visible' },
  img: { width: '90px', height: '66px', objectFit: 'cover', display: 'block', borderRadius: '6px', border: '1px solid #E2DDD6' },
  deleteBtn: {
    position: 'absolute', top: '-7px', right: '-7px',
    width: '18px', height: '18px', borderRadius: '50%',
    background: '#C0392B', color: '#fff', border: '2px solid #fff',
    fontSize: '9px', fontWeight: '700', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    lineHeight: 1, zIndex: 2,
  },
  markupBtn: {
    position: 'absolute', bottom: '4px', left: '4px', right: '4px',
    background: 'rgba(0,0,0,0.65)', border: 'none',
    color: '#fff', borderRadius: '4px', padding: '3px 0',
    fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
    textAlign: 'center', zIndex: 2,
  },
  zone: {
    width: '90px', height: '66px', border: '1.5px dashed #E2DDD6', borderRadius: '6px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', gap: '2px', background: '#FAFAFA', flexShrink: 0,
  },
  hint: { fontSize: '9px', color: '#aaa', fontWeight: '500' },
}

// ── Line item (builder) ────────────────────────────────────────────────────
function SorAutocomplete({ value, onChange, onSelect }) {
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const [cursor, setCursor]   = useState(-1)
  const wrapRef = useRef(null)

  function handleChange(e) {
    const v = e.target.value
    onChange(v)
    const hits = searchSor(v)
    setResults(hits)
    setOpen(hits.length > 0)
    setCursor(-1)
  }

  function pick(sor) {
    onSelect(sor)
    setOpen(false)
    setResults([])
  }

  function handleKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); pick(results[cursor]) }
    if (e.key === 'Escape') setOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={wrapRef} style={{ flex: 1, position: 'relative' }}>
      <input
        style={{ ...b.lineTitle, width: '100%' }}
        placeholder="Item name / SOR code / description of work…"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        autoComplete="off"
      />
      {open && (
        <div style={ac.dropdown}>
          {results.map((sor, i) => (
            <div
              key={sor.code}
              onMouseDown={() => pick(sor)}
              style={{
                ...ac.row,
                background: i === cursor ? 'var(--cream)' : '#fff',
              }}
            >
              <span style={ac.code}>{sor.code}</span>
              <span style={ac.desc}>{sor.desc}</span>
              <span style={{ ...ac.uom, background: sor.uom === '$' ? '#E8F0E6' : '#F5F5F5', color: sor.uom === '$' ? '#4A6741' : '#888' }}>
                {sor.uom || '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const ac = {
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
    background: '#fff', border: '1.5px solid var(--border)', borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 999, overflow: 'hidden',
    maxHeight: '280px', overflowY: 'auto',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F5F5F5',
  },
  code: { fontFamily: 'monospace', fontSize: '12px', fontWeight: '700', color: '#4A6741', minWidth: '72px' },
  desc: { flex: 1, fontSize: '13px', color: '#3a3028' },
  uom:  { fontSize: '11px', fontWeight: '600', borderRadius: '4px', padding: '2px 6px' },
}

function LineItem({ item, onChange, onDelete, onMarkup }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const images = item.images ?? (item.image_url ? [item.image_url] : [])
  const exTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0)
  const inclTotal = exTotal * (1 + GST)

  function addImage(url) {
    const next = [...images, url]
    onChange({ ...item, images: next, image_url: next[0] ?? null })
  }
  function removeImage(idx) {
    const next = images.filter((_, i) => i !== idx)
    onChange({ ...item, images: next, image_url: next[0] ?? null })
  }

  const borderColor = item.optional ? '#D4851A' : '#E2DDD6'

  return (
    <div ref={setNodeRef} style={{
      ...b.lineCard,
      borderLeft: `3px solid ${borderColor}`,
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.4 : 1,
    }}>
      <div style={b.lineHandle} {...attributes} {...listeners}>
        <span style={{ color: '#ccc', fontSize: '14px' }}>⠿</span>
      </div>

      <div style={b.lineBody}>
        {/* ── Header row: description + Fixed/Optional toggle ── */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <SorAutocomplete
            value={item.description}
            onChange={desc => onChange({ ...item, description: desc })}
            onSelect={sor => onChange({
              ...item,
              description: `${sor.code} — ${sor.desc}`,
              detail: item.detail || `UOM: ${sor.uom}`,
              qty: CHARGE_CODES.has(sor.code) ? 1 : item.qty,
              // Prefill the rate-card price; quote-required codes (rate null) keep manual entry
              rate: sor.rate != null ? sor.rate : item.rate,
            })}
          />
          {/* Fixed / Optional segmented control */}
          <div style={b.segWrap}>
            <button
              style={{ ...b.seg, ...(item.optional ? {} : b.segActiveFixed) }}
              onClick={() => onChange({ ...item, optional: false })}
            >
              Fixed
            </button>
            <button
              style={{ ...b.seg, ...(item.optional ? b.segActiveOpt : {}) }}
              onClick={() => onChange({ ...item, optional: true, selected: true })}
            >
              Optional
            </button>
          </div>
        </div>

        <textarea
          style={b.lineDetail}
          placeholder="Additional details, breakdown of costs…"
          value={item.detail ?? ''}
          onChange={e => onChange({ ...item, detail: e.target.value })}
          rows={2}
        />

        {/* ── Optional client-style toggle — shows exactly as client sees it ── */}
        {item.optional && (
          <div style={b.optClientRow}>
            <span style={b.optClientLabel}>Client will see:</span>
            <button
              style={{
                ...b.clientToggleBtn,
                background: item.selected ? '#4A6741' : '#fff',
                color: item.selected ? '#fff' : '#4A6741',
                boxShadow: item.selected ? '0 2px 8px rgba(74,103,65,0.25)' : 'none',
              }}
              onClick={() => onChange({ ...item, selected: !item.selected })}
              title="Toggle — mirrors what client can click"
            >
              {item.selected ? '✓ Included' : '+ Add to quote'}
            </button>
          </div>
        )}

        {/* ── Image gallery ── */}
        <ImageGallery
          images={images}
          onAdd={addImage}
          onRemove={removeImage}
          onMarkup={(idx, url) => onMarkup({ item, imageIndex: idx, imageUrl: url })}
        />

        {/* ── Pricing row ── */}
        <div style={b.linePrice}>
          <div style={b.priceCol}>
            <div style={b.priceLabel}>Price (ex GST)</div>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <span style={b.priceDollar}>$</span>
              <input
                style={b.priceInput}
                type="number" min="0" placeholder="0.00"
                value={item.rate}
                onChange={e => onChange({ ...item, rate: e.target.value })}
              />
            </div>
          </div>

          <div style={b.priceCol}>
            <div style={b.priceLabel}>Qty</div>
            <input
              style={{ ...b.priceInput, width: '60px', textAlign: 'center', paddingLeft: '8px' }}
              type="number" min="0"
              value={item.qty}
              onChange={e => onChange({ ...item, qty: e.target.value })}
            />
          </div>

          <div style={b.priceCol}>
            <div style={b.priceLabel}>Line total (incl GST)</div>
            <div style={{ ...b.lineTotal, opacity: (item.optional && !item.selected) ? 0.4 : 1 }}>
              {nzd(inclTotal)}
            </div>
            <div style={b.lineTotalEx}>({nzd(exTotal)} ex GST)</div>
          </div>

          <button style={{ ...b.removeBtn, marginLeft: 'auto' }} onClick={() => onDelete(item.id)}>
            Remove
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Preview — live iframe of the actual client view ───────────────────────
function QuotePreview({ quote, onClose, onSend, saving }) {
  const token = quote?.client_view_token
  // preview=1 stops the client view from marking the quote as viewed or allowing accept/decline
  const src = token ? `${window.location.origin}/q/${token}?preview=1` : null
  const isMobile = useIsMobile()

  return (
    <div style={pv.overlay}>
      <div style={pv.bar}>
        <button style={{ ...pv.backBtn, whiteSpace: 'nowrap' }} onClick={onClose}>← Continue Editing</button>
        {!isMobile && (
          <div style={{ flex: 1, textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.55)', fontStyle: 'italic' }}>
            Live preview — exactly what your client sees
          </div>
        )}
        <button style={pv.sendBtn} onClick={onSend} disabled={saving}>
          {saving ? 'Saving…' : isMobile ? 'Send →' : 'Send to client →'}
        </button>
      </div>
      {src ? (
        <iframe
          src={src}
          style={pv.iframe}
          title="Client quote preview"
        />
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#fff', fontSize: '15px' }}>
          Save the quote first to preview
        </div>
      )}
    </div>
  )
}

// ── Old static preview kept below (no longer used) — replaced by iframe ───
function _QuotePreviewStatic({ quote, items, notes, onClose, onSend, saving }) {
  const client = quote?.jobs?.clients
  const job = quote?.jobs
  const totals = calcTotals(items)
  const today = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const expiry = new Date(Date.now() + 26 * 24 * 60 * 60 * 1000).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
  const quoteNum = quote?.id ? parseInt(quote.id.slice(-4), 16) % 9000 + 1000 : '—'

  return (
    <div style={pv.overlay}>
      {/* Top bar */}
      <div style={pv.bar}>
        <div style={pv.barLeft}>
          <button style={pv.continueBtn} onClick={onClose}>← Continue Editing</button>
        </div>
        <div style={pv.barRight}>
          <button style={pv.sendBtn} onClick={onSend} disabled={saving}>
            {saving ? 'Saving…' : 'Send to client →'}
          </button>
        </div>
      </div>

      {/* Document */}
      <div style={pv.page}>
        <div style={pv.doc}>

          {/* Letterhead */}
          <div style={pv.letterhead}>
            <div style={pv.logoMark}>
              <span style={{ fontSize: '28px' }}>🌲</span>
              <div>
                <div style={pv.companyName}>Urban Tree Services</div>
                <div style={pv.companyTag}>Wellington · Arborists</div>
              </div>
            </div>
            <div style={pv.docMeta}>
              <div style={pv.metaRow}><span style={pv.metaLbl}>Date</span><span>{today}</span></div>
              <div style={pv.metaRow}><span style={pv.metaLbl}>Expiry</span><span>{expiry}</span></div>
              <div style={pv.metaRow}><span style={pv.metaLbl}>Quote #</span><span>{quoteNum}</span></div>
            </div>
          </div>

          <div style={pv.divider} />

          {/* Client + company details */}
          <div style={pv.parties}>
            <div>
              <div style={pv.partyLabel}>Prepared for</div>
              <div style={pv.partyName}>{client?.name ?? '—'}</div>
              {client?.email && <div style={pv.partyDetail}>{client.email}</div>}
              {client?.phone && <div style={pv.partyDetail}>{client.phone}</div>}
              {job?.address && <div style={pv.partyDetail}>{job.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={pv.partyLabel}>Prepared by</div>
              <div style={pv.partyName}>{COMPANY.preparedBy}</div>
              <div style={pv.partyDetail}>{COMPANY.name}</div>
              <div style={pv.partyDetail}>{COMPANY.phone}</div>
              <div style={pv.partyDetail}>{COMPANY.email}</div>
              <div style={pv.partyDetail}>GST {COMPANY.gstNumber}</div>
            </div>
          </div>

          {/* Job heading */}
          {job?.address && (
            <div style={pv.jobHeading}>{job.address.toUpperCase()}</div>
          )}

          {/* Line items */}
          <div style={pv.itemsTable}>
            {/* Header */}
            <div style={pv.tableHeader}>
              <span style={{ flex: 1 }}>Description</span>
              <span style={{ width: '130px', textAlign: 'right' }}>Price (ex GST)</span>
              <span style={{ width: '50px', textAlign: 'center' }}>Qty</span>
              <span style={{ width: '120px', textAlign: 'right' }}>Total (incl GST)</span>
            </div>

            {items.map((item, idx) => {
              const exLine = (Number(item.qty) || 0) * (Number(item.rate) || 0)
              const inclLine = exLine * (1 + GST)
              const isActive = !item.optional || item.selected
              return (
                <div key={item.id} style={{ ...pv.tableRow, background: idx % 2 === 0 ? '#fff' : '#FAFAF9', opacity: isActive ? 1 : 0.45 }}>
                  <div style={{ flex: 1 }}>
                    <div style={pv.rowTitle}>
                      {item.description || '—'}
                      {item.optional && (
                        <span style={pv.optBadge}>{item.selected ? 'Optional · Included' : 'Optional · Excluded'}</span>
                      )}
                    </div>
                    {item.detail && <div style={pv.rowDetail}>{item.detail}</div>}
                    {item.image_url && (
                      <img src={item.image_url} alt="" style={pv.rowImg} />
                    )}
                  </div>
                  <div style={{ width: '130px', textAlign: 'right', fontSize: '13px', color: '#666' }}>{nzd(item.rate)}</div>
                  <div style={{ width: '50px', textAlign: 'center', fontSize: '13px', color: '#666' }}>{item.qty}</div>
                  <div style={{ width: '120px', textAlign: 'right' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#2C2416' }}>{isActive ? nzd(inclLine) : '—'}</div>
                    <div style={{ fontSize: '10px', color: '#aaa' }}>incl GST</div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div style={pv.totals}>
            <div style={pv.totalsInner}>
              <div style={pv.totalRow}>
                <span>Subtotal</span><span>{nzd(totals.subtotal)}</span>
              </div>
              <div style={pv.totalRow}>
                <span>GST 15%</span><span>{nzd(totals.gst)}</span>
              </div>
              <div style={{ ...pv.totalRow, ...pv.totalRowBig }}>
                <span>Total NZD</span><span>{nzd(totals.total)}</span>
              </div>
              <div style={pv.gstNote}>Prices above are exclusive of GST. GST is calculated at 15%.</div>
            </div>
          </div>

          {/* Notes / payment terms */}
          {notes && (
            <div style={pv.notesSection}>
              <div style={pv.notesTitle}>Payment terms & notes</div>
              <pre style={pv.notesBody}>{notes}</pre>
            </div>
          )}

          {/* Footer */}
          <div style={pv.footer}>
            🌲 Urban Tree Services · {COMPANY.email} · GST {COMPANY.gstNumber}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Send modal ─────────────────────────────────────────────────────────────
function SendModal({ quote, onClose, onSent, saving }) {
  const link = `${window.location.origin}/q/${quote.client_view_token}`
  const [copied, setCopied] = useState(false)
  const clientName = quote.jobs?.clients?.name ?? ''
  const clientEmail = quote.jobs?.clients?.email ?? ''

  function copy() { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const mailtoBody = encodeURIComponent(`Hi ${clientName.split(' ')[0]},\n\nPlease find your quote here:\n${link}\n\nLet me know if you have any questions.\n\n${DEFAULT_SIGNATURE}`)
  const mailtoHref = `mailto:${clientEmail}?subject=${encodeURIComponent('Quote from Urban Tree Services')}&body=${mailtoBody}`

  return (
    <div style={sm.backdrop}>
      <div style={sm.box}>
        <div style={sm.header}>
          <div style={sm.title}>Send quote to {clientName}</div>
          <button style={sm.close} onClick={onClose}>✕</button>
        </div>
        <div style={sm.body}>
          <div style={sm.label}>Client link — share this URL</div>
          <div style={sm.linkRow}>
            <div style={sm.linkUrl}>{link}</div>
            <button style={sm.copyBtn} onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
          </div>
          {clientEmail && (
            <a href={mailtoHref} style={sm.emailBtn}>✉ Open email app with link pre-filled</a>
          )}
          <div style={sm.note}>
            Once you've shared the link, mark the quote as <strong>Sent</strong> to track when the client opens and responds.
          </div>
        </div>
        <div style={sm.footer}>
          <button style={sm.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={sm.sentBtn} onClick={onSent} disabled={saving}>{saving ? 'Saving…' : 'Mark as sent ✓'}</button>
        </div>
      </div>
    </div>
  )
}

const sm = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  box: { background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '95vw', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #E2DDD6' },
  title: { fontSize: '15px', fontWeight: '700', color: '#2C2416' },
  close: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px' },
  body: { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  linkRow: { display: 'flex', gap: '8px' },
  linkUrl: { flex: 1, background: '#FAF8F4', border: '1px solid #E2DDD6', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#4A7FA5', wordBreak: 'break-all' },
  copyBtn: { background: '#4A7FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' },
  emailBtn: { display: 'block', background: '#FAF8F4', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '10px 14px', fontSize: '13px', color: '#2C2416', textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font)' },
  note: { fontSize: '12px', color: '#aaa', lineHeight: 1.5 },
  footer: { display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid #E2DDD6' },
  cancelBtn: { background: 'none', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '8px 14px', fontSize: '13px', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  sentBtn: { background: '#4A6741', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
}

// ── Email modal ─────────────────────────────────────────────────────────────
function EmailModal({ quote, onClose, onSend, sending }) {
  const clientEmail = quote?.jobs?.clients?.email
  const clientName  = quote?.jobs?.clients?.name ?? ''
  const total       = quote?.total ?? 0
  function nzd(v) { return '$' + Number(v||0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

  return (
    <div style={sm.backdrop}>
      <div style={sm.box}>
        <div style={sm.header}>
          <div style={sm.title}>Email quote to {clientName}</div>
          <button style={sm.close} onClick={onClose}>✕</button>
        </div>
        <div style={sm.body}>
          <div style={{ background: '#F8FAF7', border: '1px solid #D4E4D0', borderRadius: '8px', padding: '14px 16px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#6A8060', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Will send to</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#2C2416' }}>{clientEmail}</div>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Subject: Your quote from Urban Tree Services — {nzd(total)}</div>
          </div>
          <div style={sm.note}>
            A branded email will be sent with the total amount and a "View &amp; Accept Quote" button.
            {quote?.status === 'draft' && ' The quote will also be marked as Sent.'}
          </div>
        </div>
        <div style={sm.footer}>
          <button style={sm.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...sm.sentBtn, background: '#4A7FA5' }} onClick={onSend} disabled={sending}>
            {sending ? 'Sending…' : `Send email →`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main builder ────────────────────────────────────────────────────────────
export default function QuoteBuilder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const isNew = id === 'new'
  const preselectedJobId = isNew ? new URLSearchParams(window.location.search).get('job') : null

  const [quote, setQuote] = useState(null)
  const [job, setJob] = useState(null)
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState(DEFAULT_SIGNATURE)
  const [privateNotes, setPrivateNotes] = useState('')
  const [jobPack,      setJobPack]      = useState({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [jobId, setJobId] = useState(preselectedJobId)
  const [jobs, setJobs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [markupItem, setMarkupItem] = useState(null)
  const [xeroLoading, setXeroLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  // Open send modal if navigated here from a new-quote save-and-send
  useEffect(() => {
    if (location.state?.openSendModal) setShowSendModal(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isNew) {
      supabase.from('quotes')
        .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
        .eq('id', id).single()
        .then(({ data }) => {
          if (!data) return
          setQuote(data); setJob(data.jobs); setJobId(data.job_id)
          setItems((data.line_items ?? []).map(i => ({ ...i, id: i.id ?? uuid() })))
          setNotes(data.notes ?? DEFAULT_SIGNATURE)
          setPrivateNotes(data.private_notes ?? '')
          setJobPack(data.job_pack ?? {})
        })
    } else {
      supabase.from('jobs')
        .select('id, address, job_type, clients (name)')
        .in('status', ['new_lead', 'quote_scheduled', 'quote_sent', 'accepted_to_schedule'])
        .order('created_at', { ascending: false })
        .then(({ data }) => setJobs(data ?? []))
    }
  }, [id, isNew])

  const totals = calcTotals(items)

  const addItem = () => setItems(prev => [...prev, {
    id: uuid(), description: '', detail: '', qty: 1, rate: '', optional: false, selected: true, images: [], image_url: null,
  }])

  const updateItem = useCallback((updated) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }, [])

  const deleteItem = useCallback((itemId) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  function handleDragStart({ active }) { setActiveId(active.id) }
  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over || active.id === over.id) return
    setItems(prev => {
      const a = prev.findIndex(i => i.id === active.id)
      const b = prev.findIndex(i => i.id === over.id)
      return arrayMove(prev, a, b)
    })
  }

  async function save(newStatus, openSendModal = false) {
    setSaving(true)
    const payload = {
      line_items: items, subtotal: totals.subtotal, gst: totals.gst, total: totals.total,
      notes, private_notes: privateNotes, job_pack: jobPack,
      ...(newStatus ? { status: newStatus } : {}),
      ...(newStatus === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    }
    // Graceful fallback if optional columns don't exist yet (migrations 007, 009)
    const OPTIONAL_COLS = ['job_pack', 'private_notes', 'notes', 'valid_until']
    async function tryUpsert(p, isInsert, insertMeta) {
      let res = isInsert
        ? await supabase.from('quotes').insert({ ...insertMeta, ...p }).select().single()
        : await supabase.from('quotes').update(p).eq('id', id)
      const errMsg = res.error?.message ?? ''
      if (OPTIONAL_COLS.some(c => errMsg.includes(c))) {
        const { job_pack: _jp, private_notes: _pn, notes: _n, ...pFallback } = p
        const metaFallback = isInsert
          ? Object.fromEntries(Object.entries(insertMeta).filter(([k]) => k !== 'valid_until'))
          : undefined
        res = isInsert
          ? await supabase.from('quotes').insert({ ...metaFallback, ...pFallback }).select().single()
          : await supabase.from('quotes').update(pFallback).eq('id', id)
      }
      return res
    }
    if (isNew) {
      if (!jobId) { showToast('Select a job first', 'error'); setSaving(false); return }
      const token = uuid().replace(/-/g, '')
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { data, error } = await tryUpsert(payload, true, { job_id: jobId, status: newStatus ?? 'draft', client_view_token: token, valid_until: validUntil })
      if (error) showToast(error.message, 'error')
      else if (data) { showToast('Quote created'); navigate(`/quotes/${data.id}`, { replace: true, state: openSendModal ? { openSendModal: true } : null }) }
      else showToast('Quote created')
    } else {
      const { error } = await tryUpsert(payload, false)
      if (error) { showToast(error.message, 'error'); setSaving(false); return }
      showToast(newStatus === 'sent' ? 'Marked as sent' : 'Saved')
      const { data } = await supabase.from('quotes')
        .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
        .eq('id', id).single()
      if (data) { setQuote(data); setJob(data.jobs) }
    }
    setSaving(false)
  }

  async function handlePreviewSend() {
    await save(undefined, true)
    setShowPreview(false)
    setShowSendModal(true)
  }

  async function handleSend() {
    if (items.length === 0) { showToast('Add at least one line item before sending', 'error'); return }
    await save(undefined, true)
    setShowSendModal(true)
  }

  async function markAsSent() {
    await save('sent')
    setShowSendModal(false)
    // Auto-advance job status to quote_sent if still at an early stage
    if (quote?.job_id) {
      const { data: currentJob } = await supabase.from('jobs').select('status').eq('id', quote.job_id).single()
      if (['new_lead', 'quote_scheduled'].includes(currentJob?.status)) {
        await supabase.from('jobs')
          .update({ status: 'quote_sent', status_changed_at: new Date().toISOString() })
          .eq('id', quote.job_id)
      }
    }
  }

  async function markComplete() {
    await save('complete')
    if (quote?.job_id) {
      await supabase.from('jobs')
        .update({ status: 'complete_to_invoice', status_changed_at: new Date().toISOString() })
        .eq('id', quote.job_id)
    }
  }

  async function sendToXero() {
    if (!quote) return
    setXeroLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/xero-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ quote_id: quote.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Xero sync failed')
      showToast('Invoice created in Xero ✓')
      // Refresh quote data
      const { data } = await supabase.from('quotes')
        .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
        .eq('id', quote.id).single()
      if (data) { setQuote(data); setJob(data.jobs) }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setXeroLoading(false)
    }
  }

  async function sendEmail() {
    if (!quote) return
    setEmailLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-quote-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ quote_id: quote.id }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Email failed')
      showToast(`Email sent to ${body.to} ✓`)
      setShowEmailModal(false)
      // Mark as sent if still draft
      if (quote.status === 'draft') await save('sent')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setEmailLoading(false)
    }
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : null

  const ST = {
    draft:    { label: 'Draft',    bg: '#F5F5F5', color: '#888' },
    sent:     { label: 'Sent',     bg: '#FDF3E3', color: '#D4851A' },
    viewed:   { label: 'Viewed',   bg: '#EBF3FA', color: '#4A7FA5' },
    accepted: { label: 'Accepted', bg: '#E8F0E6', color: '#4A6741' },
    declined: { label: 'Declined', bg: '#FFF0EE', color: '#C0392B' },
    complete: { label: 'Complete', bg: '#E6F4EC', color: '#1A7A4A' },
    invoiced: { label: 'Invoiced', bg: '#E8EEFA', color: '#2A4AB0' },
  }
  const st = quote?.status ? ST[quote.status] : null
  const clientEmail = quote?.jobs?.clients?.email
  const canEmail    = !!clientEmail && quote?.client_view_token && quote?.status !== 'draft'
  const canComplete = quote?.status === 'accepted'
  const canXero     = quote?.status === 'complete'

  return (
    <>
      <div style={s.page}>
        {/* ── Header ── */}
        <div style={{ ...s.header, flexWrap: isMobile ? 'wrap' : 'nowrap', padding: isMobile ? '10px 14px' : '12px 20px' }}>
          <div style={s.hLeft}>
            <button style={s.backBtn} onClick={() => navigate('/pipeline')}>← Jobs</button>
            <div>
              <div style={{ ...s.title, fontSize: isMobile ? '14px' : '16px' }}>{isNew ? 'New Quote' : (job?.clients?.name ?? 'Quote')}</div>
              {!isNew && job && <div style={s.sub}>{job.address}{job.job_type ? ` · ${job.job_type}` : ''}</div>}
            </div>
          </div>
          <div style={{ ...s.hRight, flexWrap: 'wrap' }}>
            {st && <span style={{ ...s.badge, background: st.bg, color: st.color }}>{st.label}</span>}
            {!isMobile && (
              <button style={s.previewBtn} onClick={async () => { await save(); setShowPreview(true) }} disabled={saving}>
                {saving ? 'Saving…' : 'Preview'}
              </button>
            )}
            {!isMobile && quote?.client_view_token && (
              <button
                style={s.pdfBtn}
                onClick={async () => {
                  await save()
                  window.open(`${window.location.origin}/q/${quote.client_view_token}?download=1&preview=1`, '_blank')
                }}
                disabled={saving}
                title="Save and open PDF download page"
              >
                ⬇ PDF
              </button>
            )}
            {canEmail && (
              <button style={s.emailBtn} onClick={() => setShowEmailModal(true)} disabled={emailLoading}>
                ✉ Email
              </button>
            )}
            {canComplete && (
              <button style={s.completeBtn} onClick={markComplete} disabled={saving}>
                Mark Complete ✓
              </button>
            )}
            {canXero && (
              <button style={s.xeroBtn} onClick={sendToXero} disabled={xeroLoading}>
                {xeroLoading ? 'Sending…' : '→ Xero'}
              </button>
            )}
            {quote?.status !== 'invoiced' && (
              <>
                <button style={s.saveBtn} onClick={() => save()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                {quote?.status !== 'complete' && (
                  <button style={s.sendBtn} onClick={handleSend} disabled={saving}>{isMobile ? 'Send →' : 'Send to client →'}</button>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ ...s.body, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={s.main}>

            {/* Job selector */}
            {isNew && (
              <div style={s.card}>
                <div style={s.cardTitle}>Job</div>
                <select style={s.select} value={jobId ?? ''} onChange={e => setJobId(e.target.value)}>
                  <option value="">Select a job…</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.clients?.name} — {j.address} ({j.job_type})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Quote reference — lead/site material for the operator (never on the client quote) */}
            {jobId && <QuoteReference jobId={jobId} readOnly />}

            {/* Line items */}
            <div style={s.card}>
              <div style={s.cardTitle}>Line items</div>
              <div style={s.gstNote}>
                💡 Enter prices <strong>ex GST</strong> — line totals are shown <strong>incl GST</strong> (15%)
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                    {items.map(item => (
                      <LineItem key={item.id} item={item} onChange={updateItem} onDelete={deleteItem} onMarkup={setMarkupItem} />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeItem && <LineItem item={activeItem} onChange={() => {}} onDelete={() => {}} />}
                </DragOverlay>
              </DndContext>

              {items.length === 0 && <div style={s.emptyItems}>No items yet</div>}
              <button style={s.addBtn} onClick={addItem}>+ Add line item</button>
            </div>

            {/* Job Pack — crew-facing ops checklist */}
            <div style={{ ...s.card, border: '1.5px solid #4A674133', background: '#F8FAF7' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <span style={{ fontSize: '15px' }}>📋</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#4A6741', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Job Pack</span>
                <span style={{ fontSize: '11px', background: '#E8F0E6', color: '#4A6741', borderRadius: '10px', padding: '1px 8px', fontWeight: '600' }}>Crew info — not on quote</span>
              </div>

              {/* Time + Staff */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <div>
                  <div style={jpLabel}>Time required</div>
                  <input style={jpInput} placeholder="e.g. Half day, 4–6 hrs" value={jobPack.time_required ?? ''} onChange={e => setJobPack(p => ({ ...p, time_required: e.target.value }))} />
                </div>
                <div>
                  <div style={jpLabel}>Number of staff</div>
                  <select style={jpInput} value={jobPack.staff_count ?? ''} onChange={e => setJobPack(p => ({ ...p, staff_count: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">—</option>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>

              {/* Equipment */}
              <div style={{ marginBottom: '14px' }}>
                <div style={jpLabel}>Equipment</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {/* Chipper */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Chipper</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['Small', 'Large', 'None'].map(v => (
                        <button key={v} onClick={() => setJobPack(p => ({ ...p, chipper: p.chipper === v ? null : v }))} style={{
                          flex: 1, padding: '5px 2px', borderRadius: '6px', border: '1.5px solid',
                          borderColor: jobPack.chipper === v ? '#4A6741' : '#E2DDD6',
                          background: jobPack.chipper === v ? '#E8F0E6' : '#fff',
                          color: jobPack.chipper === v ? '#4A6741' : '#aaa',
                          fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
                        }}>{v}</button>
                      ))}
                    </div>
                  </div>
                  {/* Avant */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Avant</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['Yes', 'No'].map(v => {
                        const active = v === 'Yes' ? jobPack.avant === true : jobPack.avant === false
                        return (
                          <button key={v} onClick={() => setJobPack(p => { const n = v === 'Yes'; return { ...p, avant: p.avant === n ? null : n } })} style={{
                            flex: 1, padding: '5px 2px', borderRadius: '6px', border: '1.5px solid',
                            borderColor: active ? '#4A6741' : '#E2DDD6',
                            background: active ? '#E8F0E6' : '#fff',
                            color: active ? '#4A6741' : '#aaa',
                            fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
                          }}>{v}</button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Stump grinder */}
                  <div>
                    <div style={{ fontSize: '11px', color: '#888', marginBottom: '5px' }}>Stump grinder</div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {['Yes', 'No'].map(v => {
                        const active = v === 'Yes' ? jobPack.stump_grinder === true : jobPack.stump_grinder === false
                        return (
                          <button key={v} onClick={() => setJobPack(p => { const n = v === 'Yes'; return { ...p, stump_grinder: p.stump_grinder === n ? null : n } })} style={{
                            flex: 1, padding: '5px 2px', borderRadius: '6px', border: '1.5px solid',
                            borderColor: active ? '#4A6741' : '#E2DDD6',
                            background: active ? '#E8F0E6' : '#fff',
                            color: active ? '#4A6741' : '#aaa',
                            fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
                          }}>{v}</button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Difficulty */}
              <div style={{ marginBottom: '14px' }}>
                <div style={jpLabel}>Difficulty</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setJobPack(p => ({ ...p, difficulty: p.difficulty === n ? null : n }))} style={{
                      width: '36px', height: '36px', borderRadius: '8px',
                      border: `1.5px solid ${jobPack.difficulty === n ? DIFF_COLORS[n] : '#E2DDD6'}`,
                      background: jobPack.difficulty === n ? DIFF_COLORS[n] + '22' : '#fff',
                      color: jobPack.difficulty === n ? DIFF_COLORS[n] : '#ccc',
                      fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
                    }}>{n}</button>
                  ))}
                  {jobPack.difficulty && (
                    <span style={{ fontSize: '12px', color: DIFF_COLORS[jobPack.difficulty], fontWeight: '600', marginLeft: '4px' }}>
                      {['','Easy','Moderate','Challenging','Difficult','Extreme'][jobPack.difficulty]}
                    </span>
                  )}
                </div>
              </div>

              {/* Tools */}
              <div>
                <div style={jpLabel}>Tools needed</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {JP_TOOLS.map(tool => (
                    <label key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#2C2416' }}>
                      <input
                        type="checkbox"
                        checked={!!((jobPack.tools ?? {})[tool.id])}
                        onChange={e => { const checked = e.target.checked; setJobPack(p => ({ ...p, tools: { ...(p.tools ?? {}), [tool.id]: checked } })) }}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#4A6741' }}
                      />
                      {tool.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Private notes */}
            <div style={{ ...s.card, border: '1.5px solid #F5C842', background: '#FFFDF0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <span>🔒</span>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#B8860B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Private notes</span>
                <span style={{ fontSize: '11px', background: '#FFF3CD', color: '#B8860B', borderRadius: '10px', padding: '1px 8px', fontWeight: '600' }}>Not visible to client</span>
              </div>
              <textarea
                style={{ ...s.textarea, background: '#FFFDF0', borderColor: '#F5C842' }}
                placeholder="Internal notes, cost breakdown, supplier prices, margin…"
                value={privateNotes}
                onChange={e => setPrivateNotes(e.target.value)}
                rows={4}
              />
            </div>

            {/* Notes to client */}
            <div style={s.card}>
              <div style={s.cardTitle}>Payment terms &amp; notes to client</div>
              <textarea
                style={s.textarea}
                placeholder="Payment terms, conditions, anything the client should know…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={7}
              />
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#bbb', fontStyle: 'italic' }}>
                Your signature is included here and appears on the printed document.
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div style={{ ...s.sidebar, width: isMobile ? '100%' : '260px', position: isMobile ? 'static' : 'sticky' }}>
            <div style={s.totalsCard}>
              <div style={s.cardTitle}>Summary</div>
              {items.some(i => i.optional) && (
                <div style={s.optNote}>✱ Optional items included — client can toggle</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={s.tRow}><span>Subtotal (ex GST)</span><span>{nzd(totals.subtotal)}</span></div>
                <div style={s.tRow}><span>GST (15%)</span><span>{nzd(totals.gst)}</span></div>
                <div style={{ ...s.tRow, ...s.tBig }}><span>Total (incl GST)</span><span>{nzd(totals.total)}</span></div>
              </div>
              {quote?.client_view_token && (
                <div style={s.linkBox}>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>Client link</div>
                  <div style={{ fontSize: '11px', color: '#4A7FA5', wordBreak: 'break-all', marginBottom: '8px' }}>
                    {window.location.origin}/q/{quote.client_view_token}
                  </div>
                  <button style={s.copyBtn} onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/q/${quote.client_view_token}`); showToast('Link copied!') }}>
                    Copy link
                  </button>
                </div>
              )}
              {isMobile && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button style={{ ...s.previewBtn, flex: 1 }} onClick={async () => { await save(); setShowPreview(true) }} disabled={saving}>Preview</button>
                  {quote?.client_view_token && (
                    <button style={{ ...s.pdfBtn, flex: 1 }} onClick={async () => { await save(); window.open(`${window.location.origin}/q/${quote.client_view_token}?download=1&preview=1`, '_blank') }} disabled={saving}>⬇ PDF</button>
                  )}
                </div>
              )}
            </div>

            {quote && (
              <div style={s.metaCard}>
                <div style={s.cardTitle}>Client</div>
                <div style={{ fontWeight: '600', color: '#2C2416', marginBottom: '4px' }}>{quote.jobs?.clients?.name}</div>
                {quote.jobs?.clients?.email && <div style={s.metaLine}>{quote.jobs.clients.email}</div>}
                {quote.jobs?.clients?.phone && <div style={s.metaLine}>{quote.jobs.clients.phone}</div>}
                {quote.jobs?.address && <div style={{ ...s.metaLine, marginTop: '6px' }}>{quote.jobs.address}</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview overlay */}
      {/* Image markup tool */}
      {markupItem && (
        <ImageMarkup
          imageUrl={markupItem.imageUrl}
          onSave={url => {
            const imgs = [...(markupItem.item.images ?? [])]
            imgs[markupItem.imageIndex] = url
            updateItem({ ...markupItem.item, images: imgs, image_url: imgs[0] ?? null })
            setMarkupItem(null)
            showToast('Markup saved')
          }}
          onClose={() => setMarkupItem(null)}
        />
      )}

      {showPreview && (
        <QuotePreview
          quote={quote}
          onClose={() => setShowPreview(false)}
          onSend={handlePreviewSend}
          saving={saving}
        />
      )}

      {/* Send modal */}
      {showSendModal && quote && (
        <SendModal
          quote={quote}
          onClose={() => setShowSendModal(false)}
          onSent={markAsSent}
          saving={saving}
        />
      )}

      {showEmailModal && quote && (
        <EmailModal
          quote={quote}
          onClose={() => setShowEmailModal(false)}
          onSend={sendEmail}
          sending={emailLoading}
        />
      )}

      {toast && (
        <div style={{ ...s.toast, background: toast.type === 'error' ? '#C0392B' : '#4A6741' }}>
          {toast.msg}
        </div>
      )}
    </>
  )
}

// ── Builder styles ──
const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: '#FAF8F4' },
  header: {
    background: '#fff', borderBottom: '1px solid #E2DDD6', padding: '12px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0,
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  hRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  iconBtn: { background: 'none', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px' },
  backBtn: { background: 'none', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  title: { fontSize: '16px', fontWeight: '700', color: '#2C2416' },
  sub: { fontSize: '11px', color: '#aaa' },
  badge: { fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px' },
  previewBtn: {
    background: 'none', border: '1.5px solid #4A6741', borderRadius: '7px', padding: '7px 14px',
    fontSize: '13px', fontWeight: '600', color: '#4A6741', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  pdfBtn: { background: '#FAF8F4', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '7px 12px', fontSize: '13px', fontWeight: '600', color: '#2C2416', cursor: 'pointer', fontFamily: 'var(--font)' },
  saveBtn: { background: '#FAF8F4', border: '1px solid #E2DDD6', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', color: '#2C2416', cursor: 'pointer', fontFamily: 'var(--font)' },
  sendBtn: { background: '#4A6741', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  emailBtn: { background: '#EBF3FA', color: '#4A7FA5', border: '1.5px solid #4A7FA5', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  completeBtn: { background: '#E6F4EC', color: '#1A7A4A', border: '1.5px solid #1A7A4A', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  xeroBtn: { background: '#1A7A4A', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  body: { flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', gap: '18px', alignItems: 'flex-start' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 },
  sidebar: { width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px', position: 'sticky', top: 0 },
  card: { background: '#fff', borderRadius: '10px', border: '1px solid #E2DDD6', padding: '16px 18px' },
  cardTitle: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' },
  gstNote: { fontSize: '12px', color: '#666', background: '#EBF3FA', borderRadius: '6px', padding: '8px 12px', lineHeight: 1.5 },
  select: { width: '100%', padding: '9px 10px', borderRadius: '7px', border: '1.5px solid #E2DDD6', fontSize: '13px', fontFamily: 'var(--font)', color: '#2C2416' },
  emptyItems: { textAlign: 'center', color: '#ccc', padding: '24px 0', fontSize: '13px' },
  addBtn: { marginTop: '12px', background: 'none', border: '1px dashed #E2DDD6', borderRadius: '7px', padding: '10px', fontSize: '13px', color: '#4A6741', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%', fontWeight: '600' },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1.5px solid #E2DDD6', fontSize: '13px', fontFamily: 'var(--font)', color: '#2C2416', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },
  totalsCard: { background: '#fff', borderRadius: '10px', border: '1px solid #E2DDD6', padding: '16px 18px' },
  optNote: { fontSize: '11px', color: '#D4851A', background: '#FDF3E3', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' },
  tRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' },
  tBig: { fontSize: '16px', fontWeight: '700', color: '#2C2416', borderTop: '1px solid #E2DDD6', paddingTop: '10px', marginTop: '4px' },
  linkBox: { marginTop: '14px', padding: '10px', background: '#FAF8F4', borderRadius: '8px', border: '1px solid #E2DDD6' },
  copyBtn: { background: '#4A7FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%' },
  metaCard: { background: '#fff', borderRadius: '10px', border: '1px solid #E2DDD6', padding: '16px 18px' },
  metaLine: { fontSize: '13px', color: '#888' },
  toast: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', zIndex: 9999 },
}

// ── Line item builder styles ──
const b = {
  lineCard: { background: '#fff', border: '1px solid #E2DDD6', borderRadius: '10px', display: 'flex', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  lineHandle: { width: '26px', background: '#FAFAFA', borderRight: '1px solid #E2DDD6', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, userSelect: 'none' },
  lineBody: { flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  lineTitle: { padding: '7px 9px', borderRadius: '6px', border: '1.5px solid #E2DDD6', fontSize: '14px', fontFamily: 'var(--font)', color: '#2C2416', fontWeight: '500', boxSizing: 'border-box' },
  lineDetail: { width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1.5px solid #E2DDD6', fontSize: '12px', fontFamily: 'var(--font)', color: '#666', resize: 'none', boxSizing: 'border-box' },
  linePrice: { display: 'flex', alignItems: 'flex-end', gap: '14px', paddingTop: '8px', borderTop: '1px solid #f5f5f5', flexWrap: 'wrap' },
  priceCol: { display: 'flex', flexDirection: 'column', gap: '3px' },
  priceLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase' },
  priceDollar: { position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '12px', pointerEvents: 'none' },
  priceInput: { padding: '7px 8px 7px 20px', borderRadius: '6px', border: '1.5px solid #E2DDD6', fontSize: '13px', fontFamily: 'var(--font)', color: '#2C2416', width: '110px', textAlign: 'right' },
  lineTotal: { fontSize: '15px', fontWeight: '700', color: '#2C2416', transition: 'opacity 0.2s' },
  lineTotalEx: { fontSize: '10px', color: '#aaa' },
  removeBtn: { background: 'none', border: 'none', color: '#C0392B', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)', padding: '3px 6px' },
  // Fixed / Optional segmented control
  segWrap: { display: 'flex', borderRadius: '7px', border: '1.5px solid #E2DDD6', overflow: 'hidden', flexShrink: 0 },
  seg: { padding: '6px 11px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', border: 'none', background: 'transparent', color: '#aaa', transition: 'all 0.15s' },
  segActiveFixed: { background: '#2C2416', color: '#fff' },
  segActiveOpt: { background: '#D4851A', color: '#fff' },
  // Client-style optional toggle (mirrors QuoteView)
  optClientRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: '#FDF9F0', borderRadius: '7px', border: '1px solid #F5C842' },
  optClientLabel: { fontSize: '11px', color: '#B8860B', fontWeight: '600', whiteSpace: 'nowrap' },
  clientToggleBtn: {
    padding: '8px 18px', borderRadius: '20px', border: '2px solid #4A6741',
    fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)',
    transition: 'all 0.2s', whiteSpace: 'nowrap',
  },
}

// ── Preview styles ──
const pv = {
  overlay: { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#1C1C1E' },
  bar: {
    background: '#2C2416', padding: '12px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  backBtn: { background: 'none', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'var(--font)' },
  sendBtn: { background: '#4A6741', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  iframe: { flex: 1, border: 'none', width: '100%' },
  barLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  barRight: { display: 'flex', gap: '10px' },
  continueBtn: { background: 'none', border: '1.5px solid #4A6741', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: '#4A6741', cursor: 'pointer', fontFamily: 'var(--font)' },
  page: { flex: 1, overflow: 'auto', padding: '32px 20px 60px' },
  doc: { width: '100%', minWidth: '680px', maxWidth: '780px', margin: '0 auto', background: '#fff', borderRadius: '4px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', overflow: 'hidden' },
  letterhead: { background: '#2C2416', color: '#fff', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoMark: { display: 'flex', alignItems: 'center', gap: '12px' },
  companyName: { fontSize: '18px', fontWeight: '700' },
  companyTag: { fontSize: '11px', opacity: 0.6, marginTop: '2px' },
  docMeta: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' },
  metaRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', fontSize: '12px' },
  metaLbl: { opacity: 0.6 },
  divider: { height: '3px', background: '#4A6741' },
  parties: { display: 'flex', justifyContent: 'space-between', padding: '24px 32px', borderBottom: '1px solid #E2DDD6' },
  partyLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  partyName: { fontSize: '15px', fontWeight: '700', color: '#2C2416', marginBottom: '4px' },
  partyDetail: { fontSize: '12px', color: '#666', lineHeight: 1.7 },
  jobHeading: { padding: '20px 32px 12px', fontSize: '20px', fontWeight: '800', color: '#2C2416', letterSpacing: '-0.3px', borderBottom: '1px solid #E2DDD6' },
  itemsTable: { padding: '0 32px 16px' },
  tableHeader: {
    display: 'flex', gap: '12px', padding: '10px 0',
    fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase',
    borderBottom: '2px solid #E2DDD6', marginTop: '8px',
  },
  tableRow: { display: 'flex', gap: '12px', padding: '14px 0', borderBottom: '1px solid #F0EDE8', alignItems: 'flex-start' },
  rowTitle: { fontSize: '14px', fontWeight: '600', color: '#2C2416', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  rowDetail: { fontSize: '12px', color: '#666', lineHeight: 1.6, marginBottom: '8px', whiteSpace: 'pre-wrap' },
  rowImg: { width: '120px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #E2DDD6', marginTop: '8px' },
  optBadge: { fontSize: '10px', background: '#FDF3E3', color: '#D4851A', borderRadius: '10px', padding: '2px 8px', fontWeight: '600', border: '1px solid #FAE8CC' },
  totals: { display: 'flex', justifyContent: 'flex-end', padding: '0 32px 24px' },
  totalsInner: { width: '280px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#FAFAF9', border: '1px solid #E2DDD6', borderRadius: '8px', padding: '16px' },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' },
  totalRowBig: { fontSize: '18px', fontWeight: '800', color: '#2C2416', borderTop: '2px solid #E2DDD6', paddingTop: '10px', marginTop: '4px' },
  gstNote: { fontSize: '10px', color: '#aaa', textAlign: 'right', marginTop: '4px' },
  notesSection: { padding: '20px 32px', borderTop: '1px solid #E2DDD6' },
  notesTitle: { fontSize: '13px', fontWeight: '700', color: '#2C2416', marginBottom: '8px' },
  notesBody: { fontSize: '13px', color: '#555', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' },
  footer: { background: '#2C2416', color: 'rgba(255,255,255,0.5)', padding: '14px 32px', fontSize: '11px', textAlign: 'center' },
}
