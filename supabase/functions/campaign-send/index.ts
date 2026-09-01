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
// Returns (send):  { ok, campaign_id, queued, sent, failed, skipped, remaining,
//                    status, capped, message? }
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
  sendEnabled, dailyCap, Campaign, Contact,
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
    if (campaign.status === 'sent') {
      return json({ error: 'This campaign has already been sent' }, 409)
    }

    const cap = await dailyCap(supabase)
    const summary = await runCampaign(supabase, campaign as Campaign, {
      limit: typeof limit === 'number' && limit > 0 ? Math.floor(limit) : undefined,
    })

    return json({ ok: summary.failed === 0, daily_cap: cap, ...summary })
  } catch (err) {
    const message = (err as Error).message
    await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign_id)
    return json({ error: message }, 500)
  }
})
