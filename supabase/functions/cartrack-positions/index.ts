// Fetches live vehicle positions from Cartrack's JSON-RPC API.
// Logs in with stored credentials on each call (session cookie is stateless here).
//
// Required secrets (set via Supabase Dashboard → Project Settings → Secrets):
//   CARTRACK_ACCOUNT  = URBA00005
//   CARTRACK_PASSWORD = <password>
//
// Returns: { vehicles: [{ registration, lat, lng, bearing, ignition, address, lastSeen, name }] }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const RPC_URL = 'https://fleetweb-nz.cartrack.com/jsonrpc/index.php'

async function rpc(method: string, params: Record<string, unknown>, cookie?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain' }
  if (cookie) headers['Cookie'] = cookie
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ version: '2.0', method, id: 10, params: { x: 'x', ...params } }),
  })
  return res.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const account  = Deno.env.get('CARTRACK_ACCOUNT')  ?? ''
    const password = Deno.env.get('CARTRACK_PASSWORD') ?? ''

    if (!account || !password) {
      return new Response(JSON.stringify({ error: 'CARTRACK_ACCOUNT / CARTRACK_PASSWORD secrets not set' }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Login to get session cookie
    const loginRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        version: '2.0', method: 'ct_login', id: 1,
        params: {
          x: 'x', account, username: null, password,
          locale: 'en-NZ', otp: '', browserName: '',
          version: '3.10.3', environment: 'production', thirdParty: false,
        },
      }),
    })

    if (!loginRes.ok) throw new Error(`Login HTTP ${loginRes.status}`)

    const loginData = await loginRes.json()
    if (loginData.result?.status !== 'SUCCEEDED') {
      throw new Error(`Cartrack login failed: ${loginData.result?.status ?? loginData.error}`)
    }

    // Extract session cookie from login response
    const setCookie = loginRes.headers.get('set-cookie') ?? ''
    const fsCookie = setCookie.match(/(?:^|,)\s*fs=([^;]+)/)?.[1]
    if (!fsCookie) throw new Error('No session cookie returned from login')

    // Fetch vehicle positions
    const posRes = await rpc('ct_fleet_get_vehiclelist_v3', {}, `fs=${fsCookie}`)
    const vehicles: unknown[] = posRes.result?.ct_fleet_get_vehiclelist ?? []

    const clean = vehicles.map((v: any) => ({
      registration: v.registration,
      name:         v.client_vehicle_description,
      lat:          parseFloat(v.latitude),
      lng:          parseFloat(v.longitude),
      bearing:      parseInt(v.bearing, 10),
      ignition:     v.ignition === '2' || v.ignition === 2,
      address:      v.position_description?.principal?.description ?? '',
      lastSeen:     v.event_ts,
      odometer:     Math.round(parseInt(v.odometer, 10) / 1000), // metres → km
    }))

    return new Response(JSON.stringify({ vehicles: clean }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
