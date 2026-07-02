// Sends day-before SMS reminders for scheduled jobs that opted in.
// Intended to be triggered daily by a Supabase scheduled cron (pg_cron /
// Dashboard schedule), but is also safe to call manually (idempotent — each
// schedule row is only reminded once, guarded by reminder_sent_at).
//
// Finds schedule rows where date = tomorrow, sms_reminder = true,
// reminder_sent_at is null, and the linked client has a mobile. Texts them.
//
// Required secrets: TWILIO_*, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
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
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
function fmtDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), token = Deno.env.get('TWILIO_AUTH_TOKEN'), from = Deno.env.get('TWILIO_FROM')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const target = tomorrowISO()
    const { data: rows } = await supabase
      .from('schedule')
      .select('id, date, start_time, job_id, jobs ( title, address, client_id, clients ( name, phone ) )')
      .eq('date', target)
      .eq('sms_reminder', true)
      .is('reminder_sent_at', null)

    if (!rows || rows.length === 0) return json({ ok: true, sent: 0, message: `No opted-in reminders for ${target}` })

    if (!sid || !token || !from) {
      return json({ error: 'Twilio not configured', pending: rows.length }, 400)
    }

    let sent = 0
    const errors: string[] = []
    for (const r of rows) {
      const client = r.jobs?.clients
      const e164 = toE164(client?.phone ?? '')
      if (!e164) { errors.push(`schedule ${r.id}: no mobile`); continue }
      const first = (client?.name ?? 'there').split(' ')[0]
      const timePart = r.start_time ? ` at ${r.start_time.slice(0, 5)}` : ''
      const body = `Hi ${first}, a reminder that Urban Tree Services is booked to carry out your tree work${r.jobs?.address ? ` at ${r.jobs.address}` : ''} tomorrow, ${fmtDay(r.date)}${timePart}. Please ensure clear access. Any issues call 027 203 1446.`

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: 'Basic ' + btoa(`${sid}:${token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: e164, From: from, Body: body }),
      })
      const d = await res.json()
      await supabase.from('sms_messages').insert({
        to_number: e164, body, kind: 'job_reminder', job_id: r.job_id, client_id: r.jobs?.client_id ?? null,
        status: res.ok ? 'sent' : 'failed', provider_id: res.ok ? d.sid : null, error: res.ok ? null : (d.message ?? 'failed'),
      })
      if (res.ok) {
        await supabase.from('schedule').update({ reminder_sent_at: new Date().toISOString() }).eq('id', r.id)
        sent++
      } else {
        errors.push(`schedule ${r.id}: ${d.message ?? res.status}`)
      }
    }
    return json({ ok: true, date: target, sent, total: rows.length, errors })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
})
