// Sends an email to the office when a client acts on a quote — accepts,
// declines, asks a question, or opens it for the first time.
// Called from QuoteView (public, no auth token needed — uses anon key header).
//
// POST body: { quote_id, action: 'accepted'|'declined'|'question'|'opened', reason?: string }
// Required secrets: RESEND_API_KEY, APP_URL (optional)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { quote_id, action, reason } = await req.json()
    if (!quote_id || !action) return json({ error: 'Missing quote_id or action' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: quote } = await supabase
      .from('quotes')
      .select(`id, total, quote_number, jobs ( address, job_type, clients ( name, phone, email ) )`)
      .eq('id', quote_id)
      .single()

    if (!quote) return json({ error: 'Quote not found' }, 404)

    const client    = quote.jobs?.clients
    const address   = quote.jobs?.address ?? 'Unknown address'
    const jobType   = quote.jobs?.job_type ?? ''
    const quoteRef  = quote.quote_number ?? quote_id.slice(-6).toUpperCase()
    const total     = Number(quote.total || 0)
    const isAccept  = action === 'accepted'
    const appUrl    = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'
    const quoteUrl  = `${appUrl}/quotes/${quote_id}`

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ ok: true, skipped: 'No RESEND_API_KEY' })

    // Opens are throttled by the caller (first open only) — this function does
    // no de-duplication of its own, so don't call it on every page load.
    const SUBJECTS: Record<string, string> = {
      accepted: `✅ Quote #${quoteRef} ACCEPTED — ${client?.name ?? 'Client'} · ${nzd(total)}`,
      declined: `❌ Quote #${quoteRef} declined — ${client?.name ?? 'Client'}`,
      question: `💬 Question on quote #${quoteRef} — ${client?.name ?? 'Client'}`,
      opened:   `👁 Quote #${quoteRef} opened — ${client?.name ?? 'Client'}`,
    }
    const subject = SUBJECTS[action] ?? SUBJECTS.declined

    const HEADER: Record<string, { bg: string; title: string }> = {
      accepted: { bg: '#2F5233', title: '✅ Quote Accepted' },
      declined: { bg: '#7B2D26', title: '❌ Quote Declined' },
      question: { bg: '#2A6899', title: '💬 Client Asked a Question' },
      opened:   { bg: '#B26B0E', title: '👁 Client Opened the Quote' },
    }
    // Decline reasons and client questions are both free text from the client;
    // tint the callout to match rather than always reading as a decline.
    const NOTE = action === 'question'
      ? { bg: '#EBF3FA', border: '#A9C8E0', color: '#2A6899', label: 'Question' }
      : { bg: '#FFF0EE', border: '#F5C0BC', color: '#7B2D26', label: 'Decline reason' }

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:10px;border:1px solid #E2DDD6;overflow:hidden">
        <tr><td style="background:${HEADER[action]?.bg ?? '#7B2D26'};padding:20px 28px">
          <div style="font-size:22px;font-weight:700;color:#fff">
            ${HEADER[action]?.title ?? '❌ Quote Declined'}
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2DDD6;border-radius:8px;overflow:hidden;margin-bottom:20px">
            <tr style="background:#FAF8F4"><td style="padding:12px 16px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.06em">Client</td></tr>
            <tr><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#2C2416">${client?.name ?? '—'}</td></tr>
            ${client?.phone ? `<tr><td style="padding:0 16px 8px;font-size:13px;color:#555"><a href="tel:${client.phone.replace(/\s/g,'')}" style="color:#4A7FA5">${client.phone}</a></td></tr>` : ''}
            ${client?.email ? `<tr><td style="padding:0 16px 8px;font-size:13px;color:#555">${client.email}</td></tr>` : ''}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2DDD6;border-radius:8px;overflow:hidden;margin-bottom:20px">
            <tr style="background:#FAF8F4"><td style="padding:12px 16px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.06em">Job</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#2C2416">${address}${jobType ? ` · ${jobType}` : ''}</td></tr>
            <tr><td style="padding:0 16px 12px;font-size:20px;font-weight:800;color:#2C2416">${nzd(total)} <span style="font-size:12px;color:#aaa;font-weight:400">incl. GST</span></td></tr>
          </table>
          ${reason ? `<div style="background:${NOTE.bg};border:1px solid ${NOTE.border};border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:${NOTE.color}"><strong>${NOTE.label}:</strong> ${reason}</div>` : ''}
          <div style="text-align:center">
            <a href="${quoteUrl}" style="display:inline-block;background:#4A6741;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;font-size:14px">
              Open Quote in TreeCo →
            </a>
          </div>
        </td></tr>
        <tr><td style="background:#FAF8F4;padding:14px 28px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #E2DDD6">
          Urban Tree Services · office@urbantreeservices.net · 027 203 1446
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'TreeCo <office@urbantreeservices.net>',
        to:      'office@urbantreeservices.net',
        subject,
        html,
      }),
    })

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
