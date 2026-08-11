import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'
import { seededJobs } from '../demo/mockData'
import { hasCache, readCache, writeCache } from '../utils/queryCache'

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'
const IS_PURE_DEMO = IS_DEMO && !import.meta.env.VITE_SUPABASE_URL
const CACHE_KEY = 'jobs:list'

export function useJobs() {
  // Cache-then-refresh (F23): revisits paint last-known jobs instantly and
  // refresh behind, so switching back to the pipeline never re-skeletons.
  const [jobs, setJobs] = useState(
    IS_PURE_DEMO ? seededJobs() : (readCache(CACHE_KEY) ?? [])
  )
  const [loading, setLoading] = useState(!IS_PURE_DEMO && !hasCache(CACHE_KEY))
  const [error, setError] = useState(null)

  const fetchJobs = useCallback(async () => {
    if (IS_PURE_DEMO) return
    if (!hasCache(CACHE_KEY)) setLoading(true)   // skeleton only on the cold load
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
      writeCache(CACHE_KEY, data ?? [])
      setJobs(data ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Optimistic status change (F22): flip the card immediately, sync behind,
  // and revert + return the error so the caller can toast on failure.
  const updateJobStatus = useCallback(async (jobId, newStatus) => {
    const stamp = new Date().toISOString()
    const prevJobs = readCache(CACHE_KEY) ?? jobs
    const apply = list => list.map(j => j.id === jobId
      ? { ...j, status: newStatus, status_changed_at: stamp }
      : j
    )
    setJobs(apply)
    writeCache(CACHE_KEY, apply(prevJobs))
    if (IS_PURE_DEMO) return { error: null }

    const { error } = await supabase
      .from('jobs')
      .update({ status: newStatus, status_changed_at: stamp })
      .eq('id', jobId)

    if (error) {
      setError(error.message)
      fetchJobs()          // reconcile from the server (also repairs the cache)
    }
    return { error }
  }, [fetchJobs, jobs])

  return { jobs, loading, error, fetchJobs, updateJobStatus }
}
