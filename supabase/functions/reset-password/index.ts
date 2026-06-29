import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Verify caller is full-access
  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)

  const { data: callerProfile } = await admin
    .from('users').select('access_level').eq('id', caller.id).single()
  if (callerProfile?.access_level !== 'full') return json({ error: 'Forbidden' }, 403)

  const { email } = await req.json().catch(() => ({}))
  if (!email) return json({ error: 'email required' }, 400)

  const appUrl = Deno.env.get('APP_URL') ?? 'https://frontend-delta-azure-21.vercel.app'

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/login` },
  })

  if (error || !data) return json({ error: error?.message ?? 'Failed to generate link' }, 500)

  const reset_url = data.properties?.action_link
  if (!reset_url) return json({ error: 'Could not extract reset URL' }, 500)

  return json({ ok: true, reset_url })
})
