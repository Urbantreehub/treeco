// Fetches Profit & Loss report from Xero for the current financial year.
// Returns: { revenue, expenses, netProfit, months: [{label, revenue}] }
// Requires xero_connections row to exist (set up via Settings → Xero).

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function refreshIfNeeded(conn: any, clientId: string, clientSecret: string, supabase: any) {
  if (new Date(conn.expires_at) > new Date(Date.now() + 60_000)) return conn.access_token

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  })
  const tok = await res.json()
  if (!tok.access_token) throw new Error('Xero token refresh failed')

  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await supabase.from('xero_connections').update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? conn.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id)

  return tok.access_token
}

const PNL_TTL_MS = 30 * 60_000 // 30 minutes

// Cache helpers are best-effort: any failure (including the cache table not
// existing yet because migration 019 hasn't been applied) is treated as a
// cache miss so the P&L endpoint keeps working regardless.
async function readCache(supabase: any, key: string) {
  try {
    const { data } = await supabase
      .from('xero_pnl_cache').select('payload, computed_at').eq('cache_key', key).single()
    if (!data) return null
    if (Date.now() - new Date(data.computed_at).getTime() > PNL_TTL_MS) return null
    return data.payload
  } catch { return null }
}

async function writeCache(supabase: any, key: string, payload: unknown) {
  try {
    await supabase.from('xero_pnl_cache').upsert(
      { cache_key: key, payload, computed_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    )
  } catch { /* best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: conn } = await supabase
      .from('xero_connections')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    if (!conn) return json({ error: 'Xero not connected. Connect in Settings → Integrations.' }, 400)

    // Current NZ financial year: Apr 1 – Mar 31
    const now    = new Date()
    const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
    const fyFrom = `${fyYear}-04-01`
    const fyTo   = `${fyYear + 1}-03-31`

    // Serve from cache (30-min TTL) unless ?refresh=1, to avoid the ~13
    // sequential Xero report calls on every dashboard load.
    const refresh  = new URL(req.url).searchParams.get('refresh') === '1'
    const cacheKey = `pnl:${conn.tenant_id}:${fyFrom}`
    if (!refresh) {
      const cached = await readCache(supabase, cacheKey)
      if (cached) return json({ ...cached, cached: true })
    }

    const clientId     = Deno.env.get('XERO_CLIENT_ID')!
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!
    const accessToken  = await refreshIfNeeded(conn, clientId, clientSecret, supabase)

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'xero-tenant-id': conn.tenant_id,
      Accept: 'application/json',
    }

    // Fetch full-year P&L summary
    const pnlRes = await fetch(
      `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${fyFrom}&toDate=${fyTo}&standardLayout=true`,
      { headers }
    )
    const pnlData = await pnlRes.json()

    // Parse the report rows
    let revenue = 0, expenses = 0
    const sections = pnlData.Reports?.[0]?.Rows ?? []

    for (const section of sections) {
      if (!section.Rows) continue
      const title = (section.Title ?? '').toLowerCase()
      const isRevenue  = title.includes('income') || title.includes('revenue') || title.includes('trading')
      const isExpenses = title.includes('expense') || title.includes('overhead') || title.includes('cost')

      for (const row of section.Rows) {
        if (row.RowType !== 'SummaryRow') continue
        const val = parseFloat(row.Cells?.[1]?.Value ?? '0') || 0
        if (isRevenue)  revenue  += val
        if (isExpenses) expenses += val
      }
    }

    // Fetch monthly breakdown (each month this FY so far)
    const months: { label: string; revenue: number }[] = []
    const totalMonths = Math.min(
      (now.getFullYear() - fyYear) * 12 + now.getMonth() - 3 + 1,
      12
    )

    for (let i = 0; i < Math.max(totalMonths, 6); i++) {
      const d    = new Date(fyYear, 3 + i, 1)
      if (d > now) break
      const from = d.toISOString().slice(0, 10)
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const to   = last.toISOString().slice(0, 10)
      const label = d.toLocaleString('en-NZ', { month: 'short' })

      const mRes = await fetch(
        `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}&standardLayout=true`,
        { headers }
      )
      const mData = await mRes.json()
      let mRevenue = 0
      const mSections = mData.Reports?.[0]?.Rows ?? []
      for (const section of mSections) {
        if (!section.Rows) continue
        const t = (section.Title ?? '').toLowerCase()
        if (!t.includes('income') && !t.includes('revenue') && !t.includes('trading')) continue
        for (const row of section.Rows) {
          if (row.RowType !== 'SummaryRow') continue
          mRevenue += parseFloat(row.Cells?.[1]?.Value ?? '0') || 0
        }
      }
      months.push({ label, revenue: mRevenue })
    }

    const result = {
      revenue,
      expenses,
      netProfit: revenue - expenses,
      fyFrom,
      fyTo,
      months,
      source: 'xero',
    }
    await writeCache(supabase, cacheKey, result)
    return json(result)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
