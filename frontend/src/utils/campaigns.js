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

// Anything written between double braces, however malformed. Deliberately much
// broader than the old [a-zA-Z0-9_]+ pattern: {{first-name}}, {{first name}}
// and {{last.job}} are the typos a person actually makes, and the narrow
// pattern made every one of them invisible to the composer's warnings. The
// sender resolves any {{…}} to the empty string, so a malformed tag is not a
// cosmetic slip — it is a hole in the copy for every single recipient, and the
// composer has to see it.
const ANY_TAG_RE = /\{\{([^{}]*)\}\}/g

// Substitute {{merge_tags}} for a preview. An unknown tag — or one we have no
// value for — renders as an empty string rather than leaking "{{tag}}" into a
// customer's inbox, which is exactly the failure mode this guards against.
//
// Matches ANY {{…}}, including malformed ones like {{first-name}}. The sender's
// resolver does the same, so showing a malformed tag verbatim here would tell
// the office the tag survives to the inbox when in fact it becomes a hole —
// and would contradict the gap warning the composer prints beside it.
export function renderPreview(body, contact = {}) {
  if (!body) return ''
  return String(body).replace(ANY_TAG_RE, (_m, raw) => {
    const tag = raw.trim()
    // Own properties only, so {{constructor}} doesn't render a function body.
    const v = contact != null && Object.prototype.hasOwnProperty.call(contact, tag) ? contact[tag] : undefined
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

// Every {{tag}} written in a piece of copy — braces and padding stripped, in
// the order they appear, each reported once.
export function tagsIn(text) {
  const found = []
  for (const m of String(text ?? '').matchAll(ANY_TAG_RE)) found.push(m[1].trim())
  return [...new Set(found)]
}

// The tags the sender does not understand. Distinct from "empty for this
// contact": these render as nothing for EVERYONE, so they are always a fault,
// never a per-contact gap. The list is MERGE_TAGS — the same list the composer
// offers as buttons and the same list _shared/campaign.ts resolves.
export function unknownTagsIn(text) {
  return tagsIn(text).filter(t => !MERGE_TAG_KEYS.includes(t))
}

// Which {{tags}} in a piece of copy would render as nothing for this contact —
// i.e. exactly where the recipient sees a gap. "Your trees at {{suburb}} —
// about due?" with no suburb arrives as "Your trees at  — about due?".
// Unknown and malformed tags are included: they always render as a gap.
export function emptyTagsIn(text, data = {}) {
  return tagsIn(text).filter(tag => {
    // Own properties only — `{{constructor}}` must not resolve off the
    // prototype and be reported as "fine".
    const v = data != null && Object.prototype.hasOwnProperty.call(data, tag) ? data[tag] : undefined
    return v === undefined || v === null || String(v).trim() === ''
  })
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
      // ADVISORY, not blocking. The sender appends the CTA line only when the
      // body doesn't already carry the link (renderCampaignEmail in
      // _shared/campaign.ts), so the email always ends up with exactly one way
      // to act on it. What's left here is a writing preference: a link inside a
      // sentence of your own reads better than one bolted on at the end.
      problems.push(
        `The body doesn't include the call-to-action link (${ctaUrl}) — the sender will add it as a `
        + `line of its own at the bottom. Paste it into a sentence yourself if you'd rather it read naturally.`
      )
    }
  }

  // Merge tags the sender can't resolve — {{first-name}}, {{first name}},
  // {{last.job}}. Every one of them reaches every recipient as a blank, so this
  // is a fault in the copy, not a per-contact gap. Checked across all three
  // places a tag can be written.
  const unknown = [...new Set([
    ...unknownTagsIn(subject),
    ...unknownTagsIn(c.preheader ?? ''),
    ...unknownTagsIn(body),
  ])]
  if (unknown.length) {
    const list  = unknown.map(t => `{{${t}}}`).join(', ')
    const valid = MERGE_TAG_KEYS.map(t => `{{${t}}}`).join(', ')
    problems.push(unknown.length === 1
      ? `${list} is not a merge tag — it reaches every recipient as a blank. The tags that work are ${valid}`
      : `${list} are not merge tags — they reach every recipient as a blank. The tags that work are ${valid}`)
  }

  const pct = c.offer_percent
  if (pct !== null && pct !== undefined && pct !== '' && Number(pct) > 0 && !c.offer_expires_on) {
    problems.push('A discount has to state when it ends — set an offer expiry date (Fair Trading Act)')
  }

  return problems
}

// ── Audience ─────────────────────────────────────────────────────────────────
// Buckets used by the audience breakdown. Half-open ranges: [min, max).
//
// NOTE these are NOT the same ranges as the audience filter, and they are not
// meant to be. A contact at exactly 6 months lands in the "6–12 months" bucket
// here, but IS included by max_months_since_job: 6, because the backend filters
// with .lte() — inclusive at both ends. The buckets are a reporting histogram
// (every contact in exactly one band); the filter is a selection (inclusive
// range). Don't "fix" one to match the other; they answer different questions.
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

// Read a numeric audience clause EXACTLY the way the backend reads it.
//
// resolveAudience() in supabase/functions/_shared/campaign.ts gates every
// numeric clause on `typeof f.x === 'number'`, so a filter stored in the
// audience JSONB as the string "12" is silently ignored by the sender. Being
// more lenient here would show a filter as applied on screen that the send
// does not apply — the exact dishonesty the "N recipients match" count exists
// to avoid. Blank and undefined mean "not set" in both.
function numClause(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// Does one contact fall inside an audience filter? The same predicate drives the
// live "N recipients match" count and the preview's sample contact, so what the
// office sees on screen is what the sender will resolve.
//
// This is a faithful port of resolveAudience()'s PostgREST query. Every clause
// below names the backend call it mirrors; if one changes, change both.
export function matchesAudience(contact = {}, audience = {}) {
  const a = audience ?? {}
  const months = contact.months_since_job

  // .gte('months_since_job', n) / .lte('months_since_job', n) — inclusive both
  // ends. A NULL months_since_job (no job on record) fails an SQL comparison,
  // so those contacts drop out whenever either bound is set.
  const minMonths = numClause(a.min_months_since_job)
  if (minMonths !== null && (months == null || Number(months) < minMonths)) return false

  const maxMonths = numClause(a.max_months_since_job)
  if (maxMonths !== null && (months == null || Number(months) > maxMonths)) return false

  // .overlaps('services', […]) — array intersection, exact tag match.
  if (Array.isArray(a.services) && a.services.length) {
    const has = contact.services ?? []
    if (!a.services.some(s => has.includes(s))) return false
  }

  // .in('suburb', […]) — plain SQL equality: CASE-SENSITIVE and NOT trimmed.
  // This used to lowercase both sides, which counted "karori" as matching
  // "Karori" on screen while the send matched nobody. The suburb values the
  // picker offers come straight off the contact rows, so they already carry
  // whatever casing and whitespace the import left on them — compare raw.
  if (Array.isArray(a.suburbs) && a.suburbs.length) {
    const sub = contact.suburb ?? ''
    if (!a.suburbs.some(s => String(s) === sub)) return false
  }

  // .gte('job_count', n)
  const minJobs = numClause(a.min_job_count)
  if (minJobs !== null && Number(contact.job_count ?? 0) < minJobs) return false

  // .gte('lifetime_value', n). The backend has always applied this; it was
  // missing here, so a spend filter counted everybody in and then mailed a
  // fraction of them. lifetime_value comes back off PostgREST as a NUMERIC
  // string ("1450.00"), hence the coercion.
  const minValue = numClause(a.min_lifetime_value)
  if (minValue !== null && Number(contact.lifetime_value ?? 0) < minValue) return false

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

  // Every clause is read through numClause, the same way matchesAudience and
  // the sender read it — so the sentence never describes a filter that isn't
  // actually being applied.
  const min = numClause(a.min_months_since_job)
  const max = numClause(a.max_months_since_job)
  if (min !== null && max !== null) parts.push(`whose last job was between ${min} and ${max} months ago`)
  else if (min !== null)            parts.push(`whose last job was ${min}+ months ago`)
  else if (max !== null)            parts.push(`whose last job was in the last ${max} months`)

  if (Array.isArray(a.services) && a.services.length) {
    parts.push(`who have had ${orList(a.services.map(s => SERVICE_LABELS[s] ?? s))} done`)
  }
  if (Array.isArray(a.suburbs) && a.suburbs.length) {
    parts.push(`in ${orList(a.suburbs.map(sub => String(sub).trim()))}`)
  }
  const minJobs = numClause(a.min_job_count)
  if (minJobs !== null && minJobs > 1) {
    parts.push(`with ${minJobs} or more jobs with us`)
  }
  const minValue = numClause(a.min_lifetime_value)
  if (minValue !== null && minValue > 0) {
    parts.push(`who have spent $${minValue.toLocaleString('en-NZ')} or more with us`)
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
    // Inclusive of month 6 itself — the sender filters with .lte(). That means
    // this preset overlaps the "6–12 months" reporting bucket by one month.
    label: 'Recent customers — last 6 months',
    hint: 'Still warm. Good for referrals and follow-on work, not for discounts.',
    audience: { max_months_since_job: 6 },
  },
  {
    key: 'best',
    label: 'Best customers — $2,000+ lifetime',
    hint: 'The people worth a personal note. Spend, not recency — they may be recent or lapsed.',
    audience: { min_lifetime_value: 2000 },
  },
  {
    key: 'everyone',
    label: 'Everyone eligible',
    hint: 'The whole eligible list. Use sparingly — it burns the list fastest.',
    audience: {},
  },
]
