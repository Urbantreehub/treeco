import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../config/supabase'
import { DEMO_CREW_USERS } from '../demo/demoResources'

// Scheduler resources (trucks, people, equipment), the staff roster, and the
// per-day crew assignments. Rows on the timeline are the 'person' and 'truck'
// resources plus the catch-all "Unassigned" lane; 'equipment' rides on a truck
// as a chip. Every loader falls back gracefully when a table isn't migrated
// yet, so the calendar keeps working against an older database.

const IS_PURE_DEMO = import.meta.env.VITE_DEMO === 'true' && !import.meta.env.VITE_SUPABASE_URL

export const UNASSIGNED = { id: 'unassigned', name: 'Unassigned', title: 'Unassigned', kind: 'lane', color: '#C8C2BC', note: null, sort: 99 }

// Used when the resources table is missing or empty (the old hard-coded lanes,
// re-expressed in the new shape).
export const FALLBACK_RESOURCES = [
  { id: 'josh',    name: 'Josh',    kind: 'person',    color: '#4A6741', sort: 0, active: true, note: 'quote visits' },
  { id: 'isuzu',   name: 'Isuzu',   kind: 'truck',     color: '#4A7FA5', sort: 1, active: true, note: 'small truck' },
  { id: 'nissan',  name: 'Nissan',  kind: 'truck',     color: '#6D4AA8', sort: 2, active: true, note: 'big truck' },
  { id: 'navara',  name: 'Navara',  kind: 'truck',     color: '#8B6238', sort: 3, active: true, note: 'ute — carries the Avant or the grinder' },
  { id: 'avant',   name: 'Avant',   kind: 'equipment', color: '#8B6238', sort: 4, active: true, note: null },
  { id: 'grinder', name: 'Grinder', kind: 'equipment', color: '#8B6238', sort: 5, active: true, note: null },
]

const ROW_KINDS = new Set(['person', 'truck'])

function normalise(r) {
  return { ...r, title: r.name ?? r.title ?? r.id, name: r.name ?? r.title ?? r.id, color: r.color ?? '#97A0AB' }
}

// Short label for a chip: the roster's short name, else the first name.
export function shortName(user) {
  if (!user) return '?'
  if (user.short) return user.short
  return (user.name ?? user.email ?? user.id ?? '?').split(/\s+/)[0]
}
export function initialsOf(user) {
  const n = user?.short ?? user?.name ?? '?'
  return n.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// People = active users who are actual people (truck logins are shared iPads).
function isPerson(u) {
  return u && u.active !== false && u.access_level !== 'truck'
}

export function useResources() {
  const [resources, setResources] = useState(FALLBACK_RESOURCES.map(normalise))
  const [users, setUsers] = useState(IS_PURE_DEMO ? DEMO_CREW_USERS : [])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: res, error: resErr }, { data: us }] = await Promise.all([
        supabase.from('resources').select('*').order('sort'),
        supabase.from('users').select('*'),
      ])
      if (cancelled) return
      const live = (res ?? []).filter(r => r && r.id && r.active !== false)
      if (!resErr && live.length) {
        setResources(live.map(normalise).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)))
      }
      let list = Array.isArray(us) ? us : []
      if (IS_PURE_DEMO) {
        // The demo users table only carries two rows: fill names/defaults from
        // the roster, keeping any real row's fields on top.
        const byId = new Map(list.map(u => [u.id, u]))
        list = DEMO_CREW_USERS.map(d => ({ ...d, ...(byId.get(d.id) ?? {}), resource_id: byId.get(d.id)?.resource_id ?? d.resource_id }))
          .concat(list.filter(u => !DEMO_CREW_USERS.some(d => d.id === u.id)))
      }
      setUsers(list)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  const rows = useMemo(() => resources.filter(r => ROW_KINDS.has(r.kind)).concat([UNASSIGNED]), [resources])
  const trucks = useMemo(() => resources.filter(r => r.kind === 'truck'), [resources])
  const equipment = useMemo(() => resources.filter(r => r.kind === 'equipment'), [resources])
  const people = useMemo(() => users.filter(isPerson).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')), [users])
  const byId = useMemo(() => new Map(resources.concat([UNASSIGNED]).map(r => [r.id, r])), [resources])
  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])

  const colorOf = useCallback(id => byId.get(id)?.color ?? '#97A0AB', [byId])
  const titleOf = useCallback(id => byId.get(id)?.title ?? (id === 'unassigned' ? 'Unassigned' : id), [byId])
  const userOf = useCallback(id => userById.get(id) ?? { id, name: 'Staff', short: 'Staff', unknown: true }, [userById])

  return { resources, rows, trucks, equipment, users, people, loading, byId, colorOf, titleOf, userOf }
}

// ── Crew assignments: who is on which truck on a day ────────────────────────
// A person defaults to users.resource_id every day; a crew_assignments row for
// that date moves them (a person is on one truck per day). Someone who should
// be off a truck for a day without joining another is marked away instead.

export function resolveCrew(resourceId, date, { people, assignments, availability, userOf }) {
  const here = (assignments ?? []).filter(a => a.resource_id === resourceId && a.date === date)
  const elsewhere = new Set((assignments ?? []).filter(a => a.date === date && a.resource_id !== resourceId).map(a => a.user_id))
  const ids = []
  ;(people ?? []).forEach(u => { if (u.resource_id === resourceId && !elsewhere.has(u.id)) ids.push(u.id) })
  here.forEach(a => { if (!ids.includes(a.user_id)) ids.push(a.user_id) })
  return ids.map(id => {
    const user = userOf ? userOf(id) : (people ?? []).find(u => u.id === id) ?? { id, name: 'Staff', unknown: true }
    const away = (availability ?? []).find(a => a.user_id === id && a.date === date) ?? null
    return { ...user, away, explicit: here.some(a => a.user_id === id), isDefault: user.resource_id === resourceId }
  })
}

// The user ids that belong in schedule.assigned_to for a truck-day: everyone
// on the truck who isn't away.
export function crewIds(resourceId, date, ctx) {
  return resolveCrew(resourceId, date, ctx).filter(c => !c.away).map(c => c.id)
}

export function sameIds(a, b) {
  const x = [...(a ?? [])].sort(), y = [...(b ?? [])].sort()
  return x.length === y.length && x.every((v, i) => v === y[i])
}

export function useCrewAssignments(range) {
  const [assignments, setAssignments] = useState([])
  const [supported, setSupported] = useState(true)
  const stateRef = useRef(assignments)
  stateRef.current = assignments
  const start = range?.start, end = range?.end

  const reload = useCallback(async () => {
    if (!start || !end) return
    const { data, error } = await supabase.from('crew_assignments').select('*').gte('date', start).lte('date', end)
    if (error) { setSupported(false); return }
    setSupported(true)
    setAssignments(Array.isArray(data) ? data : [])
  }, [start, end])

  useEffect(() => { reload() }, [reload])

  // Put a person on a truck for the given dates (moving them off any other
  // truck those days). Returns the new assignment list so callers can sync
  // schedule.assigned_to without waiting for a re-render.
  const assign = useCallback(async (userId, resourceId, dates) => {
    const rows = dates.map(date => ({ id: `${resourceId}:${date}:${userId}`, resource_id: resourceId, date, user_id: userId }))
    const next = stateRef.current
      .filter(a => !(a.user_id === userId && dates.includes(a.date)))
      .concat(rows)
    setAssignments(next)
    stateRef.current = next
    const del = await supabase.from('crew_assignments').delete().eq('user_id', userId).in('date', dates)
    if (del?.error) return { assignments: next, error: del.error }
    const ins = await supabase.from('crew_assignments').insert(rows.map(({ resource_id, date, user_id }) => ({ resource_id, date, user_id })))
    return { assignments: next, error: ins?.error ?? null }
  }, [])

  // Take a person's explicit assignments off the given dates (they fall back
  // to their default truck).
  const unassign = useCallback(async (userId, dates) => {
    const next = stateRef.current.filter(a => !(a.user_id === userId && dates.includes(a.date)))
    setAssignments(next)
    stateRef.current = next
    const del = await supabase.from('crew_assignments').delete().eq('user_id', userId).in('date', dates)
    return { assignments: next, error: del?.error ?? null }
  }, [])

  return { assignments, assign, unassign, reload, supported }
}
