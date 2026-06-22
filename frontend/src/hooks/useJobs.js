import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../config/supabase'

export function useJobs() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        id, status, title, address, job_type,
        created_at, status_changed_at,
        clients (id, name, phone, email),
        quotes (id, status, subtotal, gst, total)
      `)
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
    // Optimistic update
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
      fetchJobs() // revert on failure
    }
  }, [fetchJobs])

  return { jobs, loading, error, fetchJobs, updateJobStatus }
}
