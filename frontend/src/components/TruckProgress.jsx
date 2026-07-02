import { haversineKm, progressFraction, DEPOT } from '../utils/geo'

// Slim horizontal progress rail showing how far a crew's truck has travelled
// from the depot toward its scheduled job site. Renders nothing without coords.
//
// Props: { vehicle, jobLat, jobLng, statusColor }
//   vehicle     — { registration, name, lat, lng, ignition, ... } from cartrack-positions
//   jobLat/Lng  — geocoded job coords (may be null)
//   statusColor — job status colour for the rail fill
export default function TruckProgress({ vehicle, jobLat, jobLng, statusColor }) {
  if (!vehicle || vehicle.lat == null || vehicle.lng == null) return null
  if (jobLat == null || jobLng == null) return null

  const vehiclePos = { lat: vehicle.lat, lng: vehicle.lng }
  const jobPos     = { lat: jobLat, lng: jobLng }

  const frac = progressFraction(DEPOT, vehiclePos, jobPos)
  const remainingKm = haversineKm(vehiclePos, jobPos)
  const arrived = frac >= 0.995 || (remainingKm != null && remainingKm < 0.15)
  const parked = vehicle.ignition === false

  const color = statusColor ?? '#4A7FA5'
  const label = arrived
    ? 'On site'
    : remainingKm != null
      ? `${remainingKm.toFixed(1)} km away`
      : '—'

  return (
    <div style={t.wrap}>
      <div style={t.track}>
        {/* home / depot dot */}
        <div style={{ ...t.endDot, background: color }} title="Depot" />
        {/* rail */}
        <div style={t.rail}>
          <div style={{ ...t.railFill, width: `${frac * 100}%`, background: color }} />
        </div>
        {/* site pin */}
        <span style={t.sitePin} title="Job site">🌳</span>
        {/* truck slides along the rail */}
        <span
          style={{
            ...t.truck,
            left: `${frac * 100}%`,
            opacity: parked ? 0.45 : 1,
          }}
          title={vehicle.registration}
        >
          🚚
        </span>
      </div>
      <div style={{ ...t.label, color: arrived ? '#3A5C2E' : '#888' }}>
        {parked && !arrived ? 'parked' : label}
      </div>
    </div>
  )
}

const t = {
  wrap: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', minWidth: 0 },
  track: {
    position: 'relative', flex: 1, minWidth: '80px',
    height: '18px', display: 'flex', alignItems: 'center',
    padding: '0 4px',
  },
  endDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, zIndex: 1 },
  rail: {
    position: 'relative', flex: 1, height: '3px', borderRadius: '2px',
    background: '#E2DDD6', margin: '0 2px', overflow: 'hidden',
  },
  railFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: '2px', transition: 'width 2s linear' },
  sitePin: { fontSize: '12px', flexShrink: 0, lineHeight: 1, zIndex: 1 },
  truck: {
    position: 'absolute', top: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '13px', lineHeight: 1,
    transition: 'left 2s linear, opacity 0.3s',
    filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))',
    pointerEvents: 'none', zIndex: 2,
  },
  label: {
    fontSize: '10px', fontWeight: '700', whiteSpace: 'nowrap',
    flexShrink: 0, minWidth: '58px', textAlign: 'right',
  },
}
