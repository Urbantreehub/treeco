// Resend webhook receiver — turns delivery feedback into list hygiene.
//
// PUBLIC endpoint (deploy with verify_jwt = false, see supabase/config.toml,
// [functions.campaign-webhook]): Resend has no Supabase session. Authenticity
// is established instead by the Svix-style HMAC signature Resend sends with
// every request, verified against RESEND_WEBHOOK_SECRET.
//
// If RESEND_WEBHOOK_SECRET is not set the request is REJECTED with 401. An
// unsigned endpoint that writes to email_suppressions and flips consent_status
// would let anyone unsubscribe our customers or poison the list, so "no secret"
// must fail closed, never fall back to trusting the payload.
//
// Webhook URL to configure at resend.com → Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/campaign-webhook
// Events to subscribe to: email.bounced, email.complained, email.delivered
//
// Handling:
//   email.bounced    → only when data.bounce.type is Permanent/hard:
//                      email_suppressions('bounced'), contact.consent_status
//                      'bounced' + bounced_at, campaign_events('bounced').
//                      A soft/transient/undetermined bounce (full mailbox,
//                      greylisting) is logged as campaign_events('bounced')
//                      with meta.soft = true and nothing is suppressed.
//   email.complained → email_suppressions('complained'), contact.consent_status
//                      'complained' + complained_at, campaign_events('complained')
//   email.delivered  → campaign_events('delivered') only
// Sends are matched by campaign_sends.provider_id (the Resend message id); if
// no send row matches we still suppress the address, because a bounce is a
// fact about the address regardless of which system sent it.
//
// Returns: { ok: true, handled: <event type>, ... }
//
// Required secrets: RESEND_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { json, serviceClient } from '../_shared/campaign.ts'

// Svix tolerates a 5-minute clock skew; anything older is a replay.
const TOLERANCE_MS = 5 * 60 * 1000

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Svix signs `${id}.${timestamp}.${body}` with the base64 secret that follows
// the `whsec_` prefix, and sends the result as a space-separated list of
// `v1,<base64 sig>` (a list, because secrets can be rotated).
async function verifySvix(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id        = req.headers.get('svix-id')        ?? req.headers.get('webhook-id')
  const timestamp = req.headers.get('svix-timestamp') ?? req.headers.get('webhook-timestamp')
  const signature = req.headers.get('svix-signature') ?? req.headers.get('webhook-signature')
  if (!id || !timestamp || !signature) return false

  const ts = Number(timestamp) * 1000
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TOLERANCE_MS) return false

  const keyBytes = Uint8Array.from(
    atob(secret.startsWith('whsec_') ? secret.slice(6) : secret),
    c => c.charCodeAt(0),
  )
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  )
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  return signature.split(' ')
    .map(part => part.includes(',') ? part.split(',')[1] : part)
    .some(sig => timingSafeEqual(sig, expected))
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET')
  if (!secret) {
    return json({ error: 'RESEND_WEBHOOK_SECRET not configured — refusing unsigned webhooks' }, 401)
  }

  const rawBody = await req.text()
  if (!(await verifySvix(req, rawBody, secret))) {
    return json({ error: 'Invalid webhook signature' }, 401)
  }

  let payload: any
  try { payload = JSON.parse(rawBody) } catch { return json({ error: 'Malformed JSON' }, 400) }

  const type = String(payload?.type ?? '')
  const data = payload?.data ?? {}
  const providerId: string | null = data.email_id ?? data.id ?? null
  const recipient: string | null =
    (Array.isArray(data.to) ? data.to[0] : data.to) ?? null

  const supabase = serviceClient()

  // Find the send this event belongs to. Resend's id is what we stored as
  // provider_id when the message went out.
  let send: { id: string; campaign_id: string; contact_id: string; email: string } | null = null
  if (providerId) {
    const { data: row } = await supabase
      .from('campaign_sends')
      .select('id, campaign_id, contact_id, email')
      .eq('provider_id', providerId)
      .maybeSingle()
    send = row ?? null
  }

  const email = (send?.email ?? recipient ?? '').toLowerCase()

  if (type === 'email.delivered') {
    if (send) {
      await supabase.from('campaign_events').insert({
        campaign_id: send.campaign_id,
        send_id:     send.id,
        contact_id:  send.contact_id,
        kind:        'delivered',
        meta:        { provider_id: providerId },
      })
    }
    return json({ ok: true, handled: type, matched: !!send })
  }

  if (type === 'email.bounced' || type === 'email.complained') {
    const bounced  = type === 'email.bounced'
    const reason   = bounced ? 'bounced' : 'complained'
    const detail   = bounced
      ? [data.bounce?.type, data.bounce?.subType, data.bounce?.message].filter(Boolean).join(' / ') || null
      : data.complaint?.type ?? null

    if (!email) return json({ ok: true, handled: type, matched: false, message: 'No address on payload' })

    // NOT every bounce means the address is dead. Resend reports bounce.type as
    // Permanent / Transient / Undetermined: a full mailbox, a greylisting or an
    // out-of-office loop is Transient, and permanently suppressing a real
    // customer over one is a customer we can never email again — including about
    // their job. Only a Permanent (hard) bounce suppresses. Soft ones are
    // logged as an event and left alone; if the address really is dead the
    // provider will report a permanent bounce soon enough.
    const bounceType = String(data.bounce?.type ?? '').toLowerCase()
    const softBounce = bounced && bounceType !== 'permanent' && bounceType !== 'hard'

    if (softBounce) {
      if (send) {
        await supabase.from('campaign_events').insert({
          campaign_id: send.campaign_id,
          send_id:     send.id,
          contact_id:  send.contact_id,
          kind:        'bounced',
          meta:        { provider_id: providerId, detail, soft: true, bounce_type: bounceType || 'unknown' },
        })
      }
      return json({
        ok: true, handled: type, matched: !!send, suppressed: null,
        soft_bounce: true, bounce_type: bounceType || 'unknown',
      })
    }

    // Global do-not-email list first: it survives contact deletion and
    // re-import, so it is the durable half of this.
    await supabase.from('email_suppressions')
      .upsert({ email, reason, detail }, { onConflict: 'email', ignoreDuplicates: true })

    // Then the contact's own consent state, so the Campaigns UI shows why.
    // Matched by id when we know the send, else by the lowercased address —
    // the importer stores emails lowercased and there is a unique index on
    // lower(email). Deliberately NOT `ilike`, which would treat the `_` in an
    // address like john_smith@… as a wildcard and hit the wrong contact.
    const stamp = new Date().toISOString()
    const patch = {
      consent_status: reason,
      ...(bounced ? { bounced_at: stamp } : { complained_at: stamp }),
    }
    const contactQuery = supabase.from('marketing_contacts').update(patch)
    await (send?.contact_id
      ? contactQuery.eq('id', send.contact_id)
      : contactQuery.eq('email', email))

    if (send) {
      await supabase.from('campaign_events').insert({
        campaign_id: send.campaign_id,
        send_id:     send.id,
        contact_id:  send.contact_id,
        kind:        reason,
        meta:        { provider_id: providerId, detail, ...(bounced ? { soft: false, bounce_type: bounceType || 'permanent' } : {}) },
      })
    }

    return json({ ok: true, handled: type, matched: !!send, suppressed: email })
  }

  // Anything else (email.sent, email.opened, email.clicked — we track those
  // ourselves) is acknowledged so Resend doesn't retry it.
  return json({ ok: true, handled: type, ignored: true })
})
