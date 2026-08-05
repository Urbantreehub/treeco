// Emails the office when a client accepts/declines/comments on a quote, and —
// for residential jobs — also emails the owner (josh@urbantreeservices.net).
// Every accept/comment also logs a job_alert so it surfaces on Ashley's Actions
// dashboard. Called from QuoteView + QuoteClientComments (public, anon key header).
//
// POST body: { quote_id, action: 'accepted' | 'declined' | 'comment', reason?: string }
// Required secrets: RESEND_API_KEY, APP_URL (optional)

const OWNER_EMAIL  = 'josh@urbantreeservices.net'
const OFFICE_EMAIL = 'office@urbantreeservices.net'

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
// Escape client-supplied text (name, address, decline reason) before HTML.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
      .select(`id, total, quote_number, jobs ( id, title, address, job_type, category, ko_reference, clients ( name, phone, email ) )`)
      .eq('id', quote_id)
      .single()

    if (!quote) return json({ error: 'Quote not found' }, 404)

    const job       = quote.jobs
    const client    = job?.clients
    const address   = job?.address ?? 'Unknown address'
    const jobType   = job?.job_type ?? ''
    const quoteRef  = quote.quote_number ?? quote_id.slice(-6).toUpperCase()
    const total     = Number(quote.total || 0)
    const isAccept  = action === 'accepted'
    const isComment = action === 'comment'
    const appUrl    = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'
    const quoteUrl  = `${appUrl}/quotes/${quote_id}`

    // Residential = anything that isn't a Spencers/Downer portal job.
    const isResidential = !(
      job?.category === 'spencers' || job?.category === 'downer' || job?.ko_reference ||
      /spencer|downer/i.test(job?.title ?? '') || /spencer|downer/i.test(client?.name ?? '')
    )

    // Log a job_alert so accepts + comments show on Ashley's Actions dashboard.
    // A comment that reads like an approval suggests moving the job to scheduling.
    if ((isAccept || isComment) && job?.id) {
      const looksApproved = isComment && /\b(approv|accept|go ahead|proceed|yes[, ]|please go|confirmed?)\b/i.test(reason ?? '')
      try {
        await supabase.from('job_alerts').upsert({
          job_id: job.id,
          kind: isAccept ? 'acceptance' : 'comment',
          title: isAccept ? 'Client accepted the quote' : 'New comment from the client',
          detail: reason ?? null,
          suggested_status: looksApproved ? 'accepted_to_schedule' : null,
          source: isResidential ? 'residential' : 'commercial',
          dedupe_key: isAccept ? `${job.id}:accepted` : null,
        }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      } catch (_) { /* best-effort — don't block the email if job_alerts is absent */ }
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ ok: true, skipped: 'No RESEND_API_KEY' })

    const subject = isAccept
      ? `✅ Quote #${quoteRef} ACCEPTED — ${client?.name ?? 'Client'} · ${nzd(total)}`
      : isComment
      ? `💬 New comment on Quote #${quoteRef} — ${client?.name ?? 'Client'}`
      : `❌ Quote #${quoteRef} declined — ${client?.name ?? 'Client'}`

    // Residential comments/acceptances also go to the owner.
    const recipients = [OFFICE_EMAIL]
    if (isResidential && (isComment || isAccept)) recipients.push(OWNER_EMAIL)

    const headerBg    = isAccept ? '#2F5233' : isComment ? '#4A6DA8' : '#7B2D26'
    const headerLabel = isAccept ? '✅ Quote Accepted' : isComment ? '💬 New Comment' : '❌ Quote Declined'

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FAF8F4;font-family:-apple-system,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:10px;border:1px solid #E2DDD6;overflow:hidden">
        <tr><td style="background:${headerBg};padding:20px 28px">
          <div style="font-size:22px;font-weight:700;color:#fff">
            ${headerLabel}
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2DDD6;border-radius:8px;overflow:hidden;margin-bottom:20px">
            <tr style="background:#FAF8F4"><td style="padding:12px 16px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.06em">Client</td></tr>
            <tr><td style="padding:12px 16px;font-size:15px;font-weight:700;color:#2C2416">${esc(client?.name ?? '—')}</td></tr>
            ${client?.phone ? `<tr><td style="padding:0 16px 8px;font-size:13px;color:#555"><a href="tel:${esc(client.phone.replace(/\s/g,''))}" style="color:#4A7FA5">${esc(client.phone)}</a></td></tr>` : ''}
            ${client?.email ? `<tr><td style="padding:0 16px 8px;font-size:13px;color:#555">${esc(client.email)}</td></tr>` : ''}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2DDD6;border-radius:8px;overflow:hidden;margin-bottom:20px">
            <tr style="background:#FAF8F4"><td style="padding:12px 16px;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.06em">Job</td></tr>
            <tr><td style="padding:12px 16px;font-size:14px;color:#2C2416">${esc(address)}${jobType ? ` · ${esc(jobType)}` : ''}</td></tr>
            <tr><td style="padding:0 16px 12px;font-size:20px;font-weight:800;color:#2C2416">${nzd(total)} <span style="font-size:12px;color:#aaa;font-weight:400">incl. GST</span></td></tr>
          </table>
          ${reason ? (isComment
            ? `<div style="background:#EEF3FB;border:1px solid #C6D6EE;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#2C3E50"><strong>Comment:</strong> ${esc(reason)}</div>`
            : `<div style="background:#FFF0EE;border:1px solid #F5C0BC;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#7B2D26"><strong>Decline reason:</strong> ${esc(reason)}</div>`) : ''}
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

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:    'TreeCo <office@urbantreeservices.net>',
        to:      recipients,
        subject,
        html,
      }),
    })

    // Surface a failed send instead of reporting success regardless — otherwise
    // the office is never told a client responded when Resend rejects.
    if (!emailRes.ok) {
      const detail = await emailRes.json().catch(() => ({}))
      return json({ ok: false, error: detail.message ?? `Resend API ${emailRes.status}` }, 502)
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
