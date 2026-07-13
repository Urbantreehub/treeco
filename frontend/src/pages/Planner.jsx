import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { getStatusColor, getStatusLabel } from '../config/statuses'
import {
  clusterByProximity,
  routeDistanceKm,
  batchGeocodeJobs,
  DEPOT,
} from '../utils/geo'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const JOB_SELECT =
  'id, title, address, job_type, status, lat, lng, client_id, clients(name, phone)'

// ---------- small helpers ----------

function nzd(v) {
  if (v == null) return null
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function firstName(name) {
  if (!name) return 'there'
  return String(name).trim().split(/\s+/)[0]
}

function ymd(d) {
  // local YYYY-MM-DD (avoids UTC off-by-one from toISOString)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Next upcoming date (>= today) that falls on the given weekday (0=Sun..6=Sat).
function nextWeekday(weekday) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return ymd(d)
}

// Default run date: whichever of the next Tuesday(2)/Thursday(4) comes first.
function defaultRunDate() {
  const tue = nextWeekday(2)
  const thu = nextWeekday(4)
  return tue <= thu ? tue : thu
}

function niceDate(str) {
  if (!str) return ''
  const [y, m, d] = str.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
}

// ---------- Leaflet map (keyless OSM) ----------

function PlannerMap({ points, centroid }) {
  const elRef = useRef(null)
  const key = useMemo(
    () => (points || []).map(p => `${p.lat},${p.lng}`).join('|'),
    [points]
  )

  useEffect(() => {
    if (!elRef.current) return
    const valid = (points || []).filter(p => p.lat != null && p.lng != null)
    if (!valid.length) return
    let map
    let cancelled = false
    ;(async () => {
      const L = await import('leaflet')
      if (cancelled || !elRef.current) return
      if (!document.getElementById('leaflet-css')) {
        const l = document.createElement('link')
        l.id = 'leaflet-css'
        l.rel = 'stylesheet'
        l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(l)
      }
      const c = centroid || valid[0]
      map = L.map(elRef.current, { zoomControl: false, attributionControl: false }).setView(
        [c.lat, c.lng],
        12
      )
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
      const latlngs = []
      valid.forEach((p, i) => {
        L.marker([p.lat, p.lng]).addTo(map).bindTooltip(String(i + 1), {
          permanent: true,
          direction: 'top',
          className: 'planner-stop-tip',
        })
        latlngs.push([p.lat, p.lng])
      })
      if (latlngs.length > 1) {
        map.fitBounds(latlngs, { padding: [24, 24] })
      }
      // Leaflet sometimes needs a nudge once the container has real size.
      setTimeout(() => { if (map) map.invalidateSize() }, 60)
    })()
    return () => {
      cancelled = true
      if (map) map.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const valid = (points || []).filter(p => p.lat != null && p.lng != null)
  if (!valid.length) {
    return <div style={s.mapEmpty}>No mappable stops</div>
  }
  return <div ref={elRef} style={s.map} />
}

// ---------- Run card ----------

function RunCard({ index, cluster, mode, onSaveRun, onTextClients, savingRun, texting }) {
  const items = cluster.items
  const distance = useMemo(() => routeDistanceKm(items), [items])
  const [runDate, setRunDate] = useState(defaultRunDate())

  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <span style={s.runBadge}>{index + 1}</span>
        <div style={s.cardHeadText}>
          <div style={s.cardTitle}>
            {mode === 'quote' ? 'Quote run' : 'Crew day'} · {items.length} stop{items.length === 1 ? '' : 's'}
          </div>
          <div style={s.cardSub}>
            {distance.toFixed(1)} km round trip
          </div>
        </div>
      </div>

      <PlannerMap points={items} centroid={cluster.centroid} />

      <ol style={s.stopList}>
        {items.map((j, i) => (
          <li key={j.id} style={s.stopRow}>
            <span style={s.stopNum}>{i + 1}</span>
            <div style={s.stopInfo}>
              <div style={s.stopClient}>{j.clients?.name || j.title || 'Unnamed job'}</div>
              {j.address && <div style={s.stopAddr}>{j.address}</div>}
            </div>
            <span
              style={{
                ...s.stopPill,
                background: getStatusColor(j.status) + '18',
                color: getStatusColor(j.status),
              }}
            >
              {getStatusLabel(j.status)}
            </span>
          </li>
        ))}
      </ol>

      <div style={s.cardActions}>
        <label style={s.dateWrap}>
          <span style={s.dateLabel}>Run date</span>
          <input
            type="date"
            value={runDate}
            onChange={e => setRunDate(e.target.value)}
            style={s.dateInput}
          />
        </label>
        <div style={s.actionBtns}>
          <button
            style={{ ...s.primaryBtn, ...(savingRun ? s.btnDisabled : {}) }}
            disabled={savingRun}
            onClick={() => onSaveRun(cluster, runDate)}
          >
            {savingRun ? 'Saving…' : mode === 'quote' ? 'Save as quote run' : 'Save as run'}
          </button>
          {mode === 'quote' && (
            <button
              style={{ ...s.secondaryBtn, ...(texting ? s.btnDisabled : {}) }}
              disabled={texting}
              onClick={() => onTextClients(cluster, runDate)}
            >
              {texting ? 'Texting…' : 'Text clients a heads-up'}
            </button>
          )}
        </div>
      </div>

      {mode === 'work' && (
        <div style={s.cardNote}>
          Tip: drag these onto the crew calendar from the Calendar view to lock in a day.
        </div>
      )}
    </div>
  )
}

// ---------- Main page ----------

export default function Planner() {
  const { session } = useAuth()
  const isMobile = useIsMobile()
  const userId = session?.user?.id ?? null

  const [tab, setTab] = useState('quote') // 'quote' | 'work'
  const [radius, setRadius] = useState(5)
  const [loading, setLoading] = useState(true)
  const [geoStatus, setGeoStatus] = useState(null)

  const [quoteJobs, setQuoteJobs] = useState([])
  const [workJobs, setWorkJobs] = useState([])

  const [savingKey, setSavingKey] = useState(null)
  const [textingKey, setTextingKey] = useState(null)

  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)
  const showToast = useCallback(msg => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  const loadJobs = useCallback(async () => {
    const [quoteRes, workRes] = await Promise.all([
      supabase.from('jobs').select(JOB_SELECT).in('status', ['new_lead', 'quote_scheduled']),
      supabase.from('jobs').select(JOB_SELECT).eq('status', 'accepted_to_schedule'),
    ])
    setQuoteJobs(quoteRes.data || [])
    setWorkJobs(workRes.data || [])
  }, [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await batchGeocodeJobs()
        if (alive && res && res.ok) {
          setGeoStatus(res)
        }
      } catch {
        /* non-fatal */
      }
      try {
        await loadJobs()
      } catch {
        /* handled via empty states */
      }
      if (alive) setLoading(false)
    })()
    return () => {
      alive = false
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [loadJobs])

  const activeJobs = tab === 'quote' ? quoteJobs : workJobs
  const geocoded = useMemo(
    () => activeJobs.filter(j => j.lat != null && j.lng != null),
    [activeJobs]
  )
  const ungeocoded = useMemo(
    () => activeJobs.filter(j => j.lat == null || j.lng == null),
    [activeJobs]
  )
  const clusters = useMemo(
    () => clusterByProximity(geocoded, radius, 8),
    [geocoded, radius]
  )

  const clusterKey = useCallback(
    cluster => cluster.items.map(j => j.id).sort().join(','),
    []
  )

  async function handleSaveRun(cluster, runDate) {
    const key = clusterKey(cluster)
    setSavingKey(key)
    try {
      const { error } = await supabase.from('quote_runs').insert({
        run_date: runDate,
        job_ids: cluster.items.map(j => j.id),
        window: null,
        assigned_to: [],
        notes: null,
        created_by: userId,
      })
      if (error) {
        showToast('Could not save run — please try again')
      } else {
        showToast(`Run saved for ${niceDate(runDate)} (${cluster.items.length} stops)`)
      }
    } catch {
      showToast('Could not save run — please try again')
    } finally {
      setSavingKey(null)
    }
  }

  async function handleTextClients(cluster, runDate) {
    const key = clusterKey(cluster)
    setTextingKey(key)
    const dateLabel = niceDate(runDate)
    let sent = 0
    let skipped = 0
    try {
      for (const j of cluster.items) {
        const phone = j.clients?.phone
        if (!phone) {
          skipped++
          continue
        }
        const message =
          `Hi ${firstName(j.clients?.name)}, Urban Tree Services will be in your area ` +
          `${dateLabel} to quote your tree work — we'll confirm a time. ` +
          `Any questions call 027 203 1446.`
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: ANON,
            Authorization: `Bearer ${ANON}`,
          },
          body: JSON.stringify({ to: phone, message }),
        })
        let data = {}
        try {
          data = await res.json()
        } catch {
          /* ignore parse errors */
        }
        if (data && data.notConfigured) {
          showToast('SMS not set up yet — add Twilio keys in Settings')
          setTextingKey(null)
          return
        }
        if (res.ok && data && data.error == null) {
          sent++
        } else {
          skipped++
        }
      }
      const parts = [`${sent} client${sent === 1 ? '' : 's'} texted`]
      if (skipped) parts.push(`${skipped} skipped (no phone / failed)`)
      showToast(parts.join(' · '))
    } catch {
      showToast('Something went wrong sending texts')
    } finally {
      setTextingKey(null)
    }
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Planner</h1>
          <p style={s.subtitle}>Plan quote runs &amp; schedule work by area</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabsWrap}>
        <div style={s.tabs}>
          <button
            style={{ ...s.tab, ...(tab === 'quote' ? s.tabActive : {}) }}
            onClick={() => setTab('quote')}
          >
            Quote Runs
          </button>
          <button
            style={{ ...s.tab, ...(tab === 'work' ? s.tabActive : {}) }}
            onClick={() => setTab('work')}
          >
            Work Schedule
          </button>
        </div>
      </div>

      <div style={s.body}>
        {/* Work-schedule summary */}
        {tab === 'work' && !loading && (
          <div style={s.summary}>
            <span style={s.summaryNum}>{workJobs.length}</span>
            <span style={s.summaryText}>
              accepted job{workJobs.length === 1 ? '' : 's'} waiting to be scheduled
            </span>
          </div>
        )}

        {/* Radius slider */}
        {!loading && geocoded.length > 0 && (
          <div style={s.sliderCard}>
            <div style={s.sliderTop}>
              <span style={s.sliderLabel}>Cluster radius</span>
              <span style={s.sliderValue}>{radius} km</span>
            </div>
            <input
              type="range"
              min={2}
              max={15}
              step={1}
              value={radius}
              onChange={e => setRadius(Number(e.target.value))}
              style={s.slider}
            />
            <div style={s.sliderHint}>
              {clusters.length} suggested {tab === 'quote' ? 'quote run' : 'crew day'}
              {clusters.length === 1 ? '' : 's'} from {geocoded.length} placed job
              {geocoded.length === 1 ? '' : 's'}
            </div>
          </div>
        )}

        {loading ? (
          <div style={s.empty}>Loading jobs &amp; placing them on the map…</div>
        ) : activeJobs.length === 0 ? (
          <div style={s.empty}>
            {tab === 'quote'
              ? 'No jobs currently need a quote visit. New leads and scheduled quotes will appear here.'
              : 'No accepted jobs are waiting to be scheduled right now.'}
          </div>
        ) : geocoded.length === 0 ? (
          <div style={s.empty}>
            None of these {activeJobs.length} jobs could be placed on the map yet — they need a
            valid address to geocode. Add addresses in the job details and check back.
          </div>
        ) : (
          <div style={{ ...s.runGrid, ...(isMobile ? s.runGridMobile : {}) }}>
            {clusters.map((cluster, i) => {
              const key = clusterKey(cluster)
              return (
                <RunCard
                  key={key}
                  index={i}
                  cluster={cluster}
                  mode={tab === 'quote' ? 'quote' : 'work'}
                  onSaveRun={handleSaveRun}
                  onTextClients={handleTextClients}
                  savingRun={savingKey === key}
                  texting={textingKey === key}
                />
              )
            })}
          </div>
        )}

        {/* Un-geocoded jobs */}
        {!loading && ungeocoded.length > 0 && (
          <div style={s.ungeoCard}>
            <div style={s.ungeoTitle}>
              {ungeocoded.length} job{ungeocoded.length === 1 ? '' : 's'} couldn’t be placed on the map
            </div>
            <div style={s.ungeoHint}>Add or fix the address so these can be clustered into a run.</div>
            <ul style={s.ungeoList}>
              {ungeocoded.map(j => (
                <li key={j.id} style={s.ungeoItem}>
                  <span style={s.ungeoClient}>{j.clients?.name || j.title || 'Unnamed job'}</span>
                  <span style={s.ungeoAddr}>{j.address || 'No address on file'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  )
}

const s = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--cream)' },

  header: {
    background: '#fff', borderBottom: '1px solid var(--border)',
    padding: '16px 20px 12px', flexShrink: 0,
  },
  title: { fontSize: '20px', fontWeight: '700', color: 'var(--bark)' },
  subtitle: { fontSize: '13px', color: '#8a8478', marginTop: '2px' },

  tabsWrap: {
    background: '#fff', borderBottom: '1px solid var(--border)',
    padding: '0 20px 12px', flexShrink: 0,
  },
  tabs: {
    display: 'inline-flex', background: 'var(--cream)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '3px', gap: '3px', maxWidth: '100%',
  },
  tab: {
    flex: 1, padding: '8px 18px', border: 'none', background: 'transparent',
    color: '#8a8478', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    borderRadius: '8px', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  tabActive: { background: 'var(--moss)', color: '#fff' },

  body: { flex: 1, overflowY: 'auto', padding: '16px 20px 40px' },

  summary: {
    display: 'flex', alignItems: 'baseline', gap: '8px',
    background: 'var(--moss-pale)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: '14px',
  },
  summaryNum: { fontSize: '22px', fontWeight: '800', color: 'var(--moss)' },
  summaryText: { fontSize: '13px', color: 'var(--bark-mid)' },

  sliderCard: {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '14px 16px', marginBottom: '16px',
  },
  sliderTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  sliderLabel: { fontSize: '13px', fontWeight: '600', color: 'var(--bark)' },
  sliderValue: {
    fontSize: '13px', fontWeight: '700', color: 'var(--moss)',
    background: 'var(--moss-pale)', borderRadius: '20px', padding: '2px 10px',
  },
  slider: { width: '100%', accentColor: 'var(--moss)', cursor: 'pointer' },
  sliderHint: { fontSize: '12px', color: '#8a8478', marginTop: '8px' },

  runGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px',
  },
  runGridMobile: { gridTemplateColumns: '1fr' },

  card: {
    background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
    padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px',
  },
  cardHead: { display: 'flex', alignItems: 'center', gap: '10px' },
  runBadge: {
    width: '30px', height: '30px', borderRadius: '50%', background: 'var(--moss)',
    color: '#fff', fontSize: '14px', fontWeight: '800', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardHeadText: { minWidth: 0 },
  cardTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--bark)' },
  cardSub: { fontSize: '12px', color: '#8a8478', marginTop: '2px' },

  map: { height: '180px', width: '100%', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--moss-pale)' },
  mapEmpty: {
    height: '180px', width: '100%', borderRadius: 'var(--radius)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--moss-pale)', color: '#8a8478', fontSize: '12px',
  },

  stopList: { listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px', margin: 0, padding: 0 },
  stopRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  stopNum: {
    width: '20px', height: '20px', borderRadius: '50%', background: 'var(--moss-pale)',
    color: 'var(--moss)', fontSize: '11px', fontWeight: '700', display: 'flex',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stopInfo: { flex: 1, minWidth: 0 },
  stopClient: { fontSize: '13px', fontWeight: '600', color: 'var(--bark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stopAddr: { fontSize: '11px', color: '#aaa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  stopPill: { fontSize: '10px', fontWeight: '600', borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 },

  cardActions: {
    display: 'flex', flexDirection: 'column', gap: '10px',
    borderTop: '1px solid var(--border)', paddingTop: '12px',
  },
  dateWrap: { display: 'flex', alignItems: 'center', gap: '8px' },
  dateLabel: { fontSize: '12px', fontWeight: '600', color: 'var(--bark-mid)' },
  dateInput: {
    flex: 1, padding: '7px 10px', borderRadius: '8px', border: '1.5px solid var(--border)',
    fontSize: '13px', fontFamily: 'var(--font)', color: 'var(--bark)', background: 'var(--cream)', outline: 'none',
  },
  actionBtns: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  primaryBtn: {
    flex: 1, background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: '8px',
    padding: '9px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    flex: 1, background: 'var(--amber-pale)', color: 'var(--amber)', border: '1px solid var(--amber)',
    borderRadius: '8px', padding: '9px 14px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    fontFamily: 'var(--font)', whiteSpace: 'nowrap',
  },
  btnDisabled: { opacity: 0.55, cursor: 'default' },
  cardNote: { fontSize: '11px', color: '#8a8478', fontStyle: 'italic' },

  ungeoCard: {
    marginTop: '20px', background: '#fff', border: '1px dashed var(--border)',
    borderRadius: 'var(--radius)', padding: '14px 16px',
  },
  ungeoTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--bark-mid)' },
  ungeoHint: { fontSize: '12px', color: '#8a8478', marginTop: '2px', marginBottom: '10px' },
  ungeoList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' },
  ungeoItem: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12px' },
  ungeoClient: { fontWeight: '600', color: 'var(--bark)' },
  ungeoAddr: { color: '#aaa', textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },

  empty: { textAlign: 'center', color: '#b7b1a6', padding: '50px 20px', fontSize: '14px', lineHeight: 1.5 },

  toast: {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: 'var(--bark)', color: '#fff', padding: '11px 20px', borderRadius: '24px',
    fontSize: '13px', fontWeight: '500', boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
    zIndex: 1000, maxWidth: '90vw', textAlign: 'center',
  },
}
