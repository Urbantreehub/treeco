// Creates a Xero DRAFT invoice for a single dumped mulch load and records the
// result on the mulch_dumps row. DRAFT so the office reviews/approves in Xero
// before it's a real invoice — nothing is sent to the customer automatically.
//
// POST body: { dump_id: string }
// Returns:   { ok, invoice_id, invoice_number, invoice_url } | { ok:false, error }
//
// Required secrets: XERO_CLIENT_ID, XERO_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const CONN_ID  = '00000000-0000-0000-0000-000000000001'
const XERO_API = 'https://api.xero.com/api.xro/2.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function getAccessToken(supabase: ReturnType<typeof createClient>) {
  const { data: conn, error } = await supabase.from('xero_connections').select('*').eq('id', CONN_ID).single()
  if (error || !conn) throw new Error('Xero not connected — connect in Settings first')

  if (new Date(conn.expires_at).getTime() - 60_000 < Date.now()) {
    const clientId     = Deno.env.get('XERO_CLIENT_ID')!
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!
    const r = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
    })
    if (!r.ok) throw new Error('Xero token refresh failed — reconnect in Settings')
    const refreshed = await r.json()
    conn.access_token  = refreshed.access_token
    conn.refresh_token = refreshed.refresh_token ?? conn.refresh_token
    conn.expires_at    = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    await supabase.from('xero_connections')
      .update({ access_token: conn.access_token, refresh_token: conn.refresh_token, expires_at: conn.expires_at, updated_at: new Date().toISOString() })
      .eq('id', CONN_ID)
  }
  return { accessToken: conn.access_token, tenantId: conn.tenant_id }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let dumpId: string | undefined
  try {
    const body = await req.json()
    dumpId = body.dump_id
    if (!dumpId) return json({ error: 'dump_id required' }, 400)

    const { data: dump, error: dErr } = await supabase
      .from('mulch_dumps')
      .select('id, price, dumped_at, invoice_status, xero_invoice_id, mulch_sites ( name, address, contact_name, contact_email, xero_contact_id )')
      .eq('id', dumpId).single()
    if (dErr || !dump) return json({ error: 'Dump not found' }, 404)
    if (dump.xero_invoice_id) return json({ error: 'Already invoiced', invoice_id: dump.xero_invoice_id }, 409)

    const site = dump.mulch_sites
    const contactName = site?.contact_name || site?.name || 'Mulch customer'
    const price = Number(dump.price) || 0
    if (price <= 0) {
      await supabase.from('mulch_dumps').update({ invoice_status: 'skipped', invoice_error: 'No price set — nothing to invoice' }).eq('id', dumpId)
      return json({ ok: true, skipped: true, message: 'Price is $0 — no invoice created' })
    }

    const { accessToken, tenantId } = await getAccessToken(supabase)

    const contact: Record<string, unknown> = site?.xero_contact_id
      ? { ContactID: site.xero_contact_id }
      : { Name: contactName, ...(site?.contact_email ? { EmailAddress: site.contact_email } : {}) }

    const invoicePayload = {
      Invoices: [{
        Type:            'ACCREC',
        Status:          'DRAFT',
        Contact:         contact,
        LineAmountTypes: 'EXCLUSIVE',
        CurrencyCode:    'NZD',
        Reference:       `Mulch delivery — ${site?.name ?? ''}`.trim(),
        LineItems: [{
          Description: `Mulch delivery — 1 load${site?.address ? ` to ${site.address}` : ''} (${new Date(dump.dumped_at).toLocaleDateString('en-NZ')})`,
          Quantity:    1,
          UnitAmount:  price,
          AccountCode: '200',
        }],
      }],
    }

    const xeroRes = await fetch(`${XERO_API}/Invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(invoicePayload),
    })
    if (!xeroRes.ok) {
      const detail = await xeroRes.text()
      throw new Error(`Xero API ${xeroRes.status}: ${detail.slice(0, 200)}`)
    }
    const invoice = (await xeroRes.json()).Invoices?.[0]
    if (!invoice) throw new Error('Xero returned no invoice')

    const invoiceId     = invoice.InvoiceID
    const invoiceNumber = invoice.InvoiceNumber ?? ''
    const invoiceUrl    = `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoiceId}`

    await supabase.from('mulch_dumps').update({
      invoice_status: 'invoiced', invoice_error: null,
      xero_invoice_id: invoiceId, xero_invoice_number: invoiceNumber, xero_invoice_url: invoiceUrl,
    }).eq('id', dumpId)

    return json({ ok: true, invoice_id: invoiceId, invoice_number: invoiceNumber, invoice_url: invoiceUrl })
  } catch (err: any) {
    // Keep the dump logged; record the failure so the office can retry.
    if (dumpId) await supabase.from('mulch_dumps').update({ invoice_status: 'error', invoice_error: err.message }).eq('id', dumpId)
    return json({ ok: false, error: err.message }, 500)
  }
})
