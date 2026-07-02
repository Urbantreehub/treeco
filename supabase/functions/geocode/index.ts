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

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address || !address.trim()) return null
  // Bias toward NZ/Wellington to keep results local.
  const q = encodeURIComponent(/wellington|nz|new zealand/i.test(address) ? address : `${address}, Wellington, New Zealand`)
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=nz&q=${q}`
  const res = await fetch(url, { headers: { 'User-Agent': 'TreeCo/1.0 (office@urbantreeservices.net)' } })
  if (!res.ok) return null
  const arr = await res.json()
  if (!Array.isArray(arr) || arr.length === 0) return null
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon) }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { address, job_id, client_id, batch } = await req.json()

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
