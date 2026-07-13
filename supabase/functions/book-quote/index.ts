// Public quote-request / self-booking endpoint. A customer submits the form on
// the /book page (no login); this creates (or reuses) a client, opens a
// new_lead job with their preferred day/window, attaches an optional photo, and
// emails the office. Runs with the service role so it works for anon callers.
//
// POST body: { name, phone, email, address, job_type, job_description,
//              preferred_date, window, photo_base64? }
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY (optional)

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
function prettyDate(d: string) {
  if (!d) return ''
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }) } catch { return d }
}
// Escape public form input before putting it in the office notification email.
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const b = await req.json()
    const name = (b.name || '').trim()
    const phone = (b.phone || '').trim()
    const email = (b.email || '').trim()
    const address = (b.address || '').trim()
    const jobType = (b.job_type || '').trim()
    const desc = (b.job_description || '').trim()
    const preferred = b.preferred_date ? `${prettyDate(b.preferred_date)}${b.window ? `, ${b.window}` : ''}` : (b.window || '')

    if (!name) return json({ error: 'Please enter your name' }, 400)
    if (!phone && !email) return json({ error: 'Please enter a phone or email so we can reach you' }, 400)

    // Find an existing client by phone or email, else create one.
    let clientId: string | null = null
    if (phone || email) {
      const ors = [phone ? `phone.eq.${phone}` : null, email ? `email.eq.${email}` : null].filter(Boolean).join(',')
      const { data: existing } = await supabase.from('clients').select('id').or(ors).limit(1).maybeSingle()
      clientId = existing?.id ?? null
    }
    if (!clientId) {
      const { data: c, error } = await supabase.from('clients')
        .insert({ name, phone: phone || null, email: email || null, address: address || null, notes: 'Created from website self-booking' })
        .select('id').single()
      if (error) throw new Error(error.message)
      clientId = c.id
    }

    const fullDesc = [
      preferred ? `Preferred: ${preferred}` : null,
      desc || null,
    ].filter(Boolean).join('\n\n')

    const { data: job, error: jErr } = await supabase.from('jobs').insert({
      client_id: clientId,
      title: `${name} — website enquiry`,
      address: address || null,
      job_type: jobType || null,
      description: fullDesc || null,
      status: 'new_lead',
      lead_source: 'self_booking',
      enquiry_raw: JSON.stringify({ name, phone, email, address, jobType, preferred, desc }),
    }).select('id').single()
    if (jErr) throw new Error(jErr.message)

    // Optional photo → job-media bucket + job_photos row.
    if (typeof b.photo_base64 === 'string') {
      const m = b.photo_base64.match(/^data:(image\/\w+);base64,(.+)$/)
      if (m) {
        try {
          const bytes = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0))
          const path = `leads/${job.id}/${Date.now()}.${m[1].split('/')[1]}`
          await supabase.storage.from('job-media').upload(path, bytes, { contentType: m[1] })
          const url = supabase.storage.from('job-media').getPublicUrl(path).data.publicUrl
          await supabase.from('job_photos').insert({ job_id: job.id, url, kind: 'lead_reference' })
        } catch { /* photo is best-effort */ }
      }
    }

    // Notify the office (best-effort).
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (resendKey) {
      const html = `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <p style="font-size:15px;color:#2C2416"><strong>New website enquiry</strong></p>
        <div style="background:#F8FAF7;border:1px solid #D4E4D0;border-radius:8px;padding:16px;margin:12px 0">
          <div style="font-size:17px;font-weight:700;color:#2C2416">${esc(name)}</div>
          ${phone ? `<div style="font-size:14px;color:#555">📞 ${esc(phone)}</div>` : ''}
          ${email ? `<div style="font-size:14px;color:#555">✉ ${esc(email)}</div>` : ''}
          ${address ? `<div style="font-size:14px;color:#555">🗺 ${esc(address)}</div>` : ''}
          ${jobType ? `<div style="font-size:14px;color:#555">Type: ${esc(jobType)}</div>` : ''}
          ${preferred ? `<div style="font-size:14px;color:#4A6741;font-weight:600;margin-top:6px">Preferred: ${esc(preferred)}</div>` : ''}
          ${desc ? `<div style="font-size:14px;color:#555;margin-top:6px;white-space:pre-wrap">${esc(desc)}</div>` : ''}
        </div>
        <p style="margin:16px 0"><a href="${Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'}/pipeline" style="background:#4A6741;color:#fff;text-decoration:none;padding:12px 26px;border-radius:8px;font-weight:700">Open pipeline →</a></p>
      </div>`
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'TreeCo <noreply@urbantreeservices.net>', to: 'josh@urbantreeservices.net', subject: `New enquiry: ${name}${preferred ? ` — ${preferred}` : ''}`, html }),
      }).catch(() => {})
    }

    return json({ ok: true })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
