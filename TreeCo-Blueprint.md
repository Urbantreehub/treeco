# TreeCo — Business Operating System
## Complete Build Blueprint
### NZ Arboricultural Business Platform

---

> **HOW TO USE THIS DOCUMENT**
> Start every new Claude session by pasting this entire document and saying:
> *"I'm building the TreeCo system. Here is my blueprint. Let's continue from Phase [X]."*
> This document is your permanent project record. Update it as things are built.

---

## WHAT THIS IS

A complete, custom business operating system for a NZ arboricultural (tree services) business based in Wellington. Built as a Progressive Web App (PWA) — works on phone, tablet, and desktop from one codebase. No App Store required to deploy.

**The business:** Tree services — residential and commercial. Wellington region. ~8 staff. ~$480k annual revenue. Owner-operated, looking to grow to $620k+ and eventually hire an estimator and step back from day-to-day quoting.

**Why custom:** No off-the-shelf software covers arboricultural-specific compliance (SiteWise, Primary ITO, NZ council GIS, SWMS, SSSPs), NZ employment law integration, Māori tree names, and end-to-end business intelligence in one platform.

---

## TECH STACK DECISIONS

```
Frontend:     React (PWA) — works on all devices, offline capable
Backend:      Node.js + Express
Database:     PostgreSQL (via Supabase — managed, free tier available)
Auth:         Supabase Auth (role-based: boss, office, crew lead, field staff)
Hosting:      Vercel (frontend) + Railway or Supabase (backend/db)
Email:        SendGrid (free tier to start)
SMS:          Twilio (NZ rates ~3-5c/text)
Payments/AI:  Anthropic Claude API (claude-sonnet-4-20250514)
GPS:          Integrate with existing GPS provider API (Eroad/Navman/Teletrac)
Accounting:   Xero API (OAuth2)
Maps:         Google Maps API (geocoding + routing)
Voice/Trans:  OpenAI Whisper API (toolbox meeting transcription)
Storage:      Supabase Storage (documents, photos)
PWA:          Service Worker for offline capability
```

**Monthly running costs at full build:** ~$100-200 NZD total
**Deployment cost (one developer, one day):** ~$800-1,500 NZD

---

## USER ROLES & PERMISSIONS (v1 — Phase 1)

Two permission levels only. Simple by design — no permission matrix to maintain.

| Permission Level | Access |
|---|---|
| **Full Access** (boss, office admin) | View all jobs, full CRUD on jobs/clients/quotes, manage calendar, assign jobs to any user, manage users, all statuses, all reports |
| **Restricted Access** (field staff) | View only jobs assigned to them, can change job status, can upload photos to their assigned jobs, **cannot** edit job details, pricing, client info, or see other staff's jobs |

```sql
-- users table
users (
  id, email, name, phone, password_hash,
  access_level,   -- 'full' | 'restricted'
  avatar_url, active, created_at
)
```

Every API endpoint checks `access_level` server-side (never trust the frontend). Restricted users' queries are always filtered `WHERE assigned_to = current_user.id`.

This is intentionally simple for v1. A more granular permission system can be added in a later phase if needed — but two levels covers the real requirement: you and office can see and do everything, crew see and touch only their own work.

---

## DESIGN SYSTEM (from prototype)

```css
--bark: #2C2416          /* Primary dark — nav, headers */
--bark-mid: #3D3322
--moss: #4A6741          /* Primary action — buttons, success */
--moss-light: #6B9463
--moss-pale: #E8F0E6     /* Light green backgrounds */
--amber: #D4851A         /* Warning, attention */
--amber-pale: #FDF3E3
--sky: #4A7FA5           /* Info, secondary tags */
--danger: #C0392B        /* Red alerts */
--cream: #FAF8F4         /* Page background */
--border: #E2DDD6
--radius: 10px
--shadow: 0 2px 8px rgba(44,36,22,0.10)
Font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```

**Design principles:**
- Field staff view: Large tap targets, high contrast, works in sunlight
- Office view: Information-dense but clean
- Boss view: Data visualised, plain English insights
- Never more than 3 taps to complete any field task

---

## BUILD PHASES

### PHASE 1 — CORE (Build First, Use Before Adding More)
**Timeline: 6-8 weeks | Cost: ~$1,500 NZD to deploy**

The absolute minimum that delivers real daily value:

1. User authentication (2 access levels: full / restricted)
2. Lead capture → pipeline (9 statuses, colour-coded, drag-and-drop)
3. Quote builder (line items, images, optional extras, client-facing view)
4. Calendar + job scheduling
5. Field staff job view (phone/tablet)
6. Daily tools list (auto-compiled from job requirements)
7. Basic SSSP per job
8. Xero integration (invoice sync)
9. Automated SMS/email (job confirmations, reminders)
10. Client self-booking (time windows, not exact times)

**Do not build anything else until Phase 1 is live and being used daily.**

### PHASE 2 — SAFETY & COMPLIANCE
6-8 weeks after Phase 1 is stable

- SWMS library + auto-update triggers
- Toolbox meeting recorder + AI transcription
- Training modules + knowledge checks + digital sign-off
- Compliance calendar (NZ legal requirements)
- Incident reporting
- Staff career progression + Primary ITO tracking
- GPS pre-start vehicle checks
- Timesheet integrity (GPS cross-reference)

### PHASE 3 — BOSS INTELLIGENCE
6-8 weeks after Phase 2

- Boss dashboard (live P&L from Xero)
- Tax reserve calculator (GST, PAYE, provisional, drawings)
- Marketing command centre
- Predictive revenue forecasting
- Business plan tracker
- Client scoring system
- Review gating (positive → Google, negative → mediation)

### PHASE 4 — ADVANCED FEATURES
Add as needed, in any order

- AI phone receptionist (Bland AI / Vapi)
- Email inbox AI lead scraping
- Tender monitoring (GETS + council portals)
- Council GIS auto-check on new jobs
- Content hub + social media scheduler
- Insurance command centre
- Subcontractor compliance register
- Networking/market intelligence module
- Employee wellbeing / PIP tools

---

## PHASE 1 — DETAILED SPECIFICATION (REVISED — LOCKED SPEC)

This is the confirmed build target. Entirely web-based (no native app needed — works in any browser, installable as PWA later if wanted). Build this and nothing else first.

### Job Statuses (Locked List)

Exactly nine statuses, colour-coded, used everywhere in the system (pipeline, calendar, job cards):

| Status | Colour | Hex | Meaning |
|---|---|---|---|
| New Lead | Grey-blue | `#7C93A8` | Enquiry received, not yet actioned |
| Quote Scheduled | Sky blue | `#4A7FA5` | Site visit booked to quote |
| Quote Sent | Amber | `#D4851A` | Quote sent, awaiting client response |
| Accepted — To Be Scheduled | Teal | `#3A8A82` | Client accepted, needs a calendar slot |
| Scheduled | Moss green | `#4A6741` | Has a confirmed date/crew on the calendar |
| Stump Grinding | Brown | `#8B6238` | Main job done, stump grind outstanding |
| Complete — To Be Invoiced | Lime | `#7FA650` | Work finished, invoice not yet raised |
| Invoiced | Dark green | `#2F5233` | Invoice sent, awaiting payment |
| On Hold | Red-grey | `#A85C5C` | Paused — client delay, weather, access issue etc. |

```sql
-- Stored as enum or constrained text — never free text
status ENUM (
  'new_lead', 'quote_scheduled', 'quote_sent',
  'accepted_to_schedule', 'scheduled', 'stump_grinding',
  'complete_to_invoice', 'invoiced', 'on_hold'
)
```

Status colour is a single source of truth (a config object), used identically in the pipeline board, the calendar event colour, and the job detail badge — never hardcoded twice.

### Module A — Job Pipeline (Quotient-style board)

Kanban board, one column per status, jobs as draggable cards.

- Drag a card between columns to change status — same action everywhere
- Card shows: client name, address, job type, value, days-in-status, colour bar matching status
- Click card → opens job detail panel (slide-over, as in the prototype)
- Filter bar: by crew, by date range, by job type
- Full Access users see every job; Restricted users see only their assigned jobs (and only the "change status / upload photo" actions on those)

### Module B — Quote Builder (Quotient clone)

This is the centrepiece — replicate Quotient's core UX as closely as possible:

- Line items, each with: description, quantity, rate, optional toggle (client can select/deselect), **image attachment per line**
- Drag to reorder line items
- Running total updates live as client ticks/unticks optional items
- GST calculated automatically (15%)
- Client-facing view: clean, branded, mobile-friendly, big **Accept** / **Decline** buttons
- On accept → job status auto-moves to `Accepted — To Be Scheduled`, you get notified
- On decline → status moves to a declined sub-state, reason captured if given
- Quote stores a permanent shareable link (no login required for client to view)

```sql
quotes (
  id, job_id, client_id,
  status,             -- 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'
  line_items,         -- json: [{id, description, qty, rate, optional, selected, image_url, sort_order}]
  subtotal, gst, total,
  client_view_token,  -- random token for the no-login client link
  sent_at, viewed_at, responded_at,
  decline_reason,
  created_at
)
```

### Module C — Drag & Drop Calendar

Full calendar view (week and day views minimum; month view optional for v1).

- Each job appears as a block on the day(s) it's scheduled
- Block colour = status colour (same config as the pipeline)
- **Drag a job block to a different day/time** → reschedules it, updates `scheduled_date`
- **Drag a job block onto a staff member's row** → assigns/reassigns crew
- Calendar can be viewed as:
  - **By staff/crew** (rows = people, columns = days) — this is the primary assignable view
  - **By day** (single day, all jobs, all crews) — for the daily dispatch view
- Click a calendar block → same job detail panel as the pipeline
- Unscheduled jobs (status = `Accepted — To Be Scheduled`) appear in a sidebar "unscheduled" tray — drag from tray onto the calendar to schedule

```sql
-- schedule entries link jobs to specific dates/times/assignees
schedule (
  id, job_id,
  assigned_to,        -- array of user_ids (one or more staff/crew)
  date, start_time, end_time,
  status,             -- mirrors job status for calendar colour
  created_at, updated_at
)
```

Recommended library: **FullCalendar** (react wrapper) — has resource/timeline view built in specifically for the "rows = staff" layout, and native drag-and-drop support. This avoids building drag-and-drop scheduling from scratch.

### Module D — Embeddable Web Form → New Lead

A single `<script>` embed snippet (like Quotient/Tidycal-style embeds) that:

- Renders a simple enquiry form: name, phone, email, address, job description, photo upload (optional)
- On submit → creates a new `job` record with `status = 'new_lead'` and a linked/new `client` record
- Triggers an internal notification (email/SMS) to office
- Triggers an automatic acknowledgement email/SMS to the enquirer
- Works on any website via `<script src="https://[yourdomain]/embed.js" data-treeco-form></script>` — renders an iframe so it's isolated from the host site's CSS

```javascript
// embed.js — minimal, loads an iframe pointing to the hosted form
(function() {
  const iframe = document.createElement('iframe');
  iframe.src = 'https://app.treeco.co.nz/embed/lead-form';
  iframe.style = 'width:100%;border:none;min-height:480px;';
  document.currentScript.parentNode.insertBefore(iframe, document.currentScript);
})();
```

Since your website isn't built yet, Phase 1 also includes a standalone hosted version of this same form (`app.treeco.co.nz/quote-request`) that you can link to directly from social media, Google Business Profile, etc. — before the embed even has a website to sit on.

### Phase 1 — What's Explicitly OUT (deferred to later phases)

To keep this buildable in 6-8 weeks, the following are **not** in this build — they come later:
- Xero integration (Phase 1b, right after this is live)
- SMS/email automation beyond the two triggers above (lead ack + internal notify)
- Tools list auto-compilation
- SSSP/SWMS
- Offline PWA mode
- Client vibe profiling / personalised quote copy
- Council GIS checks
- Anything boss-dashboard related

This keeps the first build laser-focused: **lead in → quote → drag onto calendar → track status → done.** Everything else stacks on top once this foundation is real and in daily use.

---

### Core API Endpoints (Phase 1 — locked scope only)

```
POST   /auth/login
POST   /auth/logout

GET    /jobs                    -- pipeline view, filtered by access_level
POST   /jobs                    -- create new job/lead (full access only)
GET    /jobs/:id
PUT    /jobs/:id                -- update status/details (restricted = status+photos only)
PUT    /jobs/:id/status         -- dedicated lightweight status-change endpoint

GET    /quotes/:id
POST   /quotes                  -- create quote
PUT    /quotes/:id
POST   /quotes/:id/send         -- generates client_view_token, sends link
GET    /q/:token                -- public, no-login client view of quote
POST   /q/:token/respond        -- client accepts or declines

GET    /schedule?start=&end=    -- calendar data for date range
POST   /schedule                -- create/move a calendar entry (drag-drop)
PUT    /schedule/:id            -- reschedule / reassign

GET    /clients
POST   /clients
GET    /clients/:id
PUT    /clients/:id

POST   /leads/embed             -- public endpoint hit by the embeddable form
GET    /embed/lead-form         -- the hosted form page itself

POST   /jobs/:id/photos         -- upload photo (restricted users: own jobs only)
```

Everything below this point in the document (Xero integration, advanced SMS/email triggers, time-window booking, offline PWA, AI-personalised quote copy) is **reference logic for later phases** — not part of the Phase 1 build. It's kept in this blueprint so the design thinking isn't lost, clearly labelled below.

---

## LATER-PHASE REFERENCE LOGIC (build after Phase 1 is live)

### Phase 1b — Xero Integration

```javascript
// OAuth2 flow — user connects their Xero account once
// Scopes needed: accounting.transactions, accounting.contacts

// When job status moves to 'invoiced' → create Xero invoice
async function createXeroInvoice(quote) {
  const invoice = {
    Type: 'ACCREC',
    Contact: { Name: quote.client.name, EmailAddress: quote.client.email },
    LineItems: quote.line_items.map(item => ({
      Description: item.description,
      Quantity: item.qty,
      UnitAmount: item.rate,
      AccountCode: '200', // Revenue account
      TaxType: 'OUTPUT2'  // NZ GST 15%
    })),
    DueDate: addDays(new Date(), 7),
    Status: 'DRAFT'
  }
  return await xeroClient.accountingApi.createInvoices(tenantId, { Invoices: [invoice] })
}
```

### Phase 1b — Expanded SMS/Email Automation Triggers

Phase 1 ships with exactly two triggers (lead acknowledgement, internal new-lead notification). The rest of this set comes in Phase 1b once the core pipeline is proven in daily use:

```javascript
const TRIGGERS = [
  { event: 'quote_sent', sms: 'Hi {name}, your quote from TreeCo is ready to view: {quote_link}' },
  { event: 'job_confirmed', sms: 'Hi {name}, your tree job is confirmed for {date}.' },
  { event: 'crew_departed', sms: 'Hi {name}, our crew is on the way. ETA approximately {eta}.' },
  { event: 'crew_arrived', sms: 'Hi {name}, our crew has arrived at your property.' },
  { event: 'job_running_late', sms: 'Hi {name}, we\'re running approximately {delay} mins behind.' },
  { event: 'job_complete', sms: 'Hi {name}, all done! Thanks for choosing TreeCo.' },
  { event: 'quote_followup_day3', sms: 'Hi {name}, just checking you received your quote? {quote_link}' },
  { event: 'invoice_overdue_7d', sms: 'Hi {name}, a reminder that invoice #{invoice_no} for ${amount} is overdue.' }
]
```

### Phase 3+ — Booking System (Time Windows, geographic clustering)

```javascript
// Client books a WINDOW (morning/afternoon) not an exact time
// System queues bookings and optimises route order
// Boss locks the run the night before → clients get narrowed 1-hour window
const QUOTE_RUN_SETTINGS = {
  quote_days: ['tuesday', 'thursday'],
  windows: ['morning', 'afternoon'],
  max_per_day: 8,
  emergency_buffer_slots: 2,
  lock_time: 'day_before_at_5pm',
  auto_fill_threshold_km: 5,
  geographic_clustering: true
}
```

### Phase 2+ — Offline PWA Setup

```javascript
// service-worker.js — only needed once field staff are working
// in low-signal areas regularly; not required for Phase 1 (web-based, online use)
const CACHE_NAME = 'treeco-v1'
self.addEventListener('sync', event => {
  if (event.tag === 'sync-offline-actions') {
    event.waitUntil(syncOfflineActions())
  }
})
```

### Phase 3+ — AI-Personalised Quote Copy & Risk Pricing

```javascript
// Quote personalisation based on client communication-style profile
function generateQuoteOpening(client, job) {
  const vibe = client.communication_style
  const openers = {
    friendly: `Hi ${client.first_name},\n\nIt was great meeting you today...`,
    formal: `Dear ${client.name},\n\nThank you for the opportunity to quote...`,
    brief: `Hi ${client.first_name},\n\nQuote for ${job.address} as discussed.`
  }
  return openers[vibe] || openers.friendly
}

const RISK_PRICING = {
  glass_roof: 200, powerline_proximity: 150, confined_access: 100,
  risk_multipliers: { low: 1.0, medium: 1.15, high: 1.30, extreme: 1.50 }
}
```

---

## PHASE 2 — SAFETY SYSTEM SPECIFICATION

### SWMS (Safe Work Method Statements)

```javascript
// SWMS stored as structured documents, not PDFs
// Each SWMS has: tasks, hazards, controls, required_ppe, sign_off_required
// Linked to job types — auto-attached when job created

// Auto-update triggers
const SWMS_UPDATE_TRIGGERS = [
  'incident_filed',           // incident mentions task covered by SWMS
  'near_miss_reported',
  'toolbox_meeting_outcome',  // AI extracts relevant points
  'worksafe_guidance_update', // system monitors WorkSafe website
  'scheduled_review_date',    // annual review
  'new_equipment_added'
]

// When triggered:
// 1. Flag SWMS for review
// 2. AI drafts suggested update
// 3. Boss reviews + approves
// 4. New version published
// 5. All staff who signed previous version auto-assigned retraining
```

### Training Module Structure

```javascript
// Each module contains:
{
  id, title, type,            // 'swms' | 'policy' | 'induction' | 'equipment'
  content_blocks: [
    { type: 'text', content: '...' },
    { type: 'image', url: '...' },
    { type: 'video', url: '...' },
    { type: 'document', url: '...', must_read: true }
  ],
  knowledge_checks: [
    {
      question: 'What PPE is required for chainsaw work?',
      type: 'multiple_choice',   // 'multiple_choice' | 'true_false' | 'scenario'
      options: ['...', '...', '...', '...'],
      correct: 0,
      explanation: 'Chainsaw chaps protect against...'
    }
  ],
  pass_mark: 80,               // percentage
  requires_signature: true,
  expiry_months: 12,           // null = no expiry
  required_for_job_types: ['chainsaw_work', 'aerial']
}
```

### Toolbox Meeting AI Flow

```javascript
// 1. Record audio (boss/office only)
// 2. Upload to Whisper API for transcription
// 3. Send transcript to Claude API for structured extraction

const TOOLBOX_EXTRACTION_PROMPT = `
You are analysing a toolbox meeting transcript for a NZ arboricultural business.
Extract the following as JSON:
{
  "summary": "2-3 sentence overview",
  "tasks": [{"description": "", "assigned_to": "", "due_date": "", "priority": ""}],
  "safety_issues": [""],
  "policy_update_suggestions": [{"policy": "", "suggested_change": ""}],
  "equipment_issues": [""],
  "action_items": [{"item": "", "owner": "", "deadline": ""}]
}
Transcript: {transcript}
`
```

---

## PHASE 3 — BOSS DASHBOARD SPECIFICATION

### Tax Reserve Calculator

```javascript
// Pulls live from Xero every 4 hours
// NZ tax rates 2025-26:
const NZ_TAX = {
  gst_rate: 0.15,
  income_brackets: [
    { min: 0,      max: 15600,  rate: 0.105 },
    { min: 15601,  max: 53500,  rate: 0.175 },
    { min: 53501,  max: 78100,  rate: 0.30  },
    { min: 78101,  max: 180000, rate: 0.33  },
    { min: 180001, max: Infinity, rate: 0.39 }
  ],
  acc_levy: 0.0167,           // on earnings up to $152,790
  provisional_uplift: 1.05,   // standard uplift method
  provisional_dates: ['aug_28', 'jan_15', 'may_7'],
  paye_due: 20,               // 20th of following month
  gst_due: 28                 // 28th following period end
}

function calculateTaxReserve(xeroData, drawings) {
  const gst_owing = xeroData.gst_collected - xeroData.gst_paid
  const paye_owing = xeroData.paye_this_period
  const provisional = calculateProvisional(xeroData.last_year_rit)
  const personal_tax = calculatePersonalTax(drawings)
  
  return {
    gst: gst_owing,
    paye: paye_owing,
    provisional: provisional,
    personal: personal_tax,
    total: gst_owing + paye_owing + provisional + personal_tax,
    shortfall: total - xeroData.tax_reserve_balance
  }
}
```

### Revenue Prediction Model

```javascript
// After 3+ months of data, system builds prediction model
// Factors: historical patterns, current lead volume, economic signals, weather
// Confidence scoring: 91% 1-2 weeks, 74% 3-5 weeks, 61% 6-12 weeks

// Economic indicators monitored (public APIs):
const MONITORED_INDICATORS = [
  'rbnz_ocr',                 // Reserve Bank OCR
  'westpac_consumer_confidence',
  'stats_nz_building_consents_wellington',
  'reinz_wellington_house_prices',
  'stats_nz_unemployment',
  'metservice_wellington_forecast',
  'niwa_seasonal_outlook'
]
```

### Client Scoring Algorithm

```javascript
function calculateClientScore(client) {
  const weights = {
    payment_behaviour: 0.30,
    reviews_and_feedback: 0.20,
    team_experience: 0.25,
    job_history: 0.15,
    loyalty: 0.10
  }
  
  // Recent weighting: last 6 months = 60%, 6-18mo = 30%, 18mo+ = 10%
  
  return {
    score: weightedTotal,
    tier: getTier(weightedTotal),
    flags: identifyFlags(client),
    booking_action: getBookingAction(weightedTotal)
  }
}

function getTier(score) {
  if (score >= 85) return 'premier'
  if (score >= 70) return 'good'
  if (score >= 50) return 'average'
  if (score >= 30) return 'watch'
  return 'problem'
}
```

---

## NZ-SPECIFIC DATA & CONTENT

### Tree Species Database (sample — load full list)

```javascript
const NZ_SPECIES = [
  { common: 'Kauri', botanical: 'Agathis australis', maori: 'Kauri', protected: true, dieback_risk: true },
  { common: 'Totara', botanical: 'Podocarpus totara', maori: 'Tōtara', protected: true },
  { common: 'Rimu', botanical: 'Dacrydium cupressinum', maori: 'Rīmu', protected: true },
  { common: 'Kahikatea', botanical: 'Dacrycarpus dacrydioides', maori: 'Kahikatea', protected: true },
  { common: 'Pohutukawa', botanical: 'Metrosideros excelsa', maori: 'Pōhutukawa', protected: true, coastal: true },
  { common: 'Puriri', botanical: 'Vitex lucens', maori: 'Pūriri', protected: true },
  { common: 'Cabbage Tree', botanical: 'Cordyline australis', maori: 'Tī kōuka', protected: false },
  { common: 'Flax', botanical: 'Phormium tenax', maori: 'Harakeke', protected: false },
  { common: 'Kowhai', botanical: 'Sophora species', maori: 'Kōwhai', protected: false },
  { common: 'Manuka', botanical: 'Leptospermum scoparium', maori: 'Mānuka', protected: false },
  { common: 'Kanuka', botanical: 'Kunzea ericoides', maori: 'Kānuka', protected: false },
  { common: 'NZ Beech', botanical: 'Nothofagus species', maori: 'Tawhai', protected: true },
  { common: 'Mahoe', botanical: 'Melicytus ramiflorus', maori: 'Māhoe', protected: false },
  { common: 'Karaka', botanical: 'Corynocarpus laevigatus', maori: 'Karaka', protected: false },
  // Exotic species
  { common: 'English Oak', botanical: 'Quercus robur', maori: 'Ōki', protected: false, notable_tree_risk: true },
  { common: 'Liquidambar', botanical: 'Liquidambar styraciflua', maori: null, protected: false },
  { common: 'Monterey Pine', botanical: 'Pinus radiata', maori: null, protected: false },
  { common: 'Silver Birch', botanical: 'Betula pendula', maori: null, protected: false },
  // Add full library of 100+ species
]
```

### NZ Compliance Calendar (pre-loaded)

```javascript
const COMPLIANCE_REQUIREMENTS = [
  { name: 'Toolbox meetings', frequency: 'monthly_minimum', law: 'HSWA 2015', trigger_events: ['incident', 'near_miss', 'new_hazard'] },
  { name: 'SWMS review', frequency: 'annual', law: 'HWSA 2015 s38', trigger_events: ['incident', 'process_change'] },
  { name: 'First aid cert', expiry_years: 2, required_roles: ['all'] },
  { name: 'Chainsaw cert (NZQA)', expiry_years: 3, required_roles: ['arborist', 'crew_lead'] },
  { name: 'EWP cert', expiry_years: 2, required_roles: ['ewp_operators'] },
  { name: 'Traffic management', expiry_years: 2, required_roles: ['traffic_mgmt'] },
  { name: 'Harness retirement', expiry_years: 3, type: 'equipment' },
  { name: 'SiteWise renewal', frequency: 'annual', type: 'business' },
  { name: 'Public liability renewal', type: 'insurance', alert_days_before: 90 },
  { name: 'Vehicle WOF', frequency: '6_months', type: 'vehicle' },
  { name: 'Kauri dieback training', type: 'certification', required: 'working_near_kauri' },
  { name: 'Myrtle rust awareness', type: 'certification', required: 'all_field_staff' }
]
```

### Wellington Region Councils (GIS Integration)

```javascript
const WELLINGTON_COUNCILS = [
  {
    name: 'Wellington City Council',
    gis_url: 'https://wcc.maps.arcgis.com/apps/webappviewer/index.html',
    notable_trees_layer: 'NotableTrees',
    district_plan_url: 'https://wellington.govt.nz/planning-and-environment'
  },
  {
    name: 'Hutt City Council',
    gis_url: 'https://gis.huttcity.govt.nz'
  },
  {
    name: 'Upper Hutt City Council',
    gis_url: 'https://maps.upperhuttcity.govt.nz'
  },
  {
    name: 'Porirua City Council',
    gis_url: 'https://porirua.maps.arcgis.com'
  },
  {
    name: 'Kapiti Coast District Council',
    gis_url: 'https://www.kapiticoast.govt.nz/maps'
  }
  // Check each council's current GIS API documentation
  // Most NZ councils use ArcGIS — query via ArcGIS REST API
]
```

---

## BUSINESS CONTEXT (for AI personalisation)

```
Business name:        [TO BE CONFIRMED]
Owner name:           [TO BE CONFIRMED]
Location:             Wellington, New Zealand
Current revenue:      ~$480,000/yr
Staff count:          ~8 (including owner)
Current software:     ServiceM8 + manual processes (CANCEL when TreeCo live)
Key pain points:
  - Owner does all quoting (~15hrs/week)
  - No proper safety documentation system
  - No career progression framework for staff
  - Revenue dips predictably in June-July
  - Phone tag scheduling waste
  - No system for commercial tenders

Owner goals (3 years):
  - Personal income: $160,000/yr (currently $101,500)
  - Working hours: 40-45/wk (currently ~54)
  - First holiday in 4+ years: February 2027
  - Hire estimator: May 2027 (when revenue hits $620k)
  - Second crew running independently: Late 2027
  - Sellable/step-back-able business: 3-4 years

Owner constraints (never suggest):
  - Debt they're not comfortable with
  - Compromising work quality
  - Growing faster than H&S system can absorb
  - Hiring staff who can't be properly supported

Quote run days: Tuesday and Thursday
Emergency buffer: 2 slots per day
Field staff devices: iPhone and iPad
```

---

## PHASE 1 BUILD SEQUENCE (Week by Week) — REVISED, LOCKED SCOPE

```
WEEK 1: Foundation
- Project setup (React + Node + Supabase)
- Database schema (users, clients, jobs, quotes, schedule)
- Authentication (2 access levels: full / restricted)
- Status config object (9 statuses + colours, single source of truth)
- Basic navigation shell

WEEK 2-3: Job Pipeline
- Kanban board — 9 columns, drag-and-drop between statuses
- Job detail slide-over panel (view/edit, respects access level)
- Client CRUD (create/edit/view)
- New job creation (manual, by office)

WEEK 4-5: Quote Builder
- Line item builder — add/remove/reorder, image per line, optional toggle
- Live total calculation with GST
- Client-facing quote view (no-login, shareable link)
- Accept / Decline flow → auto status update
- Quote → job linkage

WEEK 6-7: Calendar
- FullCalendar integration — resource/timeline view (staff as rows)
- Day view for daily dispatch
- Drag job onto calendar from "unscheduled" tray
- Drag to reschedule / reassign
- Calendar block colour = status colour (shared config)
- Unscheduled jobs tray (status = Accepted — To Be Scheduled)

WEEK 8: Embeddable Form + Testing
- Hosted lead form page (standalone URL)
- Embed snippet (iframe-based script)
- New lead → auto job creation + notifications
- Full user testing across both access levels
- Bug fixes
- Developer deployment (Vercel + Supabase)

PHASE 1b — FAST FOLLOW-ON, STARTS IMMEDIATELY AFTER PHASE 1 IS LIVE (3-5 days):
- Xero OAuth connection flow
- Account code + GST mapping confirmed with your Xero setup
- "Invoiced" status triggers draft invoice creation in Xero
- Error handling for API failures (e.g. Xero token expired, contact mismatch)
- Test against your real Xero account before relying on it daily
```

**Why fast follow-on rather than building Xero into Phase 1 directly:** Total time is almost identical either way (~8-9 weeks vs ~9-10 weeks). The difference is risk and usability — fast follow-on means you have a working, usable pipeline in 8 weeks, with Xero arriving as a clean, low-risk addition about a week later once the core system is already proven. Building it in from the start means nothing is usable until everything — including the integration — is finished and tested together.

**Library choices confirmed for this scope:**
- Calendar: **FullCalendar** (`@fullcalendar/react` + `@fullcalendar/resource-timeline` for the staff-rows view, `@fullcalendar/interaction` for drag-and-drop)
- Drag-and-drop pipeline board: **dnd-kit** (lighter and more reliable than react-beautiful-dnd, which is unmaintained)
- Forms: React Hook Form
- Image upload: direct to Supabase Storage, signed URLs

---

## STARTING PROMPT FOR NEW SESSIONS

Copy and paste this at the start of any new Claude or Claude Code session:

---

*"I'm building TreeCo — a custom business operating system for my NZ arboricultural (tree services) business in Wellington. I have a complete blueprint document (attached/pasted below). We are currently building Phase [1/2/3/4].*

*The tech stack is: React PWA frontend, Node.js/Express backend, PostgreSQL via Supabase, hosted on Vercel.*

*Today I need to build: [SPECIFIC FEATURE].*

*Please follow the design system in the blueprint (bark/moss colour palette, field staff view optimised for large tap targets and outdoor visibility).*

*Do not suggest features outside Phase [X] — we build in phases and use before adding more."*

---

## QUESTIONS TO ANSWER BEFORE STARTING

Before the first build session, have these ready:

1. **Business name** — for branding throughout the system
2. **Owner name** — for personalised dashboard
3. **Current GPS system** — Eroad / Navman / Teletrac / other (affects Phase 2 integration)
4. **Current Xero plan** — needed for API access tier
5. **Domain name** — where the web app will live (e.g. treeco.co.nz)
6. **Staff names and roles** — to seed the database
7. **Existing job types** — your standard service list for quote templates
8. **Standard pricing** — hourly rates, common job prices as starting defaults
9. **SSSP template** — your current one to digitise in Phase 2
10. **Preferred NZ supplier accounts** — for equipment/PPE procurement features

---

## COST SUMMARY

| Item | One-off | Monthly |
|---|---|---|
| Developer (deployment) | $800-1,500 NZD | — |
| Domain name | $20-30 NZD/yr | — |
| Vercel hosting | Free tier | $0-20 NZD |
| Supabase (db + storage) | Free tier | $0-25 NZD |
| Twilio SMS | — | $20-40 NZD |
| SendGrid email | — | Free-$20 NZD |
| Claude API (AI features) | — | $20-40 NZD |
| Google Maps API | — | $0-20 NZD |
| Xero subscription | Already have | Already paying |
| **Phase 1 total** | **~$1,500 NZD** | **~$50-80 NZD** |
| **Full build total** | **~$2,000 NZD** | **~$150-200 NZD** |

**Compare to:** ServiceM8 ($150-300/mo) + Hammertech ($300-500/mo) + Safety Champion ($100-250/mo) + no NZ-specific features in any of them.

**Savings from cancelling existing SaaS:** ~$300-500/month minimum.

---

*Blueprint version 1.0 — Created June 2026*
*Update this document as each phase is completed.*

