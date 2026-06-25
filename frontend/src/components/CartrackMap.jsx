import { useEffect, useRef, useState } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const REFRESH_MS   = 30_000

const VEHICLES = {
  GWL756: { name: 'Isuzu Elf', icon: '🚛' },
  WA2244: { name: 'Nissan Diesel', icon: '🚚' },
}

function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' })
}

export default function CartrackMap() {
  const mapRef      = useRef(null)
  const leafletRef  = useRef(null)   // L instance
  const mapObjRef   = useRef(null)   // map instance
  const markersRef  = useRef({})     // { reg: marker }
  const [vehicles, setVehicles]   = useState([])
  const [error, setError]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  async function fetchPositions() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/cartrack-positions`, {
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setVehicles(data.vehicles ?? [])
      setError(null)
      setLastUpdated(new Date())
      return data.vehicles ?? []
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  // Init Leaflet once map div is ready
  useEffect(() => {
    let L
    let destroyed = false

    async function init() {
      // Dynamic import — Leaflet needs DOM
      L = await import('leaflet')
      leafletRef.current = L

      if (destroyed || !mapRef.current) return

      // Add Leaflet CSS dynamically
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false })
      mapObjRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Fetch initial positions and fit map
      const vehs = await fetchPositions()
      if (vehs && vehs.length > 0 && !destroyed) {
        updateMarkers(L, map, vehs)
        const pts = vehs.map(v => [v.lat, v.lng])
        map.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })
      } else {
        // Default to Lower Hutt
        map.setView([-41.21, 174.91], 12)
      }
    }

    init()

    // Poll every 30s
    const interval = setInterval(async () => {
      const vehs = await fetchPositions()
      if (vehs && mapObjRef.current && leafletRef.current) {
        updateMarkers(leafletRef.current, mapObjRef.current, vehs)
      }
    }, REFRESH_MS)

    return () => {
      destroyed = true
      clearInterval(interval)
      mapObjRef.current?.remove()
      mapObjRef.current = null
    }
  }, [])

  function updateMarkers(L, map, vehs) {
    vehs.forEach(v => {
      const info = VEHICLES[v.registration] ?? { name: v.registration, icon: '🚗' }
      const html = `
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;
            background:${v.ignition ? '#22c55e' : '#94a3b8'};border-radius:50%;border:3px solid white;
            box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:20px">
            ${info.icon}
          </div>
          <div style="background:rgba(0,0,0,0.7);color:#fff;font-size:10px;font-weight:700;
            padding:2px 6px;border-radius:4px;white-space:nowrap;letter-spacing:0.02em">
            ${info.name.split(' ')[0]}
          </div>
        </div>`
      const icon = L.divIcon({ html, className: '', iconSize: [40, 60], iconAnchor: [20, 20] })

      const popup = `
        <div style="font-family:system-ui;min-width:180px">
          <div style="font-weight:700;font-size:14px">${info.icon} ${info.name}</div>
          <div style="color:#64748b;font-size:12px;margin-bottom:6px">${v.registration}</div>
          <div style="font-size:12px">${v.address}</div>
          <div style="margin-top:6px;display:flex;gap:8px;font-size:11px">
            <span style="background:${v.ignition ? '#dcfce7' : '#f1f5f9'};color:${v.ignition ? '#166534' : '#475569'};
              padding:2px 6px;border-radius:4px">${v.ignition ? 'Engine on' : 'Parked'}</span>
            <span style="color:#64748b">Updated ${fmtTime(v.lastSeen)}</span>
          </div>
          ${v.odometer ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px">${v.odometer.toLocaleString()} km odometer</div>` : ''}
        </div>`

      if (markersRef.current[v.registration]) {
        markersRef.current[v.registration].setLatLng([v.lat, v.lng]).setIcon(icon).bindPopup(popup)
      } else {
        const marker = L.marker([v.lat, v.lng], { icon }).addTo(map).bindPopup(popup)
        markersRef.current[v.registration] = marker
      }
    })
  }

  return (
    <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--line)' }}>
      {/* Map container */}
      <div ref={mapRef} style={{ height: '340px', width: '100%', background: '#e2e8f0' }} />

      {/* Loading overlay */}
      {loading && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(255,255,255,0.8)', fontSize:'13px', color:'var(--bark)' }}>
          Loading fleet positions…
        </div>
      )}

      {/* Error overlay */}
      {error && !loading && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(255,255,255,0.9)', flexDirection:'column', gap:'8px' }}>
          <div style={{ fontSize:'13px', color:'#ef4444' }}>Could not load GPS data</div>
          <div style={{ fontSize:'11px', color:'#94a3b8', maxWidth:'240px', textAlign:'center' }}>{error}</div>
        </div>
      )}

      {/* Vehicle status bar */}
      {vehicles.length > 0 && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0,
          background:'rgba(255,255,255,0.95)', padding:'8px 12px',
          display:'flex', gap:'16px', alignItems:'center', borderTop:'1px solid var(--line)' }}>
          {vehicles.map(v => {
            const info = VEHICLES[v.registration] ?? { icon: '🚗', name: v.registration }
            return (
              <div key={v.registration} style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px' }}>
                <span style={{ width:8, height:8, borderRadius:'50%',
                  background: v.ignition ? '#22c55e' : '#94a3b8', display:'inline-block' }} />
                <span style={{ fontWeight:600 }}>{info.icon} {v.registration}</span>
                <span style={{ color:'#64748b', maxWidth:'160px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {v.address.split(',').slice(0,2).join(',')}
                </span>
              </div>
            )
          })}
          {lastUpdated && (
            <span style={{ marginLeft:'auto', fontSize:'11px', color:'#94a3b8' }}>
              Updated {fmtTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
