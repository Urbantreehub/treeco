# Campaigns (mailing list) — setup

Everything needed to take the Campaigns feature from "code is merged" to "first email
sent", in order. Nothing sends until step 7, so it is safe to work through this.

Companion docs:
- `docs/campaigns/inbound-repeat-work-signals.md` — the evidence the copy is built on
- `docs/campaigns/personalisation-data-sources.md` — how Xero and Quotient join up
- `docs/campaigns/nz-compliance-checklist.md` — the legal requirements, plainly stated

---

## 1. Apply the migrations

```bash
supabase db push
```

There are **two**, and both are required — the edge functions reference columns added by
`042` and will fail at runtime without it.

- **`041_campaigns.sql`** — `marketing_contacts`, `campaigns`, `campaign_sends`,
  `campaign_events`, `email_suppressions`, the `campaign_audience_eligible` view, and the
  anon-callable RPCs for unsubscribe and open/click tracking. Also inserts two
  `app_settings` keys: `campaign_send_enabled = false` and `campaign_daily_cap = 200`.
- **`042_campaign_send_retries.sql`** — `campaign_sends.attempts` / `claimed_at` /
  `next_attempt_at` / `last_error_at` for retry and stale-claim handling,
  `campaigns.run_lock_at` for the concurrency claim, and `campaign_unsubscribe_failures`,
  which records an unsubscribe the database refused. That table is keyed by a SHA-256 of
  the token, so the raw token — a permanent per-contact secret — is never stored.

⚠️ Migration numbering in this repo has some duplicates (two `015_`, two `016_`…).
These are `041` and `042`; `040_activity_helpers.sql` was the previous highest.

If you are applying to the hosted project by hand rather than with the CLI — which is how
the other catch-ups in `scripts/` were done — paste
`scripts/APPLY_041_042_campaigns_prod.sql` into the Supabase SQL editor instead. It is
both migrations in one transaction, ASCII-only and idempotent, and it still leaves sending
switched off.

---

## 2. Deploy the edge functions

```bash
supabase functions deploy campaign-send campaign-scheduler campaign-track campaign-unsubscribe campaign-webhook import-marketing-contacts
```

Three of them must be **public** (no JWT check) — they are hit by mail clients, by
Gmail's native unsubscribe button and by Resend, none of which can present a user
token. `supabase/config.toml` already declares `verify_jwt = false` for all three, but
if you deploy them individually pass the flag:

```bash
supabase functions deploy campaign-track       --no-verify-jwt
supabase functions deploy campaign-unsubscribe --no-verify-jwt
supabase functions deploy campaign-webhook     --no-verify-jwt
```

`campaign-unsubscribe` is the RFC 8058 one-click target named by the
`List-Unsubscribe` header: Gmail, Yahoo and Outlook POST to it from their built-in
unsubscribe button. It matters that this is a real endpoint — advertising one-click
support and then not honouring the POST is treated as a broken unsubscribe and counts
against the sending domain. The visible link in the email footer still goes to the
friendly confirmation page at `/unsubscribe/:token`; the two deliberately differ.

Secrets — `RESEND_API_KEY` and `APP_URL` already exist for quote emails. Add:

```bash
supabase secrets set RESEND_WEBHOOK_SECRET=whsec_...
```

`campaign-webhook` deliberately **rejects unsigned requests**, so it will 401 until
this is set. That is intentional: without it, anyone could post fake bounces and
suppress your customers.

---

## 3. DNS — add DMARC (the one thing that is missing)

Checked live on 2 Sep 2026. The Resend side is already correct because quote emails
use it:

| Record | Status |
|---|---|
| `resend._domainkey.urbantreeservices.net` TXT | ✅ present (DKIM) |
| `send.urbantreeservices.net` TXT `v=spf1 include:amazonses.com ~all` | ✅ present |
| `send.urbantreeservices.net` MX `feedback-smtp.ap-northeast-1.amazonses.com` | ✅ present (bounce return-path) |
| `urbantreeservices.net` TXT `v=spf1 include:_spf.google.com ~all` | ✅ present (Google Workspace) |
| `_dmarc.urbantreeservices.net` | ❌ **MISSING** |

DKIM signs as `d=urbantreeservices.net`, so DMARC will pass on DKIM alignment even
though the root SPF doesn't list Amazon SES. Nothing else needs changing — **just add
DMARC**, starting in monitor-only mode so it cannot break existing mail.

**DNS for this domain is on Cloudflare** (nameservers `zelda.ns.cloudflare.com` /
`chase.ns.cloudflare.com`), not SiteHost. In the Cloudflare dashboard → the
`urbantreeservices.net` zone → **DNS → Records → Add record**:

| Field | Value |
|---|---|
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:josh@urbantreeservices.net; fo=1` |
| TTL | Auto |

(Cloudflare appends the domain automatically — enter `_dmarc`, not the full hostname.)

`p=none` is **monitor-only**: it changes nothing about how mail is handled, it just asks
receiving servers to send reports. It cannot break the quote emails. Verify with:

```bash
dig +short TXT _dmarc.urbantreeservices.net @8.8.8.8
```

Leave it at `p=none` for 2–4 weeks, read the aggregate reports, then move to
`p=quarantine`. Do not jump straight to `p=reject` — Google Workspace, Resend and any
other sender all need to be passing first.

This matters more than it looks: Gmail and Yahoo tightened bulk-sender rules in 2024,
and a domain with no DMARC record at all sending a few hundred marketing emails a day
is exactly the profile that gets filtered.

---

## 4. Import the list

**Xero** (automatic — uses the existing Xero connection):

In the app: Campaigns → Audience → Import → Xero. Or directly:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/import-marketing-contacts" \
  -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"source":"xero","dry_run":true}'
```

Run with `"dry_run": true` first and read the summary before committing.

**Quotient** (manual — Quotient has no read API): follow
`supabase/functions/import-marketing-contacts/README.md`, which contains the exact
browser-console snippet. You must be logged in to `go.quotientapp.com` in Chrome.

Expected result, from the live extraction on 2 Sep 2026:

- 4,357 Quotient contacts / 3,142 accepted quotes back to May 2019
- 4,278 with a valid email · 68 classified commercial · **4,210 residential**
- **2,230 residential with actually-accepted work** ← the mailable audience
- Recency: 118 (0–6mo) · 201 (6–12) · 300 (12–24) · 733 (24–48) · 878 (48mo+)

---

## 5. Check the audience before you trust it

In Campaigns → Audience, spot-check that no commercial account has slipped through.
`classifyContact()` catches Downer, Spencers Henshaw, councils, Kāinga Ora, property
managers and `*.govt.nz`, but it is a heuristic over free-text names. **Anything
mailed to a contract client is a commercial-relationship problem, not just a
compliance one** — so this check is worth doing properly the first time. Flip any
stragglers to `commercial` in the contact row.

---

## 6. Schedule the sender

Paste `scripts/APPLY_campaign_scheduler_cron.sql` into the SQL editor — it enables
`pg_net`, puts the service role key in Vault rather than inline in the job body (a cron
job's SQL sits in `cron.job` in plain text, readable by anyone who can query it), and
registers the schedule.

This is worth doing even if you never schedule a campaign for a future time: a send
stopped by the daily cap does not resume on its own, and `campaign-scheduler` picks up
campaigns already in `sending` as well as scheduled ones. Without it, a capped campaign
sits at 200 of 2,230 until someone presses Send again.

---

## 7. Turn sending on, and warm up

Sending is OFF by default. In Settings, set `campaign_send_enabled` to `true`.

**Do not send to 2,230 people on day one.** The domain has never sent bulk mail. A
cold domain that suddenly emits two thousand messages is the single most reliable way
to get filtered, and reputation is much harder to repair than to build.

Suggested ramp — `campaign_daily_cap` is there to enforce it:

| Day | Volume | Segment |
|---|---|---|
| 1 | 50 | most recent customers (0–6 months) — highest engagement, safest first impression |
| 3 | 100 | 6–12 months |
| 5 | 200 | 12–24 months |
| 8+ | 200/day | work back through 24–48 months |

Watch open rate and bounces after each step. If bounces exceed ~3%, stop and clean
the list before continuing — a stale 2019 address list will contain dead mailboxes.

**On the 878 contacts last seen 4+ years ago:** these are the weakest inferred-consent
claim under the Unsolicited Electronic Messages Act, and the most likely to have gone
stale. Recommendation is to leave them out of the first programme entirely and decide
on them separately once you can see real bounce and complaint rates. That is a
judgement call, not a legal certainty — it is flagged here so it is made deliberately
rather than by default.

---

## 7b. Who the emails come from — decided

Campaigns send as **`Josh at Urban Tree Services <office@urbantreeservices.net>`**, with
replies also going to `office@`. Josh's decision, 2 Sep 2026.

The display name stays personal on purpose. The whole reason these emails work is that
they read as a note from the person who climbed your tree, and the sender name is the
one piece of that visible in the inbox list *before* anyone opens. The mailbox behind it
is the office one, so replies land where Ashley can action them instead of in Josh's
personal inbox — which matters, because the templates actively invite replies.

Both fields are editable per campaign in Compose if that ever needs to change. DKIM still
aligns (`office@` is on the same verified domain), so nothing changes for deliverability.

## 8. Before every send: seed-test to an Xtra address

This is the most valuable New Zealand–specific step here, and no international
deliverability guide mentions it.

**`xtra.co.nz` is filtered by SMX**, a New Zealand anti-spam company, which also filters
a large share of NZ business domains. For a Wellington residential customer list, SMX is
probably the third most important gatekeeper after Google and Microsoft. Regional
Australasian ISPs show a distinctive failure signature in Validity's benchmark data —
low spam-foldering but **high outright rejection** — so when SMX doesn't trust a message
you don't land in junk, you get bounced and never know.

Keep a seed list and send every campaign to it first: an **`xtra.co.nz`** address, an
**`outlook.com`/`hotmail.com`** address, and a **`gmail.com`** address. Microsoft is
consistently the worst-performing major provider for inbox placement, so Outlook is more
likely to be the problem than Gmail.

If SMX blocks a legitimate send: **emailsupport@smxemail.com** with the message attached
as `.eml`, or 0800 769 769. SMX weights SPF correctness more heavily than Gmail does —
another reason to get the DMARC and SPF picture right in §3.

## 9. Watch the complaint rate from the very first send

At this list size the arithmetic is unforgiving. Google wants spam complaints **below
0.1%** and treats **0.3%** as the point where you stop being eligible for any mitigation.
On a 500-person send, **two complaints is 0.4%** — already over the ceiling. On 300, one
complaint is 0.33%.

So the useful alert is not a percentage threshold, it's **the first complaint**.
`campaign-webhook` records every `email.complained` event; check it after each batch
rather than waiting for a rate to accumulate. One person hitting "report spam" is a
signal worth acting on at this scale.

This reframes a lot of the design decisions. Sending four times a year instead of
monthly, naming the actual tree, putting a real reply-to on it, and saying plainly why
someone is receiving it are usually filed under "being polite". At 2,000 contacts they
are the deliverability architecture.

## 9b. After a send: what actually went out

Campaigns → **Results** is the history of every campaign, live rather than snapshotted:
the counters are re-read from `campaign_stats` each time the page loads, so opens and
clicks that arrive days later show up.

Open a campaign and **Recipients** is the per-person record, straight off
`campaign_sends` — one row per address with its delivery status, that person's own opens
and clicks, and the reason for anything skipped or failed. Open a row and the exact
subject and body **that person** was handed is on screen, merge tags already resolved.
That is the answer to the two questions that actually get asked after a send: "did
Angela get it?" and "what did you send me?" — and it is the Privacy Act access-request
answer as well (`docs/campaigns/nz-compliance-checklist.md`, §2).

Filter by Sent / Opened / Clicked / Failed or skipped, or search an address; both run
against the whole send, not the rows currently on screen. The list pages in 50s and the
bodies are fetched one at a time, so a 2,000-person send opens as fast as a 5-person one.

**Activity**, below it, is the same events in chronological order — useful for "when did
this land" rather than "who got it". A run of the same person opening repeatedly
collapses into one row with a count, because mail clients fetch the tracking pixel more
than once and six identical rows read as a bug.

## 10. A segmentation trap worth knowing

Mailchimp's segmentation study (≈9M recipients, compared against the same senders'
unsegmented campaigns) found segmentation lifts clicks by ~100% overall — **but that
segmenting by date-added alone made things worse**: unsubscribes **+33.8%**, abuse
reports **+29.6%**, versus interest-based segmentation which cut unsubscribes by 25%.

Pure recency — "everyone at 12+ months" — is that same shape. The presets in the app
combine recency **with a service dimension** for this reason, and the templates follow
suit: the annual template targets hedge and pruning customers, not simply everyone who
is overdue. Worth preserving that habit when new segments are added.

## 11. Inbox placement

`docs/campaigns/deliverability.md` is the full write-up — what actually drives spam
classification, why Microsoft rather than Gmail is the problem for an NZ list, why the
Promotions tab isn't worth chasing, and which widely-repeated "tricks" are self-defeating.

The five that matter, in order:

1. **Verify and recency-segment the list before the first send.** About $20 for 2,000
   addresses. Best-value step in the whole project.
2. **Audit list provenance** — confirm quoted-but-declined leads didn't merge in with real
   customers.
3. **Keep the app's transactional mail on the same From domain.** Quote and invoice emails
   are the trickle that keeps the domain warm between four seasonal sends. This is also
   why we are *not* splitting marketing onto a separate subdomain — at ~30 emails a day,
   two identities would each get too little signal to build a reputation at all.
4. **Warm up most-recent-first, with a manual stop-gate** after day 1 and day 3.
5. **Postmaster Tools + DMARC `rua=` now** — but Resend's per-domain data is the real
   instrument. Expect Postmaster Tools to be mostly blank at this volume, and remember
   blank is not the same as healthy.

Two small ones with real effect: **schedule off-the-hour** (10:07, not 10:00 — providers
throttle the top-of-hour bulk spike), and **leave open tracking off** (the pixel is an
image, and post-Apple-MPP the data is close to worthless).

## 12. Kill switch

Set `campaign_send_enabled` back to `false` in Settings. `campaign-send` checks it on
every invocation and refuses with a 409, and in-flight campaigns stop claiming new
rows. Individual campaigns can also be set to `paused`.
