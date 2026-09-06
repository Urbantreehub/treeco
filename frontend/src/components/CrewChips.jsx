import { useDraggable, useDroppable } from '@dnd-kit/core'
import { shortName, initialsOf } from '../hooks/useResources'
import { kindLabel } from '../hooks/useAvailability'

// People and equipment as chips: on a truck row's header, inside a week cell,
// and in the People strip. Chips drag with dnd-kit (a touch drag needs a
// 250ms hold, set on the page's sensors); a tap opens whatever the parent
// wires to onClick. Away people render grey, dashed and struck through.

const EQUIP_COLOR = '#8B6238'
const OFFICE = 'var(--terra)'

function chipStyle({ away, partial, compact, accent, dragging, on }) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: compact ? 0 : 5,
    fontSize: compact ? 10 : 11.5, fontWeight: 700, lineHeight: 1,
    color: away ? 'var(--ink-3)' : accent ?? 'var(--ink)',
    background: on ? 'var(--terra-wash)' : 'var(--cream)',
    border: `1px ${away || partial ? 'dashed' : 'solid'} ${accent ?? (on ? 'var(--terra-soft)' : 'var(--line)')}`,
    borderRadius: 999, padding: compact ? 1 : '3px 9px 3px 3px',
    textDecoration: away ? 'line-through' : 'none',
    whiteSpace: 'nowrap', userSelect: 'none', WebkitUserSelect: 'none',
    touchAction: 'manipulation', cursor: 'pointer',
    opacity: dragging ? 0.35 : 1, maxWidth: '100%', minHeight: compact ? 20 : 28,
    fontFamily: 'var(--font)',
  }
}
function avatarStyle({ compact, color }) {
  const size = compact ? 18 : 20
  return {
    width: size, height: size, borderRadius: '50%', background: color ?? 'var(--ink)', color: '#fff',
    fontSize: compact ? 8.5 : 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontStyle: 'normal', flexShrink: 0, letterSpacing: 0,
  }
}

// One person. `dragId` enables dragging (with `dragData` handed to onDragEnd).
export function PersonChip({ user, away = null, partial = false, compact = false, dragId, dragData, onClick, on = false, label, title, style }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId ?? `static:${user?.id}`, data: dragData, disabled: !dragId })
  const office = !user?.resource_id && !user?.unknown
  const accent = office ? OFFICE : null
  const text = label ?? shortName(user)
  const tip = title ?? [user?.name ?? 'Staff', user?.role, away ? kindLabel(away.kind) : null].filter(Boolean).join(' · ')
  return (
    <span
      ref={setNodeRef}
      {...(dragId ? { ...listeners, ...attributes } : {})}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      data-chip="person"
      draggable={false}
      title={tip}
      aria-label={tip}
      onClick={onClick ? (e => { e.stopPropagation(); onClick(user, e) }) : undefined}
      onDoubleClick={e => e.stopPropagation()}
      onKeyDown={onClick ? (e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(user, e) } }) : undefined}
      style={{ ...chipStyle({ away: !!away, partial, compact, accent, dragging: isDragging, on }), ...style }}
    >
      <i style={avatarStyle({ compact, color: away ? 'var(--ink-3)' : accent ?? 'var(--ink)' })}>{initialsOf(user)}</i>
      {!compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{text}</span>}
    </span>
  )
}

// The Avant / the grinder. `on` = it is booked on this truck-day.
export function EquipChip({ equip, compact = false, dragId, dragData, onClick, on = false, onRemove, title, style }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId ?? `static:${equip?.id}`, data: dragData, disabled: !dragId })
  const color = equip?.color ?? EQUIP_COLOR
  return (
    <span
      ref={setNodeRef}
      {...(dragId ? { ...listeners, ...attributes } : {})}
      role={onClick ? 'button' : undefined}
      data-chip="equip"
      draggable={false}
      title={title ?? equip?.name}
      onClick={onClick ? (e => { e.stopPropagation(); onClick(equip, e) }) : undefined}
      style={{ ...chipStyle({ compact, dragging: isDragging, on, accent: on ? color : null }), ...style }}
    >
      <i style={avatarStyle({ compact, color })}>{(equip?.name ?? '?')[0].toUpperCase()}</i>
      {!compact && <span>{equip?.name}</span>}
      {!compact && onRemove && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(equip) }}
          aria-label={`Take ${equip?.name} off`}
          style={{ border: 'none', background: 'transparent', color: 'var(--ink-3)', fontSize: 12, lineHeight: 1, padding: '0 0 0 2px', cursor: 'pointer', minWidth: 16 }}
        >×</button>
      )}
    </span>
  )
}

// A hatched "away" block in a row cell — the mockup's `.off`.
export function OffBlock({ label, compact = false, onClick, style }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick ? (e => { e.stopPropagation(); onClick(e) }) : undefined}
      title={label}
      style={{
        background: 'repeating-linear-gradient(135deg, #f1ebe1 0 6px, #e9e2d6 6px 12px)',
        borderRadius: 8, padding: compact ? '2px 6px' : '5px 8px', fontSize: compact ? 10 : 11, fontWeight: 700,
        color: 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        cursor: onClick ? 'pointer' : 'default', userSelect: 'none', ...style,
      }}
    >
      {label}
    </div>
  )
}

// Row-header chips for a truck: everyone on it across `dates`, plus any
// equipment that lives on this row. `crewByDate` is { [ymd]: resolvedCrew[] }.
export function CrewChips({ resourceId, dates, crewByDate, equipment = [], compact = false, onPersonClick, onEquipClick, dragFrom }) {
  const seen = new Map()
  dates.forEach(d => (crewByDate[d] ?? []).forEach(c => {
    const cur = seen.get(c.id) ?? { user: c, awayDays: 0, days: 0 }
    cur.days += 1
    if (c.away) { cur.awayDays += 1; cur.away = cur.away ?? c.away }
    seen.set(c.id, cur)
  }))
  const items = [...seen.values()]
  if (!items.length && !equipment.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: compact ? 2 : 4, alignItems: 'center' }}>
      {items.map(({ user, away, awayDays, days }) => (
        <PersonChip
          key={user.id}
          user={user}
          compact={compact}
          away={awayDays === days && days > 0 ? away : null}
          partial={awayDays > 0 && awayDays < days}
          dragId={`person:${user.id}:hdr:${resourceId}`}
          dragData={{ type: 'person', userId: user.id, fromResource: resourceId, fromDate: null }}
          onClick={onPersonClick}
          title={[user.name, awayDays > 0 ? `${kindLabel(away?.kind)} ${awayDays === days ? '' : `${awayDays} of ${days} days`}`.trim() : null].filter(Boolean).join(' · ')}
        />
      ))}
      {equipment.map(eq => (
        <EquipChip
          key={eq.id}
          equip={eq}
          compact={compact}
          on={!!eq.on}
          dragId={`equip:${eq.id}:hdr:${resourceId}`}
          dragData={{ type: 'equip', equipId: eq.id, fromResource: resourceId, fromDate: null }}
          onClick={onEquipClick}
          title={eq.on ? `${eq.name} · on the ${dragFrom ?? 'truck'} ${eq.onLabel ?? ''}`.trim() : `${eq.name} · drag onto a truck-day`}
        />
      ))}
    </div>
  )
}

// Everyone on staff, with their away state over the visible dates. Dropping a
// chip here takes them off an explicit assignment.
export function PeopleStrip({ items, onAddLeave, onPersonClick, onDoubleClick, compact = false, hint }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'people', data: { type: 'people' } })
  return (
    <div
      ref={setNodeRef}
      onDoubleClick={onDoubleClick}
      data-testid="people-strip"
      style={{
        display: 'flex', alignItems: 'center', gap: compact ? 6 : 10, flexWrap: 'wrap',
        padding: compact ? '8px 12px' : '8px 16px', borderTop: '1px solid var(--line)',
        background: isOver ? 'var(--terra-wash)' : '#fff', minHeight: 48, transition: 'background .12s',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: compact ? 0 : 120, marginRight: 4 }}>
        <b style={{ fontSize: 12.5, color: 'var(--ink)' }}>People</b>
        {!compact && <span style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{hint ?? 'Everyone on staff. Grey = away.'}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
        {items.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>No staff loaded yet</span>}
        {items.map(({ user, away, partial, label }) => (
          <PersonChip
            key={user.id}
            user={user}
            away={away}
            partial={partial}
            label={label}
            dragId={`person:${user.id}:people`}
            dragData={{ type: 'person', userId: user.id, fromResource: null, fromDate: null }}
            onClick={onPersonClick}
          />
        ))}
      </div>
      {onAddLeave && (
        <button
          onClick={onAddLeave}
          style={{
            marginLeft: 'auto', minHeight: 36, padding: '0 14px', borderRadius: 999, border: '1px solid var(--line)',
            background: '#fff', color: 'var(--ink-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', whiteSpace: 'nowrap',
          }}
        >
          + Add leave / sick day
        </button>
      )}
    </div>
  )
}

// What the finger is holding while a drag is in flight (rendered in DragOverlay).
export function ChipGhost({ data, userOf, equipById, jobLabel }) {
  if (!data) return null
  if (data.type === 'person') return <PersonChip user={userOf(data.userId)} style={{ boxShadow: '0 8px 20px -8px rgba(40,25,10,.5)', background: '#fff' }} />
  if (data.type === 'equip') return <EquipChip equip={equipById(data.equipId)} style={{ boxShadow: '0 8px 20px -8px rgba(40,25,10,.5)', background: '#fff' }} />
  if (data.type === 'job') {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderLeft: `4px solid ${data.color ?? '#3A8A82'}`, borderRadius: 10, padding: '8px 12px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', boxShadow: '0 10px 24px -10px rgba(40,25,10,.5)', transform: 'rotate(-2deg)', maxWidth: 220 }}>
        {jobLabel}
        {data.sub && <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>{data.sub}</div>}
      </div>
    )
  }
  return null
}

// Tap-to-assign fallback: checkboxes for every person on a truck for the
// chosen dates. `crewFor(date)` returns the resolved crew for a date.
export function CrewPopover({ resource, dates, allDates, people, crewFor, onToggle, onDatesChange, onMarkAway, onClose, anchor }) {
  const top = Math.min((anchor?.bottom ?? 120) + 6, window.innerHeight - 380)
  const left = Math.min(Math.max(anchor?.left ?? 40, 8), window.innerWidth - 300)
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short' })
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Crew on the ${resource?.title ?? 'truck'}`}
        style={{ position: 'fixed', top, left, width: 290, background: '#fff', borderRadius: 14, border: '1px solid var(--line)', boxShadow: '0 12px 32px -12px rgba(40,25,10,.35)', padding: '12px 12px 10px', zIndex: 501 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: resource?.color }} />
          <b style={{ fontSize: 14, color: 'var(--ink)' }}>{resource?.title}</b>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{resource?.note}</span>
        </div>
        {allDates.length > 1 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {allDates.map(d => {
              const on = dates.includes(d)
              return (
                <button key={d} onClick={() => onDatesChange(on ? dates.filter(x => x !== d) : [...dates, d].sort())}
                  style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, border: `1px solid ${on ? 'var(--ink)' : 'var(--line)'}`, background: on ? 'var(--ink)' : '#fff', color: on ? '#fff' : 'var(--ink-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                  {fmt(d)}
                </button>
              )
            })}
            <button onClick={() => onDatesChange(dates.length === allDates.length ? [allDates[0]] : [...allDates])}
              style={{ minHeight: 30, padding: '0 10px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
              {dates.length === allDates.length ? 'One day' : 'Whole week'}
            </button>
          </div>
        )}
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {people.map(u => {
            const onDays = dates.filter(d => crewFor(d).some(c => c.id === u.id))
            const awayDays = dates.filter(d => crewFor(d).find(c => c.id === u.id)?.away)
            const checked = onDays.length === dates.length && dates.length > 0
            const some = onDays.length > 0 && !checked
            return (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer', borderBottom: '1px solid var(--cream)' }}>
                <input type="checkbox" checked={checked} ref={el => { if (el) el.indeterminate = some }}
                  onChange={() => onToggle(u.id, !checked, dates)} style={{ width: 18, height: 18, accentColor: 'var(--terra)' }} />
                <i style={avatarStyle({ color: !u.resource_id ? OFFICE : 'var(--ink)' })}>{initialsOf(u)}</i>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                  {u.name}
                  <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--ink-3)' }}>
                    {[u.resource_id === resource?.id ? 'default' : some ? `${onDays.length} of ${dates.length} days` : null, awayDays.length ? `away ${awayDays.length === dates.length ? '' : awayDays.length + ' day' + (awayDays.length === 1 ? '' : 's')}`.trim() : null].filter(Boolean).join(' · ') || (u.resource_id ? '' : 'office')}
                  </span>
                </span>
                {onMarkAway && (
                  <button onClick={e => { e.preventDefault(); onMarkAway(u) }} style={{ minHeight: 32, padding: '0 10px', borderRadius: 999, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' }}>
                    Away…
                  </button>
                )}
              </label>
            )
          })}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 8 }}>
          A person is on one truck per day. To take someone off their usual truck without moving them, mark them away.
        </div>
      </div>
    </div>
  )
}
