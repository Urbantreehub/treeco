import { useEffect, useRef, useState } from 'react'

// Keyless OSM address autocomplete (Photon — photon.komoot.io), biased to
// Wellington and filtered to New Zealand. As the user types we suggest real,
// existing addresses; picking one hands the caller back the normalized address
// AND its lat/lng via onResolve. Storing those coords at input time is what lets
// the Planner place the job on the map without a separate best-effort geocode
// pass — which is where free-text addresses were silently failing before.
//
// Graceful degradation: if the suggest service is unreachable, the field still
// works as a plain text input and the existing edge-function geocode remains the
// fallback for any address entered without picking a suggestion.

const PHOTON = 'https://photon.komoot.io/api/'
const BIAS = { lat: -41.2865, lon: 174.7762 } // Wellington depot

function formatFeature(f) {
  const p = f.properties || {}
  const line1 = [p.housenumber, p.street].filter(Boolean).join(' ')
  const parts = [line1 || p.name, p.suburb || p.district, p.city || p.town || p.village, p.postcode]
  const out = []
  for (const part of parts) if (part && !out.includes(part)) out.push(part)
  return out.join(', ')
}

function isNZ(f) {
  const cc = (f.properties?.countrycode || '').toUpperCase()
  return cc === 'NZ' || /new zealand/i.test(f.properties?.country || '')
}

export default function AddressInput({
  value, onChange, onResolve, placeholder, inputStyle, autoFocus, disabled,
}) {
  const [query, setQuery]           = useState(value ?? '')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen]             = useState(false)
  const [loading, setLoading]       = useState(false)
  const [verified, setVerified]     = useState(false)
  const boxRef   = useRef(null)
  const skipNext = useRef(false) // don't re-search right after a pick / external set

  // Keep in sync only on a genuine EXTERNAL reset (e.g. modal reopened with a
  // different value). We must not react to the parent echoing back our own
  // onChange — value === query in that case — otherwise skipNext would suppress
  // the search on every keystroke and no suggestions would ever load.
  useEffect(() => {
    if ((value ?? '') !== query) {
      skipNext.current = true
      setQuery(value ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return }
    const q = query.trim()
    if (q.length < 4) { setSuggestions([]); setOpen(false); return }

    const ctrl = new AbortController()
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6&lat=${BIAS.lat}&lon=${BIAS.lon}`
        const res = await fetch(url, { signal: ctrl.signal })
        const data = await res.json()
        const out = []
        for (const f of data.features || []) {
          if (!isNZ(f)) continue
          const label = formatFeature(f)
          const lat = f.geometry?.coordinates?.[1]
          const lng = f.geometry?.coordinates?.[0]
          if (!label || lat == null || lng == null) continue
          if (out.some(s => s.label === label)) continue
          out.push({ label, lat, lng })
        }
        setSuggestions(out)
        setOpen(out.length > 0)
      } catch {
        /* network / abort — leave as plain text input */
      } finally {
        setLoading(false)
      }
    }, 450) // debounce; keeps request volume low and polite

    return () => { clearTimeout(t); ctrl.abort() }
  }, [query])

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function handleType(e) {
    const v = e.target.value
    setQuery(v)
    setVerified(false)
    onChange?.(v)
  }

  function pick(s) {
    skipNext.current = true
    setQuery(s.label)
    setSuggestions([])
    setOpen(false)
    setVerified(true)
    onChange?.(s.label)
    onResolve?.({ address: s.label, lat: s.lat, lng: s.lng })
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          autoFocus={autoFocus}
          disabled={disabled}
          value={query}
          onChange={handleType}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder={placeholder || 'Start typing an address…'}
          style={{ ...inputStyle, paddingRight: '30px' }}
          autoComplete="off"
        />
        {(loading || verified) && (
          <span style={st.badge}>{loading ? '…' : '✓'}</span>
        )}
      </div>
      {open && (
        <ul style={st.dropdown}>
          {suggestions.map((s, i) => (
            <li key={i} style={st.item} onMouseDown={() => pick(s)}>
              <span style={st.pin}>📍</span>{s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const st = {
  badge: {
    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
    fontSize: '13px', color: '#3A5C2E', pointerEvents: 'none',
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
    margin: '4px 0 0', padding: '4px', listStyle: 'none',
    background: '#fff', border: '1px solid #E2DDD6', borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto',
  },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: '6px',
    padding: '9px 10px', fontSize: '13px', color: '#2C2416',
    borderRadius: '7px', cursor: 'pointer', lineHeight: 1.35,
  },
  pin: { flexShrink: 0 },
}
