import { createClient } from '@supabase/supabase-js'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!IS_DEMO && (!supabaseUrl || !supabaseAnonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
}

// A Proxy-based query stub: every PostgREST builder method (select, eq, order,
// match, or, not, filter, …) returns the same chain, so any query composes to
// any depth, and the terminal resolvers (single/maybeSingle/then/catch/finally)
// resolve to an empty result. Using a Proxy instead of a fixed method list keeps
// demo mode from crashing when a page reaches for a builder method we didn't
// hand-enumerate — exactly the class of bug the e2e smoke suite guards against.
function mockChain(result = { data: null, error: null }) {
  const chain = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then')    return (res, rej) => Promise.resolve(result).then(res, rej)
      if (prop === 'catch')   return (rej) => Promise.resolve(result).catch(rej)
      if (prop === 'finally') return (fn) => Promise.resolve(result).finally(fn)
      if (typeof prop === 'symbol') return undefined
      // Row-returning terminals resolve to a single null row.
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => Promise.resolve({ data: null, error: null })
      }
      // Every other builder method is chainable.
      return () => chain
    },
  })
  return chain
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
  // RPCs (register_quote_open, respond_to_quote) — no-op in demo.
  rpc: () => Promise.resolve({ data: null, error: null }),
}

// In demo mode with real credentials, use the real client (auto-login path)
export const supabase = (IS_DEMO && !supabaseUrl) ? mockClient : createClient(supabaseUrl, supabaseAnonKey)
