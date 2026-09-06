import { useState } from 'react'
import { AVAILABILITY_KINDS, kindLabel, datesBetween } from '../hooks/useAvailability'

// Add leave / a sick day / a part day for one person over a date range
// (writes one availability row per weekday), and the small popover a leave
// block opens so it can be removed again.

const fmtDay = d => new Date(d + 'T00:00:00').toLocaleDateString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short' })

const ui = {
  scrim: { position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(34,56,79,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  box: { width: '100%', maxWidth: 380, background: '#fff', borderRadius: 18, border: '1px solid var(--line)', boxShadow: '0 16px 40px -16px rgba(40,25,10,.5)', padding: '18px 18px 16px' },
  h: { fontSize: 16, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.01em', marginBottom: 2 },
  sub: { fontSize: 12, color: 'var(--ink-2)', marginBottom: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 },
  field: { marginBottom: 12 },
  input: { width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 14, border: '1px solid var(--line)', background: 'var(--cream)', color: 'var(--ink)', fontSize: 14, fontFamily: 'var(--font)', outline: 'none' },
  row: { display: 'flex', gap: 8 },
  primary: { flex: 1, minHeight: 44, borderRadius: 14, border: 'none', background: 'var(--terra)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  quiet: { minHeight: 44, padding: '0 16px', borderRadius: 14, border: '1px solid var(--line)', background: '#fff', color: 'var(--ink-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  danger: { minHeight: 44, padding: '0 16px', borderRadius: 14, border: '1px solid #F0C4B8', background: '#FFF4F1', color: '#B23A2E', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },
  err: { fontSize: 12, color: 'var(--danger)', marginBottom: 8 },
}

export default function LeavePopover({ people, initial = {}, onSave, onClose }) {
  const [userId, setUserId] = useState(initial.userId ?? people[0]?.id ?? '')
  const [start, setStart] = useState(initial.start ?? '')
  const [end, setEnd] = useState(initial.end ?? initial.start ?? '')
  const [kind, setKind] = useState(initial.kind ?? 'leave')
  const [note, setNote] = useState(initial.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const days = datesBetween(start, end || start).length

  async function save(e) {
    e?.preventDefault?.()
    if (!userId) { setError('Pick a person'); return }
    if (!start) { setError('Pick a start date'); return }
    if (end && end < start) { setError('End date is before the start'); return }
    if (!days) { setError('No weekdays in that range'); return }
    setSaving(true)
    setError(null)
    const res = await onSave({ userId, start, end: end || start, kind, note: note.trim() })
    setSaving(false)
    if (res?.error) { setError(res.error.message ?? 'Could not save'); return }
    onClose()
  }

  return (
    <div style={ui.scrim} onClick={onClose}>
      <form style={ui.box} onClick={e => e.stopPropagation()} onSubmit={save} role="dialog" aria-label="Add leave">
        <div style={ui.h}>Add leave / sick day</div>
        <div style={ui.sub}>They'll show grey on the board and drop out of the crew those days.</div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="leave-person">Person</label>
          <select id="leave-person" style={ui.input} value={userId} onChange={e => setUserId(e.target.value)}>
            {people.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div style={{ ...ui.row, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={ui.label} htmlFor="leave-start">From</label>
            <input id="leave-start" type="date" style={ui.input} value={start} onChange={e => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value) }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={ui.label} htmlFor="leave-end">To</label>
            <input id="leave-end" type="date" style={ui.input} value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="leave-kind">Kind</label>
          <select id="leave-kind" style={ui.input} value={kind} onChange={e => setKind(e.target.value)}>
            {AVAILABILITY_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </div>
        <div style={ui.field}>
          <label style={ui.label} htmlFor="leave-note">Note</label>
          <input id="leave-note" style={ui.input} value={note} placeholder="Optional — e.g. back Thursday pm" onChange={e => setNote(e.target.value)} />
        </div>
        {error && <div style={ui.err}>{error}</div>}
        <div style={ui.row}>
          <button type="submit" style={{ ...ui.primary, opacity: saving ? 0.6 : 1 }} disabled={saving}>
            {saving ? 'Saving…' : days ? `Save ${days} day${days === 1 ? '' : 's'}` : 'Save'}
          </button>
          <button type="button" style={ui.quiet} onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  )
}

// A leave block's own popover: who, when, why — and Remove.
export function LeaveDetail({ user, block, onRemove, onClose, anchor }) {
  const [busy, setBusy] = useState(false)
  const dates = block?.dates ?? []
  const first = dates[0], last = dates[dates.length - 1]
  const top = Math.min((anchor?.bottom ?? window.innerHeight / 2) + 6, window.innerHeight - 220)
  const left = Math.min(Math.max(anchor?.left ?? window.innerWidth / 2 - 130, 8), window.innerWidth - 280)
  async function remove() {
    setBusy(true)
    await onRemove(user.id, dates)
    setBusy(false)
    onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Leave details"
        style={{ position: 'fixed', top, left, width: 270, background: '#fff', borderRadius: 14, border: '1px solid var(--line)', boxShadow: '0 12px 32px -12px rgba(40,25,10,.35)', padding: 14, zIndex: 601 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{user?.name ?? 'Staff'} · {kindLabel(block?.kind)}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2 }}>
          {first && (first === last ? fmtDay(first) : `${fmtDay(first)} – ${fmtDay(last)}`)}
          {dates.length > 1 ? ` · ${dates.length} days` : ''}
        </div>
        {block?.note && <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6, background: 'var(--cream)', borderRadius: 10, padding: '6px 8px' }}>{block.note}</div>}
        <div style={{ ...ui.row, marginTop: 12 }}>
          <button style={{ ...ui.danger, flex: 1, opacity: busy ? 0.6 : 1 }} onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove leave'}</button>
          <button style={ui.quiet} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
