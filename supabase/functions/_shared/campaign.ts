// Shared campaign rendering + sending logic, used by both `campaign-send`
// (send/queue one campaign on demand, or send a test) and `campaign-scheduler`
// (send everything whose scheduled_at has come round). Keeping the merge-tag
// rendering, the compliance footer and the Resend call here means there is a
// single place where "what actually goes in the envelope" is decided — which
// matters, because campaign_sends stores a copy of it as the compliance record.
//
// DESIGN NOTES (why the email looks the way it does)
//   * The HTML part is a plain letter, not a marketing template. No hero image,
//     no columns, no big coloured button — a single inline text link for the
//     CTA. For a local trade business a personal-looking email from Josh both
//     converts better and clears spam filters that penalise template blasts.
//   * Every message ends with complianceFooter(): real legal name, physical
//     region, phone/email, the reason-for-receiving line, the unsubscribe link
//     and (when there is an offer) its terms and expiry. That is what the
//     Unsolicited Electronic Messages Act 2007 requires of a commercial
//     message, and the Fair Trading Act requires of a discount claim.
//   * The audience is ALWAYS resolved from the `campaign_audience_eligible`
//     view, never from marketing_contacts, so unsubscribes and suppressions
//     cannot be missed by a hand-written filter.
//   * Every http(s) link in the body is wrapped in the click tracker — except
//     the unsubscribe link, which is never tracked or wrapped.
//
// Required Edge Function secrets:
//   RESEND_API_KEY   — from resend.com
//   APP_URL          — e.g. https://app.urbantreeservices.net (unsubscribe page)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected
// Optional:
//   CAMPAIGN_TRACK_URL — override for the campaign-track endpoint; defaults to
//                        ${SUPABASE_URL}/functions/v1/campaign-track

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

export function b64urlEncode(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  return atob(pad + '='.repeat((4 - (pad.length % 4)) % 4))
}

function nzDate(d: string | null): string {
  if (!d) return ''
  // DATE columns arrive as 'YYYY-MM-DD'; anchor at midday UTC so the NZ-local
  // rendering can't slip to the previous day.
  const dt = new Date(`${d.slice(0, 10)}T12:00:00Z`)
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-NZ', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Pacific/Auckland',
  })
}

// Start of the current NZ calendar day, as a UTC ISO string. Used for the daily
// send cap, which is about protecting the sending domain's reputation and so
// should follow the office's day, not UTC's.
export function nzDayStartIso(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Auckland', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p: Record<string, string> = {}
  for (const part of dtf.formatToParts(now)) if (part.type !== 'literal') p[part.type] = part.value
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second)
  const offset = asUtc - now.getTime()
  const localMidnight = Date.UTC(+p.year, +p.month - 1, +p.day)
  return new Date(localMidnight - offset).toISOString()
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
export function applyMerge(input: string, values: Record<string, string>): string {
  return String(input ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) =>
    values[key.toLowerCase()] ?? '')
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
function makeLinkWrapper(trackToken: string | null, ...neverWrap: string[]) {
  return (url: string): string => {
    if (!trackToken) return url
    if (neverWrap.some(u => u && url.startsWith(u))) return url
    return `${trackBaseUrl()}?c=${encodeURIComponent(trackToken)}&u=${b64urlEncode(url)}`
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

const LINK_STYLE = 'color:#4A6741;text-decoration:underline'

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
  const wrap      = makeLinkWrapper(trackToken, unsub, unsubPost)

  const subject   = applyMerge(campaign.subject, merge).trim()
  const preheader = applyMerge(campaign.preheader ?? '', merge).trim()
  const body      = applyMerge(campaign.body, merge)

  const ctaLabel = applyMerge(campaign.cta_label ?? '', merge).trim()
  const ctaUrl   = (campaign.cta_url ?? '').trim()
  const footer   = complianceFooter(campaign, contact, unsub)

  // ── plain text part ──
  // Deliberately NOT click-wrapped. The whole premise of this email is that it
  // reads as a personal note from Josh, and a raw
  // https://<project>.supabase.co/functions/v1/campaign-track?c=…&u=… sitting
  // in the text is exactly the tell that gives it away as a blast — and it's
  // the one link a suspicious recipient actually eyeballs. We lose text-part
  // click attribution; the HTML part still covers the large majority of reads.
  const textParts = [body.trim()]
  if (ctaUrl) textParts.push(`${ctaLabel || 'More info'}: ${ctaUrl}`)
  textParts.push(footer.text)
  const text = textParts.join('\n\n')

  // ── HTML part: a letter, not a template ──
  const bodyHtml = linkifyHtml(body, wrap, LINK_STYLE)
  const ctaHtml  = ctaUrl
    ? `<p style="margin:0 0 18px"><a href="${esc(wrap(ctaUrl))}" style="${LINK_STYLE}">${esc(ctaLabel || ctaUrl)}</a></p>`
    : ''
  // Inbox preview text. Hidden in the body, padded so the client doesn't pull
  // the first line of copy in after it.
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>`
    : ''
  const pixelHtml = trackToken
    ? `<img src="${esc(openPixelUrl(trackToken))}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#ffffff">
  ${preheaderHtml}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff">
    <tr><td align="left" style="padding:24px 20px">
      <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%">
        <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Georgia,'Times New Roman',serif;
                       font-size:16px;line-height:1.65;color:#2C2416">
          ${bodyHtml}
          ${ctaHtml}
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
export async function sendViaResend(opts: {
  campaign: Campaign
  to: string
  rendered: RenderedEmail
}): Promise<{ id: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY secret not set — add it in Supabase Dashboard → Settings → Secrets')

  const { campaign, to, rendered } = opts
  const res = await fetch('https://api.resend.com/emails', {
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
  const detail = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(detail.message ?? `Resend API ${res.status}`)
  return { id: detail.id ?? '' }
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

// Resolve a campaign's audience. ALWAYS reads campaign_audience_eligible, never
// marketing_contacts — the view is where the unsubscribe/suppression/consent
// exclusions live, and routing every send through it is what makes it
// impossible to mail someone who has opted out.
export async function resolveAudience(
  supabase: SupabaseClient,
  campaign: Campaign,
  hardLimit?: number,
): Promise<Contact[]> {
  const f = (campaign.audience ?? {}) as AudienceFilter

  let q = supabase
    .from('campaign_audience_eligible')
    .select(CAMPAIGN_CONTACT_COLUMNS)

  if (typeof f.min_months_since_job === 'number') q = q.gte('months_since_job', f.min_months_since_job)
  if (typeof f.max_months_since_job === 'number') q = q.lte('months_since_job', f.max_months_since_job)
  if (Array.isArray(f.services) && f.services.length)  q = q.overlaps('services', f.services)
  if (Array.isArray(f.suburbs)  && f.suburbs.length)   q = q.in('suburb', f.suburbs)
  if (typeof f.min_job_count === 'number')      q = q.gte('job_count', f.min_job_count)
  if (typeof f.min_lifetime_value === 'number') q = q.gte('lifetime_value', f.min_lifetime_value)

  // Most-recent customers first, so a capped run mails the warmest part of the
  // list rather than an arbitrary slice.
  q = q.order('last_job_at', { ascending: false, nullsFirst: false }).order('id', { ascending: true })

  const limits = [f.limit, hardLimit].filter((n): n is number => typeof n === 'number' && n > 0)
  if (limits.length) q = q.limit(Math.min(...limits))
  else q = q.limit(5000)

  const { data, error } = await q
  if (error) throw new Error(`Audience query failed: ${error.message}`)
  return (data ?? []) as Contact[]
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface SendOptions {
  limit?: number          // cap this run's recipients (on top of the daily cap)
  deadlineMs?: number     // stop cleanly before the function times out
  gapMs?: number          // spacing between sends; ~2/sec by default
}

export interface SendSummary {
  campaign_id: string
  queued: number
  sent: number
  failed: number
  skipped: number
  remaining: number
  status: string
  capped: boolean
  message?: string
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

// Queue the resolved audience. ON CONFLICT (campaign_id, contact_id) DO NOTHING
// so re-running a partly-sent campaign tops up the queue instead of duplicating
// recipients.
export async function queueAudience(
  supabase: SupabaseClient,
  campaign: Campaign,
  contacts: Contact[],
): Promise<number> {
  if (contacts.length === 0) return 0
  const rows = contacts.map(c => ({
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

  const cap       = await dailyCap(supabase)
  let sentToday   = await countSentToday(supabase)
  let budget      = Math.max(0, cap - sentToday)
  if (typeof opts.limit === 'number' && opts.limit > 0) budget = Math.min(budget, opts.limit)

  let sent = 0, failed = 0, skipped = 0, capped = budget <= 0

  while (budget > 0 && Date.now() < deadline) {
    const { data: batch } = await supabase
      .from('campaign_sends')
      .select('id, contact_id, email')
      .eq('campaign_id', campaign.id)
      .eq('status', 'queued')
      .order('queued_at', { ascending: true })
      .limit(Math.min(50, budget))
    if (!batch || batch.length === 0) break

    // Re-read the contacts through the eligible view: someone may have
    // unsubscribed between queueing and sending, and they must drop out.
    const ids = batch.map(b => b.contact_id)
    const { data: eligible } = await supabase
      .from('campaign_audience_eligible')
      .select(CAMPAIGN_CONTACT_COLUMNS)
      .in('id', ids)
    const byId = new Map<string, Contact>()
    for (const c of (eligible ?? []) as Contact[]) byId.set(c.id, c)

    for (const row of batch) {
      if (budget <= 0) { capped = true; break }
      if (Date.now() >= deadline) break

      // Claim the row so a concurrent run skips it.
      const { data: claimed } = await supabase
        .from('campaign_sends')
        .update({ status: 'sending' })
        .eq('id', row.id)
        .eq('status', 'queued')
        .select('id, contact_id, email, track_token')
        .maybeSingle()
      if (!claimed) continue

      const contact = byId.get(claimed.contact_id)
      if (!contact) {
        await supabase.from('campaign_sends').update({
          status: 'skipped',
          skip_reason: 'No longer in the eligible audience (unsubscribed, bounced or suppressed)',
        }).eq('id', claimed.id)
        skipped++
        continue
      }

      try {
        const rendered = renderCampaignEmail(campaign, contact, claimed.track_token)
        const { id: providerId } = await sendViaResend({ campaign, to: contact.email, rendered })

        await supabase.from('campaign_sends').update({
          status:       'sent',
          provider_id:  providerId,
          subject_sent: rendered.subject,
          body_sent:    rendered.text,
          merge_data:   rendered.merge,
          error:        null,
          sent_at:      new Date().toISOString(),
        }).eq('id', claimed.id)

        await supabase.from('campaign_events').insert({
          campaign_id: campaign.id,
          send_id:     claimed.id,
          contact_id:  contact.id,
          kind:        'sent',
          meta:        { provider_id: providerId },
        })

        sent++
        budget--
        sentToday++
      } catch (err) {
        const message = (err as Error).message
        await supabase.from('campaign_sends').update({
          status: 'failed', error: message,
        }).eq('id', claimed.id)
        await supabase.from('campaign_events').insert({
          campaign_id: campaign.id,
          send_id:     claimed.id,
          contact_id:  contact.id,
          kind:        'failed',
          meta:        { error: message },
        })
        failed++
      }

      await sleep(gap)
    }
  }

  // Anything still queued means we hit the cap, the limit or the clock — the
  // campaign stays 'sending' and the next scheduler tick picks it up.
  const { count: remaining } = await supabase
    .from('campaign_sends')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'queued')

  const left = remaining ?? 0
  let status = 'sending'
  if (left === 0) {
    const { data: stats } = await supabase.rpc('campaign_stats', { p_campaign_id: campaign.id })
    await supabase.from('campaigns').update({
      status:  'sent',
      sent_at: new Date().toISOString(),
      stats:   stats ?? {},
    }).eq('id', campaign.id)
    status = 'sent'
  } else {
    const { data: stats } = await supabase.rpc('campaign_stats', { p_campaign_id: campaign.id })
    await supabase.from('campaigns').update({ stats: stats ?? {} }).eq('id', campaign.id)
  }

  return {
    campaign_id: campaign.id,
    queued: 0, sent, failed, skipped,
    remaining: left,
    status,
    capped,
    ...(capped ? { message: `Daily send cap of ${cap} reached — the rest goes out tomorrow` } : {}),
  }
}

// Queue the audience (if any is outstanding) then work the queue. Shared by
// campaign-send and campaign-scheduler so both take exactly the same path.
export async function runCampaign(
  supabase: SupabaseClient,
  campaign: Campaign,
  opts: SendOptions = {},
): Promise<SendSummary> {
  const cap    = await dailyCap(supabase)
  const budget = Math.max(0, cap - (await countSentToday(supabase)))
  const target = Math.min(...[budget, opts.limit].filter((n): n is number => typeof n === 'number' && n > 0))

  let queued = 0
  if (budget > 0) {
    const contacts = await resolveAudience(supabase, campaign, Number.isFinite(target) ? target : budget)
    queued = await queueAudience(supabase, campaign, contacts)
  }

  // started_at records the first time this campaign ever went out, so it is
  // only stamped once; status flips to 'sending' on every run.
  await supabase.from('campaigns')
    .update({ started_at: new Date().toISOString() })
    .eq('id', campaign.id).is('started_at', null)
  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaign.id)

  const summary = await processQueue(supabase, campaign, opts)
  return { ...summary, queued }
}
