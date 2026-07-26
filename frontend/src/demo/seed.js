// ─────────────────────────────────────────────────────────────────────────────
// Demo seed data.
//
// buildSeed() returns a fresh copy of the entire in-memory database used by
// demoBackend.js. Everything here is FICTIONAL — invented Wellington clients,
// crew, jobs and records. There is no real Urban Tree Services customer data.
//
// Dates are computed relative to "today" at call time so the calendar, expiry
// badges and "due soon" checks always look current no matter when the demo is
// opened.
// ─────────────────────────────────────────────────────────────────────────────

const DAY = 86400000

function ymd(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * DAY)
  return d.toISOString().slice(0, 10)
}
function iso(offsetDays = 0, hour = 9, min = 0) {
  const d = new Date(Date.now() + offsetDays * DAY)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}

// The signed-in demo user (also present in the users table below).
export const DEMO_PROFILE = {
  id: 'u-demo',
  name: 'Demo User',
  email: 'demo@example-arbor.co',
  access_level: 'full',
  avatar_url: null,
  resource_id: 'res-1',
}

function users() {
  return [
    { id: 'u-demo',  name: 'Demo User',      email: 'demo@example-arbor.co',   phone: '021 000 0001', access_level: 'full',       avatar_url: null, active: true, resource_id: 'res-1', created_at: iso(-400) },
    { id: 'u-jesse', name: 'Jesse Kāhu',     email: 'jesse@example-arbor.co',  phone: '021 000 0002', access_level: 'restricted', avatar_url: null, active: true, resource_id: 'res-2', created_at: iso(-380) },
    { id: 'u-mara',  name: 'Mara Devlin',    email: 'mara@example-arbor.co',   phone: '021 000 0003', access_level: 'office',     avatar_url: null, active: true, resource_id: null,    created_at: iso(-360) },
    { id: 'u-tomas', name: 'Tomás Rivera',   email: 'tomas@example-arbor.co',  phone: '021 000 0004', access_level: 'restricted', avatar_url: null, active: true, resource_id: 'res-3', created_at: iso(-300) },
    { id: 'u-bea',   name: 'Bea Fitzgerald', email: 'bea@example-arbor.co',    phone: '021 000 0005', access_level: 'restricted', avatar_url: null, active: true, resource_id: 'res-4', created_at: iso(-220) },
  ]
}

function clients() {
  return [
    { id: 'c1', name: 'Margaret Thompson',     phone: '021 456 789', email: 'margaret@example.com',      address: '14 Hillcrest Ave, Karori, Wellington',      notes: 'Prefers morning appointments',                     lat: -41.2865, lng: 174.7210, xero_contact_id: null,      created_at: iso(-86), updated_at: iso(-86) },
    { id: 'c2', name: 'Richard Tait',          phone: '027 111 222', email: 'richard@example.com',       address: '8 Miramar Ave, Miramar, Wellington',        notes: '',                                                 lat: -41.3140, lng: 174.8210, xero_contact_id: null,      created_at: iso(-77), updated_at: iso(-77) },
    { id: 'c3', name: 'Coastal Properties Ltd', phone: '04 999 8888', email: 'info@coastalprops.example', address: '55 Oriental Parade, Oriental Bay, Wellington', notes: 'Commercial — invoice to accounts dept',           lat: -41.2905, lng: 174.7940, xero_contact_id: 'xc-001', created_at: iso(-120), updated_at: iso(-120) },
    { id: 'c4', name: 'Dave & Sue Wilson',     phone: '021 333 444', email: 'davesue@example.com',       address: '3 Karori Rd, Karori, Wellington',           notes: '',                                                 lat: -41.2843, lng: 174.7360, xero_contact_id: null,      created_at: iso(-65), updated_at: iso(-65) },
    { id: 'c5', name: 'Anna Ferreira',         phone: '022 777 888', email: 'anna.f@example.com',        address: '22 Brooklyn Rd, Brooklyn, Wellington',      notes: 'New lead from website',                            lat: -41.3010, lng: 174.7660, xero_contact_id: null,      created_at: iso(-36), updated_at: iso(-36) },
    { id: 'c6', name: 'Heritage Homes Trust',  phone: '04 555 7777', email: 'admin@heritagehomes.example', address: '101 Mt Victoria Blvd, Mt Victoria, Wellington', notes: 'Requires council approval for all removals',   lat: -41.2960, lng: 174.7930, xero_contact_id: 'xc-002', created_at: iso(-140), updated_at: iso(-140) },
    { id: 'c7', name: 'Jason Park',            phone: '021 234 567', email: 'jpark@example.com',         address: '9 Newlands Ave, Newlands, Wellington',      notes: '',                                                 lat: -41.2280, lng: 174.8160, xero_contact_id: null,      created_at: iso(-40), updated_at: iso(-40) },
    { id: 'c8', name: 'Lyall Bay School',      phone: '04 387 3099', email: 'office@lyallbay.example',   address: '2 Freyberg St, Lyall Bay, Wellington',      notes: 'Access via side gate, contact caretaker first',    lat: -41.3290, lng: 174.7960, xero_contact_id: null,      created_at: iso(-52), updated_at: iso(-52) },
    { id: 'c9', name: 'Ngaio Body Corp',       phone: '027 654 321', email: 'chair@ngaiobc.example',     address: '48 Ottawa Rd, Ngaio, Wellington',           notes: 'Body corporate — 6 units, shared driveway',       lat: -41.2500, lng: 174.7710, xero_contact_id: null,      created_at: iso(-30), updated_at: iso(-30) },
  ]
}

// Job factory — status spans the whole pipeline so the board looks alive.
function jobs() {
  return [
    { id: 'j1',  client_id: 'c5', title: 'Kowhai pruning & cleanup',            address: '22 Brooklyn Rd, Brooklyn, Wellington',        job_type: 'pruning',        category: 'residential', description: 'Reduce two kowhai away from the roofline, chip & remove all debris.',         status: 'new_lead',            estimated_value: 780,   lat: -41.3010, lng: 174.7660, lead_source: 'website', created_by: 'u-demo', status_changed_at: iso(-1),  created_at: iso(-1) },
    { id: 'j2',  client_id: 'c1', title: 'Large macrocarpa removal',            address: '14 Hillcrest Ave, Karori, Wellington',        job_type: 'removal',        category: 'residential', description: 'Full dismantle of a 18m macrocarpa over the fence line. Traffic management for chipper.', status: 'quote_scheduled', estimated_value: 3200, lat: -41.2865, lng: 174.7210, lead_source: 'phone',   created_by: 'u-demo', status_changed_at: iso(-3),  created_at: iso(-6) },
    { id: 'j3',  client_id: 'c6', title: 'Rimu removal — council permit',       address: '101 Mt Victoria Blvd, Mt Victoria, Wellington', job_type: 'removal',      category: 'residential', description: 'Notable tree — consent lodged. Crane-assisted removal once approved.',           status: 'quote_sent',          estimated_value: 6210,  lat: -41.2960, lng: 174.7930, lead_source: 'referral', created_by: 'u-demo', status_changed_at: iso(-2),  created_at: iso(-9) },
    { id: 'j4',  client_id: 'c8', title: 'Pōhutukawa deadwooding (school)',     address: '2 Freyberg St, Lyall Bay, Wellington',        job_type: 'pruning',        category: 'commercial',  description: 'Deadwood 3 mature pōhutukawa over the playground. Weekend work only.',           status: 'quote_sent',          estimated_value: 2450,  lat: -41.3290, lng: 174.7960, lead_source: 'email',    created_by: 'u-demo', status_changed_at: iso(-4),  created_at: iso(-11) },
    { id: 'j5',  client_id: 'c2', title: 'Hedge trimming x3',                   address: '8 Miramar Ave, Miramar, Wellington',          job_type: 'pruning',        category: 'residential', description: 'Trim three griselinia hedges to height, tidy edges, remove clippings.',         status: 'accepted_to_schedule', estimated_value: 747,  lat: -41.3140, lng: 174.8210, lead_source: 'website', created_by: 'u-demo', status_changed_at: iso(-1),  created_at: iso(-14) },
    { id: 'j6',  client_id: 'c3', title: 'Pine crown reduction',               address: '55 Oriental Parade, Oriental Bay, Wellington', job_type: 'pruning',       category: 'commercial',  description: 'Reduce two radiata pines 25% for light. Rope access over walkway.',              status: 'scheduled',           estimated_value: 2070,  lat: -41.2905, lng: 174.7940, lead_source: 'referral', created_by: 'u-demo', status_changed_at: iso(0),   created_at: iso(-16) },
    { id: 'j7',  client_id: 'c9', title: 'Storm cleanup — 3 fallen limbs',      address: '48 Ottawa Rd, Ngaio, Wellington',             job_type: 'emergency',      category: 'residential', description: 'Clear limbs off shared driveway after southerly. Make safe, full cleanup.',      status: 'scheduled',           estimated_value: 1150,  lat: -41.2500, lng: 174.7710, lead_source: 'phone',   created_by: 'u-demo', status_changed_at: iso(1),   created_at: iso(-2) },
    { id: 'j8',  client_id: 'c4', title: 'Stump grinding — 4 stumps',           address: '3 Karori Rd, Karori, Wellington',             job_type: 'stump_grinding', category: 'residential', description: 'Grind four stumps to 200mm below grade, backfill with grindings.',              status: 'stump_grinding',      estimated_value: 1104,  lat: -41.2843, lng: 174.7360, lead_source: 'phone',   created_by: 'u-demo', status_changed_at: iso(-1),  created_at: iso(-20) },
    { id: 'j9',  client_id: 'c7', title: 'Emergency fallen branch removal',     address: '9 Newlands Ave, Newlands, Wellington',        job_type: 'emergency',      category: 'residential', description: 'Large branch down on carport. Cut, clear, tarp roof gap.',                        status: 'complete_to_invoice', estimated_value: 1380,  lat: -41.2280, lng: 174.8160, lead_source: 'phone',   created_by: 'u-demo', status_changed_at: iso(-1),  created_at: iso(-4) },
    { id: 'j10', client_id: 'c1', title: 'Silver birch thinning',              address: '14 Hillcrest Ave, Karori, Wellington',        job_type: 'pruning',        category: 'residential', description: 'Crown thin a mature silver birch, remove one co-dominant stem.',                 status: 'complete_to_invoice', estimated_value: 640,   lat: -41.2865, lng: 174.7210, lead_source: 'repeat',  created_by: 'u-demo', status_changed_at: iso(-2),  created_at: iso(-18) },
    { id: 'j11', client_id: 'c3', title: 'Annual grounds maintenance',          address: '55 Oriental Parade, Oriental Bay, Wellington', job_type: 'pruning',       category: 'commercial',  description: 'Q3 visit — hedges, deadwood, weed spray of beds.',                               status: 'invoiced',            estimated_value: 1890,  lat: -41.2905, lng: 174.7940, lead_source: 'contract', created_by: 'u-demo', status_changed_at: iso(-8),  created_at: iso(-30) },
    { id: 'j12', client_id: 'c6', title: 'Oak limb reduction (on hold)',        address: '101 Mt Victoria Blvd, Mt Victoria, Wellington', job_type: 'pruning',      category: 'residential', description: 'Client deferring until spring — follow up September.',                            status: 'on_hold',             estimated_value: 980,   lat: -41.2960, lng: 174.7930, lead_source: 'website', created_by: 'u-demo', status_changed_at: iso(-12), created_at: iso(-24) },
  ]
}

const li = (description, qty, rate, extra = {}) => ({ id: 'li-' + Math.random().toString(36).slice(2, 8), description, qty, rate, optional: false, selected: true, ...extra })

function quotes() {
  const mk = (id, job_id, client_id, status, items, opts = {}) => {
    const subtotal = items.reduce((s, x) => s + x.qty * x.rate, 0)
    const gst = Math.round(subtotal * 0.15 * 100) / 100
    return {
      id, job_id, client_id, status, line_items: items,
      subtotal, gst, total: Math.round((subtotal + gst) * 100) / 100,
      notes: 'Payment due within 7 days of invoice. GST included where shown.',
      private_notes: opts.private_notes ?? '',
      job_pack: {},
      client_view_token: opts.token ?? null,
      valid_until: ymd(30),
      quote_number: opts.quote_number ?? null,
      sent_at: opts.sent_at ?? null,
      viewed_at: opts.viewed_at ?? null,
      responded_at: opts.responded_at ?? null,
      opened_count: opts.opened_count ?? 0,
      last_opened_at: opts.last_opened_at ?? null,
      followup_count: opts.followup_count ?? 0,
      last_followup_at: null,
      created_at: opts.created_at ?? iso(-5),
    }
  }
  return [
    mk('q-j3', 'j3', 'c6', 'sent',     [li('Consent-approved rimu removal, crane-assisted', 1, 4800), li('Traffic management (half day)', 1, 600)], { token: 'demo-token-rimu', quote_number: 'Q-1042', sent_at: iso(-2), viewed_at: iso(-1), opened_count: 3, last_opened_at: iso(-1), created_at: iso(-2) }),
    mk('q-j4', 'j4', 'c8', 'viewed',   [li('Deadwood mature pōhutukawa (per tree)', 3, 650), li('Weekend / out-of-hours loading', 1, 500)], { token: 'demo-token-pohutukawa', quote_number: 'Q-1043', sent_at: iso(-4), viewed_at: iso(-3), opened_count: 5, last_opened_at: iso(-1), followup_count: 1, created_at: iso(-4) }),
    mk('q-j2', 'j2', 'c1', 'draft',    [li('Dismantle 18m macrocarpa over fence', 1, 2600), li('Stump grind', 1, 320), li('Extra green-waste loads', 1, 280)], { quote_number: 'Q-1051', created_at: iso(-3) }),
    mk('q-j5', 'j5', 'c2', 'accepted', [li('Griselinia hedge trim to height (per hedge)', 3, 190), li('Green-waste removal', 1, 80)], { token: 'demo-token-hedge', quote_number: 'Q-1030', sent_at: iso(-10), viewed_at: iso(-9), responded_at: iso(-8), opened_count: 2, last_opened_at: iso(-8), created_at: iso(-12) }),
    mk('q-j6', 'j6', 'c3', 'accepted', [li('Crown reduction radiata pine 25% (per tree)', 2, 850), li('Rope access over walkway', 1, 370)], { quote_number: 'Q-1028', sent_at: iso(-15), viewed_at: iso(-14), responded_at: iso(-13), created_at: iso(-16) }),
    mk('q-j9', 'j9', 'c7', 'accepted', [li('Emergency branch removal & make safe', 1, 900), li('Temporary roof tarp', 1, 300)], { quote_number: 'Q-1048', sent_at: iso(-3), viewed_at: iso(-3), responded_at: iso(-2), created_at: iso(-4) }),
    mk('q-j11','j11','c3', 'invoiced', [li('Q3 grounds maintenance visit', 1, 1644)], { quote_number: 'Q-1015', sent_at: iso(-28), responded_at: iso(-26), created_at: iso(-30) }),
  ]
}

function schedule() {
  return [
    { id: 's1', job_id: 'j6', date: ymd(0),  start_time: '08:00', end_time: '12:00', resource_id: 'res-1', assigned_to: ['u-demo', 'u-jesse'], status: 'scheduled', sms_reminder: true,  vehicle_reg: 'ABC123', notes: 'Rope access — brief walkway pedestrians', created_at: iso(-2) },
    { id: 's2', job_id: 'j7', date: ymd(1),  start_time: '08:30', end_time: '11:00', resource_id: 'res-3', assigned_to: ['u-tomas', 'u-bea'],  status: 'scheduled', sms_reminder: true,  vehicle_reg: 'DEF456', notes: 'Storm cleanup — check driveway access', created_at: iso(-1) },
    { id: 's3', job_id: 'j5', date: ymd(2),  start_time: '13:00', end_time: '15:30', resource_id: 'res-1', assigned_to: ['u-demo'],            status: 'accepted_to_schedule', sms_reminder: false, vehicle_reg: null, notes: '', created_at: iso(-1) },
    { id: 's4', job_id: 'j8', date: ymd(3),  start_time: '09:00', end_time: '12:00', resource_id: 'res-2', assigned_to: ['u-jesse'],           status: 'stump_grinding', sms_reminder: false, vehicle_reg: null, notes: 'Grinder on trailer', created_at: iso(-1) },
    { id: 's5', job_id: 'j6', date: ymd(-4), start_time: '08:00', end_time: '16:00', resource_id: 'res-4', assigned_to: ['u-bea'],             status: 'scheduled', sms_reminder: false, vehicle_reg: null, notes: 'First visit complete', created_at: iso(-6) },
  ]
}

function job_photos() {
  return [
    { id: 'p1', job_id: 'j9', url: '', caption: 'Branch down on carport — before', created_at: iso(-3) },
    { id: 'p2', job_id: 'j6', url: '', caption: 'Site reference — pine over walkway', created_at: iso(-5) },
  ]
}

function staff_records() {
  return [
    { id: 'sr1', user_id: 'u-demo',  staff_name: null, record_type: 'qualification', title: 'NZ Certificate in Arboriculture (Level 4)', reference: 'NZQA-44831', file_url: null, issued_date: ymd(-900), expiry_date: null,      verified: true,  notes: '', created_by: 'u-demo', created_at: iso(-200), updated_at: iso(-200) },
    { id: 'sr2', user_id: 'u-jesse', staff_name: null, record_type: 'licence',       title: 'Class 2 Driver Licence',                 reference: 'DL-778210', file_url: null, issued_date: ymd(-600), expiry_date: ymd(18),   verified: true,  notes: 'Renewal due soon', created_by: 'u-demo', created_at: iso(-180), updated_at: iso(-20) },
    { id: 'sr3', user_id: 'u-jesse', staff_name: null, record_type: 'qualification', title: 'First Aid Certificate',                  reference: 'FA-2231',   file_url: null, issued_date: ymd(-500), expiry_date: ymd(-6),   verified: true,  notes: 'EXPIRED — book refresher', created_by: 'u-demo', created_at: iso(-160), updated_at: iso(-6) },
    { id: 'sr4', user_id: 'u-tomas', staff_name: null, record_type: 'drug_test',     title: 'Pre-employment drug screen',             reference: 'DT-0091',   file_url: null, issued_date: ymd(-220), expiry_date: null,      verified: true,  notes: '', created_by: 'u-demo', created_at: iso(-220), updated_at: iso(-220) },
    { id: 'sr5', user_id: 'u-bea',   staff_name: null, record_type: 'induction',     title: 'Site induction & SWMS sign-off',         reference: null,        file_url: null, issued_date: ymd(-200), expiry_date: null,      verified: true,  notes: '', created_by: 'u-demo', created_at: iso(-200), updated_at: iso(-200) },
    { id: 'sr6', user_id: 'u-demo',  staff_name: null, record_type: 'licence',       title: 'Growsafe Registered Chemical Applicator', reference: 'GS-5521',  file_url: null, issued_date: ymd(-400), expiry_date: ymd(120),  verified: true,  notes: '', created_by: 'u-demo', created_at: iso(-140), updated_at: iso(-140) },
  ]
}

function company_documents() {
  return [
    { id: 'cd1', doc_type: 'insurance',        title: 'Public Liability $2M',        issuer: 'Vero Insurance',      reference: 'PL-884120', file_url: null, effective_date: ymd(-200), expiry_date: ymd(60),  notes: 'Certificate on file', created_by: 'u-demo', created_at: iso(-200), updated_at: iso(-200) },
    { id: 'cd2', doc_type: 'insurance',        title: 'Motor Vehicle Fleet',         issuer: 'AMI Business',        reference: 'MV-22019',  file_url: null, effective_date: ymd(-150), expiry_date: ymd(24),  notes: 'Renewal reminder set', created_by: 'u-demo', created_at: iso(-150), updated_at: iso(-20) },
    { id: 'cd3', doc_type: 'prequalification', title: 'SiteWise Green certification', issuer: 'Site Safe NZ',        reference: 'SW-GREEN',  file_url: null, effective_date: ymd(-90),  expiry_date: ymd(275), notes: '89% — Green grade', created_by: 'u-demo', created_at: iso(-90),  updated_at: iso(-90) },
    { id: 'cd4', doc_type: 'registration',     title: 'NZ Companies Office registration', issuer: 'Companies Office', reference: '1234567',  file_url: null, effective_date: ymd(-1200), expiry_date: null,   notes: '', created_by: 'u-demo', created_at: iso(-300), updated_at: iso(-300) },
  ]
}

function safety_documents() {
  return [
    { id: 'sd1', doc_type: 'policy',    title: 'Health & Safety Policy',            reference: 'HSP-2026', version: 3, status: 'active', body: {}, file_url: null, effective_date: ymd(-120), review_date: ymd(20),  tags: ['policy'],     created_by: 'u-demo', created_at: iso(-120), updated_at: iso(-30) },
    { id: 'sd2', doc_type: 'swms',      title: 'SWMS — Tree Felling & Dismantling', reference: 'SWMS-01',  version: 2, status: 'active', body: {}, file_url: null, effective_date: ymd(-90),  review_date: ymd(90),  tags: ['swms','felling'], created_by: 'u-demo', created_at: iso(-90), updated_at: iso(-40) },
    { id: 'sd3', doc_type: 'swms',      title: 'SWMS — Chipper Operation',          reference: 'SWMS-04',  version: 1, status: 'active', body: {}, file_url: null, effective_date: ymd(-60),  review_date: ymd(-3),  tags: ['swms','chipper'], created_by: 'u-demo', created_at: iso(-60), updated_at: iso(-3) },
    { id: 'sd4', doc_type: 'sop',       title: 'SOP — Aerial Rescue',               reference: 'SOP-09',   version: 1, status: 'active', body: {}, file_url: null, effective_date: ymd(-45),  review_date: ymd(140), tags: ['sop','rescue'], created_by: 'u-demo', created_at: iso(-45), updated_at: iso(-45) },
  ]
}

function scheduled_checks() {
  return [
    { id: 'sc1', title: 'Weekly toolbox meeting',        check_type: 'toolbox',   frequency_days: 7,   last_done: ymd(-9),  next_due: ymd(-2), notes: 'Whole crew', created_at: iso(-120), updated_at: iso(-9) },
    { id: 'sc2', title: 'Chipper monthly inspection',    check_type: 'equipment', frequency_days: 30,  last_done: ymd(-28), next_due: ymd(2),  notes: 'Forst ST6', created_at: iso(-120), updated_at: iso(-28) },
    { id: 'sc3', title: 'First aid kit check',           check_type: 'first_aid', frequency_days: 30,  last_done: ymd(-20), next_due: ymd(10), notes: 'All vehicles', created_at: iso(-120), updated_at: iso(-20) },
    { id: 'sc4', title: 'Quarterly H&S site audit',      check_type: 'audit',     frequency_days: 90,  last_done: ymd(-60), next_due: ymd(30), notes: '', created_at: iso(-200), updated_at: iso(-60) },
    { id: 'sc5', title: 'Chainsaw & PPE inspection',     check_type: 'equipment', frequency_days: 14,  last_done: ymd(-11), next_due: ymd(3),  notes: 'Log sharpening', created_at: iso(-120), updated_at: iso(-11) },
  ]
}

function vehicles() {
  return [
    { id: 'v1', name: 'Truck 1 — Isuzu tipper',  plate: 'ABC123', active: true, cof_due: ymd(40),  ruc_km_remaining: 3200, notes: '', created_at: iso(-300) },
    { id: 'v2', name: 'Truck 2 — Hino chipper',  plate: 'DEF456', active: true, cof_due: ymd(-5),  ruc_km_remaining: 850,  notes: 'COF overdue — book', created_at: iso(-300) },
    { id: 'v3', name: 'Ute — Ford Ranger',       plate: 'GHI789', active: true, cof_due: ymd(110), ruc_km_remaining: 6400, notes: '', created_at: iso(-300) },
  ]
}

function tool_requests() {
  return [
    { id: 'tr1', requested_by: 'u-jesse', kind: 'replace',  item: 'Husqvarna 540i XP top-handle saw', notes: 'Current one won\'t hold charge', urgency: 'high',   status: 'requested', resolved_by: null,     resolved_at: null,    created_at: iso(-1), updated_at: iso(-1) },
    { id: 'tr2', requested_by: 'u-tomas', kind: 'replace',  item: 'Climbing rope 45m (worn)',        notes: 'Sheath fraying near tail',      urgency: 'normal', status: 'approved',  resolved_by: 'u-demo', resolved_at: iso(-1), created_at: iso(-3), updated_at: iso(-1) },
    { id: 'tr3', requested_by: 'u-bea',   kind: 'wishlist', item: 'Second petrol pole pruner',       notes: 'Would speed up hedge days',     urgency: 'low',    status: 'requested', resolved_by: null,     resolved_at: null,    created_at: iso(-5), updated_at: iso(-5) },
    { id: 'tr4', requested_by: 'u-jesse', kind: 'replace',  item: 'Wedges (set of 3)',               notes: '',                              urgency: 'normal', status: 'ordered',   resolved_by: 'u-demo', resolved_at: iso(-2), created_at: iso(-6), updated_at: iso(-2) },
  ]
}

function messages() {
  return [
    { id: 'm1', user_id: 'u-mara',  channel: 'team', recipient_id: null, body: 'Morning team — Oriental Pde is a rope-access job, brief the public before you start.', created_at: iso(0, 7, 12) },
    { id: 'm2', user_id: 'u-jesse', channel: 'team', recipient_id: null, body: 'Copy. Chipper fuelled and on the truck.', created_at: iso(0, 7, 20) },
    { id: 'm3', user_id: 'u-demo',  channel: 'team', recipient_id: null, body: 'Ngaio storm cleanup moved to tomorrow AM. Tomás + Bea on that one.', created_at: iso(0, 7, 35) },
    { id: 'm4', user_id: 'u-bea',   channel: 'team', recipient_id: null, body: '👍 will bring the tarp and blower.', created_at: iso(0, 7, 41) },
  ]
}

function mulch_sites() {
  return [
    { id: 'ms1', name: 'Dave\'s lifestyle block', address: '120 Rifle Range Rd, Belmont', lat: -41.1980, lng: 174.9010, instructions: 'Dump behind the second gate, not near the house.', photos: [], contact_name: 'Dave Ellis', contact_phone: '027 220 1180', contact_email: 'dave@example.com', price_per_load: 40, xero_contact_id: null, notes: 'Always keen for more', active: true, created_by: 'u-demo', created_at: iso(-90), updated_at: iso(-90) },
    { id: 'ms2', name: 'Community garden — Berhampore', address: '5 Rhine St, Berhampore', lat: -41.3200, lng: 174.7760, instructions: 'Tip by the compost bays. Text before arrival.', photos: [], contact_name: 'Priya (coordinator)', contact_phone: '021 998 220', contact_email: 'garden@example.com', price_per_load: 0, xero_contact_id: null, notes: 'Free — good relationship', active: true, created_by: 'u-demo', created_at: iso(-70), updated_at: iso(-70) },
  ]
}

function mulch_dumps() {
  return [
    { id: 'md1', site_id: 'ms1', dumped_by: 'u-jesse', dumped_at: iso(-1, 15, 0), price: 40, load_note: 'Full tipper of pine chip', photo_url: null, invoice_status: 'invoiced', invoice_error: null, xero_invoice_id: 'x-inv-1', xero_invoice_number: 'INV-2201', xero_invoice_url: '#', created_at: iso(-1) },
    { id: 'md2', site_id: 'ms2', dumped_by: 'u-tomas', dumped_at: iso(-2, 14, 30), price: 0, load_note: 'Mixed hardwood chip', photo_url: null, invoice_status: 'skipped', invoice_error: null, xero_invoice_id: null, xero_invoice_number: null, xero_invoice_url: null, created_at: iso(-2) },
    { id: 'md3', site_id: 'ms1', dumped_by: 'u-bea', dumped_at: iso(-4, 11, 0), price: 40, load_note: '', photo_url: null, invoice_status: 'pending', invoice_error: null, xero_invoice_id: null, xero_invoice_number: null, xero_invoice_url: null, created_at: iso(-4) },
  ]
}

// Count-only table (Settings shows total SMS sent) — content not read.
function sms_messages() {
  return Array.from({ length: 14 }, (_, i) => ({ id: 'sms-' + i, created_at: iso(-i) }))
}

function app_settings() {
  return [
    { key: 'dbs_sync_enabled', value: false, updated_at: iso(-30) },
  ]
}

export function buildSeed() {
  return {
    users: users(),
    clients: clients(),
    jobs: jobs(),
    quotes: quotes(),
    schedule: schedule(),
    job_photos: job_photos(),
    staff_records: staff_records(),
    company_documents: company_documents(),
    safety_documents: safety_documents(),
    scheduled_checks: scheduled_checks(),
    vehicles: vehicles(),
    tool_requests: tool_requests(),
    messages: messages(),
    mulch_sites: mulch_sites(),
    mulch_dumps: mulch_dumps(),
    sms_messages: sms_messages(),
    app_settings: app_settings(),
    xero_connections: [],
    quote_runs: [],
    portal_sync: [],
    portal_actions: [],
  }
}
