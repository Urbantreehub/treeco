import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../config/supabase'
import { categoryMeta } from '../../config/statuses'
import { displayCase } from '../../utils/jobDisplay'
import NavArrow from './NavArrow'
import QuoteSheet from './QuoteSheet'

// Compact-width "day run" view of the calendar: one day, one crew, rendered as
// an ordered stop list (done / current / upcoming) instead of a grid. Data is
// the same `schedule` table the calendar loads, joined to jobs + clients +
// quotes — one query per visible week so switching days is instant.

const GREEN = '#4A6741'                    // matches the calendar's scheduled/josh green
const DONE_STATUSES = new Set(['quote_sent', 'complete_to_invoice', 'invoiced'])
const QUOTING_STATUSES = new Set(['new_lead', 'quote_scheduled'])

// Local-timezone YYYY-MM-DD (same rule as Calendar.jsx — never toISOString).
function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function fromYMD(ymd) { return new Date(ymd + 'T00:00:00') }
function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function weekMonday(date) {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  d.setHours(0, 0, 0, 0)
  return d
}
// "08:30:00" → "8:30am"
function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
const mapsLink = (addr) =>
  'https://maps.apple.com/?daddr=' + encodeURIComponent(`${addr ?? ''}, New Zealand`)

function initials(title) {
  return (title || '?').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function stopName(job) {
  return displayCase(job?.clients?.name || job?.title || '—')
}
function meetingIcon(job) {
  if (job?.meeting_status === 'meeting') return '🤝 '
  if (job?.meeting_status === 'not_meeting') return '🚪 '
  return ''
}

export default function DayRunView({ initialDate, myResourceId, resources, resourceColors, onBack }) {
  // Crew avatars: every active resource lane except the catch-all "unassigned".
  const crew = useMemo(() => resources.filter(r => r.id !== 'unassigned'), [resources])
  const ownResourceId = (myResourceId && crew.some(r => r.id === myResourceId))
    ? myResourceId
    : (crew[0]?.id ?? null)

  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [viewResourceId, setViewResourceId] = useState(ownResourceId)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showWeek, setShowWeek] = useState(false)
  const navigate = useNavigate()
  const [sheetJob, setSheetJob] = useState(null)
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const scrollRef = useRef(null)

  const weekStartYMD = toYMD(weekMonday(fromYMD(selectedDate)))
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(fromYMD(weekStartYMD), i)),
    [weekStartYMD]
  )

  // Load the whole visible week's schedule (all resources) in one query —
  // same table + join shape the calendar itself uses.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('schedule')
        .select('*, jobs(*, clients(name, phone, email), quotes(id, status, total, subtotal, job_pack))')
        .gte('date', weekStartYMD)
        .lte('date', toYMD(addDays(fromYMD(weekStartYMD), 4)))
        .order('date')
        .order('start_time')
      if (!cancelled) {
        setRows(data ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [weekStartYMD])

  function showToast(msg, err) {
    setToast({ msg, err })
    setTimeout(() => setToast(null), 2200)
  }

  // ── Stops for the viewed day + resource, in start-time order ─────────────
  const stops = rows
    .filter(r => r.date === selectedDate && (r.resource_id ?? 'unassigned') === viewResourceId)
    .map((r, i) => ({
      row: r,
      job: r.jobs ?? {},
      n: i + 1,
      eta: fmtTime(r.start_time),
      end: fmtTime(r.end_time),
    }))
  const isDone = (stop) => DONE_STATUSES.has(stop.job?.status)
  // Current stop = first stop of the day whose job isn't already through
  // quoting/invoicing (quote_sent / complete_to_invoice / invoiced).
  const currentIdx = stops.findIndex(s => !isDone(s))
  const doneStops = stops.filter(isDone)
  const todoStops = stops.filter((s, i) => !isDone(s) && i !== currentIdx)
  const current = currentIdx === -1 ? null : stops[currentIdx]
  const nextStop = current ? stops.find((s, i) => i > currentIdx && !isDone(s)) : null

  const viewingOwn = viewResourceId === ownResourceId
  const viewedResource = crew.find(r => r.id === viewResourceId) ?? crew[0]

  // "quote run" / "work run" / "day run" from what's actually booked.
  const quoting = stops.filter(s => QUOTING_STATUSES.has(s.job?.status) || s.job?.status === 'quote_sent').length
  const runKind = stops.length === 0 ? 'run'
    : quoting === stops.length ? 'quote run'
    : quoting === 0 ? 'work run'
    : 'day run'

  const dateLabel = fromYMD(selectedDate).toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

  // ── Mark the current stop's quote as sent, advance locally ───────────────
  async function markSent(job) {
    if (saving || !job?.id) return
    setSaving(true)
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'quote_sent', status_changed_at: new Date().toISOString() })
      .eq('id', job.id)
    setSaving(false)
    if (error) { showToast(error.message, true); return }
    setRows(prev => prev.map(r =>
      r.job_id === job.id ? { ...r, jobs: { ...r.jobs, status: 'quote_sent' } } : r
    ))
    showToast('Quote marked sent — next stop loaded')
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Sub-components (inline for cohesion) ─────────────────────────────────
  function renderCurrentCard() {
    if (!current) {
      if (stops.length === 0) return null
      return (
        <div style={dr.currentCard}>
          <div style={{ ...dr.srcBar, background: GREEN }} />
          <div style={dr.cardBody}>
            <h2 style={dr.cardName}>Run complete 🎉</h2>
            <div style={dr.cardAddr}>{stops.length} stop{stops.length === 1 ? '' : 's'} done · head home.</div>
          </div>
        </div>
      )
    }
    const job = current.job
    const cat = categoryMeta(job)
    const isQuoting = QUOTING_STATUSES.has(job.status)
    const showSent = isQuoting
    const openStop = () => isQuoting ? setSheetJob(job) : navigate(`/workorder/${job.id}`)
    return (
      <div style={dr.currentCard} onClick={openStop}>
        <div style={{ ...dr.srcBar, background: cat.color }} />
        <div style={dr.cardBody}>
          <div style={dr.stopNum}>STOP {current.n}{current.eta ? ` · ETA ${current.eta}` : ''}</div>
          <h2 style={dr.cardName}>{stopName(job)}</h2>
          <div style={dr.cardAddr}>{displayCase(job.address) || 'No address'}</div>
          <div style={dr.chipRow}>
            {job.meeting_status === 'meeting' && (
              <span style={{ ...dr.chip, ...dr.chipMeet }}>🤝 Meeting you</span>
            )}
            {job.meeting_status === 'not_meeting' && (
              <span style={{ ...dr.chip, ...dr.chipNoMeet }}>🚪 Not meeting</span>
            )}
            {job.job_type && <span style={dr.chip}>{job.job_type}</span>}
            <span style={{ ...dr.chip, color: cat.color, borderColor: cat.color + '55' }}>{cat.label}</span>
          </div>
        </div>
        <div style={dr.btnRow} onClick={e => e.stopPropagation()}>
          <a style={{ ...dr.btn, ...dr.btnPrimary }} href={mapsLink(job.address)} target="_blank" rel="noreferrer">
            <NavArrow size={20} /> Navigate
          </a>
          {isQuoting ? (
            <button style={{ ...dr.btn, ...dr.btnSecondary }} onClick={() => setSheetJob(job)}>📄 Quote</button>
          ) : (
            <button style={{ ...dr.btn, ...dr.btnSecondary }} onClick={() => navigate(`/workorder/${job.id}`)}>🛠 Work order</button>
          )}
          {showSent && (
            <button
              style={{ ...dr.btn, ...dr.btnSent, opacity: saving ? 0.6 : 1 }}
              onClick={() => markSent(job)}
              disabled={saving}
            >
              ✓  Quote sent — next stop
            </button>
          )}
        </div>
      </div>
    )
  }

  function renderUpcomingRow(stop) {
    const job = stop.job
    return (
      <div key={stop.row.id} style={dr.row}>
        <div style={dr.rowNum}>{stop.n}</div>
        <div style={dr.rowInfo} onClick={() => QUOTING_STATUSES.has(job.status) ? setSheetJob(job) : navigate(`/workorder/${job.id}`)}>
          <b style={dr.rowName}>{meetingIcon(job)}{stopName(job)}</b>
          <span style={dr.rowSub}>
            {[displayCase(job.address), stop.eta ? `ETA ${stop.eta}` : null].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
        <a style={dr.rowNav} href={mapsLink(job.address)} target="_blank" rel="noreferrer" aria-label="Navigate">
          <NavArrow size={22} style={{ color: 'var(--ink)' }} />
        </a>
      </div>
    )
  }

  function renderDoneRow(stop) {
    return (
      <div key={stop.row.id} style={dr.rowDone}>
        <div style={dr.doneTick}>✓</div>
        <div style={dr.rowInfo}>
          <b style={dr.doneName}>{stopName(stop.job)}</b>
        </div>
      </div>
    )
  }

  // Read-only rows for another crew's day — no action buttons at all.
  function renderReadOnlyRow(stop, i) {
    const job = stop.job
    const isCur = i === currentIdx
    const done = isDone(stop)
    return (
      <div
        key={stop.row.id}
        style={{
          ...(done ? dr.rowDone : dr.row),
          ...(isCur ? { border: '2px solid var(--terra)' } : {}),
        }}
      >
        <div style={done ? dr.doneTick : dr.rowNum}>{done ? '✓' : stop.n}</div>
        <div style={dr.rowInfo}>
          <b style={done ? dr.doneName : dr.rowName}>{meetingIcon(job)}{stopName(job)}</b>
          {!done && (
            <span style={dr.rowSub}>
              {[displayCase(job.address), stop.eta ? `${stop.eta}${stop.end ? `–${stop.end}` : ''}` : null].filter(Boolean).join(' · ') || '—'}
            </span>
          )}
        </div>
      </div>
    )
  }

  const todayYMD = toYMD(new Date())

  return (
    <div ref={scrollRef} style={dr.shell}>
      {/* ── Header ── */}
      <header style={dr.header}>
        <div style={dr.headerRow}>
          {onBack && <button style={dr.backBtn} onClick={onBack} aria-label="Back to calendar">‹</button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <button style={dr.dateBtn} onClick={() => setShowWeek(v => !v)}>
              <h1 style={dr.dateTitle}>{dateLabel}</h1>
              <span style={dr.dateCaret}>▾</span>
            </button>
            <div style={dr.subline}>
              {viewingOwn
                ? `Your ${runKind} · ${stops.length} stop${stops.length === 1 ? '' : 's'}`
                : `${viewedResource?.title ?? ''} · ${stops.length} stop${stops.length === 1 ? '' : 's'} · viewing only`}
            </div>
          </div>
          <div style={dr.crewSwitch}>
            {crew.map(r => {
              const on = r.id === viewResourceId
              const color = resourceColors[r.id] ?? 'var(--terra)'
              return (
                <button
                  key={r.id}
                  onClick={() => setViewResourceId(r.id)}
                  title={r.title}
                  style={{
                    ...dr.avatar,
                    background: on ? color : '#fff',
                    color: on ? '#fff' : 'var(--ink)',
                    borderColor: on ? color : 'var(--line)',
                  }}
                >
                  {initials(r.title)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Week strip — only while the date dropdown is open */}
        {showWeek && (
          <div style={dr.weekDrop}>
            {weekDays.map(d => {
              const ymd = toYMD(d)
              const sel = ymd === selectedDate
              const hasEvents = rows.some(r => r.date === ymd)
              return (
                <button
                  key={ymd}
                  onClick={() => { setSelectedDate(ymd); setShowWeek(false) }}
                  style={{
                    ...dr.weekDay,
                    background: sel ? 'var(--terra)' : 'transparent',
                    color: sel ? '#fff' : ymd === todayYMD ? 'var(--terra)' : 'var(--ink-2)',
                  }}
                >
                  {d.toLocaleDateString('en-NZ', { weekday: 'narrow' })}
                  <br />
                  {d.getDate()}
                  <span style={{ ...dr.weekDot, background: hasEvents ? (sel ? '#fff' : 'var(--terra)') : 'transparent' }} />
                </button>
              )
            })}
          </div>
        )}

        {/* Segmented progress — one segment per stop */}
        {stops.length > 0 && (
          <div style={dr.progress}>
            {stops.map((s, i) => (
              <span
                key={s.row.id}
                style={{
                  ...dr.progressSeg,
                  background: isDone(s) ? GREEN : i === currentIdx ? 'var(--terra)' : 'var(--line)',
                }}
              />
            ))}
          </div>
        )}
      </header>

      {loading ? (
        <div style={dr.empty}>Loading…</div>
      ) : stops.length === 0 ? (
        <div style={dr.empty}>No stops scheduled this day.</div>
      ) : viewingOwn ? (
        <>
          <div style={dr.sectionLabel}>
            Now — stop {current ? current.n : '—'} of {stops.length}
          </div>
          {renderCurrentCard()}

          <div style={dr.sectionLabel}>Up next</div>
          <div style={dr.list}>
            {todoStops.length > 0
              ? todoStops.map(renderUpcomingRow)
              : <div style={{ ...dr.row, minHeight: '56px' }}><div style={dr.rowInfo}><span style={dr.rowSub}>No more stops after this one.</span></div></div>}
          </div>

          {doneStops.length > 0 && (
            <>
              <div style={dr.sectionLabel}>Done</div>
              <div style={dr.list}>{doneStops.map(renderDoneRow)}</div>
            </>
          )}
        </>
      ) : (
        <div style={{ ...dr.list, marginTop: '14px' }}>
          {stops.map(renderReadOnlyRow)}
        </div>
      )}

      {/* ── Sticky bottom bar — own run only ── */}
      {viewingOwn && current && (
        <div style={dr.bottomBar}>
          {nextStop ? (
            <>
              <p style={dr.bottomHint}>
                Next: <b style={{ color: 'var(--ink)' }}>{stopName(nextStop.job)}</b> — {displayCase(nextStop.job.address) || 'no address'}
              </p>
              <a
                style={{ ...dr.btn, ...dr.btnPrimary, ...dr.bottomBtn }}
                href={mapsLink(nextStop.job.address)}
                target="_blank"
                rel="noreferrer"
              >
                <NavArrow size={20} /> Navigate to next stop
              </a>
            </>
          ) : (
            <>
              <p style={dr.bottomHint}>This is the last stop of the run</p>
              <button style={{ ...dr.btn, ...dr.btnPrimary, ...dr.bottomBtn }} onClick={onBack || (() => setShowWeek(true))}>
                🏁  Finish run
              </button>
            </>
          )}
        </div>
      )}

      {sheetJob && <QuoteSheet job={sheetJob} onClose={() => setSheetJob(null)} />}

      {toast && (
        <div style={{ ...dr.toast, background: toast.err ? 'var(--danger)' : 'var(--ink)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ── Styles — mockup hierarchy mapped onto the app's design tokens ──────────
const dr = {
  shell: {
    height: '100%', overflowY: 'auto', background: 'var(--cream)',
    fontFamily: 'var(--font)', color: 'var(--ink)',
    paddingBottom: '150px', WebkitOverflowScrolling: 'touch',
  },
  header: {
    padding: '14px 16px 10px', position: 'sticky', top: 0, zIndex: 5,
    background: 'linear-gradient(var(--cream) 85%, transparent)',
  },
  headerRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  backBtn: {
    appearance: 'none', background: 'none', border: 'none', padding: '4px 6px',
    fontSize: '26px', lineHeight: 1, color: 'var(--ink)', cursor: 'pointer', flexShrink: 0,
  },
  dateBtn: {
    appearance: 'none', background: 'none', border: 'none', padding: 0,
    display: 'flex', alignItems: 'baseline', gap: '8px', cursor: 'pointer',
    fontFamily: 'var(--font)', color: 'var(--ink)',
  },
  dateTitle: { fontSize: '22px', margin: 0, letterSpacing: '-0.02em', fontWeight: 800 },
  dateCaret: { fontSize: '14px', color: 'var(--ink-2)' },
  subline: { color: 'var(--ink-2)', fontSize: '14px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  crewSwitch: { display: 'flex', gap: '6px', flexShrink: 0 },
  avatar: {
    width: '40px', height: '40px', borderRadius: '50%', border: '2px solid var(--line)',
    fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
  },
  weekDrop: {
    display: 'flex', gap: '6px', marginTop: '12px',
    fontSize: '13px', fontWeight: 600, textAlign: 'center',
    background: '#fff', border: '1px solid var(--line)', borderRadius: '14px', padding: '8px',
  },
  weekDay: {
    flex: 1, padding: '6px 0 8px', borderRadius: '10px', border: 'none',
    fontFamily: 'var(--font)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    lineHeight: 1.5, position: 'relative',
  },
  weekDot: {
    display: 'block', width: '4px', height: '4px', borderRadius: '50%',
    margin: '3px auto 0',
  },
  progress: { display: 'flex', gap: '6px', marginTop: '10px' },
  progressSeg: { height: '6px', flex: 1, borderRadius: '3px' },
  sectionLabel: {
    margin: '18px 20px 8px', fontSize: '13px', fontWeight: 700,
    letterSpacing: '0.08em', color: 'var(--ink-2)', textTransform: 'uppercase',
  },
  empty: { textAlign: 'center', color: 'var(--ink-3)', fontSize: '14px', padding: '60px 20px' },

  // Current stop card
  currentCard: {
    margin: '0 14px', background: '#fff', borderRadius: 'var(--radius)',
    border: '2px solid var(--terra)', boxShadow: '0 10px 24px rgba(193,90,52,0.14)',
    overflow: 'hidden',
  },
  srcBar: { height: '8px' },
  cardBody: { padding: '18px 18px 14px' },
  stopNum: {
    display: 'inline-flex', alignItems: 'center', gap: '8px',
    fontSize: '13px', fontWeight: 700, color: 'var(--terra)', letterSpacing: '0.06em',
  },
  cardName: { margin: '6px 0 2px', fontSize: '24px', letterSpacing: '-0.02em', fontWeight: 800 },
  cardAddr: { color: 'var(--ink-2)', fontSize: '16px', lineHeight: 1.35 },
  chipRow: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' },
  chip: {
    fontSize: '13px', fontWeight: 600, padding: '5px 10px',
    borderRadius: 'var(--radius-pill)', background: 'var(--cream)',
    border: '1px solid var(--line)', color: 'var(--ink)',
  },
  chipMeet:   { background: '#E9EFE0', borderColor: '#C9D6B6', color: '#3F5230' },
  chipNoMeet: { background: '#FDECE2', borderColor: '#F3C9AF', color: '#9A431F' },
  btnRow: {
    display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '10px', padding: '0 14px 14px',
  },
  btn: {
    appearance: 'none', border: 'none', borderRadius: '14px',
    fontSize: '17px', fontWeight: 700, minHeight: '56px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    fontFamily: 'var(--font)', textDecoration: 'none',
  },
  btnPrimary:   { background: 'var(--terra)', color: '#fff' },
  btnSecondary: { background: 'var(--cream)', color: 'var(--ink)', border: '1.5px solid var(--line)' },
  btnSent:      { gridColumn: '1 / -1', background: GREEN, color: '#fff', minHeight: '52px' },

  // Upcoming / done rows
  list: { margin: '0 14px', display: 'flex', flexDirection: 'column', gap: '10px' },
  row: {
    background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
    display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', minHeight: '76px',
  },
  rowNum: {
    width: '34px', height: '34px', borderRadius: '50%', background: 'var(--cream)',
    border: '1.5px solid var(--line)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 700, flexShrink: 0, fontSize: '15px',
  },
  rowInfo: { flex: 1, minWidth: 0, cursor: 'pointer' },
  rowName: {
    display: 'block', fontSize: '17px', marginBottom: '2px', fontWeight: 700,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  rowSub: {
    color: 'var(--ink-2)', fontSize: '14px', display: 'block',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  rowNav: {
    width: '52px', height: '52px', borderRadius: '14px', background: 'var(--cream)',
    border: '1.5px solid var(--line)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0, cursor: 'pointer', textDecoration: 'none',
  },
  rowDone: {
    background: '#EFE7DC', border: '1px solid transparent', borderRadius: 'var(--radius)',
    display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 16px',
    minHeight: '56px', opacity: 0.75,
  },
  doneTick: { color: GREEN, fontSize: '20px', fontWeight: 800, flexShrink: 0 },
  doneName: {
    display: 'block', fontSize: '15px', fontWeight: 700,
    textDecoration: 'line-through', textDecorationThickness: '1px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },

  // Sticky bottom bar — sits above the app's fixed bottom tab bar.
  bottomBar: {
    position: 'fixed', left: 0, right: 0,
    bottom: 'calc(var(--bottom-nav-height, 0px) + env(safe-area-inset-bottom, 0px))',
    padding: '12px 14px 14px', zIndex: 90,
    background: 'rgba(252,245,236,0.92)', backdropFilter: 'blur(12px)',
    borderTop: '1px solid var(--line)',
  },
  bottomHint: {
    fontSize: '13px', color: 'var(--ink-2)', margin: '0 4px 8px',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  bottomBtn: {
    width: '100%', fontSize: '18px', minHeight: '58px',
    boxShadow: '0 8px 20px rgba(193,90,52,0.25)',
  },
  toast: {
    position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)',
    color: '#fff', padding: '10px 18px', borderRadius: 'var(--radius-pill)',
    fontSize: '14px', fontWeight: 600, zIndex: 600, pointerEvents: 'none',
    whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
  },
}
