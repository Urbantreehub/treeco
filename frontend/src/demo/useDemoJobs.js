import { useState, useCallback } from 'react'
import { seededJobs } from './mockData'

export function useJobs() {
  const [jobs, setJobs] = useState(seededJobs())

  const updateJobStatus = useCallback((jobId, newStatus) => {
    setJobs(prev => prev.map(j => j.id === jobId
      ? { ...j, status: newStatus, status_changed_at: new Date().toISOString() }
      : j
    ))
  }, [])

  return { jobs, loading: false, error: null, fetchJobs: () => {}, updateJobStatus }
}
