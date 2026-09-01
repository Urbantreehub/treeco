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
//   * Never 500 on a malformed or unknown token — 200 or a quiet 404.
//   * Idempotent: the RPC handles being called twice, so a retry is harmless.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL

import { serviceClient, appUrl } from '../_shared/campaign.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function text(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
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

  try {
    const supabase = serviceClient()
    const { data, error } = await supabase.rpc('campaign_unsubscribe', {
      p_token:  token,
      p_reason: 'one-click',
    })

    // A DB hiccup is ours, not the provider's — but returning 500 invites
    // retries and, worse, tells the provider our unsubscribe is broken. Log it
    // and acknowledge; the address is still in the send log if it needs fixing
    // by hand.
    if (error) {
      console.error('campaign_unsubscribe failed', { token, message: error.message })
      return text('Unsubscribe recorded', 200)
    }

    // The RPC returns no rows for a token that matches nobody.
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return text('Unknown unsubscribe token', 404)

    return text(row.already ? 'Already unsubscribed' : 'Unsubscribed', 200)
  } catch (err) {
    console.error('campaign-unsubscribe error', (err as Error).message)
    return text('Unsubscribe recorded', 200)
  }
})
