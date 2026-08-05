import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import ImageMarkup from '../components/ImageMarkup'
import QuoteVersionHistory from '../components/QuoteVersionHistory'
import QuoteActivity from '../components/QuoteActivity'
import QuoteLibraryModal from '../components/QuoteLibraryModal'
import QuoteComments from '../components/QuoteComments'
import { searchSor, CHARGE_CODES } from '../data/sorCodes'
import { DISPOSAL_PRESETS, WORK_PRESETS } from '../data/quotePresets'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { v4 as uuid } from 'uuid'
import { GST, calcTotals, lineExtras, DISPOSAL_OPTIONS, GRINDINGS_OPTIONS } from '../utils/pricing'
import { stampImage, buildStamp } from '../utils/imageStamp'
import { isSpencersJob, jobCategory } from '../config/statuses'
import { SPENCERS_LOCATION_GROUPS } from '../config/spencersLocations'

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
const jpInput = { width: '100%', padding: '8px 10px', borderRadius: '7px', border: '1.5px solid var(--border)', fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--ink)', boxSizing: 'border-box' }

function nzd(v, dp = 2) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}

// GST maths + quote totals now live in ../utils/pricing (imported above).

// ── Image gallery (multiple images per line item) ──────────────────────────
function ImageGallery({ images, onAdd, onRemove, onMarkup, stampAddress }) {
  const ref = useRef()
  const [uploading, setUploading] = useState(false)
  const [hoverIdx, setHoverIdx] = useState(null)

  async function handleFile(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      // On Downer jobs, stamp the Before photo with the job address + date/time
      // (+ GPS). Spencers/residential photos are uploaded untouched.
      let body = file, contentType = undefined
      if (stampAddress != null) {
        body = await stampImage(file, await buildStamp(stampAddress))
        contentType = 'image/jpeg'
      }
      const ext = stampAddress != null ? 'jpg' : file.name.split('.').pop()
      const path = `${uuid()}.${ext}`
      const { error } = await supabase.storage.from('quote-images').upload(path, body, contentType ? { contentType } : undefined)
      if (!error) {
        const { data } = supabase.storage.from('quote-images').getPublicUrl(path)
        onAdd(data.publicUrl)
      }
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
          {/* Always rendered (not hover-gated) so the markup editor is reachable
              on touch devices — hover never fires on an iPad. */}
          <button style={iu.markupBtn} onClick={() => onMarkup(idx, url)} title="Add markup">
            ✏ Mark up
          </button>
        </div>
      ))}
      <div style={iu.zone} onClick={() => ref.current?.click()}>
        <input ref={ref} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFile} />
        <span style={iu.plus}>+</span>
        <span style={iu.hint}>{uploading ? 'Uploading…' : 'Add attachment'}</span>
      </div>
    </div>
  )
}
const iu = {
  gallery: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' },
  wrap: { position: 'relative', flexShrink: 0, borderRadius: '6px', overflow: 'visible' },
  img: { width: '90px', height: '66px', objectFit: 'cover', display: 'block', borderRadius: '6px', border: '1px solid var(--border)' },
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
    width: '90px', height: '66px', border: '1.5px dashed var(--border)', borderRadius: '6px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', gap: '3px', background: '#FAFAFA', flexShrink: 0,
  },
  plus: { fontSize: '22px', lineHeight: 1, color: '#9a948a', fontWeight: '300' },
  hint: { fontSize: '9.5px', color: '#8A857D', fontWeight: '600' },
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
        placeholder="Location — e.g. front yard, rear boundary (or SOR code)"
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

// ── Per-line add-on group (Disposal / Grindings) ───────────────────────────
// Collapsed by default. The office ticks which options to offer and sets a
// markup for each; the first offered option is the client's default. When only
// one is offered it shows on the quote as an included line (not a choice).
function AddonGroup({ label, catalog, value, onChange }) {
  const options = value?.options ?? []
  const [open, setOpen] = useState(options.length > 0)
  const isOn = key => options.some(o => o.key === key)
  const priceOf = key => options.find(o => o.key === key)?.price ?? ''

  function commit(next) {
    if (!next.length) { onChange(null); return }
    const selected = next.some(o => o.key === value?.selected) ? value.selected : next[0].key
    onChange({ options: next, selected })
  }
  function toggle(key) {
    commit(isOn(key) ? options.filter(o => o.key !== key) : [...options, { key, price: '' }])
  }
  function setPrice(key, price) {
    commit(options.map(o => o.key === key ? { ...o, price } : o))
  }

  return (
    <div style={b.addonWrap}>
      <button style={b.addonHead} onClick={() => setOpen(o => !o)} type="button">
        <span style={b.addonLabel}>{label}</span>
        {options.length > 0 && <span style={b.addonCount}>{options.length} offered</span>}
        <span style={b.addonChevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div style={b.addonBody}>
          {catalog.map(opt => {
            const on = isOn(opt.key)
            const isDefault = value?.selected === opt.key
            return (
              <div key={opt.key} style={b.addonRow}>
                <button
                  type="button"
                  onClick={() => toggle(opt.key)}
                  style={{ ...b.addonChip, ...(on ? b.addonChipOn : {}) }}
                  title={opt.full}
                >
                  {on ? '✓ ' : '+ '}{opt.short}
                </button>
                {on && (
                  <>
                    <span style={b.addonPlus}>+$</span>
                    <input
                      type="number" min="0" placeholder="0"
                      value={priceOf(opt.key)}
                      onChange={e => setPrice(opt.key, e.target.value)}
                      style={b.addonPriceInput}
                    />
                    {options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onChange({ options, selected: opt.key })}
                        style={{ ...b.addonDefault, ...(isDefault ? b.addonDefaultOn : {}) }}
                        title="Show this as the client's default choice"
                      >
                        {isDefault ? '★ default' : 'set default'}
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {options.length === 1 && (
            <div style={b.addonNote}>One option → shown as an included line on the quote (not a choice).</div>
          )}
          {options.length > 1 && (
            <div style={b.addonNote}>{options.length} options → client picks one on the quote.</div>
          )}
        </div>
      )}
    </div>
  )
}

// Spencers non-agreed-rate lines are priced as crew hours at a fixed rate: the
// quoter enters hours, the price is hours × $320 ex GST, and a "Breakdown of
// Costs" line is generated for the quote/portal.
const BREAKDOWN_RATE = 320  // $/hr ex GST
const breakdownText = h => `3 man truck & chipper charged @ $320+GST per hour × ${h} hour${Number(h) === 1 ? '' : 's'}`

function LineItem({ item, onChange, onDelete, onMarkup, spencers, spencersOnly, sitePhotos, stampAddress }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id })

  const images = item.images ?? (item.image_url ? [item.image_url] : [])
  const exTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0) + lineExtras(item)
  const inclTotal = exTotal * (1 + GST)

  function addImage(url) {
    const next = [...images, url]
    onChange({ ...item, images: next, image_url: next[0] ?? null })
  }
  function removeImage(idx) {
    const next = images.filter((_, i) => i !== idx)
    onChange({ ...item, images: next, image_url: next[0] ?? null })
  }

  const borderColor = item.optional ? '#D4851A' : 'var(--border)'

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
              // Flag agreed-rate (fixed schedule) vs non-agreed-rate (quote-required)
              // so the Spencers invoice + portal quote PDF can exclude agreed-rate
              // codes (paid on the schedule, never quoted). A non-agreed-rate code
              // on a Spencers job also switches on the $320/hr cost breakdown.
              ...(sor.rate != null
                ? { sor: true, quotable: false }
                : { sor: false, quotable: true, ...(spencersOnly ? { breakdown_on: true, rate: BREAKDOWN_RATE } : {}) }),
            })}
          />
          {/* Fixed / Optional segmented control — labelled so it's easy to find */}
          <div style={b.segCol}>
            <span style={b.segLabel}>Item type</span>
            <div style={b.segWrap}>
              <button
                style={{ ...b.seg, ...(item.optional ? {} : b.segActiveFixed) }}
                onClick={() => onChange({ ...item, optional: false })}
                title="Always included in the quote"
              >
                Fixed
              </button>
              <button
                style={{ ...b.seg, ...(item.optional ? b.segActiveOpt : {}) }}
                onClick={() => onChange({ ...item, optional: true, selected: true })}
                title="Client can tick to add or remove this"
              >
                Optional
              </button>
            </div>
          </div>
        </div>

        {/* ── Spencers property-element location (PE1, PE2 …) ── */}
        {spencers && (
          <div style={b.locationRow}>
            <span style={b.locationLabel}>Location</span>
            <select
              style={b.locationSelect}
              value={item.location ?? ''}
              onChange={e => onChange({ ...item, location: e.target.value })}
              title="Property-element location from the Spencers portal (e.g. PE1 = Property Exterior 1)"
            >
              <option value="">— Select location —</option>
              {SPENCERS_LOCATION_GROUPS.map(g => (
                <optgroup key={g.prefix} label={g.label}>
                  {g.options.map(o => (
                    <option key={o.code} value={o.code}>
                      {g.prefix === 'PE' ? `${o.code} — Property Exterior ${o.code.slice(2)}` : o.code}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {item.location && <span style={b.locationChip}>{item.location}</span>}
          </div>
        )}

        <textarea
          style={b.lineDetail}
          placeholder={'Tree or group on the first line, then one action per line:\nSilver birch\nReduce height & spread by 20%\nRemove deadwood'}
          value={item.detail ?? ''}
          onChange={e => onChange({ ...item, detail: e.target.value })}
          rows={3}
        />
        {item.detail?.trim() && (
          <div style={b.detailPreview}>
            <div style={b.detailPreviewLabel}>Client sees</div>
            {(() => {
              const lines = item.detail.split('\n').map(l => l.trim()).filter(Boolean)
              const hasMarkers = lines.some(l => /^[-•*]\s+/.test(l))
              if (!hasMarkers) {
                const [head, ...actions] = lines
                return (
                  <>
                    <div style={b.previewTitle}>{head}</div>
                    {actions.map((l, i) => (
                      <div key={i} style={b.previewBullet}><span style={b.previewDot}>•</span>{l}</div>
                    ))}
                  </>
                )
              }
              return lines.map((line, i) => {
                const m = /^[-•*]\s+(.*)$/.exec(line)
                if (m) return <div key={i} style={b.previewBullet}><span style={b.previewDot}>•</span>{m[1]}</div>
                return <div key={i} style={b.previewLine}>{line}</div>
              })
            })()}
          </div>
        )}

        {/* ── Optional item default — mirrors the checkbox the client taps ── */}
        {item.optional && (
          <div style={b.optClientRow}>
            <span style={b.optClientLabel}>Client sees:</span>
            <button
              style={{ ...b.optCheckbox, ...(item.selected ? b.optCheckboxOn : {}) }}
              onClick={() => onChange({ ...item, selected: !item.selected })}
              title="Sets whether this option is ticked by default"
            >
              {item.selected ? '✓' : ''}
            </button>
            <span style={b.optClientHint}>
              {item.selected ? 'Ticked by default — included' : 'Unticked by default — client adds it'}
            </span>
          </div>
        )}

        {/* ── Image gallery ── */}
        {spencers ? (
          <div style={b.phaseWrap}>
            <div style={b.phaseLabel}>Before <span style={b.phaseHint}>· site assessment</span></div>
            <ImageGallery
              images={images}
              onAdd={addImage}
              onRemove={removeImage}
              onMarkup={(idx, url) => onMarkup({ item, imageIndex: idx, imageUrl: url })}
              stampAddress={stampAddress}
            />
            {/* During / After come from the crew's Work Order (read-only here) */}
            {['during', 'after'].map(stage => {
              const urls = sitePhotos?.[stage] ?? []
              return (
                <div key={stage} style={b.phaseRow}>
                  <div style={b.phaseLabel}>{stage === 'during' ? 'During' : 'After'} <span style={b.phaseHint}>· added on site by crew</span></div>
                  {urls.length > 0 ? (
                    <div style={b.phaseThumbs}>
                      {urls.map((url, i) => <img key={`${i}-${url}`} src={url} alt="" style={b.phaseThumb} />)}
                    </div>
                  ) : (
                    <div style={b.phaseEmpty}>None yet</div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <ImageGallery
            images={images}
            onAdd={addImage}
            onRemove={removeImage}
            onMarkup={(idx, url) => onMarkup({ item, imageIndex: idx, imageUrl: url })}
          />
        )}

        {/* ── Disposal / Grindings add-ons ── */}
        <div style={b.addonGroups}>
          <AddonGroup label="Disposal" catalog={DISPOSAL_OPTIONS}
            value={item.disposal} onChange={dg => onChange({ ...item, disposal: dg })} />
          <AddonGroup label="Grindings" catalog={GRINDINGS_OPTIONS}
            value={item.grindings} onChange={gg => onChange({ ...item, grindings: gg })} />
        </div>

        {/* ── Cost breakdown ($320/hr) — Spencers non-agreed-rate lines ── */}
        {spencersOnly && (
          <div style={b.breakdownBox}>
            <label style={b.breakdownToggle}>
              <input
                type="checkbox"
                checked={!!item.breakdown_on}
                onChange={e => onChange(e.target.checked
                  ? { ...item, breakdown_on: true, quotable: true, sor: false, rate: BREAKDOWN_RATE,
                      qty: item.breakdown_hours || item.qty || 1,
                      breakdown: item.breakdown_hours ? breakdownText(item.breakdown_hours) : '' }
                  : { ...item, breakdown_on: false })}
              />
              <span>Cost breakdown — crew hours @ $320+GST/hr <span style={b.breakdownNote}>(non-agreed-rate)</span></span>
            </label>
            {item.breakdown_on && (
              <div style={b.breakdownBody}>
                <span style={b.priceLabel}>Hours</span>
                <input
                  style={{ ...b.priceInput, width: '72px', textAlign: 'center', paddingLeft: '8px' }}
                  type="number" min="0" step="0.5" placeholder="0"
                  value={item.breakdown_hours ?? ''}
                  onChange={e => {
                    const h = e.target.value
                    onChange({ ...item, breakdown_hours: h, quotable: true, sor: false, rate: BREAKDOWN_RATE,
                      qty: h === '' ? '' : Math.max(0, Number(h)),
                      breakdown: h === '' ? '' : breakdownText(h) })
                  }}
                />
                <span style={b.breakdownRate}>× $320 ex GST</span>
                {item.breakdown_hours != null && item.breakdown_hours !== '' && (
                  <div style={b.breakdownPreview}>
                    <strong>Breakdown of Costs</strong> — {breakdownText(item.breakdown_hours)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Pricing row ── */}
        <div style={b.linePrice}>
          <div style={b.priceCol}>
            <div style={b.priceLabel}>Price (ex GST)</div>
            <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
              <span style={b.priceDollar}>$</span>
              <input
                style={{ ...b.priceInput, ...(item.breakdown_on ? b.priceLocked : {}) }}
                type="number" min="0" placeholder="0.00"
                value={item.rate}
                disabled={item.breakdown_on}
                title={item.breakdown_on ? 'Set by the cost breakdown ($320/hr)' : undefined}
                onChange={e => onChange({ ...item, rate: e.target.value })}
              />
            </div>
          </div>

          <div style={b.priceCol}>
            <div style={b.priceLabel}>{item.breakdown_on ? 'Hours' : 'Qty'}</div>
            <input
              style={{ ...b.priceInput, width: '60px', textAlign: 'center', paddingLeft: '8px', ...(item.breakdown_on ? b.priceLocked : {}) }}
              type="number" min="0"
              value={item.qty}
              disabled={item.breakdown_on}
              title={item.breakdown_on ? 'Set by the hours above' : undefined}
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
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>{isActive ? nzd(inclLine) : '—'}</div>
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

const sm = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(44,36,22,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  box: { background: '#fff', borderRadius: '12px', width: '460px', maxWidth: '95vw', boxShadow: '0 12px 40px rgba(0,0,0,0.2)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: '15px', fontWeight: '700', color: 'var(--ink)' },
  close: { background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '16px' },
  body: { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  label: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  linkRow: { display: 'flex', gap: '8px' },
  linkUrl: { flex: 1, background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#4A7FA5', wordBreak: 'break-all' },
  copyBtn: { background: '#4A7FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 14px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font)' },
  emailBtn: { display: 'block', background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '7px', padding: '10px 14px', fontSize: '13px', color: 'var(--ink)', textDecoration: 'none', textAlign: 'center', fontFamily: 'var(--font)' },
  note: { fontSize: '12px', color: '#aaa', lineHeight: 1.5 },
  footer: { display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)' },
  cancelBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '8px 14px', fontSize: '13px', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  sentBtn: { background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
}

// ── Compose email screen ─────────────────────────────────────────────────────
// The primary "Send" action. Opens an editable email — subject + a personal
// message pre-filled with a thank-you template — with the quote link attached.
function defaultEmailMessage({ firstName, address }) {
  return `Hi ${firstName},

Thank you for the opportunity to quote for the work at ${address} — we really appreciate it.

Your full quote is ready to view. You can see all the details and accept or decline online using the button in this email.

Any questions at all, just reply to this email or give me a call on 027 203 1446.

Cheers,
Josh
Urban Tree Services`
}

function ComposeEmailModal({ quote, onClose, onSend, sending, onMarkSent, saving }) {
  const clientEmail = quote?.jobs?.clients?.email ?? ''
  const clientName  = quote?.jobs?.clients?.name ?? ''
  const firstName   = clientName.split(' ')[0] || 'there'
  const address     = quote?.jobs?.address ?? 'your property'
  const total       = quote?.total ?? 0
  const link        = `${window.location.origin}/q/${quote?.client_view_token}`

  const [subject, setSubject] = useState(`Your quote from Urban Tree Services — ${nzd(total)}`)
  const [message, setMessage] = useState(defaultEmailMessage({ firstName, address }))
  const [copied, setCopied]   = useState(false)
  function copy() { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const fieldLabel = { fontSize: '11px', fontWeight: '700', color: '#6A8060', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }
  const input = { width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: '7px', padding: '9px 11px', fontSize: '13px', color: 'var(--ink)', fontFamily: 'var(--font)', background: '#fff' }

  // No email on file — offer the shareable link + manual "mark as sent" instead.
  if (!clientEmail) {
    return (
      <div style={sm.backdrop}>
        <div style={sm.box}>
          <div style={sm.header}>
            <div style={sm.title}>Send quote to {clientName}</div>
            <button style={sm.close} onClick={onClose}>✕</button>
          </div>
          <div style={sm.body}>
            <div style={{ background: '#FFF7E6', border: '1px solid #F0D9A8', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#8A6D1A' }}>
              This client has no email address on file, so the quote can't be emailed. Add one under the client, or share the link below.
            </div>
            <div style={sm.label}>Client link — share this URL</div>
            <div style={sm.linkRow}>
              <div style={sm.linkUrl}>{link}</div>
              <button style={sm.copyBtn} onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
          </div>
          <div style={sm.footer}>
            <button style={sm.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={sm.sentBtn} onClick={onMarkSent} disabled={saving}>{saving ? 'Saving…' : 'Mark as sent ✓'}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={sm.backdrop}>
      <div style={{ ...sm.box, width: '540px' }}>
        <div style={sm.header}>
          <div style={sm.title}>Send quote to {clientName}</div>
          <button style={sm.close} onClick={onClose}>✕</button>
        </div>
        <div style={{ ...sm.body, gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <div style={fieldLabel}>To</div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--ink)' }}>{clientEmail}</div>
          </div>
          <div>
            <div style={fieldLabel}>Subject</div>
            <input style={input} value={subject} onChange={e => setSubject(e.target.value)} />
          </div>
          <div>
            <div style={fieldLabel}>Message</div>
            <textarea
              style={{ ...input, minHeight: '160px', resize: 'vertical', lineHeight: 1.55 }}
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <div>
            <div style={fieldLabel}>Quote link — included in the email</div>
            <div style={sm.linkRow}>
              <div style={sm.linkUrl}>{link}</div>
              <button style={sm.copyBtn} onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
          </div>
          <div style={sm.note}>
            The email is branded and adds the quote total and a "View &amp; Accept Quote" button below your message.
            {quote?.status === 'draft' && ' The quote will be marked as Sent once it goes out.'}
          </div>
        </div>
        <div style={sm.footer}>
          <button style={sm.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...sm.sentBtn, background: '#4A7FA5' }} onClick={() => onSend({ subject, message })} disabled={sending}>
            {sending ? 'Sending…' : 'Send email →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main builder ────────────────────────────────────────────────────────────
export default function QuoteBuilder() {
  const { id } = useParams()
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const isNew = id === 'new'
  const preselectedJobId = isNew ? new URLSearchParams(window.location.search).get('job') : null

  const [quote, setQuote] = useState(null)
  const [owners, setOwners] = useState([])   // [{ id, name }] — attributes activity events
  const [job, setJob] = useState(null)
  const [sitePhotos, setSitePhotos] = useState({}) // { [line_ref]: { during:[], after:[] } } — crew photos
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
  const [showLibrary, setShowLibrary] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [markupItem, setMarkupItem] = useState(null)
  const [xeroLoading, setXeroLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [smsLoading, setSmsLoading] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000)
  }

  // After a brand-new quote saves, it navigates to /quotes/:id with this flag —
  // open the preview then. Keyed on location.state so it fires post-navigation,
  // not just on first mount (the component doesn't remount when :id changes).
  useEffect(() => {
    if (location.state?.openPreview) {
      setShowPreview(true)
      navigate(location.pathname, { replace: true, state: null }) // consume the flag
    }
  }, [location.state, location.pathname, navigate])

  useEffect(() => {
    if (!isNew) {
      supabase.from('quotes')
        .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
        .eq('id', id).single()
        .then(({ data }) => {
          if (!data) return
          setQuote(data); setJob(data.jobs); setJobId(data.job_id)
          setItems((Array.isArray(data.line_items) ? data.line_items : []).map(i => ({ ...i, id: i.id ?? uuid() })))
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

  // Crew During/After photos (job_photos) so the office sees them per line item
  // in the builder alongside the quoter's Before photos. Spencers/Downer only.
  useEffect(() => {
    if (!job?.id || !isSpencersJob(job)) { setSitePhotos({}); return }
    supabase.from('job_photos').select('url, phase, line_ref').eq('job_id', job.id)
      .in('phase', ['during', 'after'])
      .then(({ data }) => {
        const byLine = {}
        for (const p of (data ?? [])) {
          if (!p.line_ref) continue
          const cur = byLine[p.line_ref] ?? { during: [], after: [] }
          if (cur[p.phase]) cur[p.phase].push(p.url)
          byLine[p.line_ref] = cur
        }
        setSitePhotos(byLine)
      })
  }, [job?.id])

  // Team roster — used to attribute activity events (created/edited/sent by …).
  useEffect(() => {
    if (isNew) return
    supabase.from('users').select('id, name').then(({ data }) => setOwners(data ?? []))
  }, [isNew])

  const totals = calcTotals(items)
  const optionalTotal = items.filter(i => i.optional).length
  const optionalSelected = items.filter(i => i.optional && i.selected).length

  const addItem = () => setItems(prev => [...prev, {
    id: uuid(), description: '', detail: '', qty: 1, rate: '', optional: false, selected: true, images: [], image_url: null,
  }])

  // Insert one or more library items as new quote line items.
  const insertItems = useCallback((newItems) => {
    setItems(prev => [...prev, ...newItems])
  }, [])

  // Add a common preset (disposal option / stump grind / etc.) as a line item.
  const insertPreset = useCallback((preset) => {
    if (!preset) return
    setItems(prev => [...prev, {
      id: uuid(), qty: 1, selected: true, images: [], image_url: null, detail: '',
      ...preset.item,
    }])
  }, [])

  // Apply a template: append its line items, and adopt its default terms if the
  // quote is still using the untouched default signature.
  const applyTemplate = useCallback(({ line_items, notes: tplNotes }) => {
    setItems(prev => [...prev, ...line_items])
    if (tplNotes) setNotes(prev => (!prev || prev === DEFAULT_SIGNATURE) ? tplNotes : prev)
  }, [])

  const updateItem = useCallback((updated) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
  }, [])

  const deleteItem = useCallback((itemId) => {
    setItems(prev => prev.filter(i => i.id !== itemId))
  }, [])

  // Spencers (DBS / Kāinga Ora) jobs get a per-line property-element location
  // picker (PE1 = Property Exterior 1, etc.) — mirrors the portal's location_id.
  const spencers = isSpencersJob(job)
  // Spencers-only (not Downer): the $320/hr cost-breakdown pricing is a Spencers
  // requirement for non-agreed-rate codes.
  const spencersOnly = jobCategory(job) === 'spencers'
  // Downer photos are stamped with the job address + date/time; Spencers are not.
  const downerJob = jobCategory(job) === 'downer'

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

  async function save(newStatus, openPreview = false) {
    setSaving(true)
    const userId = session?.user?.id ?? null
    const payload = {
      line_items: items, subtotal: totals.subtotal, gst: totals.gst, total: totals.total,
      notes, private_notes: privateNotes, job_pack: jobPack,
      ...(userId ? { updated_by: userId } : {}),
      ...(newStatus ? { status: newStatus } : {}),
      ...(newStatus === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    }
    // Graceful fallback if optional columns don't exist yet (migrations 007, 009, 019)
    const OPTIONAL_COLS = ['job_pack', 'private_notes', 'notes', 'valid_until', 'created_by', 'updated_by']
    async function tryUpsert(p, isInsert, insertMeta) {
      let res = isInsert
        ? await supabase.from('quotes').insert({ ...insertMeta, ...p }).select().single()
        : await supabase.from('quotes').update(p).eq('id', id)
      const errMsg = res.error?.message ?? ''
      if (OPTIONAL_COLS.some(c => errMsg.includes(c))) {
        const { job_pack: _jp, private_notes: _pn, notes: _n, updated_by: _ub, ...pFallback } = p
        const metaFallback = isInsert
          ? Object.fromEntries(Object.entries(insertMeta).filter(([k]) => !['valid_until', 'created_by'].includes(k)))
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
      const { data, error } = await tryUpsert(payload, true, { job_id: jobId, status: newStatus ?? 'draft', client_view_token: token, valid_until: validUntil, ...(userId ? { created_by: userId } : {}) })
      if (error) showToast(error.message, 'error')
      else if (data) { showToast('Quote created'); navigate(`/quotes/${data.id}`, { replace: true, state: openPreview ? { openPreview: true } : null }) }
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

  // Primary action everywhere: save, then show the client preview. The preview's
  // own "Send" button chains into the email draft (handleSendFromPreview).
  async function previewAndSend() {
    if (items.length === 0) { showToast('Add at least one line item first', 'error'); return }
    setShowMenu(false)
    if (isNew) { await save(undefined, true); return } // save() navigates; nav-state opens the preview
    await save()
    setShowPreview(true)
  }

  // From inside the preview → open the editable email draft.
  async function handleSendFromPreview() {
    await save()
    setShowPreview(false)
    setShowEmailModal(true)
  }

  async function markAsSent() {
    await save('sent')
    setShowEmailModal(false)
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
    // Status-only update — never resends line_items, so it can't be used to
    // slip an edit past the accepted-quote lock (see migration 020).
    setSaving(true)
    const { error } = await supabase.from('quotes')
      .update({ status: 'complete', updated_by: session?.user?.id ?? null })
      .eq('id', id)
    if (error) { showToast(error.message, 'error'); setSaving(false); return }
    if (quote?.job_id) {
      await supabase.from('jobs')
        .update({ status: 'complete_to_invoice', status_changed_at: new Date().toISOString() })
        .eq('id', quote.job_id)
    }
    const { data } = await supabase.from('quotes')
      .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
      .eq('id', id).single()
    if (data) { setQuote(data); setJob(data.jobs) }
    showToast('Marked complete')
    setSaving(false)
  }

  // Reopen a locked (accepted/complete/invoiced) quote for editing. Reverts to
  // "Sent"; the DB captures a version snapshot of the state being left behind.
  async function reopen() {
    if (!window.confirm(
      'Reopen this quote for editing?\n\nA snapshot of the accepted quote is saved to its version history first. It reverts to “Sent”, and the client can view it again on their link until you re-send.'
    )) return
    setSaving(true)
    const { error } = await supabase.from('quotes')
      .update({ status: 'sent', updated_by: session?.user?.id ?? null })
      .eq('id', id)
    if (error) { showToast(error.message, 'error'); setSaving(false); return }
    const { data } = await supabase.from('quotes')
      .select(`*, jobs (id, address, job_type, title, status, clients (id, name, email, phone))`)
      .eq('id', id).single()
    if (data) { setQuote(data); setJob(data.jobs) }
    showToast('Quote reopened for editing')
    setSaving(false)
  }

  // Push a sent/viewed quote's expiry out another 30 days.
  async function extendExpiry() {
    const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    setSaving(true)
    const { error } = await supabase.from('quotes')
      .update({ valid_until: next, updated_by: session?.user?.id ?? null })
      .eq('id', id)
    if (error) { showToast(error.message, 'error'); setSaving(false); return }
    setQuote(q => ({ ...q, valid_until: next }))
    showToast('Expiry extended 30 days')
    setSaving(false)
  }

  async function sendToXero() {
    if (!quote) return
    if (!window.confirm(
      'Raise this invoice in Xero?\n\nAn invoice is created in Xero and the job moves to “Invoiced” (out of the Complete — To Be Invoiced list).'
    )) return
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
      showToast(body.invoice_number
        ? `Invoice ${body.invoice_number} created in Xero — job moved to Invoiced ✓`
        : 'Invoice created in Xero — job moved to Invoiced ✓')
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

  async function sendEmail({ subject, message } = {}) {
    if (!quote) return
    setEmailLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-quote-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${session?.access_token ?? ANON}` },
        body: JSON.stringify({ quote_id: quote.id, subject, message }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Email failed')
      showToast(`Email sent to ${body.to} ✓`)
      setShowEmailModal(false)
      // Mark as sent if still a draft (this is the primary send action now)
      if (quote.status === 'draft') await save('sent')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setEmailLoading(false)
    }
  }

  async function sendSms() {
    if (!quote) return
    setSmsLoading(true)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({ quote_id: quote.id, kind: 'quote_link' }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.notConfigured ? 'SMS not set up yet — add Twilio keys in Settings' : (body.error ?? 'Text failed'))
      }
      showToast(`Quote link texted to ${body.to} ✓`)
      if (quote.status === 'draft') await save('sent')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSmsLoading(false)
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
  const clientEmail = quote?.jobs?.clients?.email
  const clientPhone = quote?.jobs?.clients?.phone
  const canEmail    = !!clientEmail && quote?.client_view_token && quote?.status !== 'draft'
  const canSms      = !!clientPhone && quote?.client_view_token && quote?.status !== 'draft'
  const canComplete = quote?.status === 'accepted'
  // Ready to invoice once the work is done — whether that was recorded on the
  // quote ('complete') or straight on the job from the pipeline
  // ('complete_to_invoice'). Either path surfaces the Xero button. Hidden once
  // an invoice already exists.
  const alreadyInvoiced = quote?.status === 'invoiced' || job?.status === 'invoiced'
  const canXero     = !isNew && !alreadyInvoiced &&
    (quote?.status === 'complete' || job?.status === 'complete_to_invoice')
  // Accepted/complete/invoiced quotes are frozen (enforced in migration 020).
  const locked      = !isNew && ['accepted', 'complete', 'invoiced'].includes(quote?.status)
  // Expiry awareness for live (sent/viewed) quotes.
  const awaiting    = ['sent', 'viewed'].includes(quote?.status)
  const expired     = awaiting && quote?.valid_until && new Date(quote.valid_until) < new Date(new Date().toDateString())

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
          <div style={s.hRight}>
            {!locked && (
              <button style={s.previewSendBtn} onClick={previewAndSend} disabled={saving}>
                {saving ? 'Saving…' : 'Preview & Send'}
              </button>
            )}

            {/* Once work is done, invoicing is the primary action — surfaced
                here (not buried in the menu) so it's one tap on a phone. */}
            {canXero && (
              <button style={s.xeroBtn} onClick={sendToXero} disabled={xeroLoading}>
                {xeroLoading ? 'Invoicing…' : '→ Invoice to Xero'}
              </button>
            )}

            {/* Everything else lives behind the ☰ menu. */}
            <div style={{ position: 'relative' }}>
              <button style={s.menuBtn} onClick={() => setShowMenu(v => !v)} aria-label="More options" aria-expanded={showMenu}>☰</button>
              {showMenu && (
                <>
                  <div style={s.menuBackdrop} onClick={() => setShowMenu(false)} />
                  <div style={s.menu}>
                    {!locked && <button style={s.menuItem} onClick={() => { setShowMenu(false); save() }} disabled={saving}>💾 Save</button>}
                    <button style={s.menuItem} onClick={async () => { setShowMenu(false); await save(); setShowPreview(true) }} disabled={saving}>👁 Preview only</button>
                    {!locked && <button style={s.menuItem} onClick={() => { setShowMenu(false); setShowLibrary(true) }}>📚 Library</button>}
                    {quote?.client_view_token && (
                      <button style={s.menuItem} onClick={async () => { setShowMenu(false); await save(); window.open(`${window.location.origin}/q/${quote.client_view_token}?download=1&preview=1`, '_blank') }} disabled={saving}>⬇ Download PDF</button>
                    )}
                    {canEmail && <button style={s.menuItem} onClick={() => { setShowMenu(false); setShowEmailModal(true) }}>✉ Email quote</button>}
                    {canSms && <button style={s.menuItem} onClick={() => { setShowMenu(false); sendSms() }} disabled={smsLoading}>💬 Text quote link</button>}
                    {canComplete && <button style={s.menuItem} onClick={() => { setShowMenu(false); markComplete() }}>✓ Mark complete</button>}
                    {/* Invoice to Xero is now a primary header button (see above). */}
                    {locked && <button style={s.menuItem} onClick={() => { setShowMenu(false); reopen() }}>🔓 Reopen to edit</button>}
                    {!isNew && quote && (
                      <div style={s.menuStatus}>
                        <div style={s.menuStatusLabel}>Set status</div>
                        <div style={s.menuStatusRow}>
                          {['draft', 'sent', 'viewed', 'accepted', 'declined'].map(k => (
                            <button key={k} disabled={k === quote.status || saving}
                              onClick={() => { setShowMenu(false); save(k) }}
                              style={{ ...s.statusPill, ...(k === quote.status ? s.statusPillActive : {}) }}>
                              {ST[k].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Body ── single column, phone-first ── */}
        <div style={s.body}>
          <div style={s.main}>

            {/* Locked banner — accepted/complete/invoiced quotes are frozen */}
            {locked && (
              <div style={s.lockBanner}>
                <span style={{ fontSize: 18 }}>🔒</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--bark)', fontSize: 14 }}>
                    This quote is {ST[quote.status]?.label?.toLowerCase() ?? quote.status} and locked
                  </div>
                  <div style={{ fontSize: 12.5, color: '#8A857D', marginTop: 2 }}>
                    Pricing, line items and terms can’t be changed. Reopen it to edit — the accepted version is saved to history first.
                  </div>
                </div>
                <button style={s.reopenBtn} onClick={reopen} disabled={saving}>Reopen to edit</button>
              </div>
            )}

            {/* Signature record on accepted quotes */}
            {locked && quote?.signed_name && (
              <div style={s.signedNote}>✍ Signed by <strong>{quote.signed_name}</strong>{quote.responded_at ? ` on ${new Date(quote.responded_at).toLocaleDateString('en-NZ')}` : ''}</div>
            )}

            {/* Expiry — for live quotes awaiting a response */}
            {awaiting && quote?.valid_until && (
              <div style={{ ...s.expiryBanner, ...(expired ? s.expiryBannerExpired : null) }}>
                <span>{expired ? '⏳' : '🗓'}</span>
                <span style={{ flex: 1 }}>
                  {expired
                    ? <>This quote <strong>expired</strong> on {new Date(quote.valid_until).toLocaleDateString('en-NZ')}.</>
                    : <>Valid until <strong>{new Date(quote.valid_until).toLocaleDateString('en-NZ')}</strong>.</>}
                </span>
                <button style={s.reopenBtn} onClick={extendExpiry} disabled={saving}>Extend 30 days</button>
              </div>
            )}

            {/* Activity timeline — Quotient-style Overview / All Activity feed */}
            {!isNew && quote && <QuoteActivity quote={quote} owners={owners} />}

            {/* Version history — appears once a quote has been accepted/reopened */}
            {!isNew && <QuoteVersionHistory quoteId={id} refreshKey={quote?.status} />}

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

            {/* Line items — the focus of the screen on mobile */}
            <div style={{ ...s.card, ...s.itemsCard }}>
              <div style={s.cardTitle}>Line items</div>
              <div style={s.gstNote}>
                💡 Enter prices <strong>ex GST</strong> — line totals are shown <strong>incl GST</strong> (15%)
              </div>

              <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                    {items.map(item => (
                      <LineItem key={item.id} item={item} onChange={updateItem} onDelete={deleteItem} onMarkup={setMarkupItem} spencers={spencers} spencersOnly={spencersOnly} sitePhotos={sitePhotos[item.id]} stampAddress={downerJob ? (job?.address || '') : null} />
                    ))}
                  </div>
                </SortableContext>
                <DragOverlay>
                  {activeItem && <LineItem item={activeItem} onChange={() => {}} onDelete={() => {}} spencers={spencers} spencersOnly={spencersOnly} sitePhotos={sitePhotos[activeItem.id]} stampAddress={downerJob ? (job?.address || '') : null} />}
                </DragOverlay>
              </DndContext>

              {items.length === 0 && <div style={s.emptyItems}>No items yet</div>}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
                <button style={s.addBtn} onClick={addItem}>+ Add line item</button>
                <select
                  style={s.presetSelect}
                  value=""
                  onChange={e => {
                    const all = [...WORK_PRESETS, ...DISPOSAL_PRESETS]
                    insertPreset(all.find(p => p.key === e.target.value))
                    e.target.value = ''
                  }}
                >
                  <option value="">+ Common item…</option>
                  <optgroup label="Works">
                    {WORK_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </optgroup>
                  <optgroup label="Disposal / material">
                    {DISPOSAL_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </optgroup>
                </select>
              </div>
              <div style={s.formatHint}>
                💡 Title = location (e.g. front yard). In the details, the first line — the tree name or group — shows in <strong>bold</strong>, and every line after it becomes a bullet automatically. No need to type dashes or asterisks.
              </div>
            </div>

            {/* Summary + primary action, right under the line items */}
            <div style={s.totalsCard}>
              <div style={s.cardTitle}>Summary</div>
              {optionalTotal > 0 && (
                <div style={s.optNote}>✱ Optional items included — client can tick to add or remove</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {optionalTotal > 0 && (
                  <div style={{ ...s.tRow, borderBottom: '1px dashed var(--border)', paddingBottom: '8px' }}>
                    <span>Options selected</span>
                    <span style={{ fontWeight: '700', color: 'var(--terra)' }}>{optionalSelected} of {optionalTotal}</span>
                  </div>
                )}
                <div style={s.tRow}><span>Subtotal (ex GST)</span><span>{nzd(totals.subtotal)}</span></div>
                <div style={s.tRow}><span>GST (15%)</span><span>{nzd(totals.gst)}</span></div>
                <div style={{ ...s.tRow, ...s.tBig }}><span>Total (incl GST)</span><span>{nzd(totals.total)}</span></div>
              </div>
              {!locked && (
                <button style={s.previewSendBig} onClick={previewAndSend} disabled={saving}>
                  {saving ? 'Saving…' : 'Preview & Send →'}
                </button>
              )}
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
                          borderColor: jobPack.chipper === v ? '#4A6741' : 'var(--border)',
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
                            borderColor: active ? '#4A6741' : 'var(--border)',
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
                            borderColor: active ? '#4A6741' : 'var(--border)',
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
                      border: `1.5px solid ${jobPack.difficulty === n ? DIFF_COLORS[n] : 'var(--border)'}`,
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
                    <label key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--ink)' }}>
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

            {/* Discussion — at the very bottom of the page. Allows image
                attachments; internal notes never reach the client. */}
            {!isNew && <QuoteComments quoteId={id} />}
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
          onSend={handleSendFromPreview}
          saving={saving}
        />
      )}

      {/* Quote library — reusable templates + price-item library */}
      <QuoteLibraryModal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        items={items}
        notes={notes}
        userId={session?.user?.id ?? null}
        onInsertItems={insertItems}
        onApplyTemplate={applyTemplate}
      />

      {/* Compose + send email — the primary send action */}
      {showEmailModal && quote && (
        <ComposeEmailModal
          quote={quote}
          onClose={() => setShowEmailModal(false)}
          onSend={sendEmail}
          sending={emailLoading}
          onMarkSent={markAsSent}
          saving={saving}
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
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cream)' },
  header: {
    background: '#fff', borderBottom: '1px solid var(--border)', padding: '12px 20px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexShrink: 0,
  },
  hLeft: { display: 'flex', alignItems: 'center', gap: '10px' },
  hRight: { display: 'flex', alignItems: 'center', gap: '8px' },
  iconBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px' },
  backBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  title: { fontSize: '16px', fontWeight: '700', color: 'var(--ink)' },
  sub: { fontSize: '11px', color: '#aaa' },
  badge: { fontSize: '11px', fontWeight: '600', borderRadius: '20px', padding: '3px 10px' },
  previewBtn: {
    background: 'none', border: '1.5px solid var(--terra)', borderRadius: '7px', padding: '7px 14px',
    fontSize: '13px', fontWeight: '600', color: 'var(--terra)', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  pdfBtn: { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 12px', fontSize: '13px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)' },
  saveBtn: { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)' },
  lockBanner: { display: 'flex', alignItems: 'center', gap: 12, background: '#FBF6EC', border: '1px solid #E7D9BC', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16 },
  reopenBtn: { background: '#fff', border: '1px solid var(--terra)', color: 'var(--terra)', borderRadius: '7px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap', flexShrink: 0 },
  signedNote: { fontSize: '12.5px', color: '#4A6741', background: '#EDF3EA', border: '1px solid #D3E2CB', borderRadius: 'var(--radius)', padding: '9px 12px', marginBottom: 16 },
  expiryBanner: { display: 'flex', alignItems: 'center', gap: 10, background: '#F6FAF4', border: '1px solid #D8EBD0', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: '13px', color: 'var(--bark)' },
  expiryBannerExpired: { background: '#FFF0EE', border: '1px solid #F0C0B8' },
  sendBtn: { background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  // Primary "Preview & Send" in the header
  previewSendBtn: { background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  xeroBtn: { background: '#13B5EA', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  // ☰ hamburger
  menuBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 12px', fontSize: '17px', lineHeight: 1, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)' },
  menuBackdrop: { position: 'fixed', inset: 0, zIndex: 40 },
  menu: { position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 10px 30px rgba(0,0,0,0.14)', padding: '6px', minWidth: '210px', display: 'flex', flexDirection: 'column', gap: '2px' },
  menuItem: { textAlign: 'left', background: 'none', border: 'none', borderRadius: '7px', padding: '10px 12px', fontSize: '13.5px', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%' },
  menuStatus: { borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '8px' },
  menuStatusLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 6px 6px' },
  menuStatusRow: { display: 'flex', flexWrap: 'wrap', gap: '5px', padding: '0 6px 4px' },
  statusPill: { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: '14px', padding: '4px 10px', fontSize: '12px', fontWeight: '600', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  statusPillActive: { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)', cursor: 'default' },
  emailBtn: { background: '#EBF3FA', color: '#4A7FA5', border: '1.5px solid #4A7FA5', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  completeBtn: { background: '#E6F4EC', color: '#1A7A4A', border: '1.5px solid #1A7A4A', borderRadius: '7px', padding: '7px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  xeroBtn: { background: '#1A7A4A', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  // Single column, centred with a comfortable reading width on desktop
  body: { flex: 1, overflowY: 'auto', padding: '16px 16px 88px', display: 'flex', justifyContent: 'center' },
  main: { flex: 1, width: '100%', maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 },
  itemsCard: { padding: '14px' },
  previewSendBig: { width: '100%', marginTop: '14px', background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '10px', padding: '14px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
  card: { background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', padding: '16px 18px' },
  cardTitle: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' },
  gstNote: { fontSize: '12px', color: '#666', background: '#EBF3FA', borderRadius: '6px', padding: '8px 12px', lineHeight: 1.5 },
  select: { width: '100%', padding: '9px 10px', borderRadius: '7px', border: '1.5px solid var(--border)', fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--ink)' },
  emptyItems: { textAlign: 'center', color: '#ccc', padding: '24px 0', fontSize: '13px' },
  addBtn: { background: 'none', border: '1px dashed var(--border)', borderRadius: '7px', padding: '10px', fontSize: '13px', color: 'var(--terra)', cursor: 'pointer', fontFamily: 'var(--font)', flex: '1 1 200px', fontWeight: '600' },
  presetSelect: { background: '#fff', border: '1px solid var(--border)', borderRadius: '7px', padding: '10px', fontSize: '13px', color: 'var(--ink)', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: '600', flex: '0 1 auto' },
  formatHint: { marginTop: '10px', fontSize: '11.5px', color: 'var(--ink-3)', lineHeight: 1.5 },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1.5px solid var(--border)', fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--ink)', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 },
  totalsCard: { background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', padding: '16px 18px' },
  optNote: { fontSize: '11px', color: '#D4851A', background: '#FDF3E3', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' },
  tRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' },
  tBig: { fontSize: '16px', fontWeight: '700', color: 'var(--ink)', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '4px' },
  linkBox: { marginTop: '14px', padding: '10px', background: 'var(--cream)', borderRadius: '8px', border: '1px solid var(--border)' },
  copyBtn: { background: '#4A7FA5', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', width: '100%' },
  metaCard: { background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', padding: '16px 18px' },
  metaLine: { fontSize: '13px', color: '#888' },
  toast: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', zIndex: 9999 },
}

// ── Line item builder styles ──
const b = {
  lineCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  lineHandle: { width: '26px', background: '#FAFAFA', borderRight: '1px solid var(--border)', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, userSelect: 'none', touchAction: 'none' },
  lineBody: { flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' },
  lineTitle: { padding: '7px 9px', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--ink)', fontWeight: '500', boxSizing: 'border-box' },
  lineDetail: { width: '100%', padding: '6px 9px', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', color: '#666', resize: 'vertical', boxSizing: 'border-box' },
  detailPreview: { background: '#FAFAF7', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: 'var(--bark)', lineHeight: 1.5 },
  detailPreviewLabel: { fontSize: '9.5px', fontWeight: '700', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' },
  previewTitle: { fontWeight: '700', color: 'var(--bark)', marginBottom: '2px' },
  previewBullet: { display: 'flex', gap: '6px', alignItems: 'flex-start' },
  previewDot: { color: 'var(--terra)', flexShrink: 0 },
  previewLine: { marginBottom: '1px' },
  linePrice: { display: 'flex', alignItems: 'flex-end', gap: '14px', paddingTop: '8px', borderTop: '1px solid #f5f5f5', flexWrap: 'wrap' },
  priceCol: { display: 'flex', flexDirection: 'column', gap: '3px' },
  priceLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase' },
  priceDollar: { position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#aaa', fontSize: '12px', pointerEvents: 'none' },
  priceInput: { padding: '7px 8px 7px 20px', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--ink)', width: '110px', textAlign: 'right' },
  priceLocked: { background: '#F3F1EC', color: '#999', cursor: 'not-allowed' },
  // Before / During / After photo labelling (Spencers/Downer)
  phaseWrap: { display: 'flex', flexDirection: 'column', gap: '8px' },
  phaseRow: { display: 'flex', flexDirection: 'column', gap: '5px' },
  phaseLabel: { fontSize: '11px', fontWeight: '700', color: '#6D4AA8', textTransform: 'uppercase', letterSpacing: '0.04em' },
  phaseHint: { fontWeight: '500', color: '#A99CC0', textTransform: 'none', letterSpacing: 0 },
  phaseThumbs: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  phaseThumb: { width: 64, height: 48, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' },
  phaseEmpty: { fontSize: '12px', color: '#bbb', fontStyle: 'italic' },
  // Spencers cost breakdown ($320/hr)
  breakdownBox: { marginTop: '4px', padding: '10px 12px', background: '#F7F4FB', border: '1px solid #E4DCF0', borderRadius: '8px' },
  breakdownToggle: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: '600', color: '#6D4AA8', cursor: 'pointer' },
  breakdownNote: { fontWeight: '500', color: '#A99CC0' },
  breakdownBody: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' },
  breakdownRate: { fontSize: '12px', color: '#8A7CA8', fontWeight: '600' },
  breakdownPreview: { flexBasis: '100%', marginTop: '6px', fontSize: '12px', color: 'var(--ink)', background: '#fff', border: '1px solid #E4DCF0', borderRadius: '6px', padding: '7px 10px', lineHeight: 1.5 },
  lineTotal: { fontSize: '15px', fontWeight: '700', color: 'var(--ink)', transition: 'opacity 0.2s' },
  lineTotalEx: { fontSize: '10px', color: '#aaa' },
  removeBtn: { background: 'none', border: 'none', color: '#C0392B', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font)', padding: '3px 6px' },
  // Fixed / Optional segmented control
  locationRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  locationLabel: { fontSize: '9.5px', fontWeight: '700', color: '#6D4AA8', textTransform: 'uppercase', letterSpacing: '0.05em' },
  locationSelect: { padding: '5px 8px', borderRadius: '6px', border: '1.5px solid #6D4AA8', fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--bark)', background: '#fff', minWidth: '190px' },
  locationChip: { fontSize: '11px', fontWeight: '700', color: '#fff', background: '#6D4AA8', borderRadius: '4px', padding: '2px 7px', letterSpacing: '0.03em' },
  segCol: { display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, alignItems: 'flex-end' },
  segLabel: { fontSize: '9.5px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  segWrap: { display: 'flex', borderRadius: '7px', border: '1.5px solid var(--border)', overflow: 'hidden', flexShrink: 0 },
  seg: { padding: '6px 11px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', border: 'none', background: 'transparent', color: '#aaa', transition: 'all 0.15s' },
  segActiveFixed: { background: 'var(--ink)', color: '#fff' },
  segActiveOpt: { background: '#D4851A', color: '#fff' },
  // Client-style optional checkbox preview (mirrors QuoteView)
  optClientRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', background: '#FDF9F0', borderRadius: '7px', border: '1px solid #F5C842' },
  optClientLabel: { fontSize: '11px', color: '#B8860B', fontWeight: '700', whiteSpace: 'nowrap' },
  optClientHint: { fontSize: '11.5px', color: '#8A857D', fontWeight: '500' },
  optCheckbox: {
    width: '24px', height: '24px', flexShrink: 0, borderRadius: '6px',
    border: '2px solid var(--terra)', background: '#fff', color: 'var(--terra)',
    fontSize: '14px', fontWeight: '800', lineHeight: 1, cursor: 'pointer',
    fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  optCheckboxOn: { background: 'var(--terra)', color: '#fff', boxShadow: '0 2px 6px rgba(74,103,65,0.25)' },
  // Disposal / Grindings add-on groups
  addonGroups: { display: 'flex', flexDirection: 'column', gap: '6px' },
  addonWrap: { border: '1px solid var(--border)', borderRadius: '8px', background: '#FAFAF7', overflow: 'hidden' },
  addonHead: { width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left' },
  addonLabel: { fontSize: '11px', fontWeight: '700', color: '#8A857D', textTransform: 'uppercase', letterSpacing: '0.05em' },
  addonCount: { fontSize: '11px', color: 'var(--terra)', fontWeight: '600' },
  addonChevron: { marginLeft: 'auto', fontSize: '11px', color: '#bbb' },
  addonBody: { padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--border)' },
  addonRow: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  addonChip: { padding: '6px 12px', borderRadius: '16px', border: '1.5px solid var(--border)', background: '#fff', color: '#8A857D', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  addonChipOn: { background: '#EDF3EA', borderColor: 'var(--terra)', color: 'var(--terra)' },
  addonPlus: { fontSize: '12px', color: '#aaa' },
  addonPriceInput: { width: '68px', padding: '5px 7px', borderRadius: '6px', border: '1.5px solid var(--border)', fontSize: '12px', fontFamily: 'var(--font)', color: 'var(--ink)', textAlign: 'right' },
  addonDefault: { padding: '4px 9px', borderRadius: '12px', border: '1px solid var(--border)', background: '#fff', color: '#aaa', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  addonDefaultOn: { background: '#FDF3E3', borderColor: '#D4851A', color: '#D4851A' },
  addonNote: { fontSize: '11px', color: '#A8A29A', fontStyle: 'italic' },
}

// ── Preview styles ──
const pv = {
  overlay: { position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#1C1C1E' },
  bar: {
    background: 'var(--ink)', padding: '12px 24px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
  },
  backBtn: { background: 'none', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontFamily: 'var(--font)' },
  sendBtn: { background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '7px', padding: '8px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  iframe: { flex: 1, border: 'none', width: '100%' },
  barLeft: { display: 'flex', alignItems: 'center', gap: '12px' },
  barRight: { display: 'flex', gap: '10px' },
  continueBtn: { background: 'none', border: '1.5px solid var(--terra)', borderRadius: '7px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', color: 'var(--terra)', cursor: 'pointer', fontFamily: 'var(--font)' },
  page: { flex: 1, overflow: 'auto', padding: '32px 20px 60px' },
  doc: { width: '100%', minWidth: '680px', maxWidth: '780px', margin: '0 auto', background: '#fff', borderRadius: '4px', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', overflow: 'hidden' },
  letterhead: { background: 'var(--ink)', color: '#fff', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoMark: { display: 'flex', alignItems: 'center', gap: '12px' },
  companyName: { fontSize: '18px', fontWeight: '700' },
  companyTag: { fontSize: '11px', opacity: 0.6, marginTop: '2px' },
  docMeta: { textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' },
  metaRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', fontSize: '12px' },
  metaLbl: { opacity: 0.6 },
  divider: { height: '3px', background: 'var(--terra)' },
  parties: { display: 'flex', justifyContent: 'space-between', padding: '24px 32px', borderBottom: '1px solid var(--border)' },
  partyLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  partyName: { fontSize: '15px', fontWeight: '700', color: 'var(--ink)', marginBottom: '4px' },
  partyDetail: { fontSize: '12px', color: '#666', lineHeight: 1.7 },
  jobHeading: { padding: '20px 32px 12px', fontSize: '20px', fontWeight: '800', color: 'var(--ink)', letterSpacing: '-0.3px', borderBottom: '1px solid var(--border)' },
  itemsTable: { padding: '0 32px 16px' },
  tableHeader: {
    display: 'flex', gap: '12px', padding: '10px 0',
    fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase',
    borderBottom: '2px solid var(--border)', marginTop: '8px',
  },
  tableRow: { display: 'flex', gap: '12px', padding: '14px 0', borderBottom: '1px solid #F0EDE8', alignItems: 'flex-start' },
  rowTitle: { fontSize: '14px', fontWeight: '600', color: 'var(--ink)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  rowDetail: { fontSize: '12px', color: '#666', lineHeight: 1.6, marginBottom: '8px', whiteSpace: 'pre-wrap' },
  rowImg: { width: '120px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)', marginTop: '8px' },
  optBadge: { fontSize: '10px', background: '#FDF3E3', color: '#D4851A', borderRadius: '10px', padding: '2px 8px', fontWeight: '600', border: '1px solid #FAE8CC' },
  totals: { display: 'flex', justifyContent: 'flex-end', padding: '0 32px 24px' },
  totalsInner: { width: '280px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#FAFAF9', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px' },
  totalRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' },
  totalRowBig: { fontSize: '18px', fontWeight: '800', color: 'var(--ink)', borderTop: '2px solid var(--border)', paddingTop: '10px', marginTop: '4px' },
  gstNote: { fontSize: '10px', color: '#aaa', textAlign: 'right', marginTop: '4px' },
  notesSection: { padding: '20px 32px', borderTop: '1px solid var(--border)' },
  notesTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--ink)', marginBottom: '8px' },
  notesBody: { fontSize: '13px', color: '#555', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' },
  footer: { background: 'var(--ink)', color: 'rgba(255,255,255,0.5)', padding: '14px 32px', fontSize: '11px', textAlign: 'center' },
}
