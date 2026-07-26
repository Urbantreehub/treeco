import { createClient } from '@supabase/supabase-js'
import { demoClient, resetDemoData } from '../demo/demoBackend'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// Pure demo = demo build with no real Supabase project. Everything runs against
// a stateful in-browser backend (see demo/demoBackend.js) — no network, no real
// data. In demo mode WITH real credentials (VITE_SUPABASE_URL set, for an
// auto-login shared link) we still use the real client.
const IS_PURE_DEMO = IS_DEMO && !supabaseUrl

export const supabase = IS_PURE_DEMO ? demoClient : createClient(supabaseUrl, supabaseAnonKey)

// Re-exported so the "Reset demo data" control can wipe the sandbox back to seed.
export { resetDemoData }
