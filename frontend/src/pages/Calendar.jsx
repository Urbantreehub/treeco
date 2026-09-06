import { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useIsMobile } from '../hooks/useIsMobile'
import DayRunView from '../components/dayrun/DayRunView'
import FullCalendar from '@fullcalendar/react'
import resourceTimelinePlugin from '@fullcalendar/resource-timeline'
import interactionPlugin, { Draggable } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import {
  DndContext, DragOverlay, closestCenter, pointerWithin, rectIntersection,
  MouseSensor, TouchSensor, PointerSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../config/supabase'
import { SPENCERS_COLOR, isSpencersJob, getStatusLabel, JOB_STATUSES, categoryMeta, jobCategory } from '../config/statuses'
import { jobHeading, koCode, kpiCountdown, displayCase } from '../utils/jobDisplay'
import { primaryQuote } from '../utils/quotes'
import CartrackMap from '../components/CartrackMap'
import TruckProgress from '../components/TruckProgress'
import JobDetailPanel from '../components/JobDetailPanel'
import { useResources, useCrewAssignments, resolveCrew, crewIds, sameIds, shortName } from '../hooks/useResources'
import { useAvailability, kindLabel } from '../hooks/useAvailability'
import { PersonChip, EquipChip, OffBlock, CrewChips, PeopleStrip, ChipGhost, CrewPopover } from '../components/CrewChips'
import LeavePopover, { LeaveDetail } from '../components/LeavePopover'

// Price + on-site time for a job come from its primary quote (total + job_pack).
function nzd(v) {
  if (v == null) return null
  return '$' + Number(v).toLocaleString('en-NZ', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
// Ex-GST value of a job's primary quote. Prefer the stored subtotal; otherwise
// strip 15% GST off the total. Returns 0 when there's no quote.
function jobExGst(job) {
  const q = primaryQuote(job)
  if (!q) return 0
  if (q.subtotal != null) return Number(q.subtotal) || 0
  return (Number(q.total) || 0) / 1.15
}
// How many people the crew pack asks for (null = not set).
function staffNeed(job) {
  const n = Number(primaryQuote(job)?.job_pack?.staff_count)
  return Number.isFinite(n) && n > 0 ? n : null
}
// Equipment the crew pack asks for, as resource ids.
function jobEquipment(job) {
  const pack = primaryQuote(job)?.job_pack ?? {}
  const out = []
  if (pack.avant === true) out.push('avant')
  if (pack.stump_grinder === true) out.push('grinder')
  return out
}

// Turn a free-text on-site estimate ("Half day, 4–6 hrs", "Full day", "90 min")
// into hours, so dropping a job onto the calendar can auto-size the event.
// Explicit hours/minutes win; otherwise half/full-day keywords; ranges take the
// upper bound so the block never under-books the crew. Returns null if unknown.
function parseDurationHours(text) {
  if (!text) return null
  const t = String(text).toLowerCase()
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (nums.length && /(hour|hr|\bh\b)/.test(t)) return Math.max(...nums)
  if (nums.length && /min/.test(t)) return Math.max(...nums) / 60
  if (/full\s*day/.test(t)) return 8
  if (/half\s*day/.test(t)) return 4
  if (nums.length) return Math.max(...nums) // bare number → assume hours
  return null
}

// start_time ("HH:MM:SS") + hours → end_time ("HH:MM:SS"), clamped to 23:59.
function addHours(startTime, hours) {
  if (!startTime || !hours) return null
  const [h, m] = startTime.split(':').map(Number)
  const end = Math.min(h * 60 + m + Math.round(hours * 60), 23 * 60 + 59)
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}:00`
}

// Statuses offered in the tray's status filter (and fetched for it). The tray
// opens on ready work + quote visits only; the rest are there on demand.
const TRAY_STATUSES = [
  'new_lead',
  'quote_scheduled',
  'quote_sent',
  'accepted_to_schedule',
  'scheduled',
  'stump_grinding',
  'on_hold',
]
const DEFAULT_TRAY_STATUSES = ['accepted_to_schedule', 'quote_scheduled', 'new_lead']
// Quote visits (Josh's runs) vs work for a truck.
const VISIT_STATUSES = new Set(['new_lead', 'quote_scheduled', 'quote_sent'])

const JOB_TYPE_COLOR = {
  removal:  '#C0392B',
  pruning:  '#4A6741',
  grinding: '#8B6238',
  planting: '#2E7D52',
  consult:  '#4A7FA5',
}

function fmtClock(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}

function jobColor(job) {
  if (isSpencersJob(job)) return categoryMeta(job).color ?? SPENCERS_COLOR
  if (VISIT_STATUSES.has(job?.status)) return JOB_STATUSES.quote_scheduled.color
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

// Local-timezone YYYY-MM-DD — never use toISOString() here: it converts to UTC,
// which is yesterday's date for the entire NZ morning.
function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function fromYMD(ymd) { return new Date(ymd + 'T00:00:00') }
const dayShort = ymd => fromYMD(ymd).toLocaleDateString('en-NZ', { weekday: 'short' })
const dayLong = ymd => fromYMD(ymd).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
// "Mon–Wed" for a sorted list of dates (same week, typically).
function rangeLabel(dates) {
  if (!dates?.length) return ''
  if (dates.length === 1) return dayShort(dates[0])
  return `${dayShort(dates[0])}–${dayShort(dates[dates.length - 1])}`
}

// Everything the row headers, week cells and people strip read from the page.
const SchedulerCtx = createContext(null)

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
      <span {...attributes} {...listeners} style={fp.grip}>⠿</span>
      <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: resource.color, flexShrink: 0 }} />
      <span style={fp.name}>{resource.title}</span>
      <button
        style={{ ...fp.toggle, background: visible ? '#4A6741' : 'var(--border)', color: visible ? '#fff' : '#999' }}
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
          <span style={fp.title}>Rows</span>
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

// ── Row header (shared by the week grid and the day timeline) ──────────────
// Truck name + note, the crew on it over the visible dates, and the Avant /
// grinder chips on the row that carries them. A drop target for people and
// equipment (= the whole visible range); a tap opens the checkbox popover.
function RowHeader({ res, compact = false, grip }) {
  const ctx = useContext(SchedulerCtx)
  const { setNodeRef, isOver, active } = useDroppable({ id: `hdr:${res.id}`, data: { type: 'hdr', resourceId: res.id }, disabled: res.id === 'unassigned' })
  const isCrewRow = res.kind === 'truck' || res.kind === 'person'
  const crewByDate = {}
  if (isCrewRow) ctx.visibleDates.forEach(d => { crewByDate[d] = ctx.crewFor(res.id, d) })
  const equipment = res.id === ctx.equipHomeId
    ? ctx.equipment.map(eq => {
        const onDays = ctx.visibleDates.filter(d => ctx.equipFor(res.id, d).some(e => e.id === eq.id))
        return { ...eq, on: onDays.length > 0, onLabel: onDays.length ? rangeLabel(onDays) : '' }
      })
    : []
  const dropType = active?.data?.current?.type
  const highlight = isOver && (dropType === 'person' || dropType === 'equip') && res.id !== 'unassigned'
  return (
    <div
      ref={setNodeRef}
      onClick={isCrewRow ? (e => ctx.openCrewPopover(res, e.currentTarget.getBoundingClientRect())) : undefined}
      role={isCrewRow ? 'button' : undefined}
      aria-label={isCrewRow ? `Crew on the ${res.title}` : undefined}
      title={isCrewRow ? `Tap to choose who is on the ${res.title}` : undefined}
      style={{
        display: 'flex', flexDirection: 'column', gap: compact ? 3 : 5, justifyContent: 'center',
        padding: compact ? '4px 6px 4px 4px' : '8px 10px', height: '100%', minWidth: 0,
        background: highlight ? 'var(--terra-wash)' : 'transparent',
        outline: highlight ? '2px dashed var(--terra)' : 'none', outlineOffset: -3, borderRadius: 8,
        cursor: isCrewRow ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {grip}
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: res.color, flexShrink: 0 }} />
        <b style={{ fontSize: compact ? 12 : 13.5, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.title}</b>
        {!compact && res.note && <span style={{ fontSize: 10.5, color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.note}</span>}
      </div>
      {isCrewRow && (
        <CrewChips
          resourceId={res.id}
          dates={ctx.visibleDates}
          crewByDate={crewByDate}
          equipment={equipment}
          compact={compact}
          dragFrom={res.title}
          onPersonClick={ctx.onPersonClick}
          onEquipClick={ctx.onEquipClick}
        />
      )}
      {!compact && res.id === ctx.equipHomeId && (
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Drop the Avant or the grinder on a day</span>
      )}
      {!compact && res.kind === 'truck' && res.id !== ctx.equipHomeId && (
        <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Drop people here for the week, or on one day</span>
      )}
    </div>
  )
}

// ── Custom Week Grid ───────────────────────────────────────────────────────
// One truck-day. Job pills, away blocks, per-day crew/equipment overrides,
// warnings, and — while something is being dragged over it — the fit hint.
function WeekCell({ res, ymd, isToday, cellEvents, onEventClick }) {
  const ctx = useContext(SchedulerCtx)
  const { setNodeRef, isOver, active } = useDroppable({ id: `cell:${res.id}:${ymd}`, data: { type: 'cell', resourceId: res.id, date: ymd } })
  const isCrewRow = res.kind === 'truck' || res.kind === 'person'
  const crew = isCrewRow ? ctx.crewFor(res.id, ymd) : []
  const away = crew.filter(c => c.away)
  const present = crew.filter(c => !c.away)
  const overrides = crew.filter(c => c.explicit && !c.away)
  const equip = res.kind === 'truck' ? ctx.equipFor(res.id, ymd) : []
  const warnings = ctx.warningsFor(res, ymd, cellEvents)
  const dragData = active?.data?.current
  const hint = isOver && dragData ? ctx.dropHint(dragData, res, ymd) : null
  const dropOk = isOver && dragData && dragData.type !== 'row'
  return (
    <div
      ref={setNodeRef}
      style={{
        ...wg.cell, ...(isToday ? wg.cellToday : {}),
        ...(dropOk ? { background: 'var(--terra-wash)', outline: '2px dashed var(--terra)', outlineOffset: -4 } : {}),
      }}
    >
      {cellEvents.map(ev => (
        <div
          key={ev.id}
          style={{ ...wg.pill, background: ev.color ?? '#4A7FA5' }}
          onClick={() => onEventClick(ev)}
        >
          <span style={wg.pillTitle}>{ev.title}</span>
          <span style={wg.pillSub}>
            {[ev.extendedProps?.job?.job_type, ev.extendedProps?.startTime ? fmtClock(ev.extendedProps.startTime) : null].filter(Boolean).join(' · ')}
          </span>
        </div>
      ))}
      {away.map(c => (
        <OffBlock
          key={c.id}
          compact
          label={`${shortName(c)} · ${kindLabel(c.away.kind)}`}
          onClick={e => ctx.openLeaveDetail(c, ymd, e.currentTarget.getBoundingClientRect())}
        />
      ))}
      {(overrides.length > 0 || equip.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2 }}>
          {overrides.map(c => (
            <PersonChip
              key={c.id} user={c} compact
              dragId={`person:${c.id}:cell:${res.id}:${ymd}`}
              dragData={{ type: 'person', userId: c.id, fromResource: res.id, fromDate: ymd }}
              title={`${c.name} · on the ${res.title} ${dayShort(ymd)}`}
              onClick={ctx.onPersonClick}
            />
          ))}
          {equip.map(eq => (
            <EquipChip
              key={eq.id} equip={eq} compact on
              dragId={`equip:${eq.id}:cell:${res.id}:${ymd}`}
              dragData={{ type: 'equip', equipId: eq.id, fromResource: res.id, fromDate: ymd }}
              title={`${eq.name} on the ${res.title} ${dayShort(ymd)} · tap to take off`}
              onClick={() => ctx.removeEquip(res.id, ymd, eq.id)}
            />
          ))}
        </div>
      )}
      {warnings.map((w, i) => <div key={i} style={wg.warn}>{w}</div>)}
      {hint && <div style={{ ...wg.hint, color: hint.warn ? '#B26B0E' : 'var(--terra)' }}>{hint.text}</div>}
      {!hint && dropOk && present.length === 0 && isCrewRow && <div style={wg.hint}>Nobody on the {res.title} {dayShort(ymd)}</div>}
    </div>
  )
}

function SortableWeekRow({ res, ri, days, today, events, onEventClick, cols }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `row:${res.id}`, data: { type: 'row', resourceId: res.id } })
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
        <RowHeader
          res={res}
          grip={<span {...attributes} {...listeners} style={wg.grip} onClick={e => e.stopPropagation()} aria-label={`Reorder ${res.title}`}>⠿</span>}
        />
      </div>
      {days.map(d => {
        const ymd = toYMD(d)
        const cellEvents = events.filter(e =>
          e.resourceId === res.id && (e.start?.slice(0, 10) === ymd || e.start === ymd)
        )
        return <WeekCell key={ymd} res={res} ymd={ymd} isToday={ymd === today} cellEvents={cellEvents} onEventClick={onEventClick} />
      })}
    </div>
  )
}

// Mobile week view: everyone's jobs for the week as a vertical, day-grouped
// agenda — full-width legible rows (no truncation, no horizontal scroll), one
// section per weekday. Replaces the resource-timeline grid on phones (F11/F26).
function MobileWeekAgenda({ weekStart, events, resources, colorOf, onEventClick }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  const today = toYMD(new Date())
  const resTitle = id => resources.find(r => r.id === id)?.title ?? 'Unassigned'

  return (
    <div style={mwa.wrap}>
      {days.map(d => {
        const ymd = toYMD(d)
        const isToday = ymd === today
        const dayEvents = events
          .filter(e => (e.start?.slice(0, 10) === ymd || e.start === ymd))
          .sort((a, b) => String(a.start).localeCompare(String(b.start)))
        return (
          <div key={ymd} style={mwa.daySection}>
            <div style={{ ...mwa.dayHeader, ...(isToday ? mwa.dayHeaderToday : {}) }}>
              <span style={mwa.dayName}>{d.toLocaleDateString('en-NZ', { weekday: 'long' })}</span>
              <span style={mwa.dayDate}>{d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short' })}{isToday ? ' · Today' : ''}</span>
              <span style={mwa.dayCount}>{dayEvents.length || ''}</span>
            </div>
            {dayEvents.length === 0 ? (
              <div style={mwa.empty}>No jobs</div>
            ) : dayEvents.map(ev => {
              const job = ev.extendedProps?.job
              const time = ev.start?.length > 10 ? fmtClock(ev.start.slice(11, 16)) : null
              return (
                <button key={ev.id} style={mwa.row} onClick={() => onEventClick(ev)}>
                  <span style={{ ...mwa.bar, background: ev.color ?? '#4A7FA5' }} />
                  <span style={mwa.rowBody}>
                    <span style={mwa.rowTitle}>{displayCase(ev.title)}</span>
                    <span style={mwa.rowMeta}>
                      {[time, job?.job_type, resTitle(ev.resourceId)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span style={{ ...mwa.crewDot, background: colorOf(ev.resourceId) }} />
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

function WeekGrid({ weekStart, events, onEventClick, resources }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i))
  const today = toYMD(new Date())
  const cols = `190px repeat(${days.length}, minmax(120px, 1fr))`

  return (
    <div style={wg.wrap}>
      <div style={{ ...wg.headerRow, gridTemplateColumns: cols }}>
        <div style={wg.resourceHeader}>Truck / person</div>
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
      <SortableContext items={resources.map(r => `row:${r.id}`)} strategy={verticalListSortingStrategy}>
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
    </div>
  )
}

// ── Tray card ──────────────────────────────────────────────────────────────
// Drags two ways: FullCalendar's external Draggable feeds the day timeline;
// dnd-kit feeds the week grid (only one is live at a time, by `dndMode`).
function TrayCard({ job, onOpen, dndMode, highlighted }) {
  const ref = useRef()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `job:${job.id}`,
    data: { type: 'job', job, color: jobColor(job), sub: [job.job_type, job.address?.split(',')[0]].filter(Boolean).join(' · ') },
    disabled: dndMode !== 'kit',
  })

  useEffect(() => {
    const el = ref.current
    if (!el || dndMode !== 'fc') return
    const draggable = new Draggable(el, {
      // A touch drag needs a 250ms hold so scrolling the tray never lifts a card.
      longPressDelay: 250,
      minDistance: 5,
      eventData: {
        id:    `tray-${job.id}`,
        title: job.clients?.name ?? job.title ?? 'Job',
        color: jobColor(job),
        extendedProps: { job, fromTray: true },
      },
    })
    return () => draggable.destroy()
  }, [job, dndMode])

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView?.({ block: 'center' })
  }, [highlighted])

  // Spencers/Downer jobs lead with the address; contact name drops to secondary.
  const sp = isSpencersJob(job)
  const { primary, secondary } = jobHeading(job)
  const primaryLabel = sp ? (job.address?.split(',')[0] ?? primary) : primary
  const secondaryLabel = sp ? secondary : [job.job_type, job.address?.split(',')[0]].filter(Boolean).join(' · ')

  const code = koCode(job)
  const kpi = sp ? kpiCountdown(job) : null
  const q = primaryQuote(job)
  const price = q ? nzd(q.total) : null
  const timeOnSite = q?.job_pack?.time_required || null
  const staff = staffNeed(job)
  const cat = jobCategory(job)
  const catMeta = cat !== 'residential' ? categoryMeta(job) : null
  const isVisit = VISIT_STATUSES.has(job.status)
  const showStatus = !DEFAULT_TRAY_STATUSES.includes(job.status)
  const statusColor = JOB_STATUSES[job.status]?.color ?? '#888'

  return (
    <div
      ref={el => { ref.current = el; setNodeRef(el) }}
      {...(dndMode === 'kit' ? { ...listeners, ...attributes } : {})}
      data-testid="tray-card"
      data-job-id={job.id}
      style={{
        ...tr.card,
        borderLeft: `4px solid ${isVisit ? JOB_STATUSES.quote_scheduled.color : JOB_STATUSES.accepted_to_schedule.color}`,
        ...(highlighted ? tr.cardHighlight : {}),
        opacity: isDragging ? 0.4 : 1,
      }}
      onClick={() => onOpen?.(job)}
      title="Open job details"
    >
      <div style={tr.body}>
        <div style={tr.titleRow}>
          <div style={tr.name}>{displayCase(primaryLabel)}</div>
          {price && <span style={tr.price}>{price}</span>}
        </div>
        {secondaryLabel ? <div style={tr.meta}>{displayCase(secondaryLabel)}</div> : null}
        <div style={tr.stats}>
          {catMeta && <span style={{ ...tr.cat, background: catMeta.color }}>{catMeta.label}</span>}
          {showStatus && <span style={{ ...tr.stat, background: statusColor + '18', color: statusColor }}>{getStatusLabel(job.status)}</span>}
          {code && <span style={{ ...tr.stat, background: '#EBF3FA', color: '#4A7FA5' }}>{code}</span>}
          {kpi && <span style={{ ...tr.stat, background: kpi.expired ? '#FFF0EE' : '#FDF3E3', color: kpi.expired ? '#C0392B' : '#D4851A' }}>KPI {kpi.text}</span>}
          {timeOnSite && <span style={tr.stat}>{timeOnSite}</span>}
          {staff && <span style={tr.stat}>{staff} staff</span>}
          {jobEquipment(job).map(e => <span key={e} style={tr.stat}>{e === 'avant' ? 'Avant' : 'grinder'}</span>)}
        </div>
      </div>
      <span style={tr.grip}>⠿</span>
    </div>
  )
}

// Truck-link dropdown inside the popover — keeps its own value so the selection
// reflects instantly (FullCalendar's event snapshot won't re-render live).
function PopoverTruckLink({ scheduleId, initialReg, vehicles, onLinkVehicle }) {
  const [reg, setReg] = useState(initialReg)
  return (
    <div style={po.truckRow}>
      <span style={po.icon}>🚚</span>
      <select
        value={reg}
        onChange={e => { setReg(e.target.value); onLinkVehicle(scheduleId, e.target.value) }}
        style={po.select}
      >
        <option value="">No truck linked</option>
        {(vehicles ?? []).map(v => (
          <option key={v.registration} value={v.registration}>
            {v.registration}{v.name ? ` · ${v.name}` : ''}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── Event popover ──────────────────────────────────────────────────────────
function Popover({ info, weekEvent, vehicles, crewLabel, onClose, onUnschedule, onLinkVehicle, onOpenJob }) {
  let job, rect, ext
  if (info) {
    ext = info.event.extendedProps
    job = ext?.job
    const r = info.el.getBoundingClientRect()
    rect = { top: Math.min(r.bottom + 6, window.innerHeight - 300), left: Math.min(r.left, window.innerWidth - 260) }
  } else if (weekEvent) {
    ext = weekEvent.extendedProps
    job = ext?.job
    rect = { top: window.innerHeight / 2 - 140, left: window.innerWidth / 2 - 125 }
  }
  if (!job) return null

  const scheduleId = ext?.scheduleId
  const crew = crewLabel?.(ext)

  return (
    <div style={po.scrim} onClick={onClose}>
      <div style={{ ...po.box, top: rect.top, left: rect.left }} onClick={e => e.stopPropagation()}>
        <div style={{ ...po.stripe, background: jobColor(job) }} />
        <div style={po.title}>{jobHeading(job).primary}</div>
        <div style={po.row}>
          <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '2px 9px',
            background: (JOB_STATUSES[job.status]?.color ?? '#888') + '18', color: JOB_STATUSES[job.status]?.color ?? '#888' }}>
            {getStatusLabel(job.status)}
          </span>
          {koCode(job) && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '2px 7px', marginLeft: 6, background: '#EBF3FA', color: '#4A7FA5' }}>{koCode(job)}</span>}
        </div>
        {isSpencersJob(job) && jobHeading(job).secondary && <div style={po.row}><span style={po.icon}>👤</span>{jobHeading(job).secondary}</div>}
        {job.job_type  && <div style={po.row}><span style={po.icon}>🌲</span>{job.job_type}</div>}
        {job.address   && <div style={po.row}><span style={po.icon}>📍</span>{job.address}</div>}
        {job.clients?.phone && <div style={po.row}><span style={po.icon}>📞</span>{job.clients.phone}</div>}
        {crew && <div style={po.row}><span style={{ ...po.icon, fontStyle: 'normal', fontWeight: 700, color: 'var(--ink-3)' }}>Crew</span>{crew}</div>}

        {scheduleId && (
          <PopoverTruckLink
            scheduleId={scheduleId}
            initialReg={ext?.vehicleReg ?? ''}
            vehicles={vehicles}
            onLinkVehicle={onLinkVehicle}
          />
        )}
        <button style={po.openBtn} onClick={() => onOpenJob(job)}>Open job →</button>
        <div style={po.btns}>
          <button style={po.backBtn} onClick={() => onUnschedule(job)}>↩ Back to tray</button>
          <button style={po.closeBtn} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// Builds the `crewFor(resourceId, date)` lookup DayRunView shows at the top of
// its sheet: people on the truck that day (with away state) and the equipment
// riding on it.
function useDayCrew({ people, assignments, availability, userOf, equipment, events }) {
  return useCallback((resourceId, date) => {
    if (!resourceId || resourceId === 'unassigned') return { people: [], equipment: [] }
    const crew = resolveCrew(resourceId, date, { people, assignments, availability, userOf })
    const ids = new Set()
    events.forEach(ev => {
      if (ev.extendedProps?.resourceId === resourceId && ev.extendedProps?.date === date) {
        (ev.extendedProps.equipmentIds ?? []).forEach(id => ids.add(id))
      }
    })
    return {
      people: crew.map(c => ({ id: c.id, name: c.name, short: shortName(c), away: c.away ? kindLabel(c.away.kind) : null })),
      equipment: [...ids].map(id => equipment.find(e => e.id === id)?.name ?? id),
    }
  }, [people, assignments, availability, userOf, equipment, events])
}

// ── Crew (truck login) calendar view ───────────────────────────────────────
function CrewCalendar() {
  const { profile } = useAuth()
  const resourceId  = profile?.resource_id
  const R = useResources()

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const range = useMemo(() => ({ start: toYMD(addDays(today, -14)), end: toYMD(addDays(today, 21)) }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const { assignments } = useCrewAssignments(range)
  const { availability } = useAvailability(range)
  const [events, setEvents] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase.from('schedule').select('id, date, resource_id, equipment_ids').gte('date', range.start).lte('date', range.end)
      .then(({ data }) => {
        if (cancelled || !Array.isArray(data)) return
        setEvents(data.map(r => ({ extendedProps: { resourceId: r.resource_id ?? 'unassigned', date: r.date, equipmentIds: r.equipment_ids ?? [] } })))
      })
    return () => { cancelled = true }
  }, [range])
  const crewFor = useDayCrew({ people: R.people, assignments, availability, userOf: R.userOf, equipment: R.equipment, events })
  const colors = useMemo(() => Object.fromEntries(R.rows.map(r => [r.id, r.color])), [R.rows])

  if (!resourceId) {
    return (
      <div style={cw.shell}>
        <div style={cw.body}>
          <div style={cw.empty}>No resource assigned — ask your manager to set up your account in Settings.</div>
        </div>
      </div>
    )
  }

  // Trucks get the same day-run view as quote runs — big stop list, navigate
  // arrows, work-order shortcut — locked to their own resource by default.
  return (
    <DayRunView
      initialDate={toYMD(today)}
      myResourceId={resourceId}
      resources={R.rows}
      resourceColors={colors}
      crewFor={crewFor}
      onBack={null}
    />
  )
}

const cw = {
  shell:  { display: 'flex', flexDirection: 'column', height: '100%', background: '#F5F3F0' },
  body:   { flex: 1, overflowY: 'auto', padding: '20px 24px' },
  empty:  { textAlign: 'center', color: '#bbb', fontSize: '14px', padding: '60px 0' },
}

// ── Main export — switches between full and crew views ─────────────────────
export default function Calendar() {
  // Office staff (e.g. Admin Officer) manage scheduling, so they get the full
  // calendar — same as full-access. Only crew (climbers/groundsmen), who have a
  // resource_id and just need their own day's jobs, get the restricted view.
  const { isStaff } = useAuth()
  if (!isStaff) return <CrewCalendar />
  return <FullCalendar_ />
}

// Which droppables a drag may land on: rows reorder among rows; everything
// else (people, equipment, tray jobs) lands on cells, headers or the strip,
// by pointer position first and overlap second.
function schedulerCollision(args) {
  const type = args.active?.data?.current?.type
  if (type === 'row') {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter(c => c.data?.current?.type === 'row') })
  }
  const targets = args.droppableContainers.filter(c => c.data?.current?.type !== 'row')
  const within = pointerWithin({ ...args, droppableContainers: targets })
  if (within.length) return within
  return rectIntersection({ ...args, droppableContainers: targets })
}

function FullCalendar_() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { profile } = useAuth()
  // Compact-width day-run mode (F26): the selected day rendered as a big
  // ordered stop list with one-tap navigation, instead of the calendar grid.
  const [dayRun, setDayRun] = useState(null) // YYYY-MM-DD | null
  const calRef   = useRef()
  const [unscheduled,       setUnscheduled]       = useState([])
  const [events,            setEvents]            = useState([])
  const [loading,           setLoading]           = useState(true)
  const [popover,           setPopover]           = useState(null)
  const [detailJob,         setDetailJob]         = useState(null)
  const [toast,             setToast]             = useState(null)
  const [dayAlert,          setDayAlert]          = useState(null)   // { ymd, recipients[] } | null
  const [alerting,          setAlerting]          = useState(false)
  const [trayWidth,         setTrayWidth]         = useState(250)
  const [traySearch,        setTraySearch]        = useState('')
  // Status filter: ready work + quote visits by default; the rest on demand.
  const [trayStatuses,      setTrayStatuses]      = useState(() => new Set(DEFAULT_TRAY_STATUSES))
  const [showStatusMenu,    setShowStatusMenu]    = useState(false)
  const statusMenuRef = useRef(null)
  const [showTracker,       setShowTracker]       = useState(false)
  const trayResizing        = useRef(false)
  const trayResizeStart     = useRef(null)
  const [viewTitle,         setViewTitle]         = useState('')
  const [activeView,        setActiveView]        = useState(isMobile ? 'listWeek' : 'resourceTimelineDay')
  const [weekStart,         setWeekStart]         = useState(() => weekMonday(new Date()))
  const [showFilter,        setShowFilter]        = useState(false)
  const [viewRange,         setViewRange]         = useState(() => { const t = toYMD(new Date()); return { start: t, end: t } })
  const [vehicles,          setVehicles]          = useState([])
  // /calendar?job=ID — pre-select that tray card (the record's "Schedule" button).
  const [highlightJobId,    setHighlightJobId]    = useState(() => new URLSearchParams(window.location.search).get('job'))
  const [crewPopover,       setCrewPopover]       = useState(null)   // { resourceId, dates, anchor }
  const [leaveModal,        setLeaveModal]        = useState(null)   // { initial }
  const [leaveDetail,       setLeaveDetail]       = useState(null)   // { user, block, anchor }
  // Equipment wanted on a truck-day that has no job yet: kept here until a
  // job lands and carries it on its schedule row. { 'navara:2026-09-07': ['avant'] }
  const [plannedEquip,      setPlannedEquip]      = useState({})
  const [activeDrag,        setActiveDrag]        = useState(null)

  // ── Resources, people, crew and leave ────────────────────────────────────
  const R = useResources()
  const [orderedResources,  setOrderedResources]  = useState(R.rows)
  const [visibleIds,        setVisibleIds]        = useState(() => new Set(R.rows.map(r => r.id)))
  const prevKnown = useRef(new Set(R.rows.map(r => r.id)))
  const plannedRef = useRef(plannedEquip)
  plannedRef.current = plannedEquip
  const highlightAnnounced = useRef(false)
  const openLeaveDetailRef = useRef(null)

  // Keep the ordered/visible lists in step with what loads (and with any lane
  // id still on old schedule rows that no longer has a resource of its own).
  useEffect(() => {
    const legacy = [...new Set(events.map(e => e.resourceId))]
      .filter(id => id && !R.rows.some(r => r.id === id))
      .map(id => ({ id, title: id, name: id, kind: 'legacy', color: '#97A0AB', note: 'old lane' }))
    const wanted = [...R.rows.filter(r => r.id !== 'unassigned'), ...legacy, R.rows.find(r => r.id === 'unassigned')].filter(Boolean)
    setOrderedResources(prev => {
      const kept = prev.filter(p => wanted.some(w => w.id === p.id)).map(p => wanted.find(w => w.id === p.id))
      const added = wanted.filter(w => !kept.some(k => k.id === w.id))
      const next = [...kept, ...added]
      // Unassigned always sits last.
      const un = next.find(r => r.id === 'unassigned')
      return un ? [...next.filter(r => r.id !== 'unassigned'), un] : next
    })
    setVisibleIds(prev => {
      const next = new Set(prev)
      wanted.forEach(w => { if (!prev.has(w.id) && !prevKnown.current.has(w.id)) next.add(w.id) })
      wanted.forEach(w => prevKnown.current.add(w.id))
      return next
    })
  }, [R.rows, events])

  const activeResources = orderedResources.filter(r => visibleIds.has(r.id))

  // Dates the board is showing (week grid: Mon–Fri; day: that day; list: its weekdays).
  const visibleDates = useMemo(() => {
    if (activeView === 'week') return Array.from({ length: 5 }, (_, i) => toYMD(addDays(weekStart, i)))
    const out = []
    let d = fromYMD(viewRange.start)
    const end = fromYMD(viewRange.end)
    while (d <= end && out.length < 7) { if (d.getDay() !== 0 && d.getDay() !== 6) out.push(toYMD(d)); d = addDays(d, 1) }
    return out.length ? out : [viewRange.start]
  }, [activeView, weekStart, viewRange])

  // Load crew + leave for a window around what's visible so paging is instant.
  const crewRange = useMemo(() => {
    const a = fromYMD(visibleDates[0]), b = fromYMD(visibleDates[visibleDates.length - 1])
    const lo = weekStart < a ? weekStart : a
    const hi = addDays(weekStart, 4) > b ? addDays(weekStart, 4) : b
    return { start: toYMD(addDays(lo, -7)), end: toYMD(addDays(hi, 21)) }
  }, [visibleDates, weekStart])
  const { assignments, assign, unassign } = useCrewAssignments(crewRange)
  const { availability, addLeave, removeLeave, blockFor } = useAvailability(crewRange)

  const crewCtx = useMemo(() => ({ people: R.people, assignments, availability, userOf: R.userOf }), [R.people, assignments, availability, R.userOf])
  const crewCtxRef = useRef(crewCtx)
  crewCtxRef.current = crewCtx
  const crewCache = useMemo(() => new Map(), [crewCtx]) // eslint-disable-line react-hooks/exhaustive-deps
  const crewFor = useCallback((resourceId, date) => {
    const key = `${resourceId}|${date}`
    if (!crewCache.has(key)) crewCache.set(key, resolveCrew(resourceId, date, crewCtx))
    return crewCache.get(key)
  }, [crewCache, crewCtx])
  const crewNames = useCallback((resourceId, date) => crewFor(resourceId, date).filter(c => !c.away).map(shortName), [crewFor])

  // The row that carries the Avant / grinder: the Navara when it exists.
  const equipHomeId = useMemo(() => (R.trucks.find(r => r.id === 'navara') ?? R.trucks.find(r => /avant|grinder/i.test(r.note ?? '')) ?? R.trucks[R.trucks.length - 1])?.id ?? null, [R.trucks])
  const eventsRef = useRef(events)
  eventsRef.current = events
  const equipFor = useCallback((resourceId, date) => {
    const ids = new Set(plannedEquip[`${resourceId}:${date}`] ?? [])
    events.forEach(ev => {
      if (ev.extendedProps?.resourceId === resourceId && ev.extendedProps?.date === date) {
        (ev.extendedProps.equipmentIds ?? []).forEach(id => ids.add(id))
      }
    })
    return R.equipment.filter(e => ids.has(e.id))
  }, [plannedEquip, events, R.equipment])

  const dayCrew = useDayCrew({ people: R.people, assignments, availability, userOf: R.userOf, equipment: R.equipment, events })
  const resourceColors = useMemo(() => Object.fromEntries(orderedResources.map(r => [r.id, r.color])), [orderedResources])

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

  // Close the status dropdown on an outside click, same as the pipeline filter.
  useEffect(() => {
    if (!showStatusMenu) return
    function handler(e) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target)) setShowStatusMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showStatusMenu])

  // The status filter may be emptied entirely — an empty selection reads as
  // "show nothing", and the tray says so.
  function toggleTrayStatus(key) {
    setTrayStatuses(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ── Manually text every client scheduled on the shown day ────────────────
  function openDayAlert() {
    const d = activeView === 'week' ? fromYMD(visibleDates[0]) : (api()?.getDate?.() ?? new Date())
    const ymd = toYMD(d)
    const seen = new Set()
    const recipients = []
    events.filter(e => e.extendedProps?.date === ymd).forEach(e => {
      const c = e.extendedProps?.job?.clients
      if (c?.phone && !seen.has(c.phone)) {
        seen.add(c.phone)
        recipients.push({ name: c.name, phone: c.phone, job_id: e.extendedProps?.job?.id })
      }
    })
    if (recipients.length === 0) { showToast('No clients with a mobile scheduled that day', true); return }
    setDayAlert({ ymd, recipients })
  }

  async function sendDayAlerts() {
    setAlerting(true)
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
    const dateLabel = new Date(dayAlert.ymd + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })
    let ok = 0, fail = 0, notConfigured = false
    for (const r of dayAlert.recipients) {
      const first = (r.name || 'there').split(' ')[0]
      const message = `Hi ${first}, Urban Tree Services here - our crew is scheduled for your tree work on ${dateLabel}. We'll be in touch with timing. Any questions call 027 203 1446.`
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
          body: JSON.stringify({ to: r.phone, message, job_id: r.job_id, kind: 'job_reminder' }),
        })
        const b = await res.json()
        if (res.ok) ok++; else { fail++; if (b.notConfigured) notConfigured = true }
      } catch { fail++ }
    }
    setAlerting(false); setDayAlert(null)
    if (notConfigured) showToast('SMS not live yet — Twilio needs your account upgrade', true)
    else showToast(`Texted ${ok} client${ok === 1 ? '' : 's'}${fail ? `, ${fail} failed` : ''} ✓`)
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
        // Fetch every tray status so the status filter has data to filter on;
        // scheduled ones are dropped below once they have a schedule row.
        .select('*, clients(name, phone, email), quotes(id, status, total, subtotal, created_at, job_pack)')
        .in('status', TRAY_STATUSES)
        .order('created_at', { ascending: true }),
      supabase
        .from('schedule')
        .select('*, jobs(id, title, status, job_type, address, lat, lng, ko_reference, sla_due_at, description, category, clients(name, phone), quotes(id, status, total, subtotal, created_at, job_pack))')
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
        extendedProps: {
          job, scheduleId: row.id, resourceId: rid, vehicleReg: row.vehicle_reg ?? null, date: row.date,
          startTime: row.start_time ?? null,
          assignedTo: Array.isArray(row.assigned_to) ? row.assigned_to : [],
          equipmentIds: Array.isArray(row.equipment_ids) ? row.equipment_ids : [],
        },
      }
    }))

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ?job=ID: make sure the card is visible (its status may be filtered out),
  // or if it's already on the calendar, jump to its day.
  useEffect(() => {
    if (loading || !highlightJobId || highlightAnnounced.current) return
    highlightAnnounced.current = true
    const inTray = unscheduled.find(j => j.id === highlightJobId)
    if (inTray) {
      setTrayStatuses(prev => prev.has(inTray.status) ? prev : new Set([...prev, inTray.status]))
      showToast(`${jobHeading(inTray).primary} — drag it onto a truck-day`)
    } else {
      const ev = events.find(e => e.extendedProps?.job?.id === highlightJobId)
      if (ev) {
        showToast(`Already scheduled · ${dayLong(ev.extendedProps.date)}`)
        setWeekStart(weekMonday(fromYMD(ev.extendedProps.date)))
        api()?.gotoDate(ev.extendedProps.date)
      }
      setHighlightJobId(null)
    }
    // Strip the param so a refresh doesn't re-select.
    if (window.location.search.includes('job=')) window.history.replaceState({}, '', window.location.pathname)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live vehicle positions — poll cartrack-positions every 45s. Fail silently.
  useEffect(() => {
    let cancelled = false
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

    async function fetchVehicles() {
      if (!SUPABASE_URL) return
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/cartrack-positions`, {
          headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        })
        const data = await res.json()
        if (cancelled) return
        if (data?.error || !Array.isArray(data?.vehicles)) { setVehicles([]); return }
        setVehicles(data.vehicles)
      } catch {
        if (!cancelled) setVehicles([])
      }
    }

    fetchVehicles()
    const interval = setInterval(fetchVehicles, 45_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const vehicleByReg = (reg) => vehicles.find(v => v.registration === reg) ?? null

  async function linkVehicle(scheduleId, reg) {
    setEvents(prev => prev.map(e =>
      e.extendedProps?.scheduleId === scheduleId
        ? { ...e, extendedProps: { ...e.extendedProps, vehicleReg: reg || null } }
        : e
    ))
    const { error } = await supabase.from('schedule')
      .update({ vehicle_reg: reg || null })
      .eq('id', scheduleId)
    if (error) showToast(error.message, true)
    else showToast(reg ? 'Truck linked' : 'Truck unlinked')
  }

  // Scheduled-today jobs that have a linked, geocoded truck — for the crew strip.
  const todayYMD = toYMD(new Date())
  const todaysCrews = events.filter(ev => {
    const p = ev.extendedProps
    return p?.date === todayYMD && p?.vehicleReg && p?.job?.lat != null && p?.job?.lng != null
  })

  const handleDatesSet = (arg) => {
    setViewTitle(arg.view.title)
    // arg.end is exclusive — step back one day for an inclusive end date.
    setViewRange({ start: toYMD(arg.start), end: toYMD(addDays(arg.end, -1)) })
  }

  // ── Per-crew totals (ex GST) for the day/range currently in view ───────────
  const totalsScope = activeView === 'week'
    ? { start: toYMD(weekStart), end: toYMD(addDays(weekStart, 4)) }
    : viewRange
  const totalsSingleDay = totalsScope.start === totalsScope.end
  const crewTotals = activeResources.map(r => ({
    id: r.id,
    title: r.title,
    color: r.color,
    total: events.reduce((sum, ev) => {
      const p = ev.extendedProps
      const d = p?.date
      const inRange = d && d >= totalsScope.start && d <= totalsScope.end
      return inRange && (p?.resourceId ?? 'unassigned') === r.id ? sum + jobExGst(p.job) : sum
    }, 0),
  }))
  const grandTotal = crewTotals.reduce((s, c) => s + c.total, 0)
  const totalsLabel = totalsSingleDay
    ? new Date(totalsScope.start + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })
    : 'this week'

  // ── Writes: schedule rows carry who and what is on the truck that day ─────
  // Insert with assigned_to + equipment_ids; if the database predates those
  // columns, retry without them so scheduling never breaks on an old schema.
  async function insertScheduleRow(row) {
    let { error } = await supabase.from('schedule').insert(row)
    if (error && /equipment_ids|assigned_to/.test(error.message ?? '')) {
      const { equipment_ids, assigned_to, ...bare } = row
      ;({ error } = await supabase.from('schedule').insert(bare))
    }
    return error
  }
  async function updateScheduleRow(id, patch) {
    let { error } = await supabase.from('schedule').update(patch).eq('id', id)
    if (error && /equipment_ids|assigned_to/.test(error.message ?? '')) {
      const { equipment_ids, assigned_to, ...bare } = patch
      if (Object.keys(bare).length) ({ error } = await supabase.from('schedule').update(bare).eq('id', id))
      else error = null
    }
    return error
  }

  // Put a job on a truck-day: times from the crew pack's estimate, the crew
  // from who's on the truck that day, the equipment from the day's chips plus
  // what the pack asks for. Status moves on by itself.
  const scheduleJob = useCallback(async (job, resourceId, date, startTime) => {
    const durH = parseDurationHours(primaryQuote(job)?.job_pack?.time_required)
    const endTime = addHours(startTime, durH)
    const ctx = crewCtxRef.current
    const assigned = resourceId === 'unassigned' ? [] : crewIds(resourceId, date, ctx)
    const res = orderedRef.current.find(r => r.id === resourceId)
    const equip = res?.kind === 'truck'
      ? [...new Set([
          ...(plannedRef.current[`${resourceId}:${date}`] ?? []),
          ...eventsRef.current.filter(ev => ev.extendedProps?.resourceId === resourceId && ev.extendedProps?.date === date).flatMap(ev => ev.extendedProps.equipmentIds ?? []),
          ...jobEquipment(job),
        ])]
      : []

    const error = await insertScheduleRow({
      job_id: job.id, date, start_time: startTime, end_time: endTime, resource_id: resourceId, status: 'scheduled',
      assigned_to: assigned,
      ...(equip.length ? { equipment_ids: equip } : {}),
    })
    if (error) { showToast(error.message, true); return false }
    // Dropping a new lead books a quote visit; an accepted job books the work.
    const newStatus = job.status === 'new_lead' ? 'quote_scheduled' : 'scheduled'
    await supabase.from('jobs')
      .update({ status: newStatus, status_changed_at: new Date().toISOString() })
      .eq('id', job.id)

    // The planned chips now live on the row.
    setPlannedEquip(prev => { const next = { ...prev }; delete next[`${resourceId}:${date}`]; return next })
    const names = resolveCrew(resourceId, date, ctx).filter(c => !c.away).map(shortName)
    const need = staffNeed(job)
    const short = need && names.length < need ? ` · needs ${need}, only ${names.length}` : ''
    showToast(`${res?.title ?? resourceId} · ${dayLong(date)}${durH ? ` · ${durH}h` : ''}${names.length ? ` · ${names.join(' + ')}` : ''}${short}`, !!short)
    setHighlightJobId(h => (h === job.id ? null : h))
    load()
    return true
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback(async (info) => {
    const job = info.draggedEl._fcDraggable?.settings?.eventData?.extendedProps?.job
    if (!job) return
    const resourceId = info.resource?.id ?? 'unassigned'
    const date = info.dateStr.slice(0, 10)
    const hasTime = info.dateStr.length > 10
    const startTime = hasTime ? info.dateStr.slice(11, 19) : null
    await scheduleJob(job, resourceId, date, startTime)
  }, [scheduleJob])

  const handleEventDrop = useCallback(async (info) => {
    const { scheduleId, leave } = info.event.extendedProps
    if (leave) { info.revert(); return }
    const newDate    = info.event.startStr.slice(0, 10)
    const hasTime    = info.event.startStr.length > 10
    const startTime  = hasTime ? info.event.startStr.slice(11, 19) : null
    const endTime    = info.event.endStr?.length > 10 ? info.event.endStr.slice(11, 19) : null
    const resourceId = info.newResource?.id ?? info.event.getResources()[0]?.id ?? 'unassigned'
    const assigned   = resourceId === 'unassigned' ? [] : crewIds(resourceId, newDate, crewCtxRef.current)

    const error = await updateScheduleRow(scheduleId, { date: newDate, start_time: startTime, end_time: endTime, resource_id: resourceId, assigned_to: assigned })

    if (error) { info.revert(); showToast(error.message, true) }
    else {
      setEvents(prev => prev.map(e => e.extendedProps?.scheduleId === scheduleId
        ? { ...e, start: startTime ? `${newDate}T${startTime}` : newDate, end: endTime ? `${newDate}T${endTime}` : undefined, allDay: !startTime, resourceId,
            extendedProps: { ...e.extendedProps, date: newDate, resourceId, startTime, assignedTo: assigned } }
        : e))
      showToast('Rescheduled')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEventResize = useCallback(async (info) => {
    const { scheduleId, leave } = info.event.extendedProps
    if (leave) { info.revert(); return }
    const endTime = info.event.endStr?.length > 10 ? info.event.endStr.slice(11, 19) : null
    const { error } = await supabase.from('schedule')
      .update({ end_time: endTime })
      .eq('id', scheduleId)
    if (error) { info.revert(); showToast(error.message, true) }
  }, [])

  const handleEventClick = useCallback((info) => {
    info.jsEvent.preventDefault()
    if (info.event.extendedProps?.leave) return
    setPopover({ info })
  }, [])

  function openJob(job) {
    setPopover(null)
    navigate(`/pipeline?job=${job.id}`)
  }

  async function unscheduleJob(job) {
    setPopover(null)
    await Promise.all([
      supabase.from('schedule').delete().eq('job_id', job.id),
      supabase.from('jobs').update({ status: 'accepted_to_schedule', status_changed_at: new Date().toISOString() }).eq('id', job.id),
    ])
    showToast('Moved back to tray')
    load()
  }

  // ── Crew changes → schedule.assigned_to on that day's rows ───────────────
  // Only the rows on the dates touched are rewritten (the DB logs every
  // schedule update as activity, so no blanket repairs).
  async function syncAssignedTo(dates, ctxOverride = {}) {
    const ctx = { ...crewCtxRef.current, ...ctxOverride }
    const touched = eventsRef.current.filter(ev => dates.includes(ev.extendedProps?.date) && ev.extendedProps?.resourceId && ev.extendedProps.resourceId !== 'unassigned')
    const changes = []
    touched.forEach(ev => {
      const ids = crewIds(ev.extendedProps.resourceId, ev.extendedProps.date, ctx)
      if (!sameIds(ids, ev.extendedProps.assignedTo)) changes.push({ id: ev.extendedProps.scheduleId, ids })
    })
    if (!changes.length) return
    setEvents(prev => prev.map(e => {
      const c = changes.find(x => x.id === e.extendedProps?.scheduleId)
      return c ? { ...e, extendedProps: { ...e.extendedProps, assignedTo: c.ids } } : e
    }))
    const errors = await Promise.all(changes.map(c => updateScheduleRow(c.id, { assigned_to: c.ids })))
    const err = errors.find(Boolean)
    if (err) showToast(err.message, true)
  }

  async function putPerson(userId, resourceId, dates) {
    if (!resourceId || resourceId === 'unassigned' || !dates.length) return
    const user = R.userOf(userId)
    const res = orderedResources.find(r => r.id === resourceId)
    // Back on their usual truck = just drop any override those days.
    const { assignments: next, error } = user.resource_id === resourceId
      ? await unassign(userId, dates)
      : await assign(userId, resourceId, dates)
    if (error) { showToast(error.message, true); return }
    await syncAssignedTo(dates, { assignments: next })
    showToast(`${shortName(user)} on the ${res?.title ?? resourceId} · ${rangeLabel(dates)}`)
  }

  async function takeOffPerson(userId, dates) {
    const user = R.userOf(userId)
    const hadOverride = assignments.some(a => a.user_id === userId && dates.includes(a.date))
    if (!hadOverride) {
      if (user.resource_id) showToast(`${shortName(user)} is on the ${R.titleOf(user.resource_id)} by default — mark them away to take them off`, true)
      return
    }
    const { assignments: next, error } = await unassign(userId, dates)
    if (error) { showToast(error.message, true); return }
    await syncAssignedTo(dates, { assignments: next })
    showToast(`${shortName(user)} back on the ${user.resource_id ? R.titleOf(user.resource_id) : 'office'} · ${rangeLabel(dates)}`)
  }

  // Put the Avant / grinder on a truck for the given dates: written onto every
  // schedule row of that truck-day, or held as a plan until a job lands.
  async function putEquip(resourceId, dates, equipId) {
    const res = orderedResources.find(r => r.id === resourceId)
    if (res?.kind !== 'truck') { showToast('Equipment rides on a truck', true); return }
    const eq = R.equipment.find(e => e.id === equipId)
    let warned = false
    for (const date of dates) {
      const rows = events.filter(ev => ev.extendedProps?.resourceId === resourceId && ev.extendedProps?.date === date)
      if (rows.length) {
        const patches = rows.filter(ev => !(ev.extendedProps.equipmentIds ?? []).includes(equipId))
          .map(ev => ({ id: ev.extendedProps.scheduleId, ids: [...(ev.extendedProps.equipmentIds ?? []), equipId] }))
        setEvents(prev => prev.map(e => { const p = patches.find(x => x.id === e.extendedProps?.scheduleId); return p ? { ...e, extendedProps: { ...e.extendedProps, equipmentIds: p.ids } } : e }))
        const errs = await Promise.all(patches.map(p => updateScheduleRow(p.id, { equipment_ids: p.ids })))
        const err = errs.find(Boolean)
        if (err) { showToast(err.message, true); return }
      } else {
        setPlannedEquip(prev => ({ ...prev, [`${resourceId}:${date}`]: [...new Set([...(prev[`${resourceId}:${date}`] ?? []), equipId])] }))
      }
      const both = new Set([...(plannedEquip[`${resourceId}:${date}`] ?? []), ...rows.flatMap(ev => ev.extendedProps.equipmentIds ?? []), equipId])
      if (both.has('avant') && both.has('grinder')) warned = true
    }
    showToast(warned ? `${eq?.name ?? equipId} on the ${res.title} · ${rangeLabel(dates)} — Avant and grinder both wanted` : `${eq?.name ?? equipId} on the ${res.title} · ${rangeLabel(dates)}`, warned)
  }

  async function removeEquip(resourceId, date, equipId) {
    const rows = events.filter(ev => ev.extendedProps?.resourceId === resourceId && ev.extendedProps?.date === date && (ev.extendedProps.equipmentIds ?? []).includes(equipId))
    setPlannedEquip(prev => { const next = { ...prev }; next[`${resourceId}:${date}`] = (prev[`${resourceId}:${date}`] ?? []).filter(id => id !== equipId); return next })
    if (rows.length) {
      const patches = rows.map(ev => ({ id: ev.extendedProps.scheduleId, ids: (ev.extendedProps.equipmentIds ?? []).filter(id => id !== equipId) }))
      setEvents(prev => prev.map(e => { const p = patches.find(x => x.id === e.extendedProps?.scheduleId); return p ? { ...e, extendedProps: { ...e.extendedProps, equipmentIds: p.ids } } : e }))
      const errs = await Promise.all(patches.map(p => updateScheduleRow(p.id, { equipment_ids: p.ids })))
      const err = errs.find(Boolean)
      if (err) { showToast(err.message, true); return }
    }
    showToast(`${R.equipment.find(e => e.id === equipId)?.name ?? equipId} off the ${R.titleOf(resourceId)} · ${dayShort(date)}`)
  }

  // ── Leave ────────────────────────────────────────────────────────────────
  async function saveLeave(form) {
    const res = await addLeave(form)
    if (res.error) return res
    await syncAssignedTo(res.dates, { availability: res.availability })
    showToast(`${shortName(R.userOf(form.userId))} · ${kindLabel(form.kind)} · ${res.dates.length} day${res.dates.length === 1 ? '' : 's'}`)
    return res
  }
  async function deleteLeave(userId, dates) {
    const res = await removeLeave(userId, dates)
    if (res.error) { showToast(res.error.message, true); return }
    await syncAssignedTo(dates, { availability: res.availability })
    showToast('Leave removed')
  }
  function openLeaveDetail(user, date, anchor) {
    const dates = blockFor(user.id, date)
    const row = availability.find(a => a.user_id === user.id && a.date === date)
    setLeaveDetail({ user, block: { dates: dates.length ? dates : [date], kind: row?.kind, note: row?.note }, anchor })
  }
  // A person chip: away → their leave block; otherwise offer leave for them.
  function onPersonClick(user, e) {
    const anchor = e?.currentTarget?.getBoundingClientRect?.()
    const awayDate = visibleDates.find(d => availability.some(a => a.user_id === user.id && a.date === d))
    if (awayDate) openLeaveDetail(user, awayDate, anchor)
    else setLeaveModal({ initial: { userId: user.id, start: visibleDates[0] } })
  }
  function onEquipClick(eq) {
    showToast(`Drag the ${eq.name} onto a truck-day`)
  }

  // ── Crew popover (tap path) ──────────────────────────────────────────────
  function openCrewPopover(res, anchor) {
    setCrewPopover({ resourceId: res.id, dates: [...visibleDates], anchor })
  }
  async function popoverToggle(userId, on, dates) {
    if (on) await putPerson(userId, crewPopover.resourceId, dates)
    else await takeOffPerson(userId, dates)
  }

  // ── Warnings + drop hint per truck-day ───────────────────────────────────
  function warningsFor(res, date, cellEvents) {
    const out = []
    if (res.kind !== 'truck' && res.kind !== 'person') return out
    const equip = res.kind === 'truck' ? equipFor(res.id, date).map(e => e.id) : []
    if (equip.includes('avant') && equip.includes('grinder')) out.push('Avant and grinder both wanted')
    const have = crewFor(res.id, date).filter(c => !c.away).length
    cellEvents.forEach(ev => {
      const need = staffNeed(ev.extendedProps?.job)
      if (need && have < need) out.push(`${jobHeading(ev.extendedProps.job).primary} needs ${need} · ${have} on the ${res.title}`)
    })
    return out
  }
  function dropHint(drag, res, date) {
    if (drag.type === 'job') {
      if (res.id === 'unassigned') return { text: 'Unassigned · no crew' }
      const names = crewNames(res.id, date)
      const need = staffNeed(drag.job)
      if (!names.length) return { text: `Nobody on the ${res.title} ${dayShort(date)}`, warn: true }
      if (need && names.length < need) return { text: `${names.join(' + ')} · needs ${need}`, warn: true }
      return { text: `${names.join(' + ')} free · fits` }
    }
    if (drag.type === 'person') {
      const user = R.userOf(drag.userId)
      const away = availability.find(a => a.user_id === drag.userId && a.date === date)
      if (away) return { text: `${shortName(user)} is ${kindLabel(away.kind)} ${dayShort(date)}`, warn: true }
      return { text: `${shortName(user)} on the ${res.title} · ${dayShort(date)}` }
    }
    if (drag.type === 'equip') {
      const eq = R.equipment.find(e => e.id === drag.equipId)
      if (res.kind !== 'truck') return { text: 'Equipment rides on a truck', warn: true }
      const other = equipFor(res.id, date).some(e => e.id !== drag.equipId)
      return { text: `${eq?.name} on the ${res.title} · ${dayShort(date)}${other ? ' · both wanted' : ''}`, warn: other }
    }
    return null
  }

  // ── One drag context for chips, tray cards and row reorder ───────────────
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )
  function onDragStart(e) { setActiveDrag(e.active.data.current ?? null) }
  function onDragCancel() { setActiveDrag(null) }
  async function onDragEnd(e) {
    setActiveDrag(null)
    const a = e.active?.data?.current
    const o = e.over?.data?.current
    if (!a) return
    if (a.type === 'row') {
      if (o?.type === 'row' && a.resourceId !== o.resourceId) {
        const from = activeResources.findIndex(r => r.id === a.resourceId)
        const to   = activeResources.findIndex(r => r.id === o.resourceId)
        if (from !== -1 && to !== -1) reorderVisible(arrayMove(activeResources, from, to))
      }
      return
    }
    if (!o) return
    const targetDates = o.type === 'cell' ? [o.date] : visibleDates
    if (a.type === 'person') {
      if (o.type === 'cell' || o.type === 'hdr') await putPerson(a.userId, o.resourceId, targetDates)
      else if (o.type === 'people' && a.fromResource) await takeOffPerson(a.userId, a.fromDate ? [a.fromDate] : visibleDates)
    } else if (a.type === 'equip') {
      if (o.type === 'cell' || o.type === 'hdr') {
        if (a.fromDate && a.fromResource && !(o.type === 'cell' && o.resourceId === a.fromResource && o.date === a.fromDate)) await removeEquip(a.fromResource, a.fromDate, a.equipId)
        await putEquip(o.resourceId, targetDates, a.equipId)
      } else if (o.type === 'people' && a.fromDate) await removeEquip(a.fromResource, a.fromDate, a.equipId)
    } else if (a.type === 'job') {
      if (o.type === 'cell') await scheduleJob(a.job, o.resourceId, o.date, '07:30:00')
      else if (o.type === 'hdr') showToast('Drop it on a day', true)
    }
  }
  // Reorder the visible rows, keeping hidden ones where they were.
  function reorderVisible(reordered) {
    setOrderedResources(prev => {
      const hiddenInOrder = prev.filter(r => !visibleIds.has(r.id))
      const result = [...reordered]
      hiddenInOrder.forEach(h => {
        const oldIdx = prev.findIndex(r => r.id === h.id)
        result.splice(Math.min(oldIdx, result.length), 0, h)
      })
      return result
    })
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
  // How many unscheduled jobs sit in each status — drives the filter counts.
  const statusCounts = unscheduled.reduce((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1
    return acc
  }, {})
  // Every status is always offered (empty ones stay visible but show 0), so the
  // control never renders as a bare "Status" heading with nothing under it.
  const availableStatuses = TRAY_STATUSES
  const allStatusesOn = TRAY_STATUSES.every(k => trayStatuses.has(k))
  const defaultStatusesOn = trayStatuses.size === DEFAULT_TRAY_STATUSES.length && DEFAULT_TRAY_STATUSES.every(k => trayStatuses.has(k))
  const sideList = unscheduled.filter(j => trayStatuses.has(j.status))
  const filteredUnscheduled = trayQ
    ? sideList.filter(j =>
        [j.title, j.clients?.name, j.address, j.job_type]
          .some(v => v?.toLowerCase().includes(trayQ))
      )
    : sideList
  const trayWork = filteredUnscheduled.filter(j => !VISIT_STATUSES.has(j.status))
  const trayVisits = filteredUnscheduled.filter(j => VISIT_STATUSES.has(j.status))

  const VIEWS = [
    { v: 'resourceTimelineDay', label: 'Day' },
    { v: 'week',                label: 'Week' },
    { v: 'listWeek',            label: 'List' },
  ]

  // Leave as hatched background blocks on the day timeline, in the row the
  // person is on that day.
  const leaveEvents = useMemo(() => {
    if (activeView === 'week') return []
    const out = []
    visibleDates.forEach(date => {
      activeResources.forEach(res => {
        if (res.kind !== 'truck' && res.kind !== 'person') return
        crewFor(res.id, date).filter(c => c.away).forEach(c => {
          out.push({
            id: `leave:${res.id}:${date}:${c.id}`,
            resourceId: res.id,
            start: `${date}T06:00:00`, end: `${date}T19:00:00`,
            display: 'background', classNames: ['tc-leave'],
            title: `${shortName(c)} · ${kindLabel(c.away.kind)}`,
            extendedProps: { leave: true, userId: c.id, date },
          })
        })
      })
    })
    return out
  }, [activeView, visibleDates, activeResources, crewFor])
  const fcEvents = useMemo(() => [...events, ...leaveEvents], [events, leaveEvents])
  const fcResources = useMemo(() => activeResources.map((r, i) => ({ id: r.id, title: r.title, index: i })), [activeResources])

  openLeaveDetailRef.current = (userId, date, rect) => openLeaveDetail(R.userOf(userId), date, rect)
  const handleEventDidMount = useCallback((info) => {
    const p = info.event.extendedProps
    if (!p?.leave) return
    info.el.style.cursor = 'pointer'
    info.el.addEventListener('click', (e) => {
      openLeaveDetailRef.current?.(p.userId, p.date, info.el.getBoundingClientRect())
      e.stopPropagation()
    })
  }, [])

  // People strip items: everyone, with their away state over the visible dates.
  const peopleItems = R.people.map(u => {
    const awayDates = visibleDates.filter(d => availability.some(a => a.user_id === u.id && a.date === d))
    const kind = awayDates.length ? availability.find(a => a.user_id === u.id && a.date === awayDates[0])?.kind : null
    const all = awayDates.length > 0 && awayDates.length === visibleDates.length
    const partial = awayDates.length > 0 && !all
    const office = !u.resource_id
    const label = `${shortName(u)}${awayDates.length ? ` · ${kindLabel(kind)}${partial && visibleDates.length > 1 ? ` ${rangeLabel(awayDates)}` : ''}` : ''}${office ? ' · office' : ''}`
    return { user: u, away: all ? { kind } : null, partial, label }
  })

  const crewLabel = (ext) => {
    if (!ext?.resourceId || ext.resourceId === 'unassigned') return null
    const names = crewNames(ext.resourceId, ext.date)
    const equip = (ext.equipmentIds ?? []).map(id => R.equipment.find(e => e.id === id)?.name ?? id)
    return [...names, ...equip].join(' + ') || null
  }

  const schedulerCtx = {
    rows: orderedResources, visibleDates, crewFor, equipFor, equipment: R.equipment, equipHomeId, warningsFor, dropHint,
    openCrewPopover, openLeaveDetail, onPersonClick, onEquipClick, removeEquip, activeDrag,
  }

  // F26: compact-width day-run mode — the selected day as a big ordered stop
  // list with one-tap navigation, replacing the calendar grid until Back.
  if (isMobile && dayRun) {
    return (
      <DayRunView
        initialDate={dayRun}
        myResourceId={profile?.resource_id}
        resources={orderedResources}
        resourceColors={resourceColors}
        crewFor={dayCrew}
        onBack={() => setDayRun(null)}
      />
    )
  }

  return (
    <SchedulerCtx.Provider value={schedulerCtx}>
    <DndContext sensors={sensors} collisionDetection={schedulerCollision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
    <div style={{ ...s.shell, flexDirection: isMobile ? 'column' : 'row' }}>

      {/* ── Tray (hidden on mobile) ── */}
      {!isMobile && <div style={{ ...s.tray, width: trayWidth, minWidth: 180, maxWidth: 500, position: 'relative' }}>
        <div style={s.trayTop}>
          {/* Status filter — dropdown, matching the pipeline's filter menu */}
          <div style={s.trayFilter} ref={statusMenuRef}>
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              style={{ ...s.statusBtn, ...(showStatusMenu ? s.statusBtnOpen : {}) }}
            >
              <span style={s.statusBtnLabel}>
                {allStatusesOn
                  ? 'All statuses'
                  : defaultStatusesOn
                    ? 'Ready work + quote visits'
                  : trayStatuses.size === 0
                    ? 'No statuses'
                    : `${trayStatuses.size} of ${availableStatuses.length} statuses`}
              </span>
              <span style={s.statusBtnCaret}>{showStatusMenu ? '▲' : '▼'}</span>
            </button>

            {showStatusMenu && (
              <div style={s.statusMenu}>
                <div style={s.statusMenuHead}>
                  <span style={s.statusMenuTitle}>Status</span>
                  <span style={{ display: 'flex', gap: 10 }}>
                    {!defaultStatusesOn && (
                      <button onClick={() => setTrayStatuses(new Set(DEFAULT_TRAY_STATUSES))} style={s.statusMenuReset}>
                        Default
                      </button>
                    )}
                    {!allStatusesOn && (
                      <button onClick={() => setTrayStatuses(new Set(TRAY_STATUSES))} style={s.statusMenuReset}>
                        Select all
                      </button>
                    )}
                  </span>
                </div>
                {availableStatuses.map(key => {
                  const on = trayStatuses.has(key)
                  const count = statusCounts[key] ?? 0
                  const color = JOB_STATUSES[key]?.color ?? '#7C93A8'
                  return (
                    <label key={key} style={s.statusItem} title={JOB_STATUSES[key]?.description ?? ''}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleTrayStatus(key)}
                        style={{ display: 'none' }}
                      />
                      <span style={{ ...s.statusCheck, background: on ? color : '#fff', borderColor: on ? color : '#ddd' }}>
                        {on && (
                          <svg viewBox="0 0 12 10" width="10" height="10" fill="none">
                            <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span style={{ ...s.statusDot, background: color }} />
                      <span style={s.statusLabel}>{getStatusLabel(key)}</span>
                      <span style={{ ...s.statusCount, color, background: color + '20' }}>{count}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Search */}
          <div style={s.traySearchWrap}>
            <input
              placeholder="Search jobs…"
              value={traySearch}
              onChange={e => setTraySearch(e.target.value)}
              style={s.traySearchInput}
              aria-label="Search unscheduled jobs"
            />
            {traySearch && (
              <button onClick={() => setTraySearch('')} style={s.traySearchClear} aria-label="Clear search">✕</button>
            )}
          </div>

          <div style={s.trayList}>
            {loading && <div style={s.empty}>Loading…</div>}
            {!loading && filteredUnscheduled.length === 0 && (
              <div style={s.empty}>
                {trayQ ? 'No matches'
                  : trayStatuses.size === 0 ? 'No statuses selected'
                  : 'Nothing waiting for a truck-day'}
              </div>
            )}
            {trayWork.length > 0 && (
              <>
                <div style={s.traySection}>
                  <span style={{ ...s.traySectionTitle, color: JOB_STATUSES.accepted_to_schedule.color }}>Ready to schedule · {trayWork.length}</span>
                  <span style={s.traySectionSub}>Accepted, waiting for a truck-day</span>
                </div>
                {trayWork.map(j => <TrayCard key={j.id} job={j} onOpen={setDetailJob} dndMode={activeView === 'week' ? 'kit' : 'fc'} highlighted={j.id === highlightJobId} />)}
              </>
            )}
            {trayVisits.length > 0 && (
              <>
                <div style={s.traySection}>
                  <span style={{ ...s.traySectionTitle, color: JOB_STATUSES.quote_scheduled.color }}>Quote visits to place · {trayVisits.length}</span>
                  <span style={s.traySectionSub}>Drop on Josh's row for a run</span>
                </div>
                {trayVisits.map(j => <TrayCard key={j.id} job={j} onOpen={setDetailJob} dndMode={activeView === 'week' ? 'kit' : 'fc'} highlighted={j.id === highlightJobId} />)}
              </>
            )}
          </div>
        </div>

        {/* Legend */}
        <div style={s.legend}>
          {orderedResources.map(r => (
            <div key={r.id} style={{ ...s.legendRow, opacity: visibleIds.has(r.id) ? 1 : 0.35 }}>
              <div style={{ ...s.legendDot, background: r.color }} />
              <span style={s.legendName}>{r.title}</span>
              {r.note && <span style={s.legendNote}>{r.note}</span>}
            </div>
          ))}
          <div style={s.legendFoot}>Only accepted work and booked visits sit here. Leads and sent quotes don't clutter the tray.</div>
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
              <button style={s.navBtn} onClick={navPrev} aria-label="Previous">‹</button>
              <button style={s.navBtn} onClick={navNext} aria-label="Next">›</button>
            </div>
            <h2 style={{ ...s.dateTitle, fontSize: isMobile ? '13px' : '16px' }}>{displayTitle}</h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              style={{ ...s.filterBtn, background: '#FDF3E3', borderColor: '#E9CF9E', color: '#B26B0E' }}
              onClick={openDayAlert}
              title="Text every client scheduled on the shown day"
            >
              {isMobile ? 'Text' : "Text today's clients"}
            </button>
            {isMobile && (
              <button
                onClick={() => setDayRun(viewRange.start || toYMD(new Date()))}
                style={{ background: 'var(--terra)', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap' }}
              >
                ▶ Day run
              </button>
            )}
            <button
              style={{ ...s.filterBtn, ...(showFilter ? s.filterBtnOn : {}) }}
              onClick={() => setShowFilter(v => !v)}
            >
              {isMobile ? 'Rows' : 'Rows'}
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

        {/* Confirm: text the whole day's clients */}
        {dayAlert && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => !alerting && setDayAlert(null)}>
            <div style={{ background: '#fff', borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '20px', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--bark)', marginBottom: '6px' }}>Text the day's clients?</div>
              <div style={{ fontSize: '13px', color: '#777', marginBottom: '12px', lineHeight: 1.5 }}>
                This texts <strong>{dayAlert.recipients.length}</strong> client{dayAlert.recipients.length === 1 ? '' : 's'} scheduled for {new Date(dayAlert.ymd + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}.
              </div>
              <ul style={{ margin: '0 0 14px', paddingLeft: '18px', maxHeight: '160px', overflowY: 'auto' }}>
                {dayAlert.recipients.map((r, i) => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--bark)', lineHeight: 1.6 }}>{r.name || 'Client'} · {r.phone}</li>
                ))}
              </ul>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button style={{ flex: 1, padding: '11px', borderRadius: '9px', border: 'none', background: 'var(--moss)', color: '#fff', fontSize: '14px', fontWeight: '700', cursor: 'pointer', fontFamily: 'var(--font)', opacity: alerting ? 0.6 : 1 }} onClick={sendDayAlerts} disabled={alerting}>
                  {alerting ? 'Sending…' : `Send ${dayAlert.recipients.length} text${dayAlert.recipients.length === 1 ? '' : 's'}`}
                </button>
                <button style={{ padding: '11px 18px', borderRadius: '9px', border: '1px solid var(--border)', background: '#fff', color: '#888', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => setDayAlert(null)} disabled={alerting}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Today's crews — live truck progress toward each site ── */}
        {todaysCrews.length > 0 && (
          <div style={s.crewStrip}>
            <div style={s.crewStripLabel}>Today's crews</div>
            <div style={s.crewStripRows}>
              {todaysCrews.map(ev => {
                const job = ev.extendedProps.job
                const veh = vehicleByReg(ev.extendedProps.vehicleReg)
                if (!veh) return null
                return (
                  <div key={ev.id} style={s.crewRow} onClick={() => setPopover({ weekEvent: ev })}>
                    <div style={s.crewName} title={ev.title}>{ev.title}</div>
                    <div style={s.crewProgress}>
                      <TruckProgress
                        vehicle={veh}
                        jobLat={job.lat}
                        jobLng={job.lng}
                        statusColor={jobColor(job)}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Week custom grid */}
        {activeView === 'week' ? (
          isMobile ? (
            <div style={s.calWrapWeekMobile}>
              <MobileWeekAgenda
                weekStart={weekStart}
                events={events}
                resources={activeResources}
                colorOf={id => resourceColors[id] ?? '#bbb'}
                onEventClick={ev => setPopover({ weekEvent: ev })}
              />
            </div>
          ) : (
          <div style={s.calWrapWeek}>
            <div style={{ minWidth: '790px' }}>
              <WeekGrid
                weekStart={weekStart}
                events={events}
                onEventClick={ev => setPopover({ weekEvent: ev })}
                resources={activeResources}
              />
            </div>
          </div>
          )
        ) : (
          <div style={s.calWrap}>
            <FullCalendar
              ref={calRef}
              plugins={[resourceTimelinePlugin, interactionPlugin, listPlugin]}
              schedulerLicenseKey="CC-Attribution-NonCommercial-NoDerivatives"
              initialView={activeView !== 'week' ? activeView : (isMobile ? 'listWeek' : 'resourceTimelineDay')}
              headerToolbar={false}
              height="100%"
              resources={fcResources}
              resourceOrder="index"
              events={fcEvents}
              editable
              droppable
              selectable
              weekends={false}
              slotMinTime="06:00:00"
              slotMaxTime="19:00:00"
              slotDuration="00:30:00"
              snapDuration="00:15:00"
              nowIndicator
              longPressDelay={250}
              eventLongPressDelay={250}
              selectLongPressDelay={250}
              resourceAreaWidth={isMobile ? '150px' : '210px'}
              resourceAreaHeaderContent="Truck / person"
              businessHours={{ daysOfWeek: [1,2,3,4,5], startTime: '07:00', endTime: '17:30' }}
              drop={handleDrop}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventClick={handleEventClick}
              eventDidMount={handleEventDidMount}
              datesSet={handleDatesSet}
              eventContent={renderEvent}
              resourceLabelContent={renderResourceLabel}
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

        {/* ── People — everyone on staff, away state, add leave ── */}
        <PeopleStrip
          items={peopleItems}
          compact={isMobile}
          onAddLeave={() => setLeaveModal({ initial: { start: visibleDates[0] } })}
          onPersonClick={onPersonClick}
          onDoubleClick={() => setLeaveModal({ initial: { start: visibleDates[0] } })}
          hint={activeView === 'week' ? 'Drag onto a truck, or a day. Grey = away.' : `Drag onto a truck for ${visibleDates.length === 1 ? dayShort(visibleDates[0]) : 'the week'}. Grey = away.`}
        />

        {/* ── Per-crew daily totals (ex GST) ── */}
        {!loading && (
          <div style={s.totalsBar}>
            <div style={s.totalsHead}>
              <span style={s.totalsTitle}>Crew totals</span>
              <span style={s.totalsScope}>{totalsLabel} · ex GST</span>
            </div>
            <div style={s.totalsList}>
              {crewTotals.map(c => (
                <div key={c.id} style={s.totalsRow}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={s.totalsRowName}>{c.title}</span>
                  <span style={s.totalsRowVal}>{nzd(c.total) ?? '$0'}</span>
                </div>
              ))}
              <div style={s.totalsTotalRow}>
                <span style={s.totalsTotalLabel}>{totalsSingleDay ? 'Day total' : 'Week total'}</span>
                <span style={s.totalsTotalVal}>{nzd(grandTotal) ?? '$0'}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Truck Tracker panel ── */}
        <div style={s.trackerSection}>
          <button style={s.trackerToggle} onClick={() => setShowTracker(v => !v)}>
            <span>Truck trackers</span>
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
          vehicles={vehicles}
          crewLabel={crewLabel}
          onClose={() => setPopover(null)}
          onUnschedule={unscheduleJob}
          onLinkVehicle={linkVehicle}
          onOpenJob={openJob}
        />
      )}

      {detailJob && (
        <JobDetailPanel
          job={detailJob}
          onClose={() => setDetailJob(null)}
          onUpdated={() => { setDetailJob(null); load() }}
          onFieldSaved={() => load()}
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

      {crewPopover && (
        <CrewPopover
          resource={orderedResources.find(r => r.id === crewPopover.resourceId)}
          dates={crewPopover.dates}
          allDates={visibleDates}
          people={R.people}
          crewFor={d => crewFor(crewPopover.resourceId, d)}
          onToggle={popoverToggle}
          onDatesChange={dates => setCrewPopover(p => ({ ...p, dates: dates.length ? dates : p.dates }))}
          onMarkAway={u => { setCrewPopover(null); setLeaveModal({ initial: { userId: u.id, start: crewPopover.dates[0], end: crewPopover.dates[crewPopover.dates.length - 1], kind: 'other' } }) }}
          onClose={() => setCrewPopover(null)}
          anchor={crewPopover.anchor}
        />
      )}

      {leaveModal && (
        <LeavePopover
          people={R.people}
          initial={leaveModal.initial}
          onSave={saveLeave}
          onClose={() => setLeaveModal(null)}
        />
      )}

      {leaveDetail && (
        <LeaveDetail
          user={leaveDetail.user}
          block={leaveDetail.block}
          anchor={leaveDetail.anchor}
          onRemove={deleteLeave}
          onClose={() => setLeaveDetail(null)}
        />
      )}

      {toast && (
        <div style={{ ...s.toast, background: toast.err ? '#C0392B' : 'var(--ink)' }}>
          {toast.msg}
        </div>
      )}

      {createPortal(
        <DragOverlay dropAnimation={null} zIndex={2000}>
          {activeDrag && activeDrag.type !== 'row' && (
            <ChipGhost
              data={activeDrag}
              userOf={R.userOf}
              equipById={id => R.equipment.find(e => e.id === id)}
              jobLabel={activeDrag.type === 'job' ? displayCase(jobHeading(activeDrag.job).primary) : null}
            />
          )}
        </DragOverlay>,
        document.body,
      )}
    </div>
    </DndContext>
    </SchedulerCtx.Provider>
  )
}

// ── Event block ────────────────────────────────────────────────────────────
function renderEvent(info) {
  const job = info.event.extendedProps?.job
  if (info.event.extendedProps?.leave) {
    return <div style={{ padding: '2px 6px', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{info.event.title}</div>
  }
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

// FullCalendar renders this through a portal, so the page's scheduler context
// (crew, chips, drop targets) is available inside it.
function ResourceLabelDay({ resource }) {
  const ctx = useContext(SchedulerCtx)
  if (!ctx) return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{resource.title}</span>
  const res = ctx.rows.find(r => r.id === resource.id) ?? { id: resource.id, title: resource.title, kind: 'legacy', color: '#97A0AB' }
  return (
    <RowHeader
      res={res}
      compact
      grip={<span data-grip="1" style={{ color: '#C8C2BC', fontSize: '14px', cursor: 'grab', userSelect: 'none', lineHeight: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>⠿</span>}
    />
  )
}
function renderResourceLabel(info) {
  return <ResourceLabelDay resource={info.resource} />
}

function handleResourceLabelDidMount(info) {
  const row = info.el.closest('tr') ?? info.el
  row.setAttribute('draggable', 'true')
  row.style.cursor = 'default'
  row.addEventListener('dragstart', (e) => {
    // Only the grip reorders rows; a chip inside the row is a dnd-kit drag.
    if (!e.target?.closest?.('[data-grip]')) { e.preventDefault(); return }
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
  .fc-datagrid-cell-frame { border-right: 1px solid var(--border) !important; }
  /* Force both sides of each resource row to match height */
  .fc-resource-timeline .fc-datagrid-body tr { height: 66px !important; }
  .fc-resource-timeline .fc-timeline-lane { height: 66px !important; min-height: 66px !important; }
  .fc-resource-timeline .fc-datagrid-cell-frame { height: 66px !important; display: flex !important; align-items: center !important; }
  .fc-resource-timeline .fc-datagrid-cell-cushion { padding: 0 !important; width: 100%; overflow: hidden; }
  .fc-timeline-lane:nth-child(even) { background: #FAFAF8; }
  .fc-non-business { background: rgba(44, 36, 22, 0.04) !important; }
  .fc-timeline-now-indicator-line { border-color: #C0392B; border-width: 2px; }
  .fc-timeline-now-indicator-arrow { border-top-color: #C0392B; }
  .fc-event { border: none !important; border-radius: 4px !important; box-shadow: 0 1px 3px rgba(0,0,0,0.15) !important; cursor: pointer; }
  .fc-bg-event.tc-leave {
    opacity: 1 !important;
    background: repeating-linear-gradient(135deg, #f1ebe1 0 6px, #e9e2d6 6px 12px) !important;
    border-radius: 8px; margin: 6px 4px; display: flex; align-items: flex-start;
  }
  .fc-bg-event.tc-leave .fc-event-title { font-size: 11px; font-weight: 700; color: var(--ink-3); font-style: normal; margin: 4px 8px; }
  .fc-timeline-slot { border-color: #EDEBE7 !important; }
  .fc-timeline-slot.fc-timeline-slot-minor { border-color: #F5F3F0 !important; }
  .fc-scroller::-webkit-scrollbar { width: 5px; height: 5px; }
  .fc-scroller::-webkit-scrollbar-track { background: transparent; }
  .fc-scroller::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .fc-list-event:hover td { background: #F5F3F0 !important; }
  .fc-list-day-cushion { background: #F5F3F0 !important; font-size: 12px; }
  .fc-list-event-title { font-size: 13px; font-weight: 600; }
`

// ── Styles ─────────────────────────────────────────────────────────────────
const s = {
  shell: { display: 'flex', height: '100%', overflow: 'hidden', background: '#F5F3F0' },
  tray: {
    width: '200px', flexShrink: 0, background: '#fff',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  // overflow must stay visible so the status dropdown can escape the tray;
  // trayList does its own scrolling, and minHeight:0 keeps that working inside
  // the flex column once the parent no longer clips.
  trayTop:  { flex: 1, minHeight: 0, overflow: 'visible', display: 'flex', flexDirection: 'column', padding: '14px 0 0' },
  trayFilter: { padding: '0 10px 8px', position: 'relative' },
  statusBtn: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
    padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border, #E4E1D8)',
    background: '#fff', color: 'var(--bark, #2C2416)', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'inherit', minHeight: 36,
  },
  statusBtnOpen: { borderColor: 'var(--bark-mid, #4A6741)' },
  statusBtnLabel: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  statusBtnCaret: { fontSize: '8px', color: '#999', flexShrink: 0 },
  statusMenu: {
    position: 'absolute', top: 'calc(100% + 4px)', left: '10px', right: '10px',
    background: '#fff', border: '1.5px solid var(--border, #E4E1D8)', borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.12)', padding: '6px 0', zIndex: 60,
    maxHeight: '320px', overflowY: 'auto',
  },
  statusMenuHead: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 12px 8px', borderBottom: '1px solid var(--border, #E4E1D8)', marginBottom: '4px',
  },
  statusMenuTitle: { fontSize: '10px', fontWeight: '800', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.05em' },
  statusMenuReset: { background: 'none', border: 'none', padding: 0, fontSize: '11px', fontWeight: '600', color: 'var(--moss, #4A6741)', cursor: 'pointer', fontFamily: 'inherit' },
  statusItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 12px', cursor: 'pointer' },
  statusCheck: {
    width: '16px', height: '16px', borderRadius: '4px', border: '1.5px solid #ddd',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  statusLabel: { fontSize: '12.5px', color: 'var(--bark, #2C2416)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusCount: { fontSize: '10.5px', fontWeight: '700', borderRadius: '10px', padding: '1px 6px', flexShrink: 0 },
  traySearchWrap: { position: 'relative', margin: '0 10px 8px', display: 'flex', alignItems: 'center' },
  traySearchInput: {
    width: '100%', padding: '7px 24px 7px 10px', fontSize: '12px',
    border: '1.5px solid var(--border)', borderRadius: '7px',
    background: 'var(--cream)', color: 'var(--ink)', outline: 'none',
    fontFamily: 'var(--font)',
  },
  traySearchClear: {
    position: 'absolute', right: '6px', background: 'none', border: 'none',
    color: '#aaa', cursor: 'pointer', fontSize: '11px', padding: 0, lineHeight: 1,
  },
  trayList: { flex: 1, overflowY: 'auto', padding: '2px 10px 10px' },
  traySection: { display: 'flex', flexDirection: 'column', padding: '10px 4px 6px' },
  traySectionTitle: { fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' },
  traySectionSub: { fontSize: '10.5px', color: 'var(--ink-3)', marginTop: 2 },
  trayResizeHandle: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px',
    cursor: 'col-resize', zIndex: 10,
    background: 'transparent',
  },
  empty:    { textAlign: 'center', color: '#ccc', fontSize: '11px', padding: '20px 0' },
  legend:     { borderTop: '1px solid var(--border)', padding: '12px 14px' },
  legendRow:  { display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0' },
  legendDot:  { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  legendName: { fontSize: '11px', color: '#555', fontWeight: '600' },
  legendNote: { fontSize: '10px', color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  legendFoot: { fontSize: '10.5px', color: 'var(--ink-3)', marginTop: 8, lineHeight: 1.4 },
  main:    { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  totalsBar: {
    flexShrink: 0, background: '#fff', borderTop: '1px solid var(--border)',
    padding: '12px 16px 14px',
  },
  totalsHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '8px' },
  totalsTitle: { fontSize: '13px', fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em' },
  totalsScope: { fontSize: '10.5px', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  // Clean aligned list — one crew per row, amount right-aligned, hairline dividers.
  totalsList: { display: 'flex', flexDirection: 'column' },
  totalsRow: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 2px', borderBottom: '1px solid var(--border)',
  },
  totalsRowName: { flex: 1, fontSize: '14px', fontWeight: 600, color: 'var(--ink-2)' },
  totalsRowVal: { fontSize: '14px', fontWeight: 700, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' },
  totalsTotalRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: '11px', marginTop: '3px',
  },
  totalsTotalLabel: { fontSize: '12px', fontWeight: 800, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  totalsTotalVal: { fontSize: '19px', fontWeight: 800, color: 'var(--terra)', fontVariantNumeric: 'tabular-nums' },
  trackerSection: { flexShrink: 0, borderTop: '1px solid var(--border)', background: '#fff' },
  trackerToggle: {
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font)', fontSize: '13px', fontWeight: '600', color: 'var(--ink)', minHeight: 44,
  },
  trackerChevron: { fontSize: '22px', color: '#4A6741', lineHeight: 1, display: 'inline-block' },
  trackerBody: { padding: '0 16px 16px' },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: '#fff', borderBottom: '1px solid var(--border)', flexShrink: 0,
  },
  tbLeft:   { display: 'flex', alignItems: 'center', gap: '8px' },
  tbRight:  { display: 'flex', gap: '2px', background: '#F5F3F0', borderRadius: '7px', padding: '2px' },
  todayBtn: {
    padding: '6px 14px', borderRadius: '6px', minHeight: 34,
    background: 'var(--ink)', color: '#fff', border: 'none',
    fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font)',
  },
  navGroup: { display: 'flex', gap: '2px' },
  navBtn: {
    padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border)', minHeight: 34, minWidth: 34,
    background: '#fff', color: '#666', fontSize: '17px', cursor: 'pointer', lineHeight: 1,
  },
  dateTitle:{ fontSize: '15px', fontWeight: '700', color: 'var(--ink)', margin: '0 0 0 4px' },
  viewBtn: {
    padding: '5px 14px', borderRadius: '5px', border: 'none', minHeight: 30,
    background: 'transparent', fontSize: '12px', fontWeight: '500',
    color: '#888', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.12s',
  },
  viewBtnOn: { background: '#fff', color: 'var(--ink)', fontWeight: '700', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  filterBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', minHeight: 34,
    padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)',
    background: '#fff', color: '#555', fontSize: '12px', fontWeight: '600',
    cursor: 'pointer', fontFamily: 'var(--font)', transition: 'all 0.12s', whiteSpace: 'nowrap',
  },
  filterBtnOn: { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' },
  filterBadge: {
    background: '#D4851A', color: '#fff', fontSize: '10px', fontWeight: '700',
    borderRadius: '20px', padding: '1px 6px', lineHeight: 1.6,
  },
  crewStrip: {
    flexShrink: 0, borderBottom: '1px solid var(--border)', background: '#FAFAF8',
    padding: '8px 16px', display: 'flex', alignItems: 'flex-start', gap: '14px',
    maxHeight: '120px', overflowY: 'auto',
  },
  crewStripLabel: {
    fontSize: '10px', fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.05em',
    whiteSpace: 'nowrap', paddingTop: '4px', flexShrink: 0,
  },
  crewStripRows: { flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
  crewRow: {
    display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer',
    padding: '2px 4px', borderRadius: '6px',
  },
  crewName: {
    fontSize: '11px', fontWeight: '600', color: 'var(--ink)',
    width: '120px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  crewProgress: { flex: 1, minWidth: 0 },
  calWrap: { flex: 1, overflow: 'hidden', minHeight: 0 },
  calWrapWeek: { flex: 1, overflowX: 'auto', overflowY: 'auto', minHeight: 0 },
  calWrapWeekMobile: { flex: 1, overflowY: 'auto', minHeight: 0, background: 'var(--cream)' },
  toast: {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    color: '#fff', padding: '10px 22px', borderRadius: '8px',
    fontSize: '13px', fontWeight: '600', zIndex: 9999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 32px)', overflow: 'hidden', textOverflow: 'ellipsis',
  },
}

const tr = {
  card: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '9px 8px 9px 10px', marginBottom: '6px',
    borderRadius: '10px', border: '1px solid var(--line)',
    background: '#fff', cursor: 'grab', userSelect: 'none', touchAction: 'manipulation',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  cardHighlight: { outline: '2px solid var(--terra)', outlineOffset: 1, boxShadow: '0 8px 20px -10px rgba(40,25,10,.4)' },
  body: { flex: 1, minWidth: 0 },
  titleRow: { display: 'flex', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: '12.5px', fontWeight: '700', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 },
  price: { fontSize: '12px', fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 },
  meta: { fontSize: '10.5px', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' },
  stats: { display: 'flex', gap: '4px', marginTop: '5px', flexWrap: 'wrap' },
  stat:  { fontSize: '10px', fontWeight: '700', color: 'var(--ink-2)', background: '#fff', border: '1px solid var(--line)', borderRadius: '999px', padding: '2px 7px', whiteSpace: 'nowrap' },
  cat:   { fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#fff', borderRadius: '5px', padding: '2px 6px', whiteSpace: 'nowrap' },
  grip: { color: '#D0CBC4', fontSize: '13px', flexShrink: 0 },
}

const po = {
  scrim:    { position: 'fixed', inset: 0, zIndex: 400 },
  box:      { position: 'fixed', width: '250px', background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(44,36,22,0.18)', border: '1px solid var(--border)', overflow: 'hidden', zIndex: 401 },
  stripe:   { height: '4px', width: '100%' },
  title:    { fontSize: '14px', fontWeight: '700', color: 'var(--ink)', padding: '12px 14px 6px' },
  row:      { display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: '#555', lineHeight: 1.6, padding: '1px 14px' },
  icon:     { fontSize: '11px', marginTop: '2px', flexShrink: 0 },
  truckRow: { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px 2px' },
  select:   {
    flex: 1, fontSize: '12px', padding: '5px 6px', borderRadius: '6px',
    border: '1px solid var(--border)', background: 'var(--cream)', color: 'var(--ink)',
    fontFamily: 'var(--font)', cursor: 'pointer', outline: 'none',
  },
  openBtn:  { display: 'block', width: 'calc(100% - 28px)', margin: '10px 14px 0', background: '#4A6741', border: 'none', borderRadius: '6px', padding: '9px', fontSize: '12px', fontWeight: '700', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },
  btns:     { display: 'flex', gap: '8px', padding: '12px 14px', borderTop: '1px solid var(--border)', marginTop: '8px' },
  backBtn:  { flex: 1, background: '#FDF3E3', border: '1px solid #FADFAA', borderRadius: '6px', padding: '7px', fontSize: '11px', fontWeight: '600', color: '#B8860B', cursor: 'pointer', fontFamily: 'var(--font)' },
  closeBtn: { background: 'var(--ink)', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '11px', fontWeight: '600', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font)' },
}

// ── Week grid styles ───────────────────────────────────────────────────────
const wg = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'auto' },
  headerRow: {
    display: 'grid',
    gridTemplateColumns: '190px repeat(5, 1fr)',
    borderBottom: '2px solid var(--border)',
    background: '#FAFAF8',
    flexShrink: 0,
  },
  resourceHeader: {
    fontSize: '10px', fontWeight: '700', color: '#aaa',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '10px 10px',
    borderRight: '1px solid var(--border)',
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
    gridTemplateColumns: '190px repeat(5, 1fr)',
    borderBottom: '1px solid #EDEBE7',
    minHeight: '72px',
  },
  resourceCell: {
    display: 'flex', alignItems: 'stretch',
    borderRight: '1px solid var(--border)',
    flexShrink: 0, minWidth: 0,
  },
  grip: { color: '#C8C2BC', fontSize: '14px', cursor: 'grab', userSelect: 'none', touchAction: 'none', lineHeight: 1, flexShrink: 0, padding: '4px 2px' },
  cell: {
    padding: '5px 5px', borderRight: '1px solid #EDEBE7',
    display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0, position: 'relative',
  },
  cellToday: { background: '#FFFDF5' },
  pill: {
    borderRadius: '8px', padding: '5px 8px', cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
    userSelect: 'none',
  },
  pillTitle: { display: 'block', fontSize: '11px', fontWeight: '700', color: '#fff', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pillSub:   { display: 'block', fontSize: '10px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  warn: { fontSize: '10px', fontWeight: 700, color: '#B26B0E', lineHeight: 1.3 },
  hint: { fontSize: '11px', fontWeight: 700, color: 'var(--terra)', textAlign: 'center', marginTop: 'auto', paddingTop: 4 },
}

// ── Filter panel styles ────────────────────────────────────────────────────
const fp = {
  scrim: { position: 'fixed', inset: 0, zIndex: 300 },
  panel: {
    position: 'fixed', top: '56px', right: '16px',
    width: '260px', background: '#fff',
    borderRadius: '10px', border: '1px solid var(--border)',
    boxShadow: '0 8px 32px rgba(44,36,22,0.14)',
    overflow: 'hidden', zIndex: 301,
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px 10px',
    borderBottom: '1px solid var(--border)',
  },
  title: { fontSize: '12px', fontWeight: '700', color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  hint:  { fontSize: '10px', color: '#bbb' },
  row: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '9px 14px', borderBottom: '1px solid #F5F3F0',
    background: '#fff', cursor: 'default', minHeight: 44,
  },
  grip: { color: '#D0CBC4', fontSize: '14px', cursor: 'grab', touchAction: 'none', flexShrink: 0, lineHeight: 1 },
  name: { flex: 1, fontSize: '13px', fontWeight: '500', color: 'var(--ink)' },
  toggle: {
    padding: '3px 10px', borderRadius: '20px', border: 'none', minHeight: 28,
    fontSize: '11px', fontWeight: '700', cursor: 'pointer',
    fontFamily: 'var(--font)', transition: 'all 0.15s', flexShrink: 0,
  },
}


// Mobile week agenda styles
const mwa = {
  wrap: { padding: '4px 0 12px' },
  daySection: { marginBottom: '10px' },
  dayHeader: {
    display: 'flex', alignItems: 'baseline', gap: '8px',
    padding: '10px 16px 6px', position: 'sticky', top: 0, zIndex: 1,
    background: 'var(--cream)',
  },
  dayHeaderToday: {},
  dayName: { fontSize: '15px', fontWeight: 800, color: 'var(--bark)' },
  dayDate: { fontSize: '13px', color: '#8A7A6B', flex: 1 },
  dayCount: { fontSize: '12px', fontWeight: 700, color: '#8A7A6B', minWidth: 18, textAlign: 'center' },
  empty: { padding: '4px 16px 8px', fontSize: '13px', color: '#B7A896' },
  row: {
    display: 'flex', alignItems: 'center', gap: '12px',
    background: '#fff', border: '1px solid var(--border)', borderRadius: '14px',
    margin: '0 12px 8px', padding: '12px 14px', minHeight: '64px',
    cursor: 'pointer', fontFamily: 'var(--font)', textAlign: 'left',
    boxSizing: 'border-box', width: 'calc(100% - 24px)',
  },
  bar: { width: '5px', alignSelf: 'stretch', borderRadius: '3px', flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' },
  rowTitle: { fontSize: '15px', fontWeight: 700, color: 'var(--bark)', lineHeight: 1.25 },
  rowMeta: { fontSize: '13px', color: '#8A7A6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  crewDot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
}
