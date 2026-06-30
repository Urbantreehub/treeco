import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

export function useScheduledChecks() {
  const [checks, setChecks] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('scheduled_checks')
        .select('*')
        .order('next_due', { ascending: true })
      setChecks(data ?? [])
    } catch (err) {
      console.error('useScheduledChecks:', err)
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const markDone = useCallback(async (id) => {
    const check = checks.find(c => c.id === id)
    if (!check) return
    const today = new Date().toISOString().slice(0, 10)
    const next = new Date()
    next.setDate(next.getDate() + check.frequency_days)
    const nextDue = next.toISOString().slice(0, 10)
    await supabase.from('scheduled_checks').update({
      last_done: today,
      next_due: nextDue,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await load()
  }, [checks, load])

  const today = new Date().toISOString().slice(0, 10)
  const overdue  = checks.filter(c => c.next_due < today)
  const dueSoon  = checks.filter(c => c.next_due >= today && c.next_due <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))
  const upcoming = checks.filter(c => c.next_due > new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10))

  return { checks, loading, overdue, dueSoon, upcoming, markDone, reload: load }
}
