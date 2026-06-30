import { useState, useCallback } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────

const WEATHER_OPTIONS = [
  'Fine / sunny', 'Overcast', 'Light rain', 'Heavy rain / showers',
  'Fog / low visibility', 'Thunderstorm',
]
const WIND_OPTIONS = [
  ['calm',     'Calm (< 10 km/h)'],
  ['light',    'Light breeze (10–20 km/h)'],
  ['moderate', 'Moderate (20–40 km/h)'],
  ['strong',   'Strong (40–60 km/h) — assess carefully'],
  ['gale',     'Gale (> 60 km/h) — STOP WORK'],
]

// Power line distances per WorkSafe / ECP 34
const SITE_HAZARDS = [
  'Overhead power lines ≤110kV — 4m minimum exclusion (written consent required)',
  'Overhead power lines >110kV — 6m minimum exclusion (no exceptions)',
  'Underground services (gas / power / water / telecom) — notify authority before work',
  'Adjacent buildings / structures',
  'Pedestrians / public — exclusion zone required',
  'Road / traffic — corridor manager advised, signage in place',
  'Steep slopes or unstable terrain',
  'Soft / waterlogged ground',
  'Wasps, bees, or other wildlife',
  'Chemical / pesticide use on site',
  'Remote or isolated location',
  'Manual handling (heavy lifts)',
  'Noise / vibration (chainsaw, chipper)',
  'Fire hazard (dry conditions, fuel storage)',
]

const TREE_CONDITIONS = [
  'Sound / live', 'Declining / stressed', 'Dead (standing snag)',
  'Storm damaged', 'Flood / root zone damaged',
]
const TREE_DEFECTS = [
  'Dead wood in canopy', 'Cavity / hollow', 'Co-dominant leaders / tight union',
  'Significant lean', 'Root damage or exposure', 'Previous failure / old wound',
  'Fungal fruiting bodies (bracket / conks)', 'Bark inclusions', 'Overextended limbs',
]
const WORK_TYPES = [
  'Complete felling (open fall)', 'Sectional dismantling', 'Crown lift',
  'Crown reduction', 'Selective pruning / deadwooding', 'Climbing (rope access)',
  'Rigging / lowering limbs', 'Aerial work platform (EWP)',
  'Stump grinding', 'Chipping / mulching', 'Emergency / storm response',
  'Vegetation clearance / scrub cutting',
]
const EQUIPMENT_LIST = [
  'Chainsaw (handheld) — pre-use inspection required',
  'Pole chainsaw / top-handle saw',
  'Handsaw / pruning saw',
  'Wood chipper — anti-kickback device checked',
  'Stump grinder',
  'EWP / cherry picker — engineer cert current',
  'Crane / crane truck — Approved CoP for Cranes applies',
  'Ute / truck / trailer',
  'Loader / excavator',
  'Ropes & rigging gear — SWL = 1/6 breaking strength',
  'Friction device / lowering device — minimum 22 kN rated',
  'Ladder — NZS 5233 compliant, non-metallic near power lines',
  'Wire rope / winch',
]

// PPE with NZ/AU standards per WorkSafe Arboriculture Guide
const PPE_REQUIRED = [
  'Arborist helmet with face shield / visor (NZS 5806 compliant, chin strap fitted)',
  'Chainsaw-protective trousers or chaps (AS/NZS 4453.3:1997)',
  'Chainsaw-resistant gloves / safety mittens',
  'Safety boots — steel toe cap, sole plate, ankle support (AS/NZS 2210)',
  'Hi-visibility vest',
  'Hearing protection — Grade 4 minimum for chainsaw / chipper work',
]
const PPE_ADDITIONAL = [
  'Safety harness — work positioning (AS/NZS 1891 compliant)',
  'Work-positioning lanyard (safety strop / flip line — minimum 22 kN)',
  'Carabiners / snap hooks — auto-locking, minimum 22 kN',
  'Climbing line — minimum 22 kN breaking strain, no joining splices',
  'Eye / face protection (grinding)',
  'Dust / P2 respirator (stump grinding or dry debris)',
  'Wet weather gear',
  'Chemical / pesticide PPE',
  'Sun protection (hat, sunscreen)',
  'Tree-climbing spurs — pre-use inspection of spikes, straps, buckles',
]

const LIKELIHOOD_LABELS = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain']
const CONSEQUENCE_LABELS = ['', 'Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic']

// Risk matrix: score = L × C
function riskLevel(l, c) {
  const score = Number(l) * Number(c)
  if (score >= 15) return { label: 'CRITICAL', color: '#C0392B', bg: '#FFF0EE' }
  if (score >= 8)  return { label: 'HIGH',     color: '#D4851A', bg: '#FDF3E3' }
  if (score >= 4)  return { label: 'MEDIUM',   color: '#6B7280', bg: '#F3F4F6' }
  if (score >= 1)  return { label: 'LOW',      color: '#4A6741', bg: '#E8F0E6' }
  return { label: '—', color: '#bbb', bg: '#fafafa' }
}

// ── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY = 'treeco_risk_assessments'

function loadAssessments() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') } catch { return [] }
}
function saveAssessments(list) {
  localStorage.setItem(LS_KEY, JSON.stringify(list))
}
function genId() {
  return `ra_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return new Date(Number(y), Number(m) - 1, Number(day)).toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function blankForm() {
  return {
    id: genId(),
    // 1. Job Info
    site_address: '', job_number: '', date: todayStr(), supervisor: '', crew: '',
    notifiable_work: false, worksafe_notified: false, worksafe_notification_ref: '',
    subcontractors_on_site: false, subcontractors_detail: '',
    // 2. Weather
    weather: [], wind_speed: 'calm',
    // 3. Site Hazards
    site_hazards: [],
    // 4. Tree Info
    species: '', height_m: '', dbh_cm: '', condition: TREE_CONDITIONS[0],
    defects: [], lean_direction: '', tree_notes: '',
    // 5. Work Type
    work_types: [],
    felling_escape_route: '', felling_exclusion_zone: '',
    // 6. Equipment
    equipment: [],
    chainsaw_pre_use_checked: false,
    // 7. PPE
    ppe_required: [...PPE_REQUIRED], ppe_additional: [],
    // 8. Aerial Rescue & Emergency
    work_above_3m: false,
    aerial_rescue_person_name: '', aerial_rescue_person_trained: false,
    rescue_equipment_present: false, rescue_procedure_communicated: false,
    first_aid_kit_present: false, emergency_comms_available: false,
    nearest_hospital: '', emergency_contact_name: '', emergency_contact_phone: '',
    exclusion_zone_established: false, exclusion_zone_detail: '',
    // 9. Risk Rating — keyed by hazard string
    // risks[h] = { likelihood, consequence, eliminate, isolate, minimise, residual_likelihood, residual_consequence }
    risks: {},
    additional_controls: '',
    // 10. Sign-Off
    pre_work_briefing_conducted: false,
    sign_off_supervisor: '', sign_off_date: todayStr(), sign_off_crew: '',
    status: 'draft',
  }
}

function toggle(arr, val) {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

// ── Main export — list view ──────────────────────────────────────────────────

export default function RiskAssessments() {
  const [assessments, setAssessments] = useState(loadAssessments)
  const [view, setView]   = useState('list')
  const [current, setCurrent] = useState(null)

  const openNew    = () => { setCurrent(blankForm()); setView('form') }
  const openDetail = (a) => { setCurrent(a); setView('detail') }

  const handleSave = useCallback((form) => {
    const list = assessments.some(a => a.id === form.id)
      ? assessments.map(a => a.id === form.id ? form : a)
      : [form, ...assessments]
    setAssessments(list); saveAssessments(list); setView('list')
  }, [assessments])

  const handleDelete = useCallback((id) => {
    if (!confirm('Delete this risk assessment? This cannot be undone.')) return
    const list = assessments.filter(a => a.id !== id)
    setAssessments(list); saveAssessments(list); setView('list'); setCurrent(null)
  }, [assessments])

  if (view === 'form') return (
    <RiskAssessmentForm
      initial={current}
      onSave={handleSave}
      onDelete={() => handleDelete(current.id)}
      onCancel={() => setView('list')}
    />
  )
  if (view === 'detail') return (
    <RiskAssessmentDetail
      assessment={current}
      onEdit={() => setView('form')}
      onDelete={() => handleDelete(current.id)}
      onBack={() => setView('list')}
    />
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={s.sectionTitle}>Risk Assessments · {assessments.length}</div>
        <button style={s.addBtn} onClick={openNew}>+ New Assessment</button>
      </div>
      {assessments.length === 0 ? (
        <div style={s.empty}>No risk assessments yet — tap "New Assessment" to create one.</div>
      ) : (
        <div style={s.list}>
          {assessments.map(a => {
            const highRisks = Object.values(a.risks ?? {}).filter(r => {
              const lv = riskLevel(r.residual_likelihood ?? r.likelihood, r.residual_consequence ?? r.consequence)
              return lv.label === 'HIGH' || lv.label === 'CRITICAL'
            }).length
            return (
              <div key={a.id} style={s.row} onClick={() => openDetail(a)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.rowTitle}>{a.site_address || 'Untitled site'}</div>
                  <div style={s.rowMeta}>
                    {fmtDate(a.date)}
                    {a.supervisor ? ` · ${a.supervisor}` : ''}
                    {a.work_types?.length ? ` · ${a.work_types.length} work type${a.work_types.length !== 1 ? 's' : ''}` : ''}
                    {highRisks > 0 ? ` · ⚠ ${highRisks} residual HIGH+` : ''}
                    {a.notifiable_work ? ' · NOTIFIABLE' : ''}
                  </div>
                </div>
                <span style={{ ...s.badge, ...(a.status === 'complete' ? { background: '#E8F0E6', color: '#4A6741' } : { background: '#FDF3E3', color: '#D4851A' }) }}>
                  {a.status === 'complete' ? 'Signed off' : 'Draft'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Risk Assessment Form ─────────────────────────────────────────────────────

function RiskAssessmentForm({ initial, onSave, onDelete, onCancel }) {
  const [form, setForm] = useState(initial)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function updateHazards(hazards) {
    const existing = form.risks ?? {}
    const updated = {}
    hazards.forEach(h => {
      updated[h] = existing[h] ?? {
        likelihood: '', consequence: '',
        eliminate: '', isolate: '', minimise: '',
        residual_likelihood: '', residual_consequence: '',
      }
    })
    setForm(f => ({ ...f, site_hazards: hazards, risks: updated }))
  }

  function updateRisk(hazard, field, val) {
    setForm(f => ({
      ...f,
      risks: { ...f.risks, [hazard]: { ...(f.risks[hazard] ?? {}), [field]: val } },
    }))
  }

  const fellingSelected = form.work_types.some(w => w.includes('felling') || w.includes('dismantling'))
  const hasHazards = form.site_hazards.length > 0

  return (
    <div style={s.formWrap}>
      <div style={s.formHeader}>
        <button style={s.backBtn} onClick={onCancel}>← Back</button>
        <span style={s.formTitle}>{initial?.site_address ? `Edit — ${initial.site_address}` : 'New Risk Assessment'}</span>
      </div>

      {/* ── 1. Job Information ── */}
      <Section title="1. Job Information">
        <FieldRow>
          <Field label="Site / Address">
            <input style={s.input} value={form.site_address} onChange={e => set('site_address', e.target.value)} placeholder="e.g. 14 Green St, Upper Hutt" />
          </Field>
          <Field label="Job / Work Order #">
            <input style={s.input} value={form.job_number} onChange={e => set('job_number', e.target.value)} placeholder="e.g. J-2024-042" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Date">
            <input type="date" style={s.input} value={form.date} onChange={e => set('date', e.target.value)} />
          </Field>
          <Field label="Supervisor / Foreman">
            <input style={s.input} value={form.supervisor} onChange={e => set('supervisor', e.target.value)} placeholder="Full name" />
          </Field>
        </FieldRow>
        <Field label="Crew members on site">
          <textarea style={{ ...s.input, minHeight: 52 }} value={form.crew} onChange={e => set('crew', e.target.value)} placeholder="e.g. Lea Molloy, Stuart Wilson, Joel Ewan" />
        </Field>

        <div style={s.subHead}>Notifiable Work (HSWA 2015 / SiteWise Q9)</div>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={form.notifiable_work} onChange={e => set('notifiable_work', e.target.checked)} style={s.cb} />
          This work is notifiable under the Health and Safety at Work Act 2015
        </label>
        {form.notifiable_work && (
          <div style={{ marginTop: 10 }}>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={form.worksafe_notified} onChange={e => set('worksafe_notified', e.target.checked)} style={s.cb} />
              WorkSafe NZ has been notified
            </label>
            <Field label="WorkSafe notification reference number">
              <input style={{ ...s.input, marginTop: 6 }} value={form.worksafe_notification_ref} onChange={e => set('worksafe_notification_ref', e.target.value)} placeholder="e.g. NOT-2026-012345" />
            </Field>
          </div>
        )}

        <div style={{ ...s.subHead, marginTop: 12 }}>Subcontractors</div>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={form.subcontractors_on_site} onChange={e => set('subcontractors_on_site', e.target.checked)} style={s.cb} />
          Subcontractors / labour-only workers will be on site
        </label>
        {form.subcontractors_on_site && (
          <Field label="Subcontractor names / companies">
            <textarea style={{ ...s.input, minHeight: 52, marginTop: 6 }} value={form.subcontractors_detail} onChange={e => set('subcontractors_detail', e.target.value)} placeholder="Names and companies — their H&S induction / prequalification must be verified" />
          </Field>
        )}
      </Section>

      {/* ── 2. Weather ── */}
      <Section title="2. Weather Conditions">
        <Field label="Conditions (select all that apply)">
          <CheckGroup options={WEATHER_OPTIONS} value={form.weather} onChange={v => set('weather', toggle(form.weather, v))} />
        </Field>
        <Field label="Wind speed">
          <select style={s.input} value={form.wind_speed} onChange={e => set('wind_speed', e.target.value)}>
            {WIND_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {form.wind_speed === 'gale' && (
            <div style={s.stopWork}>⚠ Wind speed exceeds safe threshold — work must not proceed. WorkSafe requires suspension in adverse conditions.</div>
          )}
        </Field>
      </Section>

      {/* ── 3. Site Hazards ── */}
      <Section title="3. Site Hazards">
        <div style={s.hint}>Identified hazards will populate the Risk Rating section below. Power line distances are legal minimums per WorkSafe ECP 34.</div>
        <Field label="Identify all hazards present on site">
          <CheckGroup options={SITE_HAZARDS} value={form.site_hazards} onChange={v => updateHazards(toggle(form.site_hazards, v))} />
        </Field>
      </Section>

      {/* ── 4. Tree Information ── */}
      <Section title="4. Tree Information">
        <FieldRow>
          <Field label="Species">
            <input style={s.input} value={form.species} onChange={e => set('species', e.target.value)} placeholder="e.g. Eucalyptus regnans" />
          </Field>
          <Field label="Est. height (m)">
            <input type="number" style={s.input} value={form.height_m} onChange={e => set('height_m', e.target.value)} placeholder="15" min="0" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="DBH (cm)">
            <input type="number" style={s.input} value={form.dbh_cm} onChange={e => set('dbh_cm', e.target.value)} placeholder="45" min="0" />
          </Field>
          <Field label="Overall condition">
            <select style={s.input} value={form.condition} onChange={e => set('condition', e.target.value)}>
              {TREE_CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </FieldRow>
        <Field label="Defects / structural issues observed">
          <CheckGroup options={TREE_DEFECTS} value={form.defects} onChange={v => set('defects', toggle(form.defects, v))} />
        </Field>
        <FieldRow>
          <Field label="Lean direction (if applicable)">
            <input style={s.input} value={form.lean_direction} onChange={e => set('lean_direction', e.target.value)} placeholder="e.g. North-west" />
          </Field>
        </FieldRow>
        <Field label="Additional tree notes">
          <textarea style={{ ...s.input, minHeight: 56 }} value={form.tree_notes} onChange={e => set('tree_notes', e.target.value)} placeholder="Any other observations relevant to safe work…" />
        </Field>
      </Section>

      {/* ── 5. Work Type ── */}
      <Section title="5. Work Type">
        <Field label="Select all work to be carried out">
          <CheckGroup options={WORK_TYPES} value={form.work_types} onChange={v => set('work_types', toggle(form.work_types, v))} />
        </Field>
        {fellingSelected && (
          <div style={s.alertBox}>
            <div style={s.subHead}>Felling Requirements (WorkSafe)</div>
            <Field label="Planned escape route (45° either side of fall line — describe)">
              <input style={s.input} value={form.felling_escape_route} onChange={e => set('felling_escape_route', e.target.value)} placeholder="e.g. North-east, cleared 5m, no obstructions" />
            </Field>
            <Field label="Bystander exclusion zone (minimum 2× tree length in all directions)">
              <input style={s.input} value={form.felling_exclusion_zone} onChange={e => set('felling_exclusion_zone', e.target.value)} placeholder="e.g. 30m radius, tape and cones in place" />
            </Field>
          </div>
        )}
      </Section>

      {/* ── 6. Equipment ── */}
      <Section title="6. Equipment">
        <Field label="Equipment to be used on site (SWL and manufacturer specs must be observed)">
          <CheckGroup options={EQUIPMENT_LIST} value={form.equipment} onChange={v => set('equipment', toggle(form.equipment, v))} />
        </Field>
        {form.equipment.some(e => e.includes('Chainsaw')) && (
          <label style={{ ...s.checkLabel, marginTop: 10 }}>
            <input type="checkbox" checked={form.chainsaw_pre_use_checked} onChange={e => set('chainsaw_pre_use_checked', e.target.checked)} style={s.cb} />
            Chainsaw pre-use inspection completed (chain, bar, brake, guard, fuel cap, handles, chain tension)
          </label>
        )}
      </Section>

      {/* ── 7. PPE ── */}
      <Section title="7. PPE Requirements">
        <div style={s.hint}>Standards per WorkSafe Arboriculture Guide. Uncheck any items genuinely not applicable to this job.</div>
        <Field label="Required PPE">
          <CheckGroup options={PPE_REQUIRED} value={form.ppe_required} onChange={v => set('ppe_required', toggle(form.ppe_required, v))} />
        </Field>
        <Field label="Additional PPE for this job">
          <CheckGroup options={PPE_ADDITIONAL} value={form.ppe_additional} onChange={v => set('ppe_additional', toggle(form.ppe_additional, v))} />
        </Field>
      </Section>

      {/* ── 8. Aerial Rescue & Emergency ── */}
      <Section title="8. Aerial Rescue &amp; Emergency">
        <div style={s.hint}>WorkSafe requires a second person trained in aerial rescue for ALL tree work above 3 metres.</div>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={form.work_above_3m} onChange={e => set('work_above_3m', e.target.checked)} style={s.cb} />
          Work will be carried out above 3 metres
        </label>

        {form.work_above_3m && (
          <div style={{ ...s.alertBox, marginTop: 10 }}>
            <label style={{ ...s.checkLabel, fontWeight: 600, color: 'var(--bark)' }}>
              <input type="checkbox" checked={form.aerial_rescue_person_trained} onChange={e => set('aerial_rescue_person_trained', e.target.checked)} style={s.cb} />
              A second person trained in aerial rescue will be on site at all times
            </label>
            <Field label="Name of aerial rescue-trained person">
              <input style={{ ...s.input, marginTop: 6 }} value={form.aerial_rescue_person_name} onChange={e => set('aerial_rescue_person_name', e.target.value)} placeholder="Full name" />
            </Field>
            <label style={s.checkLabel}>
              <input type="checkbox" checked={form.rescue_equipment_present} onChange={e => set('rescue_equipment_present', e.target.checked)} style={s.cb} />
              Rescue equipment is present and accessible on site
            </label>
            <label style={{ ...s.checkLabel, marginTop: 8 }}>
              <input type="checkbox" checked={form.rescue_procedure_communicated} onChange={e => set('rescue_procedure_communicated', e.target.checked)} style={s.cb} />
              Rescue procedures have been outlined and understood by all crew
            </label>
          </div>
        )}

        <div style={{ ...s.subHead, marginTop: 14 }}>First Aid & Emergency</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={form.first_aid_kit_present} onChange={e => set('first_aid_kit_present', e.target.checked)} style={s.cb} />
            First aid kit present and fully stocked (required in each vehicle / work area)
          </label>
          <label style={s.checkLabel}>
            <input type="checkbox" checked={form.emergency_comms_available} onChange={e => set('emergency_comms_available', e.target.checked)} style={s.cb} />
            Emergency communication available (mobile phone or radio)
          </label>
        </div>
        <FieldRow>
          <Field label="Nearest hospital / A&E">
            <input style={s.input} value={form.nearest_hospital} onChange={e => set('nearest_hospital', e.target.value)} placeholder="e.g. Hutt Hospital, Lower Hutt" />
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Emergency contact name">
            <input style={s.input} value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} placeholder="Name" />
          </Field>
          <Field label="Emergency contact phone">
            <input type="tel" style={s.input} value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} placeholder="Phone" />
          </Field>
        </FieldRow>

        <div style={s.subHead}>Public Safety &amp; Exclusion Zones</div>
        <label style={s.checkLabel}>
          <input type="checkbox" checked={form.exclusion_zone_established} onChange={e => set('exclusion_zone_established', e.target.checked)} style={s.cb} />
          Site exclusion zone established (signage, barriers, cones in place)
        </label>
        {form.exclusion_zone_established && (
          <Field label="Exclusion zone detail">
            <input style={{ ...s.input, marginTop: 6 }} value={form.exclusion_zone_detail} onChange={e => set('exclusion_zone_detail', e.target.value)} placeholder="e.g. 30m radius, road closed, TMP in place" />
          </Field>
        )}
      </Section>

      {/* ── 9. Risk Rating ── */}
      <Section title="9. Risk Rating">
        <div style={s.hint}>
          Apply the hierarchy of controls: <strong>Eliminate → Isolate → Minimise</strong> (PPE is last resort).
          Rate both inherent risk (before controls) and residual risk (after controls). SiteWise Q7 requires both ratings.
        </div>
        {!hasHazards ? (
          <div style={{ ...s.hint, marginTop: 8 }}>No hazards selected yet — go back to Section 3 and identify site hazards.</div>
        ) : (
          <>
            <div style={s.riskLegend}>
              <span style={{ ...s.riskChip, background: '#E8F0E6', color: '#4A6741' }}>LOW</span>
              <span style={{ ...s.riskChip, background: '#F3F4F6', color: '#6B7280' }}>MEDIUM</span>
              <span style={{ ...s.riskChip, background: '#FDF3E3', color: '#D4851A' }}>HIGH</span>
              <span style={{ ...s.riskChip, background: '#FFF0EE', color: '#C0392B' }}>CRITICAL</span>
              <span style={{ fontSize: 11, color: '#aaa', marginLeft: 4 }}>Score = L × C</span>
            </div>
            {form.site_hazards.map(hazard => {
              const r = form.risks[hazard] ?? {}
              const iLv = riskLevel(r.likelihood, r.consequence)
              const rLv = riskLevel(r.residual_likelihood, r.residual_consequence)
              const iScore = Number(r.likelihood) * Number(r.consequence)
              const rScore = Number(r.residual_likelihood) * Number(r.residual_consequence)
              return (
                <div key={hazard} style={s.riskCard}>
                  <div style={s.riskHazardTitle}>{hazard}</div>

                  {/* Inherent risk */}
                  <div style={s.riskSubHead}>Inherent risk (before controls)</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={s.fieldLabel}>Likelihood (1–5)</div>
                      <select style={s.input} value={r.likelihood ?? ''} onChange={e => updateRisk(hazard, 'likelihood', e.target.value)}>
                        <option value="">Select…</option>
                        {LIKELIHOOD_LABELS.slice(1).map((l, i) => <option key={i + 1} value={i + 1}>{i + 1} – {l}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={s.fieldLabel}>Consequence (1–5)</div>
                      <select style={s.input} value={r.consequence ?? ''} onChange={e => updateRisk(hazard, 'consequence', e.target.value)}>
                        <option value="">Select…</option>
                        {CONSEQUENCE_LABELS.slice(1).map((l, i) => <option key={i + 1} value={i + 1}>{i + 1} – {l}</option>)}
                      </select>
                    </div>
                    {r.likelihood && r.consequence && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                        <span style={{ ...s.riskChip, background: iLv.bg, color: iLv.color }}>{iLv.label} ({iScore})</span>
                      </div>
                    )}
                  </div>

                  {/* Controls — hierarchy */}
                  <div style={s.riskSubHead}>Controls (hierarchy of controls)</div>
                  <div style={s.fieldLabel}>1. ELIMINATE — remove the hazard entirely</div>
                  <textarea style={{ ...s.input, minHeight: 44, marginBottom: 6 }} value={r.eliminate ?? ''} onChange={e => updateRisk(hazard, 'eliminate', e.target.value)} placeholder="e.g. Reschedule to avoid power line conflict, use non-motorised tool…" />
                  <div style={s.fieldLabel}>2. ISOLATE — separate hazard from people (barriers, exclusion zones, substitution)</div>
                  <textarea style={{ ...s.input, minHeight: 44, marginBottom: 6 }} value={r.isolate ?? ''} onChange={e => updateRisk(hazard, 'isolate', e.target.value)} placeholder="e.g. Cordon off area, notify power company, traffic management plan…" />
                  <div style={s.fieldLabel}>3. MINIMISE — reduce remaining risk (procedures, training, PPE)</div>
                  <textarea style={{ ...s.input, minHeight: 44, marginBottom: 10 }} value={r.minimise ?? ''} onChange={e => updateRisk(hazard, 'minimise', e.target.value)} placeholder="e.g. Use insulated tools, wear full PPE, brief crew on hazard, maintain 4m clearance…" />

                  {/* Residual risk */}
                  <div style={s.riskSubHead}>Residual risk (after controls) — required for SiteWise</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={s.fieldLabel}>Residual likelihood (1–5)</div>
                      <select style={s.input} value={r.residual_likelihood ?? ''} onChange={e => updateRisk(hazard, 'residual_likelihood', e.target.value)}>
                        <option value="">Select…</option>
                        {LIKELIHOOD_LABELS.slice(1).map((l, i) => <option key={i + 1} value={i + 1}>{i + 1} – {l}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <div style={s.fieldLabel}>Residual consequence (1–5)</div>
                      <select style={s.input} value={r.residual_consequence ?? ''} onChange={e => updateRisk(hazard, 'residual_consequence', e.target.value)}>
                        <option value="">Select…</option>
                        {CONSEQUENCE_LABELS.slice(1).map((l, i) => <option key={i + 1} value={i + 1}>{i + 1} – {l}</option>)}
                      </select>
                    </div>
                    {r.residual_likelihood && r.residual_consequence && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                        <span style={{ ...s.riskChip, background: rLv.bg, color: rLv.color }}>{rLv.label} ({rScore})</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
        <Field label="Any additional site-wide controls or instructions">
          <textarea style={{ ...s.input, minHeight: 70 }} value={form.additional_controls} onChange={e => set('additional_controls', e.target.value)} placeholder="e.g. Council permit obtained, TMP approved, neighbours notified, ECP 34 complied with…" />
        </Field>
      </Section>

      {/* ── 10. Sign-Off ── */}
      <Section title="10. Sign-Off">
        <div style={s.signOffBox}>
          <p style={s.signOffText}>
            By signing off, the supervisor confirms that: this risk assessment has been completed in good faith;
            identified hazards and controls have been communicated to all crew; all controls will be in place before
            work commences; and all crew have acknowledged and accepted the controls. This document supports
            SiteWise Q3 (worker involvement) and Q9 (high-risk / notifiable work).
          </p>
        </div>
        <label style={{ ...s.checkLabel, fontWeight: 600, marginBottom: 14 }}>
          <input type="checkbox" checked={form.pre_work_briefing_conducted} onChange={e => set('pre_work_briefing_conducted', e.target.checked)} style={s.cb} />
          Pre-work briefing (toolbox talk) has been conducted — all crew have reviewed this assessment and accepted the controls
        </label>
        <FieldRow>
          <Field label="Supervisor name (typed signature)">
            <input style={s.input} value={form.sign_off_supervisor} onChange={e => set('sign_off_supervisor', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Sign-off date">
            <input type="date" style={s.input} value={form.sign_off_date} onChange={e => set('sign_off_date', e.target.value)} />
          </Field>
        </FieldRow>
        <Field label="Crew acknowledgement (names of all crew who have read and accepted this assessment)">
          <textarea style={{ ...s.input, minHeight: 70 }} value={form.sign_off_crew} onChange={e => set('sign_off_crew', e.target.value)} placeholder="e.g. Lea Molloy, Stuart Wilson, Joel Ewan" />
        </Field>
      </Section>

      {/* Actions */}
      <div style={s.formActions}>
        {initial?.status !== undefined && (
          <button style={s.delBtn} onClick={onDelete}>Delete</button>
        )}
        <div style={{ flex: 1 }} />
        <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={s.draftBtn} onClick={() => onSave({ ...form, status: 'draft' })}>Save Draft</button>
        <button
          style={{ ...s.saveBtn, opacity: form.sign_off_supervisor ? 1 : 0.5 }}
          onClick={() => onSave({ ...form, status: 'complete' })}
          disabled={!form.sign_off_supervisor}
        >
          Complete &amp; Sign Off
        </button>
      </div>
    </div>
  )
}

// ── Detail / read-only view ──────────────────────────────────────────────────

function RiskAssessmentDetail({ assessment: a, onEdit, onDelete, onBack }) {
  return (
    <div style={s.formWrap}>
      <div style={s.formHeader}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <span style={s.formTitle}>{a.site_address || 'Risk Assessment'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.cancelBtn} onClick={onEdit}>Edit</button>
          <button style={s.delBtn} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ ...s.badge, ...(a.status === 'complete' ? { background: '#E8F0E6', color: '#4A6741' } : { background: '#FDF3E3', color: '#D4851A' }) }}>
          {a.status === 'complete' ? 'Signed off' : 'Draft'}
        </span>
        <span style={{ ...s.badge, background: '#f0f0f0', color: '#666' }}>{fmtDate(a.date)}</span>
        {a.supervisor && <span style={{ ...s.badge, background: '#f0f0f0', color: '#666' }}>{a.supervisor}</span>}
        {a.notifiable_work && <span style={{ ...s.badge, background: '#FFF0EE', color: '#C0392B' }}>NOTIFIABLE WORK</span>}
      </div>

      <ReadSection title="1. Job Information">
        <ReadRow label="Site / Address" value={a.site_address} />
        <ReadRow label="Job / Work Order #" value={a.job_number} />
        <ReadRow label="Date" value={fmtDate(a.date)} />
        <ReadRow label="Supervisor" value={a.supervisor} />
        <ReadRow label="Crew" value={a.crew} />
        {a.notifiable_work && <>
          <ReadRow label="Notifiable work" value="Yes — HSWA 2015 applies" />
          <ReadRow label="WorkSafe notified" value={a.worksafe_notified ? 'Yes' : 'Not yet'} />
          <ReadRow label="Notification ref" value={a.worksafe_notification_ref} />
        </>}
        {a.subcontractors_on_site && <ReadRow label="Subcontractors" value={a.subcontractors_detail} />}
      </ReadSection>

      <ReadSection title="2. Weather">
        <ReadRow label="Conditions" value={(a.weather ?? []).join(', ') || '—'} />
        <ReadRow label="Wind speed" value={WIND_OPTIONS.find(([v]) => v === a.wind_speed)?.[1] ?? a.wind_speed} />
      </ReadSection>

      <ReadSection title="3. Site Hazards">
        {(a.site_hazards ?? []).length === 0
          ? <div style={s.readEmpty}>None identified</div>
          : <ul style={s.readList}>{a.site_hazards.map(h => <li key={h}>{h}</li>)}</ul>}
      </ReadSection>

      <ReadSection title="4. Tree Information">
        <ReadRow label="Species" value={a.species} />
        <ReadRow label="Height" value={a.height_m ? `${a.height_m} m` : undefined} />
        <ReadRow label="DBH" value={a.dbh_cm ? `${a.dbh_cm} cm` : undefined} />
        <ReadRow label="Condition" value={a.condition} />
        <ReadRow label="Lean direction" value={a.lean_direction} />
        {(a.defects ?? []).length > 0 && <ReadRow label="Defects" value={a.defects.join(', ')} />}
        {a.tree_notes && <ReadRow label="Notes" value={a.tree_notes} />}
      </ReadSection>

      <ReadSection title="5. Work Type">
        {(a.work_types ?? []).length === 0
          ? <div style={s.readEmpty}>None selected</div>
          : <ul style={s.readList}>{a.work_types.map(w => <li key={w}>{w}</li>)}</ul>}
        <ReadRow label="Escape route" value={a.felling_escape_route} />
        <ReadRow label="Felling exclusion zone" value={a.felling_exclusion_zone} />
      </ReadSection>

      <ReadSection title="6. Equipment">
        {(a.equipment ?? []).length === 0
          ? <div style={s.readEmpty}>None selected</div>
          : <ul style={s.readList}>{a.equipment.map(e => <li key={e}>{e}</li>)}</ul>}
        {a.chainsaw_pre_use_checked && <ReadRow label="Chainsaw pre-use check" value="Completed" />}
      </ReadSection>

      <ReadSection title="7. PPE">
        {(a.ppe_required ?? []).length > 0 && <>
          <div style={s.readLabel}>Required PPE</div>
          <ul style={{ ...s.readList, marginBottom: 8 }}>{a.ppe_required.map(p => <li key={p}>{p}</li>)}</ul>
        </>}
        {(a.ppe_additional ?? []).length > 0 && <>
          <div style={s.readLabel}>Additional PPE</div>
          <ul style={s.readList}>{a.ppe_additional.map(p => <li key={p}>{p}</li>)}</ul>
        </>}
      </ReadSection>

      <ReadSection title="8. Aerial Rescue &amp; Emergency">
        <ReadRow label="Work above 3m" value={a.work_above_3m ? 'Yes' : 'No'} />
        {a.work_above_3m && <>
          <ReadRow label="Aerial rescue person" value={a.aerial_rescue_person_name} />
          <ReadRow label="Rescue-trained on site" value={a.aerial_rescue_person_trained ? 'Yes' : 'No'} />
          <ReadRow label="Rescue equipment present" value={a.rescue_equipment_present ? 'Yes' : 'No'} />
          <ReadRow label="Rescue procedure communicated" value={a.rescue_procedure_communicated ? 'Yes' : 'No'} />
        </>}
        <ReadRow label="First aid kit on site" value={a.first_aid_kit_present ? 'Yes' : 'No'} />
        <ReadRow label="Emergency comms available" value={a.emergency_comms_available ? 'Yes' : 'No'} />
        <ReadRow label="Nearest hospital" value={a.nearest_hospital} />
        <ReadRow label="Emergency contact" value={a.emergency_contact_name && a.emergency_contact_phone ? `${a.emergency_contact_name} — ${a.emergency_contact_phone}` : a.emergency_contact_name || a.emergency_contact_phone} />
        <ReadRow label="Exclusion zone established" value={a.exclusion_zone_established ? 'Yes' : 'No'} />
        {a.exclusion_zone_established && <ReadRow label="Exclusion zone detail" value={a.exclusion_zone_detail} />}
      </ReadSection>

      <ReadSection title="9. Risk Rating">
        {Object.keys(a.risks ?? {}).length === 0
          ? <div style={s.readEmpty}>No risks rated</div>
          : Object.entries(a.risks).map(([hazard, r]) => {
              const iLv = riskLevel(r.likelihood, r.consequence)
              const rLv = riskLevel(r.residual_likelihood, r.residual_consequence)
              const iScore = Number(r.likelihood) * Number(r.consequence)
              const rScore = Number(r.residual_likelihood) * Number(r.residual_consequence)
              return (
                <div key={hazard} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--bark)', marginBottom: 6 }}>{hazard}</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {r.likelihood && r.consequence && (
                      <span style={{ ...s.riskChip, background: iLv.bg, color: iLv.color }}>Inherent: {iLv.label} ({iScore})</span>
                    )}
                    {r.residual_likelihood && r.residual_consequence && (
                      <span style={{ ...s.riskChip, background: rLv.bg, color: rLv.color }}>Residual: {rLv.label} ({rScore})</span>
                    )}
                  </div>
                  {r.eliminate && <div style={s.controlRow}><span style={s.controlBadge}>Eliminate</span>{r.eliminate}</div>}
                  {r.isolate && <div style={s.controlRow}><span style={s.controlBadge}>Isolate</span>{r.isolate}</div>}
                  {r.minimise && <div style={s.controlRow}><span style={s.controlBadge}>Minimise</span>{r.minimise}</div>}
                </div>
              )
            })}
        {a.additional_controls && <ReadRow label="Additional controls" value={a.additional_controls} />}
      </ReadSection>

      <ReadSection title="10. Sign-Off">
        <ReadRow label="Pre-work briefing conducted" value={a.pre_work_briefing_conducted ? 'Yes' : 'No'} />
        <ReadRow label="Supervisor" value={a.sign_off_supervisor} />
        <ReadRow label="Date" value={fmtDate(a.sign_off_date)} />
        <ReadRow label="Crew acknowledgement" value={a.sign_off_crew} />
      </ReadSection>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div style={s.section}>
      <div style={s.sectionHead} dangerouslySetInnerHTML={{ __html: title }} />
      <div style={s.sectionBody}>{children}</div>
    </div>
  )
}
function Field({ label, children }) {
  return (
    <div style={{ flex: 1, marginBottom: 12 }}>
      {label && <div style={s.fieldLabel}>{label}</div>}
      {children}
    </div>
  )
}
function FieldRow({ children }) {
  return <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{children}</div>
}
function CheckGroup({ options, value, onChange }) {
  return (
    <div style={s.checkGroup}>
      {options.map(opt => (
        <label key={opt} style={s.checkLabel}>
          <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(opt)} style={{ ...s.cb, marginRight: 7 }} />
          {opt}
        </label>
      ))}
    </div>
  )
}
function ReadSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={s.readSectionTitle} dangerouslySetInnerHTML={{ __html: title }} />
      <div style={s.readCard}>{children}</div>
    </div>
  )
}
function ReadRow({ label, value }) {
  if (!value) return null
  return (
    <div style={s.readRow}>
      <div style={s.readLabel}>{label}</div>
      <div style={s.readValue}>{value}</div>
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  // List
  sectionTitle: { fontSize: 13, fontWeight: 700, color: 'var(--bark)', textTransform: 'uppercase', letterSpacing: '0.04em' },
  list:    { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  row:     { display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', cursor: 'pointer' },
  rowTitle:{ fontSize: 14, fontWeight: 600, color: 'var(--bark)' },
  rowMeta: { fontSize: 12, color: '#999', marginTop: 2 },
  badge:   { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap', flexShrink: 0 },
  addBtn:  { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  empty:   { color: '#bbb', fontSize: 14, padding: '24px 0', textAlign: 'center' },

  // Form shell
  formWrap:   { paddingBottom: 40 },
  formHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  formTitle:  { fontSize: 16, fontWeight: 800, color: 'var(--bark)', flex: 1 },
  backBtn:    { background: 'none', border: 'none', color: 'var(--sky)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'var(--font)', flexShrink: 0 },

  // Sections
  section:     { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 14, overflow: 'hidden' },
  sectionHead: { background: 'var(--bark)', color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 16px', letterSpacing: '0.04em', textTransform: 'uppercase' },
  sectionBody: { padding: '14px 16px' },
  subHead:     { fontSize: 11, fontWeight: 700, color: 'var(--bark)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8, marginTop: 4 },

  // Fields
  fieldLabel: { fontSize: 11, fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 },
  input:      { width: '100%', padding: '9px 11px', borderRadius: 7, border: '1.5px solid var(--border)', fontSize: 13, color: 'var(--bark)', fontFamily: 'var(--font)', boxSizing: 'border-box', background: '#fff' },
  checkGroup: { display: 'flex', flexDirection: 'column', gap: 8 },
  checkLabel: { display: 'flex', alignItems: 'flex-start', fontSize: 13, color: 'var(--bark)', cursor: 'pointer', lineHeight: 1.4 },
  cb:         { marginTop: 2, flexShrink: 0, accentColor: 'var(--moss)' },

  // Alerts
  hint:        { fontSize: 12, color: '#888', lineHeight: 1.5, marginBottom: 10 },
  stopWork:    { background: '#FFF0EE', color: '#C0392B', fontSize: 12, fontWeight: 600, borderRadius: 6, padding: '8px 12px', marginTop: 8 },
  alertBox:    { background: 'var(--amber-pale)', border: '1px solid #E8C98A', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  signOffBox:  { background: 'var(--moss-pale)', border: '1px solid var(--moss)', borderRadius: 8, padding: '12px 14px', marginBottom: 14 },
  signOffText: { fontSize: 13, color: 'var(--bark)', lineHeight: 1.5 },

  // Risk rating
  riskLegend:     { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  riskChip:       { fontSize: 11, fontWeight: 700, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap' },
  riskCard:       { background: '#fafafa', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 },
  riskHazardTitle:{ fontSize: 13, fontWeight: 700, color: 'var(--bark)', marginBottom: 10 },
  riskSubHead:    { fontSize: 11, fontWeight: 700, color: 'var(--moss)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 },

  // Form actions
  formActions: { display: 'flex', gap: 8, alignItems: 'center', paddingTop: 8, flexWrap: 'wrap' },
  delBtn:    { background: '#fff', border: '1px solid #E0B4B0', borderRadius: 7, padding: '9px 14px', fontSize: 13, color: 'var(--danger)', cursor: 'pointer', fontFamily: 'var(--font)' },
  cancelBtn: { background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 16px', fontSize: 13, color: '#666', cursor: 'pointer', fontFamily: 'var(--font)' },
  draftBtn:  { background: '#fff', border: '1px solid var(--moss)', color: 'var(--moss)', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' },
  saveBtn:   { background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font)' },

  // Detail / read view
  readSectionTitle: { fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  readCard:  { background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px' },
  readRow:   { marginBottom: 10 },
  readLabel: { fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 },
  readValue: { fontSize: 13, color: 'var(--bark)', lineHeight: 1.4, whiteSpace: 'pre-wrap' },
  readList:  { fontSize: 13, color: 'var(--bark)', paddingLeft: 18, lineHeight: 1.8, listStyleType: 'disc' },
  readEmpty: { fontSize: 13, color: '#bbb', fontStyle: 'italic' },
  controlRow:  { fontSize: 13, color: '#444', display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, lineHeight: 1.4 },
  controlBadge:{ fontSize: 10, fontWeight: 700, background: 'var(--moss-pale)', color: 'var(--moss)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1 },
}
