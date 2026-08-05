import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'

// Open 'to be actioned' alerts (Ashley's to-do list), kept live via realtime.
// Returns { count, jobIds } — count badges the Actions nav item; jobIds is the
// set of jobs with an open alert, used to red-bubble their pipeline cards.
// `enabled` gates it to office/full users. Degrades to empty if job_alerts isn't
// there yet (migration 032 not applied).
export function useOpenAlerts(enabled) {
  const [state, setState] = useState({ count: 0, jobIds: new Set() })

  useEffect(() => {
    if (!enabled) { setState({ count: 0, jobIds: new Set() }); return }
    let active = true

    const refresh = () => {
      supabase.from('job_alerts')
        .select('job_id')
        .eq('status', 'open')
        .then(({ data }) => {
          if (!active) return
          const rows = data ?? []
          setState({ count: rows.length, jobIds: new Set(rows.map(r => r.job_id)) })
        })
    }
    refresh()

    const channel = supabase
      .channel('open-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_alerts' }, refresh)
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [enabled])

  return state
}
