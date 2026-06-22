import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { downloadPdf } from '../utils/downloadPdf'

const GST_RATE = 0.15

function nzd(v) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function calcTotals(items) {
  const subtotal = items
    .filter(i => !i.optional || i.selected)
    .reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
  const gst = subtotal * GST_RATE
  return { subtotal, gst, total: subtotal + gst }
}

export default function QuoteView() {
  const { token } = useParams()
  const searchParams = new URLSearchParams(window.location.search)
  const isPreview = searchParams.get('preview') === '1'
  const isDownload = searchParams.get('download') === '1'
  const [quote, setQuote] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [responded, setResponded] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const quoteRef = useRef(null)
  const [responding, setResponding] = useState(false)
  const [declineStep, setDeclineStep] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [response, setResponse] = useState(null)

  useEffect(() => {
    supabase
      .from('quotes')
      .select(`*, jobs (id, address, job_type, title, clients (name, email, phone))`)
      .eq('client_view_token', token)
      .single()
      .then(({ data }) => {
        if (!data) { setNotFound(true); setLoading(false); return }
        setQuote(data)
        setItems((data.line_items ?? []).map(i => ({ ...i })))
        // In preview mode never lock the respond state — allow full interaction
        if (!isPreview && (data.status === 'accepted' || data.status === 'declined')) {
          setResponded(true)
          setResponse(data.status)
        }
        if (data.status === 'sent') {
          supabase.from('quotes')
            .update({ status: 'viewed', viewed_at: new Date().toISOString() })
            .eq('id', data.id)
        }
        setLoading(false)
      })
  }, [token])

  // Auto-trigger PDF download when ?download=1
  useEffect(() => {
    if (isDownload && !loading && quoteRef.current) {
      const timer = setTimeout(() => handleDownload(), 800)
      return () => clearTimeout(timer)
    }
  }, [isDownload, loading])

  const toggleOptional = (itemId) => {
    if (responded) return
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, selected: !i.selected } : i))
  }

  const totals = calcTotals(items)

  async function respond(action, reason = '') {
    setResponding(true)
    const now = new Date().toISOString()
    const newStatus = action === 'accept' ? 'accepted' : 'declined'
    await supabase.from('quotes').update({
      status: newStatus,
      responded_at: now,
      ...(reason ? { decline_reason: reason } : {}),
    }).eq('client_view_token', token)
    if (action === 'accept') {
      await supabase.from('jobs')
        .update({ status: 'accepted_to_schedule', status_changed_at: now })
        .eq('id', quote.job_id)
    }
    setResponding(false)
    setResponded(true)
    setResponse(newStatus)
    setDeclineStep(false)
  }

  if (loading) {
    return (
      <div style={p.loadWrap}>
        <div style={p.loadSpinner}>🌲</div>
        <div style={p.loadText}>Loading your quote…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={p.loadWrap}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌲</div>
        <div style={{ fontSize: '16px', color: '#888' }}>Quote not found or link has expired.</div>
        <div style={{ fontSize: '13px', color: '#bbb', marginTop: '6px' }}>Please contact us for assistance.</div>
      </div>
    )
  }

  const client = quote.jobs?.clients
  const firstName = client?.name?.split(' ')[0] ?? 'there'
  const hasOptional = items.some(i => i.optional)
  const optionalSelected = items.filter(i => i.optional && i.selected).length
  const quoteDisplayRef = quote.id.slice(-6).toUpperCase()

  // Parse notes into body and signature (split on the signature line)
  const notes = quote.notes ?? ''

  async function handleDownload() {
    setDownloading(true)
    const filename = `Quote-${quote.jobs?.clients?.name?.replace(/\s+/g, '-') ?? 'Urban-Tree'}-${new Date().toISOString().slice(0,10)}.pdf`
    await downloadPdf(quoteRef, filename)
    setDownloading(false)
  }

  return (
    <div style={p.page}>
      {/* Preview mode top bar — only shown when opened from builder */}
      {isPreview && (
        <div style={p.previewBar}>
          <button style={p.previewBackBtn} onClick={() => window.history.back()}>
            ← Continue Editing
          </button>
          <span style={p.previewLabel}>Preview — this is what your client sees</span>
          <div style={{ width: 160 }} />
        </div>
      )}

      {/* Download button — floats top-right */}
      <div style={p.downloadBar}>
        <button
          style={{ ...p.downloadBtn, opacity: downloading ? 0.6 : 1 }}
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? '⏳ Generating…' : '⬇ Download PDF'}
        </button>
      </div>

      {/* ── Quote content (captured for PDF) ── */}
      <div ref={quoteRef}>

      {/* ── Letterhead ── */}
      <div style={p.letterhead}>
        <div style={p.logoWrap}>
          <span style={p.logoIcon}>🌲</span>
          <div>
            <div style={p.logoName}>Urban Tree Services</div>
            <div style={p.logoSub}>Wellington · Arborists</div>
          </div>
        </div>
        <div style={p.quoteRef}>
          <div style={p.refLabel}>Quote</div>
          <div style={p.refNum}>#{quoteDisplayRef}</div>
        </div>
      </div>

      {/* ── Document body ── */}
      <div style={p.doc}>

        {/* Greeting */}
        <div style={p.greeting}>
          <h1 style={p.greetingTitle}>Hi {firstName},</h1>
          <p style={p.greetingText}>
            Thank you for getting in touch.
            Please find your quote below for{' '}
            <strong>{quote.jobs?.job_type ?? 'tree services'}</strong>
            {quote.jobs?.address ? ` at ${quote.jobs.address}` : ''}.
            {hasOptional && (
              <> Some items are marked as optional — you can include or exclude them using the toggles below.</>
            )}
          </p>
        </div>

        {/* ── Line items ── */}
        <div style={p.itemsSection}>
          {items.map((item, idx) => {
            const isOptional = item.optional
            const isActive = !isOptional || item.selected
            const lineTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0)

            return (
              <div
                key={item.id}
                style={{
                  ...p.itemCard,
                  borderLeft: isOptional
                    ? `4px solid ${item.selected ? '#4A6741' : '#E2DDD6'}`
                    : '4px solid var(--bark)',
                  opacity: isActive ? 1 : 0.55,
                  transition: 'opacity 0.2s, border-color 0.2s',
                }}
              >
                <div style={p.itemBody}>
                  <div style={p.itemTop}>
                    <div style={p.itemDesc}>
                      <div style={p.itemTitle}>{item.description || '—'}</div>
                      {item.detail && <div style={p.itemDetail}>{item.detail}</div>}
                      {/* Thumbnails — supports multiple images */}
                      {(() => {
                        const imgs = item.images?.length ? item.images : (item.image_url ? [item.image_url] : [])
                        return imgs.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                            {imgs.map((url, idx) => (
                              <div
                                key={idx}
                                style={{ position: 'relative', display: 'inline-block', cursor: 'zoom-in' }}
                                onClick={() => setLightbox(url)}
                              >
                                <img src={url} alt={item.description} style={p.itemThumb} />
                                <div style={p.zoomHint}>🔍 enlarge</div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                    </div>
                    <div style={p.itemRight}>
                      {isOptional && (
                        <button
                          style={{
                            ...p.toggleBtn,
                            background: item.selected ? '#4A6741' : '#fff',
                            color: item.selected ? '#fff' : '#4A6741',
                            borderColor: item.selected ? '#4A6741' : '#4A6741',
                            boxShadow: item.selected ? '0 2px 8px rgba(74,103,65,0.3)' : 'none',
                          }}
                          onClick={() => toggleOptional(item.id)}
                          disabled={responded}
                          title={item.selected ? 'Click to remove this optional item' : 'Click to add this optional item'}
                        >
                          {item.selected ? '✓ Included' : '+ Add to quote'}
                        </button>
                      )}
                      {isActive ? (
                        <div style={p.priceStack}>
                          <div style={p.itemTotal}>{nzd(lineTotal * (1 + 0.15))}</div>
                          <div style={p.itemTotalEx}>{nzd(lineTotal)} ex GST</div>
                        </div>
                      ) : (
                        <div style={p.itemTotal}>—</div>
                      )}
                      {isOptional && (
                        <span style={{
                          ...p.optTag,
                          background: item.selected ? '#E8F0E6' : '#F5F5F5',
                          color: item.selected ? '#4A6741' : '#aaa',
                          borderColor: item.selected ? '#4A674144' : '#E2DDD6',
                        }}>
                          Optional
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={p.itemMeta}>
                    <span style={p.itemQtyRate}>{item.qty} × {nzd(item.rate)} ex GST</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Totals ── */}
        <div style={p.totalsBox}>
          {hasOptional && (
            <div style={p.optSummary}>
              {optionalSelected > 0
                ? `${optionalSelected} optional item${optionalSelected > 1 ? 's' : ''} included — toggle to adjust total`
                : 'No optional items included — tap to add them above'}
            </div>
          )}
          <div style={p.totalsInner}>
            <div style={p.tRow}>
              <span style={p.tLabel}>Subtotal (ex GST)</span>
              <span style={p.tVal}>{nzd(totals.subtotal)}</span>
            </div>
            <div style={p.tRow}>
              <span style={p.tLabel}>GST (15%)</span>
              <span style={p.tVal}>{nzd(totals.gst)}</span>
            </div>
            <div style={{ ...p.tRow, ...p.tTotal }}>
              <span>Total (incl. GST)</span>
              <span>{nzd(totals.total)}</span>
            </div>
          </div>
        </div>

        {/* ── Notes to client ── */}
        {notes && (
          <div style={p.notesBox}>
            <pre style={p.notesText}>{notes}</pre>
          </div>
        )}

        {/* ── CTA ── */}
        {!responded ? (
          <div style={p.ctaBox}>
            {!declineStep ? (
              <>
                <div style={p.ctaHint}>
                  By accepting this quote you agree to proceed with the work described above at the quoted price.
                </div>
                <div style={p.ctaBtns}>
                  <button
                    style={p.acceptBtn}
                    onClick={() => respond('accept')}
                    disabled={responding}
                  >
                    {responding ? 'Processing…' : '✓ Accept quote'}
                  </button>
                  <button
                    style={p.declineBtn}
                    onClick={() => setDeclineStep(true)}
                    disabled={responding}
                  >
                    Decline
                  </button>
                </div>
              </>
            ) : (
              <div style={p.declineCard}>
                <div style={p.declineTitle}>Are you sure you want to decline this quote?</div>
                <p style={p.declineHint}>Feel free to let us know why — we may be able to adjust.</p>
                <textarea
                  style={p.declineInput}
                  placeholder="Reason (optional)…"
                  value={declineReason}
                  onChange={e => setDeclineReason(e.target.value)}
                  rows={3}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    style={p.declineConfirm}
                    onClick={() => respond('decline', declineReason)}
                    disabled={responding}
                  >
                    {responding ? 'Declining…' : 'Yes, decline'}
                  </button>
                  <button style={p.cancelBtn} onClick={() => setDeclineStep(false)}>
                    Go back
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            ...p.respondedBanner,
            background: response === 'accepted' ? '#E8F0E6' : '#FFF0EE',
            borderColor: response === 'accepted' ? '#4A674166' : '#C0392B66',
            color: response === 'accepted' ? '#2F5233' : '#C0392B',
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>
              {response === 'accepted' ? '✓' : '✕'}
            </div>
            <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '4px' }}>
              {response === 'accepted' ? 'Quote accepted' : 'Quote declined'}
            </div>
            <div style={{ fontSize: '14px', opacity: 0.8 }}>
              {response === 'accepted'
                ? "We'll be in touch to confirm your booking. Thank you for choosing Urban Tree Services."
                : "We've received your response. Please get in touch if you'd like to discuss further."}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={p.footer}>
          <div style={p.footerLogo}>🌲 Urban Tree Services</div>
          <div style={p.footerDetails}>
            Wellington · josh@urbantreeservices.net
          </div>
          <div style={p.footerRef}>Quote #{quoteDisplayRef}</div>
        </div>

      </div>{/* end doc */}
      </div>{/* end quoteRef */}

      {/* Lightbox — outside ref so it doesn't appear in PDF */}
      {lightbox && (
        <div style={p.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button style={p.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <img
            src={lightbox}
            alt="Enlarged"
            style={p.lightboxImg}
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

const p = {
  page: { minHeight: '100vh', background: '#F4F2EF', fontFamily: 'var(--font)' },
  loadWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100vh', fontFamily: 'var(--font)',
  },
  loadSpinner: { fontSize: '40px', marginBottom: '12px', animation: 'pulse 1.5s ease-in-out infinite' },
  loadText: { fontSize: '14px', color: '#888' },

  // Letterhead
  letterhead: {
    background: 'var(--bark)', color: '#fff',
    padding: '20px 32px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  logoWrap: { display: 'flex', alignItems: 'center', gap: '12px' },
  logoIcon: { fontSize: '28px' },
  logoName: { fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' },
  logoSub: { fontSize: '12px', opacity: 0.6, marginTop: '1px' },
  quoteRef: { textAlign: 'right' },
  refLabel: { fontSize: '10px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.1em' },
  refNum: { fontSize: '20px', fontWeight: '700' },

  // Document
  doc: { maxWidth: '720px', margin: '0 auto', padding: '32px 20px 60px' },

  // Greeting
  greeting: { marginBottom: '28px' },
  greetingTitle: { fontSize: '26px', fontWeight: '700', color: 'var(--bark)', marginBottom: '10px' },
  greetingText: { fontSize: '15px', color: '#555', lineHeight: 1.7 },

  // Items
  itemsSection: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  itemCard: {
    background: '#fff', borderRadius: '10px',
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
    border: '1px solid var(--border)',
  },
  itemThumb: {
    width: '140px', height: '90px', objectFit: 'cover',
    borderRadius: '6px', border: '1px solid var(--border)', display: 'block',
  },
  itemBody: { padding: '16px 18px' },
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '10px' },
  itemDesc: { flex: 1 },
  itemTitle: { fontSize: '16px', fontWeight: '600', color: 'var(--bark)', marginBottom: '4px' },
  itemDetail: { fontSize: '13px', color: '#777', lineHeight: 1.5 },
  itemRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 },
  toggleBtn: {
    padding: '10px 18px', borderRadius: '8px', border: '2px solid',
    fontSize: '14px', fontWeight: '700', cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.2s',
    whiteSpace: 'nowrap', letterSpacing: '0.01em',
    borderColor: 'transparent',
  },
  priceStack: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
  itemTotal: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)', textAlign: 'right' },
  itemTotalEx: { fontSize: '11px', color: '#aaa', textAlign: 'right' },
  itemMeta: { display: 'flex', alignItems: 'center', gap: '10px' },
  itemQtyRate: { fontSize: '12px', color: '#aaa' },
  optTag: {
    fontSize: '11px', fontWeight: '600', borderRadius: '10px',
    padding: '2px 9px', border: '1px solid',
  },

  // Totals
  totalsBox: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    overflow: 'hidden', marginBottom: '20px', boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
  },
  optSummary: {
    padding: '10px 18px', background: '#FDF3E3',
    fontSize: '12px', color: '#D4851A', fontWeight: '500',
    borderBottom: '1px solid #FAE8CC',
  },
  totalsInner: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' },
  tRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tLabel: { fontSize: '14px', color: '#888' },
  tVal: { fontSize: '14px', color: 'var(--bark)' },
  tTotal: {
    fontSize: '22px', fontWeight: '700', color: 'var(--bark)',
    borderTop: '2px solid var(--border)', paddingTop: '12px', marginTop: '4px',
  },

  // Notes
  notesBox: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    padding: '18px 20px', marginBottom: '24px',
    boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
  },
  notesText: {
    fontSize: '14px', color: '#555', lineHeight: 1.8,
    margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)',
  },

  // CTA
  ctaBox: { marginBottom: '32px' },
  ctaHint: {
    fontSize: '12px', color: '#aaa', marginBottom: '14px', lineHeight: 1.5, textAlign: 'center',
  },
  ctaBtns: { display: 'flex', gap: '12px' },
  acceptBtn: {
    flex: 2, padding: '18px', background: 'var(--moss)', color: '#fff',
    border: 'none', borderRadius: '10px', fontSize: '17px', fontWeight: '700',
    cursor: 'pointer', fontFamily: 'var(--font)',
    boxShadow: '0 2px 8px rgba(74,103,65,0.3)',
  },
  declineBtn: {
    flex: 1, padding: '18px', background: '#fff', color: '#aaa',
    border: '1px solid var(--border)', borderRadius: '10px',
    fontSize: '15px', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  declineCard: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
  },
  declineTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--bark)' },
  declineHint: { fontSize: '13px', color: '#888', margin: 0 },
  declineInput: {
    padding: '10px 12px', borderRadius: '7px', border: '1.5px solid var(--border)',
    fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', resize: 'vertical',
  },
  declineConfirm: {
    padding: '10px 20px', background: 'var(--danger)', color: '#fff', border: 'none',
    borderRadius: '7px', fontSize: '14px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  cancelBtn: {
    padding: '10px 16px', background: 'none', border: '1px solid var(--border)',
    borderRadius: '7px', fontSize: '14px', color: '#888',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  respondedBanner: {
    marginBottom: '32px', padding: '24px', borderRadius: '12px',
    border: '1.5px solid', textAlign: 'center',
  },

  // Download bar
  downloadBar: {
    display: 'flex', justifyContent: 'flex-end',
    padding: '12px 20px 0',
  },
  downloadBtn: {
    background: '#2C2416', color: '#fff', border: 'none',
    borderRadius: '8px', padding: '9px 16px',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: '6px',
  },

  // Preview bar
  previewBar: {
    position: 'sticky', top: 0, zIndex: 50,
    background: '#2C2416', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '10px 20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
  },
  previewBackBtn: {
    background: 'none', border: '1.5px solid rgba(255,255,255,0.35)',
    borderRadius: '7px', padding: '7px 14px', color: 'rgba(255,255,255,0.9)',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    fontFamily: 'var(--font)', width: 160,
  },
  previewLabel: {
    fontSize: '12px', color: 'rgba(255,255,255,0.45)',
    fontStyle: 'italic', textAlign: 'center',
  },

  // Lightbox
  lightboxOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
  },
  lightboxClose: {
    position: 'absolute', top: '20px', right: '24px',
    background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
    width: '38px', height: '38px', borderRadius: '50%', fontSize: '18px',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  lightboxImg: {
    maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain',
    borderRadius: '4px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
  },
  zoomHint: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
    color: '#fff', fontSize: '10px', fontWeight: '500',
    padding: '10px 6px 4px', textAlign: 'center',
    borderRadius: '0 0 6px 6px',
  },

  // Footer
  footer: {
    marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border)',
    textAlign: 'center',
  },
  footerLogo: { fontSize: '16px', fontWeight: '700', color: 'var(--bark)', marginBottom: '6px' },
  footerDetails: { fontSize: '12px', color: '#aaa', marginBottom: '4px' },
  footerRef: { fontSize: '11px', color: '#ccc' },
}
