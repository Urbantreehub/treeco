import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../config/supabase'
import { v4 as uuid } from 'uuid'

const COMMON_ADDITIONS = [
  'Extra pruning / canopy work',
  'Additional tree removal',
  'Extra stump grinding',
  'Chip disposal — off-site',
  'Extra green waste removal',
  'Traffic management required',
  'Power line clearance work',
  'Difficult access surcharge',
  'Extra aerial climbing time',
  'Root zone / soil treatment',
  'Additional crew required',
  'Emergency debris cleanup',
]

const JOB_FORMS = [
  { id: 'risk_assessment', label: 'SSSP',             url: '/forms/risk-assessment.html', icon: '📋', required: true },
  { id: 'toolbox_meeting', label: 'Toolbox Meeting',   url: '/forms/toolbox-meeting.html', icon: '🧰', required: true },
  { id: 'prestart',        label: 'Pre-start Check',  url: '/forms/prestart-daily.html',  icon: '🔧', required: true },
  { id: 'incident_report', label: 'Incident Report',  url: '/forms/incident-report.html', icon: '🚨', required: false },
]

// ── Image processing ──────────────────────────────────────────────────────────

function getGPS() {
  return new Promise(res => {
    if (!navigator.geolocation) { res(null); return }
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }),
      () => res(null),
      { timeout: 8000, enableHighAccuracy: true },
    )
  })
}

// Resize + optional GPS/timestamp watermark, returns a Blob (JPEG, quality 0.75, max 1600px)
function processImage(file, stamp = null) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1600
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      if (stamp) {
        const text  = `${stamp.coords}  ·  ${stamp.datetime}`
        const pad   = 8
        const fh    = Math.max(14, Math.round(w / 50))
        ctx.font    = `bold ${fh}px monospace`
        // Dark strip at bottom
        ctx.fillStyle = 'rgba(0,0,0,0.72)'
        ctx.fillRect(0, h - fh - pad * 2, w, fh + pad * 2)
        // White text
        ctx.fillStyle = '#ffffff'
        ctx.textBaseline = 'middle'
        ctx.fillText(text, pad, h - fh / 2 - pad, w - pad * 2)
      }

      canvas.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob) }, 'image/jpeg', 0.75)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WorkOrder() {
  const { jobId } = useParams()
  const navigate  = useNavigate()

  const [job,        setJob]        = useState(null)
  const [items,      setItems]      = useState([])
  const [quoteNotes, setQuoteNotes] = useState('')
  const [jobPack,    setJobPack]    = useState({})
  const [loading,    setLoading]    = useState(true)

  // Forms
  const [formStatus, setFormStatus] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_job_forms_${jobId}`) ?? '{}') } catch { return {} }
  })
  const [activeForm, setActiveForm] = useState(null)

  // Additions
  const [additions,    setAdditions]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_wo_add_${jobId}`) ?? '[]') } catch { return [] }
  })
  const [customText,   setCustomText]   = useState('')
  const [notifyState,  setNotifyState]  = useState(null)
  const [showAllChips, setShowAllChips] = useState(false)

  // Crew private notes (local only)
  const [crewNotes, setCrewNotes] = useState(() => localStorage.getItem(`treeco_wo_crew_notes_${jobId}`) ?? '')

  // Generic site photos (non-S&D jobs)
  const [photos,    setPhotos]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_wo_photos_${jobId}`) ?? '[]') } catch { return [] }
  })

  // S&D photo sections
  const [duringPhotos, setDuringPhotos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_wo_during_${jobId}`) ?? '[]') } catch { return [] }
  })
  const [afterPhotos, setAfterPhotos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`treeco_wo_after_${jobId}`) ?? '[]') } catch { return [] }
  })

  const [uploading,    setUploading]    = useState(null) // null | 'during' | 'after' | 'general'
  const duringRef  = useRef()
  const afterRef   = useRef()
  const generalRef = useRef()
  const [lightbox, setLightbox] = useState(null)

  // ── Load job + quote ──────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const [{ data: jobData }, { data: quoteData }] = await Promise.all([
        supabase.from('jobs').select('*, clients(name, phone)').eq('id', jobId).single(),
        supabase.from('quotes').select('line_items, notes, job_pack')
          .eq('job_id', jobId)
          .order('created_at', { ascending: false })
          .limit(1).maybeSingle(),
      ])
      if (jobData) setJob(jobData)
      if (quoteData?.line_items?.length) setItems(quoteData.line_items)
      if (quoteData?.notes) setQuoteNotes(quoteData.notes)
      if (quoteData?.job_pack)  setJobPack(quoteData.job_pack)
      setLoading(false)
    }
    load()
  }, [jobId])

  // ── Form postMessage listener ─────────────────────────────────────────────
  useEffect(() => {
    function handleMsg(e) {
      if (e.data?.type === 'form_complete' && e.data.job_id === jobId) {
        setFormStatus(prev => {
          const next = { ...prev, [e.data.form_id]: { completed: true, at: new Date().toISOString() } }
          localStorage.setItem(`treeco_job_forms_${jobId}`, JSON.stringify(next))
          return next
        })
        setActiveForm(null)
      }
    }
    window.addEventListener('message', handleMsg)
    return () => window.removeEventListener('message', handleMsg)
  }, [jobId])

  // ── Derived flags ─────────────────────────────────────────────────────────
  const clientName = job?.clients?.name ?? ''
  const jobTitle   = job?.title ?? ''
  const isSD       = /spencer|downer/i.test(clientName) || /spencer|downer/i.test(jobTitle)
  const isDowner   = /downer/i.test(clientName) || /downer/i.test(jobTitle)

  const formsComplete     = JOB_FORMS.filter(f => f.required).every(f => formStatus[f.id]?.completed)
  const sdPhotosComplete  = isSD && duringPhotos.length > 0 && afterPhotos.length > 0
  const readyToComplete   = formsComplete && (!isSD || sdPhotosComplete)

  const quotePhotos = items.flatMap(i => i.images?.length ? i.images : (i.image_url ? [i.image_url] : []))

  // ── Photo upload ──────────────────────────────────────────────────────────
  async function handleUpload(file, type) {
    if (!file) return
    setUploading(type)

    let stamp = null
    if (isDowner) {
      const gps = await getGPS()
      const now = new Date()
      const datetime = now.toLocaleString('en-NZ', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      })
      stamp = { coords: gps ? `${gps.lat}, ${gps.lng}` : 'GPS unavailable', datetime }
    }

    const blob = await processImage(file, stamp)
    const path = `site/${jobId}/${type}/${uuid()}.jpg`
    const { error } = await supabase.storage.from('quote-images').upload(path, blob, { contentType: 'image/jpeg' })

    if (!error) {
      const { data } = supabase.storage.from('quote-images').getPublicUrl(path)
      const url = data.publicUrl

      if (type === 'during') {
        const next = [...duringPhotos, url]
        setDuringPhotos(next)
        localStorage.setItem(`treeco_wo_during_${jobId}`, JSON.stringify(next))
      } else if (type === 'after') {
        const next = [...afterPhotos, url]
        setAfterPhotos(next)
        localStorage.setItem(`treeco_wo_after_${jobId}`, JSON.stringify(next))
      } else {
        const next = [...photos, url]
        setPhotos(next)
        localStorage.setItem(`treeco_wo_photos_${jobId}`, JSON.stringify(next))
      }
    }

    setUploading(null)
  }

  // ── Additions ─────────────────────────────────────────────────────────────
  function addAddition(label) {
    if (!label.trim()) return
    const next = [...additions, { id: uuid(), label: label.trim(), qty: 1 }]
    setAdditions(next)
    localStorage.setItem(`treeco_wo_add_${jobId}`, JSON.stringify(next))
  }
  function removeAddition(id) {
    const next = additions.filter(a => a.id !== id)
    setAdditions(next)
    localStorage.setItem(`treeco_wo_add_${jobId}`, JSON.stringify(next))
  }
  function updateQty(id, delta) {
    const next = additions.map(a => a.id === id ? { ...a, qty: Math.max(1, a.qty + delta) } : a)
    setAdditions(next)
    localStorage.setItem(`treeco_wo_add_${jobId}`, JSON.stringify(next))
  }

  async function notifyOffice() {
    if (!additions.length || notifyState === 'sent') return
    setNotifyState('sending')
    const lines = additions.map(a => `• ${a.label}${a.qty > 1 ? ` (×${a.qty})` : ''}`).join('\n')
    const stamp = new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
    const note  = `\n\n— Site Additions (${stamp}) —\n${lines}`
    const { data: cur } = await supabase.from('jobs').select('description').eq('id', jobId).single()
    await supabase.from('jobs').update({ description: (cur?.description ?? '') + note }).eq('id', jobId)
    setNotifyState('sent')
  }

  // ── Form URL ──────────────────────────────────────────────────────────────
  function buildFormUrl(f) {
    const p = new URLSearchParams({
      job_id: jobId,
      job_address: job?.address ?? '',
      job_date: new Date().toISOString().slice(0, 10),
      job_type: job?.job_type ?? '',
      form_id: f.id,
    })
    return `${f.url}?${p}`
  }

  // ── Full-screen form modal ────────────────────────────────────────────────
  if (activeForm) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={s.formBar}>
          <button onClick={() => setActiveForm(null)} style={s.formBack}>← Back to Work Order</button>
          <span style={s.formBarTitle}>{activeForm.label}</span>
          {formStatus[activeForm.id]?.completed && (
            <span style={{ marginLeft: 'auto', color: '#2e7d32', fontWeight: 700, fontSize: 13 }}>✓ Complete</span>
          )}
        </div>
        <iframe src={buildFormUrl(activeForm)} style={{ flex: 1, border: 'none', width: '100%' }} title={activeForm.label} />
      </div>
    )
  }

  if (loading) return <div style={s.loading}>Loading…</div>
  if (!job)    return <div style={s.loading}>Job not found.</div>

  const alreadyAdded = new Set(additions.map(a => a.label))
  const availChips   = COMMON_ADDITIONS.filter(c => !alreadyAdded.has(c))
  const visibleChips = showAllChips ? availChips : availChips.slice(0, 6)

  return (
    <div style={s.page}>

      {/* ── Header ── */}
      <div style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.headerTitle}>Work Order</span>
            {isSD && (
              <span style={s.sdBadge}>{isDowner ? 'Downer' : 'S&D'}</span>
            )}
          </div>
          <div style={s.headerSub} title={job.address}>{job.address || job.title}</div>
        </div>
        {/* Readiness dot */}
        <div title={readyToComplete ? 'Ready to complete' : 'Actions required'} style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: readyToComplete ? '#2e7d32' : '#C0392B',
          boxShadow: readyToComplete ? '0 0 0 3px #2e7d3222' : '0 0 0 3px #C0392B22',
        }} />
      </div>

      <div style={s.body}>

        {/* ── Job summary ── */}
        <div style={s.card}>
          {job.job_type      && <MetaRow icon="🌲">{job.job_type}</MetaRow>}
          {clientName        && <MetaRow icon="👤">{clientName}</MetaRow>}
          {job.clients?.phone && (
            <MetaRow icon="📞">
              <a href={`tel:${job.clients.phone.replace(/\s/g,'')}`} style={s.link}>{job.clients.phone}</a>
            </MetaRow>
          )}
          {job.address && (
            <MetaRow icon="📍">
              <a href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" style={s.link}>
                {job.address}
              </a>
            </MetaRow>
          )}
          {isDowner && (
            <div style={s.downerNotice}>
              📍 Downer job — GPS coordinates &amp; timestamp will be embedded in all photos automatically.
            </div>
          )}
        </div>

        {/* ── Job Pack ── */}
        {Object.keys(jobPack).some(k => jobPack[k] !== null && jobPack[k] !== undefined && jobPack[k] !== '') && (
          <JobPackCard pack={jobPack} />
        )}

        {/* ── Required Forms ── */}
        <div style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.sectionLabel}>Required Forms</span>
            {formsComplete && <span style={s.allDone}>All complete ✓</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {JOB_FORMS.map(f => {
              const done = formStatus[f.id]?.completed
              return (
                <button key={f.id} onClick={() => setActiveForm(f)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font)',
                  border: done ? '1.5px solid #2e7d3244' : f.required ? '1.5px solid #C0392B44' : '1.5px dashed #D0D9C8',
                  background: done ? '#F0FFF4' : f.required ? '#FFF8F8' : '#FAFAFA',
                }}>
                  <span style={{ fontSize: 22 }}>{f.icon}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#2C2416' }}>{f.label}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: done ? '#2e7d32' : f.required ? '#C0392B' : '#C8D4C4' }}>
                    {done ? '✓' : f.required ? '✕' : '+'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Scope of work ── */}
        {(items.length > 0 || job.description || quoteNotes) && (
          <div style={s.section}>
            <span style={s.sectionLabel}>Scope of Work</span>
            {items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
                {items.filter(i => !i.optional || i.selected).map((item, idx) => (
                  <div key={item.id ?? idx} style={s.taskRow}>
                    <div style={s.taskBullet} />
                    <div style={{ flex: 1 }}>
                      <div style={s.taskTitle}>{item.description}</div>
                      {item.detail && <div style={s.taskDetail}>{item.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : job.description ? (
              <div style={{ ...s.descText, marginTop: 12 }}>{job.description}</div>
            ) : null}
            {quoteNotes && (
              <div style={s.notesBox}>
                <div style={s.notesLabel}>Notes from office</div>
                <div style={s.notesText}>{quoteNotes}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Photo Documentation (S&D jobs) ── */}
        {isSD ? (
          <div style={s.section}>
            <div style={s.sectionHead}>
              <span style={s.sectionLabel}>Photo Documentation</span>
              {sdPhotosComplete
                ? <span style={s.allDone}>✓ During &amp; After uploaded</span>
                : <span style={{ fontSize: 12, fontWeight: 600, color: '#C0392B' }}>During &amp; After required</span>
              }
            </div>

            {/* BEFORE — from quote (read-only) */}
            <PhotoStrip
              label="Before"
              labelColor="#4A7FA5"
              photos={quotePhotos}
              readonly
              onView={setLightbox}
            />

            {/* DURING */}
            <PhotoStrip
              label="During"
              labelColor="#D4851A"
              photos={duringPhotos}
              uploading={uploading === 'during'}
              onView={setLightbox}
              onAdd={() => duringRef.current?.click()}
              required
            />
            <input
              ref={duringRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files[0], 'during'); e.target.value = '' }}
            />

            {/* AFTER */}
            <PhotoStrip
              label="After"
              labelColor="#2e7d32"
              photos={afterPhotos}
              uploading={uploading === 'after'}
              onView={setLightbox}
              onAdd={() => afterRef.current?.click()}
              required
            />
            <input
              ref={afterRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files[0], 'after'); e.target.value = '' }}
            />

            {/* Status readiness banner */}
            {!sdPhotosComplete && (
              <div style={s.photoGate}>
                Upload at least one During and one After photo before the job can be marked complete.
              </div>
            )}
          </div>
        ) : (
          /* ── Generic site photos (non-S&D) ── */
          <div style={s.section}>
            <span style={s.sectionLabel}>Site Photos</span>
            {photos.length > 0 && (
              <div style={{ ...s.photoGrid, marginTop: 12 }}>
                {photos.map((url, i) => (
                  <img key={`${i}-${url}`} src={url} alt="" onClick={() => setLightbox(url)} style={s.thumb} />
                ))}
              </div>
            )}
            <input ref={generalRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }}
              onChange={e => { handleUpload(e.target.files[0], 'general'); e.target.value = '' }}
            />
            <button onClick={() => generalRef.current?.click()} disabled={uploading === 'general'} style={{ ...s.photoBtn, marginTop: photos.length ? 12 : 12 }}>
              {uploading === 'general' ? 'Uploading…' : '📷 Add site photo'}
            </button>
          </div>
        )}

        {/* ── Site additions ── */}
        <div style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.sectionLabel}>Site Additions</span>
            {additions.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: '#4A6741', background: '#E8F0E6', padding: '2px 8px', borderRadius: 10 }}>
                {additions.length} added
              </span>
            )}
          </div>
          <div style={s.addHint}>Tap anything not in the original scope — notify office when done.</div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {visibleChips.map(label => (
              <button key={label} onClick={() => addAddition(label)} style={s.chip}>+ {label}</button>
            ))}
            {availChips.length > 6 && (
              <button onClick={() => setShowAllChips(p => !p)} style={{ ...s.chip, background: 'transparent', borderStyle: 'dashed', color: '#999' }}>
                {showAllChips ? 'Less' : `+${availChips.length - 6} more`}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: additions.length ? 14 : 0 }}>
            <input
              value={customText}
              onChange={e => setCustomText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && customText.trim()) { addAddition(customText); setCustomText('') } }}
              placeholder="Describe other addition…"
              style={s.customInput}
            />
            <button onClick={() => { addAddition(customText); setCustomText('') }} disabled={!customText.trim()} style={s.addBtn}>
              Add
            </button>
          </div>

          {additions.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {additions.map(a => (
                  <div key={a.id} style={s.additionRow}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#2C2416' }}>{a.label}</div>
                    <div style={s.qtyWrap}>
                      <button onClick={() => updateQty(a.id, -1)} style={s.qtyBtn}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>×{a.qty}</span>
                      <button onClick={() => updateQty(a.id, +1)} style={s.qtyBtn}>+</button>
                    </div>
                    <button onClick={() => removeAddition(a.id)} style={s.removeBtn}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={notifyOffice} disabled={notifyState === 'sending'} style={{
                ...s.notifyBtn,
                background: notifyState === 'sent' ? '#2e7d32' : 'var(--moss)',
                opacity: notifyState === 'sending' ? 0.7 : 1,
              }}>
                {notifyState === 'sending' ? 'Sending…' : notifyState === 'sent' ? '✓ Office notified' : '📤 Notify office of additions'}
              </button>
            </>
          )}
        </div>

        {/* ── Crew private notes ── */}
        <div style={s.section}>
          <div style={s.sectionLabel}>Private Notes</div>
          <div style={{ fontSize: 12, color: '#bbb', marginBottom: 10, marginTop: 4 }}>Your notes — visible to crew only, stays on this device.</div>
          <textarea
            value={crewNotes}
            onChange={e => { setCrewNotes(e.target.value); localStorage.setItem(`treeco_wo_crew_notes_${jobId}`, e.target.value) }}
            placeholder="Site access details, hazards spotted, client preferences, anything useful for the team…"
            rows={5}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '12px 14px',
              borderRadius: 8, border: '1.5px solid #D4DDD0', background: '#FAFAF8',
              fontSize: 14, fontFamily: 'var(--font)', color: '#2C2416',
              lineHeight: 1.6, resize: 'vertical', outline: 'none',
            }}
          />
        </div>

        {/* ── Job complete readiness summary ── */}
        <div style={{
          ...s.card, padding: '14px 16px',
          background: readyToComplete ? '#F0FFF4' : '#FFF8F8',
          border: `1.5px solid ${readyToComplete ? '#2e7d3233' : '#C0392B22'}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: readyToComplete ? '#2e7d32' : '#C0392B', marginBottom: 6 }}>
            {readyToComplete ? '✓ Job ready to mark complete' : 'Complete required items before closing job'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <CheckItem done={formsComplete} label="Required forms completed" />
            {isSD && <CheckItem done={duringPhotos.length > 0} label="During photos uploaded" />}
            {isSD && <CheckItem done={afterPhotos.length > 0} label="After photos uploaded" />}
          </div>
        </div>

        <div style={{ height: 32 }} />
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={s.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button style={s.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <img src={lightbox} alt="" style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

const WO_TOOLS = {
  hedge_trimmers: 'Hedge trimmers', ladder: 'Ladder', pole_saw: 'Pole saw',
  rigging_small: 'Rigging (small)', rigging_large: 'Rigging (large)',
  winch: 'Winch', plywood: 'Plywood', cones: 'Cones', signs: 'Signs',
}
const DIFF_LABEL = ['','Easy','Moderate','Challenging','Difficult','Extreme']
const DIFF_COLORS = { 1: '#2e7d32', 2: '#7FA650', 3: '#D4851A', 4: '#E05C33', 5: '#C0392B' }

function JobPackCard({ pack }) {
  const tools = Object.entries(pack.tools ?? {}).filter(([, v]) => v).map(([k]) => WO_TOOLS[k]).filter(Boolean)
  const equipParts = [
    pack.chipper && pack.chipper !== 'None' ? `Chipper (${pack.chipper})` : null,
    pack.avant    === true ? 'Avant'          : null,
    pack.stump_grinder === true ? 'Stump grinder' : null,
  ].filter(Boolean)

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1.5px solid #4A674122' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#4A6741', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>📋 Job Pack</div>

      {/* Top row: time / staff / difficulty */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        {pack.time_required && (
          <div style={jp.pill}><span style={jp.pillIcon}>⏱</span>{pack.time_required}</div>
        )}
        {pack.staff_count && (
          <div style={jp.pill}><span style={jp.pillIcon}>👥</span>{pack.staff_count} staff</div>
        )}
        {pack.difficulty && (
          <div style={{ ...jp.pill, borderColor: DIFF_COLORS[pack.difficulty] + '55', background: DIFF_COLORS[pack.difficulty] + '11', color: DIFF_COLORS[pack.difficulty] }}>
            <span style={jp.pillIcon}>⭐</span>
            {DIFF_LABEL[pack.difficulty]} ({pack.difficulty}/5)
          </div>
        )}
      </div>

      {/* Equipment */}
      {equipParts.length > 0 && (
        <div style={jp.row}>
          <span style={jp.rowLabel}>Equipment</span>
          <span style={jp.rowValue}>{equipParts.join(' · ')}</span>
        </div>
      )}

      {/* Tools */}
      {tools.length > 0 && (
        <div style={{ ...jp.row, borderBottom: 'none', paddingBottom: 0 }}>
          <span style={jp.rowLabel}>Tools</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map(t => (
              <span key={t} style={jp.tool}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const jp = {
  pill:     { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 20, border: '1.5px solid #D0E4CC', background: '#F0F7EE', fontSize: 13, fontWeight: 600, color: '#2C2416' },
  pillIcon: { fontSize: 14 },
  row:      { display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #F2EFE8' },
  rowLabel: { fontSize: 11, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, width: 72 },
  rowValue: { fontSize: 14, color: '#2C2416', fontWeight: 500 },
  tool:     { fontSize: 12, fontWeight: 600, color: '#4A6741', background: '#E8F0E6', padding: '3px 10px', borderRadius: 12 },
}

function MetaRow({ icon, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14, color: '#2C2416', marginBottom: 8, lineHeight: 1.5 }}>
      <span style={{ flexShrink: 0, width: 18, textAlign: 'center' }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}

function CheckItem({ done, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: done ? '#2e7d32' : '#C0392B' }}>
      <span style={{ fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{done ? '✓' : '✕'}</span>
      <span style={{ fontWeight: done ? 500 : 600 }}>{label}</span>
    </div>
  )
}

function PhotoStrip({ label, labelColor, photos, readonly, uploading, onView, onAdd, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: '#fff', background: labelColor, padding: '3px 10px', borderRadius: 12,
        }}>{label}</span>
        {required && photos.length === 0 && (
          <span style={{ fontSize: 11, color: '#C0392B', fontWeight: 600 }}>required</span>
        )}
        {photos.length > 0 && (
          <span style={{ fontSize: 11, color: '#888' }}>{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {photos.map((url, i) => (
          <img key={`${i}-${url}`} src={url} alt="" onClick={() => onView(url)}
            style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid #E2DDD6', flexShrink: 0 }} />
        ))}
        {!readonly && (
          <button onClick={onAdd} disabled={uploading} style={{
            width: 80, height: 60, borderRadius: 8, border: `2px dashed ${photos.length > 0 ? '#C8D4C4' : labelColor + '88'}`,
            background: photos.length > 0 ? '#FAFAF8' : labelColor + '11',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, flexShrink: 0,
          }}>
            {uploading
              ? <span style={{ fontSize: 10, color: '#888' }}>…</span>
              : <>
                  <span style={{ fontSize: 20 }}>📷</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: labelColor }}>Add</span>
                </>
            }
          </button>
        )}
        {readonly && photos.length === 0 && (
          <span style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>No before photos in quote</span>
        )}
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:    { minHeight: '100dvh', background: '#F5F3F0', fontFamily: 'var(--font)' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: 16, color: '#888', fontFamily: 'var(--font)' },

  header: {
    position: 'sticky', top: 0, zIndex: 50,
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', background: '#fff', borderBottom: '1px solid #E2DDD6',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  backBtn:     { background: 'none', border: 'none', fontSize: 24, color: '#4A6741', cursor: 'pointer', padding: '2px 8px 2px 0', lineHeight: 1, flexShrink: 0 },
  headerTitle: { fontSize: 17, fontWeight: 800, color: '#2C2416' },
  headerSub:   { fontSize: 12, color: '#888', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sdBadge:     { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#2C2416', color: '#fff', padding: '2px 8px', borderRadius: 10 },

  body:   { padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640, margin: '0 auto' },
  card:   { background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  link:   { color: '#4A7FA5', textDecoration: 'none' },

  downerNotice: {
    marginTop: 12, padding: '10px 14px', background: '#EBF3FA', border: '1px solid #4A7FA533',
    borderRadius: 8, fontSize: 13, color: '#2C5F7A', fontWeight: 500, lineHeight: 1.5,
  },

  section:      { background: '#fff', borderRadius: 12, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  sectionHead:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: 700, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.07em' },
  allDone:      { fontSize: 12, fontWeight: 700, color: '#2e7d32' },

  taskRow:    { display: 'flex', gap: 12, paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #F2EFE8' },
  taskBullet: { width: 7, height: 7, borderRadius: '50%', background: '#4A6741', flexShrink: 0, marginTop: 7 },
  taskTitle:  { fontSize: 15, fontWeight: 600, color: '#2C2416', marginBottom: 4 },
  taskDetail: { fontSize: 13, color: '#666', lineHeight: 1.5 },
  descText:   { fontSize: 14, color: '#555', lineHeight: 1.7, whiteSpace: 'pre-wrap' },
  notesBox:   { marginTop: 14, padding: '12px 14px', background: '#FAF8F4', borderRadius: 8, border: '1px solid #E8E4DC' },
  notesLabel: { fontSize: 10, fontWeight: 700, color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  notesText:  { fontSize: 14, color: '#555', lineHeight: 1.6, whiteSpace: 'pre-wrap' },

  photoGate: {
    marginTop: 12, padding: '12px 14px', background: '#FFF8F8', border: '1.5px solid #C0392B33',
    borderRadius: 8, fontSize: 13, color: '#C0392B', fontWeight: 500, lineHeight: 1.5,
  },
  photoGrid: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  thumb:     { width: 80, height: 60, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid #E2DDD6' },
  photoBtn:  {
    padding: '12px 0', background: '#fff', border: '1.5px dashed #D0D9C8',
    borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'var(--font)', color: '#2C2416', width: '100%',
  },

  addHint:    { fontSize: 13, color: '#999', marginBottom: 12, lineHeight: 1.5 },
  chip: {
    padding: '8px 14px', background: '#F0F7EE', border: '1.5px solid #D0E4CC',
    borderRadius: 20, fontSize: 13, fontWeight: 500, color: '#3A5C2E',
    cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  customInput: {
    flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #D4DDD0',
    fontSize: 14, fontFamily: 'var(--font)', color: '#2C2416', background: '#FAFAF8', outline: 'none',
  },
  addBtn: {
    padding: '10px 20px', background: 'var(--moss)', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', flexShrink: 0,
  },
  additionRow: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
    background: '#F6FAF5', borderRadius: 8, border: '1px solid #D0E4CC',
  },
  qtyWrap:  { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 },
  qtyBtn:   { width: 28, height: 28, borderRadius: 6, border: '1px solid #D0D9C8', background: '#fff', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  removeBtn:{ background: 'none', border: 'none', color: '#C8C0B8', fontSize: 14, cursor: 'pointer', padding: '4px', flexShrink: 0 },
  notifyBtn:{
    width: '100%', padding: '14px', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'background 0.2s',
  },

  lightboxOverlay:{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' },
  lightboxClose:  { position: 'absolute', top: 16, right: 20, background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },

  formBar:      { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #E8EDE4', flexShrink: 0 },
  formBack:     { background: 'none', border: '1px solid #D0D9C8', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#4A6741', fontFamily: 'var(--font)', whiteSpace: 'nowrap' },
  formBarTitle: { fontWeight: 700, fontSize: 15, color: '#2C2416', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}
