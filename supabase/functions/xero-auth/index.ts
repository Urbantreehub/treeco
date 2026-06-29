// Xero OAuth callback — exchanges authorization code for tokens,
// stores them in xero_connections, then redirects back to /clients.
//
// Required Supabase Edge Function secrets:
//   XERO_CLIENT_ID      — from Xero developer portal
//   XERO_CLIENT_SECRET  — from Xero developer portal
//   XERO_REDIRECT_URI   — must match exactly what's registered in Xero app
//                         e.g. https://<project>.supabase.co/functions/v1/xero-auth
//   SUPABASE_URL        — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected (needed for upsert without RLS)

import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return Response.redirect(`${APP_URL}/settings?xero_error=${encodeURIComponent(error)}`, 302)
  }

  if (!code) {
    return new Response('Missing code parameter', { status: 400 })
  }

  const clientId     = Deno.env.get('XERO_CLIENT_ID')!
  const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')!
  const redirectUri  = Deno.env.get('XERO_REDIRECT_URI')!

  // Exchange code for tokens
  const tokenRes = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type:   'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('Token exchange failed:', body)
    return Response.redirect(`${APP_URL}/settings?xero_error=token_exchange_failed`, 302)
  }

  const tokens = await tokenRes.json()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Get connected tenants (Xero organisations)
  const tenantRes = await fetch('https://api.xero.com/connections', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const tenants = await tenantRes.json()
  const tenant = tenants[0] // use the first connected org

  if (!tenant) {
    return Response.redirect(`${APP_URL}/settings?xero_error=no_tenant`, 302)
  }

  // Store in Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error: dbError } = await supabase
    .from('xero_connections')
    .upsert({
      id:            '00000000-0000-0000-0000-000000000001', // single-org app: fixed ID
      tenant_id:     tenant.tenantId,
      tenant_name:   tenant.tenantName,
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'id' })

  if (dbError) {
    console.error('DB error:', dbError)
    return Response.redirect(`${APP_URL}/settings?xero_error=db_error`, 302)
  }

  return Response.redirect(`${APP_URL}/settings?xero=connected`, 302)
})
