# Downer + Spencer's portal sync — extraction & "Upload to Portal"

_Design plan. Goal: when a quote is built in TreeCo, one **"Upload to Portal"** button
pushes the job info **and a PDF of the quote** into the right client portal (Downer or
Spencer's), staged and ready for the office to submit — replacing the current
"email the quote" step._

---

## 1. What the portals actually are (email + portal reconnaissance)

Both Downer and Spencer's are **Kāinga Ora head-maintenance contractors**; Urban Tree
Services is a subcontractor (SDP — "Service Delivery Partner"). Each has its **own,
separate portal**, and they behave differently — which is the crux of this plan.

### Downer → "MyWork" (Spotless WMS)

| | |
|---|---|
| **Portal URL** | `https://mywork.spotless.com.au/` |
| **Login** | "Sign in **as a subcontractor**", username ends in **`@mywork.spotless.com`** (e.g. `Josh.Micallef@mywork.spotless.com`, `Sophia.Dainty@mywork.spotless.com`) — **not** the email address |
| **🔒 MFA** | **Required on login** (password + authenticator app on a mobile device). This is the single most important constraint for automation. |
| **Also mobile app** | "MyWork Mobile App" for tradespeople (InTune-enrolled); **not** for subcontractor admins |
| **Onboarding stack** | Applications via **Felix** (`felix.net`); document storage on **Downer SharePoint**; Microsoft/Entra collaboration invites |
| **Guide in inbox** | **"MyWork Portal Guide.pdf"** — attached to _"MyWork Access Request"_ from `TRTWellington@downergroup.com` (26 May 2026). _(Couldn't be auto-extracted here — it's the definitive screen-by-screen reference and should be read before building the Downer worker.)_ |

**Work-order lifecycle (from the email trail):**
- Work orders arrive by email as **R-numbers** (`R6622028-1`) and/or **CAR numbers** (`CAR 197874`), with a job description and priority.
- UTS **submits a quotation** in the portal → Downer **approves or rejects**. Rejections
  come back with notes demanding a **cost breakdown + photos** (e.g. _"What volume of gorse
  is there… provide a breakdown and photos of why the cost is…"_). Quotes must justify cost
  against the **Schedule of Rates (SOR / "Y-codes"**, e.g. `YMG570`).
- Contractual obligation to **keep the portal updated**: **Portal Notes**, **Appointment
  Bookings**, **No-Access Contact Fail 1 & 2** (with calling-card photos), completion photos.
  _"TRT and Admin will not update the portal on behalf of trades."_

### Spencer's → "Spencer Henshaw" (DBS portal) — already integrated

| | |
|---|---|
| **Portal URL** | `https://jobs.spencerhenshaw.co.nz` (a ColdFusion app) |
| **Login** | Simple **username + password** (`login_id` / `password`). Session cookies `CFID` / `JSESSIONID`. **No MFA.** |
| **Contact** | `spencersnz.co.nz` / `spencerhenshaw.co.nz`; TANs ("Trades & Assurance Notifications") for rate changes, MINFEE/AES100, handbooks |
| **Quirks** | Itemised invoices must **match SOR charges exactly**; non-SOR "quotable" lines billed at a **0.87 GST factor**; pre-approval needed above a threshold |

The **no-MFA** difference is why TreeCo already logs into Spencer's headlessly today, and why
Downer will need a different login strategy.

### Where quotes are authored today
Quotes are currently built in **Quotient** (`go.quotientapp.com`, account `31059`) and then
**emailed**; invoices live in **Xero**. This feature moves the "send" step from email →
direct portal staging.

---

## 2. What TreeCo already has (the rails are ~70% built)

This feature is **filling a deliberately-stubbed hole**, not greenfield. Existing pieces:

| Piece | File | State |
|---|---|---|
| **Outbound action queue** | `supabase/migrations/016_portal_actions.sql` — `portal_actions(source, job_id, ko_reference, action, payload, status, attempts, last_error…)` | ✅ table + RLS exist. **No worker consumes it yet.** |
| **"Upload to portal" button (Spencers)** | `frontend/src/components/SpencersInvoice.jsx` L158-179 — "Upload invoice to Spencers" `enqueue('upload_invoice', …)` | ✅ UI + enqueue done; shows _"automation pending… once the Spencers Documents flow is wired"_ |
| **Downer already treated as a portal job** | `frontend/src/config/statuses.js` — `isSpencersJob()` returns true for `category==='downer'`; `JOB_CATEGORIES.downer` (orange); `NewJobModal.jsx` Downer category + portal step | ✅ front-end scaffolding present |
| **`source` column for multi-portal** | `portal_actions.source` / `portal_sync.source` default `'dbs'`, "room for other portals later" | ✅ ready for `'downer'` |
| **Inbound scraper (Spencer's)** | `scripts/dbs_to_treeco.py` (Playwright) — logs in, scrapes jobs, **auto-creates a draft quote** from charge lines, uploads photos to Storage, emails office | ✅ working; Fly.io worker (`DEPLOY_DBS_WORKER.md`) |
| **Quote PDF** | `frontend/src/utils/downloadPdf.js` + `QuoteView.jsx` (`quoteRef`, `?download=1`) | ✅ client-side `html2canvas`+`jspdf`. **No server-side PDF.** |
| **Quote email** | `supabase/functions/send-quote-email/index.ts` (Resend) | ✅ sends a **link**, not a PDF |
| **Feature flags** | `app_settings` table (`dbs_sync_enabled`) | ✅ add `downer_sync_enabled` alongside |

**Net:** the button pattern, the queue, the storage-upload pattern, the Downer job category,
and a proven Playwright login/scrape harness all already exist. Two things are genuinely
missing: (a) **a worker that consumes `portal_actions`**, and (b) **a Downer login/scrape path
that survives MFA**.

---

## 3. The critical decision: how to log into Downer under MFA

Everything hinges on this. Options, worst→best fit for "get it ready to submit":

1. **Fully headless auto-login + auto-submit** — ❌ not viable for Downer. MFA blocks silent
   logins; an authenticator prompt fires on new sessions. High breakage, and auto-submitting
   into a client's system is risky.
2. **Persistent authenticated session (`storage_state`)** — log in **once** interactively on a
   trusted worker profile, complete MFA, and persist Playwright `storage_state` (cookies +
   tokens). The worker reuses it; MFA re-prompts only when the session/device trust expires
   (renew manually, minutes of work). ✅ This is the standard pattern for MFA portals.
3. **Semi-automated (human-in-the-loop submit)** — the worker fills every field and attaches
   the PDF, then **stops before the final "Submit"**, leaving it staged for the office to eyeball
   and click submit. ✅ Matches the user's exact words: _"getting it ready to submit."_
4. **Portal-ready packet (zero automation)** — TreeCo produces a PDF + a **prefilled, copy-paste
   field map** (work-order #, SOR lines, breakdown text, links) the office pastes into the portal.
   ✅ Ships immediately, no login risk; good as Phase 0 and as the permanent fallback.

**Recommendation:** combine **#2 + #3**. Persist a Downer session for automation, but keep the
flow **staged, not auto-submitted** (#3 semantics), and always fall back to the packet (#4) when
the session is stale. Spencer's (no MFA) can go **fully automated** on the same worker.

---

## 4. Proposed build — phased

### Phase 0 — "Upload to Portal" button + portal-ready packet _(ships now, no portal login)_
Deliver the visible feature immediately on existing rails.

- **Generalise `SpencersInvoice.jsx` → a portal panel** driven by `jobCategory(job)`
  (Spencers vs Downer): bill-to text, labels, and `source` (`'spencers'` | `'downer'`).
- **Add an "Upload quote to Portal" action at quote time** (in `QuoteBuilder.jsx` menu and/or
  `JobDetailPanel.jsx` quote block, gated on `isSpencersJob(job)`), replacing "Email quote"
  for portal jobs:
  1. **Render the quote to a PDF Blob** — refactor `downloadPdf.js` to expose `renderQuotePdf(ref) → Blob` (today it only `pdf.save()`s). Reuse the `QuoteView` document.
  2. **Upload the PDF to Supabase Storage** (`job-images` bucket, `quotes/<job>/…` — same pattern as `dbs_to_treeco.py:122`), get a public URL.
  3. **Enqueue** `portal_actions` `action:'upload_quote'`, `source`, `ko_reference`, `payload:{ pdf_url, work_order, sor_lines, breakdown, total }`.
- **Portal-ready packet view** — a printable/scrollable panel that lays out exactly what to paste
  into the portal (work-order #, each SOR/Y-code line + qty + rate, the cost-breakdown paragraph
  Downer demands on rejects, and the PDF link). One click for the office.
- **Status chips** — reuse the queued/uploaded chip UI already in `SpencersInvoice.jsx`.

_No credentials required — a human still submits. This alone removes the email step._

### Phase 1 — `portal_actions` worker, Spencer's auto-submit _(no MFA)_
- New worker `scripts/portal_actions_worker.py` (or extend the Fly.io app): poll
  `portal_actions where status='pending'`, `source='dbs'/'spencers'`; log into Spencer Henshaw
  (reuse `dbs_login`), navigate to the job's Documents/quote screen, attach the PDF, fill fields,
  **submit**, mark `done`/`failed` with `last_error`, retry with backoff (`attempts`).
- This proves the queue end-to-end on the easy (no-MFA) portal.

### Phase 2 — Downer MyWork worker _(MFA, staged submit)_
- **Login:** persistent `storage_state` profile (Decision #2). One interactive MFA login, persisted
  as a Fly.io secret/volume; auto-renew prompt to the office when stale.
- **Stage, don't submit:** fill the quotation screen + attach the quote PDF, stop before final
  submit; drop a Portal Note; mark the action `staged`. Office reviews + clicks submit.
- **Map the screens first** using **"MyWork Portal Guide.pdf"** + a live click-through (record
  selectors like the DBS scraper does). Handle the reject→"breakdown + photos" loop.
- Feature-flag with **`downer_sync_enabled`** (mirrors `dbs_sync_enabled`), default off.

### Phase 3 — Downer inbound extraction (parallel workstream)
- Mirror `dbs_to_treeco.py` for MyWork: scrape assigned work orders (R-numbers/CARs, priority,
  SLA/KPI due), upsert `jobs` (`category:'downer'`, `ko_reference`), auto-draft a quote from the
  SOR lines, email the office on genuinely-new orders. Same `storage_state` session as Phase 2.

---

## 5. Concrete changes checklist

**Schema / config**
- `portal_actions.action` gains `upload_quote` (+ optional `staged` status value).
- `app_settings`: add `downer_sync_enabled`.
- Storage: `quotes/<job_id>/<quote_no>.pdf` in the existing `job-images` bucket.

**Frontend**
- `utils/downloadPdf.js`: add `renderQuotePdf(ref): Promise<Blob>` (share code with `downloadPdf`).
- New `components/PortalUpload.jsx` (generalised from `SpencersInvoice.jsx`) — Spencers **and** Downer.
- `QuoteBuilder.jsx`: for `isSpencersJob(job)`, swap "Email quote" → "Upload to Portal" (keep email as fallback).
- Copy tweaks: "Spencers invoice" → portal-aware; bill-to per category.

**Worker (`scripts/`)**
- `portal_actions_worker.py` — queue consumer (Phase 1 Spencer's; Phase 2 Downer).
- `downer_to_treeco.py` — inbound (Phase 3), modelled on `dbs_to_treeco.py`.
- Secrets: `DOWNER_MYWORK_USERNAME`, `DOWNER_MYWORK_STORAGE_STATE`, `DOWNER_POLL_SECONDS`, reuse `SUPABASE_*`, `RESEND_API_KEY`.

---

## 6. Open questions for Josh

1. **Auto-submit vs. staged?** The request says _"ready to submit"_ → I've planned **staged**
   (human clicks final submit). Confirm that's right, or do you want full auto-submit on
   Spencer's (no MFA) at least?
2. **Downer login for the bot** — OK to do a **one-time MFA login** on a dedicated worker profile
   and persist the session (Option #2)? Which authenticator/number handles the prompt?
3. **MyWork Portal Guide.pdf** — can you forward it (or screenshots of the "submit quotation"
   screen)? It's needed to map the Downer submit flow precisely.
4. **Quotient** — are you moving quote authoring fully into TreeCo, or will Quotient stay in the
   loop? Affects whether the PDF comes from TreeCo's `QuoteView` or Quotient.
5. **Scope now** — build **Phase 0** (button + packet, zero-risk) first, or wait on answers to 1–3?
