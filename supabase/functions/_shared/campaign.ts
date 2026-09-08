// Shared campaign rendering + sending logic, used by both `campaign-send`
// (send/queue one campaign on demand, or send a test) and `campaign-scheduler`
// (send everything whose scheduled_at has come round). Keeping the merge-tag
// rendering, the compliance footer and the Resend call here means there is a
// single place where "what actually goes in the envelope" is decided — which
// matters, because campaign_sends stores a copy of it as the compliance record.
//
// DESIGN NOTES (why the email looks the way it does)
//   * The HTML part is a LETTER ON LETTERHEAD, not a marketing template. One
//     600px column, live HTML text throughout, the logo at the top on a light
//     plate, and Josh's real signature at the bottom. Deliberately absent,
//     because these are the actual "marketing blast" tells: hero banner, nav
//     bar, social icon row, stock photography, competing CTAs, coloured
//     badges/starbursts, image-based headlines, preference-centre pitch. The
//     recipient knows Josh; the email should look like it came from him.
//   * NO PHOTO. One optional photo was built, rendered, looked at and removed
//     again — this is a note so it does not get helpfully added back. There is
//     no attributable evidence that a photo lifts conversion in this context,
//     and NN/g's eye-tracking finding is that images which do not carry
//     information for the reader's task are ignored outright. A climber in
//     somebody else's tree is exactly that: it is not THEIR tree, so it
//     carries nothing they need. The logo is the only decorative image that
//     earns its place, because it says who is writing.
//   * IT HAS TO WORK WITH EVERY IMAGE BLOCKED. A large and disproportionately
//     valuable slice of this list — property managers, body corporates,
//     councils — reads mail in Outlook desktop, where images are off by
//     default. So the CTA, the phone number, the headline and the signature
//     details are never inside an image, every <img> declares width/height
//     attributes (Outlook ignores CSS sizing, and an undeclared height
//     collapses the layout when the image is blocked). Strip every <img> and
//     nothing of value is lost.
//   * DARK MODE: `color-scheme: light dark` is deliberately NOT declared. Apple
//     Mail 13+ only starts applying its own dark treatment once it is, and a
//     half-implemented dark mode renders worse than none. Instead, two things
//     that need no client support at all: the logo is the flat-RGB "-safe"
//     export (see logoUrl() — a charcoal wordmark on TRANSPARENCY vanishes the
//     moment a client repaints the container dark, which is the commonest
//     dark-mode email failure there is), and it sits on an explicit light plate
//     with real padding. Do not "improve" this by adding color-scheme.
//   * RESTRAINT, NOT FAKE INTIMACY. This is a campaign and it does not pretend
//     otherwise: the letterhead is branded, the footer identifies the company,
//     the unsubscribe is right there. A mass email costumed as a one-to-one
//     note reads as manipulative the moment the reader notices, and they do
//     notice. The goal is a campaign that looks like it came from a real
//     business the reader has actually met — not a campaign in disguise.
//   * AND THE ARITHMETIC IS COMMERCIAL, NOT AESTHETIC. At ~2,100 recipients,
//     Google's 0.1% spam-complaint threshold is TWO complaints. Every piece of
//     template furniture left out below is one fewer reason for somebody to
//     reach for "report spam" instead of the unsubscribe link — and it is the
//     complaint rate, not the design, that decides whether the next campaign
//     reaches anyone's inbox at all.
//   * Source stays well under 80KB. Gmail clips at ~102KB and hides everything
//     after the cut — including the unsubscribe link — behind "View entire
//     message", which is a compliance failure, not a cosmetic one.
//   * Every message ends with complianceFooter(): real legal name, physical
//     region, phone/email, the reason-for-receiving line, the unsubscribe link
//     and (when there is an offer) its terms and expiry. That is what the
//     Unsolicited Electronic Messages Act 2007 requires of a commercial
//     message, and the Fair Trading Act requires of a discount claim.
//   * The audience is ALWAYS resolved from the `campaign_audience_eligible`
//     view, never from marketing_contacts, so unsubscribes and suppressions
//     cannot be missed by a hand-written filter.
//   * Links in the body are wrapped in the click tracker ONLY when the tracker
//     would agree to redirect to them (https on urbantreeservices.net — see
//     isTrackableLink). A Google reviews link or an http:// link is left exactly
//     as written: untracked but working beats tracked and dead. The unsubscribe
//     link is never tracked or wrapped whatever host it is on.
//
// SENDING IS INCREMENTAL, AND THAT IS THE POINT
// A run mails at most the daily cap allows and queues only what it can mail, so
// a big campaign takes several runs. What makes that safe is that the audience
// query excludes anyone who already has a campaign_sends row: each run picks up
// where the last one stopped, nobody is queued twice, and the campaign is only
// marked 'sent' once there is genuinely nobody left — see processQueue's
// completion check.
//
// Required Edge Function secrets:
//   RESEND_API_KEY   — from resend.com
//   APP_URL          — e.g. https://app.urbantreeservices.net (unsubscribe page)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected
// Optional:
//   CAMPAIGN_TRACK_URL — override for the campaign-track endpoint; defaults to
//                        ${SUPABASE_URL}/functions/v1/campaign-track
//   CAMPAIGN_ASSET_URL — where the email images are served from; defaults to
//                        ${APP_URL}/email

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Mirrors frontend/src/config/company.js — the legal identity that has to
// appear in the footer of every commercial message.
export const COMPANY = {
  legalName: 'Urban Tree Services Limited',
  shortName: 'Urban Tree Services',
  phone:     '027 203 1446',
  email:     'office@urbantreeservices.net',
  website:   'www.urbantreeservices.net',
  region:    'Wellington',
  country:   'New Zealand',
}

// Only these hosts may be reached through the click tracker. Kept here so the
// sender and the redirect endpoint agree on one definition.
export const ALLOWED_LINK_HOST = 'urbantreeservices.net'

// THE one allow-list predicate. campaign-track refuses to redirect anywhere
// else, so the sender must not wrap anything else either — a wrapped Google
// reviews link or a wrapped http:// link is a dead link in the customer's
// inbox, which is worse than an untracked one. Both sides import this.
export function isTrackableLink(raw: string): boolean {
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return host === ALLOWED_LINK_HOST || host.endsWith(`.${ALLOWED_LINK_HOST}`)
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface Campaign {
  id: string
  name: string
  subject: string
  preheader: string | null
  body: string
  from_name: string
  from_email: string
  reply_to: string
  status: string
  audience: Record<string, unknown>
  offer_code: string | null
  offer_percent: number | null
  offer_expires_on: string | null
  offer_terms: string | null
  cta_label: string
  cta_url: string
}

// A row of campaign_audience_eligible (marketing_contacts + months_since_job).
export interface Contact {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  suburb: string | null
  city: string | null
  services: string[] | null
  job_count: number | null
  lifetime_value: number | null
  last_job_summary: string | null
  months_since_job: number | null
  unsubscribe_token: string
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
  merge: Record<string, string>
  // The human link, shown in the footer: the nice confirmation page.
  unsubscribe_url: string
  // The machine link, used in the List-Unsubscribe header: an endpoint that
  // actually honours a one-click POST. The two deliberately differ.
  unsubscribe_post_url: string
}

export const CAMPAIGN_CONTACT_COLUMNS =
  'id, email, first_name, last_name, full_name, suburb, city, services, ' +
  'job_count, lifetime_value, last_job_summary, months_since_job, unsubscribe_token'

// ── Small helpers ───────────────────────────────────────────────────────────

// Escape contact-supplied text before putting it in the HTML email — a name or
// suburb containing < & " would otherwise break the layout or drop text.
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// base64url over UTF-8. `btoa` only accepts code points <= U+00FF, so encoding
// a perfectly ordinary NZ URL — https://urbantreeservices.net/pōhutukawa — used
// to throw and, inside processQueue's per-row try, mark that recipient failed.
// Encode to UTF-8 bytes first, then base64 those bytes.
export function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on long input.
  for (let i = 0; i < bytes.length; i += 0x2000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x2000))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

// A DATE as a New Zealander writes it: "31 August 2026".
//
// Formatted straight from the Y-M-D parts, with NO timezone round-trip. The old
// version anchored at midday UTC and formatted in Pacific/Auckland — but midday
// UTC IS midnight in NZ (UTC+12/+13), so every date came out a day late. This is
// the Fair Trading Act offer-expiry line in the footer of every email, so it has
// to be exactly right. Mirrors formatDateNz() in frontend/src/utils/campaigns.js.
export function nzDate(d: string | null): string {
  if (!d) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d))
  if (!m) return ''
  // Built in UTC and formatted in UTC: same output whatever TZ the function
  // runs under, and no boundary to slip across.
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

// The UTC offset Pacific/Auckland is on at a given instant, in ms.
function nzOffsetMsAt(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) if (part.type !== 'literal') p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  return asUtc - (at.getTime() - at.getMilliseconds())
}

function nzYmd(at: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(at)) if (part.type !== 'literal') p[part.type] = part.value
  return { y: +p.year, m: +p.month, d: +p.day }
}

// Start of the current NZ calendar day, as a UTC ISO string. Used for the daily
// send cap, which is about protecting the sending domain's reputation and so
// should follow the office's day, not UTC's.
//
// The offset has to be sampled AT MIDNIGHT, not at `now`: on the two DST
// transition days those differ by an hour, and the old version's window was an
// hour wrong on both — either double-counting an hour of yesterday's sends or
// missing an hour of today's. Solved by a fixpoint: guess midnight using the
// current offset, then re-sample the offset at the guess until it settles. NZ
// changes at 2am/3am local, so local midnight always exists and is unique and
// the fixpoint converges in one step.
export function nzDayStartIso(now = new Date()): string {
  const { y, m, d } = nzYmd(now)
  const localMidnight = Date.UTC(y, m - 1, d)
  let ts = localMidnight - nzOffsetMsAt(now)
  for (let i = 0; i < 3; i++) {
    const next = localMidnight - nzOffsetMsAt(new Date(ts))
    if (next === ts) break
    ts = next
  }
  return new Date(ts).toISOString()
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Greeting ────────────────────────────────────────────────────────────────

// Strings that mean the "first name" we imported is really a business, a trust
// or an account, in which case "Hi Wellington City Council," reads as a mailshot.
const COMPANY_NAME_RE =
  /\b(ltd|limited|inc|incorporated|llc|trust|trustees|council|holdings|group|properties|property|management|body corp|body corporate|apartments|school|college|church|society|association|club|company|services|solutions|construction|builders|realty|real estate|rentals|hotel|motel|farm|orchard|nursery|contractors|c\/-|attn)\b/i

// The name to greet this contact by, or a neutral fallback. Exported because
// the composer preview needs to show exactly what the recipient will see.
export function greetingName(contact: Partial<Contact>, fallback = 'there'): string {
  const raw = (contact.first_name ?? '').trim()
    || (contact.full_name ?? '').trim().split(/\s+/)[0]
    || ''
  if (!raw) return fallback
  if (raw.length < 2 || raw.length > 20) return fallback
  if (/\d/.test(raw)) return fallback
  if (COMPANY_NAME_RE.test(raw)) return fallback
  if (COMPANY_NAME_RE.test((contact.full_name ?? '') + ' ' + (contact.last_name ?? ''))) return fallback
  if (!/^[\p{L}][\p{L}'’.-]*$/u.test(raw)) return fallback
  // Imported names are inconsistently cased ("JOHN", "john") — normalise.
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

// ── Merge tags ──────────────────────────────────────────────────────────────

// Values for every supported {{tag}}. Anything not in here renders as an empty
// string — a literal "{{whatever}}" reaching a customer is worse than a gap.
export function mergeValues(campaign: Campaign, contact: Partial<Contact>): Record<string, string> {
  const months = contact.months_since_job
  return {
    first_name:       greetingName(contact),
    last_name:        (contact.last_name ?? '').trim(),
    suburb:           (contact.suburb ?? '').trim(),
    last_job_summary: (contact.last_job_summary ?? '').trim(),
    months_since_job: months === null || months === undefined ? '' : String(months),
    offer_code:       campaign.offer_code ?? '',
    offer_percent:    campaign.offer_percent === null || campaign.offer_percent === undefined
                        ? '' : String(campaign.offer_percent),
    offer_expires:    nzDate(campaign.offer_expires_on),
  }
}

// Replace every {{tag}}. Unknown tags collapse to '' rather than leaking the
// literal tag into the customer's inbox.
//
// Matches ANY {{...}}, not just [a-zA-Z0-9_]: a typo'd tag — {{first-name}},
// {{first name}}, {{last.job}} — is exactly the case where the old, narrower
// pattern didn't match and the raw tag went out to the customer verbatim. The
// whole point of collapsing unknown tags is that a gap beats a leak, so the
// match has to cover the malformed ones too.
export function applyMerge(input: string, values: Record<string, string>): string {
  return String(input ?? '').replace(/\{\{([^{}]*)\}\}/g, (_m, key: string) =>
    values[key.trim().toLowerCase()] ?? '')
}

// ── Link tracking ───────────────────────────────────────────────────────────

export function trackBaseUrl(): string {
  return Deno.env.get('CAMPAIGN_TRACK_URL')
    ?? `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/campaign-track`
}

export function appUrl(): string {
  return (Deno.env.get('APP_URL') ?? 'https://app.urbantreeservices.net').replace(/\/+$/, '')
}

// The link a PERSON clicks: the app's confirmation page, which greets them and
// lets them say why they're leaving.
export function unsubscribeUrl(contact: Partial<Contact>): string {
  return `${appUrl()}/unsubscribe/${contact.unsubscribe_token ?? ''}`
}

// The link a MAIL PROVIDER hits for List-Unsubscribe / One-Click. This must be
// an endpoint that actually unsubscribes on a bare POST — Gmail and Yahoo treat
// a declared one-click that doesn't work as a broken unsubscribe, which is
// worse than never declaring it. The SPA route above can't honour a POST, so
// the machine link points at the campaign-unsubscribe function instead.
export function unsubscribePostUrl(contact: Partial<Contact>): string {
  const base = Deno.env.get('CAMPAIGN_UNSUBSCRIBE_URL')
    ?? `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/campaign-unsubscribe`
  return `${base}?t=${encodeURIComponent(contact.unsubscribe_token ?? '')}`
}

function openPixelUrl(trackToken: string): string {
  return `${trackBaseUrl()}?o=${encodeURIComponent(trackToken)}`
}

// Neither unsubscribe link is ever tracked: measuring who clicked "stop
// emailing me" is both pointless and a bad look, and any breakage in the
// tracker must never break the legally-required opt-out. Both forms are
// excluded even though only the human one appears in the body — a wrapped
// opt-out is the one bug here that would actually matter.
//
// Anything campaign-track would refuse to redirect to is left alone as well.
// The tracker only forwards to https on urbantreeservices.net, so wrapping a
// Google reviews link, a Facebook page or any http:// URL would turn it into a
// 400 in the customer's browser. Untracked-but-working beats tracked-but-dead.
// Stamp the campaign onto a link so the website can attribute an enquiry back
// to the email that caused it.
//
// This is what closes the loop. campaign-track already records WHO clicked, but
// the click lands on urbantreeservices.net and the trail ended there — the
// quote form had no idea the visitor came from a campaign. The parameters ride
// through the tracker (they are added to the destination BEFORE it is encoded
// into the redirect), the site stores them on arrival, and /api/quote passes
// them to record_quote_request().
//
// Existing parameters are never overwritten: if a link already carries its own
// utm_source it was tagged on purpose, and clobbering it would silently break
// whatever was being measured.
function withCampaignUtm(url: string, campaignName: string | null): string {
  if (!campaignName) return url
  try {
    const u = new URL(url)
    if (u.searchParams.has('utm_source') || u.searchParams.has('utm_campaign')) return url
    u.searchParams.set('utm_source', 'email')
    u.searchParams.set('utm_medium', 'campaign')
    u.searchParams.set('utm_campaign', campaignName)
    return u.toString()
  } catch {
    return url   // not a parseable URL — leave it exactly as written
  }
}

function makeLinkWrapper(trackToken: string | null, campaignName: string | null, ...neverWrap: string[]) {
  return (url: string): string => {
    // Checked BEFORE the utm stamp: the unsubscribe links go through here too,
    // and tagging "stop emailing me" as campaign traffic would be grotesque.
    if (neverWrap.some(u => u && url.startsWith(u))) return url
    if (!isTrackableLink(url)) return url
    const dest = withCampaignUtm(url, campaignName)
    if (!trackToken) return dest
    return `${trackBaseUrl()}?c=${encodeURIComponent(trackToken)}&u=${b64urlEncode(dest)}`
  }
}

const URL_RE = /https?:\/\/[^\s<>()"']+/g
const TRAILING_PUNCT_RE = /[.,;:!?]+$/

// Pull the URLs out first (so the tracking wrapper sees the raw href), escape
// what's left, then put anchors back. Escaping first would leave &amp; in the
// URL we base64 into the redirect.
function linkifyHtml(text: string, wrap: (u: string) => string, linkStyle: string): string {
  const links: { url: string; href: string }[] = []
  const tokenised = text.replace(URL_RE, (match) => {
    const url = match.replace(TRAILING_PUNCT_RE, '')
    const tail = match.slice(url.length)
    links.push({ url, href: wrap(url) })
    return `\u0000L${links.length - 1}\u0000${tail}`
  })

  const paragraphs = tokenised.trim().split(/\n{2,}/).filter(p => p.trim() !== '')
  const html = paragraphs.map(p =>
    `<p style="margin:0 0 18px">${esc(p).replace(/\n/g, '<br>')}</p>`
  ).join('\n          ')

  return html.replace(/\u0000L(\d+)\u0000/g, (_m, i: string) => {
    const l = links[Number(i)]
    return `<a href="${esc(l.href)}" style="${linkStyle}">${esc(l.url)}</a>`
  })
}

// ── Compliance footer ───────────────────────────────────────────────────────

// UEMA 2007 s11 requires accurate sender identification and a functional
// unsubscribe on every commercial message; the Fair Trading Act requires a
// discount claim to carry its conditions and expiry. Both are generated here so
// no campaign can be sent without them.
export function complianceFooter(
  campaign: Campaign,
  contact: Partial<Contact>,
  unsubUrl: string,
): { text: string; html: string } {
  const city = (contact.city ?? '').trim() || COMPANY.region
  const reason = `You're getting this because you've had tree work done by us in ${city}.`

  const offerLines: string[] = []
  if (campaign.offer_code || campaign.offer_percent || campaign.offer_expires_on) {
    const bits: string[] = []
    if (campaign.offer_percent) bits.push(`${campaign.offer_percent}% off`)
    if (campaign.offer_code) bits.push(`quote code ${campaign.offer_code}`)
    const expires = nzDate(campaign.offer_expires_on)
    if (expires) bits.push(`offer ends ${expires}`)
    if (bits.length) offerLines.push(`Offer terms: ${bits.join(', ')}.`)
    if (campaign.offer_terms) offerLines.push(campaign.offer_terms.trim())
  }

  const text = [
    '--',
    COMPANY.legalName,
    `${COMPANY.region}, ${COMPANY.country}`,
    `${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.website}`,
    '',
    reason,
    ...(offerLines.length ? ['', ...offerLines] : []),
    '',
    `Don't want these emails? Unsubscribe here: ${unsubUrl}`,
  ].join('\n')

  const html = `
          <div style="margin-top:32px;padding-top:18px;border-top:1px solid #e6e2d8;
                      font-size:12px;line-height:1.6;color:#8a8578">
            <div><strong style="color:#6f6a5e;font-weight:600">${esc(COMPANY.legalName)}</strong></div>
            <div>${esc(COMPANY.region)}, ${esc(COMPANY.country)}</div>
            <div>${esc(COMPANY.phone)} &middot;
              <a href="mailto:${esc(COMPANY.email)}" style="color:#8a8578">${esc(COMPANY.email)}</a> &middot;
              ${esc(COMPANY.website)}</div>
            <div style="margin-top:10px">${esc(reason)}</div>
            ${offerLines.length ? `<div style="margin-top:10px">${offerLines.map(esc).join('<br>')}</div>` : ''}
            <div style="margin-top:10px">
              Don't want these emails?
              <a href="${esc(unsubUrl)}" style="color:#8a8578;text-decoration:underline">Unsubscribe</a>.
            </div>
          </div>`
  return { text, html }
}

// ── The email itself ────────────────────────────────────────────────────────

// ── Brand ───────────────────────────────────────────────────────────────────

// Taken from Josh's real email signature, not invented. `green` is the leaf in
// the logo; `deep` is the same hue dark enough to carry #FDFDFD text at ~6:1,
// which #8BA240 cannot (it is ~2.8:1 against white and fails AA badly).
//
// Note #FDFDFD and #0E0E0E rather than #FFFFFF and #000000. Those two exact
// values are what the inversion heuristics in Outlook.com and Gmail's dark
// modes look for; a hair off, and a lot of clients leave the block alone.
const C = {
  plate:   '#FDFDFD',   // the light plate the charcoal wordmark sits on
  canvas:  '#F1F0EB',   // paper around the letter
  ink:     '#2D2D2D',   // charcoal — headings, signature name
  body:    '#444444',   // body copy
  muted:   '#666666',   // signature detail lines, footnotes
  faint:   '#999999',   // qualifications line
  rule:    '#E4E1D7',   // hairlines
  green:   '#8BA240',   // brand green — rules and accents only
  deep:    '#4A6741',   // brand green, darkened for links and the button
}

// System stack: no webfont. A webfont here buys nothing (Outlook and Gmail
// ignore @font-face anyway) and costs a render-blocking external request.
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

// Josh's signature block, based on his real sent mail — but the contact number
// is DELIBERATELY the office line, not his mobile, on his instruction. Campaigns
// go out from office@ and are handled by Ashley, so a reply or a call has to land
// where someone can actually book it. Sending 2,000 people Josh's personal mobile
// puts every one of those calls on the person who is up a tree. Same reason the
// From: and Reply-To: are office@ rather than josh@.
export const SIGNATURE = {
  name:       'Josh Micallef',
  role:       'Director',
  quals:      'Cert III & Diploma of Arboriculture (AQF 3 & 5)',
  mobile:     '027 203 1446',      // the office line — see note above
  mobileTel:  '+64272031446',      // E.164, for the tel: href
  website:    'www.urbantreeservices.net',
  websiteUrl: 'https://www.urbantreeservices.net',
}

// Where the email images are served from. Hosted, never CID-attached: an
// inline attachment turns a plain letter into a multipart blob and makes
// Resend carry the bytes on every single send.
//
// WHICH HOST THIS IS, IS A DELIVERABILITY DECISION — not a convenience one.
// SpamAssassin submits every `img src` hostname to the URI blocklists, and a
// hit there costs 2.5 (URIBL_DBL_SPAM) or 1.7 (URIBL_BLACK) against a 5.0
// threshold. That single factor outweighs every image-related rule combined:
// the HTML_IMAGE_RATIO_* rules score 0.001 each, and HTML_IMAGE_ONLY_* can
// only fire when there is under ~3,200 bytes of visible text, which a real
// letter never is. So the number of images was never the risk — the host is.
// Serve them from app.urbantreeservices.net, a domain whose reputation we own
// and can see. Never a third-party image host, never a hotlink, never a free
// CDN shared with whoever else is on it. The logo is the only image in the
// email, so this one hostname is the entire image-reputation surface — which
// is a good reason to keep it that way.
// NO "@" IN ASSET FILENAMES. It is legal in a URL path, but mail clients and
// image proxies routinely parse it as the userinfo delimiter and fail the fetch —
// the first send came through with broken-image markers in both the header and
// the signature for exactly this reason. Keep asset names alphanumeric-and-dash.
export function assetBaseUrl(): string {
  return (Deno.env.get('CAMPAIGN_ASSET_URL') ?? `${appUrl()}/email`).replace(/\/+$/, '')
}

// PNG, never SVG — Gmail webmail does not render SVG at all.
//
// AND SPECIFICALLY THE "-safe" VARIANT, which is the whole dark-mode fix. The
// ordinary logo is RGBA: a dark charcoal wordmark on transparency. An inverting
// client — Gmail on iOS and Android, Outlook mobile — repaints the container
// dark, and charcoal-on-dark is charcoal-on-nothing: the wordmark simply
// disappears and the email arrives apparently unbranded. That is the single
// most common dark-mode email failure there is.
//
// logo-email-safe-2x.png is 488x211 FLAT RGB WITH NO ALPHA CHANNEL, with the
// card's own #FDFDFD baked in behind the mark. There is nothing left for an
// inverter to take away. It is #FDFDFD rather than pure white on purpose too,
// so it matches the plate it sits on instead of reading as a floating white
// box. Displayed at half its pixel size, so it stays sharp on a retina screen.
export function logoUrl(): string {
  return `${assetBaseUrl()}/logo-email-safe-2x.png`
}

const LOGO_W = 244, LOGO_H = 106     // 488x211 at half size
const SIG_LOGO_W = 120, SIG_LOGO_H = 52

const LINK_STYLE = `color:${C.deep};text-decoration:underline`

// ── HTML blocks ─────────────────────────────────────────────────────────────
// Each returns one <tr> of the 600px column, so the letter is assembled by
// concatenation and there is exactly one place per block to look at.

// Letterhead: the logo on an explicit light plate, then a 2px green rule.
//
// The plate is the whole point. The wordmark is dark charcoal on transparency;
// on a client that repaints the container dark, charcoal-on-dark vanishes and
// the email arrives apparently unsigned. A cell with its own background colour
// and generous padding keeps a light patch under the wordmark in every client,
// with no client support required. Sizing is on the width/height ATTRIBUTES,
// not in CSS: Outlook's Word engine ignores CSS sizing, and an image with no
// declared height collapses to nothing the moment images are blocked.
function letterheadHtml(): string {
  return `
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:30px 32px 20px 32px">
          <img src="${esc(logoUrl())}" width="${LOGO_W}" height="${LOGO_H}" alt="Urban Tree Services"
               style="display:block;border:0;outline:none;text-decoration:none">
        </td></tr>
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:0 32px">
          <div style="height:2px;line-height:2px;font-size:2px;background-color:${C.green}">&nbsp;</div>
        </td></tr>`
}

// Bulletproof CTA: a table button, never an image, with the padding on the <a>
// and not on the <td>. That distinction is the whole trick — padding on the
// cell makes a button-shaped area that mostly is not a link, and tapping a
// table cell does nothing. 14px top + 14px bottom + a 20px line box = 48px of
// genuinely tappable target, comfortably over the 44px minimum.
//
// THEN THE PHONE NUMBER, as a real tel: link, at 18px, in the top two-thirds
// of the letter rather than buried in the signature. For a $350-$4,500 job
// from someone who has already had us out once, the conversion is a phone
// call, not a form submission — on a phone this is very likely the single
// highest-value thing in the email, so it gets its own 44px tap target and
// sits directly under the button instead of at the bottom. It is live text, so
// unlike a button graphic it is still there when images are off.
//
// Last, in small print, the destination the button actually goes to. Someone
// reading with images off, or someone who wants to see where a link goes
// before they touch it, gets the answer without hovering.
function ctaHtmlBlock(label: string, href: string, shownUrl: string): string {
  return `
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:20px 32px 6px 32px">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td bgcolor="${C.deep}" style="background-color:${C.deep};border-radius:4px">
              <a href="${esc(href)}"
                 style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;
                        line-height:20px;mso-line-height-rule:exactly;font-weight:600;color:${C.plate};
                        text-decoration:none;border-radius:4px">${esc(label)}</a>
            </td>
          </tr></table>
          <div style="margin-top:12px;font-family:${FONT};font-size:16px;line-height:1.5;color:${C.body}">
            Or just call me on
            <a href="tel:${esc(SIGNATURE.mobileTel)}"
               style="display:inline-block;padding:10px 0;font-family:${FONT};font-size:18px;
                      line-height:24px;mso-line-height-rule:exactly;font-weight:600;color:${C.deep};
                      text-decoration:none">${esc(SIGNATURE.mobile)}</a>
          </div>
          <div style="margin-top:2px;font-family:${FONT};font-size:13px;line-height:1.5;color:${C.muted}">
            The button goes to <a href="${esc(href)}" style="${LINK_STYLE}">${esc(shownUrl)}</a>
          </div>
        </td></tr>`
}

// When a campaign has no CTA URL at all there is still a call to action: ring
// Josh. Same tel: link, same tap target, same place in the letter.
function callOnlyHtmlBlock(): string {
  return `
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:14px 32px 6px 32px">
          <div style="font-family:${FONT};font-size:16px;line-height:1.5;color:${C.body}">
            Give me a call on
            <a href="tel:${esc(SIGNATURE.mobileTel)}"
               style="display:inline-block;padding:10px 0;font-family:${FONT};font-size:18px;
                      line-height:24px;mso-line-height-rule:exactly;font-weight:600;color:${C.deep};
                      text-decoration:none">${esc(SIGNATURE.mobile)}</a>
          </div>
        </td></tr>`
}

// The same signature as plain text, for the text/plain part.
//
// THIS IS NOT COSMETIC, IT IS THE SIGN-OFF. The campaign templates used to end
// "Cheers, / Josh Micallef / Urban Tree Services" in the body copy, which read
// as a double sign-off next to signatureHtml() and has been taken out of the
// templates. signatureHtml() is HTML-only, so with the copy's sign-off gone
// the text/plain part would otherwise simply stop mid-air above the compliance
// footer. The renderer has to supply the sign-off to BOTH parts, and this is
// the text half of that. Do not delete one without the other.
export function signatureText(): string {
  return [
    SIGNATURE.name,
    `${SIGNATURE.role}, ${COMPANY.shortName}`,
    SIGNATURE.quals,
    `M ${SIGNATURE.mobile}`,
    `W ${SIGNATURE.website}`,
  ].join('\n')
}

// Josh's real signature. Logo left, 2px green right-border on the logo cell,
// details right — the same block that goes out on his one-to-one mail, which
// is the point: this should read as a letter from a person the recipient has
// met. With images off it degrades to the alt text and four legible live-text
// lines, which is all the information that actually matters.
//
// The website link is deliberately NOT click-wrapped. It is identity, not a
// campaign CTA, and a tracker-wrapped href in a personal signature is exactly
// the tell we are trying not to leave.
// Takes the link wrapper so the website link in the sign-off is tracked and
// tagged like any other. It was the one prominent link in the email that went
// out bare — and since the CTA points at the same homepage, a click here is
// indistinguishable from a click on the button, except that it produced no
// click event and no attribution.
function signatureHtml(wrap: (u: string) => string = (u) => u): string {
  const detail = `font-family:${FONT};font-size:12px;line-height:1.65;color:${C.muted}`
  return `
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:26px 32px 4px 32px">
          <div style="height:1px;line-height:1px;font-size:1px;background-color:${C.rule}">&nbsp;</div>
        </td></tr>
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:22px 32px 26px 32px">
          <table cellpadding="0" cellspacing="0" role="presentation"><tr>
            <td valign="middle" style="padding:0 18px 0 0;border-right:2px solid ${C.green}">
              <img src="${esc(logoUrl())}" width="${SIG_LOGO_W}" height="${SIG_LOGO_H}" alt="Urban Tree Services"
                   style="display:block;border:0;outline:none;text-decoration:none">
            </td>
            <td valign="middle" style="padding:0 0 0 18px">
              <div style="font-family:${FONT};font-size:15px;line-height:1.4;font-weight:600;color:${C.ink}">${esc(SIGNATURE.name)}</div>
              <div style="font-family:${FONT};font-size:12px;line-height:1.6;letter-spacing:1px;
                          text-transform:uppercase;color:${C.green}">${esc(SIGNATURE.role)}</div>
              <div style="font-family:${FONT};font-size:10px;line-height:1.6;color:${C.faint}">${esc(SIGNATURE.quals)}</div>
              <div style="${detail};margin-top:6px"><span style="color:${C.green}">M</span> ${esc(SIGNATURE.mobile)}</div>
              <div style="${detail}"><span style="color:${C.green}">W</span>
                <a href="${esc(wrap(SIGNATURE.websiteUrl))}" style="color:${C.muted};text-decoration:none">${esc(SIGNATURE.website)}</a></div>
            </td>
          </tr></table>
        </td></tr>`
}

// One body cell of the column. Returns '' for empty copy so an absent half of
// a split body does not leave a stray padded row behind.
function bodyCellHtml(inner: string, padding: string): string {
  if (!inner.trim()) return ''
  return `
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:${padding};
                       font-family:${FONT};font-size:16px;line-height:1.7;color:${C.body}">
          ${inner}
        </td></tr>`
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Is this paragraph nothing but the CTA link — the bare URL on a line of its
// own, optionally with the CTA label and some punctuation around it?
//
// It matters because the composer refuses to send unless the body already
// contains cta_url verbatim, so a campaign nearly always carries the link that
// way. Rendering the button as well would put the same destination in the
// letter twice. A URL used mid-sentence is prose and is not this.
function isBareCtaParagraph(p: string, ctaUrl: string, ctaLabel: string): boolean {
  const t = p.trim()
  if (!ctaUrl || !t.includes(ctaUrl)) return false
  let rest = t.split(ctaUrl).join(' ')
  if (ctaLabel) rest = rest.replace(new RegExp(escapeRe(ctaLabel), 'gi'), ' ')
  return rest.replace(/[\s:>»\-–—.]+/g, '') === ''
}

// Split the body around that paragraph, so the button can be rendered exactly
// where the author put the link rather than bolted on after the sign-off. A
// letter that ends "Cheers, Josh" and THEN shows a button reads like a
// template wrapped around someone's writing; a button sitting where the
// sentence was already pointing at it reads like the letter it is.
//
// HTML only. The plain-text part keeps the body verbatim, because there the
// bare URL IS the call to action.
function splitBodyAtCta(body: string, ctaUrl: string, ctaLabel: string): { before: string; after: string } {
  const paras = body.split(/\n{2,}/)
  const bare = paras.map(p => isBareCtaParagraph(p, ctaUrl, ctaLabel))
  const at = bare.indexOf(true)
  if (at === -1) return { before: body, after: '' }
  const keep = (from: number, to: number) =>
    paras.slice(from, to).filter((_, i) => !bare[from + i]).join('\n\n')
  return { before: keep(0, at), after: keep(at + 1, paras.length) }
}

// Render one campaign for one contact. `trackToken` is the campaign_sends
// row's per-send secret; pass null for previews (no tracking, no pixel).
export function renderCampaignEmail(
  campaign: Campaign,
  contact: Partial<Contact>,
  trackToken: string | null,
): RenderedEmail {
  const merge     = mergeValues(campaign, contact)
  const unsub     = unsubscribeUrl(contact)
  const unsubPost = unsubscribePostUrl(contact)
  const wrap      = makeLinkWrapper(trackToken, campaign.name ?? null, unsub, unsubPost)

  const subject   = applyMerge(campaign.subject, merge).trim()
  const preheader = applyMerge(campaign.preheader ?? '', merge).trim()
  const body      = applyMerge(campaign.body, merge)

  const ctaLabel = applyMerge(campaign.cta_label ?? '', merge).trim()
  const ctaUrl   = (campaign.cta_url ?? '').trim()
  const footer   = complianceFooter(campaign, contact, unsub)

  // The composer refuses to send unless the body already contains cta_url
  // verbatim, so appending it again put the same link in the email twice —
  // once in the copy, once on its own line underneath. Only append it when the
  // copy doesn't already carry it.
  const ctaInBody = !!ctaUrl && body.includes(ctaUrl)
  const appendCta = !!ctaUrl && !ctaInBody

  // ── plain text part ──
  // Deliberately NOT click-wrapped. The whole premise of this email is that it
  // reads as a personal note from Josh, and a raw
  // https://<project>.supabase.co/functions/v1/campaign-track?c=…&u=… sitting
  // in the text is exactly the tell that gives it away as a blast — and it's
  // the one link a suspicious recipient actually eyeballs. We lose text-part
  // click attribution; the HTML part still covers the large majority of reads.
  //
  // The sign-off comes from signatureText(), not from the copy — see the note
  // on that function. Order is body, then the CTA line if the copy did not
  // already carry it, then the signature, then the compliance footer.
  const textParts = [body.trim()]
  if (appendCta) textParts.push(`${ctaLabel || 'More info'}: ${ctaUrl}`)
  textParts.push(signatureText())
  textParts.push(footer.text)
  const text = textParts.join('\n\n')

  // ── HTML part: a letter on letterhead ──
  // Unlike the text part, the HTML always gets a real button. In the usual
  // case — the copy already carries the link on a line of its own, because the
  // composer insists on it — the body is SPLIT at that line and the button
  // takes its place, so the destination appears once and exactly where the
  // author put it. When there is no such line the button simply follows the
  // copy. Either way `bodyRest` is '' when there is nothing after it.
  const split    = splitBodyAtCta(body, ctaUrl, ctaLabel)
  const bodyTop  = bodyCellHtml(linkifyHtml(split.before, wrap, LINK_STYLE), '26px 32px 6px 32px')
  const bodyRest = bodyCellHtml(linkifyHtml(split.after,  wrap, LINK_STYLE), '16px 32px 6px 32px')
  const ctaBlock = ctaUrl
    ? ctaHtmlBlock(ctaLabel || 'More info', wrap(ctaUrl), ctaUrl)
    : callOnlyHtmlBlock()

  // Inbox preview text. Hidden in the body, padded so the client doesn't pull
  // the first line of copy in after it.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`
    : ''
  const pixelHtml = trackToken
    ? `<img src="${esc(openPixelUrl(trackToken))}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    : ''

  // NOTE TO WHOEVER EDITS THIS NEXT: there is no `color-scheme: light dark`
  // here, and that is deliberate — see the DESIGN NOTES at the top of the
  // file. Apple Mail only starts applying dark treatment once it is declared,
  // and half-declaring it renders worse than not declaring it at all. Dark
  // mode is handled by the light plate under the logo and by keeping every
  // colour mid-tone, which needs no client support.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${esc(subject)}</title>
<!-- No color-scheme declaration on purpose: see campaign.ts DESIGN NOTES. -->
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  img{-ms-interpolation-mode:bicubic}
  /* Stop iOS recolouring the phone number in the signature to its own blue. */
  a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important}
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.canvas}">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="${C.canvas}" style="background-color:${C.canvas}">
    <tr><td align="center" style="padding:24px 16px">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" align="center"
             bgcolor="${C.plate}" style="max-width:600px;width:100%;background-color:${C.plate}">
${letterheadHtml()}
${bodyTop}
${ctaBlock}
${bodyRest}
${signatureHtml(wrap)}
        <tr><td bgcolor="${C.plate}" style="background-color:${C.plate};padding:0 32px 30px 32px;
                       font-family:${FONT}">
          ${footer.html}
        </td></tr>
      </table>
    </td></tr>
  </table>
  ${pixelHtml}
</body>
</html>`

  return { subject, html, text, merge, unsubscribe_url: unsub, unsubscribe_post_url: unsubPost }
}

// ── Resend ──────────────────────────────────────────────────────────────────

// List-Unsubscribe + One-Click is the single cheapest deliverability win there
// is: Gmail and Outlook surface a native unsubscribe button instead of leaving
// people to hit "report spam", which is what actually damages a sending domain.
// A send that failed, and whether it is worth trying again. Rate limits (429),
// provider 5xx and network errors are the provider having a bad minute — the
// recipient is fine and the row must go back in the queue. A 4xx that isn't 429
// is us: a bad address, a rejected domain. Retrying that just burns the queue.
export class SendError extends Error {
  transient: boolean
  status?: number
  constructor(message: string, opts: { transient: boolean; status?: number }) {
    super(message)
    this.name = 'SendError'
    this.transient = opts.transient
    this.status = opts.status
  }
}

export function isTransientError(err: unknown): boolean {
  return !!err && (err as SendError).transient === true
}

export const RESEND_KEY_MISSING =
  'RESEND_API_KEY secret not set — add it in Supabase Dashboard → Settings → Secrets'

export async function sendViaResend(opts: {
  campaign: Campaign
  to: string
  rendered: RenderedEmail
}): Promise<{ id: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new SendError(RESEND_KEY_MISSING, { transient: false })

  const { campaign, to, rendered } = opts
  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:     `${campaign.from_name} <${campaign.from_email}>`,
      reply_to: campaign.reply_to,
      to,
      subject:  rendered.subject,
      html:     rendered.html,
      text:     rendered.text,
      headers: {
        // The HTTPS URI is the campaign-unsubscribe function, which honours a
        // bare POST — not the SPA confirmation page, which can't. The visible
        // link in the footer still goes to the nice page for humans.
        'List-Unsubscribe': `<${rendered.unsubscribe_post_url}>, <mailto:${COMPANY.email}?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
    })
  } catch (err) {
    // DNS, TLS, connection reset, timeout — nothing to do with this recipient.
    throw new SendError(`Could not reach Resend: ${(err as Error).message}`, { transient: true })
  }

  const detail = await res.json().catch(() => ({}))
  if (!res.ok) {
    const transient = res.status === 429 || res.status >= 500
    throw new SendError(
      (detail as { message?: string }).message ?? `Resend API ${res.status}`,
      { transient, status: res.status },
    )
  }
  return { id: (detail as { id?: string }).id ?? '' }
}

// ── Audience ────────────────────────────────────────────────────────────────

export interface AudienceFilter {
  min_months_since_job?: number
  max_months_since_job?: number
  services?: string[]
  suburbs?: string[]
  min_job_count?: number
  min_lifetime_value?: number
  limit?: number
}

// PostgREST caps every response at db.max_rows (supabase/config.toml sets 1000),
// so a bare .limit(5000) silently returned 1000 rows and the other 4000 people
// were never queued. Everything below pages in max_rows-sized windows instead.
const AUDIENCE_PAGE = 1000

// Ids per `in.(…)` filter. Kept modest so the anti-join below never builds a
// URL long enough to be truncated or rejected.
const ID_CHUNK = 200

// Build the audience query. ALWAYS reads campaign_audience_eligible, never
// marketing_contacts — the view is where the unsubscribe/suppression/consent
// exclusions live, and routing every send through it is what makes it
// impossible to mail someone who has opted out.
function audienceQuery(
  supabase: SupabaseClient,
  campaign: Campaign,
  select: string,
  opts?: { count?: 'exact'; head?: boolean },
) {
  const f = (campaign.audience ?? {}) as AudienceFilter

  let q = opts
    ? supabase.from('campaign_audience_eligible').select(select, opts)
    : supabase.from('campaign_audience_eligible').select(select)

  if (typeof f.min_months_since_job === 'number') q = q.gte('months_since_job', f.min_months_since_job)
  if (typeof f.max_months_since_job === 'number') q = q.lte('months_since_job', f.max_months_since_job)
  if (Array.isArray(f.services) && f.services.length)  q = q.overlaps('services', f.services)
  if (Array.isArray(f.suburbs)  && f.suburbs.length)   q = q.in('suburb', f.suburbs)
  if (typeof f.min_job_count === 'number')      q = q.gte('job_count', f.min_job_count)
  if (typeof f.min_lifetime_value === 'number') q = q.gte('lifetime_value', f.min_lifetime_value)

  // Most-recent customers first, so a capped run mails the warmest part of the
  // list rather than an arbitrary slice. The `id` tiebreak makes the order
  // total, which is what lets us page it safely.
  return q.order('last_job_at', { ascending: false, nullsFirst: false })
          .order('id', { ascending: true })
}

// How many contacts this campaign's filter matches right now (respecting an
// explicit audience.limit). Used to tell "the day's cap stopped us" apart from
// "there is genuinely nobody left".
export async function countAudience(supabase: SupabaseClient, campaign: Campaign): Promise<number> {
  const { count, error } = await audienceQuery(supabase, campaign, 'id', { count: 'exact', head: true })
  if (error) throw new Error(`Audience count failed: ${error.message}`)
  const f = (campaign.audience ?? {}) as AudienceFilter
  const total = count ?? 0
  return typeof f.limit === 'number' && f.limit > 0 ? Math.min(total, f.limit) : total
}

// Which of these contacts already have a campaign_sends row for this campaign?
// Asked of the database in ID_CHUNK-sized `in.(…)` filters — an anti-join done
// in SQL, one page at a time, rather than pulling the whole send log into
// memory to diff it.
async function alreadyQueuedIds(
  supabase: SupabaseClient, campaignId: string, ids: string[],
): Promise<Set<string>> {
  const found = new Set<string>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK)
    const { data, error } = await supabase
      .from('campaign_sends')
      .select('contact_id')
      .eq('campaign_id', campaignId)
      .in('contact_id', chunk)
    if (error) throw new Error(`Reading queued recipients failed: ${error.message}`)
    for (const r of (data ?? []) as { contact_id: string }[]) found.add(r.contact_id)
  }
  return found
}

// Count campaign_sends rows for a campaign, optionally by status.
export async function countSendRows(
  supabase: SupabaseClient, campaignId: string, statuses?: string[],
): Promise<number> {
  let q = supabase.from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
  if (statuses && statuses.length) q = q.in('status', statuses)
  const { count, error } = await q
  if (error) throw new Error(`Counting recipients failed: ${error.message}`)
  return count ?? 0
}

// Eligible contacts this campaign has never had a row for. The audience is
// paged and each page is anti-joined against campaign_sends, so a run picks up
// exactly where the last one stopped — which is what makes a campaign truncated
// by the daily cap resume tomorrow instead of re-fetching the same top-N and
// queueing nobody.
export async function resolveUnqueuedAudience(
  supabase: SupabaseClient,
  campaign: Campaign,
  need: number,
): Promise<{ contacts: Contact[]; exhausted: boolean }> {
  if (!(need > 0)) return { contacts: [], exhausted: false }

  const f = (campaign.audience ?? {}) as AudienceFilter
  const ceiling = typeof f.limit === 'number' && f.limit > 0 ? f.limit : Infinity

  const out: Contact[] = []
  let scanned = 0
  let exhausted = false

  for (let from = 0; out.length < need; from += AUDIENCE_PAGE) {
    const room = ceiling === Infinity ? AUDIENCE_PAGE : Math.max(0, ceiling - scanned)
    const want = Math.min(AUDIENCE_PAGE, room)
    if (want <= 0) { exhausted = true; break }

    const { data, error } = await audienceQuery(supabase, campaign, CAMPAIGN_CONTACT_COLUMNS)
      .range(from, from + want - 1)
    if (error) throw new Error(`Audience query failed: ${error.message}`)

    const page = (data ?? []) as Contact[]
    scanned += page.length
    if (page.length === 0) { exhausted = true; break }

    const already = await alreadyQueuedIds(supabase, campaign.id, page.map(c => c.id))
    for (const c of page) {
      if (already.has(c.id)) continue
      out.push(c)
      if (out.length >= need) break
    }

    if (page.length < want) { exhausted = true; break }
  }

  return { contacts: out.slice(0, need), exhausted }
}

// Kept for callers that want the plain audience (previews, counts). Paged, so
// it is no longer silently clipped to max_rows.
export async function resolveAudience(
  supabase: SupabaseClient,
  campaign: Campaign,
  hardLimit?: number,
): Promise<Contact[]> {
  const f = (campaign.audience ?? {}) as AudienceFilter
  const limits = [f.limit, hardLimit].filter((n): n is number => typeof n === 'number' && n > 0)
  const ceiling = limits.length ? Math.min(...limits) : Infinity

  const out: Contact[] = []
  for (let from = 0; out.length < ceiling; from += AUDIENCE_PAGE) {
    const want = Math.min(AUDIENCE_PAGE, ceiling === Infinity ? AUDIENCE_PAGE : ceiling - out.length)
    const { data, error } = await audienceQuery(supabase, campaign, CAMPAIGN_CONTACT_COLUMNS)
      .range(from, from + want - 1)
    if (error) throw new Error(`Audience query failed: ${error.message}`)
    const page = (data ?? []) as Contact[]
    out.push(...page)
    if (page.length < want) break
  }
  return out
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface SendOptions {
  limit?: number          // cap this run's recipients (on top of the daily cap)
  deadlineMs?: number     // stop cleanly before the function times out
  gapMs?: number          // spacing between sends; ~2/sec by default
  staleClaimMs?: number   // how long a 'sending' row may sit before it is reclaimed
}

export interface SendSummary {
  campaign_id: string
  queued: number          // rows added to the queue by this run
  sent: number
  failed: number          // permanently failed this run
  retrying: number        // transient failures put back in the queue this run
  skipped: number
  reclaimed: number       // stale 'sending' rows returned to the queue
  remaining: number       // rows still queued or in flight for this campaign
  unqueued: number        // eligible contacts with no row yet (tomorrow's work)
  status: string
  capped: boolean         // stopped by the daily cap, not by running out of people
  message?: string
}

// Thrown when a campaign's filter matches nobody. Deliberately its own type:
// "nobody matched" is a mistake to be corrected in the composer, not a send
// that finished, and it must never leave the campaign marked 'sent' (which
// would then make campaign-send refuse it forever).
export class NoRecipientsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoRecipientsError'
  }
}

export function isNoRecipientsError(err: unknown): boolean {
  return err instanceof NoRecipientsError || (err as Error)?.name === 'NoRecipientsError'
}

// A row claimed for sending but never resolved (the function was killed
// mid-flight) is reclaimed after this long. Longer than the ~150s an edge
// function can live, so it can never steal a row from a run still working it.
const STALE_CLAIM_MS = 10 * 60 * 1000

// Same idea one level up: how long a campaign run may hold its lock.
const RUN_LOCK_STALE_MS = 10 * 60 * 1000

// A recipient gets this many goes before a transient failure is called
// permanent, with this backoff between them.
const MAX_SEND_ATTEMPTS = 5
const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]

// Consecutive transient failures that mean "the provider is down, stop hammering
// it". The queue is durable; the next tick will carry on.
const OUTAGE_STREAK = 5

function backoffMs(attempt: number): number {
  return RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length) - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1]
}

async function countSentToday(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase
    .from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', nzDayStartIso())
  return count ?? 0
}

async function readSetting(supabase: SupabaseClient, key: string): Promise<unknown> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  return data?.value
}

export async function sendEnabled(supabase: SupabaseClient): Promise<boolean> {
  return (await readSetting(supabase, 'campaign_send_enabled')) === true
}

export async function dailyCap(supabase: SupabaseClient): Promise<number> {
  const raw = await readSetting(supabase, 'campaign_daily_cap')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 200
}

// ── Run lock ────────────────────────────────────────────────────────────────
// One run per campaign at a time. Without this, "Send now" and the cron tick
// can both be inside processQueue for the same campaign, each holding its own
// in-memory copy of the daily budget — so the cap gets spent twice. Rows are
// still individually claimed as well; this just stops the budget being
// double-counted (and stops two runs racing on the same batch).
export async function claimCampaignRun(
  supabase: SupabaseClient, campaignId: string, staleMs = RUN_LOCK_STALE_MS,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const { data, error } = await supabase
    .from('campaigns')
    .update({ run_lock_at: new Date().toISOString() })
    .eq('id', campaignId)
    .or(`run_lock_at.is.null,run_lock_at.lt.${cutoff}`)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Could not claim the campaign: ${error.message}`)
  return !!data
}

export async function releaseCampaignRun(supabase: SupabaseClient, campaignId: string): Promise<void> {
  const { error } = await supabase.from('campaigns').update({ run_lock_at: null }).eq('id', campaignId)
  if (error) console.error('campaign run lock: release failed', { campaign_id: campaignId, message: error.message })
}

// Queue the resolved audience. ON CONFLICT (campaign_id, contact_id) DO NOTHING
// so re-running a partly-sent campaign tops up the queue instead of duplicating
// recipients. Callers pass contacts from resolveUnqueuedAudience(), which has
// already excluded everyone with a row — the upsert is the backstop, not the
// mechanism.
export async function queueAudience(
  supabase: SupabaseClient,
  campaign: Campaign,
  contacts: Contact[],
): Promise<number> {
  if (contacts.length === 0) return 0
  let inserted = 0
  for (let i = 0; i < contacts.length; i += AUDIENCE_PAGE) {
    const rows = contacts.slice(i, i + AUDIENCE_PAGE).map(c => ({
      campaign_id: campaign.id,
      contact_id:  c.id,
      email:       c.email,
      status:      'queued',
    }))
    const { data, error } = await supabase
      .from('campaign_sends')
      .upsert(rows, { onConflict: 'campaign_id,contact_id', ignoreDuplicates: true })
      .select('id')
    if (error) throw new Error(`Queueing failed: ${error.message}`)
    inserted += data?.length ?? 0
  }
  return inserted
}

// Put rows back that a dead run claimed and never resolved. Without this they
// sit in 'sending' forever: nothing re-queues them, and the old completion
// check only counted 'queued', so the campaign happily declared itself finished
// with those people never mailed.
export async function reclaimStaleClaims(
  supabase: SupabaseClient, campaignId: string, staleMs = STALE_CLAIM_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - staleMs).toISOString()
  const { data, error } = await supabase
    .from('campaign_sends')
    .update({ status: 'queued', claimed_at: null })
    .eq('campaign_id', campaignId)
    .eq('status', 'sending')
    .or(`claimed_at.is.null,claimed_at.lt.${cutoff}`)
    .select('id')
  if (error) {
    console.error('campaign send: reclaiming stale rows failed', { campaign_id: campaignId, message: error.message })
    return 0
  }
  return data?.length ?? 0
}

// Work the queue. Each row is claimed with an UPDATE guarded on status='queued'
// (the same trick social-scheduler uses) so two concurrent runs — say the cron
// and someone hitting "Send now" — can never mail the same person twice.
export async function processQueue(
  supabase: SupabaseClient,
  campaign: Campaign,
  opts: SendOptions = {},
): Promise<SendSummary> {
  const gap      = opts.gapMs ?? 550          // ~2 sends/sec — Resend free tier
  const deadline = Date.now() + (opts.deadlineMs ?? 110_000)

  // Checked once, up front: without the key every single row would "fail
  // permanently" one at a time and the campaign would end up marked sent with
  // nothing delivered. A missing secret is a configuration error — leave the
  // queue intact and surface it.
  if (!Deno.env.get('RESEND_API_KEY')) throw new Error(RESEND_KEY_MISSING)

  const reclaimed = await reclaimStaleClaims(supabase, campaign.id, opts.staleClaimMs)

  const cap       = await dailyCap(supabase)
  let   sentToday = await countSentToday(supabase)
  const runLimit  = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : Infinity

  let sent = 0, failed = 0, retrying = 0, skipped = 0
  let allowance = Math.max(0, Math.min(cap - sentToday, runLimit))
  let transientStreak = 0
  let outage = false

  while (allowance > 0 && Date.now() < deadline && !outage) {
    const nowIso = new Date().toISOString()
    const { data: batch, error: batchErr } = await supabase
      .from('campaign_sends')
      .select('id, contact_id, email, attempts')
      .eq('campaign_id', campaign.id)
      .eq('status', 'queued')
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('queued_at', { ascending: true })
      .limit(Math.min(50, allowance))
    if (batchErr) throw new Error(`Reading the send queue failed: ${batchErr.message}`)
    if (!batch || batch.length === 0) break

    // Re-read the contacts through the eligible view: someone may have
    // unsubscribed between queueing and sending, and they must drop out.
    const ids = (batch as { contact_id: string }[]).map(b => b.contact_id)
    const { data: eligible, error: eligErr } = await supabase
      .from('campaign_audience_eligible')
      .select(CAMPAIGN_CONTACT_COLUMNS)
      .in('id', ids)
    if (eligErr) throw new Error(`Re-checking the audience failed: ${eligErr.message}`)
    const byId = new Map<string, Contact>()
    for (const c of (eligible ?? []) as Contact[]) byId.set(c.id, c)

    let progress = 0

    for (const row of batch as { id: string; contact_id: string }[]) {
      if (allowance <= 0) break
      if (Date.now() >= deadline) break

      // Claim the row so a concurrent run skips it. claimed_at is what lets a
      // later run tell "in flight" from "abandoned".
      const { data: claimed, error: claimErr } = await supabase
        .from('campaign_sends')
        .update({ status: 'sending', claimed_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'queued')
        .select('id, contact_id, email, track_token, attempts')
        .maybeSingle()
      if (claimErr) {
        console.error('campaign send: claiming a row failed', { send_id: row.id, message: claimErr.message })
        continue
      }
      if (!claimed) continue
      progress++

      const contact = byId.get(claimed.contact_id)
      if (!contact) {
        const { error: skipErr } = await supabase.from('campaign_sends').update({
          status: 'skipped',
          skip_reason: 'No longer in the eligible audience (unsubscribed, bounced or suppressed)',
          claimed_at: null,
        }).eq('id', claimed.id)
        if (skipErr) console.error('campaign send: marking a row skipped failed', { send_id: claimed.id, message: skipErr.message })
        skipped++
        continue
      }

      const attempt = (claimed.attempts ?? 0) + 1

      try {
        const rendered = renderCampaignEmail(campaign, contact, claimed.track_token)
        const { id: providerId } = await sendViaResend({ campaign, to: contact.email, rendered })

        const { error: updErr } = await supabase.from('campaign_sends').update({
          status:          'sent',
          provider_id:     providerId,
          subject_sent:    rendered.subject,
          body_sent:       rendered.text,
          merge_data:      rendered.merge,
          error:           null,
          attempts:        attempt,
          claimed_at:      null,
          next_attempt_at: null,
          sent_at:         new Date().toISOString(),
        }).eq('id', claimed.id)
        // The email has already gone out at this point. A failed write here
        // used to be completely invisible; at minimum it must be shouted about,
        // because the row will read 'sending' and be reclaimed later — and the
        // compliance record of what we sent is missing.
        if (updErr) {
          console.error('campaign send: message sent but the row could not be updated', {
            campaign_id: campaign.id, send_id: claimed.id, provider_id: providerId, message: updErr.message,
          })
        }

        const { error: evErr } = await supabase.from('campaign_events').insert({
          campaign_id: campaign.id,
          send_id:     claimed.id,
          contact_id:  contact.id,
          kind:        'sent',
          meta:        { provider_id: providerId, attempt },
        })
        if (evErr) console.error('campaign send: logging the sent event failed', { send_id: claimed.id, message: evErr.message })

        sent++
        allowance--
        sentToday++
        transientStreak = 0
      } catch (err) {
        const message   = (err as Error).message
        const transient = isTransientError(err)
        const willRetry = transient && attempt < MAX_SEND_ATTEMPTS
        const stamp     = new Date().toISOString()

        // A transient failure goes back in the queue with a backoff, so a
        // provider outage costs us a delay, not the recipient.
        const patch = willRetry
          ? {
              status:          'queued',
              attempts:        attempt,
              error:           message,
              claimed_at:      null,
              last_error_at:   stamp,
              next_attempt_at: new Date(Date.now() + backoffMs(attempt)).toISOString(),
            }
          : {
              status:        'failed',
              attempts:      attempt,
              error:         message,
              claimed_at:    null,
              last_error_at: stamp,
            }
        const { error: updErr } = await supabase.from('campaign_sends').update(patch).eq('id', claimed.id)
        if (updErr) {
          console.error('campaign send: recording a failure failed', {
            campaign_id: campaign.id, send_id: claimed.id, message: updErr.message, original_error: message,
          })
        }

        const { error: evErr } = await supabase.from('campaign_events').insert({
          campaign_id: campaign.id,
          send_id:     claimed.id,
          contact_id:  contact.id,
          kind:        'failed',
          meta:        { error: message, attempt, transient, will_retry: willRetry },
        })
        if (evErr) console.error('campaign send: logging the failed event failed', { send_id: claimed.id, message: evErr.message })

        if (willRetry) retrying++
        else failed++

        if (transient) {
          transientStreak++
          if (transientStreak >= OUTAGE_STREAK) { outage = true; break }
        } else {
          transientStreak = 0
        }
      }

      await sleep(gap)
    }

    // No row in the whole batch could be claimed — another run owns them.
    // Without this the outer loop would re-read the same rows until the
    // deadline.
    if (progress === 0) break

    // Re-read the day's spend between batches rather than trusting the copy we
    // took at the top: another campaign may be sending at the same time, and
    // the cap is a whole-domain limit, not a per-campaign one.
    sentToday = await countSentToday(supabase)
    allowance = Math.max(0, Math.min(cap - sentToday, runLimit - sent))
  }

  // ── Where did we get to? ──────────────────────────────────────────────────
  // Three different "not finished" states, which the old code conflated into
  // one and then called 'sent':
  //   remaining — rows queued (incl. waiting on a retry) or still in flight
  //   unqueued  — eligible contacts this campaign has never had a row for
  //   capReached — the day's allowance is gone
  const queuedLeft  = await countSendRows(supabase, campaign.id, ['queued'])
  const sendingLeft = await countSendRows(supabase, campaign.id, ['sending'])
  const totalRows   = await countSendRows(supabase, campaign.id)
  const audience    = await countAudience(supabase, campaign)
  const remaining   = queuedLeft + sendingLeft

  // (eligible now) − (rows ever made) can only UNDERSTATE how many are left to
  // queue: a contact who was queued and has since unsubscribed is counted in
  // the rows but not in the audience. So a positive number is trustworthy, a
  // zero is not — and zero is the number that decides whether this campaign is
  // finished. When it says zero, ask the database outright: is there anyone
  // eligible with no row? One page and an anti-join, and only on the last run.
  const estimate = Math.max(0, audience - totalRows)
  const drained  = estimate > 0
    ? false
    : (await resolveUnqueuedAudience(supabase, campaign, 1)).contacts.length === 0
  const unqueued   = drained ? 0 : Math.max(1, estimate)
  const capReached = cap - sentToday <= 0
  const capped     = capReached && (remaining > 0 || unqueued > 0)

  const { data: stats } = await supabase.rpc('campaign_stats', { p_campaign_id: campaign.id })

  let status = 'sending'
  // Only 'sent' when the audience is genuinely drained: nothing queued, nothing
  // in flight, nobody left to queue, and no provider outage in progress.
  if (remaining === 0 && unqueued === 0 && !outage) {
    // …and "drained" is not the same as "delivered". If every recipient was
    // rejected outright — a wrong from-domain, a revoked key — the campaign is
    // finished but it is a failure, and calling it 'sent' would hide that.
    const totals = (stats ?? {}) as { sent?: number; failed?: number }
    const nothingDelivered = (totals.sent ?? 0) === 0 && (totals.failed ?? 0) > 0
    const done = nothingDelivered ? 'failed' : 'sent'
    const { error } = await supabase.from('campaigns').update({
      status:  done,
      ...(nothingDelivered ? {} : { sent_at: new Date().toISOString() }),
      stats:   stats ?? {},
    }).eq('id', campaign.id)
    if (error) console.error('campaign send: marking the campaign finished failed', { campaign_id: campaign.id, message: error.message })
    else status = done
  } else {
    const { error } = await supabase.from('campaigns').update({ stats: stats ?? {} }).eq('id', campaign.id)
    if (error) console.error('campaign send: updating campaign stats failed', { campaign_id: campaign.id, message: error.message })
  }

  const messages: string[] = []
  if (capped) {
    messages.push(
      `Daily send cap of ${cap} reached — ${(remaining + unqueued).toLocaleString('en-NZ')} still to go, `
      + 'they go out on the next run',
    )
  } else if (outage) {
    messages.push('Paused after repeated errors from the email provider — the rest will be retried automatically')
  } else if (remaining > 0 || unqueued > 0) {
    messages.push(`${(remaining + unqueued).toLocaleString('en-NZ')} still to send — the next run picks them up`)
  }
  if (reclaimed > 0) messages.push(`${reclaimed} stuck recipient${reclaimed === 1 ? '' : 's'} put back in the queue`)

  return {
    campaign_id: campaign.id,
    queued: 0, sent, failed, retrying, skipped, reclaimed,
    remaining,
    unqueued,
    status,
    capped,
    ...(messages.length ? { message: messages.join('. ') } : {}),
  }
}

// Queue the audience (if any is outstanding) then work the queue. Shared by
// campaign-send and campaign-scheduler so both take exactly the same path.
//
// Note what is queued: only as many people as today's remaining budget can
// actually be mailed. That is fine BECAUSE resolveUnqueuedAudience() skips
// everyone already in campaign_sends — tomorrow's run queues the next slice,
// and so on until the audience is drained. (Queueing the whole audience up
// front would work too, but it would commit the list to a filter evaluated
// today, and a big audience would be one giant insert.)
export async function runCampaign(
  supabase: SupabaseClient,
  campaign: Campaign,
  opts: SendOptions = {},
): Promise<SendSummary> {
  const cap      = await dailyCap(supabase)
  const budget   = Math.max(0, cap - (await countSentToday(supabase)))
  const runLimit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : Infinity
  const target   = Math.max(0, Math.min(budget, runLimit))

  // Nobody matched at all — that is a mistake in the audience filter, not a
  // finished campaign. Say so and leave the campaign alone; marking it 'sent'
  // would make campaign-send refuse it forever.
  const existingRows = await countSendRows(supabase, campaign.id)
  if (existingRows === 0 && (await countAudience(supabase, campaign)) === 0) {
    throw new NoRecipientsError(
      'No recipients matched this campaign\'s audience. Check the audience filters — '
      + 'nobody on the mailing list is both eligible and inside them.',
    )
  }

  let queued = 0
  if (target > 0) {
    const { contacts } = await resolveUnqueuedAudience(supabase, campaign, target)
    queued = await queueAudience(supabase, campaign, contacts)
  }

  // started_at records the first time this campaign ever went out, so it is
  // only stamped once; status flips to 'sending' on every run.
  const { error: startErr } = await supabase.from('campaigns')
    .update({ started_at: new Date().toISOString() })
    .eq('id', campaign.id).is('started_at', null)
  if (startErr) console.error('campaign send: stamping started_at failed', { campaign_id: campaign.id, message: startErr.message })
  const { error: statusErr } = await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign.id)
  if (statusErr) throw new Error(`Could not mark the campaign as sending: ${statusErr.message}`)

  const summary = await processQueue(supabase, campaign, opts)
  return { ...summary, queued }
}
