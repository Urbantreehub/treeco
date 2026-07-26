// Daily automated client notifications. Meant to be run once a day by a
// Supabase scheduled function (see the deploy note in Settings → Integrations).
//
// Sends two time-based triggers from the blueprint:
//   • quote_followup_day3  — quotes sent 3+ days ago with no response yet
//   • invoice_overdue_7d   — jobs invoiced 7+ days ago, re-nudged at most weekly
//
// Both respect clients.sms_opt_out and are idempotent (follow-ups via
// quotes.followup_count; overdue via a 7-day look-back on sms_messages).
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

  const summary = { followups_sent: 0, followups_skipped: 0, overdue_sent: 0, overdue_skipped: 0, errors: [] as string[] }

  // ── 1. Quote follow-ups: sent 3+ days ago, still unanswered, never nudged ──
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

  // ── 2. Invoice overdue: invoiced 7+ days ago, re-nudged at most once a week ──
  try {
    const cutoff = new Date(now - 7 * DAY).toISOString()
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, client_id, clients ( name, phone, sms_opt_out ), quotes ( status, total, xero_invoice_number )')
      .eq('status', 'invoiced')
      .lte('status_changed_at', cutoff)
    if (error) throw error

    for (const job of jobs ?? []) {
      const client = (job as any).clients
      if (!client?.phone || client.sms_opt_out) { summary.overdue_skipped++; continue }

      // Skip if we already sent an overdue reminder in the last 7 days.
      const { data: recent } = await supabase
        .from('sms_messages')
        .select('id')
        .eq('job_id', (job as any).id)
        .eq('kind', 'invoice_overdue')
        .gte('created_at', cutoff)
        .limit(1)
      if (recent && recent.length) { summary.overdue_skipped++; continue }

      const invoiced = ((job as any).quotes ?? []).find((x: any) => x.status === 'invoiced') ?? (job as any).quotes?.[0]
      const res = await sendAndLog(supabase, {
        to: client.phone,
        body: templates.invoiceOverdue(client.name, invoiced?.xero_invoice_number ?? '', invoiced?.total ?? 0),
        kind: 'invoice_overdue',
        job_id: (job as any).id,
        client_id: (job as any).client_id ?? null,
      })
      if (res.ok) summary.overdue_sent++
      else {
        summary.overdue_skipped++
        if (!res.notConfigured) summary.errors.push(`overdue ${(job as any).id}: ${res.error}`)
      }
    }
  } catch (err: any) {
    summary.errors.push('overdue: ' + err.message)
  }

  return json({ ok: true, ...summary })
})
