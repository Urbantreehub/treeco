import { useMemo, useState } from 'react'
import { Lightbox } from './QuoteReference'
import { GST, lineSubtotal } from '../utils/pricing'
import { nzd, lineImages, lineSorCode, lineTitle, crewPackChips } from '../utils/quotes'

// The quote description as a list of line items: thumbnails on the LEFT (the
// quoter's photos from the line plus any crew job_photos tagged to the line),
// title + detail bullets, SOR / quotable chips, price on the right. Job-level
// crew photos (no line_ref) land in a "Site photos" strip below the lines.
//
//   quote     the primary quote row (line_items, job_pack, notes, …) or null
//   photos    job_photos rows for the job [{ id, url, caption, phase, line_ref }]
//   portal    Spencers / Downer job → SOR chips and the quotable pre-approval chip
//   onEdit    open the quote builder (shown when there are no lines yet)

const SPENCERS = '#6D4AA8'
const PHASE_LABEL = { before: 'Before', during: 'During', after: 'After', extra: 'Extra' }

function bullets(detail) {
  return String(detail || '')
    .split('\n')
    .map(l => l.replace(/^\s*[-•·*]\s*/, '').trim())
    .filter(Boolean)
}

export default function QuoteLines({ quote, photos = [], portal = false, onEdit, compact = false }) {
  const [lightbox, setLightbox] = useState(null)

  const items = useMemo(() => {
    const raw = Array.isArray(quote?.line_items) ? quote.line_items : []
    return [...raw].sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0))
  }, [quote])

  const byLine = useMemo(() => {
    const map = {}
    for (const p of photos ?? []) {
      if (!p?.url || !p.line_ref) continue
      ;(map[p.line_ref] ??= []).push(p)
    }
    return map
  }, [photos])

  const sitePhotos = useMemo(
    () => (photos ?? []).filter(p => p?.url && !p.line_ref && ['before', 'during', 'after', 'extra'].includes(p.phase)),
    [photos]
  )

  const chips = crewPackChips(quote?.job_pack)
  const terms = (quote?.notes || '').split('\n').map(l => l.trim()).find(Boolean) ?? null
  const gap = compact ? 10 : 14

  return (
    <div>
      <div style={st.head}>
        <span style={st.eyebrow}>Quote description{portal ? ' · SOR schedule of rates' : ''}</span>
        <span style={st.hint}>
          {portal ? 'Portal photos: Before / During / After per line' : 'Photos sit on their line · tap to open'}
        </span>
      </div>

      {items.length === 0 ? (
        <div style={st.empty}>
          <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{quote ? 'No line items yet.' : 'No quote yet.'}</div>
          <div style={{ marginTop: 4 }}>The description and prices will appear here once the quote has lines.</div>
          {onEdit && (
            <button type="button" onClick={onEdit} style={st.emptyBtn}>{quote ? 'Edit quote' : 'Write quote'}</button>
          )}
        </div>
      ) : items.map((item, idx) => {
        const imgs = lineImages(item).map(url => ({ url, label: null }))
        const crew = (byLine[item.id] ?? []).map(p => ({ url: p.url, label: PHASE_LABEL[p.phase] ?? null }))
        const thumbs = [...imgs, ...crew]
        const sor = portal ? lineSorCode(item) : null
        const quotable = portal && !sor && (item.quotable === true || item.sor !== true)
        const ex = lineSubtotal(item)
        const incl = item.price_incl != null ? Number(item.price_incl) : ex * (1 + GST)
        const off = item.optional && !item.selected
        const det = bullets(item.detail)
        return (
          <div key={item.id ?? idx} style={{
            ...st.line, gap,
            borderTopStyle: item.optional ? 'dashed' : 'solid',
            ...(quotable ? st.lineQuotable : {}),
          }}>
            <Thumbs thumbs={thumbs} onOpen={setLightbox} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {item.optional && <span style={st.optional}>Optional{item.selected ? ' · in' : ' · out'}</span>}
                {sor && <span style={st.sor}>{sor.startsWith('SOR') ? sor : `SOR ${sor}`}</span>}
                {quotable && <span style={st.quotable}>Quotable · pre-approval</span>}
                <b style={st.title}>{lineTitle(item)}</b>
              </div>
              {det.length > 0 && (
                <div style={st.detail}>
                  {det.map((l, i) => <div key={i}>• {l}</div>)}
                </div>
              )}
              {item.breakdown && <div style={st.breakdown}>{item.breakdown}</div>}
              {(Number(item.qty) > 1) && (
                <div style={st.qty}>{item.qty} × {nzd(item.rate, { cents: true })} ex GST</div>
              )}
            </div>
            <div style={{ ...st.price, color: off ? 'var(--ink-3)' : 'var(--ink)' }}>
              {nzd(portal ? ex : incl)}
              {portal && <div style={st.priceSub}>ex GST</div>}
            </div>
          </div>
        )
      })}

      {sitePhotos.length > 0 && (
        <div style={st.siteWrap}>
          <div style={st.eyebrow}>Site photos <span style={st.faint}>· {sitePhotos.length} from the crew</span></div>
          <div style={st.siteStrip}>
            {sitePhotos.map(p => (
              <button key={p.id ?? p.url} type="button" onClick={() => setLightbox(p.url)} style={st.siteBtn} title={p.caption || PHASE_LABEL[p.phase]}>
                <img src={p.url} alt={p.caption || PHASE_LABEL[p.phase] || 'site photo'} style={st.siteImg} loading="lazy" />
                {PHASE_LABEL[p.phase] && <span style={st.siteTag}>{PHASE_LABEL[p.phase]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {(chips.length > 0 || terms || quote?.valid_until) && (
        <div style={st.foot}>
          {chips.length > 0 && <span style={st.chip}>Crew pack: {chips.join(' · ')}</span>}
          {terms && <span style={st.chip} title={quote.notes}>Terms: {terms.length > 48 ? terms.slice(0, 48) + '…' : terms}</span>}
          <span style={{ flex: 1 }} />
          {quote?.valid_until && (
            <span style={st.faint}>Valid to {new Date(quote.valid_until).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}</span>
          )}
        </div>
      )}

      <Lightbox url={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}

function Thumbs({ thumbs, onOpen }) {
  if (thumbs.length === 0) return <div style={st.thNone}>no photo</div>
  const shown = thumbs.slice(0, 2)
  const more = thumbs.length - shown.length
  const one = shown.length === 1
  return (
    <div style={st.th}>
      {shown.map((t, i) => (
        <button key={t.url + i} type="button" onClick={() => onOpen(t.url)} style={{ ...st.thBtn, ...(one ? st.thBtnOne : {}) }} title={t.label || 'Open photo'}>
          <img src={t.url} alt={t.label || 'line photo'} style={st.thImg} loading="lazy" />
          {t.label && <span style={st.thTag}>{t.label}</span>}
          {i === shown.length - 1 && more > 0 && <span style={st.thMore}>+{more}</span>}
        </button>
      ))}
    </div>
  )
}

const st = {
  head: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', flex: 1 },
  hint: { fontSize: 11, color: 'var(--ink-3)' },
  faint: { fontSize: 11, color: 'var(--ink-3)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
  empty: {
    border: '1.5px dashed var(--line)', borderRadius: 'var(--radius-ctrl)', padding: '16px 18px',
    fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4, background: 'var(--cream)',
  },
  emptyBtn: {
    marginTop: 10, height: 40, padding: '0 16px', borderRadius: 'var(--radius-ctrl)',
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 13,
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  line: {
    display: 'grid', gridTemplateColumns: '96px 1fr auto', alignItems: 'start',
    padding: '10px 0', borderTop: '1px solid var(--line)',
  },
  lineQuotable: { background: 'var(--terra-wash)', margin: '0 -8px', padding: '10px 8px', borderRadius: 10 },
  th: { display: 'flex', gap: 4, width: 96 },
  thBtn: {
    position: 'relative', width: 46, height: 46, padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden',
    background: 'var(--cream)', cursor: 'zoom-in', flexShrink: 0,
  },
  thBtnOne: { width: 96, height: 48 },
  thImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thTag: {
    position: 'absolute', left: 3, bottom: 3, fontSize: 9, fontWeight: 700, color: '#fff',
    background: 'rgba(34,56,79,.75)', borderRadius: 4, padding: '1px 4px', lineHeight: 1.2,
  },
  thMore: {
    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(34,56,79,.55)', color: '#fff', fontSize: 12, fontWeight: 800,
  },
  thNone: {
    width: 96, height: 36, border: '1.5px dashed var(--line)', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--ink-3)', fontWeight: 600,
  },
  title: { fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.3 },
  detail: { marginTop: 3, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.45 },
  breakdown: { marginTop: 3, fontSize: 11.5, color: 'var(--ink-3)', fontStyle: 'italic' },
  qty: { marginTop: 3, fontSize: 11, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' },
  price: { fontWeight: 800, fontSize: 15, letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' },
  priceSub: { fontSize: 10, fontWeight: 600, color: 'var(--ink-3)' },
  optional: { display: 'inline-flex', borderRadius: 999, padding: '2px 8px', fontSize: 10.5, fontWeight: 700, background: 'var(--terra-wash)', color: 'var(--terra)' },
  sor: {
    display: 'inline-block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10.5, fontWeight: 700,
    background: '#F0EAF8', color: SPENCERS, borderRadius: 5, padding: '1px 6px',
  },
  quotable: { display: 'inline-block', fontSize: 10.5, fontWeight: 700, background: '#fff', color: 'var(--terra)', border: '1px solid var(--terra-soft)', borderRadius: 5, padding: '1px 6px' },
  siteWrap: { marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' },
  siteStrip: { display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 2, WebkitOverflowScrolling: 'touch' },
  siteBtn: { position: 'relative', width: 84, height: 64, flexShrink: 0, padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden', background: 'var(--cream)', cursor: 'zoom-in' },
  siteImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  siteTag: { position: 'absolute', left: 4, bottom: 4, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(34,56,79,.75)', borderRadius: 4, padding: '1px 5px' },
  foot: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' },
  chip: {
    display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600,
    border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)',
  },
}
