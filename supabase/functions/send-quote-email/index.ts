// Sends a quote email to the client via Resend.
// The email contains the quote total and a "View Quote" button linking to /q/:token
//
// POST body: { quote_id: string }
// Returns:   { ok: true }
//
// Required secrets:
//   RESEND_API_KEY         — from resend.com (free tier: 100 emails/day)
//   APP_URL                — e.g. https://treeco.vercel.app (or auto-detected)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function nzd(v: number) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Escape client-supplied text before putting it in the HTML email — otherwise a
// name/address containing < & " breaks the layout or silently drops text.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function buildHtml(opts: {
  clientFirstName: string
  jobAddress: string
  total: number
  quoteUrl: string
}) {
  const { clientFirstName, jobAddress, total, quoteUrl } = opts
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F4;padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

        <!-- Header -->
        <tr><td style="background:#2C2416;border-radius:10px 10px 0 0;padding:24px 32px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#fff">
                <div style="font-size:18px;font-weight:700">Urban Tree Services</div>
                <div style="font-size:12px;opacity:0.6;margin-top:3px">Wellington, New Zealand</div>
              </td>
              <td align="right" style="color:rgba(255,255,255,0.6);font-size:12px">GST: 132-299-374</td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="height:3px;background:#4A6741"></td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:32px">
          <p style="margin:0 0 16px;font-size:15px;color:#2C2416">Hi ${esc(clientFirstName)},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6">
            Please find your quote for work at <strong>${esc(jobAddress)}</strong> below.
            Click the button to view the full quote, accept or decline, and see all the details.
          </p>

          <!-- Total box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAF7;border:1px solid #D4E4D0;border-radius:8px;margin-bottom:28px">
            <tr><td style="padding:20px;text-align:center">
              <div style="font-size:12px;font-weight:700;color:#6A8060;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px">Quote Total</div>
              <div style="font-size:32px;font-weight:800;color:#2C2416">${nzd(total)}</div>
              <div style="font-size:11px;color:#aaa;margin-top:4px">Inclusive of GST (15%)</div>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td align="center">
              <a href="${quoteUrl}"
                style="display:inline-block;background:#4A6741;color:#fff;text-decoration:none;
                       padding:14px 36px;border-radius:8px;font-size:15px;font-weight:700">
                View &amp; Accept Quote →
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#aaa;line-height:1.6">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${quoteUrl}" style="color:#4A7FA5;word-break:break-all">${quoteUrl}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#2C2416;border-radius:0 0 10px 10px;padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.4)">
            Urban Tree Services · office@urbantreeservices.net · 027 203 1446
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) return json({ error: 'RESEND_API_KEY secret not set — add it in Supabase Dashboard → Settings → Secrets' }, 500)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    const { quote_id } = await req.json()
    if (!quote_id) return json({ error: 'quote_id required' }, 400)

    const { data: quote, error: qErr } = await supabase
      .from('quotes')
      .select(`id, total, client_view_token, jobs ( address, clients ( name, email ) )`)
      .eq('id', quote_id)
      .single()

    if (qErr || !quote) return json({ error: 'Quote not found' }, 404)

    const clientEmail = quote.jobs?.clients?.email
    if (!clientEmail) return json({ error: 'Client has no email address — add one in Clients first' }, 400)

    const clientName  = quote.jobs?.clients?.name ?? 'there'
    const firstName   = clientName.split(' ')[0]
    const jobAddress  = quote.jobs?.address ?? 'your property'
    const appUrl      = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'
    const quoteUrl    = `${appUrl}/q/${quote.client_view_token}`

    const html = buildHtml({ clientFirstName: firstName, jobAddress, total: quote.total, quoteUrl })

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     'Urban Tree Services <noreply@urbantreeservices.net>',
        reply_to: 'office@urbantreeservices.net',
        to:       clientEmail,
        subject:  `Your quote from Urban Tree Services — ${nzd(quote.total)}`,
        html,
        text: `Hi ${firstName},\n\n`
          + `Please find your quote for work at ${jobAddress}.\n\n`
          + `Quote total: ${nzd(quote.total)} (incl. GST 15%)\n\n`
          + `View, accept or decline your quote here:\n${quoteUrl}\n\n`
          + `Urban Tree Services · office@urbantreeservices.net · 027 203 1446`,
      }),
    })

    if (!emailRes.ok) {
      const detail = await emailRes.json().catch(() => ({}))
      throw new Error(detail.message ?? `Resend API ${emailRes.status}`)
    }

    // Update sent_at on the quote
    await supabase.from('quotes')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', quote_id)

    return json({ ok: true, to: clientEmail })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
