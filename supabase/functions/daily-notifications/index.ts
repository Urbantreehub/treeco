// Daily automated client notifications. Meant to be run once a day by a
// Supabase scheduled function (see the deploy note in Settings → Integrations).
//
// Sends the day-3 quote follow-up: quotes sent 3+ days ago with no response yet.
// Respects clients.sms_opt_out and is idempotent via quotes.followup_count.
//
// (Invoice/payment reminders are intentionally NOT handled here — those are
// managed in Xero.)
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL,
//                   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM

import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendAndLog, templates } from '../_shared/notify.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const DAY = 86_400_000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const appUrl = Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net'
  const now = Date.now()

  const summary = { followups_sent: 0, followups_skipped: 0, errors: [] as string[] }

  // ── Quote follow-ups: sent 3+ days ago, still unanswered, never nudged ──
  try {
    const cutoff = new Date(now - 3 * DAY).toISOString()
    const { data: quotes, error } = await supabase
      .from('quotes')
      .select('id, total, client_view_token, followup_count, job_id, jobs ( client_id, clients ( name, phone, sms_opt_out ) )')
      .in('status', ['sent', 'viewed'])
      .lte('sent_at', cutoff)
      .or('followup_count.is.null,followup_count.eq.0')
    if (error) throw error

    for (const q of quotes ?? []) {
      const client = (q as any).jobs?.clients
      if (!client?.phone || client.sms_opt_out) { summary.followups_skipped++; continue }
      const link = `${appUrl}/q/${(q as any).client_view_token}`
      const res = await sendAndLog(supabase, {
        to: client.phone,
        body: templates.quoteFollowup(client.name, link),
        kind: 'quote_followup',
        quote_id: (q as any).id,
        job_id: (q as any).job_id,
        client_id: (q as any).jobs?.client_id ?? null,
      })
      if (res.ok) {
        await supabase.from('quotes')
          .update({ followup_count: ((q as any).followup_count ?? 0) + 1, last_followup_at: new Date().toISOString() })
          .eq('id', (q as any).id)
        summary.followups_sent++
      } else {
        summary.followups_skipped++
        if (!res.notConfigured) summary.errors.push(`followup ${(q as any).id}: ${res.error}`)
      }
    }
  } catch (err: any) {
    summary.errors.push('followups: ' + err.message)
  }

  return json({ ok: true, ...summary })
})
