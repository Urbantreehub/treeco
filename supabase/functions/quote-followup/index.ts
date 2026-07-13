// Sends a follow-up nudge for a quote the client hasn't responded to.
// Channel: 'email' (Resend), 'sms' (Twilio), or 'both'. Increments the
// quote's followup_count / last_followup_at so the Sent-Quotes tracker shows
// how many times a client has been chased.
//
// POST body: { quote_id, channel?: 'email' | 'sms' | 'both' }
//
// Required secrets: RESEND_API_KEY (email), TWILIO_* (sms),
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
function nzd(v: number) {
  return '$' + Number(v || 0).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
// Escape client-supplied text before putting it in the HTML email.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
function toE164(raw: string): string | null {
  if (!raw) return null
  let n = raw.replace(/[\s()-]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('00')) return '+' + n.slice(2)
  if (n.startsWith('0'))  return '+64' + n.slice(1)
  if (n.startsWith('64')) return '+' + n
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const appUrl = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'

  try {
    const { quote_id, channel = 'email' } = await req.json()
    if (!quote_id) return json({ error: 'quote_id required' }, 400)

    const { data: q } = await supabase
      .from('quotes')
      .select('id, total, followup_count, client_view_token, job_id, jobs ( address, client_id, clients ( name, email, phone ) )')
      .eq('id', quote_id).single()
    if (!q) return json({ error: 'Quote not found' }, 404)

    const client = q.jobs?.clients
    const first  = (client?.name ?? 'there').split(' ')[0]
    const link   = `${appUrl}/q/${q.client_view_token}`
    const results: Record<string, unknown> = {}

    // ── Email ──
    if (channel === 'email' || channel === 'both') {
      const resendKey = Deno.env.get('RESEND_API_KEY')
      if (!resendKey) results.email = { ok: false, error: 'RESEND_API_KEY not set' }
      else if (!client?.email) results.email = { ok: false, error: 'Client has no email' }
      else {
        const html = `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <p style="font-size:15px;color:#2C2416">Hi ${esc(first)},</p>
          <p style="font-size:14px;color:#555;line-height:1.6">Just following up on the quote we sent you${q.jobs?.address ? ` for work at <strong>${esc(q.jobs.address)}</strong>` : ''} — total <strong>${nzd(q.total)}</strong>. We'd love to help get this sorted for you.</p>
          <p style="margin:24px 0"><a href="${link}" style="background:#4A6741;color:#fff;text-decoration:none;padding:13px 30px;border-radius:8px;font-weight:700">View &amp; accept your quote →</a></p>
          <p style="font-size:13px;color:#888;line-height:1.6">Any questions, just reply or call us on 027 203 1446.<br>— Urban Tree Services</p>
        </div>`
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Urban Tree Services <noreply@urbantreeservices.net>',
            reply_to: 'office@urbantreeservices.net',
            to: client.email,
            subject: `Following up on your tree quote — ${nzd(q.total)}`,
            html,
          }),
        })
        results.email = r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(() => ({}))).message ?? `Resend ${r.status}` }
      }
    }

    // ── SMS ──
    if (channel === 'sms' || channel === 'both') {
      const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), token = Deno.env.get('TWILIO_AUTH_TOKEN'), from = Deno.env.get('TWILIO_FROM')
      const e164 = toE164(client?.phone ?? '')
      if (!sid || !token || !from) results.sms = { ok: false, error: 'Twilio not configured' }
      else if (!e164) results.sms = { ok: false, error: 'Client has no valid mobile' }
      else {
        const body = `Hi ${first}, just checking you received your tree quote from Urban Tree Services (${nzd(q.total)})? View or accept it here: ${link}`
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: 'POST',
          headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ To: e164, From: from, Body: body }),
        })
        const d = await r.json()
        results.sms = r.ok ? { ok: true, sid: d.sid } : { ok: false, error: d.message ?? `Twilio ${r.status}` }
        await supabase.from('sms_messages').insert({
          to_number: e164, body, kind: 'quote_followup', quote_id: q.id, job_id: q.job_id,
          client_id: q.jobs?.client_id ?? null,
          status: r.ok ? 'sent' : 'failed', provider_id: r.ok ? d.sid : null, error: r.ok ? null : (d.message ?? 'failed'),
        })
      }
    }

    const anyOk = Object.values(results).some((r: any) => r?.ok)
    if (anyOk) {
      await supabase.from('quotes').update({
        followup_count: (q.followup_count ?? 0) + 1,
        last_followup_at: new Date().toISOString(),
      }).eq('id', quote_id)
    }
    return json({ ok: anyOk, results }, anyOk ? 200 : 502)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
