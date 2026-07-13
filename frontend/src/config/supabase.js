import { createClient } from '@supabase/supabase-js'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

function mockChain(result = { data: null, error: null }) {
  const c = {
    select: () => mockChain(result),
    insert: () => mockChain(result),
    update: () => mockChain(result),
    delete: () => mockChain(result),
    upsert: () => mockChain(result),
    eq:     () => mockChain(result),
    neq:    () => mockChain(result),
    ilike:  () => mockChain(result),
    in:     () => mockChain(result),
    is:     () => mockChain(result),
    order:  () => mockChain(result),
    limit:  () => mockChain(result),
    single: () => Promise.resolve({ data: null, error: null }),
    then:   (res, rej) => Promise.resolve(result).then(res, rej),
    catch:  (rej) => Promise.resolve(result).catch(rej),
    finally:(fn)  => Promise.resolve(result).finally(fn),
  }
  return c
}

const mockClient = {
  from:    () => mockChain(),
  auth: {
    getSession:         () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange:  () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ error: null }),
    signOut:            () => Promise.resolve(),
  },
  storage: {
    from: () => ({
      upload:       () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
  // Realtime no-op — demo mode has no live backend. Without this, any page that
  // opens a channel (nav badge, chat, tool requests) throws and blanks the app.
  channel: () => {
    const ch = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} }
    return ch
  },
  removeChannel: () => {},
}

// In demo mode with real credentials, use the real client (auto-login path)
export const supabase = (IS_DEMO && !supabaseUrl) ? mockClient : createClient(supabaseUrl, supabaseAnonKey)
