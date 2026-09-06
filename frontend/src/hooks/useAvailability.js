import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../config/supabase'

// Leave, sick days and part days per person per date (the availability table).
// Away people grey out on the scheduler and drop out of schedule.assigned_to.

export const AVAILABILITY_KINDS = [
  { key: 'leave',    label: 'Annual leave', short: 'annual leave' },
  { key: 'sick',     label: 'Sick day',     short: 'sick' },
  { key: 'part_day', label: 'Part day',     short: 'part day' },
  { key: 'other',    label: 'Away (other)', short: 'away' },
]

export function kindLabel(kind) {
  return AVAILABILITY_KINDS.find(k => k.key === kind)?.short ?? 'away'
}

// Every date from `start` to `end` inclusive (YYYY-MM-DD strings), weekdays
// only unless includeWeekends — leave over a weekend is noise on a Mon–Fri board.
export function datesBetween(start, end, { includeWeekends = false } = {}) {
  const out = []
  if (!start) return out
  const d = new Date(start + 'T00:00:00')
  const last = new Date((end || start) + 'T00:00:00')
  while (d <= last && out.length < 366) {
    const dow = d.getDay()
    if (includeWeekends || (dow !== 0 && dow !== 6)) {
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function useAvailability(range) {
  const [availability, setAvailability] = useState([])
  const [supported, setSupported] = useState(true)
  const stateRef = useRef(availability)
  stateRef.current = availability
  const start = range?.start, end = range?.end

  const reload = useCallback(async () => {
    if (!start || !end) return
    const { data, error } = await supabase.from('availability').select('*').gte('date', start).lte('date', end)
    if (error) { setSupported(false); return }
    setSupported(true)
    setAvailability(Array.isArray(data) ? data : [])
  }, [start, end])

  useEffect(() => { reload() }, [reload])

  const isAway = useCallback((userId, date) =>
    stateRef.current.find(a => a.user_id === userId && a.date === date) ?? null, [])

  // Upsert one row per date for the person. Returns the rows now in state.
  const addLeave = useCallback(async ({ userId, start: from, end: to, kind = 'leave', note = '' }) => {
    const dates = datesBetween(from, to)
    if (!userId || !dates.length) return { error: { message: 'Pick a person and a date' } }
    const rows = dates.map(date => ({ user_id: userId, date, kind, note: note || null }))
    const optimistic = rows.map(r => ({ id: `${r.user_id}:${r.date}`, ...r }))
    const next = stateRef.current.filter(a => !(a.user_id === userId && dates.includes(a.date))).concat(optimistic)
    setAvailability(next)
    stateRef.current = next
    const { data, error } = await supabase.from('availability').upsert(rows, { onConflict: 'user_id,date' }).select()
    if (!error && Array.isArray(data) && data.length) {
      // Swap the optimistic ids for the real ones so a delete can target them.
      const real = new Map(data.map(r => [`${r.user_id}:${r.date}`, r]))
      const merged = stateRef.current.map(a => real.get(`${a.user_id}:${a.date}`) ?? a)
      setAvailability(merged)
      stateRef.current = merged
    }
    return { error: error ?? null, dates }
  }, [])

  // Remove a person's away marks on the given dates (a whole block, typically).
  const removeLeave = useCallback(async (userId, dates) => {
    const gone = stateRef.current.filter(a => a.user_id === userId && dates.includes(a.date))
    const next = stateRef.current.filter(a => !gone.includes(a))
    setAvailability(next)
    stateRef.current = next
    const { error } = await supabase.from('availability').delete().eq('user_id', userId).in('date', dates)
    return { error: error ?? null }
  }, [])

  // Consecutive away dates for a person around `date` (for "Sen · leave · Mon–Wed").
  const blockFor = useCallback((userId, date) => {
    const mine = stateRef.current.filter(a => a.user_id === userId).map(a => a.date).sort()
    if (!mine.includes(date)) return []
    const step = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
    const out = [date]
    let d = date
    while (mine.includes(step(d, -1)) || (new Date(step(d, -1) + 'T00:00:00').getDay() === 0 && mine.includes(step(d, -3)))) {
      d = mine.includes(step(d, -1)) ? step(d, -1) : step(d, -3)
      out.unshift(d)
    }
    d = date
    while (mine.includes(step(d, 1)) || (new Date(step(d, 1) + 'T00:00:00').getDay() === 6 && mine.includes(step(d, 3)))) {
      d = mine.includes(step(d, 1)) ? step(d, 1) : step(d, 3)
      out.push(d)
    }
    return out
  }, [])

  return { availability, isAway, addLeave, removeLeave, blockFor, reload, supported }
}
