// Sends every campaign whose scheduled_at has come round, and picks up any
// campaign left part-sent by the daily cap or the function timeout. Intended to
// be run by pg_cron via net.http_post with the service key (same wiring as
// social-scheduler), but is safe to call manually — it only touches campaigns
// that are due, and claims each one before working it so a second run can't
// double-send.
//
// No caller auth: this is a cron entry point. It is only reachable with the
// service-role key, and every real guard (kill switch, daily cap, eligible-
// audience view) lives below in the shared send logic anyway.
//
// Respects app_settings.campaign_send_enabled: when that's false (the default),
// nothing goes out — scheduled campaigns just wait.
//
// Returns: { ok, processed, results: [{ campaign_id, sent, failed, ... }] }
//
// Required secrets: RESEND_API_KEY, APP_URL, SUPABASE_URL,
//                   SUPABASE_SERVICE_ROLE_KEY

import {
  CORS, json, serviceClient, runCampaign, sendEnabled, dailyCap, nzDayStartIso,
  claimCampaignRun, releaseCampaignRun, isNoRecipientsError, countSendRows,
  Campaign, SendSummary,
} from '../_shared/campaign.ts'

// An empty SendSummary to build error results from, so every result has the
// same shape whatever went wrong.
function blankSummary(campaignId: string, status: string, message: string, remaining = 0): SendSummary {
  return {
    campaign_id: campaignId, queued: 0, sent: 0, failed: 0, retrying: 0, skipped: 0,
    reclaimed: 0, remaining, unqueued: 0, status, capped: false, message,
  }
}

const CAMPAIGN_COLUMNS =
  'id, name, subject, preheader, body, from_name, from_email, reply_to, status, ' +
  'audience, offer_code, offer_percent, offer_expires_on, offer_terms, cta_label, cta_url'

// One invocation's slice of wall clock. Edge functions are killed at ~150s, so
// stop well short and let the next tick carry on — the queue is durable.
const RUN_BUDGET_MS = 110_000

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const supabase = serviceClient()

  // Kill switch (off by default, like marketing_autopost_enabled).
  if (!(await sendEnabled(supabase))) {
    return json({ ok: true, processed: 0, message: 'Campaign sending is paused' })
  }

  // Nothing to do if the day's allowance is already spent.
  const cap = await dailyCap(supabase)
  const { count: sentToday } = await supabase
    .from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', nzDayStartIso())
  const budget = Math.max(0, cap - (sentToday ?? 0))
  if (budget <= 0) {
    return json({ ok: true, processed: 0, message: `Daily send cap of ${cap} already reached` })
  }

  const nowIso = new Date().toISOString()

  // Due = scheduled and its time has passed. Campaigns already 'sending' are
  // picked up afterwards, so a run cut short by the cap or the clock resumes.
  const { data: due } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(10)

  const { data: inFlight } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('status', 'sending')
    .order('started_at', { ascending: true })
    .limit(10)

  const results: SendSummary[] = []
  const deadline = Date.now() + RUN_BUDGET_MS

  for (const campaign of due ?? []) {
    if (Date.now() >= deadline) break
    // Claim the row so a concurrent run (or a manual "Send now") skips it.
    const { data: claimed } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)
      .eq('status', 'scheduled') // only if still scheduled
      .select('id')
      .maybeSingle()
    if (!claimed) continue

    // The status flip above stops a second scheduler picking it out of `due`,
    // but says nothing about a "Send now" that is already inside the campaign.
    // The run lock is what actually serialises the two.
    if (!(await claimCampaignRun(supabase, campaign.id).catch(() => false))) continue

    try {
      results.push(await runCampaign(supabase, campaign as Campaign, {
        deadlineMs: Math.max(0, deadline - Date.now()),
      }))
    } catch (err) {
      // Nobody matched the filter: put it back to draft so it can be fixed,
      // rather than leaving it stuck 'sending' with nothing to send.
      if (isNoRecipientsError(err)) {
        await supabase.from('campaigns').update({ status: 'draft' }).eq('id', campaign.id)
        results.push(blankSummary(campaign.id, 'draft', (err as Error).message))
      } else {
        const alreadySent = await countSendRows(supabase, campaign.id, ['sent']).catch(() => 0)
        if (alreadySent === 0) await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id)
        results.push(blankSummary(campaign.id, alreadySent === 0 ? 'failed' : 'sending', (err as Error).message))
      }
    } finally {
      await releaseCampaignRun(supabase, campaign.id)
    }
  }

  // Resume anything already mid-flight. 'sending' means unfinished by
  // definition, so there is no pre-filter on queued rows here: a campaign the
  // daily cap truncated has an EMPTY queue and an audience still to work
  // through, and the old `if (!queued) continue` skipped exactly those — which
  // is how 1,800 of 2,000 people were never mailed.
  for (const campaign of inFlight ?? []) {
    if (Date.now() >= deadline) break
    if (results.some(r => r.campaign_id === campaign.id)) continue
    if (!(await claimCampaignRun(supabase, campaign.id).catch(() => false))) continue

    try {
      results.push(await runCampaign(supabase, campaign as Campaign, {
        deadlineMs: Math.max(0, deadline - Date.now()),
      }))
    } catch (err) {
      results.push(blankSummary(campaign.id, 'sending', (err as Error).message))
    } finally {
      await releaseCampaignRun(supabase, campaign.id)
    }
  }

  if (results.length === 0) return json({ ok: true, processed: 0, message: 'Nothing due' })
  return json({ ok: true, processed: results.length, results })
})
