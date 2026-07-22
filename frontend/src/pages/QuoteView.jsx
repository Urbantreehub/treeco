import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { downloadPdf } from '../utils/downloadPdf'
import { GLOSSARY, TERMS, TERMS_DATE } from '../data/arboriculture'
import { annotateSegments } from '../utils/annotateText'
import { COMPANY, REVIEWS, QUALIFICATIONS, WHY_US } from '../config/company'

const GST_RATE = 0.15

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

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

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

function AnnotatedText({ text, onOpenGlossary }) {
  if (!text) return null
  const segs = annotateSegments(text)
  return (
    <>
      {segs.map((seg, i) => {
        if (seg.type === 'glossary') {
          return (
            <a
              key={i}
              href={`#gl-${seg.id}`}
              onClick={e => { e.preventDefault(); onOpenGlossary(); setTimeout(() => document.getElementById(`gl-${seg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80) }}
              style={p.glossaryLink}
            >
              {seg.text}
            </a>
          )
        }
        if (seg.type === 'tree') {
          return (
            <span key={i}>
              {seg.text}<em style={p.latinName}> ({seg.latin})</em>
            </span>
          )
        }
        return <span key={i}>{seg.text}</span>
      })}
    </>
  )
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
  const [blocked, setBlocked] = useState(null)   // expired / being-edited / failure message
  const [question, setQuestion] = useState('')
  const [askState, setAskState] = useState('idle') // 'idle' | 'sending' | 'sent'
  const [tcAgreed, setTcAgreed] = useState(false)
  const [showTc, setShowTc] = useState(false)
  const [showGlossary, setShowGlossary] = useState(false)

  useEffect(() => {
    // Via RPC, not a direct table read: quotes/jobs/clients have no anon RLS
    // policy, so a logged-out client's .from('quotes') returns nothing and the
    // page falsely reports an expired link. get_quote_by_token is SECURITY
    // DEFINER and scoped to the single row matching the token.
    supabase
      .rpc('get_quote_by_token', { p_token: token })
      .then(({ data, error }) => {
        if (error) { console.error('Quote load failed', error); setNotFound(true); setLoading(false); return }
        if (!data) { setNotFound(true); setLoading(false); return }
        setQuote(data)
        setItems((data.line_items ?? []).map(i => ({ ...i })))
        if (!isPreview && (data.status === 'accepted' || data.status === 'declined')) {
          setResponded(true)
          setResponse(data.status)
        }
        if (!isPreview) {
          // Atomically record this open: increments opened_count, sets
          // last_opened_at, sets viewed_at if null, and flips sent→viewed.
          supabase.rpc('register_quote_open', { p_token: token }).catch(() => {})
          // Tell the office, but only the first time — viewed_at is null until
          // this open is registered, so it's the one reliable "never seen
          // before" signal available on the client.
          if (!data.viewed_at) {
            fetch(`${SUPABASE_URL}/functions/v1/notify-office`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
              body: JSON.stringify({ quote_id: data.id, action: 'opened' }),
            }).catch(() => {})
          }
        }
        setLoading(false)
      })
  }, [token])

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
    if (isPreview) return
    setResponding(true)
    const newStatus = action === 'accept' ? 'accepted' : 'declined'
    // One RPC rather than two anon UPDATEs: those were blocked by RLS and their
    // results never checked, so the page showed "accepted" while nothing saved.
    //
    // Only the optional-item SELECTIONS are sent. Totals are recomputed by the
    // database from the stored line items — the server no longer trusts figures
    // from the browser, since anyone holding a link could otherwise accept at a
    // price of their choosing.
    const { data: result, error } = await supabase.rpc('respond_to_quote', {
      p_token:      token,
      p_action:     action,
      p_reason:     reason || null,
      p_line_items: items.map(i => ({ id: i.id, selected: !!i.selected })),
      p_user_agent: navigator.userAgent ?? null,
    })
    if (error || !result?.ok) {
      // Already-responded is a benign race (double-click, re-opened link) —
      // show the recorded answer. Anything else needs explaining.
      if (result?.reason === 'already_responded') {
        setResponding(false)
        setResponded(true)
        setResponse(result.status)
        setDeclineStep(false)
        return
      }
      setResponding(false)
      setDeclineStep(false)
      if (result?.reason === 'expired') {
        setBlocked('This quote has passed its valid-until date, so we can\'t accept it online. Give us a call and we\'ll reissue it at current prices.')
        return
      }
      if (result?.reason === 'editing') {
        setBlocked('We\'re updating this quote right now. We\'ll email you the moment the new version is ready.')
        return
      }
      console.error('Quote response failed', error ?? result)
      setBlocked('Sorry — we couldn\'t record your response. Please call us on 027 203 1446 and we\'ll sort it out.')
      return
    }
    setResponding(false)
    setResponded(true)
    setResponse(newStatus)
    setDeclineStep(false)
    // Notify office
    fetch(`${SUPABASE_URL}/functions/v1/notify-office`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ quote_id: quote.id, action: newStatus, reason }),
    }).catch(() => {})
  }

  async function askQuestion() {
    const body = question.trim()
    if (!body) return
    setAskState('sending')
    const { data, error } = await supabase.rpc('post_quote_question', {
      p_token: token,
      p_body: body,
    })
    if (error || !data?.ok) {
      console.error('Question failed', error ?? data)
      setAskState('idle')
      setBlocked('We couldn\'t send that just now — please call us on 027 203 1446.')
      return
    }
    setQuestion('')
    setAskState('sent')
    // Best-effort nudge so the office sees it without polling the quote.
    fetch(`${SUPABASE_URL}/functions/v1/notify-office`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      body: JSON.stringify({ quote_id: quote.id, action: 'question', reason: body }),
    }).catch(() => {})
  }

  if (loading) {
    return (
      <div style={p.loadWrap}>
        <img src="/logo.png" alt="Urban Tree Services" style={{ height: '56px', marginBottom: '16px', opacity: 0.7 }} />
        <div style={p.loadText}>Loading your quote…</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={p.loadWrap}>
        <img src="/logo.png" alt="Urban Tree Services" style={{ height: '56px', marginBottom: '16px', opacity: 0.5 }} />
        <div style={{ fontSize: '16px', color: '#888' }}>Quote not found or link has expired.</div>
        <div style={{ fontSize: '13px', color: '#bbb', marginTop: '6px' }}>
          Contact us: <a href="tel:0272031446" style={{ color: '#4A6741' }}>027 203 1446</a>
        </div>
      </div>
    )
  }

  // Being revised — show a holding page rather than figures that are about to
  // change. Without this the client could accept a quote mid-edit.
  if (!isPreview && quote.status === 'editing') {
    return (
      <div style={p.loadWrap}>
        <img src="/logo.png" alt="Urban Tree Services" style={{ height: '56px', marginBottom: '16px', opacity: 0.7 }} />
        <div style={{ fontSize: '17px', color: 'var(--bark, #2C2416)', fontWeight: 600 }}>
          We're updating this quote
        </div>
        <div style={{ fontSize: '14px', color: '#888', marginTop: '8px', maxWidth: '340px', textAlign: 'center', lineHeight: 1.5 }}>
          Changes are being made right now. We'll email you as soon as the updated
          version is ready — usually the same day.
        </div>
        <div style={{ fontSize: '13px', color: '#bbb', marginTop: '14px' }}>
          Need it sooner? <a href="tel:0272031446" style={{ color: '#4A6741' }}>027 203 1446</a>
        </div>
      </div>
    )
  }

  const client = quote.jobs?.clients
  const firstName = client?.name?.split(' ')[0] ?? 'there'
  const hasOptional = items.some(i => i.optional)
  const optionalSelected = items.filter(i => i.optional && i.selected).length
  const quoteNum = quote.quote_number ?? quote.id.slice(-6).toUpperCase()
  const notes = quote.notes ?? ''
  const quoteDate = quote.created_at ? fmtDate(quote.created_at) : fmtDate(new Date())
  const expiryDate = quote.valid_until
    ? fmtDate(quote.valid_until)
    : fmtDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
  // Computed by the database rather than the browser's clock, so a client with
  // a wrong system date sees the same answer the server will enforce.
  const isExpired = !isPreview && (quote.is_expired === true || quote.status === 'expired')
  const comments = quote.comments ?? []

  async function handleDownload() {
    setDownloading(true)
    const filename = `Quote-${quoteNum}-${quote.jobs?.clients?.name?.replace(/\s+/g, '-') ?? 'Urban-Tree'}.pdf`
    await downloadPdf(quoteRef, filename)
    setDownloading(false)
  }

  return (
    <div style={p.page}>
      {/* Preview bar */}
      {isPreview && (
        <div style={p.previewBar}>
          <button style={p.previewBackBtn} onClick={() => window.history.back()}>
            ← Continue Editing
          </button>
          <span style={p.previewLabel}>Preview — this is what your client sees</span>
          <div style={{ width: 160 }} />
        </div>
      )}

      {/* ── Quote content (captured for PDF) ── */}
      <div ref={quoteRef} style={p.document}>

        {/* ── Header: logo + company tagline ── */}
        <div style={p.docHeader}>
          <img src="/logo.png" alt="Urban Tree Services" style={p.logoImg} />
          <button
            style={{ ...p.downloadBtn, opacity: downloading ? 0.6 : 1 }}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? '⏳ Generating…' : '⬇ Download PDF'}
          </button>
        </div>

        <div style={p.headerDivider} />

        {/* ── Prepared for / Prepared by ── */}
        <div style={p.parties}>
          <div style={p.party}>
            <div style={p.partyLabel}>Prepared for</div>
            {client?.name && <div style={p.partyName}>{client.name}</div>}
            {client?.email && <div style={p.partyDetail}>Email {client.email}</div>}
            {quote.jobs?.address && <div style={p.partyDetail}>Address {quote.jobs.address}</div>}
            {client?.phone && <div style={p.partyDetail}>Phone {client.phone}</div>}
          </div>
          <div style={p.party}>
            <div style={p.partyLabel}>Prepared by {COMPANY.preparedBy}</div>
            <div style={p.partyName}>{COMPANY.name}</div>
            <div style={p.partyDetail}>Phone <a href={`tel:${COMPANY.phone.replace(/\s/g,'')}`} style={p.inlineLink}>{COMPANY.phone}</a></div>
            <div style={p.partyDetail}>Website <a href={`https://${COMPANY.website}`} style={p.inlineLink}>{COMPANY.website}</a></div>
            <div style={p.partyDetail}>GST Number {COMPANY.gstNumber}</div>
          </div>
        </div>

        {/* ── Quote meta row ── */}
        <div style={p.metaBar}>
          <div style={p.metaItem}>
            <span style={p.metaLabel}>Quote Number</span>
            <span style={p.metaValue}>{quoteNum}</span>
          </div>
          <div style={p.metaDivider} />
          <div style={p.metaItem}>
            <span style={p.metaLabel}>Date</span>
            <span style={p.metaValue}>{quoteDate}</span>
          </div>
          <div style={p.metaDivider} />
          <div style={p.metaItem}>
            <span style={p.metaLabel}>Expiry Date</span>
            <span style={p.metaValue}>{expiryDate}</span>
          </div>
        </div>

        {/* ── Document body ── */}
        <div style={p.doc}>

          {/* Greeting */}
          {!responded && (
            <div style={p.greeting}>
              <p style={p.greetingText}>
                Thank you for getting in touch. Please find your quote below
                {quote.jobs?.job_type ? ` for ${quote.jobs.job_type}` : ''}
                {quote.jobs?.address ? ` at ${quote.jobs.address}` : ''}.
                {hasOptional && (
                  <> Some items are marked as optional — you can include or exclude them using the toggles below.</>
                )}
              </p>
            </div>
          )}

          {/* ── Line items ── */}
          <div style={p.itemsSection}>
            {items.map((item) => {
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
                  }}
                >
                  <div style={p.itemBody}>
                    <div style={p.itemTop}>
                      <div style={p.itemDesc}>
                        <div style={p.itemTitle}><AnnotatedText text={item.description || '—'} onOpenGlossary={() => setShowGlossary(true)} /></div>
                        {item.detail && <div style={p.itemDetail}><AnnotatedText text={item.detail} onOpenGlossary={() => setShowGlossary(true)} /></div>}
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
                              borderColor: '#4A6741',
                              boxShadow: item.selected ? '0 2px 8px rgba(74,103,65,0.3)' : 'none',
                            }}
                            onClick={() => toggleOptional(item.id)}
                            disabled={responded}
                          >
                            {item.selected ? '✓ Included' : '+ Add to quote'}
                          </button>
                        )}
                        {isActive ? (
                          <div style={p.priceStack}>
                            <div style={p.itemTotal}>{nzd(lineTotal * 1.15)}</div>
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

          {/* ── Terms & Conditions ── */}
          <div style={p.tcSection} data-tc>
            <button style={p.tcToggle} onClick={() => setShowTc(v => !v)}>
              <span style={p.tcToggleLabel}>Terms &amp; Conditions</span>
              <span style={p.tcVersion}>v{TERMS_DATE}</span>
              <span style={p.tcChevron}>{showTc ? '▴' : '▾'}</span>
            </button>
            {showTc && (
              <div style={p.tcBody}>
                {TERMS.map(t => (
                  <div key={t.num} style={p.tcClause}>
                    <div style={p.tcClauseTitle}>{t.num}. {t.title}</div>
                    <div style={p.tcClauseText}>{t.text}</div>
                  </div>
                ))}
                <div style={p.tcFootnote}>
                  These Terms are governed by the laws of New Zealand. Your rights under the Consumer Guarantees Act 1993 and Fair Trading Act 1986 are not affected by these Terms.
                </div>
              </div>
            )}
          </div>

          {/* ── Glossary ── */}
          <div style={p.tcSection}>
            <button style={p.tcToggle} onClick={() => setShowGlossary(v => !v)}>
              <span style={p.tcToggleLabel}>Arboricultural Glossary</span>
              <span style={p.tcVersion}>{GLOSSARY.length} terms</span>
              <span style={p.tcChevron}>{showGlossary ? '▴' : '▾'}</span>
            </button>
            {showGlossary && (
              <div style={p.tcBody}>
                <p style={p.glossaryIntro}>Terms used in this quote are linked to their definitions below. Click any underlined term in the quote to jump to its definition.</p>
                {['Pruning', 'Tree Structure', 'Tree Health', 'Operations', 'Qualifications'].map(cat => {
                  const catTerms = GLOSSARY.filter(g => g.category === cat)
                  if (!catTerms.length) return null
                  return (
                    <div key={cat} style={p.glossaryCat}>
                      <div style={p.glossaryCatTitle}>{cat}</div>
                      {catTerms.map(g => (
                        <div key={g.id} id={`gl-${g.id}`} style={p.glossaryEntry}>
                          <div style={p.glossaryTerm}>{g.term}</div>
                          <div style={p.glossaryDef}>{g.definition}</div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── CTA / Response ── */}
          {!responded ? (
            <div style={p.ctaBox}>
              {blocked && <div style={p.blockedNote}>{blocked}</div>}
              {/* Expiry is enforced server-side; this just avoids offering a
                  button that is going to be refused. */}
              {isExpired ? (
                <div style={p.expiredCard}>
                  <div style={p.expiredTitle}>This quote has expired</div>
                  <p style={p.expiredHint}>
                    It was valid until <strong>{expiryDate}</strong>. Prices move with fuel,
                    disposal and insurance costs, so we'd rather requote than hold you to an
                    old figure. Call us and we'll reissue it — usually same day.
                  </p>
                  <a href="tel:0272031446" style={p.expiredCall}>Call 027 203 1446</a>
                </div>
              ) : !declineStep ? (
                <>
                  <label style={p.tcAcknowledge}>
                    <input
                      type="checkbox"
                      checked={tcAgreed}
                      onChange={e => setTcAgreed(e.target.checked)}
                      style={p.tcCheckbox}
                    />
                    <span>
                      I have read and agree to the <button type="button" style={p.tcInlineLink} onClick={() => { setShowTc(true); setTimeout(() => document.querySelector('[data-tc]')?.scrollIntoView({ behavior: 'smooth' }), 80) }}>Terms &amp; Conditions</button> above. I understand my rights under the Consumer Guarantees Act 1993 are not affected.
                    </span>
                  </label>
                  <div style={p.ctaHint}>
                    This quote is valid until <strong>{expiryDate}</strong>.
                  </div>
                  <div style={p.ctaBtns}>
                    <button
                      style={{ ...p.acceptBtn, opacity: tcAgreed ? 1 : 0.45, cursor: tcAgreed ? 'pointer' : 'not-allowed' }}
                      onClick={() => tcAgreed && respond('accept')}
                      disabled={responding || !tcAgreed}
                      title={!tcAgreed ? 'Please agree to the Terms & Conditions to accept' : ''}
                    >
                      {responding ? 'Processing…' : '✓ Accept quote'}
                    </button>
                    <button style={p.declineBtn} onClick={() => setDeclineStep(true)} disabled={responding}>
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
                    <button style={p.declineConfirm} onClick={() => respond('decline', declineReason)} disabled={responding}>
                      {responding ? 'Declining…' : 'Yes, decline'}
                    </button>
                    <button style={p.cancelBtn} onClick={() => setDeclineStep(false)}>Go back</button>
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
              <div style={{ fontSize: '14px', opacity: 0.8, lineHeight: 1.6 }}>
                {response === 'accepted'
                  ? <>We'll be in touch within 1 business day to confirm your booking date.<br />Ref: #{quoteNum} · <a href="tel:0272031446" style={{ color: 'inherit' }}>027 203 1446</a></>
                  : <>We've received your response. Call <a href="tel:0272031446" style={{ color: 'inherit' }}>027 203 1446</a> if you'd like to discuss further.</>}
              </div>
            </div>
          )}

          {/* ── Questions ──
              Previously the only way to query a quote was to phone. A written
              thread keeps the question attached to the quote it's about, so
              whoever picks it up has the context. */}
          {!isPreview && (
            <div style={p.askBox}>
              <div style={p.askHeader}>Questions about this quote?</div>
              {comments.length > 0 && (
                <div style={p.thread}>
                  {comments.map(c => (
                    <div
                      key={c.id}
                      style={{ ...p.bubble, ...(c.author === 'staff' ? p.bubbleStaff : p.bubbleClient) }}
                    >
                      <div style={p.bubbleWho}>
                        {c.author === 'staff' ? COMPANY.shortName : 'You'}
                        <span style={p.bubbleWhen}>{fmtDate(c.created_at)}</span>
                      </div>
                      <div style={p.bubbleBody}>{c.body}</div>
                    </div>
                  ))}
                </div>
              )}
              {askState === 'sent' ? (
                <div style={p.askSent}>
                  Thanks — we've got your question and will come back to you, usually the same day.
                </div>
              ) : (
                <>
                  <textarea
                    style={p.askInput}
                    placeholder="e.g. Does the price include removing the stump?"
                    value={question}
                    onChange={e => setQuestion(e.target.value)}
                    rows={3}
                    disabled={askState === 'sending'}
                  />
                  <div style={p.askActions}>
                    <button
                      style={{ ...p.askBtn, opacity: question.trim() ? 1 : 0.45 }}
                      onClick={askQuestion}
                      disabled={!question.trim() || askState === 'sending'}
                    >
                      {askState === 'sending' ? 'Sending…' : 'Send question'}
                    </button>
                    <span style={p.askOr}>
                      or call <a href="tel:0272031446" style={p.askCall}>027 203 1446</a>
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Why choose us (credibility) ── */}
          <div style={p.whyBox}>
            <div style={p.whyHeader}>Why choose {COMPANY.shortName}</div>

            {/* Reviews strip */}
            <div style={p.reviewRow}>
              <div style={p.reviewRating}>
                <span style={p.stars} aria-hidden="true">
                  {[0, 1, 2, 3, 4].map(i => {
                    const fill = Math.max(0, Math.min(1, REVIEWS.rating - i))
                    return (
                      <span key={i} style={p.starWrap}>
                        <span style={p.starEmpty}>★</span>
                        <span style={{ ...p.starFill, width: `${fill * 100}%` }}>★</span>
                      </span>
                    )
                  })}
                </span>
                <span style={p.reviewNum}>{REVIEWS.rating.toFixed(1)}</span>
                <a href={REVIEWS.url} target="_blank" rel="noopener noreferrer" style={p.reviewLink}>
                  {REVIEWS.count}+ Google reviews
                </a>
              </div>
              <div style={p.reviewQuotes}>
                {REVIEWS.quotes.slice(0, 2).map((q, i) => (
                  <blockquote key={i} style={p.reviewQuote}>
                    <span style={p.reviewQuoteText}>“{q.text}”</span>
                    <span style={p.reviewQuoteAuthor}>— {q.author}</span>
                  </blockquote>
                ))}
              </div>
            </div>

            {/* Qualification badges */}
            <div style={p.qualGrid}>
              {QUALIFICATIONS.map((q, i) => (
                <div key={i} style={p.qualBadge}>
                  <span style={p.qualGlyph} aria-hidden="true">🛡</span>
                  <div>
                    <div style={p.qualLabel}>{q.label}</div>
                    <div style={p.qualDetail}>{q.detail}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Why-us checklist */}
            <ul style={p.whyList}>
              {WHY_US.map((w, i) => (
                <li key={i} style={p.whyItem}>
                  <span style={p.whyCheck} aria-hidden="true">✓</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Contact bar ── */}
          <div style={p.contactBar}>
            <div style={p.contactLabel}>Questions about this quote?</div>
            <div style={p.contactLinks}>
              <a href="tel:0272031446" style={p.contactLink}>📞 027 203 1446</a>
              <a href="mailto:office@urbantreeservices.net" style={p.contactLink}>✉ office@urbantreeservices.net</a>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={p.footer}>
            <img src="/logo.png" alt="Urban Tree Services" style={p.footerLogo} />
            <div style={p.footerDetails}>
              <a href="mailto:office@urbantreeservices.net" style={p.footerLink}>office@urbantreeservices.net</a>
              {' · '}
              <a href="tel:0272031446" style={p.footerLink}>027 203 1446</a>
            </div>
            <div style={p.footerRef}>GST No. {COMPANY.gstNumber} · Quote #{quoteNum}</div>
          </div>

        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={p.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button style={p.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="Enlarged" style={p.lightboxImg} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

const p = {
  page: { minHeight: '100dvh', background: '#F4F2EF', fontFamily: 'var(--font)' },
  loadWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '100dvh', fontFamily: 'var(--font)',
  },
  loadText: { fontSize: '14px', color: '#888' },

  // Outer document wrapper
  document: {
    maxWidth: '760px', margin: '0 auto', background: '#fff',
    boxShadow: '0 2px 16px rgba(44,36,22,0.10)', borderRadius: '4px',
    overflow: 'hidden',
  },

  // Header: logo + download
  docHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '28px 36px 20px',
  },
  logoImg: { height: '56px', width: 'auto', objectFit: 'contain' },
  headerDivider: { height: '1px', background: '#E2DDD6', margin: '0 36px' },

  // Parties
  parties: {
    display: 'flex', justifyContent: 'space-between', gap: '24px',
    padding: '24px 36px', borderBottom: '1px solid #E2DDD6',
  },
  party: { flex: 1 },
  partyLabel: {
    fontSize: '10px', fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px',
  },
  partyName: { fontSize: '15px', fontWeight: '700', color: '#2C2416', marginBottom: '6px' },
  partyDetail: { fontSize: '13px', color: '#555', lineHeight: 1.8 },
  inlineLink: { color: '#4A7FA5', textDecoration: 'none' },

  // Quote meta bar
  metaBar: {
    display: 'flex', alignItems: 'center', gap: '0',
    padding: '14px 36px', background: '#FAF8F4', borderBottom: '1px solid #E2DDD6',
  },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '2px', flex: 1 },
  metaDivider: { width: '1px', height: '36px', background: '#E2DDD6', margin: '0 24px' },
  metaLabel: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  metaValue: { fontSize: '13px', fontWeight: '600', color: '#2C2416' },

  // Document body
  doc: { padding: '28px 36px 48px' },

  // Greeting
  greeting: { marginBottom: '24px' },
  greetingText: { fontSize: '15px', color: '#555', lineHeight: 1.7, margin: 0 },

  // Why choose us (credibility)
  whyBox: {
    background: 'linear-gradient(180deg, #F8FAF7 0%, #FAF8F4 100%)',
    border: '1px solid #D4E4D0', borderRadius: '12px',
    padding: '22px 22px 20px', marginBottom: '24px',
    boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
  },
  whyHeader: {
    fontSize: '11px', fontWeight: '800', color: 'var(--moss)',
    textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: '16px',
  },
  reviewRow: {
    display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: '18px',
    paddingBottom: '18px', borderBottom: '1px solid #E2DDD6',
  },
  reviewRating: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  stars: { display: 'inline-flex', gap: '2px', lineHeight: 1 },
  starWrap: { position: 'relative', display: 'inline-block', fontSize: '18px', width: '18px', height: '18px' },
  starEmpty: { color: '#D8D2C8' },
  starFill: {
    position: 'absolute', top: 0, left: 0, overflow: 'hidden',
    color: '#E8A33D', whiteSpace: 'nowrap',
  },
  reviewNum: { fontSize: '18px', fontWeight: '800', color: 'var(--bark)' },
  reviewLink: { fontSize: '13px', fontWeight: '600', color: '#4A7FA5', textDecoration: 'none' },
  reviewQuotes: { display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: '220px' },
  reviewQuote: { margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' },
  reviewQuoteText: { fontSize: '13px', fontStyle: 'italic', color: '#555', lineHeight: 1.55 },
  reviewQuoteAuthor: { fontSize: '11px', color: '#999', fontWeight: '600' },
  qualGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px', marginBottom: '18px',
  },
  qualBadge: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    background: '#fff', border: '1px solid var(--border)', borderRadius: '9px',
    padding: '11px 13px',
  },
  qualGlyph: { fontSize: '16px', lineHeight: 1.2, flexShrink: 0, color: 'var(--moss)' },
  qualLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--bark)', marginBottom: '2px' },
  qualDetail: { fontSize: '11px', color: '#777', lineHeight: 1.45 },
  whyList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '8px 20px' },
  whyItem: { display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#4A4A42', lineHeight: 1.5, flex: '1 1 240px' },
  whyCheck: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '17px', height: '17px', borderRadius: '50%', flexShrink: 0,
    background: 'var(--moss)', color: '#fff', fontSize: '10px', fontWeight: '800', marginTop: '1px',
  },

  // Items
  itemsSection: { display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' },
  itemCard: {
    background: '#fff', borderRadius: '10px',
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
    border: '1px solid var(--border)',
  },
  itemThumb: { width: '140px', height: '90px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)', display: 'block' },
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
    whiteSpace: 'nowrap',
  },
  priceStack: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
  itemTotal: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)', textAlign: 'right' },
  itemTotalEx: { fontSize: '11px', color: '#aaa', textAlign: 'right' },
  itemMeta: { display: 'flex', alignItems: 'center', gap: '10px' },
  itemQtyRate: { fontSize: '12px', color: '#aaa' },
  optTag: { fontSize: '11px', fontWeight: '600', borderRadius: '10px', padding: '2px 9px', border: '1px solid' },

  // Totals
  totalsBox: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    overflow: 'hidden', marginBottom: '20px', boxShadow: '0 1px 4px rgba(44,36,22,0.06)',
  },
  optSummary: { padding: '10px 18px', background: '#FDF3E3', fontSize: '12px', color: '#D4851A', fontWeight: '500', borderBottom: '1px solid #FAE8CC' },
  totalsInner: { padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '10px' },
  tRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  tLabel: { fontSize: '14px', color: '#888' },
  tVal: { fontSize: '14px', color: 'var(--bark)' },
  tTotal: { fontSize: '22px', fontWeight: '700', color: 'var(--bark)', borderTop: '2px solid var(--border)', paddingTop: '12px', marginTop: '4px' },

  // Notes
  notesBox: { background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', padding: '18px 20px', marginBottom: '24px', boxShadow: '0 1px 4px rgba(44,36,22,0.06)' },
  notesText: { fontSize: '14px', color: '#555', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' },

  // Glossary link + Latin
  glossaryLink: {
    color: '#4A7FA5', textDecoration: 'underline dotted', textDecorationColor: '#4A7FA577',
    textUnderlineOffset: '3px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit',
  },
  latinName: {
    fontSize: '0.85em', color: '#888', fontStyle: 'italic', fontFamily: 'Georgia, serif',
  },

  // T&C + Glossary collapsible
  tcSection: {
    marginBottom: '16px', borderRadius: '10px', border: '1px solid var(--border)',
    overflow: 'hidden', boxShadow: '0 1px 4px rgba(44,36,22,0.04)',
  },
  tcToggle: {
    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
    padding: '14px 18px', background: '#FAFAF8', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', textAlign: 'left',
  },
  tcToggleLabel: { fontSize: '13px', fontWeight: '700', color: 'var(--bark)', flex: 1 },
  tcVersion: { fontSize: '11px', color: '#bbb', fontWeight: '500' },
  tcChevron: { fontSize: '11px', color: '#bbb' },
  tcBody: { padding: '18px 20px', borderTop: '1px solid var(--border)', background: '#fff' },
  tcClause: { marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F0EDE8' },
  tcClauseTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--bark)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' },
  tcClauseText: { fontSize: '13px', color: '#555', lineHeight: 1.75 },
  tcFootnote: { fontSize: '12px', color: '#aaa', lineHeight: 1.6, fontStyle: 'italic', marginTop: '8px' },
  glossaryIntro: { fontSize: '13px', color: '#888', marginBottom: '16px', lineHeight: 1.6, margin: '0 0 16px' },
  glossaryCat: { marginBottom: '20px' },
  glossaryCatTitle: {
    fontSize: '10px', fontWeight: '800', color: '#aaa', textTransform: 'uppercase',
    letterSpacing: '0.08em', marginBottom: '10px', paddingBottom: '6px',
    borderBottom: '1px solid #F0EDE8',
  },
  glossaryEntry: { marginBottom: '12px', paddingLeft: '12px', borderLeft: '3px solid #E2DDD6' },
  glossaryTerm: { fontSize: '13px', fontWeight: '700', color: 'var(--bark)', marginBottom: '3px' },
  glossaryDef: { fontSize: '12px', color: '#666', lineHeight: 1.65 },

  // T&C acknowledgement checkbox
  tcAcknowledge: {
    display: 'flex', alignItems: 'flex-start', gap: '10px',
    background: '#F8FAF7', border: '1.5px solid #D4E4D0', borderRadius: '8px',
    padding: '12px 14px', marginBottom: '14px', cursor: 'pointer',
    fontSize: '13px', color: '#555', lineHeight: 1.55,
  },
  tcCheckbox: { width: '18px', height: '18px', accentColor: 'var(--moss)', flexShrink: 0, marginTop: '2px', cursor: 'pointer' },
  tcInlineLink: {
    background: 'none', border: 'none', color: '#4A7FA5', textDecoration: 'underline',
    cursor: 'pointer', fontFamily: 'var(--font)', fontSize: 'inherit', padding: '0',
  },

  // CTA
  ctaBox: { marginBottom: '32px' },
  ctaHint: { fontSize: '12px', color: '#888', marginBottom: '14px', lineHeight: 1.5, textAlign: 'center' },
  ctaBtns: { display: 'flex', gap: '12px' },
  acceptBtn: {
    flex: 2, padding: '18px', background: 'var(--moss)', color: '#fff',
    border: 'none', borderRadius: '10px', fontSize: '17px', fontWeight: '700',
    cursor: 'pointer', fontFamily: 'var(--font)', boxShadow: '0 2px 8px rgba(74,103,65,0.3)',
  },
  declineBtn: {
    flex: 1, padding: '18px', background: '#fff', color: '#aaa',
    border: '1px solid var(--border)', borderRadius: '10px', fontSize: '15px',
    cursor: 'pointer', fontFamily: 'var(--font)',
  },
  declineCard: { background: '#fff', borderRadius: '10px', border: '1px solid var(--border)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  declineTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--bark)' },
  declineHint: { fontSize: '13px', color: '#888', margin: 0 },
  declineInput: { padding: '10px 12px', borderRadius: '7px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', resize: 'vertical' },
  declineConfirm: { padding: '10px 20px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { padding: '10px 16px', background: 'none', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '14px', color: '#888', cursor: 'pointer', fontFamily: 'var(--font)' },
  respondedBanner: { marginBottom: '32px', padding: '24px', borderRadius: '12px', border: '1.5px solid', textAlign: 'center' },

  blockedNote: {
    background: '#FDF3E3', border: '1px solid #E8C98A', color: '#8A5A0B',
    borderRadius: '10px', padding: '12px 14px', fontSize: '14px', lineHeight: 1.55,
    marginBottom: '14px',
  },
  expiredCard: {
    background: '#fff', borderRadius: '10px', border: '1px solid var(--border)',
    padding: '22px', display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'center',
  },
  expiredTitle: { fontSize: '17px', fontWeight: '700', color: 'var(--bark)' },
  expiredHint: { fontSize: '14px', color: '#777', lineHeight: 1.6, margin: 0 },
  expiredCall: {
    alignSelf: 'center', marginTop: '4px', background: 'var(--moss)', color: '#fff',
    textDecoration: 'none', padding: '11px 22px', borderRadius: '9px',
    fontSize: '15px', fontWeight: '700',
  },

  askBox: {
    marginBottom: '32px', background: '#fff', border: '1px solid var(--border)',
    borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
  },
  askHeader: { fontSize: '15px', fontWeight: '700', color: 'var(--bark)' },
  thread: { display: 'flex', flexDirection: 'column', gap: '10px' },
  bubble: { borderRadius: '10px', padding: '11px 13px', maxWidth: '86%' },
  bubbleClient: { background: 'var(--cream, #FAF8F4)', border: '1px solid var(--border)', alignSelf: 'flex-end' },
  bubbleStaff: { background: '#E8F0E6', border: '1px solid #4A674133', alignSelf: 'flex-start' },
  bubbleWho: {
    fontSize: '11px', fontWeight: '700', color: '#7A7267', marginBottom: '4px',
    display: 'flex', gap: '8px', alignItems: 'baseline',
  },
  bubbleWhen: { fontWeight: '400', color: '#A8A196' },
  bubbleBody: { fontSize: '14px', color: 'var(--bark)', lineHeight: 1.55, whiteSpace: 'pre-wrap' },
  askInput: {
    width: '100%', padding: '11px 13px', borderRadius: '9px', border: '1px solid var(--border)',
    fontSize: '14px', fontFamily: 'inherit', color: 'var(--bark)', background: 'var(--cream, #FAF8F4)',
    boxSizing: 'border-box', resize: 'vertical',
  },
  askActions: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  askBtn: {
    background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: '9px',
    padding: '10px 18px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit',
  },
  askOr: { fontSize: '13px', color: '#999' },
  askCall: { color: 'var(--moss)', fontWeight: '600' },
  askSent: {
    background: '#E8F0E6', border: '1px solid #4A674133', borderRadius: '9px',
    padding: '13px 15px', fontSize: '14px', color: '#2F5233', lineHeight: 1.55,
  },

  // Download button
  downloadBtn: {
    background: 'none', border: '1px solid #E2DDD6', borderRadius: '8px',
    padding: '8px 14px', fontSize: '13px', fontWeight: '600', color: '#2C2416',
    cursor: 'pointer', fontFamily: 'var(--font)', display: 'flex', alignItems: 'center', gap: '6px',
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
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)', width: 160,
  },
  previewLabel: { fontSize: '12px', color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', textAlign: 'center' },

  // Contact bar
  contactBar: {
    background: '#F8FAF7', border: '1px solid #D4E4D0', borderRadius: '10px',
    padding: '16px 20px', marginBottom: '24px',
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
  },
  contactLabel: { fontSize: '14px', fontWeight: '600', color: 'var(--bark)' },
  contactLinks: { display: 'flex', flexWrap: 'wrap', gap: '16px' },
  contactLink: { fontSize: '14px', color: 'var(--moss)', fontWeight: '600', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' },

  // Footer
  footer: { marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' },
  footerLogo: { height: '32px', width: 'auto', objectFit: 'contain', opacity: 0.5 },
  footerDetails: { fontSize: '12px', color: '#aaa' },
  footerLink: { color: '#aaa', textDecoration: 'none' },
  footerRef: { fontSize: '11px', color: '#ccc' },

  // Lightbox
  lightboxOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' },
  lightboxClose: { position: 'absolute', top: '20px', right: '24px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: '38px', height: '38px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  lightboxImg: { maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '4px', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' },
  zoomHint: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.6))', color: '#fff', fontSize: '10px', fontWeight: '500', padding: '10px 6px 4px', textAlign: 'center', borderRadius: '0 0 6px 6px' },
}
