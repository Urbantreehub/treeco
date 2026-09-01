// Pure helpers for the email campaigns (mailing list) programme. Dependency-free
// so the audience picker, the composer, the preview and the send gate all share
// one set of rules — and so the compliance rules can be unit-tested rather than
// living as scattered ifs inside a 600-line page.
//
// Nothing in here talks to Supabase. The page loads rows from
// `campaign_audience_eligible` and hands them to these functions.

// ── Merge tags ───────────────────────────────────────────────────────────────
// The only tags the sender understands. `example` drives the preview when we
// have no real contact to render against; `label` is what the composer shows.
export const MERGE_TAGS = [
  { tag: 'first_name',       label: 'First name',        example: 'Margaret' },
  { tag: 'last_name',        label: 'Last name',         example: 'Thompson' },
  { tag: 'suburb',           label: 'Suburb',            example: 'Karori' },
  // ⚠️ Must be a VERB phrase, not a noun phrase. summariseJob() in
  // supabase/functions/import-marketing-contacts/index.ts emits things like
  // "reduced the pōhutukawa out front" / "squared up the griselinia hedge",
  // because the templates interpolate it as "We {{last_job_summary}} for you
  // about 14 months ago". A noun-phrase example here renders the preview as
  // "We a crown reduction on the big oak for you", which reads as broken and
  // misrepresents what the real send will produce.
  { tag: 'last_job_summary', label: 'Their last job',    example: 'reduced the pōhutukawa out front' },
  { tag: 'months_since_job', label: 'Months since job',  example: '14' },
  { tag: 'offer_code',       label: 'Offer code',        example: 'WINTER15' },
  { tag: 'offer_percent',    label: 'Offer %',           example: '15' },
  { tag: 'offer_expires',    label: 'Offer expires',     example: '31 August 2026' },
]

export const MERGE_TAG_KEYS = MERGE_TAGS.map(t => t.tag)

// Human labels for the `services` array on a contact.
//
// These keys must cover every tag SERVICE_PATTERNS emits in
// supabase/functions/import-marketing-contacts/index.ts — an unlabelled tag
// renders as a raw slug in the audience filter. Order matches the importer's.
// Each label has to read correctly inside describeAudience's frame:
// "…who have had <label> done".
export const SERVICE_LABELS = {
  pruning:   'pruning',
  reduction: 'crown reductions',
  removal:   'tree removals',
  hedge:     'hedge work',
  stump:     'stump grinding',
  planting:  'planting',
  emergency: 'storm & emergency work',
}

// Badge colour + label per campaign status (mirrors STATUS_META in utils/marketing).
export const CAMPAIGN_STATUS = {
  draft:     { label: 'Draft',     bg: '#EEE',    fg: '#666' },
  scheduled: { label: 'Scheduled', bg: '#FDF3E3', fg: '#B87309' },
  sending:   { label: 'Sending…',  bg: '#E3F0FB', fg: '#1565C0' },
  sent:      { label: 'Sent',      bg: '#E8F0E6', fg: '#3A5C2E' },
  paused:    { label: 'Paused',    bg: '#F3EFEA', fg: '#777' },
  failed:    { label: 'Failed',    bg: '#FDECEA', fg: '#C0392B' },
}

// ── Preview rendering ────────────────────────────────────────────────────────
const TAG_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

// Substitute {{merge_tags}} for a preview. An unknown tag — or one we have no
// value for — renders as an empty string rather than leaking "{{tag}}" into a
// customer's inbox, which is exactly the failure mode this guards against.
export function renderPreview(body, contact = {}) {
  if (!body) return ''
  return String(body).replace(TAG_RE, (_m, tag) => {
    const v = contact?.[tag]
    return v === undefined || v === null ? '' : String(v)
  })
}

// Format a yyyy-mm-dd DATE the way a New Zealander reads it. Parsed as a local
// date (not UTC) so the day never slips.
export function formatDateNz(ymd) {
  if (!ymd) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd))
  if (!m) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Imported contact names are often company records ("Nitro Trust", "Coastal
// Properties Ltd") — greeting those by name reads badly, so they fall back.
const COMPANY_NAME_RE = /\b(ltd|limited|inc|incorporated|llc|trust|trustees|council|holdings|group|properties|property|management|body corp|body corporate|apartments|school|college|church|society|association|club|company|services|solutions|construction|builders|realty|real estate|rentals|hotel|motel|farm|orchard|nursery|contractors|c\/-|attn)\b/i

// The name to greet a contact by. A faithful port of greetingName() in
// supabase/functions/_shared/campaign.ts, which is the code that actually
// renders the email — the frontend can't import from a Deno function, so this
// mirrors it. Keep the two in step if either changes: a preview that disagrees
// with the sender is worse than no preview.
export function greetingName(contact = {}, fallback = 'there') {
  const raw = (contact.first_name ?? '').trim()
    || (contact.full_name ?? '').trim().split(/\s+/)[0]
    || ''
  if (!raw) return fallback
  if (raw.length < 2 || raw.length > 20) return fallback
  if (/\d/.test(raw)) return fallback
  if (COMPANY_NAME_RE.test(raw)) return fallback
  if (COMPANY_NAME_RE.test(`${contact.full_name ?? ''} ${contact.last_name ?? ''}`)) return fallback
  // Imported names are inconsistently cased ("JOHN", "john") — normalise.
  if (!/^[\p{L}][\p{L}'’.-]*$/u.test(raw)) return fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

// The merge data one contact would be sent, combining their own fields with the
// campaign's offer.
//
// This mirrors mergeValues() in _shared/campaign.ts EXACTLY, including the fact
// that only first_name has a fallback. Everything else renders as '' when it is
// missing. That is deliberate: inventing a friendly "your area" here would hide
// the very gap the composer needs to warn about — roughly half of imported
// contacts have no suburb, so "Your trees at {{suburb}}" would reach them as
// "Your trees at  ". The preview must show that, not paper over it.
export function mergeDataFor(contact = {}, campaign = {}) {
  const months = contact.months_since_job
  const pct = campaign.offer_percent
  return {
    first_name:       greetingName(contact),
    last_name:        (contact.last_name ?? '').trim(),
    suburb:           (contact.suburb ?? '').trim(),
    last_job_summary: (contact.last_job_summary ?? '').trim(),
    months_since_job: months === null || months === undefined ? '' : String(months),
    offer_code:       campaign.offer_code ?? '',
    offer_percent:    pct === null || pct === undefined || pct === '' ? '' : String(pct),
    offer_expires:    formatDateNz(campaign.offer_expires_on),
  }
}

// Which {{tags}} in a piece of copy would render as nothing for this contact —
// i.e. exactly where the recipient sees a gap. "Your trees at {{suburb}} —
// about due?" with no suburb arrives as "Your trees at  — about due?".
export function emptyTagsIn(text, data = {}) {
  const found = []
  for (const m of String(text ?? '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    const v = data?.[m[1]]
    if (v === undefined || v === null || String(v).trim() === '') found.push(m[1])
  }
  return [...new Set(found)]
}

// ── Validation ───────────────────────────────────────────────────────────────
// Words that reliably tip a message into junk folders. Whole-word matches only,
// so "freedom" and "guarantee" don't trip it.
const SPAM_TRIGGERS = [
  { label: 'FREE',         re: /\bfree\b/i },
  { label: 'ACT NOW',      re: /\bact\s+now\b/i },
  { label: 'LIMITED TIME', re: /\blimited\s+time\b/i },
  { label: '$$$',          re: /\$\$\$/ },
  { label: '100%',         re: /\b100\s*%/ },
  { label: 'GUARANTEED',   re: /\bguaranteed\b/i },
]

// Everything wrong with a campaign, as plain-English sentences the office can
// act on. Returns [] when it is good to send.
//
// Three kinds of rule are mixed here on purpose — they all belong to "is this
// email fit to send?":
//   * completeness  (name / subject / body / CTA)
//   * legal         (a discount claim needs an expiry — Fair Trading Act)
//   * deliverability(subject length, shouting, spam words)
// The page decides which are blocking; the rules live in one place.
export function validateCampaign(c = {}) {
  const problems = []

  const name    = (c.name ?? '').trim()
  const subject = (c.subject ?? '').trim()
  const body    = (c.body ?? '').trim()
  const ctaUrl  = (c.cta_url ?? '').trim()

  if (!name) problems.push('Give the campaign a name so you can find it again later')

  if (!subject) {
    problems.push('The email needs a subject line')
  } else {
    if (subject.length > 60) {
      problems.push(`Subject is ${subject.length} characters — over 60 gets cut off on phones, so keep it shorter`)
    }
    const letters = subject.replace(/[^a-z]/gi, '')
    if (letters.length >= 4 && subject === subject.toUpperCase()) {
      problems.push('Subject is in ALL CAPS — it reads as shouting and spam filters treat it that way')
    }
    const bangs = (subject.match(/!/g) ?? []).length
    if (bangs > 1) {
      problems.push(`Subject has ${bangs} exclamation marks — use at most one`)
    }
    const hits = SPAM_TRIGGERS.filter(t => t.re.test(subject)).map(t => t.label)
    if (hits.length) {
      problems.push(`Subject contains spam-trigger words (${hits.join(', ')}) — reword it to stay out of junk folders`)
    }
  }

  if (!body) {
    problems.push('The email body is empty')
  } else {
    if (!/\{\{\s*first_name\s*\}\}/.test(body)) {
      problems.push('The body never uses {{first_name}} — a personally addressed email gets read, a bulk one gets binned')
    }
    if (!ctaUrl) {
      problems.push('Set a call-to-action link — the email needs somewhere to send people')
    } else if (!body.includes(ctaUrl)) {
      problems.push(`The body doesn't include the call-to-action link (${ctaUrl}) — paste it in so people can act on the email`)
    }
  }

  const pct = c.offer_percent
  if (pct !== null && pct !== undefined && pct !== '' && Number(pct) > 0 && !c.offer_expires_on) {
    problems.push('A discount has to state when it ends — set an offer expiry date (Fair Trading Act)')
  }

  return problems
}

// ── Audience ─────────────────────────────────────────────────────────────────
// Buckets used by the audience breakdown. Half-open ranges: [min, max).
export const MONTH_BUCKETS = [
  { key: '0-6',   label: '0–6 months',   min: 0,  max: 6 },
  { key: '6-12',  label: '6–12 months',  min: 6,  max: 12 },
  { key: '12-24', label: '12–24 months', min: 12, max: 24 },
  { key: '24+',   label: '24+ months',   min: 24, max: Infinity },
]

export function bucketFor(months) {
  if (months === null || months === undefined || Number.isNaN(Number(months))) return null
  const n = Number(months)
  return MONTH_BUCKETS.find(b => n >= b.min && n < b.max)?.key ?? null
}

// Does one contact fall inside an audience filter? The same predicate drives the
// live "N recipients match" count and the preview's sample contact, so what the
// office sees on screen is what the sender will resolve.
export function matchesAudience(contact = {}, audience = {}) {
  const a = audience ?? {}
  const months = contact.months_since_job

  if (a.min_months_since_job != null && a.min_months_since_job !== '') {
    if (months == null || Number(months) < Number(a.min_months_since_job)) return false
  }
  if (a.max_months_since_job != null && a.max_months_since_job !== '') {
    if (months == null || Number(months) > Number(a.max_months_since_job)) return false
  }
  if (Array.isArray(a.services) && a.services.length) {
    const has = contact.services ?? []
    if (!a.services.some(s => has.includes(s))) return false
  }
  if (Array.isArray(a.suburbs) && a.suburbs.length) {
    const sub = (contact.suburb ?? '').toLowerCase()
    if (!a.suburbs.some(s => String(s).toLowerCase() === sub)) return false
  }
  if (a.min_job_count != null && a.min_job_count !== '') {
    if (Number(contact.job_count ?? 0) < Number(a.min_job_count)) return false
  }
  return true
}

// How much of an audience has a suburb at all. Roughly half of imported contacts
// don't (docs/campaigns/personalisation-data-sources.md), which is what decides
// whether a {{suburb}} subject line is safe to put in front of them.
export function suburbCoverage(contacts = []) {
  const total = contacts.length
  const withSuburb = contacts.filter(c => (c?.suburb ?? '').trim() !== '').length
  return {
    total,
    withSuburb,
    without: total - withSuburb,
    shareWithout: total ? (total - withSuburb) / total : 0,
  }
}

// Above this share of the audience missing a suburb, a {{suburb}} subject is not
// worth the personalisation — a fifth of the list receiving a visible gap in the
// one line that decides whether the email gets opened is too many.
export const SUBURB_FALLBACK_THRESHOLD = 0.2

// Pick the subject line to use for a template against a given audience.
//
// The sender resolves ONE subject for the whole campaign — it has no
// per-recipient choice — so if a meaningful share of the audience has no suburb,
// we take the template's plain-language `subjectFallback` instead of mailing
// those people "Your trees at  — about due?".
export function chooseSubject(template = {}, contacts = [], threshold = SUBURB_FALLBACK_THRESHOLD) {
  const subject = template.subject ?? ''
  const coverage = suburbCoverage(contacts)
  const usesSuburb = /\{\{\s*suburb\s*\}\}/.test(subject)
  const usedFallback = !!(usesSuburb && template.subjectFallback && coverage.shareWithout > threshold)
  return {
    subject: usedFallback ? template.subjectFallback : subject,
    usedFallback,
    usesSuburb,
    ...coverage,
  }
}

// "a", "a or b", "a, b or c"
function orList(items) {
  const xs = items.filter(Boolean).map(String)
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`
}

// Turn the audience JSONB into a sentence, so the send confirmation says who is
// about to be emailed in words rather than in JSON.
export function describeAudience(audience = {}) {
  const a = audience ?? {}
  const parts = []

  const min = a.min_months_since_job
  const max = a.max_months_since_job
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (hasMin && hasMax)      parts.push(`whose last job was between ${min} and ${max} months ago`)
  else if (hasMin)           parts.push(`whose last job was ${min}+ months ago`)
  else if (hasMax)           parts.push(`whose last job was in the last ${max} months`)

  if (Array.isArray(a.services) && a.services.length) {
    parts.push(`who have had ${orList(a.services.map(s => SERVICE_LABELS[s] ?? s))} done`)
  }
  if (Array.isArray(a.suburbs) && a.suburbs.length) {
    parts.push(`in ${orList(a.suburbs)}`)
  }
  if (a.min_job_count != null && a.min_job_count !== '' && Number(a.min_job_count) > 1) {
    parts.push(`with ${a.min_job_count} or more jobs with us`)
  }

  if (!parts.length) return 'Every residential customer we can legally email'
  return `Residential customers ${parts.join(', ')}`
}

// ── Presets ──────────────────────────────────────────────────────────────────
// Starting points for the audience filter — the segments actually worth mailing
// for a tree business, rather than a blank filter builder.
export const SEGMENT_PRESETS = [
  {
    key: 'lapsed',
    label: 'Lapsed — 12+ months since last job',
    hint: 'The main re-engagement list. Most tree work is on a 1–3 year cycle.',
    audience: { min_months_since_job: 12 },
  },
  {
    key: 'winter_pruning',
    label: 'Winter pruning — pruning customers, 9+ months',
    hint: 'Deciduous pruning is a winter job — go to people who have had it done before.',
    audience: { min_months_since_job: 9, services: ['pruning'] },
  },
  {
    key: 'recent',
    label: 'Recent customers — last 6 months',
    hint: 'Still warm. Good for referrals and follow-on work, not for discounts.',
    audience: { max_months_since_job: 6 },
  },
  {
    key: 'everyone',
    label: 'Everyone eligible',
    hint: 'The whole eligible list. Use sparingly — it burns the list fastest.',
    audience: {},
  },
]
