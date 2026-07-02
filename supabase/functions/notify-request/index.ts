// Emails the office when a crew member submits a tool-replacement / wishlist
// request, so nothing gets lost when Josh isn't in the app. Best-effort:
// returns ok:false (not an error) if Resend isn't configured, so the client
// submit flow never fails just because email is down.
//
// POST body: { request_id }
// Required secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const OFFICE_EMAIL = 'josh@urbantreeservices.net'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const appUrl = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'

  try {
    const { request_id } = await req.json()
    if (!request_id) return json({ error: 'request_id required' }, 400)

    const { data: r } = await supabase
      .from('tool_requests')
      .select('kind, item, notes, urgency, users:requested_by ( name )')
      .eq('id', request_id).single()
    if (!r) return json({ error: 'Request not found' }, 404)

    if (!resendKey) return json({ ok: false, error: 'RESEND_API_KEY not set' })

    const who   = r.users?.name ?? 'A crew member'
    const label = r.kind === 'wishlist' ? 'Wishlist item' : 'Tool needs replacing'
    const urg   = r.urgency === 'high' ? ' — HIGH PRIORITY' : ''
    const html = `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <p style="font-size:15px;color:#2C2416"><strong>${who}</strong> submitted a request:</p>
      <div style="background:#F8FAF7;border:1px solid #D4E4D0;border-radius:8px;padding:16px;margin:12px 0">
        <div style="font-size:12px;font-weight:700;color:#6A8060;text-transform:uppercase;letter-spacing:.06em">${label}${urg}</div>
        <div style="font-size:17px;font-weight:700;color:#2C2416;margin:6px 0">${r.item}</div>
        ${r.notes ? `<div style="font-size:14px;color:#555">${r.notes}</div>` : ''}
      </div>
      <p style="margin:20px 0"><a href="${appUrl}/requests" style="background:#4A6741;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">View in TreeCo →</a></p>
    </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'TreeCo <noreply@urbantreeservices.net>',
        to: OFFICE_EMAIL,
        subject: `${label}${urg}: ${r.item}`,
        html,
      }),
    })
    if (!res.ok) return json({ ok: false, error: (await res.json().catch(() => ({}))).message ?? `Resend ${res.status}` })
    return json({ ok: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
