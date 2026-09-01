// Sends an email campaign — either a single test to yourself, or the real
// thing to the campaign's resolved audience. Called from the Campaigns page
// ("Send me a test" / "Send now").
//
// POST body: { campaign_id: string, test_to?: string, limit?: number }
//   test_to  — when present, renders the campaign against a fake preview
//              contact and sends ONE email there. Nothing is written to
//              campaign_sends and no tracking is attached, so a test can never
//              contaminate the stats or mark a real customer as mailed.
//   limit    — cap this run's recipients, on top of the daily cap. Useful for
//              a cautious first batch ("send it to 20 and see").
//
// Auth: caller must be a signed-in full/office user (Bearer session token).
//
// Returns (test):  { ok: true, test: true, to, subject, html, text }
// Returns (send):  { ok, campaign_id, queued, sent, failed, retrying, skipped,
//                    reclaimed, remaining, unqueued, status, capped, message? }
//
// RESUMING
// A campaign whose run was cut short by the daily cap, the function's clock or a
// provider wobble stays 'sending' with people still to mail (`unqueued` counts
// the ones with no row yet). Calling this again resumes it — each run queues and
// mails the next slice — until the audience is drained, at which point it flips
// to 'sent' and further calls are refused.
//
// GUARDRAILS
//   * app_settings.campaign_send_enabled must be true (it ships false) — a real
//     send is refused with 409 until someone deliberately flips it in Settings.
//   * app_settings.campaign_daily_cap limits sends per NZ day ACROSS ALL
//     campaigns, so a bad audience filter can't burn the sending domain.
//   * The audience only ever comes from the campaign_audience_eligible view.
//
// Required secrets: RESEND_API_KEY, APP_URL, SUPABASE_URL,
//                   SUPABASE_SERVICE_ROLE_KEY

import {
  CORS, json, serviceClient, runCampaign, renderCampaignEmail, sendViaResend,
  sendEnabled, dailyCap, claimCampaignRun, releaseCampaignRun, isNoRecipientsError,
  countSendRows, Campaign, Contact,
} from '../_shared/campaign.ts'

const CAMPAIGN_COLUMNS =
  'id, name, subject, preheader, body, from_name, from_email, reply_to, status, ' +
  'audience, offer_code, offer_percent, offer_expires_on, offer_terms, cta_label, cta_url'

// A believable stand-in so the test email exercises every merge tag. Its
// unsubscribe token is a placeholder: the link is present (so the layout and
// footer are exactly what a customer sees) but points at nobody real.
function previewContact(email: string): Partial<Contact> {
  return {
    id:               '00000000-0000-0000-0000-000000000000',
    email,
    first_name:       'Sam',
    last_name:        'Taylor',
    full_name:        'Sam Taylor',
    suburb:           'Karori',
    city:             'Wellington',
    services:         ['pruning'],
    job_count:        2,
    lifetime_value:   1450,
    last_job_summary: 'pruning the big pohutukawa at the back of the section',
    months_since_job: 14,
    unsubscribe_token: 'preview',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = serviceClient()

  // Verify caller is a full/office user.
  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)
  const { data: profile } = await supabase.from('users').select('access_level').eq('id', caller.id).single()
  if (!['full', 'office'].includes(profile?.access_level ?? '')) {
    return json({ error: 'Forbidden — office access required' }, 403)
  }

  const { campaign_id, test_to, limit } = await req.json().catch(() => ({}))
  if (!campaign_id) return json({ error: 'Missing campaign_id' }, 400)

  const { data: campaign } = await supabase
    .from('campaigns').select(CAMPAIGN_COLUMNS).eq('id', campaign_id).maybeSingle()
  if (!campaign) return json({ error: 'Campaign not found' }, 404)

  // ── Test path ──────────────────────────────────────────────────────────────
  // Deliberately bypasses the kill switch and the daily cap: a test goes to one
  // staff address, never to the list, so neither guard applies. It also never
  // touches campaign_sends or the campaign's status — a failed test must not
  // mark a draft campaign as failed.
  if (typeof test_to === 'string' && test_to.trim()) {
    const to = test_to.trim()
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(to)) {
      return json({ error: 'test_to is not a valid email address' }, 400)
    }
    try {
      const rendered = renderCampaignEmail(
        campaign as Campaign,
        previewContact(to),
        null, // no track token → no click wrapping, no open pixel
      )
      const testSubject = `[TEST] ${rendered.subject}`
      await sendViaResend({
        campaign: campaign as Campaign,
        to,
        rendered: { ...rendered, subject: testSubject },
      })
      return json({
        ok: true, test: true, to,
        subject: testSubject,
        html: rendered.html,
        text: rendered.text,
      })
    } catch (err) {
      return json({ error: (err as Error).message }, 500)
    }
  }

  // ── Real send ──────────────────────────────────────────────────────────────
  try {
    if (!(await sendEnabled(supabase))) {
      return json({
        error: 'Campaign sending is switched off. Turn on "Allow campaign sending" '
             + 'in Settings before sending to the list. (Tests still work.)',
      }, 409)
    }
    if (!campaign.body?.trim()) return json({ error: 'Campaign has no body copy' }, 400)

    // 'sent' means finished — every eligible contact has a row and none is
    // outstanding — so it is refused. 'sending' is NOT finished: it is what a
    // campaign truncated by the daily cap (or by the function's clock) looks
    // like, and "Send now" on one of those must resume it. Refusing that was
    // what pushed people into cloning the campaign, which really did double-send
    // the first batch, because the UNIQUE(campaign_id, contact_id) is
    // per-campaign.
    if (campaign.status === 'sent') {
      return json({ error: 'This campaign has already been sent' }, 409)
    }

    // One run per campaign at a time — otherwise "Send now" and the cron tick
    // each hold their own copy of the daily budget and between them spend it
    // twice.
    if (!(await claimCampaignRun(supabase, campaign_id))) {
      return json({
        error: 'This campaign is already sending right now. Give it a minute and refresh — '
             + 'the run in progress will carry on where it got to.',
      }, 409)
    }

    const cap = await dailyCap(supabase)
    try {
      const summary = await runCampaign(supabase, campaign as Campaign, {
        limit: typeof limit === 'number' && limit > 0 ? Math.floor(limit) : undefined,
      })
      return json({ ok: summary.failed === 0, daily_cap: cap, ...summary })
    } finally {
      await releaseCampaignRun(supabase, campaign_id)
    }
  } catch (err) {
    const message = (err as Error).message

    // "Nobody matched" is a filter to fix, not a failure: leave the campaign
    // exactly as it was (draft/scheduled) so it can be edited and sent.
    if (isNoRecipientsError(err)) return json({ error: message }, 400)

    // Only condemn a campaign that has never got a message out. Once some have
    // gone, 'failed' would strand the rest — the scheduler only resumes
    // 'scheduled' and 'sending' — so leave it 'sending' and let the next tick
    // pick it up.
    const alreadySent = await countSendRows(supabase, campaign_id, ['sent']).catch(() => 0)
    if (alreadySent === 0) {
      await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id)
    }
    return json({ error: message }, 500)
  }
})
