import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'

// Mulch dump sites: live map + pins, photos, dump instructions, contact and
// agreed per-load price. Crew log a dumped load, which auto-generates a Xero
// DRAFT invoice for the agreed price (via the mulch-invoice edge function).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const fnHeaders = { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }
const nzd = (v) => '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime(), m = Math.floor(diff / 6e4), h = Math.floor(m / 60), day = Math.floor(h / 24)
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; if (h < 24) return `${h}h ago`
  if (day < 30) return `${day}d ago`; return new Date(d).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })
}

// ── Leaflet map of all sites ────────────────────────────────────────────────
function SitesMap({ sites, activeId, onPick }) {
  const elRef = useRef(null), mapRef = useRef(null), layerRef = useRef(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = await import('leaflet')
      if (cancelled) return
      if (!document.getElementById('leaflet-css')) {
        const l = document.createElement('link'); l.id = 'leaflet-css'; l.rel = 'stylesheet'
        l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l)
      }
      if (!mapRef.current && elRef.current) {
        mapRef.current = L.map(elRef.current, { zoomControl: false, attributionControl: false }).setView([-41.2865, 174.7762], 11)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapRef.current)
      }
      const map = mapRef.current
      if (layerRef.current) { layerRef.current.remove(); layerRef.current = null }
      const pins = sites.filter(s => s.lat != null && s.lng != null)
      if (!pins.length) return
      const group = L.layerGroup()
      const bounds = []
      pins.forEach(s => {
        const active = s.id === activeId
        const marker = L.circleMarker([s.lat, s.lng], {
          radius: active ? 11 : 8, color: '#fff', weight: 2,
          fillColor: active ? '#8B6238' : '#4A6741', fillOpacity: 1,
        }).addTo(group).bindTooltip(s.name)
        marker.on('click', () => onPick(s.id))
        bounds.push([s.lat, s.lng])
      })
      group.addTo(map); layerRef.current = group
      if (bounds.length === 1) map.setView(bounds[0], 13)
      else map.fitBounds(bounds, { padding: [40, 40] })
    })()
    return () => { cancelled = true }
  }, [sites, activeId, onPick])
  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])
  return <div ref={elRef} style={mstyle.map} />
}

export default function MulchDump() {
  const { profile, isStaff } = useAuth()
  const isMobile = useIsMobile()
  const meId = profile?.id
  const [sites, setSites] = useState([])
  const [dumps, setDumps] = useState({})      // site_id -> [dumps]
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState(null)
  const [editing, setEditing] = useState(null) // site object | 'new' | null
  const [toast, setToast] = useState(null)
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3200) }

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('mulch_sites').select('*').eq('active', true).order('name')
    setSites(s || [])
    const { data: d } = await supabase.from('mulch_dumps')
      .select('*, users:dumped_by ( name )').order('dumped_at', { ascending: false })
    const bySite = {}
    ;(d || []).forEach(x => { (bySite[x.site_id] ||= []).push(x) })
    setDumps(bySite)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const active = sites.find(s => s.id === activeId) || null

  async function logDump(site, note, photoUrl) {
    const { data, error } = await supabase.from('mulch_dumps')
      .insert({ site_id: site.id, dumped_by: meId, price: site.price_per_load, load_note: note || null, photo_url: photoUrl || null })
      .select('*, users:dumped_by ( name )').single()
    if (error) { showToast('Could not log the dump — try again'); return }
    setDumps(prev => ({ ...prev, [site.id]: [data, ...(prev[site.id] || [])] }))
    showToast('Load logged ✓ — generating invoice…')
    // Auto-generate the Xero draft invoice.
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/mulch-invoice`, { method: 'POST', headers: fnHeaders, body: JSON.stringify({ dump_id: data.id }) })
      const body = await res.json()
      if (body.ok && body.skipped) showToast('Load logged (price is $0 — no invoice)')
      else if (body.ok) { showToast(`Load logged ✓ Xero draft invoice ${body.invoice_number || 'created'}`); load() }
      else showToast(`Load logged, but invoice failed: ${body.error?.slice(0, 60) || 'Xero error'}`)
    } catch {
      showToast('Load logged — invoice will need to be retried')
    }
  }

  async function retryInvoice(dump) {
    showToast('Retrying invoice…')
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mulch-invoice`, { method: 'POST', headers: fnHeaders, body: JSON.stringify({ dump_id: dump.id }) })
    const body = await res.json()
    if (body.ok) { showToast('Invoice created ✓'); load() } else showToast(`Still failing: ${body.error?.slice(0, 60)}`)
  }

  return (
    <div style={mstyle.page}>
      <div style={mstyle.header}>
        <div>
          <div style={mstyle.title}>Mulch Dump Sites</div>
          <div style={mstyle.sub}>{sites.length} active site{sites.length === 1 ? '' : 's'}</div>
        </div>
        {isStaff && <button style={mstyle.addBtn} onClick={() => setEditing('new')}>+ Add site</button>}
      </div>

      <div style={{ ...mstyle.body, flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ ...mstyle.left, width: isMobile ? '100%' : '340px' }}>
          {!isMobile && <SitesMap sites={sites} activeId={activeId} onPick={setActiveId} />}
          {loading ? <div style={mstyle.empty}>Loading…</div>
            : sites.length === 0 ? <div style={mstyle.empty}>No dump sites yet.{isStaff ? ' Add one to get started.' : ''}</div>
            : (
              <div style={mstyle.list}>
                {sites.map(s => {
                  const last = dumps[s.id]?.[0]
                  return (
                    <button key={s.id} style={{ ...mstyle.siteRow, ...(activeId === s.id ? mstyle.siteRowActive : {}) }} onClick={() => setActiveId(s.id)}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={mstyle.siteName}>{s.name}</div>
                        <div style={mstyle.siteMeta}>{s.address || 'No address'} · {nzd(s.price_per_load)}/load</div>
                        {last && <div style={mstyle.siteLast}>Last dump {timeAgo(last.dumped_at)}</div>}
                      </div>
                      {s.photos?.[0] && <img src={s.photos[0]} alt="" style={mstyle.siteThumb} />}
                    </button>
                  )
                })}
              </div>
            )}
        </div>

        <div style={mstyle.detailPane}>
          {active
            ? <SiteDetail site={active} dumps={dumps[active.id] || []} isStaff={isStaff} onLog={logDump} onRetry={retryInvoice} onEdit={() => setEditing(active)} showToast={showToast} />
            : <div style={mstyle.placeholder}>Select a site to see details, photos & log a load</div>}
        </div>
      </div>

      {editing && <SiteEditor site={editing === 'new' ? null : editing} meId={meId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} showToast={showToast} />}
      {toast && <div style={mstyle.toast}>{toast}</div>}
    </div>
  )
}

// ── Site detail + log-a-load ────────────────────────────────────────────────
function SiteDetail({ site, dumps, isStaff, onLog, onRetry, onEdit, showToast }) {
  const [lightbox, setLightbox] = useState(null)
  const [logging, setLogging] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [photo, setPhoto] = useState(null)
  const fileRef = useRef(null)

  async function uploadPhoto(file) {
    const path = `dumps/${site.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    const { error } = await supabase.storage.from('mulch-media').upload(path, file, { upsert: false })
    if (error) { showToast('Photo upload failed'); return null }
    return supabase.storage.from('mulch-media').getPublicUrl(path).data.publicUrl
  }

  async function submit() {
    setBusy(true)
    let photoUrl = null
    if (photo) photoUrl = await uploadPhoto(photo)
    await onLog(site, note, photoUrl)
    setBusy(false); setLogging(false); setNote(''); setPhoto(null)
  }

  return (
    <div style={mstyle.detail}>
      <div style={mstyle.detailHead}>
        <div style={mstyle.detailName}>{site.name}</div>
        {isStaff && <button style={mstyle.editLink} onClick={onEdit}>Edit</button>}
      </div>

      {site.photos?.length > 0 && (
        <div style={mstyle.photoStrip}>
          {site.photos.map((url, i) => (
            <img key={i} src={url} alt="" style={mstyle.photo} onClick={() => setLightbox(url)} />
          ))}
        </div>
      )}

      {site.instructions && (
        <div style={mstyle.card}>
          <div style={mstyle.cardLabel}>📍 Where to dump</div>
          <div style={mstyle.cardText}>{site.instructions}</div>
        </div>
      )}

      <div style={mstyle.infoGrid}>
        <div style={mstyle.infoBox}>
          <div style={mstyle.cardLabel}>Agreed price</div>
          <div style={mstyle.price}>{nzd(site.price_per_load)}<span style={mstyle.perLoad}> / load</span></div>
        </div>
        <div style={mstyle.infoBox}>
          <div style={mstyle.cardLabel}>Contact</div>
          <div style={mstyle.cardText}>{site.contact_name || '—'}</div>
          {site.contact_phone && <a href={`tel:${site.contact_phone.replace(/\s/g, '')}`} style={mstyle.contactLink}>📞 {site.contact_phone}</a>}
          {site.contact_email && <a href={`mailto:${site.contact_email}`} style={mstyle.contactLink}>✉ {site.contact_email}</a>}
        </div>
      </div>
      {site.address && <div style={mstyle.addr}>🗺 {site.address}</div>}

      {/* Log a load */}
      {!logging ? (
        <button style={mstyle.logBtn} onClick={() => setLogging(true)}>🚛 I dumped a load here</button>
      ) : (
        <div style={mstyle.logCard}>
          <div style={mstyle.cardLabel}>Log a dumped load</div>
          <div style={mstyle.logHint}>This creates a Xero draft invoice for {nzd(site.price_per_load)} to {site.contact_name || site.name}.</div>
          <textarea style={mstyle.textarea} placeholder="Note (optional) — e.g. full truck load, left by the gate" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setPhoto(e.target.files?.[0] || null)} />
          <button style={mstyle.photoBtn} onClick={() => fileRef.current?.click()}>{photo ? `📷 ${photo.name.slice(0, 20)}` : '📷 Add photo (optional)'}</button>
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button style={{ ...mstyle.confirmBtn, opacity: busy ? 0.6 : 1 }} onClick={submit} disabled={busy}>{busy ? 'Logging…' : 'Confirm dump'}</button>
            <button style={mstyle.cancelBtn} onClick={() => { setLogging(false); setNote(''); setPhoto(null) }} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {/* Dump history */}
      <div style={mstyle.cardLabel}>Recent loads ({dumps.length})</div>
      {dumps.length === 0 ? <div style={mstyle.empty2}>No loads logged yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {dumps.slice(0, 20).map(d => (
            <div key={d.id} style={mstyle.dumpRow}>
              <div style={{ flex: 1 }}>
                <div style={mstyle.dumpTop}>{nzd(d.price)} · {timeAgo(d.dumped_at)} · {d.users?.name || 'Crew'}</div>
                {d.load_note && <div style={mstyle.dumpNote}>{d.load_note}</div>}
                <InvoicePill dump={d} isStaff={isStaff} onRetry={onRetry} />
              </div>
              {d.photo_url && <img src={d.photo_url} alt="" style={mstyle.dumpThumb} onClick={() => setLightbox(d.photo_url)} />}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div style={mstyle.lightbox} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" style={mstyle.lightboxImg} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

function InvoicePill({ dump, isStaff, onRetry }) {
  const S = {
    invoiced: { t: `Invoiced ${dump.xero_invoice_number || ''}`.trim(), bg: '#E6F4EC', c: '#2F5233' },
    pending:  { t: 'Invoice pending', bg: '#FDF3E3', c: '#D4851A' },
    skipped:  { t: 'No invoice ($0)', bg: '#F0EDE8', c: '#888' },
    error:    { t: 'Invoice failed', bg: '#FFF0EE', c: '#C0392B' },
  }
  const s = S[dump.invoice_status] || S.pending
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
      <span style={{ ...mstyle.pill, background: s.bg, color: s.c }}>{s.t}</span>
      {dump.xero_invoice_url && <a href={dump.xero_invoice_url} target="_blank" rel="noreferrer" style={mstyle.viewInvoice}>View in Xero →</a>}
      {isStaff && dump.invoice_status === 'error' && <button style={mstyle.retryBtn} onClick={() => onRetry(dump)}>Retry</button>}
    </div>
  )
}

// ── Add / edit a site ───────────────────────────────────────────────────────
function SiteEditor({ site, meId, onClose, onSaved, showToast }) {
  const [f, setF] = useState(() => site || { name: '', address: '', instructions: '', contact_name: '', contact_phone: '', contact_email: '', price_per_load: '', notes: '', photos: [] })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }))

  async function addPhotos(files) {
    setUploading(true)
    const urls = []
    for (const file of files) {
      const path = `sites/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error } = await supabase.storage.from('mulch-media').upload(path, file)
      if (!error) urls.push(supabase.storage.from('mulch-media').getPublicUrl(path).data.publicUrl)
    }
    setF(prev => ({ ...prev, photos: [...(prev.photos || []), ...urls] }))
    setUploading(false)
  }

  async function save() {
    if (!f.name.trim()) { showToast('Give the site a name'); return }
    setSaving(true)
    const payload = {
      name: f.name.trim(), address: f.address?.trim() || null, instructions: f.instructions?.trim() || null,
      contact_name: f.contact_name?.trim() || null, contact_phone: f.contact_phone?.trim() || null,
      contact_email: f.contact_email?.trim() || null, price_per_load: Number(f.price_per_load) || 0,
      notes: f.notes?.trim() || null, photos: f.photos || [],
    }
    let siteId = site?.id
    if (site) {
      const { error } = await supabase.from('mulch_sites').update(payload).eq('id', site.id)
      if (error) { showToast('Save failed'); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('mulch_sites').insert({ ...payload, created_by: meId }).select('id').single()
      if (error) { showToast('Save failed'); setSaving(false); return }
      siteId = data.id
    }
    // Geocode the address (best-effort, cached on the row).
    if (payload.address && siteId) {
      fetch(`${SUPABASE_URL}/functions/v1/geocode`, { method: 'POST', headers: fnHeaders, body: JSON.stringify({ address: payload.address }) })
        .then(r => r.json()).then(g => { if (g.ok) supabase.from('mulch_sites').update({ lat: g.lat, lng: g.lng }).eq('id', siteId) }).catch(() => {})
    }
    setSaving(false); showToast(site ? 'Site updated ✓' : 'Site added ✓'); onSaved()
  }

  return (
    <div style={mstyle.modalOverlay} onClick={onClose}>
      <div style={mstyle.modal} onClick={e => e.stopPropagation()}>
        <div style={mstyle.modalHead}>
          <div style={mstyle.modalTitle}>{site ? 'Edit site' : 'Add dump site'}</div>
          <button style={mstyle.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={mstyle.modalBody}>
          <label style={mstyle.fLabel}>Site name *</label>
          <input style={mstyle.input} value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Dave's lifestyle block" />
          <label style={mstyle.fLabel}>Address</label>
          <input style={mstyle.input} value={f.address} onChange={e => set('address', e.target.value)} placeholder="Street, suburb — used to place the map pin" />
          <label style={mstyle.fLabel}>Dump instructions</label>
          <textarea style={mstyle.textarea} rows={3} value={f.instructions} onChange={e => set('instructions', e.target.value)} placeholder="Where exactly to dump it, gate codes, access notes…" />
          <label style={mstyle.fLabel}>Agreed price per load (ex GST)</label>
          <input style={mstyle.input} type="number" inputMode="decimal" value={f.price_per_load} onChange={e => set('price_per_load', e.target.value)} placeholder="e.g. 40" />
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}><label style={mstyle.fLabel}>Contact name</label><input style={mstyle.input} value={f.contact_name} onChange={e => set('contact_name', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={mstyle.fLabel}>Phone</label><input style={mstyle.input} value={f.contact_phone} onChange={e => set('contact_phone', e.target.value)} /></div>
          </div>
          <label style={mstyle.fLabel}>Contact email</label>
          <input style={mstyle.input} value={f.contact_email} onChange={e => set('contact_email', e.target.value)} placeholder="Used on the Xero invoice" />
          <label style={mstyle.fLabel}>Photos</label>
          <div style={mstyle.photoStrip}>
            {(f.photos || []).map((url, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt="" style={mstyle.photo} />
                <button style={mstyle.removePhoto} onClick={() => set('photos', f.photos.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => addPhotos(Array.from(e.target.files || []))} />
          <button style={mstyle.photoBtn} onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? 'Uploading…' : '＋ Add photos'}</button>
        </div>
        <div style={mstyle.modalFoot}>
          <button style={mstyle.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...mstyle.confirmBtn, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save site'}</button>
        </div>
      </div>
    </div>
  )
}

const mstyle = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--cream)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 },
  title: { fontSize: '18px', fontWeight: '700', color: 'var(--bark)' },
  sub: { fontSize: '12px', color: '#999', marginTop: '2px' },
  addBtn: { padding: '9px 16px', borderRadius: '9px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },

  body: { flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' },
  left: { display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: '#fff', overflowY: 'auto', flexShrink: 0 },
  map: { height: '220px', width: '100%', flexShrink: 0, background: '#dfe6df' },
  list: { display: 'flex', flexDirection: 'column' },
  siteRow: { display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left', width: '100%' },
  siteRowActive: { background: 'var(--moss-pale)' },
  siteName: { fontSize: '14px', fontWeight: '700', color: 'var(--bark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  siteMeta: { fontSize: '12px', color: '#888', marginTop: '2px' },
  siteLast: { fontSize: '11px', color: '#8B6238', marginTop: '2px' },
  siteThumb: { width: '46px', height: '46px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 },

  detailPane: { flex: 1, overflowY: 'auto', minWidth: 0 },
  placeholder: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#bbb', fontSize: '14px', padding: '40px', textAlign: 'center' },
  detail: { padding: '20px', maxWidth: '620px' },
  detailHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  detailName: { fontSize: '20px', fontWeight: '700', color: 'var(--bark)' },
  editLink: { background: 'none', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 12px', fontSize: '13px', color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },

  photoStrip: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' },
  photo: { width: '96px', height: '96px', borderRadius: '10px', objectFit: 'cover', cursor: 'pointer', border: '1px solid var(--border)' },
  removePhoto: { position: 'absolute', top: '-6px', right: '-6px', width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: 'var(--danger)', color: '#fff', fontSize: '11px', cursor: 'pointer' },

  card: { background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '12px' },
  cardLabel: { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' },
  cardText: { fontSize: '14px', color: 'var(--bark)', lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  infoGrid: { display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' },
  infoBox: { flex: 1, minWidth: '160px', background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' },
  price: { fontSize: '22px', fontWeight: '800', color: 'var(--moss)' },
  perLoad: { fontSize: '13px', fontWeight: '600', color: '#aaa' },
  contactLink: { display: 'block', fontSize: '13px', color: 'var(--sky)', textDecoration: 'none', marginTop: '4px' },
  addr: { fontSize: '13px', color: '#888', marginBottom: '16px' },

  logBtn: { width: '100%', padding: '16px', borderRadius: '12px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', marginBottom: '20px', boxShadow: '0 2px 8px rgba(74,103,65,0.3)' },
  logCard: { background: '#fff', border: '1.5px solid var(--moss)', borderRadius: '12px', padding: '16px', marginBottom: '20px' },
  logHint: { fontSize: '12px', color: '#888', marginBottom: '10px', lineHeight: 1.4 },
  textarea: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', marginBottom: '8px' },
  photoBtn: { width: '100%', padding: '11px', borderRadius: '8px', border: '1.5px dashed var(--border)', background: '#FAFAF8', color: '#777', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)' },
  confirmBtn: { flex: 1, padding: '12px', borderRadius: '9px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { padding: '12px 18px', borderRadius: '9px', border: '1px solid var(--border)', background: '#fff', color: '#888', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font)' },

  empty: { padding: '30px 16px', textAlign: 'center', color: '#aaa', fontSize: '14px' },
  empty2: { color: '#bbb', fontSize: '13px', padding: '4px 0 12px' },
  dumpRow: { display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#fff', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' },
  dumpTop: { fontSize: '13px', fontWeight: '600', color: 'var(--bark)' },
  dumpNote: { fontSize: '12px', color: '#888', marginTop: '2px' },
  dumpThumb: { width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', cursor: 'pointer', flexShrink: 0 },
  pill: { fontSize: '11px', fontWeight: '700', borderRadius: '10px', padding: '2px 9px' },
  viewInvoice: { fontSize: '12px', color: 'var(--sky)', textDecoration: 'none', fontWeight: '600' },
  retryBtn: { fontSize: '12px', border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', borderRadius: '7px', padding: '2px 8px', cursor: 'pointer', fontFamily: 'var(--font)' },

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
  modal: { background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '520px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  modalHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  modalTitle: { fontSize: '17px', fontWeight: '700', color: 'var(--bark)' },
  closeBtn: { background: 'none', border: 'none', fontSize: '18px', color: '#999', cursor: 'pointer' },
  modalBody: { padding: '16px 20px', overflowY: 'auto' },
  fLabel: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#777', margin: '10px 0 4px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '14px', fontFamily: 'var(--font)', color: 'var(--bark)', outline: 'none', boxSizing: 'border-box' },
  modalFoot: { display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)' },
  lightbox: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' },
  lightboxImg: { maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '6px' },
  toast: { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--bark)', color: '#fff', padding: '11px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 700, maxWidth: '90vw', textAlign: 'center' },
}
