import { vi } from 'vitest'

// A small, chainable stand-in for the Supabase JS client, good enough to drive
// the route handlers under test. Query builders are thenable and support the
// terminal methods the routes use (.single(), .maybeSingle(), and awaiting the
// chain directly). Responses are supplied per-table via setResponse().
//
// Every resolved query is recorded in `.calls` so tests can assert what was
// written (e.g. that a job status cascade fired) without a real database.
export function createSupabaseMock() {
  const calls = []
  const responders = new Map() // table -> ({op}) => { data, error }

  function respond(ctx) {
    calls.push({ table: ctx.table, op: ctx.op, filters: ctx.filters, payload: ctx.payload })
    const r = responders.get(ctx.table)
    const res = typeof r === 'function' ? r(ctx) : r
    return res ?? { data: null, error: null }
  }

  function from(table) {
    const ctx = { table, op: 'select', filters: {}, payload: null }
    const chain = {
      select() { return chain },
      insert(p) { ctx.op = 'insert'; ctx.payload = p; return chain },
      update(p) { ctx.op = 'update'; ctx.payload = p; return chain },
      delete() { ctx.op = 'delete'; return chain },
      eq(k, v) { ctx.filters[k] = v; return chain },
      neq() { return chain },
      gte() { return chain },
      lte() { return chain },
      ilike() { return chain },
      contains(k, v) { ctx.filters[k] = v; return chain },
      or() { return chain },
      in() { return chain },
      is() { return chain },
      order() { return chain },
      limit() { return chain },
      single() { return Promise.resolve(respond(ctx)) },
      maybeSingle() { return Promise.resolve(respond(ctx)) },
      then(onF, onR) { return Promise.resolve(respond(ctx)).then(onF, onR) },
    }
    return chain
  }

  const supabaseAdmin = {
    from: vi.fn(from),
    auth: {
      // default: no valid user; override in tests via setUser()
      getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no user' } })),
    },
  }

  return {
    supabaseAdmin,
    // supabaseAs(token) returns a client scoped to that user — same query surface.
    supabaseAs: vi.fn(() => ({ from: vi.fn(from) })),
    calls,
    setResponse(table, resolver) { responders.set(table, resolver) },
    setUser(user) {
      supabaseAdmin.auth.getUser = vi.fn(async () => ({
        data: { user }, error: user ? null : { message: 'no user' },
      }))
    },
    reset() {
      calls.length = 0
      responders.clear()
      this.setUser(null)
    },
  }
}
