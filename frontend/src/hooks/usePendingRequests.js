import { useState, useEffect } from 'react'
import { supabase } from '../config/supabase'

// Count of open ('requested') tool/wishlist requests, kept live via realtime.
// Used to badge the Tools nav item so the office sees new crew requests at a
// glance. `enabled` gates it to office/full users (crew don't need the badge).
export function usePendingRequests(enabled) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled) { setCount(0); return }
    let active = true

    const refresh = () => {
      supabase.from('tool_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'requested')
        .then(({ count }) => { if (active) setCount(count ?? 0) })
    }
    refresh()

    const channel = supabase
      .channel('pending-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tool_requests' }, refresh)
      .subscribe()

    return () => { active = false; supabase.removeChannel(channel) }
  }, [enabled])

  return count
}
