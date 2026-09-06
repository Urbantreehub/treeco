import { STATUS_ORDER, STEP_LABELS, SIDE_STATUSES, statusIndex, getStatus } from '../config/statuses'

// Display-only stepper for the eight forward statuses. Status changes come
// from the record's primary action and its … menu, never from here — events
// drive the steps so the stepper cannot lie.
//
//   status       the job's current status (forward or side)
//   forwardHint  for a side state (on_hold / declined): the last forward status
//                the job was on, so the done steps still read correctly
//   trailing     optional node rendered at the right end (e.g. "Portal: approved")
//   compact      phone layout — steps wrap onto two rows instead of scrolling
export default function StatusStepper({ status, forwardHint = null, trailing = null, compact = false }) {
  const side = SIDE_STATUSES.includes(status) ? status : null
  const activeKey = side ? forwardHint : status
  const nowIdx = statusIndex(activeKey)
  const sideMeta = side ? getStatus(side) : null

  return (
    <div style={{ ...st.wrap, ...(compact ? st.wrapCompact : {}) }} aria-label="Job progress">
      <div style={{ ...st.steps, ...(compact ? st.stepsCompact : {}) }}>
        {STATUS_ORDER.map((key, i) => {
          const state = nowIdx < 0 ? 'todo' : i < nowIdx ? 'done' : i === nowIdx && !side ? 'now' : i === nowIdx ? 'done' : 'todo'
          const prevDone = i > 0 && nowIdx >= 0 && (i - 1 < nowIdx || (side && i - 1 <= nowIdx))
          return (
            <span key={key} style={{ ...st.step, color: state === 'now' ? 'var(--ink)' : state === 'done' ? 'var(--ink-2)' : 'var(--ink-3)' }}
              aria-current={state === 'now' ? 'step' : undefined}
              title={getStatus(key)?.label}>
              {i > 0 && !compact && <span style={{ ...st.bar, background: prevDone ? 'var(--ink-3)' : 'var(--line)' }} />}
              <span style={{
                ...st.dot,
                ...(state === 'done' ? st.dotDone : state === 'now' ? st.dotNow : {}),
              }} />
              <span style={st.label}>{STEP_LABELS[key] ?? key}</span>
            </span>
          )
        })}
      </div>
      {(side || trailing) && (
        <div style={st.trail}>
          {side && (
            <span style={{ ...st.sidePill, background: sideMeta.color + '1F', color: sideMeta.color }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: sideMeta.color }} />
              {sideMeta.label}
            </span>
          )}
          {!side && trailing}
        </div>
      )}
    </div>
  )
}

const st = {
  wrap: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    background: 'var(--cream)', border: '1px solid var(--line)', borderRadius: 'var(--radius-ctrl)',
    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
  },
  wrapCompact: { flexWrap: 'wrap', overflowX: 'visible', gap: 8 },
  steps: { display: 'flex', alignItems: 'center', flex: '1 0 auto' },
  stepsCompact: { flexWrap: 'wrap', rowGap: 8, columnGap: 14, flex: '1 1 auto' },
  step: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' },
  bar: { width: 16, height: 2, margin: '0 5px', flexShrink: 0, borderRadius: 1 },
  dot: { width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--line)', background: '#fff', display: 'inline-block', flexShrink: 0, boxSizing: 'border-box' },
  dotDone: { background: 'var(--ink-3)', borderColor: 'var(--ink-3)' },
  dotNow: { background: 'var(--terra)', borderColor: 'var(--terra)', boxShadow: '0 0 0 3px var(--terra-wash)' },
  label: {},
  trail: {
    display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', paddingLeft: 12, flexShrink: 0,
    borderLeft: '1px solid var(--line)', fontSize: 11, fontWeight: 600, color: 'var(--ink-3)', whiteSpace: 'nowrap',
  },
  sidePill: { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700 },
}
