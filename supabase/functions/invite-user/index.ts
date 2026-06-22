// Sends a Supabase auth invite email to a new team member and creates their
// profile row in the users table.
//
// Required secrets (auto-injected by Supabase):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Called from Settings → Team → Invite with JSON body:
//   { email, name, access_level, resource_id }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Only allow POST
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Verify the caller is a full-access user
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerToken = authHeader.replace('Bearer ', '')

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Verify caller identity and access level
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)

  const { data: callerProfile } = await supabaseAdmin
    .from('users')
    .select('access_level')
    .eq('id', caller.id)
    .single()

  if (callerProfile?.access_level !== 'full') {
    return json({ error: 'Forbidden — full access required' }, 403)
  }

  // Parse request body
  const body = await req.json().catch(() => ({}))
  const { email, name, access_level = 'restricted', resource_id } = body

  if (!email || !name) return json({ error: 'email and name are required' }, 400)

  // Check if user already exists
  const { data: existing } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .single()

  if (existing) return json({ error: 'A user with that email already exists' }, 409)

  // Send invite email (Supabase handles the email with a magic link)
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

  const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${appUrl}/login`,
      data: { name },
    },
  )

  if (inviteErr) {
    console.error('Invite error:', inviteErr)
    return json({ error: inviteErr.message }, 500)
  }

  // Create profile row
  const { error: profileErr } = await supabaseAdmin
    .from('users')
    .upsert({
      id:           invited.user.id,
      email,
      name,
      access_level,
      resource_id:  resource_id || null,
    }, { onConflict: 'id' })

  if (profileErr) {
    console.error('Profile create error:', profileErr)
    // User was invited in auth but profile failed — not fatal, Settings can fix access level
    return json({ warning: 'Invite sent but profile creation failed: ' + profileErr.message }, 207)
  }

  return json({ ok: true, user_id: invited.user.id })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
