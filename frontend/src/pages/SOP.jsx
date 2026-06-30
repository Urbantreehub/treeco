import { useState, useCallback } from 'react'

// ── Storage ───────────────────────────────────────────────────────────────────

const LS_KEY   = 'treeco_sop_v1'
const SEED_KEY = 'treeco_sop_seeded_v1'

function loadDocs() {
  try {
    if (!localStorage.getItem(SEED_KEY)) {
      const seeded = SOP_LIBRARY.map((lib, i) => makeDoc(lib, i + 1))
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

// ── PPE (shared with SWMS) ────────────────────────────────────────────────────

const PPE = [
  { id:'helmet',         label:'Arborist helmet',             std:'NZS 8600 / AS/NZS 1801' },
  { id:'helmet_visor',   label:'Helmet + full face visor',    std:'AS/NZS 1337.1' },
  { id:'ear',            label:'Hearing protection Class 5',  std:'AS/NZS 1269 (≥29dB SNR)' },
  { id:'chaps',          label:'Chainsaw chaps Class 1',      std:'AS/NZS 4453.3:1997' },
  { id:'harness',        label:'Arborist climbing saddle / harness', std:'Arborist-rated, 22kN min' },
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

// ── Default staff ─────────────────────────────────────────────────────────────

const DEFAULT_STAFF = [
  { id:'s1', name:'Josh Micallef',        role:'Director / Climber' },
  { id:'s2', name:'Lea Molloy',           role:'Climber' },
  { id:'s3', name:'Stuart Fraser Wilson', role:'Climber' },
  { id:'s4', name:'Joel Ewan',            role:'Groundsman' },
  { id:'s5', name:'Josh Curran Mongan',   role:'Groundsman' },
  { id:'s6', name:'Kaleb',               role:'Groundsman' },
]

// ── SOP Library ───────────────────────────────────────────────────────────────

const STEP_PHASES = ['Preparation', 'Setup', 'Execution', 'Completion', 'Emergency']

const SOP_LIBRARY = [
  {
    id: 'site_assessment',
    title: 'Pre-Work Site Assessment',
    ref: 'HSWA 2015 s36 / WorkSafe NZ / ArbAus MIS',
    purpose: 'Systematic assessment of all work sites before any arboricultural operations commence, ensuring all hazards are identified, controlled, and communicated to crew.',
    scope: 'All UTS staff — mandatory before commencing work at any new site or when site conditions have changed since last visit.',
    ppe: ['helmet', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Review job brief, scope, client notes and any previous site visit records.', responsible:'Supervisor', reference:'HSWA 2015', critical:false },
      { phase:'Preparation', action:'Check MetService weather forecast. Do NOT commence if sustained winds >50km/h, lightning within 5km, or heavy rain forecast for overhead work.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'Confirm crew qualifications match task requirements (climbing ticket, chainsaw cert, EWP certificate as applicable).', responsible:'Supervisor', reference:'HSWA 2015 s36', critical:true },
      { phase:'Preparation', action:'Ensure blank SSSP (Site-Specific Safety Plan) document is available for completion on site.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
      { phase:'Setup', action:'Position vehicles safely on arrival. Assess road and driveway conditions before parking or driving on.', responsible:'All crew', reference:'CoPTTM NZ', critical:false },
      { phase:'Setup', action:'Walk the full site perimeter before unloading — identify all primary hazards including structures, slopes, waterways, and unstable ground.', responsible:'Supervisor', reference:'ArbAus MIS', critical:true },
      { phase:'Setup', action:'Locate and identify ALL overhead power lines. Note estimated voltage and required clearance distances (≥4m LV / ≥6m HV per ECP 34).', responsible:'Supervisor', reference:'ECP 34 / WorkSafe NZ', critical:true },
      { phase:'Setup', action:'If any ground disturbance is planned, call Dial Before You Dig (0800 248 344) to confirm underground service locations.', responsible:'Supervisor', reference:'Utilities Act NZ', critical:false },
      { phase:'Setup', action:'Assess tree(s) for structural hazards: lean, decay, cracks, hangers, co-dominant stems, root damage, recent soil disturbance.', responsible:'Supervisor / Climber', reference:'AS 4373-2007 / NZArb', critical:true },
      { phase:'Setup', action:'Identify structures, vehicles, fencing, and third-party areas that could be struck by falling material. Establish exclusion zones (minimum 2× tree height for ground felling).', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Confirm emergency vehicle access route and identify nearest A&E / hospital. Record address for ambulance callout.', responsible:'Supervisor', reference:'HSWA 2015', critical:false },
      { phase:'Execution', action:'Complete SSSP document in full — record all identified site-specific hazards and controls before any work commences.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Brief ALL crew on: task scope, identified hazards, controls in place, emergency procedure, signal system, and exclusion zones.', responsible:'Supervisor', reference:'HSWA 2015 s36', critical:true },
      { phase:'Execution', action:'Confirm first aid kit is on site, accessible, stocked, and first aider is identified.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
      { phase:'Execution', action:'Obtain client and building owner consents. Confirm any council or infrastructure notices where applicable.', responsible:'Supervisor', reference:'RMA NZ', critical:false },
      { phase:'Completion', action:'Reassess site conditions if weather changes significantly during the work period. Stop and re-brief crew if new hazards arise.', responsible:'Supervisor', reference:'HSWA 2015 s36', critical:true },
      { phase:'Completion', action:'Brief crew on outstanding hazards for any follow-up visit.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
    ],
  },
  {
    id: 'equipment_inspection',
    title: 'Daily Equipment Pre-Start Inspection',
    ref: 'WorkSafe NZ / AS/NZS 4143.3 / Manufacturer specifications',
    purpose: 'Ensure all equipment and PPE used by UTS is safe, serviceable, and fit for purpose before each working day or shift.',
    scope: 'All crew — each person is responsible for inspecting their own PPE and operated equipment. Supervisor confirms defect removals.',
    ppe: ['gloves_cut', 'boots'],
    steps: [
      { phase:'Preparation', action:'Each crew member inspects their climbing harness/saddle: webbing for cuts, abrasion or chemical contamination; stitching intact; buckles and load indicators functional; within manufacturers service life.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Preparation', action:'Inspect climbing ropes: no cuts, glazing, core damage, stiffness, or chemical contamination. Retire any rope showing these signs — do not repair.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Preparation', action:'Inspect carabiners, prussiks, pulleys, and connectors: no cracks, sharp edges, gating faults, or corrosion. Gate opens freely and locks securely.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Preparation', action:'Inspect chainsaw(s): chain tension, bar condition, chain brake functional, all guards in place, air filter clean, oil reservoir full, throttle interlock working. Test chain brake before first cut of day.', responsible:'Operator', reference:'WorkSafe NZ Chainsaw Guide', critical:true },
      { phase:'Preparation', action:'Inspect chainsaw chaps for cuts, tears, or compressed fibres (compressed = previously struck). Replace immediately if damaged.', responsible:'Operator', reference:'AS/NZS 4453.3', critical:true },
      { phase:'Preparation', action:'Inspect helmets: no cracks, dents or deformation; chin strap and ratchet functional; visor undamaged and clips securely. Replace any helmet that has taken a significant impact even if no visible damage.', responsible:'All crew', reference:'NZS 8600', critical:false },
      { phase:'Preparation', action:'Inspect first aid kit: stocked with current contents, expiry dates valid, accessible in vehicle. Report any depleted items to Supervisor for restocking.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
      { phase:'Setup', action:'Inspect chipper: all guards in place, emergency stop functional, belt tension checked, discharge chute clear, no loose bolts. Grease nipples serviced per schedule.', responsible:'Operator', reference:'WorkSafe NZ / Manufacturer', critical:true },
      { phase:'Setup', action:'Inspect vehicle(s): tyres pressured and undamaged, lights functional, load secured, tow ball torqued if towing chipper, fluid levels (oil, water, brake fluid) within range.', responsible:'Driver', reference:'Land Transport Act NZ', critical:false },
      { phase:'Execution', action:'Tag and remove from service any equipment that fails inspection — attach a clear "DO NOT USE — DEFECTIVE" tag and report to Supervisor immediately.', responsible:'All crew', reference:'HSWA 2015 s36', critical:true },
      { phase:'Execution', action:'Record any defects, retirements, or issues in the equipment inspection log. Note item, fault observed, action taken, and date.', responsible:'Supervisor', reference:'HSWA 2015', critical:false },
      { phase:'Completion', action:'End of day: clean equipment, store ropes and harnesses away from UV and chemicals, recharge or refuel as needed. Stow chainsaw(s) with sheath on bar.', responsible:'All crew', reference:'Manufacturer specs', critical:false },
    ],
  },
  {
    id: 'tree_climbing',
    title: 'Tree Climbing Setup & Procedure',
    ref: 'ArbAus MIS 01 / WorkSafe NZ / AS/NZS 4143.3 / NZArb',
    purpose: 'Safe setup, ascent, aerial work positioning, and descent for all arborist tree climbing operations.',
    scope: 'Qualified arborists conducting any aerial tree work. A competent second person trained in aerial rescue must be present for ALL work above 3m.',
    ppe: ['helmet_visor', 'ear', 'chaps', 'harness', 'gloves_cut', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Confirm aerial-rescue-trained second person is present on site. Work above 3m must NOT commence without a qualified rescue-capable crew member on the ground.', responsible:'Supervisor', reference:'WorkSafe NZ mandatory', critical:true },
      { phase:'Preparation', action:'Complete site assessment (SOP-001) — confirm exclusion zones established and all crew briefed.', responsible:'Supervisor', reference:'HSWA 2015', critical:true },
      { phase:'Preparation', action:'Inspect all climbing equipment (refer SOP-002 daily inspection). Do not climb with any item that has not passed inspection.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Setup', action:'Assess tree structure from ground: identify primary anchor zone, potential hangers, dead wood, structural cracks, and overall stability before ascending.', responsible:'Climber', reference:'AS 4373-2007 / NZArb', critical:true },
      { phase:'Setup', action:'Install throwline or use pole pruner to set first anchor — use a running bowline on a limb of sufficient diameter (minimum wrist-thick green wood). Inspect anchor under body weight before committing.', responsible:'Climber', reference:'NZArb / ArbAus MIS 01', critical:true },
      { phase:'Setup', action:'Establish a Stationary Rope System (SRS) or Moving Rope System (MRS) as appropriate to the task. Ensure a minimum 22kN-rated connection throughout.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Setup', action:'Attach climbing saddle to rope system and confirm both attachment points are loaded and locked before leaving the ground.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Setup', action:'Set exclusion zone signage and confirm all ground crew are in position outside the zone.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
      { phase:'Execution', action:'Ascend — test load anchor system before full weight commitment. Communicate position to ground crew throughout climb.', responsible:'Climber', reference:'ArbAus MIS 01', critical:false },
      { phase:'Execution', action:'Maintain two independent attachment points (IAP) at all times when in the canopy. Never be attached by only one point when repositioning.', responsible:'Climber', reference:'NZArb / AS/NZS 4143.3', critical:true },
      { phase:'Execution', action:'Before each cut or drop, signal to ground crew and wait for "CLEAR" confirmation. Never drop material until ground crew are clear and have acknowledged.', responsible:'Climber', reference:'ArbAus MIS 01', critical:true },
      { phase:'Execution', action:'Keep chainsaw below shoulder height at all times when cutting — never cut above shoulder or behind the body. Sheath chainsaw before repositioning in canopy.', responsible:'Climber', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Continuously reassess anchor integrity as the tree changes during work. Reposition anchor if working section creates structural instability in the anchor zone.', responsible:'Climber', reference:'NZArb', critical:true },
      { phase:'Execution', action:'Maintain ≥4m clearance from low-voltage lines and ≥6m from high-voltage lines. If clearance cannot be maintained, stop work and notify line owner.', responsible:'Climber', reference:'ECP 34 / WorkSafe NZ', critical:true },
      { phase:'Completion', action:'Sheath chainsaw before descending. Descend using controlled-descent device or footlock — never freefall.', responsible:'Climber', reference:'ArbAus MIS 01', critical:true },
      { phase:'Completion', action:'Remove all rigging and throwline. Inspect climbing equipment post-use and report any damage or wear immediately.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:false },
      { phase:'Completion', action:'Clear exclusion zone and conduct a final visual inspection of tree and site before opening area to public/client.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
    ],
  },
  {
    id: 'crown_pruning',
    title: 'Crown Pruning Procedure',
    ref: 'AS 4373-2007 / NZArb / ArbAus MIS / ISA Best Practice',
    purpose: 'Correct execution of crown pruning operations including crown lift, crown reduction, crown thinning, and dead-wooding in line with Australian Standard AS 4373-2007.',
    scope: 'All arborists conducting pruning operations. Each operation type must be specifically instructed and confirmed with client/supervisor before commencement.',
    ppe: ['helmet_visor', 'ear', 'chaps', 'harness', 'gloves_cut', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Confirm the specific pruning specification with the client: crown lift (height to X metres), crown reduction (reduce by X%), crown thinning (remove X% canopy), dead-wooding, or formative pruning.', responsible:'Supervisor', reference:'AS 4373-2007 s3', critical:true },
      { phase:'Preparation', action:'Check if tree is listed on the Council protected tree register or subject to consent/notice of requirement. Do not proceed if in doubt — check with client.', responsible:'Supervisor', reference:'RMA / District Plan NZ', critical:true },
      { phase:'Preparation', action:'Assess tree health and structure (SOP-001). Identify structural defects, decay, included bark unions, and previous wound responses before pruning.', responsible:'Climber / Supervisor', reference:'AS 4373-2007 / NZArb', critical:true },
      { phase:'Setup', action:'Complete climbing setup (SOP-003). Position anchor in the appropriate part of canopy for pruning work.', responsible:'Climber', reference:'ArbAus MIS 01', critical:false },
      { phase:'Setup', action:'Identify pruning targets clearly — mark or verbally confirm with supervisor which branches are to be removed before starting.', responsible:'Climber + Supervisor', reference:'AS 4373-2007', critical:true },
      { phase:'Execution', action:'Make all cuts to the branch collar — never flush cut. Identify the branch bark ridge (BBR) and branch collar clearly before each cut.', responsible:'Climber', reference:'AS 4373-2007 s5.1', critical:true },
      { phase:'Execution', action:'Use three-cut method on branches >50mm diameter: undercut 30cm from collar (1), relief cut 5cm further (2), final collar cut (3). This prevents bark stripping.', responsible:'Climber', reference:'AS 4373-2007 s5.2', critical:true },
      { phase:'Execution', action:'Crown thinning: remove no more than the specified percentage (typically 10–20%) of live crown. Prioritise small, weak, crossing, or rubbing branches. Maintain a balanced crown.', responsible:'Climber', reference:'AS 4373-2007 s4.3', critical:false },
      { phase:'Execution', action:'Crown reduction: make heading cuts to lateral branches at least ⅓ the diameter of the removed limb (leave a live lateral). Never stub-cut unless specifically instructed for pollarding.', responsible:'Climber', reference:'AS 4373-2007 s4.4', critical:true },
      { phase:'Execution', action:'Crown lift: remove branches uniformly to the specified clearance height. Remove from the outer canopy base, not by removing major scaffold limbs.', responsible:'Climber', reference:'AS 4373-2007 s4.2', critical:false },
      { phase:'Execution', action:'Do NOT apply wound dressings or sealants to pruning cuts — current evidence shows these are not beneficial and may trap pathogens.', responsible:'Climber', reference:'AS 4373-2007 s5.3', critical:false },
      { phase:'Execution', action:'Reassess structural integrity after each major limb removal — adjust rigging and anchor if the crown balance has shifted significantly.', responsible:'Climber', reference:'NZArb', critical:true },
      { phase:'Completion', action:'Conduct visual post-pruning assessment: balanced appearance, no stubs, no bark tears, cuts to collar. Document any structural concerns noted during work.', responsible:'Climber / Supervisor', reference:'AS 4373-2007', critical:false },
      { phase:'Completion', action:'Photograph completed work (before/after) using the S&D photography protocol. Upload to job record.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:false },
      { phase:'Completion', action:'Remove all debris from site. Chip or remove material as per client agreement. Rake and blow footpath, driveway, and any adjacent areas.', responsible:'Ground crew', reference:'UTS SOP-017', critical:false },
    ],
  },
  {
    id: 'directional_felling',
    title: 'Directional Tree Felling',
    ref: 'ArbAus MIS 08 / WorkSafe NZ Chainsaw Guide / AS/NZS 4453',
    purpose: 'Safe directional felling of trees using conventional notch-and-back-cut technique. This SOP applies to trees being felled to ground in a predetermined direction.',
    scope: 'Qualified chainsaw operators with at least Level 3 arborist qualification or equivalent NZ unit standards. Supervisor approval required for all felling operations.',
    ppe: ['helmet_visor', 'ear', 'chaps', 'gloves_cut', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Supervisor approves felling operation. Confirm felling is not possible by any other method (sectional dismantling preferable when near structures, services, or the public).', responsible:'Supervisor', reference:'HSWA 2015 / WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'Assess tree: determine lean (natural lean direction), weight distribution, and crown balance. Identify any structural defects that could cause unexpected failure during felling.', responsible:'Operator / Supervisor', reference:'ArbAus MIS 08 / NZArb', critical:true },
      { phase:'Preparation', action:'Identify felling direction. Confirm clear felling run — no structures, utilities, fences, or persons within 2× tree height in the felling arc.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'Plan and confirm two escape routes — 45° behind the stump on each side, away from the felling direction. Clear escape routes of tripping hazards.', responsible:'Operator', reference:'ArbAus MIS 08', critical:true },
      { phase:'Setup', action:'Establish exclusion zone: minimum 2× tree height radius in felling direction. Post crew at all access points to prevent third-party entry.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Set up traffic management if the felling zone extends to or near a road (refer SOP-012).', responsible:'Supervisor', reference:'CoPTTM NZ', critical:false },
      { phase:'Execution', action:'Cut the directional notch on the felling-side of the tree: open face notch (70°) or humboldt notch. Notch depth 1/5 to 1/4 of stem diameter. Notch apex aligned precisely with felling direction.', responsible:'Operator', reference:'ArbAus MIS 08', critical:true },
      { phase:'Execution', action:'Insert plastic felling wedges before commencing back cut if tree does not lean strongly into felling direction — wedges prevent bar pinching.', responsible:'Operator', reference:'ArbAus MIS 08', critical:false },
      { phase:'Execution', action:'Make back cut level with or slightly above the notch apex. Leave a hinge of at least 1/10 of stem diameter (minimum 50mm). Never sever the hinge completely.', responsible:'Operator', reference:'ArbAus MIS 08', critical:true },
      { phase:'Execution', action:'Drive wedges as back cut progresses if tree is not moving. Do NOT use chainsaw bar to drive wedges. Call "FALLING" loudly when tree begins to move.', responsible:'Operator', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'When tree begins to move, STOP chainsaw, use escape route immediately — move 45° behind stump and watch for kickback branches, rolling logs, and widow-makers.', responsible:'Operator', reference:'ArbAus MIS 08', critical:true },
      { phase:'Execution', action:'All other crew must be a minimum 2× tree height away from the felling zone. Do NOT approach fallen tree until operator signals "ALL CLEAR" and chainsaw is stopped.', responsible:'All crew', reference:'WorkSafe NZ', critical:true },
      { phase:'Completion', action:'Process fallen tree from the base — work away from the stump. Keep feet clear of the log. Roll logs before straddling to check for stability.', responsible:'Operator', reference:'WorkSafe NZ', critical:false },
      { phase:'Completion', action:'Inspect stump: confirm hinge remained intact (confirms correct cut). Note any internal decay or structural defects observed for reporting.', responsible:'Operator / Supervisor', reference:'NZArb', critical:false },
      { phase:'Completion', action:'Remove exclusion zone and traffic management. Photograph stump and felling zone as record.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:false },
    ],
  },
  {
    id: 'sectional_dismantling',
    title: 'Sectional Tree Dismantling',
    ref: 'ArbAus MIS 06 / WorkSafe NZ / NZArb / AS/NZS 4143.3',
    purpose: 'Safe removal of a tree in sections using aerial climbing and rigging techniques, typically in confined spaces or when felling to ground is not possible.',
    scope: 'Qualified climbers — minimum Level 3 arborist qualification. All rigging equipment must be rated and inspected per SOP-002.',
    ppe: ['helmet_visor', 'ear', 'chaps', 'harness', 'gloves_cut', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Confirm sectional dismantling is required (not straight felling). Identify constraints: overhead lines, adjacent structures, public pathways, vehicular access.', responsible:'Supervisor', reference:'HSWA 2015', critical:true },
      { phase:'Preparation', action:'Conduct full structural assessment of tree — identify all decay, cracks, and structural weaknesses that will affect rigging anchor selection and load calculations.', responsible:'Climber / Supervisor', reference:'AS 4373-2007 / NZArb', critical:true },
      { phase:'Preparation', action:'Plan the dismantling sequence from top to bottom. Identify anchor points at each stage. Confirm rigging equipment WLL (working load limit) suitable for estimated piece weights.', responsible:'Climber / Supervisor', reference:'ArbAus MIS 06', critical:true },
      { phase:'Setup', action:'Set up rigging system: inspect block, friction device (Port-a-wrap / Hobbit), slings, and lowering rope. Every component must be rated minimum 3:1 factor above estimated maximum load.', responsible:'Climber + Ground crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Setup', action:'Confirm landing zone for lowered sections is clear and size-appropriate. Assign a dedicated rope handler on the ground — that person does nothing else during lowering.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Establish exclusion zone. No third parties within 2× tree height. Ground crew to wear helmets at all times within tree radius.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Ascend per SOP-003. Work from the top of the tree downward, removing sections progressively.', responsible:'Climber', reference:'ArbAus MIS 01', critical:false },
      { phase:'Execution', action:'Attach rigging sling to each section BEFORE making any cut. Confirm ground crew has tension on the rope and is ready before signalling to cut.', responsible:'Climber', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Signal "COMING DOWN" — wait for ground crew confirmation "READY — CLEAR" before releasing each section.', responsible:'Climber', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Control descent rate with friction device — never allow free-fall. Ground crew guides the lowered section away from the trunk using a tag line attached to the side of the piece.', responsible:'Ground crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Reassess rigging anchor after each major stem section is removed. The tree structure changes with each removal — never assume the last anchor point is still adequate.', responsible:'Climber', reference:'NZArb', critical:true },
      { phase:'Execution', action:'For the final stem section, confirm operator escape routes before the final cut. Do not use rigging on the final stump section — fell directionally (refer SOP-005).', responsible:'Climber / Supervisor', reference:'ArbAus MIS', critical:true },
      { phase:'Completion', action:'Derig all rigging equipment. Inspect all components post-use and report any damage or unusual loading immediately.', responsible:'Climber + Ground crew', reference:'AS/NZS 4143.3', critical:false },
      { phase:'Completion', action:'Process and chip material. Photograph completed site. Inspect and clean site before client handover (SOP-017).', responsible:'Ground crew', reference:'UTS SOP-017', critical:false },
    ],
  },
  {
    id: 'stump_grinding',
    title: 'Stump Grinding Procedure',
    ref: 'WorkSafe NZ / Manufacturer operating manual / NZArb',
    purpose: 'Safe setup and operation of a stump grinder to remove tree stumps to below-ground level.',
    scope: 'Competent operators trained in specific stump grinder model being used. Supervisor to confirm site suitability before operation.',
    ppe: ['helmet_visor', 'ear', 'eye', 'hiviz', 'boots', 'gloves_cut'],
    steps: [
      { phase:'Preparation', action:'Call Before You Dig (0800 248 344) to confirm no underground services within 500mm of the stump. Check water toby, gas, and electrical service locations. If in doubt, expose manually first.', responsible:'Supervisor', reference:'Utilities Act NZ', critical:true },
      { phase:'Preparation', action:'Inspect stump grinder: cutting teeth sharp and secure, guards in place, emergency stop functional, drive belt tension correct.', responsible:'Operator', reference:'WorkSafe NZ / Manufacturer', critical:true },
      { phase:'Preparation', action:'Assess ground around stump for rocks, reinforcing, concrete, or debris that could damage teeth or be ejected at high velocity.', responsible:'Operator', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Clear a 10m exclusion zone around the stump in all directions. Post crew at perimeter to prevent third-party entry.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Position stump grinder with discharge directed away from structures, vehicles, and people. Ensure no persons are in the discharge arc at any time.', responsible:'Operator', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Start grinder and allow to reach operating speed before engaging the cutting head. Lower the wheel onto the stump using the height control — never drop the wheel.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'Grind in a sweeping side-to-side motion. Work progressively from the outer edge toward the centre. Take shallow passes — do not force the head into the stump.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'Grind to a minimum depth of 150mm below finished ground level, or as specified by client. Confirm depth achieved before concluding grinding.', responsible:'Operator', reference:'NZArb', critical:false },
      { phase:'Execution', action:'If the machine jolts unexpectedly or cutting head contacts a hard object, stop immediately. Inspect for tooth damage and hidden objects before resuming.', responsible:'Operator', reference:'Manufacturer manual', critical:true },
      { phase:'Completion', action:'Disengage cutting head and allow to come to a full stop before approaching the grinding area or clearing chips.', responsible:'Operator', reference:'WorkSafe NZ', critical:true },
      { phase:'Completion', action:'Inspect completed stump hole for any exposed services. Fill void with mulch/chips and topsoil or as client has directed.', responsible:'Operator + Ground crew', reference:'NZArb', critical:false },
      { phase:'Completion', action:'Sweep or blow grinding chips from paths, driveways, and adjacent areas. Remove exclusion zone.', responsible:'Ground crew', reference:'UTS SOP-017', critical:false },
    ],
  },
  {
    id: 'wood_chipping',
    title: 'Wood Chipping Operations',
    ref: 'ArbAus MIS 05 / WorkSafe NZ / Manufacturer specifications',
    purpose: 'Safe operation of a wood chipper to process arboricultural waste material.',
    scope: 'All crew operating or working near the chipper. Minimum two persons required for all chipping operations.',
    ppe: ['helmet_visor', 'ear', 'hiviz', 'boots', 'eye', 'gloves_cut'],
    steps: [
      { phase:'Preparation', action:'Minimum two-person crew required for all chipping operations. Never operate a chipper alone.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'Inspect chipper per SOP-002: guards in place, emergency stop functional, belt tension correct, discharge chute clear, greasing completed per schedule.', responsible:'Operator', reference:'WorkSafe NZ / Manufacturer', critical:true },
      { phase:'Setup', action:'Position chipper on stable, level ground with discharge chute directed away from all persons, structures, vehicles, and waterways. Confirm discharge zone is clear.', responsible:'Operator / Supervisor', reference:'ArbAus MIS 05', critical:true },
      { phase:'Setup', action:'Establish a 15m exclusion zone in the discharge direction. Post cones or tape. Confirm all crew understand the discharge zone and are never to enter it during operation.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Start chipper — allow engine to reach operating speed before engaging the feed drum. Never engage feed drum with material already loaded.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'Feed material BUTT FIRST. Stand to the SIDE of the infeed — never directly in front. Keep hands at least 500mm clear of infeed rollers at all times.', responsible:'Operator + Ground crew', reference:'ArbAus MIS 05', critical:true },
      { phase:'Execution', action:'Feed material in a controlled manner — never force or overload. Long branches should be supported from the side, not pushed from behind with the operator leaning over.', responsible:'Operator', reference:'ArbAus MIS 05', critical:false },
      { phase:'Execution', action:'Never clear jams, blockages, or adjust discharge chute with the machine running. Shut off engine, wait for all movement to stop before clearing any obstruction.', responsible:'Operator', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'No loose clothing, ropes, lanyards, scarves, or jewellery worn by anyone near the infeed. Long hair must be tied back and tucked in.', responsible:'All crew', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'Do not chip material with wire, nails, rocks, or other non-wood items. Check material before loading.', responsible:'Ground crew', reference:'Manufacturer manual', critical:false },
      { phase:'Completion', action:'Disengage feed drum before stopping engine. Allow chipper to come to a complete stop. Check for overheating or abnormal sounds.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Completion', action:'Sweep or blow chip material from paths, driveways, and adjacent surfaces. Remove discharge exclusion zone.', responsible:'Ground crew', reference:'UTS SOP-017', critical:false },
    ],
  },
  {
    id: 'rigging_lowering',
    title: 'Rigging & Lowering Procedure',
    ref: 'ArbAus MIS 06 / WorkSafe NZ / AS/NZS 4143.3',
    purpose: 'Safe rigging and controlled lowering of tree sections, branches, and logs in confined spaces or near structures.',
    scope: 'Qualified climbers setting up and operating rigging. Ground crew must be trained in the signal system and rope-handling duties before working on rigging operations.',
    ppe: ['helmet_visor', 'harness', 'gloves_cut', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Assess all potential rigging anchors — inspect for decay, included bark, cracks, and root health. Probe for internal decay with a mallet before loading any anchor point.', responsible:'Climber', reference:'ArbAus MIS 06 / NZArb', critical:true },
      { phase:'Preparation', action:'Calculate estimated weight of sections to be rigged. Confirm all rigging components (block, rope, friction device, slings) have WLL exceeding 3× the estimated maximum load.', responsible:'Climber / Supervisor', reference:'ArbAus MIS 06', critical:true },
      { phase:'Preparation', action:'Inspect all rigging components per SOP-002 (and before each rigging setup). Retire any worn, kinked, cut, or corroded item immediately.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Setup', action:'Install rigging block at the anchor point using a rated sling or trunk tie — not the climbing rope. Confirm the block runs free.', responsible:'Climber', reference:'ArbAus MIS 06', critical:false },
      { phase:'Setup', action:'Thread lowering rope through the block. Connect the friction device (Port-a-wrap or Hobbit) at ground level on a separate anchor — never around a person.', responsible:'Ground crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Setup', action:'Assign one dedicated rope handler. Their only job during lowering is rope control. They are not to perform any other task while sections are being lowered.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Confirm the signal system with the whole crew: "RIGGING — CLIP IN" (climber attaching sling), "TENSION ON" (ground takes tension), "CUTTING" (climber about to cut), "COMING DOWN" (piece releasing), "CLEAR" (piece on ground, rope handler confirms).', responsible:'Supervisor + All crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Climber attaches rated sling to section to be rigged — sling positioned above the balance point. Connect to rigging rope using rated carabiner (never a knot tied to the section alone).', responsible:'Climber', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Climber signals "TENSION ON" — ground crew takes tension on the lowering rope through the friction device before any cut is made.', responsible:'Ground crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'Climber makes the cut. Ground crew controls descent using the friction device — never allow free-fall. A tag line attached to the side of the piece is used to guide it clear of the trunk.', responsible:'Climber + Ground crew', reference:'ArbAus MIS 06', critical:true },
      { phase:'Execution', action:'No person stands directly below a rigged section at any time. Tag line handler stands to the side. Rope handler stands clear of the bight.', responsible:'All crew', reference:'WorkSafe NZ', critical:true },
      { phase:'Completion', action:'Derig all rigging equipment from the tree. Lower block and rope to ground — never throw rigging equipment from height.', responsible:'Climber', reference:'AS/NZS 4143.3', critical:false },
      { phase:'Completion', action:'Inspect all rigging components post-use. Record any abnormal wear, shock loading, or damage for equipment register review.', responsible:'Climber / Supervisor', reference:'ArbAus MIS 06', critical:false },
    ],
  },
  {
    id: 'power_lines',
    title: 'Working Near Power Lines',
    ref: 'ECP 34 / Electricity Act 1992 NZ / WorkSafe NZ Electrical Safety',
    purpose: 'Manage the risk of contact with electrical conductors during arboricultural operations. All lines must be treated as live until confirmed otherwise by the network operator.',
    scope: 'All UTS crew. Aerial work near power lines requires contact with the line owner before work starts. No exemptions.',
    ppe: ['helmet_visor', 'hiviz', 'boots', 'harness', 'gloves_cut'],
    steps: [
      { phase:'Preparation', action:'Identify ALL overhead lines on and adjacent to the work site — including spans crossing over the site from off-property. Never assume a line is de-energised or low-voltage.', responsible:'Supervisor', reference:'ECP 34', critical:true },
      { phase:'Preparation', action:'Estimate voltage from pole markings, conductor size, and number of wires. Low-voltage (≤1000V): ≥4m approach limit. High-voltage (>1kV): ≥6m approach limit. When uncertain, assume HV.', responsible:'Supervisor', reference:'ECP 34 Table 2', critical:true },
      { phase:'Preparation', action:'If work CANNOT be completed within these clearance distances, STOP and contact the network operator (Unison/Vector/other) to arrange shutdown, insulation, or re-routing before work commences.', responsible:'Supervisor', reference:'ECP 34 / WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'For pruning within the 4m/6m exclusion zone: obtain written approval from the network operator. Do NOT rely on verbal approval only.', responsible:'Supervisor', reference:'ECP 34 / Electricity Act 1992', critical:true },
      { phase:'Setup', action:'Set up exclusion zone that fully contains the electrical hazard zone. Post signage: "LIVE OVERHEAD LINES — KEEP CLEAR."', responsible:'Supervisor', reference:'WorkSafe NZ', critical:true },
      { phase:'Setup', action:'Position all equipment (chipper, vehicles, ladders, poles) so that no part can enter the exclusion zone during operation. Confirm with whole crew.', responsible:'Supervisor', reference:'ECP 34', critical:true },
      { phase:'Execution', action:'Climber confirms approach distance to nearest conductor before each repositioning in the canopy. Call out estimated clearance to ground crew when closer than 5m.', responsible:'Climber', reference:'ECP 34', critical:true },
      { phase:'Execution', action:'Do not allow prunings to fall or swing onto conductors. Rig all sections that could contact lines — do not drop-chip near live lines.', responsible:'Climber', reference:'WorkSafe NZ / ECP 34', critical:true },
      { phase:'Execution', action:'Do not use metal pole pruners, metal ladders, or any conductive tool within the exclusion zone of a live line.', responsible:'All crew', reference:'ECP 34', critical:true },
      { phase:'Execution', action:'If a tool or branch contacts a live line: do NOT touch the person or tool. Call 111. Keep all persons at least 8m away. Notify the network operator immediately.', responsible:'All crew', reference:'ECP 34 / WorkSafe NZ', critical:true },
      { phase:'Completion', action:'Confirm no material has been left in contact with or draped over any conductor. Inspect post-work.', responsible:'Supervisor', reference:'ECP 34', critical:true },
      { phase:'Completion', action:'Remove exclusion zone and record all power-line-adjacent work in job notes including: line type, estimated clearance maintained, and any network operator communications.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:false },
    ],
  },
  {
    id: 'chemical_application',
    title: 'Chemical Application — Herbicides & Arboricides',
    ref: 'HSNO Act 1996 NZ / GROWSAFE / EPA Approved Handler / WorkSafe NZ',
    purpose: 'Safe mixing, application, and disposal of herbicides, soil treatments, and arboricidal products used in arboricultural operations.',
    scope: 'Approved Handlers and GROWSAFE-certified operators only. No chemical application by non-certified staff. Operator must hold current EPA Approved Handler certificate for restricted-use substances.',
    ppe: ['gloves_chem', 'eye', 'chem_apron', 'boots'],
    steps: [
      { phase:'Preparation', action:'Confirm operator holds current EPA Approved Handler certificate for the specific chemical being applied. Check certificate expiry date before work.', responsible:'Supervisor', reference:'HSNO Act 1996 / EPA NZ', critical:true },
      { phase:'Preparation', action:'Read the current product label and Safety Data Sheet (SDS). The label is the law — follow all instructions regarding rates, PPE, withholding periods, and environmental precautions.', responsible:'Operator', reference:'HSNO Act 1996', critical:true },
      { phase:'Preparation', action:'Check weather conditions: do not apply in winds >15km/h, rain forecast within 4 hours, or when environmental temperature is outside the label-specified range.', responsible:'Operator', reference:'Product label / EPA NZ', critical:true },
      { phase:'Preparation', action:'Check proximity to waterways, drains, and permeable surfaces. Maintain the label-specified buffer zone from all water bodies. Do not apply directly above drains.', responsible:'Operator', reference:'NES-FW / HSNO Act 1996', critical:true },
      { phase:'Preparation', action:'Obtain a spray record form ready to complete. Record: date, site, product, rate, volume, weather conditions, operator name, and certificate number.', responsible:'Operator', reference:'EPA NZ / GROWSAFE', critical:false },
      { phase:'Setup', action:'Set up mixing station downwind of crew and away from water sources. Use a contained area or drip tray for mixing — prevent ground contamination from spills.', responsible:'Operator', reference:'HSNO Act 1996', critical:false },
      { phase:'Setup', action:'Prepare correct dilution rate as per label. Use calibrated measuring equipment — do not estimate. Fill sprayer with water first, then add chemical.', responsible:'Operator', reference:'Product label', critical:true },
      { phase:'Setup', action:'Notify neighbouring properties or occupants if spray drift is possible. Post temporary signs at site access points.', responsible:'Supervisor', reference:'HSNO Act 1996', critical:false },
      { phase:'Execution', action:'Apply chemical strictly in accordance with the product label: method (cut-and-paste, basal bark, foliar, soil injection), rate, timing, and target species.', responsible:'Operator', reference:'Product label', critical:true },
      { phase:'Execution', action:'Work upwind. Minimise spray drift — use low-volume equipment or shielded applicator in sensitive environments.', responsible:'Operator', reference:'GROWSAFE / EPA NZ', critical:false },
      { phase:'Execution', action:'If personal contamination occurs: remove contaminated PPE, flush skin with water for at least 15 minutes, refer to SDS. Seek medical attention if symptoms develop.', responsible:'Operator', reference:'Product SDS', critical:true },
      { phase:'Completion', action:'Triple-rinse all equipment on site. Rinsate to be disposed of on the treatment area (diluted) or into a contained waste vessel — not poured down a drain.', responsible:'Operator', reference:'HSNO Act 1996 / EPA NZ', critical:true },
      { phase:'Completion', action:'Complete spray record in full. File with job records. Spray records must be retained for minimum 3 years.', responsible:'Operator', reference:'EPA NZ / GROWSAFE', critical:true },
      { phase:'Completion', action:'Store unused concentrate in the original container in a locked, ventilated, bunded chemical store. Never decant into food/drink containers.', responsible:'Operator', reference:'HSNO Act 1996', critical:true },
    ],
  },
  {
    id: 'traffic_management',
    title: 'Traffic Management Setup (TTM)',
    ref: 'CoPTTM NZ / Land Transport Act 1998 / WorkSafe NZ',
    purpose: 'Safe setup and management of temporary traffic management (TTM) when arboricultural operations affect public roads, footpaths, or shared driveways.',
    scope: 'All work affecting the road corridor. A Site Traffic Management Supervisor (STMS) qualification is required when works affect roads with speed limits above 30km/h. Traffic Controller qualification required for all flagging.',
    ppe: ['hiviz', 'boots', 'helmet'],
    steps: [
      { phase:'Preparation', action:'Determine if road occupancy licence (ROL) is required — contact local council roading department. Obtain ROL before commencing any works affecting the road corridor.', responsible:'Supervisor', reference:'CoPTTM NZ s2 / Local authority', critical:true },
      { phase:'Preparation', action:'Confirm crew qualifications: STMS for speeds >30km/h; TC (Traffic Controller) for any lane closure with live traffic; minimum Temporary Traffic Management Awareness for low-risk footpath works.', responsible:'Supervisor', reference:'CoPTTM NZ', critical:true },
      { phase:'Preparation', action:'Prepare Traffic Management Plan (TMP) using CoPTTM-compliant diagrams for the specific scenario. Get STMS sign-off before work starts.', responsible:'Supervisor / STMS', reference:'CoPTTM NZ s3', critical:true },
      { phase:'Setup', action:'Conduct a site inspection before placing signs: check sight distances, identify hazards to signing crews, confirm road surface is safe for cone placement.', responsible:'STMS', reference:'CoPTTM NZ s4', critical:false },
      { phase:'Setup', action:'Place advance warning signs in the correct order as per CoPTTM layout diagrams. Work with traffic flow — place approaching signs first, delineation second.', responsible:'TC / Supervisor', reference:'CoPTTM NZ s5', critical:true },
      { phase:'Setup', action:'Place cones, drums, or barriers to create the correct lane width and taper. Cone spacing as per speed limit and CoPTTM requirements.', responsible:'TC / Supervisor', reference:'CoPTTM NZ s5', critical:false },
      { phase:'Setup', action:'Position stop/slow lollipop controllers at each end of the closure if a stop-go operation is required. Confirm radio communication between controllers before opening to traffic.', responsible:'TC', reference:'CoPTTM NZ', critical:true },
      { phase:'Execution', action:'Maintain a clear 1.5m buffer between the work zone and active traffic at minimum. All workers in hi-vis at all times within the road corridor.', responsible:'All crew', reference:'CoPTTM NZ', critical:true },
      { phase:'Execution', action:'Monitor traffic flow continuously. Adjust sign positions if gaps in traffic build up or if sight lines become compromised.', responsible:'STMS', reference:'CoPTTM NZ', critical:false },
      { phase:'Execution', action:'If an emergency vehicle approaches: immediately clear the road corridor. Move all equipment to the verge. Resume only once emergency vehicle has passed.', responsible:'All crew', reference:'CoPTTM NZ', critical:true },
      { phase:'Completion', action:'Remove TTM in reverse order of placement — remove delineation first, then advance signs — always working against traffic flow.', responsible:'TC / Supervisor', reference:'CoPTTM NZ s6', critical:false },
      { phase:'Completion', action:'Confirm road surface is clear of all debris, chips, and equipment before removing the last signs. Sweep carriageway if required.', responsible:'Ground crew', reference:'CoPTTM NZ / UTS SOP-017', critical:false },
    ],
  },
  {
    id: 'aerial_rescue',
    title: 'Aerial Rescue Procedure',
    ref: 'ArbAus MIS 02 / WorkSafe NZ / NZArb Aerial Rescue Standard',
    purpose: 'Prompt and safe rescue of an incapacitated climber from height. This SOP must be practiced at minimum annually by all climbing staff.',
    scope: 'All persons on site whenever climbing operations are in progress. The designated rescuer must be identified and briefed before climbing begins at every job.',
    ppe: ['helmet_visor', 'harness', 'boots', 'hiviz'],
    steps: [
      { phase:'Preparation', action:'Before any climbing begins: identify the designated rescue person, confirm they are trained in aerial rescue, confirm rescue kit is on site (ascender, controlled descent device ≥25kN, rescue lanyard, rated sling).', responsible:'Supervisor', reference:'WorkSafe NZ mandatory', critical:true },
      { phase:'Preparation', action:'Brief the rescue plan with the whole crew before climbing starts: signal for incapacitation, who calls 111, who ascends, who manages ground, how descent will be controlled.', responsible:'Supervisor', reference:'ArbAus MIS 02', critical:true },
      { phase:'Emergency', action:'Trigger: if climber stops responding to voice or visual signals, or sends a distress signal — treat as incapacitation immediately. Do NOT wait to confirm.', responsible:'Ground crew', reference:'ArbAus MIS 02', critical:true },
      { phase:'Emergency', action:'Call 111 immediately. Give: location (full address), nature of incident (climber incapacitated at height, estimated height), casualties, access route for ambulance.', responsible:'Designated ground person', reference:'NZ emergency services', critical:true },
      { phase:'Emergency', action:'Designated rescuer dons full climbing kit and ascends on a FULLY INDEPENDENT climbing system — never attach to the casualty\'s anchor point or rope system.', responsible:'Rescuer', reference:'ArbAus MIS 02 / AS/NZS 4143.3', critical:true },
      { phase:'Emergency', action:'On reaching casualty: assess responsiveness, breathing, and airway. Do NOT remove helmet. If unconscious: confirm airway is clear (recovery position if possible at height).', responsible:'Rescuer', reference:'ArbAus MIS 02 / First aid', critical:true },
      { phase:'Emergency', action:'Attach a rated sling between casualty\'s harness and rescuer\'s descent system. Confirm all connections are locked. Prepare for controlled descent.', responsible:'Rescuer', reference:'ArbAus MIS 02', critical:true },
      { phase:'Emergency', action:'Communicate to ground crew: "COMING DOWN — CONTROL READY." Ground crew confirms "READY" before descent begins. Descend in a controlled manner using a dedicated descent device — never freefall.', responsible:'Rescuer + Ground crew', reference:'ArbAus MIS 02', critical:true },
      { phase:'Emergency', action:'Ground crew guides casualty clear of trunk as they descend — use a tag line on the casualty\'s harness to prevent spinning or contact with the tree.', responsible:'Ground crew', reference:'ArbAus MIS 02', critical:true },
      { phase:'Emergency', action:'On reaching the ground: lay casualty flat, do not remove climbing equipment (paramedics will manage this). Maintain airway. Apply first aid as trained. Stay with casualty until paramedics arrive.', responsible:'Rescuer + Ground crew', reference:'ArbAus MIS 02 / NZRC First Aid', critical:true },
      { phase:'Completion', action:'Secure the scene. Do not disturb any equipment from its position (preserve for investigation). Stand down all work operations on site.', responsible:'Supervisor', reference:'HSWA 2015 s56', critical:true },
      { phase:'Completion', action:'Notify WorkSafe NZ if the incident is notifiable (serious injury, incapacitation). File incident report within 48 hours (refer SOP-014).', responsible:'Supervisor / Director', reference:'HSWA 2015 s56 / WorkSafe NZ', critical:true },
    ],
  },
  {
    id: 'incident_response',
    title: 'Incident & Emergency Response',
    ref: 'HSWA 2015 s56 / WorkSafe NZ / ACC Act NZ',
    purpose: 'Immediate response to any workplace incident, near-miss, injury, or emergency. Ensures timely first aid, safe scene management, notifications, and investigation.',
    scope: 'All UTS staff — any incident, near-miss, or emergency must be reported regardless of perceived severity.',
    ppe: ['gloves_cut', 'boots'],
    steps: [
      { phase:'Emergency', action:'STOP all work in the immediate area immediately. Assess the scene for ongoing hazards before approaching the casualty — do not create additional casualties.', responsible:'Supervisor', reference:'HSWA 2015', critical:true },
      { phase:'Emergency', action:'Call 111 if there is any life-threatening injury, serious injury, or if you are unsure of severity. Give location, nature of incident, number and condition of casualties.', responsible:'Designated person', reference:'NZ Emergency Services', critical:true },
      { phase:'Emergency', action:'Provide first aid to the level of your training. Do not move spinal injury patients unless there is an immediate life threat (e.g. fire). Do not remove helmets or harnesses from injured climbers.', responsible:'First Aider', reference:'NZRC First Aid', critical:true },
      { phase:'Emergency', action:'Isolate the scene — keep all other persons at least 10m from the incident unless they are providing first aid. Preserve the scene for investigation.', responsible:'Supervisor', reference:'HSWA 2015 s56', critical:true },
      { phase:'Emergency', action:'Notify Josh Micallef (Director) immediately — call or text. If Josh is unavailable, notify the most senior crew member present who will then notify management.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:true },
      { phase:'Execution', action:'WorkSafe NZ must be notified IMMEDIATELY for any notifiable event: death, serious injury/illness, or notifiable incident (uncontrolled release of energy, collapse of structure, etc.). Phone: 0800 030 040.', responsible:'Director / Supervisor', reference:'HSWA 2015 s56', critical:true },
      { phase:'Execution', action:'Do NOT disturb the scene of a notifiable incident until WorkSafe NZ grants permission, except to prevent further harm or to assist an injured person.', responsible:'Supervisor', reference:'HSWA 2015 s56', critical:true },
      { phase:'Execution', action:'Take photographs of the incident scene, equipment involved, and any contributing factors immediately (while scene is preserved).', responsible:'Supervisor', reference:'HSWA 2015', critical:false },
      { phase:'Execution', action:'Complete the UTS Incident Report Form within 24 hours of the incident. Include: what happened, contributing factors, witnesses, injuries, equipment involved, immediate actions taken.', responsible:'Supervisor / Director', reference:'HSWA 2015 / UTS H&S Policy', critical:true },
      { phase:'Execution', action:'For ACC-recordable injuries: assist affected staff to complete ACC claim forms. Contact ACC if required. Ensure injured person has access to appropriate medical care.', responsible:'Director / Admin', reference:'ACC Act NZ', critical:false },
      { phase:'Completion', action:'Conduct a formal incident investigation within 48 hours. Identify root causes (not just immediate causes). Develop corrective actions to prevent recurrence.', responsible:'Director / Supervisor', reference:'HSWA 2015', critical:true },
      { phase:'Completion', action:'Communicate investigation findings and corrective actions to all crew at next toolbox meeting. Update relevant SOP, SWMS, or H&S policy if required.', responsible:'Director', reference:'HSWA 2015 / UTS H&S Policy', critical:false },
      { phase:'Completion', action:'Review near-misses with the same rigour as injury incidents — near-misses indicate an imminent risk that must be controlled before it results in harm.', responsible:'Director / Supervisor', reference:'HSWA 2015 s22', critical:false },
    ],
  },
  {
    id: 'storm_response',
    title: 'Storm Damage Response',
    ref: 'ArbAus MIS / WorkSafe NZ / NZArb Emergency Arboriculture',
    purpose: 'Safe approach to arboricultural work on storm-damaged trees — elevated hazard environment due to unpredictable structural conditions, time pressure, and public presence.',
    scope: 'All UTS crew responding to storm damage. Storm work has a higher baseline risk — the site assessment SOP must be strictly followed even under time pressure.',
    ppe: ['helmet_visor', 'hiviz', 'boots', 'chaps', 'ear'],
    steps: [
      { phase:'Preparation', action:'Confirm weather has passed and conditions are safe to attend the site. Do not approach downed power lines until confirmed de-energised by the network operator.', responsible:'Supervisor', reference:'ECP 34 / WorkSafe NZ', critical:true },
      { phase:'Preparation', action:'Check if the scene has been attended by emergency services (fire, police, power company). If an active scene, do not enter without clearance from emergency services.', responsible:'Supervisor', reference:'HSWA 2015', critical:true },
      { phase:'Setup', action:'Conduct a comprehensive site assessment (SOP-001) — storm damage scenes have multiple simultaneous hazards: hangers, unstable root plates, tension wood, downed utilities.', responsible:'Supervisor / Climber', reference:'ArbAus MIS / NZArb', critical:true },
      { phase:'Setup', action:'Identify all tension and compression wood in damaged trees and stems before any cuts. Releasing stored energy in storm-damaged wood is unpredictable — approach each cut as a novel situation.', responsible:'Climber / Operator', reference:'ArbAus MIS / NZArb', critical:true },
      { phase:'Setup', action:'Look up before every step in a storm scene — widow-maker branches (hangers) are the number one killer in storm arboriculture. Clear hangers before working beneath them.', responsible:'All crew', reference:'WorkSafe NZ / NZArb', critical:true },
      { phase:'Execution', action:'Establish exclusion zones as per SOP-001. Storm damage scenes near roads require traffic management (SOP-012) — implement before starting any work in or near the road corridor.', responsible:'Supervisor', reference:'CoPTTM NZ', critical:true },
      { phase:'Execution', action:'Treat all operations as high-risk — use rigging for storm-damaged sections wherever practical (SOP-009). Avoid drop-chipping near structures or utilities even if it appears safe.', responsible:'Climber / Supervisor', reference:'ArbAus MIS', critical:false },
      { phase:'Execution', action:'Be alert for ground instability near root zones of uprooted trees — root plates can re-seat without warning. Keep crew clear of the root plate shadow zone.', responsible:'All crew', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'In extreme workload conditions (multiple jobs), do not allow time pressure to compromise assessment and exclusion zone procedures. Triage: life-safety risk first, property damage second.', responsible:'Supervisor / Director', reference:'HSWA 2015', critical:true },
      { phase:'Completion', action:'Photograph all storm damage before, during, and after — for client records, insurance documentation, and job records.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:false },
      { phase:'Completion', action:'If significant structural concerns remain in the tree after emergency works (reduced but still hazardous) — provide client with a written report recommending follow-up assessment or removal.', responsible:'Supervisor / Director', reference:'NZArb / AS 4373-2007', critical:false },
    ],
  },
  {
    id: 'equipment_maintenance',
    title: 'Equipment Maintenance Schedule',
    ref: 'Manufacturer specifications / WorkSafe NZ / AS/NZS 4143.3',
    purpose: 'Routine maintenance of all plant, tools, and safety equipment to ensure ongoing serviceability, compliance, and fitness for purpose.',
    scope: 'All UTS crew. Josh Micallef (Director) is responsible for maintenance scheduling and records. Major service work is to be performed by or under the supervision of a qualified mechanic.',
    ppe: ['gloves_cut', 'eye', 'boots'],
    steps: [
      { phase:'Preparation', action:'DAILY: All equipment to be inspected before use per SOP-002. Record any defects and remove defective items from service immediately.', responsible:'All crew', reference:'WorkSafe NZ', critical:true },
      { phase:'Execution', action:'DAILY: Chainsaw(s) — sharpen chain or replace, clean air filter, top up bar oil and fuel, check chain brake and all guards. Log hours and condition.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'DAILY: Chipper — grease nipples per manufacturer schedule, check belt tension, clean infeed drum, inspect cutting blades for damage.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'WEEKLY: Vehicle(s) — tyre pressure and condition, fluid levels (oil, coolant, brake fluid, washer), lights, emergency equipment (fire extinguisher, first aid), load restraints.', responsible:'Driver / Supervisor', reference:'Land Transport Act NZ', critical:false },
      { phase:'Execution', action:'WEEKLY: Stump grinder — check cutting teeth for wear or breakage, replace as required. Inspect hydraulic hoses for leaks. Clean chip build-up from guards and engine.', responsible:'Operator', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'MONTHLY: First aid kits — check all contents, expiry dates, replace depleted items. Record check date. Two kits minimum: one in each vehicle.', responsible:'Supervisor', reference:'WorkSafe NZ', critical:false },
      { phase:'Execution', action:'MONTHLY: Climbing ropes — log cumulative hours in use, inspect for wear and damage, retire at manufacturer-specified service life or condition failure (whichever is sooner).', responsible:'Supervisor', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Execution', action:'MONTHLY: Harnesses and saddles — full inspection per AS/NZS 4143.3, check all webbing, stitching, buckles, and load indicators. Retire immediately if any item has taken a significant impact or shows material failure.', responsible:'Supervisor', reference:'AS/NZS 4143.3', critical:true },
      { phase:'Execution', action:'3-MONTHLY: Carabiners, pulleys, and rigging hardware — clean, dry, inspect gating mechanism, check for corrosion or deformation. Service with light machine oil if required.', responsible:'Supervisor', reference:'AS/NZS 4143.3 / Manufacturer', critical:false },
      { phase:'Execution', action:'ANNUALLY: Chainsaw(s) — full service by qualified technician (engine tune, bar and sprocket replacement, clutch and chain brake). Record service in equipment register.', responsible:'Director', reference:'Manufacturer manual', critical:false },
      { phase:'Execution', action:'ANNUALLY: Chipper — full service by qualified technician (blade replacement, belt replacement, hydraulic service). Remove from service until service is complete.', responsible:'Director', reference:'Manufacturer manual', critical:false },
      { phase:'Completion', action:'Record all maintenance tasks, service dates, and retirements in the equipment register. The register must be available for inspection at all times.', responsible:'Director / Supervisor', reference:'HSWA 2015', critical:false },
      { phase:'Completion', action:'Review equipment register quarterly — identify items approaching service dates and plan maintenance to avoid equipment being out-of-service during peak periods.', responsible:'Director', reference:'HSWA 2015', critical:false },
    ],
  },
  {
    id: 'site_restoration',
    title: 'Site Restoration & Client Handover',
    ref: 'UTS H&S Policy / NZArb / Consumer Guarantees Act 1993',
    purpose: 'Ensure all arboricultural work sites are restored to a clean, safe condition and formally handed over to the client before UTS crew departs.',
    scope: 'All crew — site restoration is every crew member\'s responsibility. Final inspection and client sign-off is the Supervisor\'s responsibility.',
    ppe: ['boots', 'hiviz', 'gloves_cut'],
    steps: [
      { phase:'Preparation', action:'Confirm the job scope is complete as per the work order and client instructions before beginning restoration. Do not pack up if work remains outstanding.', responsible:'Supervisor', reference:'Consumer Guarantees Act 1993', critical:true },
      { phase:'Execution', action:'Remove all debris, timber, and brush from the site. Chip all brush unless client has requested otherwise. Remove all chip and timber unless client has requested they be left.', responsible:'Ground crew', reference:'UTS H&S Policy', critical:false },
      { phase:'Execution', action:'Rake and/or blow all paths, driveways, patios, lawns, and neighbouring surfaces clear of debris, twigs, and sawdust. Check under vehicles and in gutters.', responsible:'Ground crew', reference:'UTS H&S Policy', critical:false },
      { phase:'Execution', action:'Inspect all surrounding surfaces for damage caused during works (e.g. lawn tracked by chipper, fence panels scratched by rigging). Record and notify Supervisor.', responsible:'All crew', reference:'UTS H&S Policy', critical:false },
      { phase:'Execution', action:'Remove all exclusion zone signage, tape, cones, and traffic management equipment from the site and public road.', responsible:'Ground crew', reference:'CoPTTM NZ', critical:false },
      { phase:'Execution', action:'Inspect stump(s) — confirm ground level is restored (fill void with chip/soil if required). Confirm stump height is within specification.', responsible:'Operator / Supervisor', reference:'UTS work order', critical:false },
      { phase:'Execution', action:'Retrieve ALL equipment from site: climbing kit, rigging, chainsaws, ropes, throwlines, first aid, signage. Conduct equipment count against dispatch list.', responsible:'All crew', reference:'UTS H&S Policy', critical:false },
      { phase:'Execution', action:'Take before/after photographs using the S&D photography protocol. Upload to the job record via the TreeCo app.', responsible:'Supervisor', reference:'UTS H&S Policy / S&D requirements', critical:false },
      { phase:'Completion', action:'Conduct a final supervisor walk of the site. Confirm: clean, complete, nothing damaged, nothing left behind, all hazards resolved.', responsible:'Supervisor', reference:'UTS H&S Policy', critical:true },
      { phase:'Completion', action:'Present completed work to client (if present). Confirm client satisfaction. Note any follow-up work recommended (pest, disease, further pruning, stump, irrigation).', responsible:'Supervisor', reference:'Consumer Guarantees Act 1993', critical:false },
      { phase:'Completion', action:'Update job status in TreeCo app to "Complete to Invoice." Record any follow-up work as a note on the job for quoting.', responsible:'Supervisor', reference:'UTS Operations', critical:false },
      { phase:'Completion', action:'Return to yard: clean all equipment, fuel all vehicles and plant, report any defects found during the job to Director.', responsible:'All crew', reference:'UTS H&S Policy', critical:false },
    ],
  },
]

// ── Doc factory ───────────────────────────────────────────────────────────────

function makeDoc(lib, idx) {
  const docNum = String(idx).padStart(3, '0')
  return {
    id: uid(),
    doc_number: `SOP-${docNum}`,
    title: lib.title,
    lib_id: lib.id,
    ref: lib.ref,
    purpose: lib.purpose,
    scope: lib.scope,
    version: '1.0',
    status: 'draft',
    prepared_by: 'Josh Micallef',
    approved_by: 'Josh Micallef',
    approved_date: '',
    review_date: '',
    steps: lib.steps.map(step => ({ ...step, id: uid(), notes: '' })),
    ppe: lib.ppe ?? [],
    sign_offs: DEFAULT_STAFF.map(st => ({ ...st, date: '', signed: false })),
    created_at: today(),
    notes: '',
  }
}

// ── PDF generation ────────────────────────────────────────────────────────────

function printPDF(doc) {
  const logoUrl = window.location.origin + '/logo.png'
  const ppeItems = (doc.ppe ?? []).map(id => PPE_MAP[id]?.label).filter(Boolean)

  const phaseColors = {
    Preparation: '#EAF2FF', Setup: '#EAF5EA', Execution: '#FFFBEA',
    Completion: '#F5F0FF', Emergency: '#FFF0EE',
  }
  const phaseTxt = {
    Preparation: '#1a5276', Setup: '#1e6e3e', Execution: '#7d6000',
    Completion: '#5b2d8e', Emergency: '#c0392b',
  }

  const stepRows = doc.steps.map((step, i) => {
    const pc = phaseColors[step.phase] ?? '#fafafa'
    const tc = phaseTxt[step.phase] ?? '#333'
    const critBadge = step.critical
      ? `<span style="background:#FFF0EE;color:#C0392B;font-size:7pt;padding:1px 5px;border-radius:3px;font-weight:bold;border:1px solid #fac;vertical-align:middle;">★ CRITICAL</span> `
      : ''
    return `
    <tr style="background:${i%2===0?'#fff':'#FAFAF8'}">
      <td style="width:4%;text-align:center;padding:5px 4px;border:1px solid #ddd;font-weight:bold;color:#888;">${i+1}</td>
      <td style="width:12%;padding:5px 6px;border:1px solid #ddd;">
        <span style="background:${pc};color:${tc};padding:2px 6px;border-radius:3px;font-size:7pt;font-weight:bold;">${step.phase}</span>
      </td>
      <td style="width:50%;padding:5px 6px;border:1px solid #ddd;vertical-align:top;">${critBadge}${step.action}</td>
      <td style="width:16%;padding:5px 6px;border:1px solid #ddd;">${step.responsible}</td>
      <td style="width:18%;padding:5px 6px;border:1px solid #ddd;font-size:7.5pt;color:#666;">${step.reference}</td>
    </tr>`
  }).join('')

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
    .ps-box { display: flex; gap: 0; margin-bottom: 8px; border: 1px solid #c8d8c0; background: #F0F5EE; }
    .ps-cell { flex: 1; padding: 6px 10px; border-right: 1px solid #c8d8c0; }
    .ps-cell:last-child { border-right: none; }
    .ps-lbl { font-size: 7pt; font-weight: bold; color: #4A6741; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
    h3 { font-size: 8.5pt; font-weight: bold; background: #3A5C2E; color: #fff; padding: 5px 8px; margin: 8px 0 0 0; }
    table { width: 100%; border-collapse: collapse; font-size: 8pt; }
    th { background: #3A5C2E; color: #fff; padding: 5px 6px; text-align: left; font-size: 7.5pt; font-weight: bold; border: 1px solid #2a4a20; }
    .ppe-grid { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; }
    .ppe-item { background: #f0f5ee; border: 1px solid #c8d8c0; border-radius: 3px; padding: 3px 8px; font-size: 7.5pt; }
    .sign-head { display: flex; align-items: center; gap: 8px; background: #3A5C2E; color: #fff; padding: 5px 8px; margin-top: 8px; font-size: 8.5pt; font-weight: bold; }
    .sign-note { font-size: 7.5pt; color: #666; padding: 4px 0; font-style: italic; }
    .auth-box { background: #FFF8EE; border: 1.5px solid #E8C570; padding: 6px 10px; margin: 8px 0 4px; display: flex; gap: 24px; align-items: center; }
    .auth-field { flex: 1; }
    .auth-lbl { font-size: 7pt; color: #7A5500; font-weight: bold; text-transform: uppercase; }
    .auth-val { font-size: 9pt; color: #1a1a1a; font-weight: 600; border-bottom: 1px solid #ccc; min-height: 18px; padding-bottom: 2px; }
    .footer { margin-top: 10px; padding-top: 5px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }
  </style>
  </head><body>

  <div class="header">
    <img src="${logoUrl}" class="logo" alt="Urban Tree Services" onerror="this.style.display='none'">
    <div class="doc-info">
      <div class="doc-type">Standard Operating Procedure</div>
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

  <div class="ps-box">
    <div class="ps-cell"><div class="ps-lbl">Purpose</div><div>${doc.purpose || '—'}</div></div>
    <div class="ps-cell"><div class="ps-lbl">Scope</div><div>${doc.scope || '—'}</div></div>
  </div>

  <h3>Procedure Steps</h3>
  <table>
    <thead>
      <tr>
        <th style="width:4%;text-align:center">#</th>
        <th style="width:12%">Phase</th>
        <th style="width:50%">Action / Instruction</th>
        <th style="width:16%">Responsible</th>
        <th style="width:18%">Reference</th>
      </tr>
    </thead>
    <tbody>
      ${stepRows}
    </tbody>
  </table>

  ${ppeItems.length ? `
  <h3>Required Personal Protective Equipment</h3>
  <div class="ppe-grid">${ppeItems.map(l => `<span class="ppe-item">✓ ${l}</span>`).join('')}</div>
  ` : ''}

  <div class="sign-head">Authorisation</div>
  <div class="auth-box">
    <div class="auth-field"><div class="auth-lbl">Authorised by</div><div class="auth-val">${doc.approved_by || 'Josh Micallef — Director'}</div></div>
    <div class="auth-field"><div class="auth-lbl">Title</div><div class="auth-val">Director / Arborist</div></div>
    <div class="auth-field"><div class="auth-lbl">Date authorised</div><div class="auth-val">${fmtDate(doc.approved_date) || '&nbsp;'}</div></div>
    <div class="auth-field" style="flex:2"><div class="auth-lbl">Signature</div><div class="auth-val">&nbsp;</div></div>
  </div>

  <div class="sign-head">Worker Acknowledgement &amp; Sign-off</div>
  <div class="sign-note">
    By signing below I confirm I have read, understood, and will follow this SOP. I will raise any concerns with the supervisor before commencing work.
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
    <span>HSWA 2015 · WorkSafe NZ · NZArb · ArbAus · AS 4373-2007</span>
  </div>

  <script>window.onload = () => window.print()</script>
  </body></html>`

  const win = window.open('', '_blank', 'width=900,height=700')
  if (win) { win.document.write(html); win.document.close() }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SOP() {
  const [docs, setDocs] = useState(loadDocs)
  const [view, setView] = useState(null)

  const persist = useCallback(list => { setDocs(list); saveDocs(list) }, [])

  const editing = view ? docs.find(d => d.id === view) : null

  function handleSave(doc) {
    const list = docs.some(d => d.id === doc.id)
      ? docs.map(d => d.id === doc.id ? doc : d)
      : [doc, ...docs]
    persist(list); setView(null)
  }
  function handleDelete(id) {
    if (!confirm('Delete this SOP?')) return
    persist(docs.filter(d => d.id !== id)); setView(null)
  }
  function handleNew() {
    const doc = makeDoc({ id:'custom', ref:'', title:'Custom Procedure', purpose:'', scope:'', ppe:[], steps:[] }, docs.length + 1)
    persist([...docs, doc]); setView(doc.id)
  }

  if (editing) {
    return <SOPEditor doc={editing}
      onSave={handleSave}
      onDelete={() => handleDelete(editing.id)}
      onBack={() => setView(null)} />
  }

  const statusClr = {
    draft:    { bg:'#F3F4F6', c:'#6B7280' },
    active:   { bg:'#E8F0E6', c:'#4A6741' },
    archived: { bg:'#FFF0EE', c:'#9B4040' },
  }

  const phaseTag = { Preparation:'#EAF2FF', Setup:'#EAF5EA', Execution:'#FFFBEA', Completion:'#F5F0FF', Emergency:'#FFF0EE' }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={s.secTitle}>SOPs · {docs.length} DOCUMENTS</div>
        <button style={s.addBtn} onClick={handleNew}>+ New SOP</button>
      </div>
      <div style={{ fontSize:12, color:'#888', background:'#EAF5EA', border:'1px solid #B5D5B0', borderRadius:8, padding:'8px 14px', marginBottom:14 }}>
        Standard Operating Procedures define the step-by-step process for each arboricultural task. All staff must acknowledge SOPs relevant to their role. SOPs complement SWMS — refer to both before commencing work.
      </div>
      {docs.length === 0 ? <div style={s.empty}>No SOPs yet.</div> : (
        <div style={s.list}>
          {docs.map(doc => {
            const sc = statusClr[doc.status] ?? statusClr.draft
            const critCount = (doc.steps ?? []).filter(st => st.critical).length
            const phases = [...new Set((doc.steps ?? []).map(st => st.phase))]
            return (
              <div key={doc.id} style={s.row}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#aaa', flexShrink:0 }}>{doc.doc_number}</span>
                    <span style={s.rowTitle}>{doc.title}</span>
                    <span style={{ ...s.badge, background:sc.bg, color:sc.c }}>{doc.status}</span>
                    <span style={s.verBadge}>v{doc.version}</span>
                    {critCount > 0 && <span style={{ fontSize:10, fontWeight:700, background:'#FFF0EE', color:'#C0392B', borderRadius:5, padding:'2px 7px' }}>★ {critCount} critical</span>}
                  </div>
                  <div style={s.rowMeta}>
                    {doc.ref} · {(doc.steps??[]).length} steps · {(doc.ppe??[]).length} PPE items
                  </div>
                  {phases.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4 }}>
                      {phases.map(ph => (
                        <span key={ph} style={{ fontSize:10, fontWeight:600, background:phaseTag[ph]??'#f0f0f0', color:'#555', borderRadius:4, padding:'1px 6px' }}>{ph}</span>
                      ))}
                    </div>
                  )}
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

function SOPEditor({ doc, onSave, onDelete, onBack }) {
  const [form, setForm] = useState(doc)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  function addStep() {
    set('steps', [...(form.steps ?? []), {
      id: uid(), phase: 'Execution', action: '', responsible: 'Supervisor',
      reference: '', critical: false, notes: '',
    }])
  }
  function updStep(id, k, v) {
    set('steps', form.steps.map(st => st.id === id ? { ...st, [k]: v } : st))
  }
  function delStep(id) { set('steps', form.steps.filter(st => st.id !== id)) }
  function moveStep(id, dir) {
    const arr = [...form.steps]
    const idx = arr.findIndex(st => st.id === id)
    const to  = idx + dir
    if (to < 0 || to >= arr.length) return
    ;[arr[idx], arr[to]] = [arr[to], arr[idx]]
    set('steps', arr)
  }

  function togPPE(id) {
    const list = form.ppe ?? []
    set('ppe', list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }
  function updStaff(id, k, v) {
    set('sign_offs', form.sign_offs.map(so => so.id === id ? { ...so, [k]: v } : so))
  }
  function delStaff(id) { set('sign_offs', form.sign_offs.filter(so => so.id !== id)) }
  function addStaff() {
    set('sign_offs', [...(form.sign_offs ?? []), { id: uid(), name: '', role: '', date: '', signed: false }])
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button style={s.backBtn} onClick={onBack}>← Back</button>
        <div style={{ flex:1, fontWeight:800, fontSize:15, color:'var(--bark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {form.doc_number} — {form.title}
        </div>
        <button style={s.pdfBtn2} onClick={() => printPDF(form)}>↓ PDF</button>
        <button style={s.delBtn} onClick={onDelete}>Delete</button>
        <button style={s.saveBtn} onClick={() => onSave(form)}>Save</button>
      </div>

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
          <MF label="Approval date"><input type="date" style={s.inp} value={form.approved_date||''} onChange={e => set('approved_date', e.target.value)} /></MF>
          <MF label="Review date"><input type="date" style={s.inp} value={form.review_date||''} onChange={e => set('review_date', e.target.value)} /></MF>
        </div>
      </Sec>

      <Sec label="Purpose & Scope">
        <MF label="Purpose">
          <textarea style={{ ...s.inp, minHeight:60 }} value={form.purpose||''} onChange={e => set('purpose', e.target.value)}
            placeholder="What this SOP covers and why it exists…" />
        </MF>
        <MF label="Scope">
          <textarea style={{ ...s.inp, minHeight:60 }} value={form.scope||''} onChange={e => set('scope', e.target.value)}
            placeholder="Who this applies to and under what conditions…" />
        </MF>
      </Sec>

      <Sec label={`Procedure Steps (${(form.steps??[]).length})`}>
        <div style={{ overflowX:'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={{ ...s.th, width:'3%', textAlign:'center' }}>#</th>
                <th style={{ ...s.th, width:'12%' }}>Phase</th>
                <th style={{ ...s.th, width:'38%' }}>Action / Instruction</th>
                <th style={{ ...s.th, width:'13%' }}>Responsible</th>
                <th style={{ ...s.th, width:'16%' }}>Reference</th>
                <th style={{ ...s.th, width:'6%', textAlign:'center' }}>Critical</th>
                <th style={{ ...s.th, width:'5%' }}></th>
                <th style={{ ...s.th, width:'5%' }}></th>
              </tr>
            </thead>
            <tbody>
              {(form.steps ?? []).map((step, i) => (
                <StepRow
                  key={step.id}
                  step={step}
                  i={i}
                  isFirst={i === 0}
                  isLast={i === (form.steps.length - 1)}
                  onChange={(k, v) => updStep(step.id, k, v)}
                  onDelete={() => delStep(step.id)}
                  onMove={dir => moveStep(step.id, dir)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <button style={{ ...s.secBtn, marginTop:8 }} onClick={addStep}>+ Add step</button>
      </Sec>

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

      <Sec label="Worker Sign-off">
        <div style={{ fontSize:12, color:'#888', marginBottom:10 }}>
          All workers sign to confirm they have read, understood, and will follow this SOP before commencing work.
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {(form.sign_offs ?? []).map(so => (
            <div key={so.id} style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
              <MF label="Name"><input style={{ ...s.inp, minWidth:150 }} value={so.name} onChange={e => updStaff(so.id,'name',e.target.value)} /></MF>
              <MF label="Role"><input style={{ ...s.inp, minWidth:120 }} value={so.role} onChange={e => updStaff(so.id,'role',e.target.value)} /></MF>
              <button style={{ ...s.iconBtn, marginBottom:10 }} onClick={() => delStaff(so.id)}>✕</button>
            </div>
          ))}
        </div>
        <button style={s.secBtn} onClick={addStaff}>+ Add staff member</button>
      </Sec>

      <Sec label="Notes">
        <textarea style={{ ...s.inp, minHeight:70 }} value={form.notes||''} onChange={e => set('notes', e.target.value)}
          placeholder="Additional notes, version history, or operational context…" />
      </Sec>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:16, paddingTop:14, borderTop:'1px solid var(--border)' }}>
        <button style={s.pdfBtn2} onClick={() => printPDF(form)}>↓ Download PDF</button>
        <button style={s.cancelBtn} onClick={onBack}>Cancel</button>
        <button style={s.saveBtn} onClick={() => onSave(form)}>Save</button>
      </div>
    </div>
  )
}

// ── Step row ──────────────────────────────────────────────────────────────────

function StepRow({ step, i, isFirst, isLast, onChange, onDelete, onMove }) {
  const phaseColors = {
    Preparation: { bg:'#EAF2FF', c:'#1a5276' },
    Setup:       { bg:'#EAF5EA', c:'#1e6e3e' },
    Execution:   { bg:'#FFFBEA', c:'#7d6000' },
    Completion:  { bg:'#F5F0FF', c:'#5b2d8e' },
    Emergency:   { bg:'#FFF0EE', c:'#c0392b' },
  }
  const pc = phaseColors[step.phase] ?? { bg:'#f3f4f6', c:'#555' }

  return (
    <tr style={{ background: step.critical ? '#FFFDF5' : (i%2===0 ? '#fff' : '#FAFAF8'), verticalAlign:'top' }}>
      <td style={{ ...s.td, textAlign:'center', color:'#bbb', fontWeight:700, fontSize:12 }}>{i+1}</td>
      <td style={s.td}>
        <select
          style={{ ...s.cell, background:pc.bg, color:pc.c, fontWeight:700, fontSize:11 }}
          value={step.phase}
          onChange={e => onChange('phase', e.target.value)}
        >
          {STEP_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
        </select>
      </td>
      <td style={s.td}>
        <textarea style={{ ...s.cell, minHeight:60 }} value={step.action} onChange={e => onChange('action', e.target.value)}
          placeholder="Describe the step action in full…" />
      </td>
      <td style={s.td}><input style={s.cell} value={step.responsible} onChange={e => onChange('responsible', e.target.value)} placeholder="Supervisor" /></td>
      <td style={s.td}><input style={s.cell} value={step.reference} onChange={e => onChange('reference', e.target.value)} placeholder="Standard or Act…" /></td>
      <td style={{ ...s.td, textAlign:'center' }}>
        <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer' }}>
          <input type="checkbox" checked={!!step.critical} onChange={e => onChange('critical', e.target.checked)} />
          {step.critical && <span style={{ fontSize:9, color:'#C0392B', fontWeight:700 }}>★</span>}
        </label>
      </td>
      <td style={{ ...s.td, textAlign:'center', verticalAlign:'middle' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
          <button style={{ ...s.iconBtn, fontSize:11, opacity: isFirst ? 0.2 : 1 }} onClick={() => !isFirst && onMove(-1)}>▲</button>
          <button style={{ ...s.iconBtn, fontSize:11, opacity: isLast ? 0.2 : 1 }} onClick={() => !isLast && onMove(1)}>▼</button>
        </div>
      </td>
      <td style={{ ...s.td, textAlign:'center', verticalAlign:'middle' }}>
        <button style={s.iconBtn} onClick={onDelete}>✕</button>
      </td>
    </tr>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Sec({ label, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={s.sec}>
      <div style={s.secHead} onClick={() => setOpen(v => !v)}>
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
  row:      { display:'flex', alignItems:'flex-start', gap:10, background:'#fff', border:'1px solid var(--border)', borderRadius:10, padding:'12px 16px' },
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

  flbl:     { fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 },
  inp:      { width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid var(--border)', fontSize:13, color:'var(--bark)', fontFamily:'var(--font)', boxSizing:'border-box', background:'#fff' },
}
