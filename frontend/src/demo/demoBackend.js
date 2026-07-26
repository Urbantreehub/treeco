// ─────────────────────────────────────────────────────────────────────────────
// Stateful in-memory Supabase-compatible client for DEMO mode.
//
// Demo mode runs with NO backend. This module stands in for the Supabase JS
// client so that every page — which calls supabase.from(...).select()/insert()/
// update()/delete(), supabase.storage, supabase.rpc(), supabase.channel() —
// behaves like the real app: data is stored, filtered, mutated and read back.
//
// Data is seeded from ./seed.js on first load and persisted to localStorage so
// the demo survives refreshes. resetDemoData() wipes it back to the clean seed.
//
// Nothing here talks to the network. File uploads are held as in-memory object
// URLs for the life of the tab (blobs can't be serialised to localStorage).
// ─────────────────────────────────────────────────────────────────────────────

import { buildSeed } from './seed'

const LS_KEY = 'treeco_demo_db_v2'

// Foreign-key relations used by PostgREST-style embedded selects, e.g.
//   .select('*, clients(id,name), quotes(id,status)')
// Keyed by base table → embed name → how to resolve it.
const RELATIONS = {
  jobs: {
    clients:    { table: 'clients',     type: 'one',  localKey: 'client_id', foreignKey: 'id' },
    quotes:     { table: 'quotes',      type: 'many', localKey: 'id',        foreignKey: 'job_id' },
    schedule:   { table: 'schedule',    type: 'many', localKey: 'id',        foreignKey: 'job_id' },
    job_photos: { table: 'job_photos',  type: 'many', localKey: 'id',        foreignKey: 'job_id' },
  },
  quotes: {
    jobs:    { table: 'jobs',    type: 'one', localKey: 'job_id',    foreignKey: 'id' },
    clients: { table: 'clients', type: 'one', localKey: 'client_id', foreignKey: 'id' },
  },
  schedule: {
    jobs: { table: 'jobs', type: 'one', localKey: 'job_id', foreignKey: 'id' },
  },
  job_photos: {
    jobs: { table: 'jobs', type: 'one', localKey: 'job_id', foreignKey: 'id' },
  },
  staff_records: {
    users: { table: 'users', type: 'one', localKey: 'user_id', foreignKey: 'id' },
  },
  messages: {
    users: { table: 'users', type: 'one', localKey: 'user_id', foreignKey: 'id' },
  },
  mulch_dumps: {
    mulch_sites: { table: 'mulch_sites', type: 'one', localKey: 'site_id', foreignKey: 'id' },
  },
  tool_requests: {
    users:        { table: 'users', type: 'one', localKey: 'requested_by', foreignKey: 'id' },
    requested_by: { table: 'users', type: 'one', localKey: 'requested_by', foreignKey: 'id' },
  },
  mulch_dumps_alias: {},
}

// Aliased embeds resolve by the FK column named after the ':' — e.g.
// `users:dumped_by(name)` embeds users via mulch_dumps.dumped_by. Register the
// FK-column form alongside the table-name form.
RELATIONS.mulch_dumps.dumped_by = { table: 'users', type: 'one', localKey: 'dumped_by', foreignKey: 'id' }

// ── Store ────────────────────────────────────────────────────────────────────

let db = null                 // { tableName: [rows] }
const fileUrls = new Map()    // storage path → object URL (in-memory only)

function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return 'demo-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function nowIso() { return new Date().toISOString() }

function load() {
  if (db) return db
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) { db = JSON.parse(raw); return db }
  } catch { /* ignore corrupt state */ }
  db = buildSeed()
  persist()
  return db
}

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)) } catch { /* quota — ignore */ }
}

export function resetDemoData() {
  db = buildSeed()
  fileUrls.clear()
  persist()
}

function table(name) {
  const store = load()
  if (!store[name]) store[name] = []
  return store[name]
}

// ── Filters ──────────────────────────────────────────────────────────────────

function matchOne(row, f) {
  const v = row[f.col]
  switch (f.type) {
    case 'eq':    return v === f.val || String(v) === String(f.val)
    case 'neq':   return !(v === f.val || String(v) === String(f.val))
    case 'gt':    return v > f.val
    case 'gte':   return v >= f.val
    case 'lt':    return v < f.val
    case 'lte':   return v <= f.val
    case 'is':    return f.val === null ? (v === null || v === undefined) : v === f.val
    case 'in':    return (f.val ?? []).some(x => x === v || String(x) === String(v))
    case 'ilike': return ilike(v, f.val)
    case 'like':  return like(v, f.val)
    case 'contains': // array column contains all of f.val (array) — e.g. assigned_to
      return Array.isArray(v) && (f.val ?? []).every(x => v.includes(x))
    case 'overlaps':
      return Array.isArray(v) && (f.val ?? []).some(x => v.includes(x))
    case 'or':    return f.conds.some(c => matchOne(row, c))
    case 'and':   return f.conds.every(c => matchOne(row, c))
    case 'not':   return !matchOne(row, { type: f.op, col: f.col, val: f.val })
    default:      return true
  }
}

function ilike(v, pattern) {
  if (v === null || v === undefined) return false
  const re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
  return re.test(String(v))
}
function like(v, pattern) {
  if (v === null || v === undefined) return false
  const re = new RegExp('^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$')
  return re.test(String(v))
}

// Parse a single "col.op.val" condition.
function parseCond(part) {
  const [col, op, ...rest] = part.trim().split('.')
  let val = rest.join('.')
  if (val === 'null') val = null
  return { type: op, col, val }
}

// Parse a PostgREST .or() string, which may contain nested and(...) groups:
//   "and(user_id.eq.X,recipient_id.eq.Y),and(user_id.eq.Y,recipient_id.eq.X)"
function parseOr(str) {
  return splitTopLevel(String(str)).map(tok => {
    tok = tok.trim()
    if (tok.startsWith('and(')) {
      const inner = tok.slice(4, tok.lastIndexOf(')'))
      return { type: 'and', conds: splitTopLevel(inner).map(parseCond) }
    }
    if (tok.startsWith('or(')) {
      const inner = tok.slice(3, tok.lastIndexOf(')'))
      return { type: 'or', conds: splitTopLevel(inner).map(parseCond) }
    }
    return parseCond(tok)
  })
}

function applyFilters(rows, filters) {
  return rows.filter(row => filters.every(f => matchOne(row, f)))
}

// ── Embedded relations ─────────────────────────────────────────────────────

// Split a select string on top-level commas (ignoring commas inside parens).
function splitTopLevel(str) {
  const out = []
  let depth = 0, cur = ''
  for (const ch of str) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// Returns { columns: [...] | '*', embeds: [{ name, alias, select }] }
function parseSelect(selectStr) {
  if (!selectStr || selectStr === '*') return { columns: '*', embeds: [] }
  const tokens = splitTopLevel(selectStr.replace(/\s+/g, ' ').trim())
  const columns = []
  const embeds = []
  for (const tok of tokens) {
    const parenIdx = tok.indexOf('(')
    if (parenIdx !== -1) {
      // embed: "alias:table(innerselect)" or "table(innerselect)"
      const head = tok.slice(0, parenIdx).trim()
      const inner = tok.slice(parenIdx + 1, tok.lastIndexOf(')'))
      const [aliasOrName, maybeName] = head.split(':').map(s => s.trim())
      const alias = maybeName ? aliasOrName : aliasOrName
      const name = maybeName ? maybeName : aliasOrName
      embeds.push({ name, alias, select: inner })
    } else {
      columns.push(tok.split(':').pop().trim())
    }
  }
  return { columns: columns.length ? columns : '*', embeds }
}

// Attach embedded relations (recursively, honouring aliases and nested embeds).
// Column projection is intentionally not enforced — returning full related rows
// is harmless for the demo and keeps this simple.
function attachEmbeds(baseTable, rows, embeds) {
  if (!embeds.length) return rows
  const relMap = RELATIONS[baseTable] || {}
  return rows.map(row => {
    const out = { ...row }
    for (const emb of embeds) {
      const rel = relMap[emb.name]
      const parsed = parseSelect(emb.select)
      if (!rel) { out[emb.alias] = null; continue }
      const related = table(rel.table)
      if (rel.type === 'one') {
        const match = related.find(r => r[rel.foreignKey] === row[rel.localKey])
        out[emb.alias] = match ? attachEmbeds(rel.table, [match], parsed.embeds)[0] : null
      } else {
        const matches = related.filter(r => r[rel.foreignKey] === row[rel.localKey])
        out[emb.alias] = attachEmbeds(rel.table, matches, parsed.embeds)
      }
    }
    return out
  })
}

// ── Ordering ─────────────────────────────────────────────────────────────────

function applyOrder(rows, orders) {
  if (!orders.length) return rows
  const sorted = [...rows]
  sorted.sort((a, b) => {
    for (const o of orders) {
      let av = a[o.col], bv = b[o.col]
      const aNull = av === null || av === undefined
      const bNull = bv === null || bv === undefined
      if (aNull && bNull) continue
      if (aNull) return o.nullsFirst ? -1 : 1
      if (bNull) return o.nullsFirst ? 1 : -1
      if (av === bv) continue
      const cmp = av > bv ? 1 : -1
      return o.ascending ? cmp : -cmp
    }
    return 0
  })
  return sorted
}

// ── Query builder ────────────────────────────────────────────────────────────

class Query {
  constructor(tableName) {
    this.tableName = tableName
    this.op = 'select'
    this.selectStr = '*'
    this.filters = []
    this.orders = []
    this.limitN = null
    this.rangeVal = null
    this.writeRows = null
    this.updatePatch = null
    this.upsertOpts = null
    this.wantSingle = false
    this.wantMaybeSingle = false
    this.returning = true
    this.head = false
  }

  select(str = '*', opts = {}) {
    // On a read this sets the columns/embeds; on a write it just asks for the
    // affected rows back. `{ count, head }` powers count-only queries.
    this.selectStr = str
    if (opts.head) this.head = true
    return this
  }
  insert(rows) { this.op = 'insert'; this.writeRows = Array.isArray(rows) ? rows : [rows]; return this }
  update(patch) { this.op = 'update'; this.updatePatch = patch; return this }
  upsert(rows, opts) { this.op = 'upsert'; this.writeRows = Array.isArray(rows) ? rows : [rows]; this.upsertOpts = opts || {}; return this }
  delete() { this.op = 'delete'; return this }

  eq(col, val)   { this.filters.push({ type: 'eq', col, val }); return this }
  neq(col, val)  { this.filters.push({ type: 'neq', col, val }); return this }
  gt(col, val)   { this.filters.push({ type: 'gt', col, val }); return this }
  gte(col, val)  { this.filters.push({ type: 'gte', col, val }); return this }
  lt(col, val)   { this.filters.push({ type: 'lt', col, val }); return this }
  lte(col, val)  { this.filters.push({ type: 'lte', col, val }); return this }
  is(col, val)   { this.filters.push({ type: 'is', col, val }); return this }
  in(col, val)   { this.filters.push({ type: 'in', col, val }); return this }
  ilike(col, val){ this.filters.push({ type: 'ilike', col, val }); return this }
  like(col, val) { this.filters.push({ type: 'like', col, val }); return this }
  contains(col, val)  { this.filters.push({ type: 'contains', col, val }); return this }
  overlaps(col, val)  { this.filters.push({ type: 'overlaps', col, val }); return this }
  match(obj) { Object.entries(obj).forEach(([col, val]) => this.filters.push({ type: 'eq', col, val })); return this }
  or(str) { this.filters.push({ type: 'or', conds: parseOr(str) }); return this }
  not(col, op, val) { this.filters.push({ type: 'not', op, col, val }); return this }

  order(col, opts = {}) { this.orders.push({ col, ascending: opts.ascending !== false, nullsFirst: !!opts.nullsFirst }); return this }
  limit(n) { this.limitN = n; return this }
  range(from, to) { this.rangeVal = [from, to]; return this }
  single() { this.wantSingle = true; return this }
  maybeSingle() { this.wantMaybeSingle = true; return this }

  _finalize(rows) {
    const count = rows.length
    if (this.head) return { data: null, error: null, count }
    let data = rows
    if (this.rangeVal) data = data.slice(this.rangeVal[0], this.rangeVal[1] + 1)
    if (this.limitN !== null) data = data.slice(0, this.limitN)
    if (this.wantSingle || this.wantMaybeSingle) {
      return { data: data[0] ?? null, error: null, count }
    }
    return { data, error: null, count }
  }

  _run() {
    try {
      const store = table(this.tableName)
      const parsed = parseSelect(this.selectStr)

      if (this.op === 'select') {
        let rows = applyFilters(store, this.filters)
        rows = applyOrder(rows, this.orders)
        rows = attachEmbeds(this.tableName, rows, parsed.embeds)
        return this._finalize(rows)
      }

      if (this.op === 'insert' || this.op === 'upsert') {
        const inserted = []
        for (const raw of this.writeRows) {
          const row = { ...raw }
          if (this.op === 'upsert') {
            const conflictCols = (this.upsertOpts.onConflict || 'id').split(',').map(s => s.trim())
            const existing = store.find(r => conflictCols.every(c => r[c] === row[c]))
            if (existing) {
              Object.assign(existing, row, { updated_at: nowIso() })
              inserted.push(existing)
              continue
            }
          }
          if (row.id === undefined || row.id === null) row.id = uid()
          if (!('created_at' in row)) row.created_at = nowIso()
          inserted.push(row)
          store.push(row)
        }
        persist()
        const rows = attachEmbeds(this.tableName, inserted, parsed.embeds)
        return this._finalize(rows)
      }

      if (this.op === 'update') {
        const targets = applyFilters(store, this.filters)
        for (const row of targets) Object.assign(row, this.updatePatch, { updated_at: nowIso() })
        persist()
        const rows = attachEmbeds(this.tableName, targets, parsed.embeds)
        return this._finalize(rows)
      }

      if (this.op === 'delete') {
        const targets = applyFilters(store, this.filters)
        const ids = new Set(targets)
        const kept = store.filter(r => !ids.has(r))
        store.length = 0
        store.push(...kept)
        persist()
        return this._finalize(targets)
      }

      return { data: null, error: null }
    } catch (err) {
      return { data: null, error: { message: String(err?.message || err) } }
    }
  }

  then(resolve, reject) { return Promise.resolve(this._run()).then(resolve, reject) }
  catch(reject) { return Promise.resolve(this._run()).catch(reject) }
  finally(fn) { return Promise.resolve(this._run()).finally(fn) }
}

// ── Storage ──────────────────────────────────────────────────────────────────

function storageBucket() {
  return {
    upload: (path, file) => {
      try {
        if (file instanceof Blob) fileUrls.set(path, URL.createObjectURL(file))
      } catch { /* ignore */ }
      return Promise.resolve({ data: { path }, error: null })
    },
    getPublicUrl: (path) => ({ data: { publicUrl: fileUrls.get(path) || path || '' } }),
    createSignedUrl: (path) => Promise.resolve({ data: { signedUrl: fileUrls.get(path) || path || '' }, error: null }),
    createSignedUrls: (paths) => Promise.resolve({ data: (paths || []).map(p => ({ path: p, signedUrl: fileUrls.get(p) || p })), error: null }),
    remove: (paths) => { (paths || []).forEach(p => fileUrls.delete(p)); return Promise.resolve({ data: null, error: null }) },
    list: () => Promise.resolve({ data: [], error: null }),
    download: (path) => Promise.resolve({ data: null, error: null }),
  }
}

// ── RPCs ─────────────────────────────────────────────────────────────────────

function runRpc(name, args = {}) {
  try {
    if (name === 'list_staff') {
      const users = table('users').map(u => ({ id: u.id, name: u.name }))
      return Promise.resolve({ data: users, error: null })
    }
    if (name === 'register_quote_open') {
      const token = args.p_token
      const q = table('quotes').find(r => r.client_view_token === token)
      if (q) {
        q.opened_count = (q.opened_count || 0) + 1
        q.last_opened_at = nowIso()
        if (!q.viewed_at) q.viewed_at = nowIso()
        if (q.status === 'sent') q.status = 'viewed'
        persist()
      }
      return Promise.resolve({ data: null, error: null })
    }
    if (name === 'respond_to_quote') {
      const token = args.p_token || args.token
      const action = args.p_action || args.action    // 'accepted' | 'declined'
      const reason = args.p_reason || args.reason || null
      const q = table('quotes').find(r => r.client_view_token === token)
      if (q) {
        q.status = action === 'declined' ? 'declined' : 'accepted'
        q.responded_at = nowIso()
        if (reason) q.decline_reason = reason
        const job = table('jobs').find(j => j.id === q.job_id)
        if (job && action !== 'declined') { job.status = 'accepted_to_schedule'; job.status_changed_at = nowIso() }
        if (job && action === 'declined') { job.status = 'declined'; job.status_changed_at = nowIso() }
        persist()
        return Promise.resolve({ data: { status: q.status }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  } catch (err) {
    return Promise.resolve({ data: null, error: { message: String(err?.message || err) } })
  }
}

// ── Auth (demo user, always signed in) ────────────────────────────────────────

function demoAuth() {
  return {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    setSession: () => Promise.resolve({ data: { session: null }, error: null }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
    resetPasswordForEmail: () => Promise.resolve({ data: null, error: null }),
  }
}

// ── Realtime (no-op) ───────────────────────────────────────────────────────

function demoChannel() {
  const ch = { on: () => ch, subscribe: (cb) => { if (typeof cb === 'function') cb('SUBSCRIBED'); return ch }, unsubscribe: () => {}, send: () => {} }
  return ch
}

// ── Public client ────────────────────────────────────────────────────────────

export const demoClient = {
  from: (tableName) => new Query(tableName),
  storage: { from: () => storageBucket() },
  rpc: (name, args) => runRpc(name, args),
  channel: () => demoChannel(),
  removeChannel: () => {},
  getChannels: () => [],
  auth: demoAuth(),
}
