import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { DEMO_JOBS } from '../demo/mockData'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const IS_PURE_DEMO = IS_DEMO && !import.meta.env.VITE_SUPABASE_URL

export function useJobs() {
  const [jobs, setJobs] = useState(IS_PURE_DEMO ? DEMO_JOBS : [])
  const [loading, setLoading] = useState(!IS_PURE_DEMO)
  const [error, setError] = useState(null)

  const fetchJobs = useCallback(async () => {
    if (IS_PURE_DEMO) return
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
    if (IS_PURE_DEMO) return

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
