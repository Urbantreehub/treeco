import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import FullCalendar from '@fullcalendar/react'
import resourceTimelinePlugin from '@fullcalendar/resource-timeline'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../config/supabase'
import CartrackMap from '../components/CartrackMap'

// ── Resources ──────────────────────────────────────────────────────────────
const RESOURCES = [
  { id: 'josh',       title: 'Josh Micallef', index: 0 },
  { id: 'isuzu',      title: 'Isuzu',         index: 1 },
  { id: 'nissan',     title: 'Nissan',         index: 2 },
  { id: 'stump',      title: 'Stump Grinder',  index: 3 },
  { id: 'unassigned', title: 'Unassigned',     index: 4 },
]

const RESOURCE_COLOR = {
  josh:       '#4A6741',
  isuzu:      '#4A7FA5',
  nissan:     '#6B5EA8',
  stump:      '#8B4513',
  unassigned: '#C8C2BC',
}

const JOB_TYPE_COLOR = {
  removal:  '#C0392B',
  pruning:  '#4A6741',
  grinding: '#8B4513',
  planting: '#2E7D52',
  consult:  '#4A7FA5',
}

function jobColor(job) {
  const t = (job?.job_type ?? '').toLowerCase()
  for (const [key, color] of Object.entries(JOB_TYPE_COLOR)) {
    if (t.includes(key)) return color
  }
  return '#4A7FA5'
}

// Get Monday of a week containing `date`
function weekMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toYMD(date) {
  return date.toISOString().slice(0, 10)
}

// ── Filter panel ──────────────────────────────────────────────────────────
function SortableResourceRow({ resource, visible, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: resource.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    ...fp.row,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: RESOURCE_COLOR[resource.id], flexShrink: 0 }} />
      <span style={fp.name}>{resource.title}</span>
      <button
        style={{ ...fp.toggle, background: visible ? '#4A6741' : '#E2DDD6', color: visible ? '#fff' : '#999' }}
        onClick={() => onToggle(resource.id)}
      >
        {visible ? 'On' : 'Off'}
      </button>
    </div>
  )
}

function FilterPanel({ resources, visibleIds, onToggle, onReorder, onClose }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(e) {
    const { active, over } = e
    if (active.id !== over?.id) {
      const oldIdx = resources.findIndex(r => r.id === active.id)
      const newIdx = resources.findIndex(r => r.id === over.id)
      onReorder(arrayMove(resources, oldIdx, newIdx))
    }
  }

  return (
    <div style={fp.scrim} onClick={onClose}>
      <div style={fp.panel} onClick={e => e.stopPropagation()}>
        <div style={fp.header}>
          <span style={fp.title}>Staff &amp; Vehicles</span>
          <span style={fp.hint}>Drag to reorder</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={resources.map(r => r.id)} strategy={verticalListSortingStrategy}>
            {resources.map(r => (
              <SortableResourceRow
                key={r.id}
                resource={r}
                visible={visibleIds.has(r.id)}
                onToggle={onToggle}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}

// ── Custom Week Grid ───────────────────────────────────────────────────────
function SortableWeekRow({ res, ri, days, today, events, onEventClick, cols }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: res.id })
  return (
    <div
      ref={setNodeRef}
      style={{
        ...wg.row,
        gridTemplateColumns: cols,
        background: ri % 2 === 0 ? '#fff' : '#FAFAF8',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : 'auto',
      }}
    >
      <div style={wg.resourceCell}>
        <span {...attributes} {...listeners} style={wg.grip}>⠿</span>
        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: RESOURCE_COLOR[res.id], flexShrink: 0 }} />
        <span style={wg.resourceName}>{res.title}</span>
      </div>
      {days.map(d => {
        const ymd = toYMD(d)
        const isToday = ymd === today
        const cellEvents = events.filter(e =>
          e.resourceId === res.id && (e.start?.slice(0, 10) === ymd || e.start === ymd)
        )
        return (
          <div key={ymd} style={{ ...wg.cell, ...(isToday ? wg.cellToday : {}) }}>
            {cellEvents.map(ev => (
              <div
                key={ev.id}
                style={{ ...wg.pill, background: ev.color ?? '#4A7FA5' }}
                onClick={() => onEventClick(ev)}
              >
                <span style={wg.pillTitle}>{ev.title}</span>
                {ev.extendedProps?.job?.job_type && (
                  <span style={wg.pillSub}>{ev.extendedProps.job.job_type}</span>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function WeekGrid({ weekStart, events, onEventClick, resources, onReorder }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  const today = toYMD(new Date())
  const cols = `150px repeat(${days.length}, minmax(110px, 1fr))`
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(e) {
    const { active, over } = e
    if (active.id !== over?.id) {
      const from = resources.findIndex(r => r.id === active.id)
      const to   = resources.findIndex(r => r.id === over.id)
      onReorder(arrayMove(resources, from, to))
    }
  }

  return (
    <div style={wg.wrap}>
      <div style={{ ...wg.headerRow, gridTemplateColumns: cols }}>
        <div style={wg.resourceHeader}>Staff / Vehicle</div>
        {days.map(d => {
          const ymd = toYMD(d)
          const isToday = ymd === today
          return (
            <div key={ymd} style={{ ...wg.dayHeader, ...(isToday ? wg.dayHeaderToday : {}) }}>
              <span style={wg.dayName}>{d.toLocaleDateString('en-NZ', { weekday: 'short' })}</span>
              <span style={{ ...wg.dayNum, ...(isToday ? wg.dayNumToday : {}) }}>
                {d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          )
        })}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={resources.map(r => r.id)} strategy={verticalListSortingStrategy}>
          <div style={wg.body}>
            {resources.map((res, ri) => (
              <SortableWeekRow
                key={res.id} res={res} ri={ri}
                days={days} today={today} events={events}
                onEventClick={onEventClick} cols={cols}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Tray card ──────────────────────────────────────────────────────────────
function TrayCard({ job }) {
  const ref = useRef()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const draggable = new Draggable(el, {
      eventData: {
        id:    `tray-${job.id}`,
        title: job.clients?.name ?? job.title ?? 'Job',
        color: jobColor(job),
        extendedProps: { job, fromTray: true },
      },
    })
    return () => draggable.destroy()
  }, [job])

  // SP— jobs from DBS have unhelpful titles — show address as primary label
  const isSP = job.title?.startsWith('SP —') || job.clients?.name?.startsWith('SP —')
  const primaryLabel = isSP
    ? (job.address?.split(',')[0] ?? job.clients?.name ?? job.title ?? '—')
    : (job.clients?.name ?? job.title ?? '—')
  const secondaryLabel = isSP
    ? job.clients?.name?.replace(/^SP — /, '') ?? ''
    : [job.job_type, job.address?.split(',')[0]].filter(Boolean).join(' · ')

  return (
    <div ref={ref} style={tr.card}>
      <div style={{ ...tr.bar, background: jobColor(job) }} />
      <div style={tr.body}>
        <div style={tr.name}>{primaryLabel}</div>
        {secondaryLabel ? <div style={tr.meta}>{secondaryLabel}</div> : null}
      </div>
      <span style={tr.grip}>⠿</span>
    </div>
  )
}

// ── Event popover ──────────────────────────────────────────────────────────
function Popover({ info, weekEvent, onClose, onUnschedule }) {
  let job, rect
  if (info) {
    job = info.event.extendedProps?.job
    const r = info.el.getBoundingClientRect()
    rect = { top: Math.min(r.bottom + 6, window.innerHeight - 240), left: Math.min(r.left, window.innerWidth - 260) }
  } else if (weekEvent) {
    job = weekEvent.extendedProps?.job
    rect = { top: window.innerHeight / 2 - 110, left: window.innerWidth / 2 - 125 }
  }
  if (!job) return null

  return (
    <div style={po.scrim} onClick={onClose}>
      <div style={{ ...po.box, top: rect.top, left: rect.left }} onClick={e => e.stopPropagation()}>
        <div style={{ ...po.stripe, background: jobColor(job) }} />
        <div style={po.title}>{job.clients?.name ?? job.title ?? '—'}</div>
        {job.job_type  && <div style={po.row}><span style={po.icon}>🌲</span>{job.job_type}</div>}
        {job.address   && <div style={po.row}><span style={po.icon}>📍</span>{job.address}</div>}
        {job.clients?.phone && <div style={po.row}><span style={po.icon}>📞</span>{job.clients.phone}</div>}
        <div style={po.btns}>
          <button style={po.backBtn} onClick={() => onUnschedule(job)}>↩ Back to tray</button>
          <button style={po.closeBtn} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
// ── Crew (restricted) calendar view ───────────────────────────────────────
function CrewCalendar() {
  const { profile } = useAuth()
  const resourceId  = profile?.resource_id
  const myResource  = RESOURCES.find(r => r.id === resourceId)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayYMD = toYMD(today)

  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('schedule')
        .select('*, jobs(title, job_type, address, client_id, clients(name))')
        .eq('date', todayYMD)
        .eq('resource_id', resourceId)
        .order('start_time')
      setEvents(data ?? [])
      setLoading(false)
    }
    if (resourceId) load()
    else setLoading(false)
  }, [resourceId])

  const dateLabel = today.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={cw.shell}>
      <div style={cw.header}>
        <div>
          <div style={cw.dayLabel}>Today</div>
          <div style={cw.dateLabel}>{dateLabel}</div>
        </div>
        {myResource && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: RESOURCE_COLOR[resourceId] }} />
            <span style={cw.resourceName}>{myResource.title}</span>
          </div>
        )}
      </div>

      <div style={cw.body}>
        {loading ? (
          <div style={cw.empty}>Loading…</div>
        ) : !resourceId ? (
          <div style={cw.empty}>No resource assigned — ask your manager to set up your account in Settings.</div>
        ) : events.length === 0 ? (
          <div style={cw.empty}>No jobs scheduled for today.</div>
        ) : (
          <div style={cw.jobList}>
            {events.map(ev => {
              const job = ev.jobs
              const color = jobColor(job)
              const start = ev.start_time ? ev.start_time.slice(0, 5) : null
              const end   = ev.end_time   ? ev.end_time.slice(0, 5)   : null
              return (
                <div key={ev.id} style={{ ...cw.jobCard, borderLeft: `4px solid ${color}` }}>
                  <div style={cw.jobTime}>
                    {start && end ? `${start} – ${end}` : start ?? 'Time TBC'}
                  </div>
                  <div style={cw.jobTitle}>{job?.title ?? 'Untitled job'}</div>
                  {job?.clients?.name && <div style={cw.jobClient}>{job.clients.name}</div>}
                  {job?.address && (
                    <a
                      href={`https://maps.apple.com/?q=${encodeURIComponent(job.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={cw.jobAddr}
                    >
                      📍 {job.address}
                    </a>
                  )}
                  {ev.notes && <div style={cw.jobNotes}>{ev.notes}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const cw = {
  shell:  { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0' },
  header: { padding: '20px 24px 16px', background: '#fff', borderBottom: '1px solid #E2DDD6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel:   { fontSize: '11px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' },
  dateLabel:  { fontSize: '20px', fontWeight: '800', color: '#2C2416' },
  resourceName: { fontSize: '13px', fontWeight: '600', color: '#555' },
  body:   { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  empty:  { textAlign: 'center', color: '#bbb', fontSize: '14px', padding: '60px 0' },
  jobList:{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' },
  jobCard:{ background: '#fff', borderRadius: '10px', padding: '16px 16px 16px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  jobTime:  { fontSize: '11px', fontWeight: '700', color: '#aaa', letterSpacing: '0.04em', marginBottom: '4px' },
  jobTitle: { fontSize: '16px', fontWeight: '800', color: '#2C2416', marginBottom: '4px' },
  jobClient:{ fontSize: '13px', color: '#666', marginBottom: '4px' },
  jobAddr:  { display: 'block', fontSize: '13px', color: '#4A7FA5', textDecoration: 'none', marginBottom: '4px' },
  jobNotes: { fontSize: '12px', color: '#888', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F0EDE8', lineHeight: 1.5 },
}

// ── Main export — switches between full and crew views ─────────────────────
export default function Calendar() {
  const { isFullAccess } = useAuth()
  if (!isFullAccess) return <CrewCalendar />
  return <FullCalendar_ />
}

function FullCalendar_() {
  const isMobile = useIsMobile()
  const calRef   = useRef()
  const [unscheduled,       setUnscheduled]       = useState([])
  const [events,            setEvents]            = useState([])
  const [loading,           setLoading]           = useState(true)
  const [popover,           setPopover]           = useState(null)
  const [toast,             setToast]             = useState(null)
  const [trayWidth,         setTrayWidth]         = useState(220)
  const [traySearch,        setTraySearch]        = useState('')
  const [showTracker,       setShowTracker]       = useState(false)
  const trayResizing        = useRef(false)
  const trayResizeStart     = useRef(null)
  const [viewTitle,         setViewTitle]         = useState('')
  const [activeView,        setActiveView]        = useState(isMobile ? 'listWeek' : 'resourceTimelineDay')
  const [weekStart,         setWeekStart]         = useState(() => weekMonday(new Date()))
  const [showFilter,        setShowFilter]        = useState(false)
  const [orderedResources,  setOrderedResources]  = useState(RESOURCES)
  const [visibleIds,        setVisibleIds]        = useState(new Set(RESOURCES.map(r => r.id)))

  const activeResources = orderedResources.filter(r => visibleIds.has(r.id))

  // Keep _fcDrag in sync so Day-view HTML5 drag can call back into state
  const orderedRef = useRef(orderedResources)
  orderedRef.current = orderedResources
  _fcDrag.reorder  = setOrderedResources
  _fcDrag.getList  = () => orderedRef.current

  function toggleVisible(id) {
    setVisibleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { if (next.size > 1) next.delete(id) }
      else next.add(id)
      return next
    })
  }

  function showToast(msg, err) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 3000)
  }

  // Week title derived from weekStart
  const weekTitle = (() => {
    const fri = addDays(weekStart, 4)
    const opts = { day: 'numeric', month: 'short', year: 'numeric' }
    return `${weekStart.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })} – ${fri.toLocaleDateString('en-NZ', opts)}`
  })()

  async function load() {
    setLoading(true)
    const [{ data: jobs }, { data: rows }] = await Promise.all([
      supabase
        .from('jobs')
        .select('id, title, status, job_type, address, clients(name, phone)')
        .in('status', ['accepted_to_schedule', 'scheduled'])
        .order('created_at', { ascending: false }),
      supabase
        .from('schedule')
        .select('*, jobs(id, title, status, job_type, address, clients(name, phone))')
        .order('date'),
    ])

    const scheduledIds = new Set((rows ?? []).map(r => r.job_id))
    setUnscheduled((jobs ?? []).filter(j => !scheduledIds.has(j.id)))

    setEvents((rows ?? []).map(row => {
      const job = row.jobs ?? {}
      const rid = row.resource_id ?? 'unassigned'
      const start = row.start_time ? `${row.date}T${row.start_time}` : row.date
      const end   = row.end_time   ? `${row.date}T${row.end_time}`   : undefined
      return {
        id: row.id,
        title: job.clients?.name ?? job.title ?? 'Job',
        start, end,
        allDay: !row.start_time,
        color: jobColor(job),
        resourceId: rid,
        extendedProps: { job, scheduleId: row.id, resourceId: rid },
      }
    }))

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDatesSet = (arg) => setViewTitle(arg.view.title)

  const handleDrop = useCallback(async (info) => {
    const job = info.draggedEl._fcDraggable?.settings?.eventData?.extendedProps?.job
    if (!job) return
    const resourceId = info.resource?.id ?? 'unassigned'
    const date = info.dateStr.slice(0, 10)
    const hasTime = info.dateStr.length > 10
    const startTime = hasTime ? info.dateStr.slice(11, 19) : null

    const { error } = await supabase.from('schedule').insert({
      job_id: job.id, date, start_time: startTime, resource_id: resourceId, status: 'scheduled',
    })
    if (error) { showToast(error.message, true); return }
    await supabase.from('jobs')
      .update({ status: 'scheduled', status_changed_at: new Date().toISOString() })
      .eq('id', job.id)

    const res = RESOURCES.find(r => r.id === resourceId)?.title ?? resourceId
    const dl  = new Date(date).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
    showToast(`Assigned to ${res} · ${dl}`)
    load()
  }, [])

  const handleEventDrop = useCallback(async (info) => {
    const { scheduleId } = info.event.extendedProps
    const newDate    = info.event.startStr.slice(0, 10)
    const hasTime    = info.event.startStr.length > 10
    const startTime  = hasTime ? info.event.startStr.slice(11, 19) : null
    const endTime    = info.event.endStr?.length > 10 ? info.event.endStr.slice(11, 19) : null
    const resourceId = info.newResource?.id ?? info.event.getResources()[0]?.id ?? 'unassigned'

    const { error } = await supabase.from('schedule')
      .update({ date: newDate, start_time: startTime, end_time: endTime, resource_id: resourceId })
      .eq('id', scheduleId)

    if (error) { info.revert(); showToast(error.message, true) }
    else showToast('Rescheduled')
  }, [])

  const handleEventResize = useCallback(async (info) => {
    const { scheduleId } = info.event.extendedProps
    const endTime = info.event.endStr?.length > 10 ? info.event.endStr.slice(11, 19) : null
    const { error } = await supabase.from('schedule')
      .update({ end_time: endTime })
      .eq('id', scheduleId)
    if (error) { info.revert(); showToast(error.message, true) }
  }, [])

  const handleEventClick = useCallback((info) => {
    info.jsEvent.preventDefault()
    setPopover({ info })
  }, [])

  async function unscheduleJob(job) {
    setPopover(null)
    await Promise.all([
      supabase.from('schedule').delete().eq('job_id', job.id),
      supabase.from('jobs').update({ status: 'accepted_to_schedule', status_changed_at: new Date().toISOString() }).eq('id', job.id),
    ])
    showToast('Moved back to tray')
    load()
  }

  function switchView(v) {
    if (v !== 'week') calRef.current?.getApi().changeView(v)
    setActiveView(v)
  }

  const api = () => calRef.current?.getApi()

  function navPrev() {
    if (activeView === 'week') setWeekStart(d => addDays(d, -7))
    else api()?.prev()
  }
  function navNext() {
    if (activeView === 'week') setWeekStart(d => addDays(d, 7))
    else api()?.next()
  }
  function navToday() {
    if (activeView === 'week') setWeekStart(weekMonday(new Date()))
    else api()?.today()
  }

  const displayTitle = activeView === 'week' ? weekTitle : viewTitle

  // Tray resize handlers
  function onResizeMouseDown(e) {
    e.preventDefault()
    trayResizing.current = true
    trayResizeStart.current = { x: e.clientX, w: trayWidth }
    function onMove(e) {
      if (!trayResizing.current) return
      const delta = e.clientX - trayResizeStart.current.x
      setTrayWidth(Math.max(180, Math.min(500, trayResizeStart.current.w + delta)))
    }
    function onUp() {
      trayResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const trayQ = traySearch.trim().toLowerCase()
  const filteredUnscheduled = trayQ
    ? unscheduled.filter(j =>
        [j.title, j.clients?.name, j.address, j.job_type]
          .some(v => v?.toLowerCase().includes(trayQ))
      )
    : unscheduled

  const VIEWS = [
    { v: 'resourceTimelineDay', label: 'Day' },
    { v: 'week',                label: 'Week' },
    { v: 'listWeek',            label: 'List' },
  ]

  return (
    <div style={{ ...s.shell, flexDirection: isMobile ? 'column' : 'row' }}>

      {/* ── Tray (hidden on mobile) ── */}
      {!isMobile && <div style={{ ...s.tray, width: trayWidth, minWidth: 180, maxWidth: 500, position: 'relative' }}>
        <div style={s.trayTop}>
          <div style={s.trayHead}>
            <span style={s.trayLabel}>Unscheduled</span>
            {unscheduled.length > 0 && (
              <span style={s.trayBadge}>
                {trayQ && filteredUnscheduled.length !== unscheduled.length
                  ? `${filteredUnscheduled.length}/${unscheduled.length}`
                  : unscheduled.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div style={s.traySearchWrap}>
            <span style={s.traySearchIcon}>🔍</span>
            <input
              placeholder="Search jobs…"
              value={traySearch}
              onChange={e => setTraySearch(e.target.value)}
              style={s.traySearchInput}
            />
            {traySearch && (
              <button onClick={() => setTraySearch('')} style={s.traySearchClear}>✕</button>
            )}
          </div>

          <div style={s.trayList}>
            {loading && <div style={s.empty}>Loading…</div>}
            {!loading && filteredUnscheduled.length === 0 && (
              <div style={s.empty}>
                {trayQ ? 'No matches' : 'All jobs scheduled ✓'}
              </div>
            )}
            {filteredUnscheduled.map(j => <TrayCard key={j.id} job={j} />)}
          </div>
        </div>

        {/* Legend */}
        <div style={s.legend}>
          {orderedResources.map(r => (
            <div key={r.id} style={{ ...s.legendRow, opacity: visibleIds.has(r.id) ? 1 : 0.35 }}>
              <div style={{ ...s.legendDot, background: RESOURCE_COLOR[r.id] }} />
              <span style={s.legendName}>{r.title}</span>
            </div>
          ))}
        </div>

        {/* Resize handle */}
        <div style={s.trayResizeHandle} onMouseDown={onResizeMouseDown} />
      </div>}

      {/* ── Calendar ── */}
      <div style={s.main}>

        {/* Toolbar */}
        <div style={{ ...s.toolbar, flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? '6px' : '0' }}>
          <div style={s.tbLeft}>
            <button style={s.todayBtn} onClick={navToday}>Today</button>
            <div style={s.navGroup}>
              <button style={s.navBtn} onClick={navPrev}>‹</button>
              <button style={s.navBtn} onClick={navNext}>›</button>
            </div>
            <h2 style={{ ...s.dateTitle, fontSize: isMobile ? '13px' : '16px' }}>{displayTitle}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              style={{ ...s.filterBtn, ...(showFilter ? s.filterBtnOn : {}) }}
              onClick={() => setShowFilter(v => !v)}
            >
              ⚙ {!isMobile && 'Staff'}
              {visibleIds.size < orderedResources.length && (
                <span style={s.filterBadge}>{visibleIds.size}/{orderedResources.length}</span>
              )}
            </button>
            <div style={s.tbRight}>
              {VIEWS.map(({ v, label }) => (
                <button
                  key={v}
                  style={activeView === v ? { ...s.viewBtn, ...s.viewBtnOn } : s.viewBtn}
                  onClick={() => switchView(v)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* FC CSS overrides */}
        <style>{FC_CSS}</style>

        {/* Week custom grid */}
        {activeView === 'week' ? (
          <div style={s.calWrap}>
            <WeekGrid
              weekStart={weekStart}
              events={events}
              onEventClick={ev => setPopover({ weekEvent: ev })}
              resources={activeResources}
              onReorder={reordered => {
                // Merge hidden resources back in their original positions
                setOrderedResources(prev => {
                  const hiddenInOrder = prev.filter(r => !visibleIds.has(r.id))
                  const result = [...reordered]
                  // Re-insert hidden ones at their old relative positions (append after)
                  hiddenInOrder.forEach(h => {
                    const oldIdx = prev.findIndex(r => r.id === h.id)
                    result.splice(Math.min(oldIdx, result.length), 0, h)
                  })
                  return result
                })
              }}
            />
          </div>
        ) : (
          <div style={s.calWrap}>
            <FullCalendar
              ref={calRef}
              plugins={[resourceTimelinePlugin, interactionPlugin, listPlugin]}
              schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
              initialView={isMobile ? 'listWeek' : 'resourceTimelineDay'}
              headerToolbar={false}
              height="auto"
              resources={activeResources}
              resourceOrder="index"
              events={events}
              editable
              droppable
              selectable
              weekends={false}
              slotMinTime="06:00:00"
              slotMaxTime="19:00:00"
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              nowIndicator
              resourceAreaWidth="140px"
              resourceAreaHeaderContent="Staff / Vehicle"
              businessHours={{ daysOfWeek: [1,2,3,4,5], startTime: '07:00', endTime: '17:30' }}
              drop={handleDrop}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              datesSet={handleDatesSet}
              eventContent={renderEvent}
              resourceLabelContent={renderResource}
              resourceLabelDidMount={handleResourceLabelDidMount}
              views={{
                resourceTimelineDay: {
                  slotDuration: '00:30:00',
                  slotLabelFormat: [{ hour: 'numeric', minute: '2-digit', hour12: true }],
                },
              }}
            />
          </div>
        )}

        {/* ── Truck Tracker panel ── */}
        <div style={s.trackerSection}>
          <button style={s.trackerToggle} onClick={() => setShowTracker(v => !v)}>
            <span>🚛 Truck Trackers</span>
            <span style={{ ...s.trackerChevron, transform: showTracker ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>⌄</span>
          </button>
          {showTracker && (
            <div style={s.trackerBody}>
              <CartrackMap />
            </div>
          )}
        </div>
      </div>

      {popover && (
        <Popover
          info={popover.info}
          weekEvent={popover.weekEvent}
          onClose={() => setPopover(null)}
          onUnschedule={unscheduleJob}
        />
      )}

      {showFilter && (
        <FilterPanel
          resources={orderedResources}
          visibleIds={visibleIds}
          onToggle={toggleVisible}
          onReorder={setOrderedResources}
          onClose={() => setShowFilter(false)}
        />
      )}

      {toast && (
        <div style={{ ...s.toast, background: toast.err ? '#C0392B' : '#2C2416' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Event block ────────────────────────────────────────────────────────────
function renderEvent(info) {
  const job = info.event.extendedProps?.job
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', height: '100%', overflow: 'hidden', borderRadius: '4px' }}>
      <div style={{ width: '3px', background: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
      <div style={{ padding: '3px 7px', overflow: 'hidden', flex: 1 }}>
        <div style={{ fontWeight: '700', fontSize: '11px', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {info.event.title}
        </div>
        {job?.job_type && (
          <div style={{ fontSize: '10px', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {job.job_type}{job.address ? ` · ${job.address.split(',')[0]}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resource row label (Day view) ──────────────────────────────────────────
// Module-level ref so resourceLabelDidMount can call back into React state
const _fcDrag = { fromId: null, reorder: null, getList: null }

function renderResource(info) {
  const id = info.resource.id
  const color = RESOURCE_COLOR[id] ?? '#aaa'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px 0 4px', height: '100%' }}>
      <span style={{ color: '#C8C2BC', fontSize: '14px', cursor: 'grab', userSelect: 'none', lineHeight: 1, flexShrink: 0 }}>⠿</span>
      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: '12px', fontWeight: '600', color: '#2C2416' }}>{info.resource.title}</span>
    </div>
  )
}

function handleResourceLabelDidMount(info) {
  const row = info.el.closest('tr') ?? info.el
  row.setAttribute('draggable', 'true')
  row.style.cursor = 'default'
  row.addEventListener('dragstart', (e) => {
    _fcDrag.fromId = info.resource.id
    e.dataTransfer.effectAllowed = 'move'
  })
  row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' })
  row.addEventListener('drop', (e) => {
    e.preventDefault()
    const toId = info.resource.id
    if (_fcDrag.fromId && _fcDrag.fromId !== toId && _fcDrag.reorder && _fcDrag.getList) {
      const list = _fcDrag.getList()
      const from = list.findIndex(r => r.id === _fcDrag.fromId)
      const to   = list.findIndex(r => r.id === toId)
      if (from !== -1 && to !== -1) _fcDrag.reorder(arrayMove(list, from, to))
    }
    _fcDrag.fromId = null
  })
}

// ── FullCalendar CSS overrides ─────────────────────────────────────────────
const FC_CSS = `
  .fc { font-family: var(--font, system-ui, sans-serif); }
  .fc-timeline-header-row .fc-timeline-slot-label {
    font-size: 11px; font-weight: 600; color: #888;
    text-transform: uppercase; letter-spacing: 0.04em; border-bottom: none;
  }
  .fc-resource-area-header .fc-datagrid-cell-frame {
    font-size: 10px; font-weight: 700; color: #aaa;
    text-transform: uppercase; letter-spacing: 0.06em;
    padding: 0 10px; display: flex; align-items: center;
  }
  .fc-datagrid-cell-frame { border-right: 1px solid #E2DDD6 !important; }
  /* Force both sides of each resource row to match height */
  .fc-resource-timeline .fc-datagrid-body tr { height: 56px !important; }
  .fc-resource-timeline .fc-timeline-lane { height: 56px !important; min-height: 56px !important; }
  .fc-resource-timeline .fc-datagrid-cell-frame { height: 56px !important; display: flex !important; align-items: center !important; }
  .fc-timeline-lane:nth-child(even) { background: #FAFAF8; }
  .fc-non-business { background: rgba(44, 36, 22, 0.04) !important; }
  .fc-timeline-now-indicator-line { border-color: #C0392B; border-width: 2px; }
  .fc-timeline-now-indicator-arrow { border-top-color: #C0392B; }
  .fc-event { border: none !important; border-radius: 4px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important; cursor: pointer; }
  .fc-timeline-slot { border-color: #EDEBE7 !important; }
  .fc-timeline-slot.fc-timeline-slot-minor { border-color: #F5F3F0 !important; }
  .fc-scroller::-webkit-scrollbar { width: 5px; height: 5px; }
  .fc-scroller::-webkit-scrollbar-track { background: transparent; }
  .fc-scroller::-webkit-scrollbar-thumb { background: #E2DDD6; border-radius: 4px; }
  .fc-list-event:hover td { background: #F5F3F0 !important; }
  .fc-list-day-cushion { background: #F5F3F0 !important; font-size: 12px; }
  .fc-list-event-title { font-size: 13px; font-weight: 600; }
`

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  shell: { display: 'flex', height: '100%', overflow: 'hidden', background: '#F5F3F0' },
  tray: {
    width: '200px', flexShrink: 0, background: '#fff',
    borderRight: '1px solid #E2DDD6',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  trayTop:  { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '14px 0 0' },
  trayHead: { display: 'flex', alignItems: 'center', gap: '7px', padding: '0 14px 6px' },
  trayLabel:{ fontSize: '11px', fontWeight: '700', color: '#2C2416', textTransform: 'uppercase', letterSpacing: '0.05em' },
  trayBadge:{ fontSize: '10px', fontWeight: '700', background: '#D4851A', color: '#fff', borderRadius: '20px', padding: '1px 7px', lineHeight: 1.6 },
  traySearchWrap: { position: 'relative', margin: '0 10px 8px', display: 'flex', alignItems: 'center' },
  traySearchIcon: { position: 'absolute', left: '8px', fontSize: '11px', pointerEvents: 'none', opacity: 0.5 },
  traySearchInput: {
    width: '100%', padding: '6px 24px 6px 26px', fontSize: '12px',
    border: '1.5px solid #E2DDD6', borderRadius: '7px',
    background: '#FAF8F4', color: '#2C2416', outline: 'none',
    fontFamily: 'var(--font)',
  },
  traySearchClear: {
    position: 'absolute', right: '6px', background: 'none', border: 'none',
    color: '#aaa', cursor: 'pointer', fontSize: '11px', padding: 0, lineHeight: 1,
  },
  trayList: { flex: 1, overflowY: 'auto', padding: '2px 10px 10px' },
  trayResizeHandle: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px',
    cursor: 'col-resize', zIndex: 10,
    background: 'transparent',
  },
  trayResizeHandle_hover: { background: 'rgba(74,103,65,0.15)' },
  empty:    { textAlign: 'center', color: '#ccc', fontSize: '11px', padding: '20px 0' },
  legend:     { borderTop: '1px solid #E2DDD6', padding: '12px 14px' },
  legendRow:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' },
  legendDot:  { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  legendName: { fontSize: '11px', color: '#555', fontWeight: '500' },
  main:    { flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', background: '#fff' },
  trackerSection: { flexShrink: 0, borderTop: '1px solid #E2DDD6', background: '#fff' },
  trackerToggle: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: '13px', fontWeight: '600', color: '#2C2416',
  },
  trackerChevron: { fontSize: '22px', color: '#4A6741', lineHeight: 1, display: 'inline-block' },
  trackerBody: { padding: '0 16px 16px' },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: '#fff', borderBottom: '1px solid #E2DDD6', flexShrink: 0,
  },
  tbLeft:   { display: 'flex', alignItems: 'center', gap: '8px' },
  tbRight:  { display: 'flex', gap: '2px', background: '#F5F3F0', borderRadius: '7px', padding: '2px' },
  todayBtn: {
    padding: '6px 14px', borderRadius: '6px',
    background: '#2C2416', color: '#fff', border: 'none',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  navGroup: { display: 'flex', gap: '2px' },
  navBtn: {
    padding: '5px 10px', borderRadius: '6px', border: '1px solid #E2DDD6',
    background: '#fff', color: '#666', fontSize: '17px', cursor: 'pointer', lineHeight: 1,
  },
  dateTitle:{ fontSize: '15px', fontWeight: '700', color: '#2C2416', margin: '0 0 0 4px' },
  viewBtn: {
    padding: '5px 14px', borderRadius: '5px', border: 'none',
    background: 'transparent', fontSize: '12px', fontWeight: '500',
    color: '#888', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.12s',
  },
  viewBtnOn: { background: '#fff', color: '#2C2416', fontWeight: '700', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  filterBtn: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '5px 12px', borderRadius: '6px', border: '1px solid #E2DDD6',
    background: '#fff', color: '#555', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.12s',
  },
  filterBtnOn: { background: '#2C2416', color: '#fff', borderColor: '#2C2416' },
  filterBadge: {
    background: '#D4851A', color: '#fff', fontSize: '10px', fontWeight: '700',
    borderRadius: '20px', padding: '1px 6px', lineHeight: 1.6,
  },
  calWrap: { flexShrink: 0, overflowY: 'auto', overflowX: 'hidden' },
  toast: {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    color: '#fff', padding: '10px 22px', borderRadius: '8px',
    fontSize: '13px', fontWeight: '600', zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap',
  },
}

const tr = {
  card: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '7px 8px', marginBottom: '5px',
    borderRadius: '7px', border: '1px solid #EDEBE7',
    background: '#fff', cursor: 'grab', userSelect: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  bar:  { width: '3px', height: '32px', borderRadius: '2px', flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: '12px', fontWeight: '600', color: '#2C2416', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 },
  meta: { fontSize: '10px', color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  grip: { color: '#D0CBC4', fontSize: '13px', flexShrink: 0 },
}

const po = {
  scrim:    { position: 'fixed', inset: 0, zIndex: 400 },
  box:      { position: 'fixed', width: '250px', background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(44,36,22,0.18)', border: '1px solid #E2DDD6', overflow: 'hidden', zIndex: 401 },
  stripe:   { height: '4px', width: '100%' },
  title:    { fontSize: '14px', fontWeight: '700', color: '#2C2416', padding: '12px 14px 6px' },
  row:      { display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: '#555', lineHeight: 1.6, padding: '1px 14px' },
  icon:     { fontSize: '11px', marginTop: '2px', flexShrink: 0 },
  btns:     { display: 'flex', gap: '8px', padding: '12px 14px', borderTop: '1px solid #E2DDD6', marginTop: '8px' },
  backBtn:  { flex: 1, background: '#FDF3E3', border: '1px solid #FADFAA', borderRadius: '6px', padding: '7px', fontSize: '11px', fontWeight: '600', color: '#B8860B', cursor: 'pointer', fontFamily: 'var(--font)' },
  closeBtn: { background: '#2C2416', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '11px', fontWeight: '600', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },
}

// ── Week grid styles ───────────────────────────────────────────────────────
const wg = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '140px repeat(5, 1fr)',
    borderBottom: '2px solid #E2DDD6',
    background: '#FAFAF8',
    flexShrink: 0,
  },
  resourceHeader: {
    fontSize: '10px', fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '10px 10px',
    borderRight: '1px solid #E2DDD6',
    display: 'flex', alignItems: 'center',
  },
  dayHeader: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 4px', borderRight: '1px solid #EDEBE7',
    gap: '2px',
  },
  dayHeaderToday: { background: '#FFFDF5' },
  dayName: { fontSize: '10px', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' },
  dayNum:  { fontSize: '12px', fontWeight: '600', color: '#555' },
  dayNumToday: { color: '#C0392B', fontWeight: '800' },
  body: { flex: 1, overflowY: 'auto' },
  row: {
    display: 'grid',
    gridTemplateColumns: '140px repeat(5, 1fr)',
    borderBottom: '1px solid #EDEBE7',
    minHeight: '60px',
  },
  resourceCell: {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '8px 8px 8px 6px',
    borderRight: '1px solid #E2DDD6',
    flexShrink: 0,
  },
  grip: { color: '#C8C2BC', fontSize: '14px', cursor: 'grab', userSelect: 'none', touchAction: 'none', lineHeight: 1, flexShrink: 0 },
  resourceName: { fontSize: '12px', fontWeight: '600', color: '#2C2416' },
  cell: {
    padding: '4px 5px', borderRight: '1px solid #EDEBE7',
    display: 'flex', flexDirection: 'column', gap: '3px',
  },
  cellToday: { background: '#FFFDF5' },
  pill: {
    borderRadius: '4px', padding: '4px 7px', cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
    userSelect: 'none',
  },
  pillTitle: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#fff', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pillSub:   { display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
}

// ── Filter panel styles ────────────────────────────────────────────────────
const fp = {
  scrim: { position: 'fixed', inset: 0, zIndex: 300 },
  panel: {
    position: 'fixed', top: '56px', right: '16px',
    width: '240px', background: '#fff',
    borderRadius: '10px', border: '1px solid #E2DDD6',
    boxShadow: '0 8px 32px rgba(44,36,22,0.14)',
    overflow: 'hidden', zIndex: 301,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px 10px',
    borderBottom: '1px solid #E2DDD6',
  },
  title: { fontSize: '12px', fontWeight: '700', color: '#2C2416', textTransform: 'uppercase', letterSpacing: '0.05em' },
  hint:  { fontSize: '10px', color: '#bbb' },
  row: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 14px', borderBottom: '1px solid #F5F3F0',
    background: '#fff', cursor: 'default',
  },
  grip: { color: '#D0CBC4', fontSize: '14px', cursor: 'grab', touchAction: 'none', flexShrink: 0, lineHeight: 1 },
  name: { flex: 1, fontSize: '13px', fontWeight: '500', color: '#2C2416' },
  toggle: {
    padding: '3px 10px', borderRadius: '20px', border: 'none',
    fontSize: '11px', fontWeight: '700', cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.15s', flexShrink: 0,
  },
}
