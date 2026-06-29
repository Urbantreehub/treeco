import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
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

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // Verify caller is full-access
  const { data: { user: caller }, error: authErr } = await supabaseAdmin.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)

  const { data: callerProfile } = await supabaseAdmin
    .from('users').select('access_level').eq('id', caller.id).single()
  if (callerProfile?.access_level !== 'full') return json({ error: 'Forbidden' }, 403)

  const { user_id } = await req.json().catch(() => ({}))
  if (!user_id) return json({ error: 'user_id required' }, 400)

  // Prevent self-deletion
  if (user_id === caller.id) return json({ error: 'Cannot delete your own account' }, 400)

  // Delete from users table first, then auth
  await supabaseAdmin.from('users').delete().eq('id', user_id)
  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id)

  if (deleteErr) return json({ error: deleteErr.message }, 500)
  return json({ ok: true })
})
