import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from '../context/AuthContext'

// ── Sign-off / acknowledgement ────────────────────────────────────────────────
// Kiosk: one staff device passed around a toolbox. Each person picks their name,
// agrees to the statement and signs → one row in safety_acknowledgements, with a
// snapshot of the current SWMS/SOP/policy pack so it stays meaningful after edits.

const STATEMENT =
  'I confirm I have read and understood the current Safe Work Method Statements (SWMS), ' +
  'Standard Operating Procedures (SOPs) and Health & Safety policies listed above, and I ' +
  'agree to follow them while working for Urban Tree Services.'

function todayNZ() {
  return new Date().toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateTime(d) {
  return d ? new Date(d).toLocaleString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}
function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}

export default function TeamSignoff() {
  const { profile, isStaff } = useAuth()
  const [users, setUsers] = useState([])
  const [policies, setPolicies] = useState([])
  const [acks, setAcks] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [view, setView] = useState('menu') // menu | sign | register
  const [meetingRef, setMeetingRef] = useState(`Toolbox ${todayNZ()}`)

  // Current safety-doc pack (SWMS + SOPs from local library, policies from DB)
  const pack = useMemo(() => {
    const swms = readLS('treeco_swms_v2').map(d => ({ type: 'SWMS', title: d.title, version: d.version ?? '1.0' }))
    const sop  = readLS('treeco_sop_v1').map(d => ({ type: 'SOP', title: d.title, version: d.version ?? '1.0' }))
    const pol  = policies.map(d => ({ type: 'Policy', title: d.title, version: `v${d.version ?? 1}` }))
    return {
      counts: { swms: swms.length, sop: sop.length, policy: pol.length },
      docs: [...swms, ...sop, ...pol],
    }
  }, [policies])

  const load = useCallback(async () => {
    setLoading(true)
    const [u, p, a] = await Promise.all([
      supabase.from('users').select('id, name').order('name'),
      supabase.from('safety_documents').select('title, version, status').in('doc_type', ['policy', 'sssp']),
      supabase.from('safety_acknowledgements').select('*').order('signed_at', { ascending: false }),
    ])
    setUsers(u.data ?? [])
    setPolicies((p.data ?? []).filter(d => d.status !== 'archived'))
    if (a.error && /relation|does not exist|schema cache/i.test(a.error.message)) setTableMissing(true)
    else { setAcks(a.data ?? []); setTableMissing(false) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div style={st.empty}>Loading…</div>
  if (tableMissing) return (
    <div style={st.notice}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Sign-off not activated yet</div>
      Run migration <code style={st.code}>025_safety_acknowledgements.sql</code> in the Supabase SQL editor, then reload.
    </div>
  )

  // A logged-in crew member signs as themselves — skip the name picker entirely.
  const selfSigner = !isStaff && profile?.id ? { id: profile.id, name: profile.name } : null

  if (view === 'sign')
    return <SignFlow users={users} pack={pack} meetingRef={meetingRef} setMeetingRef={setMeetingRef}
      operatorId={profile?.id} selfSigner={selfSigner} onExit={() => { setView('menu'); load() }} />
  if (view === 'register')
    return <Register acks={acks} users={users} meetingRef={meetingRef} isStaff={isStaff} onBack={() => setView('menu')} onReload={load} />

  // ── Menu ──
  const signedThisMeeting = acks.filter(a => a.meeting_ref === meetingRef)
  return (
    <div style={{ maxWidth: 640 }}>
      <p style={st.lead}>
        One tap-through per person: confirm they’ve read the current safety docs and sign. Built for a
        shared device at the toolbox — pass it around the crew.
      </p>

      <div style={st.packCard}>
        <div style={st.packTitle}>Current safety pack</div>
        <div style={st.packRow}>
          <PackStat n={pack.counts.swms} label="SWMS" />
          <PackStat n={pack.counts.sop} label="SOPs" />
          <PackStat n={pack.counts.policy} label="Policies" />
        </div>
      </div>

      <div style={st.field}>
        <div style={st.fieldLabel}>Meeting / occasion</div>
        <input style={st.input} value={meetingRef} onChange={e => setMeetingRef(e.target.value)}
          placeholder="e.g. Toolbox 31 Jul 2026" />
        <div style={st.hint}>{signedThisMeeting.length} signed so far for “{meetingRef}”.</div>
      </div>

      <button style={st.primaryBtn} onClick={() => setView('sign')} disabled={!meetingRef.trim()}>
        ✍️ Start signing
      </button>
      <button style={st.secondaryBtn} onClick={() => setView('register')}>
        📋 View sign-off register
      </button>
    </div>
  )
}

function PackStat({ n, label }) {
  return (
    <div style={st.packStat}>
      <div style={st.packNum}>{n}</div>
      <div style={st.packLbl}>{label}</div>
    </div>
  )
}

// ── Sign flow (kiosk) ─────────────────────────────────────────────────────────
function SignFlow({ users, pack, meetingRef, setMeetingRef, operatorId, selfSigner, onExit }) {
  const [step, setStep] = useState(selfSigner ? 'sign' : 'who') // who | sign | done
  const [signer, setSigner] = useState(selfSigner ?? null)      // { id, name } | { id:null, name }
  const [typedName, setTypedName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [sigData, setSigData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [lastSigned, setLastSigned] = useState(null)

  function pick(u) { setSigner(u); setStep('sign') }
  function reset() {
    if (selfSigner) { onExit(); return } // crew self-sign: nothing to reset to, just leave
    setSigner(null); setTypedName(''); setAgreed(false); setSigData(null); setError(null); setStep('who')
  }

  async function submit() {
    setSaving(true); setError(null)
    const { error } = await supabase.from('safety_acknowledgements').insert({
      user_id: signer?.id ?? null,
      signer_name: signer?.name ?? typedName.trim(),
      scope: 'all',
      doc_snapshot: pack,
      statement: STATEMENT,
      signature_data: sigData,
      meeting_ref: meetingRef,
      signed_by: operatorId ?? null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setLastSigned(signer?.name ?? typedName.trim())
    setStep('done')
  }

  // ── Who ──
  if (step === 'who') {
    return (
      <div style={{ maxWidth: 640 }}>
        <FlowHead title="Who’s signing?" onExit={onExit} sub={meetingRef} />
        <div style={st.nameGrid}>
          {users.map(u => (
            <button key={u.id} style={st.nameBtn} onClick={() => pick(u)}>{u.name}</button>
          ))}
        </div>
        <div style={st.field}>
          <div style={st.fieldLabel}>Not listed? Type a name</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={st.input} value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Full name" />
            <button style={{ ...st.primaryBtn, width: 'auto', margin: 0, whiteSpace: 'nowrap' }}
              disabled={!typedName.trim()} onClick={() => pick({ id: null, name: typedName.trim() })}>Next</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Done ──
  if (step === 'done') {
    return (
      <div style={{ maxWidth: 640, textAlign: 'center', padding: '32px 0' }}>
        <div style={{ fontSize: 52 }}>✅</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bark)', margin: '8px 0 4px' }}>{lastSigned} signed</div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>Recorded for “{meetingRef}”.</div>
        {!selfSigner && <button style={st.primaryBtn} onClick={reset}>➡️ Sign next person</button>}
        <button style={selfSigner ? st.primaryBtn : st.secondaryBtn} onClick={onExit}>Done{selfSigner ? '' : ' — back to Sign-off'}</button>
      </div>
    )
  }

  // ── Sign ──
  return (
    <div style={{ maxWidth: 640 }}>
      <FlowHead title={`Sign — ${signer?.name}`} onExit={reset} sub="Read, agree & sign below" backLabel={selfSigner ? '← Cancel' : '← Change person'} />

      <div style={st.docList}>
        <div style={st.docListHead}>You are acknowledging {pack.docs.length} current documents:</div>
        <div style={st.docChips}>
          {pack.docs.map((d, i) => (
            <span key={i} style={st.docChip}><b>{d.type}</b> {d.title}</span>
          ))}
        </div>
      </div>

      <label style={st.agreeRow}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }} />
        <span style={st.agreeText}>{STATEMENT}</span>
      </label>

      <div style={st.field}>
        <div style={st.fieldLabel}>Signature</div>
        <SignaturePad onChange={setSigData} />
      </div>

      {error && <div style={st.errorBox}>Couldn’t save: {error}</div>}

      <button style={st.primaryBtn} disabled={!agreed || !sigData || saving} onClick={submit}>
        {saving ? 'Saving…' : '✔ Confirm & record sign-off'}
      </button>
      {!agreed && <div style={st.hint}>Tick the box and add a signature to continue.</div>}
    </div>
  )
}

function FlowHead({ title, sub, onExit, backLabel = '← Cancel' }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <button style={st.backBtn} onClick={onExit}>{backLabel}</button>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bark)', marginTop: 10 }}>{title}</div>
      {sub && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Signature pad ───────────────────────────────────────────────────────────
function SignaturePad({ onChange }) {
  const ref = useRef(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = ref.current
    const ctx = c.getContext('2d')
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#1f2a17'
  }, [])

  function pos(e) {
    const c = ref.current
    const r = c.getBoundingClientRect()
    const t = e.touches?.[0] ?? e
    return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }
  }
  function start(e) { e.preventDefault(); drawing.current = true; const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  function move(e) { if (!drawing.current) return; e.preventDefault(); const ctx = ref.current.getContext('2d'); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true }
  function end() { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current.toDataURL('image/png')) }
  function clear() { const c = ref.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null) }

  return (
    <div>
      <canvas ref={ref} width={600} height={180} style={st.canvas}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button style={st.clearBtn} onClick={clear}>Clear signature</button>
    </div>
  )
}

// ── Register ────────────────────────────────────────────────────────────────
function Register({ acks, users, meetingRef, isStaff, onBack, onReload }) {
  const [filter, setFilter] = useState(meetingRef)
  const meetings = [...new Set(acks.map(a => a.meeting_ref).filter(Boolean))]
  const rows = acks.filter(a => filter === 'ALL' || a.meeting_ref === filter)
  const signedIds = new Set(rows.map(r => r.user_id).filter(Boolean))
  const outstanding = filter === 'ALL' ? [] : users.filter(u => !signedIds.has(u.id))

  return (
    <div style={{ maxWidth: 680 }}>
      <button style={st.backBtn} onClick={onBack}>← Sign-off</button>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--bark)', margin: '10px 0 14px' }}>Sign-off register</div>

      <div style={st.field}>
        <div style={st.fieldLabel}>Meeting</div>
        <select style={st.input} value={filter} onChange={e => setFilter(e.target.value)}>
          {!meetings.includes(meetingRef) && <option value={meetingRef}>{meetingRef}</option>}
          {meetings.map(m => <option key={m} value={m}>{m}</option>)}
          <option value="ALL">— All sign-offs —</option>
        </select>
      </div>

      {rows.length === 0 ? <div style={st.empty}>No sign-offs recorded yet.</div> : (
        <div style={st.list}>
          {rows.map(r => (
            <div key={r.id} style={st.ackRow}>
              {r.signature_data
                ? <img src={r.signature_data} alt="signature" style={st.sigThumb} />
                : <div style={{ ...st.sigThumb, display: 'grid', placeItems: 'center', color: '#bbb', fontSize: 11 }}>no sig</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={st.ackName}>{r.signer_name}</div>
                <div style={st.ackMeta}>{fmtDateTime(r.signed_at)} · {r.doc_snapshot?.docs?.length ?? 0} docs · {r.meeting_ref}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {outstanding.length > 0 && (
        <>
          <div style={{ ...st.fieldLabel, marginTop: 22 }}>Not yet signed ({outstanding.length})</div>
          <div style={st.outstandingWrap}>
            {outstanding.map(u => <span key={u.id} style={st.outChip}>{u.name}</span>)}
          </div>
        </>
      )}
    </div>
  )
}

// ── styles ──
const st = {
  lead: { fontSize: 14, color: '#888', marginBottom: 20, lineHeight: 1.5 },
  empty: { color: '#bbb', fontSize: 14, padding: '32px 0', textAlign: 'center' },
  notice: { background: '#FDF3E3', border: '1px solid #E6D3A8', borderRadius: 10, padding: '16px 18px', fontSize: 14, color: '#7a5c12', maxWidth: 520 },
  code: { background: '#00000010', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 },
  packCard: { background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 },
  packTitle: { fontSize: 11, fontWeight: 800, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 },
  packRow: { display: 'flex', gap: 12 },
  packStat: { flex: 1, textAlign: 'center', background: '#F7FAF3', borderRadius: 10, padding: '12px 8px' },
  packNum: { fontSize: 26, fontWeight: 800, color: 'var(--moss)' },
  packLbl: { fontSize: 12, color: '#888', marginTop: 2 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 },
  hint: { fontSize: 12, color: '#aaa', marginTop: 6 },
  input: { width: '100%', padding: '11px 13px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 15, color: 'var(--bark)', fontFamily: 'var(--font)', boxSizing: 'border-box', background: '#fff' },
  primaryBtn: { display: 'block', width: '100%', background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 10, padding: '15px 18px', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 8 },
  secondaryBtn: { display: 'block', width: '100%', background: '#fff', color: 'var(--terra)', border: '1.5px solid var(--border)', borderRadius: 10, padding: '13px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)', marginTop: 10 },
  backBtn: { background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--terra)', fontFamily: 'var(--font)' },
  nameGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 20 },
  nameBtn: { background: '#fff', border: '1.5px solid #E0E8D8', borderRadius: 12, padding: '18px 14px', fontSize: 16, fontWeight: 700, color: 'var(--bark)', cursor: 'pointer', fontFamily: 'var(--font)' },
  docList: { background: '#F7FAF3', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 },
  docListHead: { fontSize: 12, fontWeight: 700, color: '#7a8a6a', marginBottom: 8 },
  docChips: { display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto' },
  docChip: { fontSize: 11, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', color: '#555' },
  agreeRow: { display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, cursor: 'pointer' },
  agreeText: { fontSize: 13, color: 'var(--bark)', lineHeight: 1.5 },
  canvas: { width: '100%', height: 180, background: '#fff', border: '2px dashed #C9D6BC', borderRadius: 10, touchAction: 'none', display: 'block', boxSizing: 'border-box' },
  clearBtn: { background: 'none', border: 'none', color: 'var(--sky)', textDecoration: 'underline', fontSize: 12, cursor: 'pointer', marginTop: 6, padding: 0, fontFamily: 'var(--font)' },
  errorBox: { background: '#FFF0EE', border: '1px solid #E0B4B0', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#C0392B', marginBottom: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  ackRow: { display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' },
  sigThumb: { width: 68, height: 40, objectFit: 'contain', background: '#F7FAF3', borderRadius: 6, border: '1px solid var(--border)', flexShrink: 0 },
  ackName: { fontSize: 14, fontWeight: 700, color: 'var(--bark)' },
  ackMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  outstandingWrap: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  outChip: { fontSize: 12, background: '#FFF0EE', color: '#C0392B', border: '1px solid #F0D0CC', borderRadius: 6, padding: '4px 9px', fontWeight: 600 },
}
