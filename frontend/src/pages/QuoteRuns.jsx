import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import { supabase } from '../config/supabase'
import { useJobs } from '../hooks/useJobs'
import { useIsMobile } from '../hooks/useIsMobile'
import { JOB_STATUSES, jobCategory, JOB_CATEGORIES } from '../config/statuses'
import { jobHeading, koCode, kpiCountdown, displayCase, telHref } from '../utils/jobDisplay'
import { primaryQuote } from '../utils/quotes'
import { orderRoute, routeDistanceKm } from '../utils/geo'
import { ymd, niceDate, defaultRunDate, textClientsHeadsUp } from './Planner'

// Quote runs — the week strip from the redesign: Josh's Tue / Thu visits in
// order, one card per stop, plus a tray of leads waiting for a run and quotes
// still to write. Dragging a lead onto a day books the visit (a `schedule` row
// on the 'josh' lane) and moves the job to Visit booked, exactly as a drop on
// the calendar does. Works from schedule rows alone; `quote_runs` rows (ordered
// job_ids per date) open up extra run days and add un-timed stops.

const IS_PURE_DEMO = import.meta.env.VITE_DEMO === 'true' && !import.meta.env.VITE_SUPABASE_URL
const QUOTE_RESOURCE = 'josh'
const VISIT_MINUTES = 45
const TRAVEL_MINUTES = 15
const RUN_WEEKDAYS = [2, 4]                 // Tuesday, Thursday
const VISIT_COLOR = JOB_STATUSES.quote_scheduled.color
const LEAD_COLOR = JOB_STATUSES.new_lead.color
const SENT_COLOR = JOB_STATUSES.quote_sent.color
const QUOTING = new Set(['new_lead', 'quote_scheduled'])
const STOP_STATUSES = new Set(['new_lead', 'quote_scheduled', 'quote_sent'])

// ── date / time helpers ──────────────────────────────────────────────────────
function fromYMD(s) { return new Date(s + 'T00:00:00') }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function weekMonday(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day))
  return x
}
function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
function addMinutes(t, mins) {
  const [h, m] = (t || '08:00:00').split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}
function nowHHMMSS() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}
const mapsLink = (addr) => 'https://maps.apple.com/?daddr=' + encodeURIComponent(`${addr ?? ''}, New Zealand`)
const shortDay = (date) => fromYMD(date).toLocaleDateString('en-NZ', { weekday: 'short' })
const dayNum = (date) => fromYMD(date).getDate()

// Has the visit time passed? (Un-timed stops count once their day has arrived.)
function visitPassed(date, startTime, today) {
  if (date < today) return true
  if (date > today) return false
  return !startTime || startTime <= nowHHMMSS()
}

function stopNote(job) {
  const raw = job.directions || job.notes || null
  if (!raw) return null
  const one = String(raw).replace(/\s+/g, ' ').trim()
  return one.length > 70 ? one.slice(0, 68) + '…' : one
}

// ── page ─────────────────────────────────────────────────────────────────────
export default function QuoteRuns() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { jobs, loading: jobsLoading, fetchJobs, updateJobStatus } = useJobs()

  const today = ymd(new Date())
  const [weekStart, setWeekStart] = useState(() => weekMonday(new Date()))
  const weekStartYMD = ymd(weekStart)
  const weekEndYMD = ymd(addDays(weekStart, 6))

  const [scheduleRows, setScheduleRows] = useState([])
  const [runs, setRuns] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [booking, setBooking] = useState(null)      // { job, date, time }
  const [activeDrag, setActiveDrag] = useState(null) // job being dragged
  const [meetingOverrides, setMeetingOverrides] = useState({})
  const [selectedJobId, setSelectedJobId] = useState(() => new URLSearchParams(window.location.search).get('job'))
  const [mobileDay, setMobileDay] = useState(null)
  const toastTimer = useRef(null)

  const showToast = useCallback((msg, err = false) => {
    setToast({ msg, err })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // Jobs with a meeting-status override applied (saved optimistically).
  const jobsById = useMemo(() => {
    const m = new Map()
    for (const j of jobs) m.set(j.id, meetingOverrides[j.id] ? { ...j, meeting_status: meetingOverrides[j.id] } : j)
    return m
  }, [jobs, meetingOverrides])

  const quotingIds = useMemo(() => jobs.filter(j => QUOTING.has(j.status)).map(j => j.id), [jobs])
  const quotingKey = quotingIds.join(',')

  // Load the week's josh-lane visits, every visit for a job still in quoting
  // (so the tray knows what is already booked), and the week's quote runs.
  // The demo mock ignores filters, so everything is re-filtered client-side.
  const load = useCallback(async () => {
    setLoading(true)
    const ids = quotingKey ? quotingKey.split(',') : []
    try {
      const [wk, mine, rr] = await Promise.all([
        supabase.from('schedule').select('*').eq('resource_id', QUOTE_RESOURCE).gte('date', weekStartYMD).lte('date', weekEndYMD),
        ids.length ? supabase.from('schedule').select('*').in('job_id', ids) : Promise.resolve({ data: [] }),
        supabase.from('quote_runs').select('*').gte('run_date', weekStartYMD).lte('run_date', weekEndYMD),
      ])
      const seen = new Map()
      for (const r of [...(wk.data ?? []), ...(mine.data ?? [])]) if (r?.id != null && !seen.has(r.id)) seen.set(r.id, r)
      setScheduleRows([...seen.values()])
      setRuns((rr.data ?? []).filter(r => r?.run_date >= weekStartYMD && r.run_date <= weekEndYMD))
    } catch (e) {
      console.error('Quote runs failed to load:', e)
      setScheduleRows([])
      setRuns([])
    } finally {
      setLoading(false)
    }
  }, [weekStartYMD, weekEndYMD, quotingKey])
  useEffect(() => { load() }, [load])

  // ── derived data ───────────────────────────────────────────────────────────
  const stopFor = useCallback((row, job) => ({
    key: row?.id ?? `run-${job.id}`,
    row, job,
    date: row?.date,
    start: row?.start_time ?? null,
    end: row?.end_time ?? null,
  }), [])

  const days = useMemo(() => {
    const out = []
    for (let i = 0; i < 6; i++) {
      const d = addDays(weekStart, i)
      const date = ymd(d)
      const run = runs.find(r => r.run_date === date) ?? null
      const timed = scheduleRows
        .filter(r => r.date === date && (r.resource_id ?? 'unassigned') === QUOTE_RESOURCE)
        .map(r => ({ r, job: jobsById.get(r.job_id) }))
        .filter(x => x.job && STOP_STATUSES.has(x.job.status))
        .sort((a, b) => (a.r.start_time ?? '99') < (b.r.start_time ?? '99') ? -1 : 1)
        .map(x => stopFor(x.r, x.job))
      const have = new Set(timed.map(s => s.job.id))
      const fromRun = (run?.job_ids ?? [])
        .map(id => jobsById.get(id))
        .filter(j => j && STOP_STATUSES.has(j.status) && !have.has(j.id))
        .map(j => ({ ...stopFor(null, j), date }))
      const stops = [...timed, ...fromRun]
      const weekday = d.getDay()
      out.push({
        date, weekday, run, stops,
        isRunDay: RUN_WEEKDAYS.includes(weekday) || !!run,
        isToday: date === today,
      })
    }
    // Saturday only when something is on it.
    return out.filter(d => d.weekday !== 6 || d.stops.length > 0)
  }, [weekStart, runs, scheduleRows, jobsById, stopFor, today])

  // Every visit (any date, any lane) per job, for the tray.
  const visitsByJob = useMemo(() => {
    const m = new Map()
    for (const r of scheduleRows) {
      if (!m.has(r.job_id)) m.set(r.job_id, [])
      m.get(r.job_id).push(r)
    }
    for (const run of runs) for (const id of run.job_ids ?? []) {
      if (!m.has(id)) m.set(id, [])
      m.get(id).push({ date: run.run_date, start_time: null, fromRun: true })
    }
    return m
  }, [scheduleRows, runs])

  const trayLeads = useMemo(() => jobs
    .filter(j => j.status === 'new_lead' && !(visitsByJob.get(j.id)?.length))
    .map(j => jobsById.get(j.id))
    .sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0)), [jobs, jobsById, visitsByJob])

  const quotesToWrite = useMemo(() => jobs
    .filter(j => j.status === 'quote_scheduled')
    .map(j => {
      const visits = visitsByJob.get(j.id) ?? []
      const last = visits.length
        ? visits.reduce((a, b) => (`${a.date} ${a.start_time ?? ''}` > `${b.date} ${b.start_time ?? ''}` ? a : b))
        : null
      return { job: jobsById.get(j.id), last }
    })
    .filter(({ last }) => !last || visitPassed(last.date, last.start_time, today)), [jobs, jobsById, visitsByJob, today])

  const weekVisits = days.reduce((n, d) => n + d.stops.length, 0)
  const isThisWeek = weekStartYMD === ymd(weekMonday(new Date()))

  // Phone: the day in view — today when it's in this week, else the first run day.
  const activeMobileDay = mobileDay && days.some(d => d.date === mobileDay)
    ? mobileDay
    : (days.find(d => d.isToday) ?? days.find(d => d.isRunDay) ?? days[0])?.date

  // ── actions ────────────────────────────────────────────────────────────────
  function writeQuote(job) {
    const q = primaryQuote(job)
    navigate(q ? `/quotes/${q.id}` : `/quotes/new?job=${job.id}`)
  }

  // Next free slot on a day: after the last timed stop, else 8:00.
  function nextSlot(date) {
    const day = days.find(d => d.date === date)
    const ends = (day?.stops ?? []).map(s => s.end ?? (s.start ? addMinutes(s.start, VISIT_MINUTES) : null)).filter(Boolean).sort()
    return ends.length ? addMinutes(ends[ends.length - 1], TRAVEL_MINUTES) : '08:00:00'
  }

  async function bookVisit(job, date, start) {
    if (!job || !date) return
    const startTime = start || nextSlot(date)
    const row = {
      job_id: job.id, date, start_time: startTime, end_time: addMinutes(startTime, VISIT_MINUTES),
      resource_id: QUOTE_RESOURCE, status: 'quote_scheduled',
    }
    const { error } = await supabase.from('schedule').insert(row)
    if (error) { showToast(error.message, true); return }
    // Mirror the calendar drop: a lead becomes Visit booked; anything else keeps its status.
    if (job.status === 'new_lead') await updateJobStatus(job.id, 'quote_scheduled')
    // Keep an existing run for that day in step with the booking.
    const run = runs.find(r => r.run_date === date)
    if (run && !(run.job_ids ?? []).includes(job.id) && !IS_PURE_DEMO) {
      await supabase.from('quote_runs').update({ job_ids: [...(run.job_ids ?? []), job.id] }).eq('id', run.id)
    }
    setBooking(null)
    setSelectedJobId(null)
    showToast(`Visit booked · ${niceDate(date)} · ${fmtTime(startTime)}`)
    if (IS_PURE_DEMO) {
      setScheduleRows(prev => [...prev, { ...row, id: `local-${Date.now()}` }])
    } else {
      await Promise.all([load(), fetchJobs()])
    }
  }

  async function setMeeting(job, value) {
    setMeetingOverrides(prev => ({ ...prev, [job.id]: value }))
    const { error } = await supabase.from('jobs').update({ meeting_status: value }).eq('id', job.id)
    if (error) showToast(error.message, true)
  }

  // Nearest-neighbour order from the depot, then re-time the stops in sequence.
  async function reorderByDistance(day) {
    const stops = day.stops
    if (stops.length < 2) return
    const placed = stops.filter(s => s.job.lat != null && s.job.lng != null)
    const unplaced = stops.filter(s => !(s.job.lat != null && s.job.lng != null))
    if (placed.length < 2) { showToast('Stops need addresses on the map to reorder'); return }
    const ordered = [...orderRoute(placed.map(s => ({ ...s, lat: s.job.lat, lng: s.job.lng }))), ...unplaced]
    let t = stops.find(s => s.start)?.start ?? '08:00:00'
    const updates = []
    for (const s of ordered) {
      const start = t, end = addMinutes(t, VISIT_MINUTES)
      if (s.row) updates.push({ id: s.row.id, start_time: start, end_time: end })
      t = addMinutes(end, TRAVEL_MINUTES)
    }
    setScheduleRows(prev => prev.map(r => {
      const u = updates.find(x => x.id === r.id)
      return u ? { ...r, start_time: u.start_time, end_time: u.end_time } : r
    }))
    if (!IS_PURE_DEMO) {
      await Promise.all(updates.map(u => supabase.from('schedule').update({ start_time: u.start_time, end_time: u.end_time }).eq('id', u.id)))
      if (day.run) await supabase.from('quote_runs').update({ job_ids: ordered.map(s => s.job.id) }).eq('id', day.run.id)
    }
    const km = routeDistanceKm(ordered.filter(s => s.job.lat != null).map(s => ({ lat: s.job.lat, lng: s.job.lng })))
    showToast(`Reordered by distance · ${km.toFixed(0)} km round trip`)
  }

  async function textRun(day) {
    if (!day.stops.length) return
    const { message } = await textClientsHeadsUp(day.stops.map(s => s.job), day.date)
    showToast(message)
  }

  // ── drag & drop (tray card → day column) ───────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )
  function onDragEnd({ active, over }) {
    setActiveDrag(null)
    const job = active?.data?.current?.job
    if (!job || !over || !String(over.id).startsWith('day-')) return
    bookVisit(job, String(over.id).slice(4), null)
  }

  const weekLabel = weekStart.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' })

  // ── phone layout ───────────────────────────────────────────────────────────
  if (isMobile) {
    const day = days.find(d => d.date === activeMobileDay) ?? null
    const pending = day ? day.stops.filter(s => s.job.status !== 'quote_sent') : []
    const done = day ? day.stops.filter(s => s.job.status === 'quote_sent') : []
    const next = pending[0] ?? null
    const rest = pending.slice(1)
    return (
      <div style={{ ...s.page, flexDirection: 'column' }}>
        <div style={s.mHeader}>
          <div style={s.row}>
            <h1 style={s.mTitle}>{day ? `${shortDay(day.date)} run` : 'Quote runs'}</h1>
            <span style={{ flex: 1 }} />
            <button style={s.btn} onClick={() => navigate('/planner')}>Map</button>
          </div>
          <div style={{ ...s.row, gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            <button style={s.iconBtn} aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronIcon dir="left" /></button>
            {days.map(d => (
              <button key={d.date} onClick={() => setMobileDay(d.date)} aria-pressed={d.date === activeMobileDay}
                style={{ ...s.chip, ...(d.date === activeMobileDay ? s.chipOn : {}), ...(d.isRunDay && d.date !== activeMobileDay ? { borderColor: VISIT_COLOR, color: VISIT_COLOR } : {}) }}>
                {shortDay(d.date)} {dayNum(d.date)}{d.stops.length ? ` · ${d.stops.length}` : ''}
              </button>
            ))}
            <button style={s.iconBtn} aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronIcon dir="right" /></button>
          </div>
          {!isThisWeek && <div style={s.faint}>Week of {weekLabel} · <button style={s.linkBtn} onClick={() => setWeekStart(weekMonday(new Date()))}>Today</button></div>}
        </div>

        <div style={s.mBody}>
          {loading || jobsLoading ? <div style={s.empty}>Loading…</div> : (
            <>
              {day && day.stops.length === 0 && (
                <div style={s.dashed}>{day.isRunDay ? 'No visits booked yet' : 'No visits this day'}</div>
              )}
              {next && (
                <div style={s.nextCard}>
                  <div style={s.row}>
                    <span style={{ ...s.pill, background: 'var(--terra-wash)', color: 'var(--terra)' }}>Next{next.start ? ` · ${fmtTime(next.start)}` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <CategoryTag job={next.job} />
                  </div>
                  <div>
                    <div style={{ ...s.ttl, fontSize: 17 }}>{displayCase(jobHeading(next.job).primary)}</div>
                    <div style={{ ...s.sub, whiteSpace: 'normal' }}>{stopSubtitle(next.job)}</div>
                    <div style={{ ...s.row, marginTop: 6, gap: 4, flexWrap: 'wrap' }}>
                      <MeetingChip job={next.job} onChange={setMeeting} />
                      <KpiPill job={next.job} />
                    </div>
                  </div>
                  <div style={{ ...s.row, gap: 8 }}>
                    {next.job.clients?.phone
                      ? <a style={{ ...s.btnLg, flex: 1 }} href={telHref(next.job.clients.phone)}>Call</a>
                      : <span style={{ ...s.btnLg, flex: 1, opacity: 0.5 }}>Call</span>}
                    <a style={{ ...s.btnLg, flex: 1 }} href={mapsLink(next.job.address)} target="_blank" rel="noreferrer">Navigate</a>
                    <button style={{ ...s.btnLg, ...s.btnPrimary, flex: 1.3 }} onClick={() => writeQuote(next.job)}>Start quote</button>
                  </div>
                </div>
              )}
              {rest.map(stop => (
                <StopCard key={stop.key} stop={stop} today={today} compact onWrite={writeQuote} onMeeting={setMeeting} />
              ))}
              {done.length > 0 && <div style={{ ...s.eyebrow, color: SENT_COLOR, marginTop: 6 }}>Quote written · {done.length}</div>}
              {done.map(stop => (
                <StopCard key={stop.key} stop={stop} today={today} compact onWrite={writeQuote} onMeeting={setMeeting} />
              ))}

              <div style={{ ...s.eyebrow, color: LEAD_COLOR, marginTop: 14 }}>Visits to book · {trayLeads.length}</div>
              {trayLeads.length === 0 && <div style={s.dashed}>No leads waiting for a run</div>}
              {trayLeads.map(job => (
                <TrayCard key={job.id} job={job} selected={job.id === selectedJobId} draggable={false}
                  onBook={() => setBooking({ job, date: defaultRunDate(), time: null })} />
              ))}
              <div style={{ ...s.eyebrow, color: SENT_COLOR, marginTop: 14 }}>Quotes to write · {quotesToWrite.length}</div>
              {quotesToWrite.length === 0 && <div style={s.dashed}>Nothing waiting to be written</div>}
              {quotesToWrite.map(({ job, last }) => (
                <ToWriteCard key={job.id} job={job} last={last} onWrite={writeQuote} />
              ))}
            </>
          )}
        </div>

        {booking && <BookingSheet booking={booking} onChange={setBooking} onClose={() => setBooking(null)}
          onBook={() => bookVisit(booking.job, booking.date, booking.time || nextSlot(booking.date))} />}
        {toast && <div style={{ ...s.toast, ...(toast.err ? s.toastErr : {}) }}>{toast.msg}</div>}
      </div>
    )
  }

  // ── desktop layout ─────────────────────────────────────────────────────────
  const columns = days.map(d => (d.isRunDay ? 'minmax(220px, 1fr)' : 'minmax(104px, 124px)')).join(' ')
  return (
    <DndContext sensors={sensors} onDragStart={e => setActiveDrag(e.active?.data?.current?.job ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActiveDrag(null)}>
      <div style={s.page}>
        <div style={s.main}>
          <div style={s.topbar}>
            <button style={s.btn} onClick={() => setWeekStart(weekMonday(new Date()))}>Today</button>
            <button style={s.iconBtn} aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronIcon dir="left" /></button>
            <button style={s.iconBtn} aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronIcon dir="right" /></button>
            <h1 style={s.h2}>Week of {weekLabel}</h1>
            <span style={{ flex: 1 }} />
            <span style={{ ...s.chip, ...s.chipOn }} aria-current="true">Runs</span>
            <button style={s.chip} onClick={() => navigate('/planner')}>Map</button>
          </div>

          <div style={{ ...s.grid, gridTemplateColumns: columns }}>
            {days.map(day => (
              <DayColumn key={day.date} day={day} today={today}
                onWrite={writeQuote} onMeeting={setMeeting}
                onReorder={() => reorderByDistance(day)} onText={() => textRun(day)} />
            ))}
          </div>

          <div style={s.footer}>
            <span><b style={{ color: 'var(--ink)' }}>{weekVisits}</b> visit{weekVisits === 1 ? '' : 's'} this week · <b style={{ color: 'var(--ink)' }}>{quotesToWrite.length}</b> quote{quotesToWrite.length === 1 ? '' : 's'} still to write</span>
            <span style={{ flex: 1 }} />
            <span style={s.faint}>Drag from the tray to book · a visit auto-moves the job to Visit booked</span>
          </div>
        </div>

        <aside style={s.rail}>
          <div style={s.railHead}>
            <div style={s.h2}>Visits to book</div>
            <div style={{ ...s.sub, marginTop: 2 }}>New leads waiting for a run</div>
          </div>
          <div style={s.railBody}>
            {loading || jobsLoading ? <div style={s.faint}>Loading…</div> : (
              <>
                {trayLeads.length === 0 && <div style={s.dashed}>No leads waiting for a run</div>}
                {trayLeads.map(job => (
                  <TrayCard key={job.id} job={job} selected={job.id === selectedJobId} draggable
                    onBook={() => setBooking({ job, date: defaultRunDate(), time: null })} />
                ))}
                <div style={{ ...s.eyebrow, color: SENT_COLOR, padding: '10px 4px 2px' }}>Quotes to write · {quotesToWrite.length}</div>
                {quotesToWrite.length === 0 && <div style={s.dashed}>Nothing waiting to be written</div>}
                {quotesToWrite.map(({ job, last }) => (
                  <ToWriteCard key={job.id} job={job} last={last} onWrite={writeQuote} />
                ))}
              </>
            )}
          </div>
          <div style={s.railNote}>Only leads and visits live here. Truck scheduling is in the full app.</div>
        </aside>

        <DragOverlay dropAnimation={null}>
          {activeDrag ? <div style={{ ...s.card, borderLeft: `4px solid ${LEAD_COLOR}`, boxShadow: '0 12px 28px -10px rgba(40,25,10,.45)', width: 260 }}>
            <div style={s.ttl}>{displayCase(jobHeading(activeDrag).primary)}</div>
            <div style={s.sub}>{stopSubtitle(activeDrag)}</div>
          </div> : null}
        </DragOverlay>

        {booking && <BookingSheet booking={booking} onChange={setBooking} onClose={() => setBooking(null)}
          onBook={() => bookVisit(booking.job, booking.date, booking.time || nextSlot(booking.date))} />}
        {toast && <div style={{ ...s.toast, ...(toast.err ? s.toastErr : {}) }}>{toast.msg}</div>}
      </div>
    </DndContext>
  )
}

// ── pieces ───────────────────────────────────────────────────────────────────
function stopSubtitle(job) {
  const { secondary } = jobHeading(job)
  const portal = jobCategory(job) !== 'residential'
  const parts = portal
    ? [job.ko_reference ? `KO ${job.ko_reference}` : null, koCode(job), secondary ? displayCase(secondary) : null, job.job_type, stopNote(job)]
    : [secondary ? displayCase(secondary) : null, job.job_type, stopNote(job)]
  return parts.filter(Boolean).join(' · ')
}

function CategoryTag({ job }) {
  const key = jobCategory(job)
  if (key === 'residential') return null
  const meta = JOB_CATEGORIES[key]
  return <span style={{ ...s.catTag, background: meta.color }}>{meta.label}</span>
}

function KpiPill({ job }) {
  if (jobCategory(job) === 'residential') return null
  const kpi = kpiCountdown(job)
  if (!kpi) return null
  return (
    <span style={{ ...s.pill, background: kpi.expired ? '#FFF0EE' : '#FDF3E3', color: kpi.expired ? '#C0392B' : '#D4851A' }}>
      <ClockIcon /> {kpi.text}
    </span>
  )
}

// Meeting / not meeting — tap to cycle; saved to jobs.meeting_status.
function MeetingChip({ job, onChange }) {
  const v = job.meeting_status
  const next = v === 'meeting' ? 'not_meeting' : 'meeting'
  const label = v === 'meeting' ? 'Meeting' : v === 'not_meeting' ? 'Not meeting' : 'Meeting?'
  return (
    <button type="button" onClick={e => { e.stopPropagation(); onChange(job, next) }}
      aria-label={`Meeting status: ${label}. Tap to change`}
      style={{ ...s.miniChip, ...(v ? {} : { borderStyle: 'dashed' }), color: v === 'not_meeting' ? 'var(--ink-3)' : 'var(--ink-2)' }}>
      {label}
    </button>
  )
}

function PhoneChip({ job }) {
  const phone = job.clients?.phone
  if (!phone) return null
  return <a href={telHref(phone)} style={{ ...s.miniChip, textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{phone}</a>
}

function StopCard({ stop, today, compact = false, onWrite, onMeeting }) {
  const { job } = stop
  const cat = jobCategory(job)
  const edge = cat === 'residential' ? VISIT_COLOR : JOB_CATEGORIES[cat].color
  const done = job.status === 'quote_sent'
  const canWrite = !done && visitPassed(stop.date, stop.start, today)
  const time = fmtTime(stop.start)
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${edge}`, opacity: done ? 0.75 : 1 }}>
      <div style={{ ...s.row, gap: 6 }}>
        <span style={{ ...s.time, ...(time ? {} : { color: 'var(--ink-3)', fontWeight: 600 }) }}>{time ?? 'TBC'}</span>
        <CategoryTag job={job} />
        <span style={{ ...s.ttl, ...(compact ? { fontSize: 15 } : {}) }}>{displayCase(jobHeading(job).primary)}</span>
      </div>
      <div style={{ ...s.sub, marginTop: 1 }}>{stopSubtitle(job)}</div>
      <div style={{ ...s.row, marginTop: 6, gap: 4, flexWrap: 'wrap' }}>
        <MeetingChip job={job} onChange={onMeeting} />
        <PhoneChip job={job} />
        <KpiPill job={job} />
        <span style={{ flex: 1 }} />
        {done ? <span style={{ ...s.pill, background: SENT_COLOR + '1F', color: SENT_COLOR }}>Quote sent</span>
          : canWrite ? <button style={s.btnSm} onClick={() => onWrite(job)}>Write quote</button>
          : null}
      </div>
    </div>
  )
}

function DayColumn({ day, today, onWrite, onMeeting, onReorder, onText }) {
  const { isOver, setNodeRef } = useDroppable({ id: `day-${day.date}` })
  const label = `${shortDay(day.date)} ${dayNum(day.date)}`
  const times = day.stops.map(s => s.start).filter(Boolean)
  const ends = day.stops.map(s => s.end ?? (s.start ? addMinutes(s.start, VISIT_MINUTES) : null)).filter(Boolean)
  const span = times.length ? `${fmtTime(times[0])} – ${fmtTime(ends.sort().at(-1))}` : null
  const dropZone = (
    <div style={{ ...s.dropZone, ...(isOver ? s.dropZoneOver : {}) }}>
      {isOver ? 'Release to book the visit' : day.isRunDay ? 'Drop a visit here' : 'Drop a visit here for an off-run day'}
    </div>
  )
  if (!day.isRunDay) {
    return (
      <div ref={setNodeRef} style={{ ...s.col, ...(isOver ? s.colOver : {}) }}>
        <div style={{ ...s.gh, ...(day.isToday ? { color: 'var(--terra)' } : {}) }}>{label}</div>
        {day.stops.length === 0 && !isOver && <div style={s.dashed}>Trucks only · no visits</div>}
        {day.stops.map(stop => (
          <div key={stop.key} style={{ ...s.card, borderLeft: `4px solid ${jobCategory(stop.job) === 'residential' ? VISIT_COLOR : JOB_CATEGORIES[jobCategory(stop.job)].color}` }}>
            <div style={{ ...s.row, gap: 6 }}><CategoryTag job={stop.job} /><span style={s.ttl}>{displayCase(jobHeading(stop.job).primary)}</span></div>
            <div style={s.sub}>{stopSubtitle(stop.job)}</div>
            <div style={{ ...s.row, marginTop: 4, gap: 6 }}>
              <span style={s.faint}>{fmtTime(stop.start) ?? 'time TBC'}</span>
              <span style={{ flex: 1 }} />
              {stop.job.status !== 'quote_sent' && visitPassed(stop.date, stop.start, today) && <button style={s.btnSm} onClick={() => onWrite(stop.job)}>Write quote</button>}
            </div>
          </div>
        ))}
        {isOver && dropZone}
      </div>
    )
  }
  return (
    <div ref={setNodeRef} style={{ ...s.col, ...s.runCol, ...(isOver ? s.colOver : {}) }}>
      <div style={{ ...s.row, padding: '2px 4px 6px', flexWrap: 'wrap' }}>
        <span style={{ ...s.pill, background: VISIT_COLOR + '1F', color: VISIT_COLOR }}><i style={s.dot} />{label} · quote run{day.run?.window ? ` · ${day.run.window}` : ''}</span>
        <span style={s.faint}>{day.stops.length} stop{day.stops.length === 1 ? '' : 's'}{span ? ` · ${span}` : ''}</span>
        <span style={{ flex: 1 }} />
        <button style={s.miniChip} disabled={day.stops.length < 2} onClick={onReorder}>Reorder by distance</button>
        <button style={s.miniChip} disabled={day.stops.length === 0} onClick={onText}>Text clients</button>
      </div>
      {day.stops.map(stop => (
        <StopCard key={stop.key} stop={stop} today={today} onWrite={onWrite} onMeeting={onMeeting} />
      ))}
      {dropZone}
    </div>
  )
}

function TrayCard({ job, selected, draggable, onBook }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `job-${job.id}`, data: { job }, disabled: !draggable })
  const ref = useRef(null)
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [selected])
  return (
    <div ref={el => { setNodeRef(el); ref.current = el }} {...attributes} {...(draggable ? listeners : {})}
      style={{ ...s.card, borderLeft: `4px solid ${jobCategory(job) === 'residential' ? LEAD_COLOR : JOB_CATEGORIES[jobCategory(job)].color}`,
        ...(selected ? { boxShadow: '0 0 0 2px var(--terra)' } : {}), ...(isDragging ? { opacity: 0.4 } : {}),
        cursor: draggable ? 'grab' : 'default', touchAction: draggable ? 'none' : 'auto' }}>
      <div style={{ ...s.row, gap: 6 }}><CategoryTag job={job} /><span style={s.ttl}>{displayCase(jobHeading(job).primary)}</span></div>
      <div style={s.sub}>{stopSubtitle(job)}</div>
      <div style={{ ...s.row, marginTop: 6, gap: 6, flexWrap: 'wrap' }}>
        <KpiPill job={job} />
        <PhoneChip job={job} />
        <span style={{ flex: 1 }} />
        <button style={s.btnSm} onClick={e => { e.stopPropagation(); onBook() }} onPointerDown={e => e.stopPropagation()}>Book visit…</button>
      </div>
    </div>
  )
}

function ToWriteCard({ job, last, onWrite }) {
  const q = primaryQuote(job)
  return (
    <div style={{ ...s.card, borderLeft: `4px solid ${jobCategory(job) === 'residential' ? VISIT_COLOR : JOB_CATEGORIES[jobCategory(job)].color}` }}>
      <div style={{ ...s.row, gap: 6 }}>
        <CategoryTag job={job} />
        <span style={{ ...s.ttl, flex: 1 }}>{displayCase(jobHeading(job).primary)}</span>
        <span style={s.faint}>{last ? `visited ${shortDay(last.date)}` : 'visit date unknown'}</span>
      </div>
      <div style={s.sub}>{stopSubtitle(job)}</div>
      <div style={{ ...s.row, marginTop: 6, gap: 6 }}>
        <KpiPill job={job} />
        <span style={{ flex: 1 }} />
        <button style={{ ...s.btnSm, ...s.btnPrimary }} onClick={() => onWrite(job)}>{q ? 'Finish quote' : 'Write quote'}</button>
      </div>
    </div>
  )
}

// The non-drag booking path: pick a date and time.
function BookingSheet({ booking, onChange, onClose, onBook }) {
  const { job, date, time } = booking
  return (
    <>
      <div style={s.backdrop} onClick={onClose} />
      <div style={s.sheet} role="dialog" aria-modal="true" aria-label="Book a quote visit">
        <div style={s.h2}>Book visit</div>
        <div style={{ ...s.sub, whiteSpace: 'normal', marginTop: 2 }}>{displayCase(jobHeading(job).primary)} · {stopSubtitle(job)}</div>
        <label style={s.field}><span style={s.fieldLabel}>Date</span>
          <input type="date" value={date} onChange={e => onChange({ ...booking, date: e.target.value })} style={s.input} /></label>
        <label style={s.field}><span style={s.fieldLabel}>Time</span>
          <input type="time" value={(time ?? '').slice(0, 5)} onChange={e => onChange({ ...booking, time: e.target.value ? e.target.value + ':00' : null })} style={s.input} />
          <span style={s.faint}>{time ? '' : 'Leave blank for the next free slot'}</span></label>
        <div style={{ ...s.row, gap: 8, marginTop: 4 }}>
          <button style={{ ...s.btnLg, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...s.btnLg, ...s.btnPrimary, flex: 1 }} disabled={!date} onClick={onBook}>Book visit</button>
        </div>
      </div>
    </>
  )
}

function ChevronIcon({ dir }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left' ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  )
}

// ── styles ───────────────────────────────────────────────────────────────────
const btnBase = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  borderRadius: 'var(--radius-ctrl)', fontWeight: 700, fontSize: 13,
  border: '1px solid var(--line)', background: '#fff', color: 'var(--ink)',
  whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'var(--font)', textDecoration: 'none',
}
const s = {
  page: { display: 'flex', height: '100%', background: 'var(--cream)', minHeight: 0 },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  topbar: {
    height: 56, display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px',
    borderBottom: '1px solid var(--line)', flexShrink: 0, background: 'rgba(252,245,236,.9)',
  },
  h2: { fontSize: 17, fontWeight: 750, lineHeight: 1.2, color: 'var(--ink)' },
  grid: { display: 'grid', gap: 10, padding: '16px 18px', flex: 1, minHeight: 0, overflow: 'auto', alignItems: 'start' },
  col: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 200, borderRadius: 16, padding: 4 },
  runCol: { background: '#fff', border: '1px solid var(--line)', padding: 10 },
  colOver: { outline: '2px dashed var(--terra)', outlineOffset: -2, background: 'var(--terra-wash)' },
  gh: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '4px 2px' },
  footer: { display: 'flex', alignItems: 'center', gap: 18, padding: '0 18px 14px', fontSize: 12, color: 'var(--ink-2)', flexShrink: 0 },
  rail: { width: 300, flexShrink: 0, borderLeft: '1px solid var(--line)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  railHead: { padding: '16px 16px 10px', borderBottom: '1px solid var(--line)' },
  railBody: { padding: 12, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 },
  railNote: { marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 },

  row: { display: 'flex', alignItems: 'center', gap: 8 },
  faint: { fontSize: 11, color: 'var(--ink-3)' },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink-3)', padding: '4px 4px 2px' },
  ttl: { fontWeight: 700, fontSize: 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sub: { fontSize: 12, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  card: { background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '10px 12px' },
  time: { fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', flexShrink: 0, minWidth: 40 },
  dashed: { border: '1.5px dashed var(--line)', borderRadius: 14, padding: 12, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11, fontWeight: 600 },
  dropZone: { border: '1.5px dashed var(--line)', borderRadius: 12, padding: 10, textAlign: 'center', color: 'var(--ink-3)', fontSize: 11, fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dropZoneOver: { borderColor: 'var(--terra)', background: 'var(--terra-wash)', color: 'var(--terra)' },
  pill: { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' },
  catTag: { display: 'inline-flex', alignItems: 'center', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.3, whiteSpace: 'nowrap', flexShrink: 0 },
  chip: { ...btnBase, borderRadius: 999, minHeight: 32, padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' },
  chipOn: { background: 'var(--ink)', borderColor: 'var(--ink)', color: '#fff' },
  miniChip: { ...btnBase, borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 600, color: 'var(--ink-2)', minHeight: 26 },
  btn: { ...btnBase, height: 34, padding: '0 14px' },
  iconBtn: { ...btnBase, width: 34, height: 34, padding: 0, flexShrink: 0 },
  btnSm: { ...btnBase, height: 30, padding: '0 10px', fontSize: 12 },
  btnLg: { ...btnBase, height: 44, padding: '0 16px', fontSize: 15 },
  btnPrimary: { background: 'var(--terra)', borderColor: 'var(--terra)', color: '#fff' },
  linkBtn: { background: 'none', border: 'none', color: 'var(--terra)', fontWeight: 700, fontSize: 11, padding: 0, cursor: 'pointer', fontFamily: 'var(--font)' },
  empty: { textAlign: 'center', color: 'var(--ink-3)', padding: '40px 0', fontSize: 14 },

  // phone
  mHeader: { padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  mTitle: { fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)', lineHeight: 1.15 },
  mBody: { padding: '4px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 },
  nextCard: { background: '#fff', border: '2px solid var(--terra)', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },

  // booking sheet
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 300 },
  sheet: {
    position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px, calc(100vw - 32px))',
    background: '#fff', border: '1px solid var(--line)', borderRadius: 18, padding: 18, zIndex: 301,
    display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 20px 50px -20px rgba(40,25,10,.5)',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' },
  input: { height: 44, padding: '0 12px', borderRadius: 'var(--radius-ctrl)', border: '1px solid var(--line)', fontSize: 15, fontFamily: 'var(--font)', color: 'var(--ink)', background: '#fff', outline: 'none' },

  toast: {
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
    background: 'var(--ink)', color: '#fff', padding: '11px 20px', borderRadius: 24,
    fontSize: 13, fontWeight: 500, boxShadow: '0 6px 24px rgba(0,0,0,.25)', zIndex: 1000, maxWidth: '90vw', textAlign: 'center',
  },
  toastErr: { background: '#C0392B' },
}
