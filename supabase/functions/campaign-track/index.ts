// Open-pixel and click-redirect endpoint for campaign emails.
//
// PUBLIC — no auth. Deploy with verify_jwt = false (see supabase/config.toml,
// [functions.campaign-track]); a mail client fetching the pixel or a customer
// following a link has no Supabase session and never will. Nothing sensitive is
// exposed: the only identifier in the URL is campaign_sends.track_token, a
// per-send random secret, and the counters are written by SECURITY DEFINER RPCs
// that take nothing else.
//
//   GET ?o=<track_token>
//        → register_campaign_open, returns a 1x1 transparent GIF (no-store).
//   GET ?c=<track_token>&u=<base64url destination>
//        → register_campaign_click, then 302 to the decoded URL.
//
// OPEN-REDIRECT GUARD
// `u` is attacker-controllable — the URL is public and the token is guessable
// in principle — so the destination is validated before we redirect: https only,
// and the host must be urbantreeservices.net or one of its subdomains. Anything
// else is a 400, never a redirect. Without this the function would be a
// ready-made phishing hop with our domain in the visible link.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serviceClient, b64urlDecode, isTrackableLink } from '../_shared/campaign.ts'

// 1x1 fully transparent GIF.
const PIXEL_B64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const PIXEL = Uint8Array.from(atob(PIXEL_B64), c => c.charCodeAt(0))

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      'Content-Type':  'image/gif',
      'Content-Length': String(PIXEL.length),
      // Never cached: a cached pixel is an uncounted open, and proxies would
      // otherwise serve one hit for every subsequent read.
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma':        'no-cache',
      'Expires':       '0',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function bad(message: string, status = 400) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// https + our own domain only — isTrackableLink() in _shared/campaign.ts is the
// single definition, and the sender consults the same predicate before wrapping
// anything, so a link can never be wrapped into a URL this endpoint refuses.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return bad('GET required', 405)

  const url   = new URL(req.url)
  const open  = url.searchParams.get('o')
  const click = url.searchParams.get('c')

  const supabase = serviceClient()

  // ── Open pixel ────────────────────────────────────────────────────────────
  // Always returns the GIF, even for an unknown or missing token: a broken
  // image in a customer's email is a worse outcome than a lost statistic.
  if (open) {
    try { await supabase.rpc('register_campaign_open', { p_token: open }) } catch { /* ignore */ }
    return pixelResponse()
  }

  // ── Click redirect ────────────────────────────────────────────────────────
  if (click) {
    const encoded = url.searchParams.get('u')
    if (!encoded) return bad('Missing destination')

    let destination: string
    try { destination = b64urlDecode(encoded) } catch { return bad('Malformed destination') }

    if (!isTrackableLink(destination)) {
      return bad('Refusing to redirect off urbantreeservices.net')
    }

    // Header values must be ASCII. A perfectly valid URL with a macron in it —
    // /pōhutukawa — throws when it is put in a Location header, which would
    // turn the whole redirect into a 500. The URL parser gives us the
    // percent-encoded form that belongs on the wire; the original is what gets
    // logged as the click.
    let location: string
    try { location = new URL(destination).href } catch { return bad('Malformed destination') }

    try { await supabase.rpc('register_campaign_click', { p_token: click, p_url: destination }) } catch { /* ignore */ }

    return new Response(null, {
      status: 302,
      headers: {
        Location: location,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Referrer-Policy': 'no-referrer',
      },
    })
  }

  return bad('Nothing to track')
})
