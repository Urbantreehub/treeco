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
  // Row-returning terminals resolve to the first seeded row (main added
  // table-seeded demo data), or null when there's nothing seeded.
  const row = () =>
    Promise.resolve(
      Array.isArray(result.data)
        ? { data: result.data[0] ?? null, error: null }
        : result
    )
  const chain = new Proxy(function () {}, {
    get(_target, prop) {
      if (prop === 'then')    return (res, rej) => Promise.resolve(result).then(res, rej)
      if (prop === 'catch')   return (rej) => Promise.resolve(result).catch(rej)
      if (prop === 'finally') return (fn) => Promise.resolve(result).finally(fn)
      if (typeof prop === 'symbol') return undefined
      if (prop === 'single' || prop === 'maybeSingle') return row
      // Every other builder method (select, eq, order, match, or, not, …) is
      // chainable, so any query composes to any depth without crashing.
      return () => chain
    },
  })
  return chain
}

// Seeded demo revenue so the Dashboard renders with real-looking figures in the
// public demo. Spread across this year and last year so the range filter has
// something to show. Demo-only — never used against a real backend.
function demoQuotes() {
  const rows = [
    // [year, monthIndex, subtotal, status, job_type]
    [2026, 6, 4850, 'invoiced', 'Tree Removal'], [2026, 6, 2100, 'accepted', 'Pruning'],
    [2026, 5, 3200, 'invoiced', 'Pruning'],       [2026, 4, 5600, 'complete', 'Tree Removal'],
    [2026, 3, 2750, 'accepted', 'Hedge'],          [2026, 2, 4100, 'invoiced', 'Tree Removal'],
    [2026, 1, 1800, 'accepted', 'Stump Grinding'], [2026, 0, 3900, 'invoiced', 'Pruning'],
    [2026, 5, 2600, 'sent', 'Pruning'],            [2026, 3, 3300, 'declined', 'Tree Removal'],
    [2025, 10, 5200, 'invoiced', 'Tree Removal'],  [2025, 9, 3400, 'accepted', 'Pruning'],
    [2025, 7, 4700, 'invoiced', 'Tree Removal'],   [2025, 5, 2900, 'complete', 'Hedge'],
    [2025, 3, 3800, 'invoiced', 'Pruning'],        [2025, 1, 2400, 'accepted', 'Tree Removal'],
    [2025, 10, 1500, 'stump grinding', 'Stump Grinding'],
  ]
  // Client / address / owner so the Sent-quotes tracker and activity timeline
  // read like real quotes rather than "Untitled quote · Unknown client".
  const parties = [
    ['Margaret Thompson', '14 Hillcrest Ave, Wellington', 'Josh Micallef'],
    ['Richard Tait',      '8 Miramar Rd, Miramar', 'Josh Micallef'],
    ['Coastal Properties Ltd', '55 Oriental Parade, Oriental Bay', 'Ashley Rapana'],
    ['Dave & Sue Wilson', '3 Karori Rd, Karori', 'Josh Micallef'],
    ['Anna Ferreira',     '22 Brooklyn Rd, Brooklyn', 'Ashley Rapana'],
    ['Heritage Homes Trust', '101 Mt Victoria Blvd, Mt Victoria', 'Josh Micallef'],
    ['Jason Park',        '9 Newlands Ave, Newlands', 'Josh Micallef'],
  ]
  const HOUR = 3600000, DAY = 86400000
  const now = Date.now()
  return rows.map(([y, m, subtotal, status, job_type], i) => {
    const [clientName, address, owner] = parties[i % parties.length]
    const createdISO = new Date(y, m, 12).toISOString()
    const responded = ['accepted', 'declined', 'complete', 'invoiced'].includes(status)
    // Live quotes get a recent lifecycle so "Viewed N hours ago" reads freshly;
    // historical ones anchor to their created month.
    const isLive = status === 'sent'
    const base = isLive ? now - 2 * DAY : new Date(y, m, 12).getTime()
    const sentAt = new Date(base + 2 * HOUR).toISOString()
    const firstOpen = status === 'draft' ? null : new Date(base + 6 * HOUR).toISOString()
    const lastOpen = status === 'draft' ? null
      : new Date(isLive ? now - 5 * HOUR : base + 30 * HOUR).toISOString()
    return {
      id: `demo-q${i}`, status, subtotal, total: Math.round(subtotal * 1.15),
      created_at: createdISO,
      created_by: owner === 'Ashley Rapana' ? 'demo-ashley' : 'demo-josh',
      client_view_token: `demo-tok-${i}`,
      notes: 'Payment due upon completion of job\nCash or direct bank transfer is accepted\n\nCheers,\nJosh',
      sent_at: status === 'draft' ? null : sentAt,
      viewed_at: firstOpen,
      last_opened_at: lastOpen,
      opened_count: status === 'draft' ? 0 : (i % 3) + 1,
      responded_at: responded ? new Date(base + 3 * DAY).toISOString() : null,
      signed_name: status === 'accepted' ? clientName : null,
      valid_until: new Date(base + 30 * DAY).toISOString().slice(0, 10),
      followup_count: isLive ? 1 : 0,
      last_followup_at: isLive ? new Date(now - 12 * HOUR).toISOString() : null,
      jobs: { job_type, title: address, address, clients: { id: `demo-c${i}`, name: clientName, email: 'client@example.com', phone: '021 000 000' } },
    }
  })
}
// Demo roster so activity events attribute to real names.
const DEMO_USERS = [
  { id: 'demo-josh', name: 'Josh Micallef' },
  { id: 'demo-ashley', name: 'Ashley Rapana' },
]

// A populated demo day so the calendar (and its per-crew totals) has content.
function demoSchedule() {
  const now = new Date()
  // The calendar hides weekends and jumps to the next business day, so land the
  // demo jobs on that same day (Sat/Sun → Monday) or they'd fall on a hidden day.
  const dow = now.getDay()
  if (dow === 6) now.setDate(now.getDate() + 2)
  else if (dow === 0) now.setDate(now.getDate() + 1)
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const mk = (id, resource_id, start, end, name, job_type, subtotal) => ({
    id, job_id: `sj-${id}`, date: ymd, start_time: start, end_time: end,
    resource_id, status: 'scheduled', vehicle_reg: null,
    jobs: {
      id: `sj-${id}`, title: name, status: 'scheduled', job_type,
      address: `${name.split(' ')[0]} Rd, Wellington`, lat: null, lng: null,
      ko_reference: null, sla_due_at: null, description: null,
      clients: { name, phone: null },
      quotes: [{ id: `sq-${id}`, status: 'accepted', total: Math.round(subtotal * 1.15), subtotal }],
    },
  })
  return [
    mk('1', 'josh',   '07:00:00', '10:00:00', 'Margaret Thompson', 'Tree Removal', 4850),
    mk('2', 'josh',   '11:00:00', '14:00:00', 'Coastal Properties', 'Pruning',     2070),
    mk('3', 'isuzu',  '07:30:00', '12:00:00', 'Richard Tait',       'Pruning',      748),
    mk('4', 'nissan', '08:00:00', '15:00:00', 'Heritage Homes',     'Tree Removal', 6210),
    mk('5', 'nissan', '15:30:00', '17:00:00', 'Jason Park',         'Pruning',      1380),
  ]
}

const DEMO_TABLES = {
  quotes:   () => demoQuotes(),
  users:    () => DEMO_USERS,
  schedule: () => demoSchedule(),
  vehicles: () => ([
    { id: 'v1', name: 'Isuzu tipper', plate: 'KRT294', active: true, cof_due: null, ruc_km_remaining: 1240, notes: '' },
    { id: 'v2', name: 'Nissan crew cab', plate: 'MHD812', active: true, cof_due: null, ruc_km_remaining: 620, notes: '' },
  ]),
}

const mockClient = {
  from:    (table) => mockChain({ data: DEMO_TABLES[table] ? DEMO_TABLES[table]() : null, error: null }),
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
