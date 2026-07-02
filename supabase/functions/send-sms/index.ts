// Sends an SMS via Twilio and logs it to sms_messages.
// Used for: manual texts, sending a quote link by SMS, and quote follow-ups.
// (Day-before job reminders are sent by the send-job-reminders cron function,
//  which reuses this same Twilio call.)
//
// POST body (one of):
//   { to, message }                         — raw text to a number
//   { quote_id, kind: 'quote_link' }        — texts the client the quote link
//   { quote_id, message, kind }             — custom text tied to a quote
//
// Required secrets:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (e.g. +64...)
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

// Normalise NZ mobile numbers to E.164 (+64…) for Twilio.
function toE164(raw: string): string | null {
  if (!raw) return null
  let n = raw.replace(/[\s()-]/g, '')
  if (n.startsWith('+')) return n
  if (n.startsWith('00')) return '+' + n.slice(2)
  if (n.startsWith('0'))  return '+64' + n.slice(1)   // NZ local → international
  if (n.startsWith('64')) return '+' + n
  return null
}

export async function sendTwilio(to: string, body: string) {
  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID')
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  const from  = Deno.env.get('TWILIO_FROM')
  if (!sid || !token || !from) {
    return { ok: false, error: 'Twilio not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM secrets', notConfigured: true }
  }
  const e164 = toE164(to)
  if (!e164) return { ok: false, error: `Invalid phone number: ${to}` }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: e164, From: from, Body: body }),
  })
  const data = await res.json()
  if (!res.ok) return { ok: false, error: data.message ?? `Twilio ${res.status}` }
  return { ok: true, sid: data.sid, to: e164 }
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
    const payload = await req.json()
    let { to, message } = payload
    const { quote_id, kind = 'manual' } = payload
    let job_id: string | null = null
    let client_id: string | null = null

    // Resolve quote-linked sends (number + default message).
    if (quote_id) {
      const { data: q } = await supabase
        .from('quotes')
        .select('id, total, client_view_token, job_id, jobs ( client_id, clients ( name, phone ) )')
        .eq('id', quote_id)
        .single()
      if (!q) return json({ error: 'Quote not found' }, 404)
      job_id    = q.job_id
      client_id = q.jobs?.client_id ?? null
      const phone = q.jobs?.clients?.phone
      const first = (q.jobs?.clients?.name ?? 'there').split(' ')[0]
      const link  = `${appUrl}/q/${q.client_view_token}`
      if (!to) to = phone
      if (!message) {
        if (kind === 'quote_link') {
          message = `Hi ${first}, your quote from Urban Tree Services (${nzd(q.total)}) is ready: ${link}`
        } else if (kind === 'quote_followup') {
          message = `Hi ${first}, just checking you received your tree quote from Urban Tree Services? View or accept it here: ${link}`
        }
      }
    }

    if (!to)      return json({ error: 'No phone number — client has no mobile on file' }, 400)
    if (!message) return json({ error: 'No message body' }, 400)

    const result = await sendTwilio(to, message)

    // Log every attempt.
    await supabase.from('sms_messages').insert({
      to_number: to, body: message, kind, quote_id: quote_id ?? null,
      job_id, client_id,
      status: result.ok ? 'sent' : 'failed',
      provider_id: result.ok ? result.sid : null,
      error: result.ok ? null : result.error,
    })

    if (!result.ok) return json({ error: result.error, notConfigured: result.notConfigured ?? false }, result.notConfigured ? 400 : 502)

    if (quote_id) {
      await supabase.from('quotes').update({ sms_sent_at: new Date().toISOString() }).eq('id', quote_id)
    }
    return json({ ok: true, sid: result.sid, to: result.to })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
