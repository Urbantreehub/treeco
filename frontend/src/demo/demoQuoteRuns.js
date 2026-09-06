// Demo quote runs — a Tuesday and a Thursday run in the current week so the
// Quote runs page has ordered stops to show. Job ids reference DEMO_JOBS in
// mockData.js (5 = Anna Ferreira, new lead · 6 = Heritage Homes Trust, visit
// booked · 1 = Margaret Thompson, quote sent → shows as a done stop).
// Wired into DEMO_TABLES.quote_runs by supabase.js.

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Date of the given weekday (1 = Mon … 6 = Sat) in the current Mon–Sun week.
function thisWeek(weekday) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + (weekday - 1))
  return ymd(d)
}

export const DEMO_QUOTE_RUNS = [
  {
    id: 'demo-run-tue',
    run_date: thisWeek(2),
    window: 'morning',
    job_ids: ['5', '6', '1'],
    assigned_to: [],
    notes: null,
    created_by: 'demo-josh',
  },
  {
    id: 'demo-run-thu',
    run_date: thisWeek(4),
    window: 'morning',
    job_ids: ['6', '5'],
    assigned_to: [],
    notes: null,
    created_by: 'demo-josh',
  },
]
