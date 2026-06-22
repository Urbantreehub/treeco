import { useState, useCallback } from 'react'
import { DEMO_JOBS } from './mockData'

export function useJobs() {
  const [jobs, setJobs] = useState(DEMO_JOBS)

  const updateJobStatus = useCallback((jobId, newStatus) => {
    setJobs(prev => prev.map(j => j.id === jobId
      ? { ...j, status: newStatus, status_changed_at: new Date().toISOString() }
      : j
    ))
  }, [])

  return { jobs, loading: false, error: null, fetchJobs: () => {}, updateJobStatus }
}
