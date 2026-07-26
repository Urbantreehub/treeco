import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

// In demo mode `supabase` is the stateful in-memory demo backend, so the same
// queries below just work against seeded data — no demo-specific branch needed.

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jobs')
      // '*' keeps this resilient to schema drift (e.g. the `category` column,
      // added by migration 017, may not be live yet) — an explicit list would
      // 400 the whole query and blank the pipeline if one column is missing.
      .select(`
        *,
        clients (id, name, phone, email),
        quotes (id, status, subtotal, gst, total)
      `)
      // Exclude safety_event jobs (toolbox meetings etc.) — they live on the calendar.
      // Must use .or() because PostgREST .neq() excludes NULL rows in SQL semantics.
      .or('job_type.is.null,job_type.neq.safety_event')
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setJobs(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const updateJobStatus = useCallback(async (jobId, newStatus) => {
    setJobs(prev => prev.map(j => j.id === jobId
      ? { ...j, status: newStatus, status_changed_at: new Date().toISOString() }
      : j
    ))

    const { error } = await supabase
      .from('jobs')
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq('id', jobId)

    if (error) {
      setError(error.message)
      fetchJobs()
    }
  }, [fetchJobs])

  return { jobs, loading, error, fetchJobs, updateJobStatus }
}
