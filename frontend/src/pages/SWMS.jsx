import { useState, useCallback } from 'react'

// ── Storage ───────────────────────────────────────────────────────────────────

const LS_KEY     = 'treeco_swms_v2'
const SEED_KEY   = 'treeco_swms_seeded_v2'

function loadDocs() {
  try {
    if (!localStorage.getItem(SEED_KEY)) {
      const seeded = TASK_LIBRARY.map((lib, i) => makeDoc(lib, i + 1))
      localStorage.setItem(LS_KEY, JSON.stringify(seeded))
      localStorage.setItem(SEED_KEY, '1')
      return seeded
    }
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')
  } catch { return [] }
}
function saveDocs(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)) }
function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtDate(d) {
  if (!d) return ''
  const [y,m,day] = d.split('-')
  return new Date(+y, +m-1, +day).toLocaleDateString('en-NZ', { day:'numeric', month:'short', year:'numeric' })
}

// ── Risk matrix ───────────────────────────────────────────────────────────────

function risk(l, c) {
  const s = (l||0)*(c||0)
  if (s >= 17) return { label:'CRITICAL', bg:'#FFF0EE', color:'#C0392B', s }
  if (s >= 10) return { label:'HIGH',     bg:'#FDF3E3', color:'#D4851A', s }
  if (s >= 5)  return { label:'MEDIUM',   bg:'#FEFBEA', color:'#B5770F', s }
  if (s >= 1)  return { label:'LOW',      bg:'#E8F0E6', color:'#4A6741', s }
  return { label:'—', bg:'#f5f5f5', color:'#aaa', s:0 }
}

// ── PPE ───────────────────────────────────────────────────────────────────────

const PPE = [
  { id:'helmet',         label:'Arborist helmet',             std:'NZS 8600 / AS/NZS 1801' },
  { id:'helmet_visor',   label:'Helmet + full face visor',    std:'AS/NZS 1337.1' },
  { id:'ear',            label:'Hearing protection Class 5',  std:'AS/NZS 1269 (≥29dB SNR)' },
  { id:'chaps',          label:'Chainsaw chaps Class 1',      std:'AS/NZS 4453.3:1997' },
  { id:'harness',        label:'Arborist climbing saddle / harness', std:'Arborist-rated, 22kN min — manufacturer spec' },
  { id:'gloves_cut',     label:'Cut-resistant gloves',        std:'AS/NZS 2161.3' },
  { id:'gloves_chem',    label:'Chemical-resistant gloves',   std:'AS/NZS 2161.6' },
  { id:'boots',          label:'Steel-capped safety boots',   std:'AS/NZS 2210.3' },
  { id:'hiviz',          label:'Hi-vis vest/shirt Class 2',   std:'AS/NZS 1906.4 / 4602.1' },
  { id:'eye',            label:'Safety glasses / goggles',    std:'AS/NZS 1337.1' },
  { id:'chem_apron',     label:'Chemical-resistant apron',    std:'' },
  { id:'sunscreen',      label:'Sunscreen SPF 50+',           std:'' },
  { id:'dust_mask',      label:'P2 dust mask',                std:'AS/NZS 1715' },
]

const PPE_MAP = Object.fromEntries(PPE.map(p => [p.id, p]))

// Per-activity PPE defaults
const ACT_PPE = {
  climbing:       ['helmet_visor','ear','chaps','harness','gloves_cut','boots','hiviz'],
  aerial_rescue:  ['helmet_visor','harness','boots','hiviz'],
  ground_support: ['helmet','hiviz','boots','ear','eye'],
  chainsaw:       ['helmet_visor','ear','chaps','gloves_cut','boots','hiviz','eye'],
  chipping:       ['helmet_visor','ear','hiviz','boots','eye','gloves_cut'],
  rigging:        ['helmet_visor','harness','gloves_cut','boots','hiviz'],
  traffic:        ['hiviz','boots','helmet','eye'],
  chemicals:      ['gloves_chem','eye','chem_apron','boots'],
  stump:          ['eye','boots','hiviz','ear','helmet_visor'],
  felling:        ['helmet_visor','ear','chaps','gloves_cut','boots','hiviz'],
  powerline:      ['helmet_visor','hiviz','boots','harness','gloves_cut'],
  storm:          ['helmet_visor','hiviz','boots','chaps','ear'],
  handtools:      ['gloves_cut','boots','eye','hiviz'],
}

// ── Default staff ─────────────────────────────────────────────────────────────

const DEFAULT_STAFF = [
  { id:'s1', name:'Josh Micallef',        role:'Director / Climber' },
  { id:'s2', name:'Lea Molloy',           role:'Climber' },
  { id:'s3', name:'Stuart Fraser Wilson', role:'Climber' },
  { id:'s4', name:'Joel Ewan',            role:'Groundsman' },
  { id:'s5', name:'Josh Curran Mongan',   role:'Groundsman' },
  { id:'s6', name:'Kaleb',               role:'Groundsman' },
]

// ── Task library (NZArb / ArbAus MIS) ────────────────────────────────────────

const TASK_LIBRARY = [
  {
    id:'climbing', ref:'ArbAus MIS 01 / WorkSafe NZ',
    title:'Tree Climbing & Aerial Work',
    hazards:[
      { hazard:'Fall from height during climb or aerial positioning', who:'Climber',
        controls:'Two independent anchor points (IAP/SRS/MRS). 2-point attachment maintained at all times in canopy. 22kN-rated connectors (AS/NZS 1891.4). Arborist climbing saddle/harness (22kN min, manufacturer-rated). Pre-use equipment inspection per AS/NZS 4143.3. Aerial-rescue trained second person MUST be present for all work above 3m (WorkSafe NZ).',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Struck by falling timber, branches or debris', who:'Ground crew / public',
        controls:'Exclusion zone minimum 2× tree height radius — cones, tape and signage. All ground crew within tree radius wear arborist helmet (NZS 8600). Climber signals before each cut or drop. No one stands directly below climber at any time.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Chainsaw contact / kickback during aerial cutting', who:'Climber',
        controls:'Class 1 chainsaw chaps (AS/NZS 4453.3). Cut-resistant gloves. Chainsaw helmet with full visor and earmuffs. Cut at or below shoulder height — never above. Chain brake functional and tested. Sheath chainsaw before descending.',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Contact with overhead power lines', who:'Climber / ground crew',
        controls:'Identify ALL lines before work. Maintain ≥4m from LV lines (≤110kV) and ≥6m from HV lines (>110kV) per ECP 34. If clearances cannot be maintained — notify line owner and arrange shutdown or insulation. Treat ALL lines as live.',
        ll:2,cl:5,lr:1,cr:5 },
      { hazard:'Climbing equipment failure (rope, saddle, carabiner)', who:'Climber',
        controls:'Pre-use inspection per manufacturer and AS/NZS 4143.3. Remove any item with cuts, abrasion, chemical or impact damage. Equipment register maintained. Replace ropes/harness per inspection schedule.',
        ll:2,cl:5,lr:1,cr:4 },
    ],
  },
  {
    id:'aerial_rescue', ref:'ArbAus MIS 02 / WorkSafe NZ',
    title:'Aerial Rescue Procedure',
    hazards:[
      { hazard:'Climber incapacitated at height — delayed rescue', who:'Climber',
        controls:'Second person trained in aerial rescue present for ALL work above 3m (WorkSafe NZ mandatory). Rescue kit on site: ascender, controlled descent device (≥25kN), rescue lanyard. Aerial rescue practice minimum annually. Call 111 immediately — initiate rescue simultaneously.',
        ll:2,cl:5,lr:1,cr:5 },
      { hazard:'Rescuer injury during ascent / lowering', who:'Rescuer',
        controls:'Rescuer uses fully independent climbing system — never shares victim\'s anchor. Rescue plan briefed before ascending. Continuous communication with ground crew. Controlled descent rate. Ground crew guides victim clear of trunk. Spinal precautions if fall suspected — do not remove helmet.',
        ll:2,cl:5,lr:1,cr:4 },
      { hazard:'Inadequate first aid / delayed emergency response', who:'All crew',
        controls:'Designated first-aider (Level 2 minimum) on site. First aid kit stocked and accessible. Site address and nearest A&E confirmed before work starts. Clear ambulance access maintained. Do not remove climbing equipment from victim unless directed by paramedics.',
        ll:2,cl:4,lr:1,cr:3 },
    ],
  },
  {
    id:'ground_support', ref:'ArbAus MIS 03',
    title:'Ground Support Operations',
    hazards:[
      { hazard:'Struck by falling wood or debris from above', who:'Ground crew',
        controls:'Stay outside exclusion zone unless directed by climber. Arborist helmet for all crew within tree fall radius. Never stand directly below climber. Monitor climber and call out when moving near drop zone. Climber gives clear signal before each cut or lower.',
        ll:4,cl:4,lr:2,cr:3 },
      { hazard:'Struck by rigged / lowered material', who:'Ground crew',
        controls:'Clear landing zone before any rigged piece is released. Spotter uses tag line from side only — never stand below load. Confirm "CLEAR — COMING DOWN" signal system before work starts. Rated rigging gear throughout.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Manual handling injury (back, strain)', who:'Ground crew',
        controls:'Team lifts for items >20kg. Feed chipper immediately — avoid stockpiling heavy brush. Hydrate regularly. Rotate physically demanding tasks across crew. Bend knees when lifting. Report muscular pain early.',
        ll:4,cl:2,lr:3,cr:2 },
    ],
  },
  {
    id:'chainsaw', ref:'ArbAus MIS 04 / WorkSafe NZ Chainsaw Guide',
    title:'Chainsaw Operations',
    hazards:[
      { hazard:'Chainsaw contact — kickback, push-back or pull-in', who:'Operator',
        controls:'Class 1 chainsaw chaps (AS/NZS 4453.3). Cut-resistant gloves. Helmet with full visor and Class 5 earmuffs. Functional chain brake — test each shift. Grip bar and front handle at all times. Sharp chain maintained. Guards in place. No tip-of-bar cutting. Pre-use check: tension, oil, filter, bar.',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Noise-induced hearing damage (>100dB typical)', who:'Operator / nearby crew',
        controls:'Class 5 hearing protection (≥29dB SNR) mandatory for operator. Hearing protection for anyone within 15m. Limit continuous exposure — rotate operators. Audiometry monitoring per health monitoring requirements.',
        ll:5,cl:3,lr:2,cr:3 },
      { hazard:'Hand-arm vibration syndrome (HAVS)', who:'Operator',
        controls:'Rotate operators — limit continuous chainsaw use. Anti-vibration gloves (AS/NZS 2161.5). Maintain saw vibration dampeners. Report tingling, numbness or whitening of fingers promptly. Keep hands warm.',
        ll:4,cl:2,lr:3,cr:2 },
      { hazard:'Exhaust fume inhalation', who:'Operator',
        controls:'Do not run chainsaw in confined or poorly ventilated spaces. Work upwind of exhaust. Biodegradable bar oil where practicable. P2 mask for treated timber cutting.',
        ll:3,cl:3,lr:2,cr:2 },
      { hazard:'Fire during refuelling', who:'Operator',
        controls:'Allow saw to cool 2 min before refuelling. Clear refuelling area of combustible debris. No smoking within 3m. Funnel use — wipe spills immediately. Check fire danger rating — do not operate in Extreme fire danger.',
        ll:2,cl:4,lr:1,cr:3 },
    ],
  },
  {
    id:'chipping', ref:'ArbAus MIS 05',
    title:'Wood Chipping Operations',
    hazards:[
      { hazard:'Entanglement / drawn into chipper infeed rollers', who:'Operator / crew',
        controls:'Feed butt-first with long pieces. Stand to the SIDE of infeed — NEVER in front. Keep hands ≥50cm clear of infeed rollers. Loose clothing, scarves, jewellery prohibited. Emergency stop within reach. Minimum 2 persons operating. Never clear jams with machine running.',
        ll:3,cl:5,lr:1,cr:5 },
      { hazard:'Struck by ejected material from discharge chute', who:'Crew / public',
        controls:'Direct discharge away from ALL persons. Discharge guard in place at all times. 15m exclusion zone in discharge direction. Safety glasses for all crew. Never discharge toward vehicles, structures or waterways.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Vehicle strike — reversing truck or chipper', who:'Ground crew / public',
        controls:'Dedicated spotter when reversing. Hi-vis for all crew. Reverse only when crew visible and clear. Amber beacon operating. Clear area before repositioning.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Noise exposure from chipper', who:'All crew',
        controls:'Class 5 hearing protection for all crew within 15m of operating chipper.',
        ll:5,cl:3,lr:2,cr:3 },
    ],
  },
  {
    id:'rigging', ref:'ArbAus MIS 06',
    title:'Rigging & Lowering Operations',
    hazards:[
      { hazard:'Rigging component failure under load', who:'Climber / ground crew',
        controls:'Minimum 3:1 working load factor on ALL components. Inspect block, rope, friction device and slings before each use — retire if worn, cut or corroded. Do not exceed WLL of weakest component. Dynamic rigging — shock load managed by controlled descent device (Port-a-wrap / Hobbit).',
        ll:2,cl:5,lr:1,cr:4 },
      { hazard:'Struck by swinging or uncontrolled section', who:'Ground crew / public',
        controls:'Tag line on all large or awkward sections. Spotter at tag line from CLEAR of drop zone — never below load. "CLEAR — COMING DOWN" signal confirmed before each lower. Ground crew clear before any piece released.',
        ll:3,cl:5,lr:2,cr:3 },
      { hazard:'Anchor point failure (branch or stem)', who:'Climber / ground crew',
        controls:'Inspect anchor before loading — probe for decay, check at stem. Minimum 3× estimated load WLL for anchor. Use redirect/block to distribute load where possible. Do not use dead, decayed or included-bark unions as primary anchor. Test-load gently before full commitment.',
        ll:2,cl:5,lr:1,cr:4 },
    ],
  },
  {
    id:'traffic', ref:'ArbAus MIS 07 / CoPTTM NZ',
    title:'Working Near Traffic',
    hazards:[
      { hazard:'Struck by passing vehicle — crew or equipment in road', who:'All crew',
        controls:'Traffic Management Plan (TMP) per CoPTTM for ALL work on or adjacent to public roads — obtain council approval where required. Class 2 hi-vis (AS/NZS 4602.1) for all crew. Cones/delineators minimum 200m advance warning (50km/h zone). Traffic controller for any lane closure. Amber beacon on all vehicles in work zone.',
        ll:3,cl:5,lr:2,cr:5 },
      { hazard:'Debris or equipment left on road surface', who:'Motorists / crew',
        controls:'Sweep road clear of wood chips and debris immediately — no accumulation. All equipment secured or removed from road. Signage in place until work zone fully cleared. Floodlights and extra signage for after-dusk work.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Crew struck while setting up or packing down TM', who:'All crew',
        controls:'Deploy signs/cones from vehicle where possible — avoid walking into live traffic. Hi-vis at all times. Supervisor monitors traffic during set-up. Set up on straight sections with good sightlines.',
        ll:3,cl:4,lr:2,cr:3 },
    ],
  },
  {
    id:'chemicals', ref:'ArbAus MIS 08 / HSNO Act NZ',
    title:'Chemical Application (Herbicide / Arboricide)',
    hazards:[
      { hazard:'Skin / eye contact with chemical (Roundup, Triclopyr, Garlon, Tordon)', who:'Operator',
        controls:'Read SDS before each job. Nitrile gloves. Chemical goggles (full seal) for mixing and spraying. Chemical-resistant apron when decanting. No spraying in wind >3 m/s. Eye wash (500mL water) accessible. Shower if significant skin contact. Wash hands before eating or drinking.',
        ll:3,cl:3,lr:2,cr:2 },
      { hazard:'Environmental contamination — waterways, soil, non-target plants', who:'Environment',
        controls:'Check NES-FW and local district plan for notifiable activities near waterways. Maintain buffer zones per chemical label (typically ≥5m from waterways). Minimum effective rate. No spray if rain forecast within 2hrs (ground) or 6hrs (aerial). Dispose of containers per label. Record all applications.',
        ll:2,cl:4,lr:1,cr:3 },
      { hazard:'Chemical misidentification or incorrect dilution', who:'Operator / environment',
        controls:'Chemicals in original labelled containers only. Supervisor verifies chemical identity and rate before application. Measure precisely — no estimating. Two-person check for unfamiliar chemicals.',
        ll:2,cl:4,lr:1,cr:3 },
    ],
  },
  {
    id:'stump', ref:'ArbAus MIS 09',
    title:'Stump Grinding Operations',
    hazards:[
      { hazard:'Struck by ejected debris (rocks, roots, soil)', who:'Operator / bystanders',
        controls:'Clear area of rocks, wire and foreign objects before grinding. 15m exclusion zone in ALL directions. Solid-lens safety glasses. Operator behind machine hood/deflector at all times. All crew wear safety glasses within 15m.',
        ll:4,cl:4,lr:2,cr:3 },
      { hazard:'Underground service strike (power, gas, water, telecom)', who:'Operator / public',
        controls:'Call Before You Dig — 0800 248 344 (CBYD) for all public sites before grinding. Ask owner about private services. Mark known services before starting. Grind in shallow passes (≤100mm) near services. Stop IMMEDIATELY if unusual resistance, sparks, smell of gas or cable encountered.',
        ll:2,cl:5,lr:1,cr:5 },
      { hazard:'Machine runaway / stability loss on slope', who:'Operator / bystanders',
        controls:'Assess ground stability before positioning. Wheel chocks on any gradient. Operator maintains control at all times — do not leave running machine unattended. Disengage cutting wheel before repositioning.',
        ll:2,cl:4,lr:1,cr:3 },
    ],
  },
  {
    id:'felling', ref:'ArbAus MIS 10 / NZArb Best Practice',
    title:'Tree Felling — Controlled',
    hazards:[
      { hazard:'Uncontrolled fall direction', who:'Operator / crew / public',
        controls:'Assess lean, crown weight, root plate, defects and obstacles before first cut. Plan and communicate intended fall direction. Escape routes established (45° rear diagonal opposite fall) — clear of debris. Bore cut / Humboldt technique to maintain holding-wood control. Wedge for upright or back-lean trees. Exclusion zone (≥2× tree height all directions) clear and confirmed before felling begins.',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Barber chair / premature trunk split', who:'Operator',
        controls:'Identify tension wood: leaning trees, co-dominant stems, swept grain. Bore cut technique — do not back-cut through all holding wood in one pass. Have wedge and felling bar ready. Maintain wide hinge (min 10% of diameter). Escape route confirmed before cutting.',
        ll:2,cl:5,lr:1,cr:5 },
      { hazard:'Operator struck by falling tree or root-plate kickback', who:'Operator',
        controls:'Move immediately to pre-planned escape route when tree starts to move — do NOT watch the tree. Do not stand behind root plate. All crew at minimum 2× tree height distance before felling begins.',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Widow makers / dead material dislodged during felling', who:'Operator / crew',
        controls:'Crown assessment for dead branches before approach. Helmets for all crew within tree-length radius. Clear dead material from crown before felling where accessible from ground.',
        ll:3,cl:4,lr:2,cr:3 },
      { hazard:'Chainsaw contact during limbing of felled tree', who:'Operator',
        controls:'Work from uphill side of felled tree. Limb systematically from butt toward top. Stay clear of limbs under compression. Anticipate log movement as limbs are removed. Non-cutting hand on bar grip at all times.',
        ll:3,cl:4,lr:2,cr:3 },
    ],
  },
  {
    id:'powerline', ref:'ArbAus MIS 13 / ECP 34 / WorkSafe NZ',
    title:'Work Near Power Lines',
    hazards:[
      { hazard:'Electrocution / arcing from energised line contact', who:'Climber / ground crew',
        controls:'NEVER work within 4m of LV distribution lines (≤110kV) or 6m of HV transmission lines (>110kV) without written approval from line owner and line de-energised or insulated (ECP 34). Map ALL power lines before commencing. Notify line owner (Powerco / Wellington Electricity / Lines Company) before work near lines. If clearances cannot be maintained — STOP. Treat ALL lines as LIVE.',
        ll:3,cl:5,lr:1,cr:5 },
      { hazard:'Ropes, tools or equipment contacting lines', who:'Climber / ground crew',
        controls:'Plan rope throws and anchor placements away from line zone. Fibre ropes only near power lines (no metallic-core ropes). Assess rope path before each throw. Keep pruning poles below line plane. Ground crew maintains line-watching role throughout.',
        ll:3,cl:5,lr:2,cr:4 },
      { hazard:'Vehicle or EWP boom contacting overhead line', who:'Operator / ground crew',
        controls:'Position vehicles with operator maintaining visual on lines. Spotter guides all boom/elevated work near power infrastructure. Mark approach distance with barriers where possible. Insulating sleeves arranged with line owner if working very near lines.',
        ll:2,cl:5,lr:1,cr:5 },
    ],
  },
  {
    id:'storm', ref:'ArbAus MIS 14 / WorkSafe NZ',
    title:'Storm & Emergency Damage Work',
    hazards:[
      { hazard:'Unstable / fractured tree structure collapse', who:'All crew',
        controls:'Stay outside fall radius until structural stability confirmed — ASSESS before approach. Probe root plate. Look for splits, hangers, widow-makers and tree contacts. Work outside in — relieve tension before approaching compression. If stability uncertain, contact structural engineer or council arborist before proceeding.',
        ll:5,cl:5,lr:3,cr:4 },
      { hazard:'Struck by spring-loaded material under tension', who:'Operator / crew',
        controls:'Identify tension (convex) and compression (concave) sides before any cut. Tension-relief cuts from tension side first. NEVER stand in the line of a bent branch/stem during release. Progressive small cuts — not through in one pass. Move to clear position before material springs.',
        ll:4,cl:5,lr:2,cr:4 },
      { hazard:'Contact with downed or tree-contacted power lines', who:'All crew / public',
        controls:'Assume ALL lines in storm damage are LIVE. 4m exclusion from any line. Call 111 and line owner IMMEDIATELY for any downed or contacted line. Do not begin chainsaw or climbing work until line owner confirms de-energised. Establish exclusion zone and redirect public.',
        ll:4,cl:5,lr:2,cr:5 },
      { hazard:'Adverse conditions (dark, wet, high wind)', who:'All crew',
        controls:'Do not work in sustained wind >30km/h or gusts >50km/h. Adequate lighting for after-dark work (min 100 lux at task). Anti-slip boots on wet surfaces. Extra vigilance for fatigue in extended emergency work. Regular crew check-ins. Enforced rest breaks.',
        ll:4,cl:4,lr:2,cr:3 },
    ],
  },
  {
    id:'handtools', ref:'ArbAus MIS 12',
    title:'Hand Tools & General Ground Work',
    hazards:[
      { hazard:'Laceration from hand tools (loppers, handsaw, pruning saw)', who:'Operator',
        controls:'Cut-resistant gloves (AS/NZS 2161.3). Keep tools sharp — blunt tools increase force and fatigue risk. Store in sheaths or cases when not in use. Pass tools handle-first. Clear work area before cutting.',
        ll:3,cl:3,lr:2,cr:2 },
      { hazard:'Slips, trips and falls on uneven or slippery ground', who:'All crew',
        controls:'Steel-capped safety boots with ankle support (AS/NZS 2210.3). Clear work area regularly. Extra caution on slopes >30°, wet grass and loose soils. Brief crew on ground hazards at start of job.',
        ll:4,cl:2,lr:3,cr:2 },
      { hazard:'Eye injury from sawdust, debris or chemical splash', who:'All crew',
        controls:'Safety glasses / goggles for all power-tool and cutting work. Chemical goggles for any spray or mixing. Replace if scratched or cracked.',
        ll:3,cl:3,lr:2,cr:2 },
      { hazard:'Heat stress / sunstroke in hot outdoor conditions', who:'All crew',
        controls:'Hydrate before and during work — 200mL every 15 min in high heat. Rotate heavy tasks to cooler periods in extreme heat. Rest in shade. Sunscreen SPF 50+ and long sleeves. Supervisor monitors crew for heat exhaustion signs (heavy sweating, paleness, dizziness). Rest immediately and cool if symptoms appear.',
        ll:3,cl:3,lr:2,cr:2 },
    ],
  },
]

// ── Doc factory ───────────────────────────────────────────────────────────────

function makeDoc(lib, idx) {
  const docNum = String(idx).padStart(3, '0')
  return {
    id: uid(),
    doc_number: `SWMS-${docNum}`,
    title: lib.title,
    lib_id: lib.id,
    ref: lib.ref,
    version: '1.0',
    status: 'draft',
    prepared_by: 'Josh Micallef',
    approved_by: '',
    review_date: '',
    hazards: lib.hazards.map(h => ({ ...h, id: uid() })),
    ppe: ACT_PPE[lib.id] ?? [],
    sign_offs: DEFAULT_STAFF.map(s => ({ ...s, date: '', signed: false })),
    created_at: today(),
    notes: '',
  }
}

// ── PDF generation ────────────────────────────────────────────────────────────

function printPDF(doc) {
  const logoUrl   = window.location.origin + '/logo.png'
  const rLabel    = (l,c) => { const r = risk(l,c); return `<span style="background:${r.bg};color:${r.color};padding:2px 6px;border-radius:3px;font-weight:bold;font-size:7.5pt;">${r.label}&nbsp;${r.s}</span>` }
  const ppeItems  = (doc.ppe ?? []).map(id => PPE_MAP[id]?.label).filter(Boolean)

  const hazardRows = doc.hazards.map((h, i) => `
    <tr style="background:${i%2===0?'#fff':'#FAFAFA'}">
      <td style="width:22%;vertical-align:top;padding:5px 6px;border:1px solid #ddd;">${h.hazard}</td>
      <td style="width:10%;vertical-align:top;padding:5px 6px;border:1px solid #ddd;">${h.who}</td>
      <td style="width:36%;vertical-align:top;padding:5px 6px;border:1px solid #ddd;">${h.controls}</td>
      <td style="width:12%;text-align:center;vertical-align:middle;padding:5px 4px;border:1px solid #ddd;">${rLabel(h.ll,h.cl)}</td>
      <td style="width:12%;text-align:center;vertical-align:middle;padding:5px 4px;border:1px solid #ddd;">${rLabel(h.lr,h.cr)}</td>
      <td style="width:8%;vertical-align:top;padding:5px 6px;border:1px solid #ddd;">${h.responsible||'Supervisor'}</td>
    </tr>`).join('')

  const signOffRows = (doc.sign_offs ?? []).map(s => `
    <tr>
      <td style="padding:6px 8px;border:1px solid #ddd;width:28%;">${s.name}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;width:18%;">${s.role}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;width:18%;height:30px;"></td>
      <td style="padding:6px 8px;border:1px solid #ddd;width:36%;height:30px;"></td>
    </tr>`).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>${doc.doc_number} — ${doc.title}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; color: #1a1a1a; margin: 0; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 8px; border-bottom: 3px solid #3A5C2E; margin-bottom: 8px; }
    .logo { height: 44px; width: auto; object-fit: contain; }
    .doc-info { flex: 1; }
    .doc-type { font-size: 7.5pt; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; color: #3A5C2E; }
    .doc-title { font-size: 13pt; font-weight: bold; color: #1a1a1a; line-height: 1.2; }
    .meta { display: flex; gap: 0; margin-bottom: 8px; border: 1px solid #ccc; }
    .meta-cell { flex: 1; padding: 4px 7px; border-right: 1px solid #ccc; }
    .meta-cell:last-child { border-right: none; }
    .meta-cell .lbl { font-size: 7pt; font-weight: bold; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    .meta-cell .val { font-size: 8.5pt; color: #1a1a1a; font-weight: 600; }
    h3 { font-size: 8.5pt; font-weight: bold; background: #3A5C2E; color: #fff; padding: 5px 8px; margin: 8px 0 0 0; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    th { background: #3A5C2E; color: #fff; padding: 5px 6px; text-align: left; font-size: 7.5pt; font-weight: bold; border: 1px solid #2a4a20; }
    .sssp-box { background: #FFF8EE; border: 1.5px solid #E8C570; padding: 6px 10px; margin: 6px 0 8px; font-size: 8pt; }
    .sssp-box strong { color: #7A5500; }
    .ppe-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; }
    .ppe-item { background: #f0f5ee; border: 1px solid #c8d8c0; border-radius: 3px; padding: 3px 8px; font-size: 7.5pt; }
    .sign-head { display: flex; align-items: center; gap: 8px; background: #3A5C2E; color: #fff; padding: 5px 8px; margin-top: 8px; font-size: 8.5pt; font-weight: bold; }
    .sign-note { font-size: 7.5pt; color: #666; padding: 4px 0 4px; font-style: italic; }
    .footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }
    .risk-matrix { display: flex; gap: 8px; align-items: center; padding: 5px 0; font-size: 7pt; }
    .rm-item { padding: 2px 7px; border-radius: 3px; font-weight: bold; }
  </style>
  </head><body>

  <div class="header">
    <img src="${logoUrl}" class="logo" alt="Urban Tree Services" onerror="this.style.display='none'">
    <div class="doc-info">
      <div class="doc-type">Safe Work Method Statement</div>
      <div class="doc-title">${doc.title}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-cell"><div class="lbl">Document No.</div><div class="val">${doc.doc_number}</div></div>
    <div class="meta-cell"><div class="lbl">Reference</div><div class="val">${doc.ref}</div></div>
    <div class="meta-cell"><div class="lbl">Version</div><div class="val">v${doc.version}</div></div>
    <div class="meta-cell"><div class="lbl">Prepared by</div><div class="val">${doc.prepared_by}</div></div>
    <div class="meta-cell"><div class="lbl">Review date</div><div class="val">${fmtDate(doc.review_date) || '—'}</div></div>
    <div class="meta-cell"><div class="lbl">Status</div><div class="val">${doc.status.toUpperCase()}</div></div>
  </div>

  <div class="sssp-box">
    <strong>⚠ SITE-SPECIFIC HAZARDS:</strong> This SWMS identifies generic hazards for this activity only.
    All site-specific hazards (overhead utilities, proximity to structures, ground conditions, third-party presence,
    weather, traffic) must be identified and recorded in the <strong>Site-Specific Safety Plan (SSSP)</strong>
    prior to commencing work. This SWMS is to be read in conjunction with the SSSP.
  </div>

  <div class="risk-matrix">
    Risk rating = Likelihood (1–5) × Consequence (1–5)&nbsp;&nbsp;
    <span class="rm-item" style="background:#E8F0E6;color:#4A6741">LOW 1–4</span>
    <span class="rm-item" style="background:#FEFBEA;color:#B5770F">MEDIUM 5–9</span>
    <span class="rm-item" style="background:#FDF3E3;color:#D4851A">HIGH 10–16</span>
    <span class="rm-item" style="background:#FFF0EE;color:#C0392B">CRITICAL 17–25</span>
  </div>

  <h3>Hazard Identification &amp; Control Measures</h3>
  <table>
    <thead>
      <tr>
        <th style="width:22%">Hazard / Risk</th>
        <th style="width:10%">Who at risk</th>
        <th style="width:36%">Control measures (hierarchy: eliminate → substitute → isolate → engineering → admin → PPE)</th>
        <th style="width:12%;text-align:center">Risk before controls</th>
        <th style="width:12%;text-align:center">Risk after controls</th>
        <th style="width:8%">Responsible</th>
      </tr>
    </thead>
    <tbody>
      ${hazardRows}
      <tr style="background:#FFF8EE">
        <td colspan="6" style="padding:5px 8px;border:1px solid #ddd;font-style:italic;color:#7A5500;">
          ★ Site-specific hazards — refer to the SSSP completed prior to this job. Additional controls may apply.
        </td>
      </tr>
    </tbody>
  </table>

  ${ppeItems.length ? `
  <h3>Required Personal Protective Equipment</h3>
  <div class="ppe-grid">${ppeItems.map(l => `<span class="ppe-item">✓ ${l}</span>`).join('')}</div>
  ` : ''}

  <div class="sign-head">Worker Acknowledgement &amp; Sign-off</div>
  <div class="sign-note">
    By signing below I confirm that I have read, understood and will comply with this SWMS before commencing work.
    I will raise any concerns with the supervisor before starting.
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:28%">Name</th>
        <th style="width:18%">Role</th>
        <th style="width:18%">Date</th>
        <th style="width:36%">Signature</th>
      </tr>
    </thead>
    <tbody>
      ${signOffRows}
      <tr><td style="padding:6px 8px;border:1px solid #ddd;height:30px;"></td><td style="border:1px solid #ddd;"></td><td style="border:1px solid #ddd;"></td><td style="border:1px solid #ddd;"></td></tr>
    </tbody>
  </table>

  <div class="footer">
    <span>Urban Tree Services Ltd — ${doc.doc_number} v${doc.version} — ${doc.title}</span>
    <span>Aligned with: ${doc.ref}</span>
    <span>HSWA 2015 · WorkSafe NZ · NZArb · ArbAus</span>
  </div>

  <script>window.onload = () => window.print()</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SWMS() {
  const [docs, setDocs]   = useState(loadDocs)
  const [view, setView]   = useState(null)

  const persist = useCallback(list => { setDocs(list); saveDocs(list) }, [])

  const editing = view ? docs.find(d => d.id === view) : null

  function handleSave(doc) {
    const list = docs.some(d => d.id === doc.id)
      ? docs.map(d => d.id === doc.id ? doc : d)
      : [doc, ...docs]
    persist(list); setView(null)
  }
  function handleDelete(id) {
    if (!confirm('Delete this SWMS?')) return
    persist(docs.filter(d => d.id !== id)); setView(null)
  }
  function handleNew() {
    const doc = makeDoc({ id: 'custom', ref: '', title: 'Custom Activity', hazards: [] }, docs.length + 1)
    persist([...docs, doc]); setView(doc.id)
  }

  if (editing) {
    return <SWMSEditor doc={editing}
      onSave={handleSave}
      onDelete={() => handleDelete(editing.id)}
      onBack={() => setView(null)} />
  }

  const statusClr = { draft:{ bg:'#F3F4F6',c:'#6B7280' }, active:{ bg:'#E8F0E6',c:'#4A6741' }, archived:{ bg:'#FFF0EE',c:'#9B4040' } }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={s.secTitle}>SWMS · {docs.length} DOCUMENTS</div>
        <button style={s.addBtn} onClick={handleNew}>+ New SWMS</button>
      </div>
      <div style={{ fontSize:12, color:'#888', background:'#FFF8EE', border:'1px solid #E8D5A3', borderRadius:8, padding:'8px 14px', marginBottom:14 }}>
        Each SWMS covers generic activity hazards. Site-specific hazards go in the SSSP completed per job.
      </div>
      {docs.length === 0 ? <div style={s.empty}>No SWMS yet.</div> : (
        <div style={s.list}>
          {docs.map(doc => {
            const sc = statusClr[doc.status] ?? statusClr.draft
            return (
              <div key={doc.id} style={s.row}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#aaa', flexShrink:0 }}>{doc.doc_number}</span>
                    <span style={s.rowTitle}>{doc.title}</span>
                    <span style={{ ...s.badge, background:sc.bg, color:sc.c }}>{doc.status}</span>
                    <span style={s.verBadge}>v{doc.version}</span>
                  </div>
                  <div style={s.rowMeta}>{doc.ref} · {doc.hazards.length} hazards · {(doc.ppe??[]).length} PPE items</div>
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                  <button style={s.editBtn} onClick={() => setView(doc.id)}>Edit</button>
                  <button style={s.pdfBtn} onClick={() => printPDF(doc)}>↓ PDF</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Editor ────────────────────────────────────────────────────────────────────

function SWMSEditor({ doc, onSave, onDelete, onBack }) {
  const [form, setForm] = useState(doc)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function addHazard() {
    set('hazards', [...form.hazards, { id:uid(), hazard:'', who:'', controls:'', ll:3, cl:3, lr:2, cr:2, responsible:'Supervisor' }])
  }
  function updHazard(id, k, v) {
    set('hazards', form.hazards.map(h => h.id === id ? { ...h, [k]: v } : h))
  }
  function delHazard(id) { set('hazards', form.hazards.filter(h => h.id !== id)) }

  function togPPE(id) {
    const list = form.ppe ?? []
    set('ppe', list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  function addStaff() {
    set('sign_offs', [...(form.sign_offs??[]), { id:uid(), name:'', role:'', date:'', signed:false }])
  }
  function updStaff(id, k, v) {
    set('sign_offs', form.sign_offs.map(s => s.id === id ? { ...s, [k]: v } : s))
  }
  function delStaff(id) { set('sign_offs', form.sign_offs.filter(s => s.id !== id)) }

  return (
    <div style={{ maxWidth:900 }}>
      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <div style={{ flex:1, fontWeight:800, fontSize:15, color:'var(--bark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {form.doc_number} — {form.title}
        </div>
        <button style={s.pdfBtn2} onClick={() => printPDF(form)}>↓ PDF</button>
        <button style={s.delBtn} onClick={onDelete}>Delete</button>
        <button style={s.saveBtn} onClick={() => onSave(form)}>Save</button>
      </div>

      {/* Details */}
      <Sec label="Document Details">
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <MF label="Title"><input style={s.inp} value={form.title} onChange={e => set('title', e.target.value)} /></MF>
          <MF label="Doc number"><input style={s.inp} value={form.doc_number} onChange={e => set('doc_number', e.target.value)} /></MF>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <MF label="Reference standard"><input style={s.inp} value={form.ref} onChange={e => set('ref', e.target.value)} /></MF>
          <MF label="Version"><input style={s.inp} value={form.version} onChange={e => set('version', e.target.value)} /></MF>
          <MF label="Status">
            <select style={s.inp} value={form.status} onChange={e => set('status', e.target.value)}>
              {['draft','active','archived'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </MF>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <MF label="Prepared by"><input style={s.inp} value={form.prepared_by} onChange={e => set('prepared_by', e.target.value)} /></MF>
          <MF label="Approved by"><input style={s.inp} value={form.approved_by} onChange={e => set('approved_by', e.target.value)} /></MF>
          <MF label="Review date"><input type="date" style={s.inp} value={form.review_date} onChange={e => set('review_date', e.target.value)} /></MF>
        </div>
        <div style={{ fontSize:11, color:'#999', marginTop:2 }}>
          Aligned with NZArb best practice, ArbAus MIS, HSWA 2015 and WorkSafe NZ guidance. Professional H&S review recommended before formal contract submissions.
        </div>
      </Sec>

      {/* SSSP note */}
      <div style={{ background:'#FFF8EE', border:'1.5px solid #E8C570', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#7A5500' }}>
        <strong>⚠ Site-specific hazards — refer to SSSP:</strong> This SWMS covers generic hazards for this activity only.
        Site-specific hazards (overhead utilities, structures, ground conditions, third parties, weather, traffic)
        must be identified in the <strong>Site-Specific Safety Plan (SSSP)</strong> prior to commencing work.
      </div>

      {/* Hazards */}
      <Sec label="Hazard Identification & Controls">
        <div style={{ overflowX:'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width:'22%' }}>Hazard / Risk</th>
                <th style={{ ...s.th, width:'10%' }}>Who at risk</th>
                <th style={{ ...s.th, width:'34%' }}>Control measures</th>
                <th style={{ ...s.th, width:'13%', textAlign:'center' }}>Risk before</th>
                <th style={{ ...s.th, width:'13%', textAlign:'center' }}>Risk after</th>
                <th style={{ ...s.th, width:'7%' }}>Responsible</th>
                <th style={{ ...s.th, width:'1%' }}></th>
              </tr>
            </thead>
            <tbody>
              {form.hazards.map((h,i) => <HRow key={h.id} h={h} i={i} onChange={(k,v) => updHazard(h.id,k,v)} onDelete={() => delHazard(h.id)} />)}
              <tr>
                <td colSpan={7} style={{ padding:'7px 8px', background:'#FFFBF0', border:'1px solid var(--border)', fontStyle:'italic', fontSize:11, color:'#A07820' }}>
                  ★ Site-specific hazards — see SSSP completed prior to this job
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <button style={{ ...s.secBtn, marginTop:8 }} onClick={addHazard}>+ Add hazard row</button>
      </Sec>

      {/* PPE */}
      <Sec label="Required PPE">
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {PPE.map(p => (
            <label key={p.id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer' }}>
              <input type="checkbox" checked={(form.ppe??[]).includes(p.id)} onChange={() => togPPE(p.id)} />
              <span style={{ fontWeight:600, color:'var(--bark)' }}>{p.label}</span>
              {p.std && <span style={{ color:'#999', fontSize:11 }}>{p.std}</span>}
            </label>
          ))}
        </div>
      </Sec>

      {/* Sign-off */}
      <Sec label="Worker Sign-off">
        <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>
          All workers sign to confirm they have read, understood and will comply with this SWMS before commencing work.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {(form.sign_offs??[]).map(so => (
            <div key={so.id} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
              <MF label="Name"><input style={{ ...s.inp, minWidth:150 }} value={so.name} onChange={e => updStaff(so.id,'name',e.target.value)} /></MF>
              <MF label="Role"><input style={{ ...s.inp, minWidth:120 }} value={so.role} onChange={e => updStaff(so.id,'role',e.target.value)} /></MF>
              <button style={{ ...s.iconBtn, marginBottom:10 }} onClick={() => delStaff(so.id)}>✕</button>
            </div>
          ))}
        </div>
        <button style={s.secBtn} onClick={addStaff}>+ Add staff member</button>
      </Sec>

      {/* Notes */}
      <Sec label="Notes">
        <textarea style={{ ...s.inp, minHeight:70 }} value={form.notes} onChange={e => set('notes', e.target.value)}
          placeholder="Any additional notes or site-specific observations…" />
      </Sec>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)' }}>
        <button style={s.pdfBtn2} onClick={() => printPDF(form)}>↓ Download PDF</button>
        <button style={s.cancelBtn} onClick={onBack}>Cancel</button>
        <button style={s.saveBtn} onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  )
}

// ── Hazard row ────────────────────────────────────────────────────────────────

function HRow({ h, i, onChange, onDelete }) {
  const before = risk(h.ll, h.cl)
  const after  = risk(h.lr, h.cr)
  const ns     = [1,2,3,4,5]
  return (
    <tr style={{ background: i%2===0 ? '#fff' : '#FAFAF8', verticalAlign:'top' }}>
      <td style={s.td}><textarea style={{ ...s.cell, minHeight:60 }} value={h.hazard} onChange={e => onChange('hazard',e.target.value)} placeholder="Hazard…" /></td>
      <td style={s.td}><input style={s.cell} value={h.who} onChange={e => onChange('who',e.target.value)} placeholder="Climber" /></td>
      <td style={s.td}><textarea style={{ ...s.cell, minHeight:80 }} value={h.controls} onChange={e => onChange('controls',e.target.value)} placeholder="Control measures (eliminate → substitute → isolate → engineering → admin → PPE)…" /></td>
      <td style={{ ...s.td, textAlign:'center' }}>
        <div style={{ display:'flex', gap:3, justifyContent:'center', marginBottom:4 }}>
          <select style={s.rsel} value={h.ll} onChange={e => onChange('ll',+e.target.value)}>{ns.map(n=><option key={n} value={n}>L{n}</option>)}</select>
          <select style={s.rsel} value={h.cl} onChange={e => onChange('cl',+e.target.value)}>{ns.map(n=><option key={n} value={n}>C{n}</option>)}</select>
        </div>
        <span style={{ ...s.rbadge, background:before.bg, color:before.color }}>{before.label} {before.s}</span>
      </td>
      <td style={{ ...s.td, textAlign:'center' }}>
        <div style={{ display:'flex', gap:3, justifyContent:'center', marginBottom:4 }}>
          <select style={s.rsel} value={h.lr} onChange={e => onChange('lr',+e.target.value)}>{ns.map(n=><option key={n} value={n}>L{n}</option>)}</select>
          <select style={s.rsel} value={h.cr} onChange={e => onChange('cr',+e.target.value)}>{ns.map(n=><option key={n} value={n}>C{n}</option>)}</select>
        </div>
        <span style={{ ...s.rbadge, background:after.bg, color:after.color }}>{after.label} {after.s}</span>
      </td>
      <td style={s.td}><input style={s.cell} value={h.responsible||''} onChange={e => onChange('responsible',e.target.value)} placeholder="Supervisor" /></td>
      <td style={{ ...s.td, textAlign:'center' }}><button style={s.iconBtn} onClick={onDelete}>✕</button></td>
    </tr>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Sec({ label, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={s.sec}>
      <div style={s.secHead} onClick={() => setOpen(v=>!v)}>
        <span style={{ fontWeight:700, fontSize:13, color:'var(--bark)' }}>{label}</span>
        <span style={{ color:'#bbb', fontSize:13 }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && <div style={s.secBody}>{children}</div>}
    </div>
  )
}
const MF = ({ label, children }) => (
  <div style={{ flex:1, marginBottom:10, minWidth:130 }}>
    <div style={s.flbl}>{label}</div>
    {children}
  </div>
)

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  secTitle: { fontSize:13, fontWeight:700, color:'var(--bark)', textTransform:'uppercase', letterSpacing:'0.04em' },
  addBtn:   { background:'var(--moss)', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' },
  editBtn:  { background:'none', border:'none', borderRadius:6, padding:'5px 8px', fontSize:11, color:'#bbb', cursor:'pointer', fontFamily:'var(--font)', flexShrink:0 },
  pdfBtn:   { background:'var(--moss)', color:'#fff', border:'none', borderRadius:6, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)', flexShrink:0 },
  pdfBtn2:  { background:'var(--moss)', color:'#fff', border:'none', borderRadius:7, padding:'8px 14px', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--font)' },
  backBtn:  { background:'#fff', border:'1px solid var(--border)', borderRadius:7, padding:'7px 12px', fontSize:12, color:'#666', cursor:'pointer', fontFamily:'var(--font)', flexShrink:0 },
  saveBtn:  { background:'var(--moss)', color:'#fff', border:'none', borderRadius:7, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'var(--font)' },
  cancelBtn:{ background:'#fff', border:'1px solid var(--border)', borderRadius:7, padding:'9px 16px', fontSize:13, color:'#666', cursor:'pointer', fontFamily:'var(--font)' },
  delBtn:   { background:'#fff', border:'1px solid #E0B4B0', borderRadius:7, padding:'7px 12px', fontSize:12, color:'var(--danger)', cursor:'pointer', fontFamily:'var(--font)' },
  secBtn:   { background:'#fff', border:'1px solid var(--border)', borderRadius:7, padding:'6px 12px', fontSize:12, color:'#555', cursor:'pointer', fontFamily:'var(--font)' },
  iconBtn:  { background:'none', border:'none', color:'#ccc', fontSize:14, cursor:'pointer', padding:'2px 4px', fontFamily:'var(--font)' },

  list:     { display:'flex', flexDirection:'column', gap:8 },
  row:      { display:'flex', alignItems:'center', gap:10, background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px' },
  rowTitle: { fontSize:14, fontWeight:600, color:'var(--bark)' },
  rowMeta:  { fontSize:11, color:'#999' },
  badge:    { fontSize:10, fontWeight:700, borderRadius:5, padding:'2px 7px', textTransform:'uppercase', whiteSpace:'nowrap' },
  verBadge: { fontSize:10, fontWeight:600, background:'#F3F4F6', color:'#888', borderRadius:4, padding:'2px 6px' },
  empty:    { color:'#bbb', fontSize:14, padding:'20px 0', textAlign:'center' },

  sec:      { background:'#fff', border:'1px solid var(--border)', borderRadius:10, marginBottom:10, overflow:'hidden' },
  secHead:  { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid var(--border)', background:'var(--cream)' },
  secBody:  { padding:'14px 16px' },

  table:    { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:       { background:'#3A5C2E', color:'#fff', padding:'6px 7px', fontWeight:700, textAlign:'left', fontSize:11, textTransform:'uppercase', letterSpacing:'0.03em', border:'1px solid #2a4a20' },
  td:       { padding:'5px 5px', borderBottom:'1px solid #f0f0ee', verticalAlign:'top', border:'1px solid #eee' },
  cell:     { width:'100%', padding:'4px 6px', borderRadius:4, border:'1px solid var(--border)', fontSize:11.5, color:'var(--bark)', fontFamily:'var(--font)', boxSizing:'border-box', background:'#fff', resize:'vertical' },
  rsel:     { padding:'3px 4px', borderRadius:4, border:'1px solid var(--border)', fontSize:11, fontFamily:'var(--font)', background:'#fff' },
  rbadge:   { display:'inline-block', fontSize:11, fontWeight:700, borderRadius:4, padding:'2px 6px' },

  flbl:     { fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 },
  inp:      { width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid var(--border)', fontSize:13, color:'var(--bark)', fontFamily:'var(--font)', boxSizing:'border-box', background:'#fff' },
}
