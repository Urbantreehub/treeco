// One-click unsubscribe endpoint — the machine-facing half of the opt-out.
//
// PUBLIC — no auth. Deploy with verify_jwt = false (see supabase/config.toml,
// [functions.campaign-unsubscribe]). Gmail, Yahoo and Outlook POST here
// directly from their native "Unsubscribe" button; they carry no Supabase
// session and never will.
//
//   POST ?t=<unsubscribe_token>
//        → campaign_unsubscribe RPC, then 200 and a one-line plain body.
//        This is the RFC 8058 one-click target named by the List-Unsubscribe
//        header that _shared/campaign.ts sets on every send.
//   GET  ?t=<unsubscribe_token>
//        → 302 to ${APP_URL}/unsubscribe/<token>, the human confirmation page.
//
// WHY THIS EXISTS AS ITS OWN FUNCTION
// The visible "Unsubscribe" link in the email footer points at the app's React
// page, which greets the person and asks (optionally) why they're leaving. That
// page is a SPA route and cannot honour a POST. Declaring
// `List-Unsubscribe-Post: List-Unsubscribe=One-Click` and then not honouring
// the POST is worse than not declaring it at all — the big providers treat a
// non-functional one-click as a broken unsubscribe and hold it against the
// sending domain. So the machine link and the human link deliberately differ:
// this endpoint for providers, the SPA page for people. Both end in the same
// SECURITY DEFINER RPC, which is idempotent.
//
// ROBUSTNESS RULES (a broken opt-out is the worst bug this system can have)
//   * A bare POST with no body, no content-type and no auth must work. Any body
//     a provider does send (some send `List-Unsubscribe=One-Click` form-encoded)
//     is drained and ignored rather than parsed strictly.
//   * A malformed or unknown token is a quiet 404 — that is the provider's or
//     the link's problem, and there is nothing to retry.
//   * A DATABASE failure, though, FAILS CLOSED with a 503. Answering 200 when
//     nothing was written told Gmail the person was unsubscribed when they were
//     not: the provider never retries, we have no record, and the next campaign
//     mails them again. A 5xx gets the request re-delivered, which is exactly
//     what we want. Every such failure is also written to
//     campaign_unsubscribe_failures so it is visible after the logs roll off.
//   * Idempotent: the RPC handles being called twice, so a retry is harmless.
//
// The unsubscribe token is a permanent per-contact secret — anyone holding it
// can opt that person out — so it is never written to a log. Failures are keyed
// by its SHA-256 instead, which is enough to match a complaint to a record.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

import { serviceClient, appUrl } from '../_shared/campaign.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function text(body: string, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}

// Identifies a token in the failure record without storing the secret itself.
async function tokenHash(token: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

// A durable record of an unsubscribe we could not action. Edge function logs
// roll off; a person's opt-out request must not roll off with them, because
// under UEMA it has to be honoured within 5 working days whatever our database
// was doing at the time.
async function recordFailure(
  supabase: ReturnType<typeof serviceClient>,
  token: string,
  source: string,
  message: string,
): Promise<void> {
  const hash = await tokenHash(token)
  const { error } = await supabase.from('campaign_unsubscribe_failures').insert({
    token_hash: hash, source, error: message,
  })
  // Last resort only — never the raw token.
  if (error) {
    console.error('campaign-unsubscribe: could not record the failure either', {
      token_hash: hash.slice(0, 12), source, message, insert_error: error.message,
    })
  } else {
    console.error('campaign-unsubscribe failed', { token_hash: hash.slice(0, 12), source, message })
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const token = new URL(req.url).searchParams.get('t')?.trim() ?? ''

  // ── Human path: hand them to the confirmation page ─────────────────────────
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (!token) {
      return text(
        'That unsubscribe link looks incomplete. Email office@urbantreeservices.net '
        + 'and we\'ll take you off the list.', 400,
      )
    }
    return new Response(null, {
      status: 302,
      headers: {
        ...CORS,
        Location: `${appUrl()}/unsubscribe/${encodeURIComponent(token)}`,
        'Cache-Control': 'no-store',
      },
    })
  }

  if (req.method !== 'POST') return text('GET or POST required', 405)

  // Drain whatever the provider sent. RFC 8058 says the body is
  // `List-Unsubscribe=One-Click`, but not everyone sends it and not everyone
  // sets a content-type — so it is read and discarded, never parsed. The token
  // in the query string is the only input that matters.
  await req.text().catch(() => '')

  if (!token) return text('Missing unsubscribe token', 404)

  const supabase = serviceClient()

  try {
    const { data, error } = await supabase.rpc('campaign_unsubscribe', {
      p_token:  token,
      p_reason: 'one-click',
    })

    // FAIL CLOSED. Nothing was written, so saying "done" would be a lie the
    // provider believes and never revisits. 503 + Retry-After gets it
    // re-delivered, and the attempt is recorded either way.
    if (error) {
      await recordFailure(supabase, token, 'one-click', error.message)
      return text(
        'We could not record that just now. Please try the link again in a minute, '
        + 'or email office@urbantreeservices.net and we will take you off the list.',
        503, { 'Retry-After': '300' },
      )
    }

    // The RPC returns no rows for a token that matches nobody. Nothing to
    // retry, so this stays a plain 404.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return text('Unknown unsubscribe token', 404)

    // out_already since 041; `already` kept as a fallback so a redeploy that
    // lands before the migration still reads the right field.
    const already = row.out_already ?? row.already
    return text(already ? 'Already unsubscribed' : 'Unsubscribed', 200)
  } catch (err) {
    await recordFailure(supabase, token, 'one-click', (err as Error).message)
    return text(
      'We could not record that just now. Please try the link again in a minute, '
      + 'or email office@urbantreeservices.net and we will take you off the list.',
      503, { 'Retry-After': '300' },
    )
  }
})
