// Fetches contacts from Xero and returns them as JSON.
// The frontend calls this, then lets the user choose which to import.
//
// Required secrets (same as xero-auth):
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const CONN_ID = '00000000-0000-0000-0000-000000000001'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Load stored connection
  const { data: conn, error: connErr } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('id', CONN_ID)
    .single()

  if (connErr || !conn) {
    return json({ error: 'not_connected' }, 401)
  }

  let accessToken = conn.access_token

  // Refresh if expired (with 60s buffer)
  if (new Date(conn.expires_at).getTime() - 60_000 < Date.now()) {
    const clientId     = Deno.env.get('XERO_CLIENT_ID')!
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!

    const refreshRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type:    'refresh_token',
        refresh_token: conn.refresh_token,
      }),
    })

    if (!refreshRes.ok) {
      return json({ error: 'token_refresh_failed' }, 401)
    }

    const refreshed = await refreshRes.json()
    accessToken = refreshed.access_token
    const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

    await supabase.from('xero_connections').update({
      access_token:  accessToken,
      refresh_token: refreshed.refresh_token ?? conn.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }).eq('id', CONN_ID)
  }

  // Fetch contacts from Xero (active, with email or phone, paginated)
  const xeroRes = await fetch(
    `https://api.xero.com/api.xro/2.0/Contacts?where=IsCustomer%3D%3Dtrue%26%26IsArchived%3D%3Dfalse&order=Name%20ASC&pageSize=200`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Xero-tenant-id': conn.tenant_id,
        Accept: 'application/json',
      },
    },
  )

  if (!xeroRes.ok) {
    const body = await xeroRes.text()
    console.error('Xero API error:', body)
    return json({ error: 'xero_api_error', detail: body }, 502)
  }

  const { Contacts } = await xeroRes.json()

  // Shape into our client format
  const contacts = (Contacts ?? []).map((c: any) => ({
    xero_contact_id: c.ContactID,
    name:    c.Name,
    email:   c.EmailAddress ?? null,
    phone:   c.Phones?.find((p: any) => p.PhoneType === 'DEFAULT')
               ?.PhoneNumber ?? c.Phones?.[0]?.PhoneNumber ?? null,
    address: formatAddress(c.Addresses),
  }))

  return json({ contacts, tenant_name: conn.tenant_name })
})

function formatAddress(addresses: any[]): string | null {
  if (!addresses?.length) return null
  const a = addresses.find((x: any) => x.AddressType === 'STREET') ?? addresses[0]
  return [a.AddressLine1, a.City, a.Region, a.PostalCode]
    .filter(Boolean).join(', ') || null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
