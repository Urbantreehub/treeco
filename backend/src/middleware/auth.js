import { supabaseAdmin } from '../db.js'

// Verifies the Supabase JWT from the Authorization header.
// Attaches req.user (Supabase auth user) and req.profile (users table row).
// All access_level checks happen server-side — never trust the frontend.

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' })
  }

  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  // Fetch the user's profile (includes access_level)
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, name, email, access_level, active')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return res.status(401).json({ error: 'User profile not found' })
  }

  if (!profile.active) {
    return res.status(403).json({ error: 'Account deactivated' })
  }

  req.user = user
  req.profile = profile
  req.token = token
  next()
}

// Use after requireAuth to gate full-access-only endpoints
export function requireFullAccess(req, res, next) {
  if (req.profile?.access_level !== 'full') {
    return res.status(403).json({ error: 'Full access required' })
  }
  next()
}
