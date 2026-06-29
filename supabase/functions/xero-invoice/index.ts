// Creates a Xero invoice from a TreeCo quote and marks the quote as 'invoiced'.
//
// POST body: { quote_id: string }
// Returns:   { invoice_id, invoice_number, invoice_url }
//
// Required secrets (same as xero-auth):
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const CONN_ID  = '00000000-0000-0000-0000-000000000001'
const XERO_API = 'https://api.xero.com/api.xro/2.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

async function getAccessToken(supabase: ReturnType<typeof createClient>) {
  const { data: conn, error } = await supabase
    .from('xero_connections').select('*').eq('id', CONN_ID).single()
  if (error || !conn) throw new Error('Xero not connected — connect in Settings first')

  // Refresh if within 60s of expiry
  if (new Date(conn.expires_at).getTime() - 60_000 < Date.now()) {
    const clientId     = Deno.env.get('XERO_CLIENT_ID')!
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!
    const r = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { quote_id } = await req.json()
    if (!quote_id) return json({ error: 'quote_id required' }, 400)

    // Load quote with client and line items
    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select(`id, status, subtotal, gst, total, notes, line_items,
        jobs ( address, job_type, clients ( name, email, xero_contact_id ) )`)
      .eq('id', quote_id)
      .single()

    if (qErr || !quote) return json({ error: 'Quote not found' }, 404)
    if (quote.status === 'invoiced') return json({ error: 'Already invoiced' }, 409)

    const { accessToken, tenantId } = await getAccessToken(supabase)

    const clientName = quote.jobs?.clients?.name ?? 'Unknown client'
    const lineItems  = (quote.line_items ?? [])
      .filter((i: any) => !i.optional || i.selected)
      .map((i: any) => ({
        Description: [i.description, i.detail].filter(Boolean).join('\n'),
        Quantity:    Number(i.qty)  || 1,
        UnitAmount:  Number(i.rate) || 0,
        AccountCode: '200',
      }))

    if (lineItems.length === 0) return json({ error: 'No line items to invoice' }, 400)

    const invoicePayload = {
      Invoices: [{
        Type:            'ACCREC',
        Status:          'SUBMITTED',
        Contact:         { Name: clientName },
        LineAmountTypes: 'EXCLUSIVE',
        CurrencyCode:    'NZD',
        Reference:       `TreeCo quote — ${quote.jobs?.address ?? ''}`,
        LineItems:       lineItems,
      }],
    }

    const xeroRes = await fetch(`${XERO_API}/Invoices`, {
      method: 'POST',
      headers: {
        Authorization:    `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type':   'application/json',
        Accept:           'application/json',
      },
      body: JSON.stringify(invoicePayload),
    })

    if (!xeroRes.ok) {
      const detail = await xeroRes.text()
      console.error('Xero API error:', detail)
      throw new Error(`Xero API ${xeroRes.status}: ${detail.slice(0, 200)}`)
    }

    const xeroData  = await xeroRes.json()
    const invoice   = xeroData.Invoices?.[0]
    if (!invoice) throw new Error('Xero returned no invoice')

    const invoiceId     = invoice.InvoiceID
    const invoiceNumber = invoice.InvoiceNumber ?? ''
    const invoiceUrl    = `https://go.xero.com/AccountsReceivable/Edit.aspx?InvoiceID=${invoiceId}`

    // Mark quote as invoiced
    await supabase.from('quotes').update({
      status:              'invoiced',
      xero_invoice_id:     invoiceId,
      xero_invoice_number: invoiceNumber,
      xero_invoice_url:    invoiceUrl,
    }).eq('id', quote_id)

    return json({ invoice_id: invoiceId, invoice_number: invoiceNumber, invoice_url: invoiceUrl })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
