# Portal upload mapping — TreeCo → Spencer's & Downer

How a completed TreeCo job's photos, quote and invoice map onto each client
portal. This is the spec the `portal_actions` worker follows. Sources: the
**MyWork Portal Guide** (Downer, Jan 2025 v2.0) and Josh's confirmation of the
Spencer Henshaw flow.

## Photo phase mapping (the key alignment)

TreeCo labels photos **Before / During / After**. Both portals use
**Before / WIP / After** ("WIP" = work-in-progress). So:

| TreeCo phase | Portal phase | Where it's captured in TreeCo |
|---|---|---|
| **Before** | **Before** | Quote builder (site-assessment) + Work Order per line |
| **During** | **WIP** | Work Order per line (crew, on site) |
| **After** | **After** | Work Order per line (crew, on site) |
| _extra_ | Before/WIP/After as appropriate | Work Order "Additional photos" |

Each photo in TreeCo carries its `phase` and `line_ref` (the quote line it
documents) in `job_photos`, so the worker knows which SOR line and which portal
phase every image belongs to.

---

## Spencer's (Spencer Henshaw / "DBS" portal — `jobs.spencerhenshaw.co.nz`)

Confirmed by Josh:

- **Per-line photos** — each charge/SOR line has a **traffic-light ("streetlight")
  button**. Open it, pick the **category from the dropdown** — mapping
  **Before → Before, During → WIP, After → After** — and upload the image(s) for
  that line.
- **Quote & invoice PDFs** — uploaded in the **Documents tab**, under category
  **"Other"**. **Both exclude agreed-rate (schedule-of-rates) codes** — those are
  paid on the schedule, never quoted. The uploaded quote PDF is rendered with
  `?portal=1` (drops any line flagged `sor`), and the Spencers invoice already
  shows only non-agreed-rate (`quotable`) lines.

Worker sequence (`source = 'dbs'`):
1. Log in (username/password — no MFA; reuse `dbs_login`).
2. Open the job by its portal id / KO reference.
3. For each `job_photos` row with a `line_ref`: find that line, click its
   streetlight button, set the dropdown to the mapped category (Before/WIP/After),
   upload the file.
4. Extra (no `line_ref`) photos: attach to the job's general photo area with the
   right category.
5. Render the quote PDF (and invoice PDF when present) and upload both to the
   **Documents** tab as category **Other**.

---

## Downer (MyWork / Spotless WMS — `mywork.spotless.com.au`)

From the MyWork Portal Guide. **MFA on login** → the worker uses a persisted
authenticated session (see the worker's `DOWNER_STORAGE_STATE`).

Navigation: **Home → Service Orders → Issued** → open the Work Order (search by
`WO…` number / R-number).

**Photos — two destinations (the guide is strict about this):**

| Photo kind | Destination | Steps |
|---|---|---|
| **Hidden Works** photos | **on the SOR code** (Items tab) — NOT Attachments | Items → Edit the code → *Attachment Document* → Browse → Upload → Description (SPCA) → Add → OK → Save |
| General **Before/WIP/After** photos | **Attachments tab** | Attachments → New → Browse → Upload → Type = *Photograph* → Description (SPCA) → Add → Save |
| **Invoices / reports / quote PDFs** | **Attachments tab** | Attachments → New → Browse → Upload → set Type → Description → Add → Save |

**Photo labelling — "SPCA format":** each single image is labelled with its
**location/room code + phase**, e.g. `B1 - After`, `EH1 - WIP` (Entry Hallway 1).
The worker builds the description from the line's location code + the mapped
phase. Photos should carry a date/time/geo stamp (TreeCo already stamps Downer
photos with GPS + timestamp on upload).

**Items tab:** Add SOR code → *Actual Quantity* → *Location* → Add & Continue →
Save. (TreeCo line items already carry `code`, `qty` and a PE/location code.)

**Progress notes:** Notes and History → Add (phone-fail, no-access, appointment,
EOT via "Email Help Desk"). Not part of the quote push, but the same session.

**Finish:** **Complete** (top-right) → enter the actual date/time left site, a
brief work-done message, and a risk rating (never "Unknown") → *completed by
portal* → Save. Then **Claim** — the last step; **claiming locks the order**, so
the worker never auto-claims. The push stages everything up to (and optionally
including) Complete, and leaves Claim to a human.

---

## Two staging actions (two buttons)

On a **complete** S&D job the panel offers two separate buttons, each queuing its
own `portal_actions` row:

| Button | Action | What the worker does |
|---|---|---|
| **Upload photos to portal** | `push_photos` | Per-line Before/During/After photos onto each line (Spencers streetlight popup / Downer Attachments). |
| **Upload to Portal** (quote PDF → Documents) | `upload_documents` | The quote PDF (agreed-rate codes excluded) into the **Documents** tab under **Other**. |

Both appear only once the job is at **Complete** status.

## What the worker stages vs. what admin does

The worker **stages** — uploads photos and the quote PDF to the right places —
then stops. The following are **left to admin** as the final manual steps in the
portal (never automated):

- **Mark each line item complete, and by who** (Spencers requires each item be
  ticked complete with the person recorded).
- The final **Submit / Claim**.

A `portal_actions` row is `done` when staging succeeds, `failed` (with
`last_error`) otherwise.
