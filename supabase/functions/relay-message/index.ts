// Relays a direct chat message to a staff member as an SMS and/or email.
// Triggered from the Chat DM composer when a FULL-ACCESS user (Josh / Ashley)
// toggles "Text" or "Email" on a message. The in-app message is still stored by
// the frontend; this function only fans the same body out to phone/email.
//
// POST body: { recipient_id: string, body: string, sms?: boolean, email?: boolean }
// Auth:      caller's Supabase JWT in the Authorization header. The caller MUST
//            resolve to a users row with access_level = 'full' — enforced here,
//            never trusted from the client.
// Returns:   { ok, sms?: {...}, email?: {...} }
//
// Required secrets:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   (for SMS)
//   RESEND_API_KEY                                        (for email)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Normalise NZ mobile numbers to E.164 (+64…) for Twilio.
function toE164(raw: string): string | null {
  if (!raw) return null
  let n = raw.replace(/[\s()-]/g, '')
  if (n.startsWith('+'))  return n
  if (n.startsWith('00')) return '+' + n.slice(2)
  if (n.startsWith('0'))  return '+64' + n.slice(1)
  if (n.startsWith('64')) return '+' + n
  return null
}

async function sendTwilio(to: string, body: string) {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from  = Deno.env.get('TWILIO_FROM')
  if (!sid || !token || !from) return { ok: false, error: 'Twilio not configured' }
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: e164, From: from, Body: body }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.message ?? `Twilio ${res.status}` }
  return { ok: true, sid: data.sid, to: e164 }
}

async function sendEmail(to: string, senderName: string, body: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'RESEND_API_KEY not set' }
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#FAF8F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 20px"><tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #eee">
        <tr><td style="background:#2C2416;padding:18px 24px;color:#fff;font-size:16px;font-weight:700">Urban Tree Services</td></tr>
        <tr><td style="padding:24px">
          <p style="margin:0 0 14px;font-size:13px;color:#888">Message from ${esc(senderName)}:</p>
          <p style="margin:0;font-size:15px;color:#2C2416;line-height:1.6;white-space:pre-wrap">${esc(body)}</p>
        </td></tr>
        <tr><td style="background:#F6F4EF;padding:14px 24px;font-size:11px;color:#aaa">Sent from Urban Tree Services · office@urbantreeservices.net · 027 203 1446</td></tr>
      </table></td></tr></table></body></html>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Urban Tree Services <noreply@urbantreeservices.net>',
      reply_to: 'office@urbantreeservices.net',
      to,
      subject: `New message from ${senderName} — Urban Tree Services`,
      html,
      text: `Message from ${senderName}:\n\n${body}\n\nUrban Tree Services · office@urbantreeservices.net · 027 203 1446`,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.message ?? `Resend ${res.status}` }
  return { ok: true, id: data.id, to }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    // ── Authenticate the caller and require full access ──────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Not authenticated' }, 401)

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Not authenticated' }, 401)

    const { data: caller } = await admin
      .from('users').select('name, access_level').eq('id', user.id).single()
    if (!caller || caller.access_level !== 'full') {
      return json({ error: 'Only full-access users can text or email from chat' }, 403)
    }

    const { recipient_id, body, sms, email } = await req.json()
    if (!recipient_id || !body?.trim()) return json({ error: 'recipient_id and body required' }, 400)
    if (!sms && !email) return json({ error: 'Nothing to relay — choose text and/or email' }, 400)

    const { data: recipient } = await admin
      .from('users').select('name, phone, email').eq('id', recipient_id).single()
    if (!recipient) return json({ error: 'Recipient not found' }, 404)

    const senderName = caller.name ?? 'Urban Tree Services'
    const out: Record<string, unknown> = { ok: true }

    if (sms) {
      out.sms = recipient.phone
        ? await sendTwilio(recipient.phone, `${senderName} (Urban Tree Services): ${body}`)
        : { ok: false, error: `No phone number on file for ${recipient.name}` }
    }
    if (email) {
      out.email = recipient.email
        ? await sendEmail(recipient.email, senderName, body)
        : { ok: false, error: `No email on file for ${recipient.name}` }
    }

    return json(out)
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
