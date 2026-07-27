// Resolves an address → { lat, lng } via OpenStreetMap Nominatim (keyless).
// Caches the result on the jobs/clients row so we never re-geocode the same
// address. Consistent with the app's existing OSM/Leaflet map usage.
//
// POST body (one of):
//   { address }                    — ad-hoc geocode, no caching
//   { job_id }                     — geocode the job's address, cache to jobs
//   { client_id }                  — geocode the client's address, cache to clients
//   { batch: true }                — geocode all un-geocoded jobs with an address
//
// Nominatim usage policy: max 1 req/sec, descriptive User-Agent required.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function geocodeOnce(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nz&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'TreeCo/1.0 (office@urbantreeservices.net)' } })
  if (!res.ok) return null
  const arr = await res.json()
  if (!Array.isArray(arr) || arr.length === 0) return null
  const lat = parseFloat(arr[0].lat), lng = parseFloat(arr[0].lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

// Build progressively looser query variants so real-world addresses (rural
// blocks, ones prefixed with a person's name, or missing a suburb) still land
// a pin instead of returning nothing.
function candidateQueries(address: string): string[] {
  const a = address.trim().replace(/\s+/g, ' ')
  const hasNZ = /new zealand|,\s*nz\b/i.test(a)
  const nz = (s: string) => (/new zealand|,\s*nz\b/i.test(s) ? s : `${s}, New Zealand`)
  const parts = a.split(',').map(s => s.trim()).filter(Boolean)
  const out: string[] = [nz(a)]
  // Drop a leading label with no street number (e.g. "Dave's block, 12 Main Rd").
  if (parts.length > 1 && !/\d/.test(parts[0])) out.push(nz(parts.slice(1).join(', ')))
  // Fall back to the last two components (suburb/town + region).
  if (parts.length > 2) out.push(nz(parts.slice(-2).join(', ')))
  // Last resort: bias to the local region for a bare suburb/street.
  if (!hasNZ) out.push(`${a}, Wellington, New Zealand`)
  return [...new Set(out)]
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null
  const queries = candidateQueries(address)
  for (let i = 0; i < queries.length; i++) {
    const g = await geocodeOnce(queries[i])
    if (g) return g
    if (i < queries.length - 1) await sleep(1100) // respect Nominatim 1 req/sec
  }
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { address, job_id, client_id, batch, mulch_site_id, batch_mulch } = await req.json()
    const now = () => new Date().toISOString()

    // Backfill/retry every mulch site that has an address but no pin (covers
    // both never-geocoded and previously-failed sites).
    if (batch_mulch) {
      const { data: rows } = await supabase
        .from('mulch_sites').select('id, address')
        .is('lat', null).not('address', 'is', null).eq('active', true).limit(30)
      let geocoded = 0, failed = 0
      for (const s of rows ?? []) {
        const g = await geocodeAddress(s.address)
        if (g) {
          await supabase.from('mulch_sites').update({ lat: g.lat, lng: g.lng, geocoded_at: now(), geocode_failed: false }).eq('id', s.id)
          geocoded++
        } else {
          await supabase.from('mulch_sites').update({ geocoded_at: now(), geocode_failed: true }).eq('id', s.id)
          failed++
        }
        await sleep(1100)
      }
      return json({ ok: true, geocoded, failed, scanned: rows?.length ?? 0 })
    }

    // Geocode a single mulch site and cache the result (or mark it failed).
    if (mulch_site_id) {
      const { data: s } = await supabase.from('mulch_sites').select('address').eq('id', mulch_site_id).single()
      const g = await geocodeAddress(s?.address ?? '')
      if (!g) {
        await supabase.from('mulch_sites').update({ geocoded_at: now(), geocode_failed: true }).eq('id', mulch_site_id)
        return json({ ok: false, error: 'not_recognised' })
      }
      await supabase.from('mulch_sites').update({ lat: g.lat, lng: g.lng, geocoded_at: now(), geocode_failed: false }).eq('id', mulch_site_id)
      return json({ ok: true, ...g })
    }

    // Batch: geocode every job that has an address but no coords yet.
    if (batch) {
      const { data: jobs } = await supabase
        .from('jobs').select('id, address')
        .is('lat', null).not('address', 'is', null).limit(40)
      let done = 0
      for (const j of jobs ?? []) {
        const g = await geocodeAddress(j.address)
        if (g) {
          await supabase.from('jobs').update({ lat: g.lat, lng: g.lng, geocoded_at: new Date().toISOString() }).eq('id', j.id)
          done++
        }
        await sleep(1100) // respect Nominatim 1 req/sec
      }
      return json({ ok: true, geocoded: done, scanned: jobs?.length ?? 0 })
    }

    if (job_id) {
      const { data: j } = await supabase.from('jobs').select('address').eq('id', job_id).single()
      const g = await geocodeAddress(j?.address ?? '')
      if (!g) return json({ error: 'Could not geocode job address' }, 422)
      await supabase.from('jobs').update({ lat: g.lat, lng: g.lng, geocoded_at: new Date().toISOString() }).eq('id', job_id)
      return json({ ok: true, ...g })
    }

    if (client_id) {
      const { data: c } = await supabase.from('clients').select('address').eq('id', client_id).single()
      const g = await geocodeAddress(c?.address ?? '')
      if (!g) return json({ error: 'Could not geocode client address' }, 422)
      await supabase.from('clients').update({ lat: g.lat, lng: g.lng, geocoded_at: new Date().toISOString() }).eq('id', client_id)
      return json({ ok: true, ...g })
    }

    if (address) {
      const g = await geocodeAddress(address)
      if (!g) return json({ error: 'Could not geocode address' }, 422)
      return json({ ok: true, ...g })
    }

    return json({ error: 'Provide address, job_id, client_id, or batch' }, 400)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
