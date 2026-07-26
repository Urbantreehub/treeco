// Social OAuth callback — one function handles Facebook/Instagram (Meta), Google
// Business Profile, and LinkedIn. The provider is carried in the OAuth `state`
// param as "<provider>:<nonce>" (the frontend sets it), so a single redirect URI
// works for every provider.
//
// It exchanges the authorization code for tokens, discovers the target account
// (Page / IG business account / GBP location / LinkedIn author), upserts a row
// into social_connections, then redirects back to /settings.
//
// Required Edge Function secrets:
//   META_APP_ID / META_APP_SECRET
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET
//   SOCIAL_REDIRECT_URI  — this function's URL, registered with each provider
//   APP_URL              — where to send the user back to
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected

import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'
const REDIRECT_URI = Deno.env.get('SOCIAL_REDIRECT_URI') ?? ''
const GRAPH = `https://graph.facebook.com/${Deno.env.get('META_GRAPH_VERSION') ?? 'v21.0'}`

function back(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  return Response.redirect(`${APP_URL}/settings?${qs}`, 302)
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''
  const oauthErr = url.searchParams.get('error_description') || url.searchParams.get('error')
  const provider = state.split(':')[0]

  if (oauthErr) return back({ social_error: oauthErr })
  if (!code) return back({ social_error: 'missing_code' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    if (provider === 'facebook' || provider === 'instagram') {
      return await handleMeta(supabase, code)
    }
    if (provider === 'google_business') {
      return await handleGoogle(supabase, code)
    }
    if (provider === 'linkedin') {
      return await handleLinkedIn(supabase, code)
    }
    return back({ social_error: 'unknown_provider' })
  } catch (err) {
    console.error('social-auth error:', err)
    return back({ social_error: (err as Error).message })
  }
})

// ── Meta: connects the Facebook Page and, if linked, the Instagram account ───
async function handleMeta(supabase: any, code: string): Promise<Response> {
  const appId = Deno.env.get('META_APP_ID')!
  const appSecret = Deno.env.get('META_APP_SECRET')!

  // 1. code → short-lived user token
  const tokRes = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    client_id: appId, client_secret: appSecret, redirect_uri: REDIRECT_URI, code,
  }))
  const tok = await tokRes.json()
  if (!tokRes.ok) return back({ social_error: tok.error?.message ?? 'meta_token_failed' })

  // 2. exchange for a long-lived (~60 day) user token
  const llRes = await fetch(`${GRAPH}/oauth/access_token?` + new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret,
    fb_exchange_token: tok.access_token,
  }))
  const ll = await llRes.json()
  const userToken = ll.access_token ?? tok.access_token
  const expiresAt = ll.expires_in ? new Date(Date.now() + ll.expires_in * 1000).toISOString() : null

  // 3. find the first managed Page (Page token never expires while the user
  //    token is valid) and its linked Instagram business account.
  const pagesRes = await fetch(`${GRAPH}/me/accounts?` + new URLSearchParams({
    fields: 'name,access_token,instagram_business_account{id,username}', access_token: userToken,
  }))
  const pages = await pagesRes.json()
  const page = pages.data?.[0]
  if (!page) return back({ social_error: 'no_facebook_page' })

  await supabase.from('social_connections').upsert({
    platform: 'facebook',
    account_id: page.id,
    account_name: page.name,
    access_token: page.access_token,
    expires_at: expiresAt,
    meta: {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'platform' })

  let igConnected = false
  if (page.instagram_business_account?.id) {
    await supabase.from('social_connections').upsert({
      platform: 'instagram',
      account_id: page.instagram_business_account.id,
      account_name: page.instagram_business_account.username ?? page.name,
      access_token: page.access_token, // IG publishing uses the Page token
      expires_at: expiresAt,
      meta: { page_id: page.id },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'platform' })
    igConnected = true
  }

  return back({ social: 'connected', platform: igConnected ? 'facebook_instagram' : 'facebook' })
}

// ── Google Business Profile ──────────────────────────────────────────────────
async function handleGoogle(supabase: any, code: string): Promise<Response> {
  const tokRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      redirect_uri: REDIRECT_URI, code, grant_type: 'authorization_code',
    }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) return back({ social_error: tok.error_description ?? 'google_token_failed' })

  const auth = { Authorization: `Bearer ${tok.access_token}` }

  // Discover the first Business Profile account + location. localPosts (v4)
  // needs the "accounts/{a}/locations/{l}" resource name.
  let locationName: string | null = null
  let locationTitle: string | null = null
  try {
    const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { headers: auth })
    const acc = await accRes.json()
    const account = acc.accounts?.[0]?.name // "accounts/123"
    if (account) {
      const locRes = await fetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account}/locations?readMask=name,title&pageSize=1`,
        { headers: auth },
      )
      const loc = await locRes.json()
      const location = loc.locations?.[0]
      if (location?.name) {
        locationName = `${account}/${location.name}` // accounts/123/locations/456
        locationTitle = location.title ?? null
      }
    }
  } catch (_) { /* discovery is best-effort; token is still stored */ }

  await supabase.from('social_connections').upsert({
    platform: 'google_business',
    account_id: locationName,
    account_name: locationTitle ?? 'Google Business Profile',
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? null,
    expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    meta: {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'platform' })

  if (!locationName) return back({ social: 'connected', platform: 'google_business_nolocation' })
  return back({ social: 'connected', platform: 'google_business' })
}

// ── LinkedIn (defaults to posting as the signed-in member) ───────────────────
async function handleLinkedIn(supabase: any, code: string): Promise<Response> {
  const tokRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
      client_id: Deno.env.get('LINKEDIN_CLIENT_ID')!,
      client_secret: Deno.env.get('LINKEDIN_CLIENT_SECRET')!,
    }),
  })
  const tok = await tokRes.json()
  if (!tokRes.ok) return back({ social_error: tok.error_description ?? 'linkedin_token_failed' })

  // OpenID userinfo → member URN. To post as a Company Page instead, replace
  // account_id with the organization URN ("urn:li:organization:<id>").
  let author = ''
  let name = 'LinkedIn'
  try {
    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    const me = await meRes.json()
    if (me.sub) { author = `urn:li:person:${me.sub}`; name = me.name ?? name }
  } catch (_) { /* leave author blank; user can set an org URN later */ }

  await supabase.from('social_connections').upsert({
    platform: 'linkedin',
    account_id: author || null,
    account_name: name,
    access_token: tok.access_token,
    expires_at: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000).toISOString() : null,
    meta: {},
    updated_at: new Date().toISOString(),
  }, { onConflict: 'platform' })

  return back({ social: 'connected', platform: 'linkedin' })
}
