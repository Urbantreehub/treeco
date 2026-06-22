import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const supabaseOptions = { realtime: { transport: ws } }

// Server-side client uses the service role key (bypasses RLS where needed)
// for admin operations. Route handlers use the user's JWT to enforce RLS.
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseOptions
)

// Create a client that acts as a specific authenticated user
export function supabaseAs(accessToken) {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  )
}
