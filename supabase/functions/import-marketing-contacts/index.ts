// Populates `marketing_contacts` (the Campaigns mailing list) from the three
// places our customer history actually lives.
//
// POST body: { source: 'xero' | 'quotient' | 'clients', contacts?: [...], dry_run?: boolean }
//   source    'xero'     — pulls Contacts + ACCREC Invoices straight from the
//                          Xero API using the stored xero_connections row.
//             'quotient' — Quotient has no read API, so rows are extracted in
//                          the browser (see README) and POSTed in `contacts`.
//             'clients'  — seeds from the app's own clients/jobs/quotes.
//   contacts  required for 'quotient'; capped at 5000 rows, validated per row.
//   dry_run   compute the full summary and write nothing.
//
// Auth: caller must be a signed-in full/office user (Bearer session token).
//
// Returns: { ok, source, dry_run, scanned, inserted, updated, skipped_no_email,
//            skipped_invalid, classified:{residential,commercial},
//            suppressed_no_history, sample:[first 5 rendered rows], errors[] }
//
// Required secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   XERO_CLIENT_ID, XERO_CLIENT_SECRET  (source 'xero' only)
//
// Xero scopes required on the stored connection (source 'xero'):
//   accounting.contacts.read, accounting.transactions.read
// A refresh cannot add a scope — if they are missing the user must reconnect
// Xero in Settings and approve them.
//
// XERO ↔ QUOTIENT JOIN
// Every Xero ACCREC invoice carries a header line item (no quantity/unit
// amount) whose description is the site address followed by
// `Quote Number: 5515` — and that number is the Quotient quote_no. It is a
// real join key, so the two systems merge on it rather than on fuzzy name
// matching. Matched quote numbers are recorded on the contact row (a `[quotes]`
// line in `notes`) so the join is stable across re-imports.
//
// CONSENT SAFETY — read before changing anything in here:
// This importer NEVER touches consent state on a row that already exists.
// Someone who unsubscribed, bounced or complained must stay that way through
// any number of re-imports. See applyMerge() below.

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const CONN_ID     = '00000000-0000-0000-0000-000000000001'
const XERO_API    = 'https://api.xero.com/api.xro/2.0'
const XERO_PAGE   = 100          // Xero's page size for Contacts/Invoices
const MAX_PAGES   = 200          // hard stop, so a runaway loop can't hammer Xero
const MAX_ROWS    = 5000         // cap on a posted 'quotient' batch
const WRITE_CHUNK = 200
const DB_PAGE     = 1000
const MAX_QUOTE_REFS = 40        // quote numbers kept on a row, newest first

// Jobs in these statuses count as work actually done (and so as the basis for
// inferred consent). Anything earlier is only an enquiry or a quote.
const COMPLETED_JOB_STATUSES = ['complete_to_invoice', 'invoiced']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Small shared helpers ────────────────────────────────────────────────────

/** Strip macrons/accents so 'Kāinga Ora' and 'Kainga Ora' match the same rule. */
function deburr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Xero descriptions mix \r\n and \n. Normalise before any line parsing. */
function normaliseLines(s: unknown): string {
  return String(s ?? '').replace(/\r\n?/g, '\n')
}

/** Trim + lowercase. Returns '' for anything blank. */
export function normaliseEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

/**
 * Deliberately the same shape as the regex in campaign_audience_eligible, so
 * an address that passes the importer can never be rejected by the view (or
 * vice versa). Also rejects the placeholder junk contact files collect.
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false
  if (email.length > 254) return false
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) return false
  if (/^(no|none|n\/a|na|nil|test|noreply|no-reply|donotreply)@/i.test(email)) return false
  if (/@(example|test|localhost|invalid)\./i.test(email)) return false
  return true
}

// ── Residential vs commercial ───────────────────────────────────────────────
// Commercial accounts are contract work — Downer, Spencers Henshaw, councils,
// Kāinga Ora, property managers, schools. They must NEVER be marketed to: the
// contact on file is an account manager, not a homeowner, and a discount blast
// landing in a contract inbox is at best embarrassing. When a name is
// ambiguous we still prefer 'commercial': the cost of wrongly excluding a
// homeowner is one lost email, the cost of wrongly including a contract
// account is a client relationship.

const COMMERCIAL_NAME_PATTERNS: RegExp[] = [
  // Named contract accounts
  /\bdowner\b/, /\bspencers?\b/, /\bhenshaw\b/, /\bkainga\s*ora\b/, /\bhousing\s+new\s+zealand\b/,
  // Government / institutional
  /\bcity\s+council\b/, /\bdistrict\s+council\b/, /\bregional\s+council\b/, /\bcouncil\b/,
  /\bministry\b/, /\bdepartment\s+of\b/, /\buniversity\b/, /\bschool\b/, /\bcollege\b/,
  /\bkindergarten\b/, /\bchurch\b/, /\bparish\b/, /\bhospital\b/, /\bmarae\b/,
  // Company / entity forms
  /\bltd\b/, /\blimited\b/, /\bholdings\b/, /\btrust\b/, /\btrustees?\b/,
  /\bincorporated\b/, /\bsociety\b/, /\bcompany\b/,
  // Property, facilities and body corporate
  /\bbody\s*corp(orate)?\b/, /\bapartments?\b/, /\bproperty\b/, /\bproperties\b/,
  /\bfacilit(y|ies)\b/, /\bmanagement\b/, /\bmanagers?\b/, /\bestates?\b/,
  /\bretirement\s+village\b/, /\bvillage\s+(ltd|limited|management)\b/,
  // Real estate brands
  /\brealty\b/, /\breal\s+estate\b/, /\bray\s+white\b/, /\bharcourts\b/,
  /\bprofessionals\b/, /\btommy'?s\b/, /\bbayleys\b/, /\blj\s+hooker\b/,
  /\bquinovic\b/, /\bnight'?n\s*day\b/,
]

/** Domains we know belong to a contract or institutional account. */
const COMMERCIAL_DOMAINS = new Set([
  'downergroup.com', 'downer.co.nz',
  'spencersnz.co.nz', 'spencershenshaw.co.nz', 'henshaw.co.nz',
  'kaingaora.govt.nz', 'hnzc.co.nz',
  'uhcc.govt.nz', 'huttcity.govt.nz', 'wcc.govt.nz', 'gw.govt.nz',
  'poriruacity.govt.nz', 'kapiticoast.govt.nz',
  'quinovic.co.nz', 'raywhite.com', 'harcourts.co.nz', 'tommys.co.nz',
])

/** Domain suffixes that are institutional by definition. */
const COMMERCIAL_DOMAIN_SUFFIXES = [
  '.govt.nz', '.school.nz', '.ac.nz', '.mil.nz', '.parliament.nz', '.health.nz',
]

const CONSUMER_MAIL_DOMAINS = /@(gmail|hotmail|outlook|xtra|yahoo|icloud|me|live|msn|orcon|slingshot|vodafone|actrix|paradise|inspire|clear|snap|xnet)\./

/**
 * Classify a contact as 'commercial' or 'residential' from its name and email.
 * Exported so the Campaigns page and any backfill script classify identically.
 */
export function classifyContact(name: unknown, email: unknown): 'residential' | 'commercial' {
  const n = deburr(String(name ?? '')).toLowerCase()
  if (n && COMMERCIAL_NAME_PATTERNS.some((re) => re.test(n))) return 'commercial'

  const e = normaliseEmail(email)
  const domain = e.includes('@') ? e.split('@').pop()! : ''
  if (domain) {
    if (COMMERCIAL_DOMAINS.has(domain)) return 'commercial'
    if (COMMERCIAL_DOMAIN_SUFFIXES.some((s) => domain.endsWith(s))) return 'commercial'
    // A role address on a business domain is a business inbox, not a person.
    if (/^(accounts?|ap|invoices?|maintenance|facilities|property|admin|office|procurement|works)@/.test(e)
        && !CONSUMER_MAIL_DOMAINS.test(e)) {
      return 'commercial'
    }
  }
  return 'residential'
}

// ── Service tags ────────────────────────────────────────────────────────────
// Order is stable because these feed campaign targeting: the same input must
// always produce the same tags. 'reduction' is a finer signal sitting inside
// 'pruning' — reductions and pollards are the work that visibly grows back, so
// they are the strongest repeat-work segment.

const SERVICE_PATTERNS: Array<[string, RegExp]> = [
  ['pruning',   /\bprun|\btrim|\breduc|\bthin|\bcrown|\blift|\bpollard|flat\s?top/],
  ['reduction', /\breduc|\bpollard|\bcrown\b/],
  ['removal',   /\bremov|\bfell\b|\bfell\s+out\b|\bfelling\b|\bfelled\b|dismantl|take\s?down|\btakedown\b|\bcut\s+down\b/],
  ['hedge',     /hedge|griselinia/],
  ['stump',     /\bstump|\bgrind/],
  ['planting',  /\bplant|\bmulch|\bchip/],
  ['emergency', /\bstorm|\bemergenc|\burgent|\bfallen/],
]

/**
 * Derive service tags from free text (invoice/quote line items, job titles).
 * Returns a deduped array in a stable order.
 */
export function deriveServices(text: unknown): string[] {
  const t = normaliseLines(text).toLowerCase()
  if (!t.trim()) return []
  const out: string[] = []
  for (const [tag, re] of SERVICE_PATTERNS) if (re.test(t) && !out.includes(tag)) out.push(tag)
  return out
}

// ── The Xero ↔ Quotient join key ────────────────────────────────────────────

/** Pull every `Quote Number: 5515` (the Quotient quote_no) out of some text. */
export function parseQuoteNumbers(text: unknown): string[] {
  const out: string[] = []
  for (const m of normaliseLines(text).matchAll(/Quote\s*Number\s*:\s*(\d+)/gi)) {
    if (!out.includes(m[1])) out.push(m[1])
  }
  return out
}

/** True for the address/quote-number header line item, which describes no work. */
function isHeaderLineItem(description: unknown): boolean {
  return /Quote\s*Number\s*:\s*\d+/i.test(normaliseLines(description))
}

// ── last_job_summary ────────────────────────────────────────────────────────
// This is the sentence the campaign copy is personalised with. It is
// interpolated into a frame like:
//
//     "we {{last_job_summary}} back in March 2023 — it'll be about due"
//
// so it must be a LOWERCASE PAST-TENSE VERB PHRASE with no leading capital, no
// trailing full stop, no price, and no suburb (the frame supplies the date and
// the sentence around it). Target register, taken straight from what returning
// customers write to us unprompted:
//
//     "reduced the pōhutukawa out front"
//     "pruned the magnolia and took out a small fruit tree"
//     "squared up the griselinia hedge"
//
// NOT "Tree Pruning/Removal services". Customers name the specific tree; so do we.
//
// Xero line items follow a reliable convention:
//     Tree pruning            ← work type (leading plain line)
//     *Pohutukawa*            ← subject, between asterisks
//     * Reduce by approx 15%  ← action, an asterisk BULLET
//     *All cuttings taken off site*   ← boilerplate, discarded
// so we parse subjects and actions out of that, and only fall back to free
// text when no usable *subject* is found.

/** Species seen in the real data. Values are the correct te reo spelling. */
const SPECIES: Array<[RegExp, string]> = [
  [/\bpohutukawa(s)?\b/g, 'pōhutukawa$1'],
  [/\brata(s)?\b/g,       'rātā$1'],
  [/\bpuriri(s)?\b/g,     'pūriri$1'],
  [/\bkowhai(s)?\b/g,     'kōwhai$1'],
  [/\bti\s?kouka\b/g,     'tī kōuka'],
  [/\bkanuka\b/g,         'kānuka'],
  [/\bmanuka\b/g,         'mānuka'],
  [/\btotara(s)?\b/g,     'tōtara$1'],
]

/** Used to find the subject in free text when there are no *asterisks*. */
const SPECIES_WORDS = [
  'pohutukawa', 'pittosporum', 'magnolia', 'karo', 'griselinia', 'sycamore',
  'cabbage tree', 'banksia', 'gum', 'beech', 'camellia', 'corokia', 'rata',
  'olive', 'plum', 'yucca', 'cherry', 'cotoneaster', 'coprosma', 'pear',
  'cypress', 'liquidambar', 'macrocarpa', 'puriri', 'kowhai', 'ti kouka',
  'kanuka', 'manuka', 'totara', 'oak', 'birch', 'willow', 'poplar', 'flax',
  'hedge', 'conifer', 'palm', 'pine', 'lemon', 'feijoa', 'apple',
]

/** Apply the macronised spellings to customer-facing copy. */
function macronise(s: string): string {
  let out = s
  for (const [re, rep] of SPECIES) out = out.replace(re, rep)
  return out
}

/**
 * Asterisk groups that are standing terms-and-conditions rather than a tree.
 * These are extremely common — nearly every quote carries one or two.
 */
function isBoilerplateToken(t: string): boolean {
  const s = t.trim().toLowerCase()
  if (!s || s.length > 60 || !/[a-z]/.test(s)) return true
  if (/^(all|if|no|please|note|optional)\b/.test(s)) return true
  return /cuttings|material|select box|off\s?site|on lawn|green\s?waste|rubbish|leave wood|leaving wood|wood left|chipped and|access|price|quote|gst/.test(s)
}

/** Line items that bill for something other than the work itself. */
const ADMIN_LINE = /^(travel|mileage|disposal|green\s?waste|waste|dump(ing)?\s?fees?|tip\s?fees?|traffic\s?management|tm\b|labour|labor|hourly|hire|deposit|gst|call\s?out|callout|site\s?set\s?up|admin|sundries|access|permit|consent|discount|balance|payment|invoice|quote|misc|materials?)\b/i

const NUMBER_WORDS = ['', '', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const DETERMINED = /^(the|a|an|your|both|some|several)\b/

/**
 * Past-tense verb phrases, in priority order. First match on the action text
 * (falling back to the work-type line) wins.
 *
 * Order matters and is not arbitrary:
 *  - 'grind' is the only reliable stump-grinding signal ("remove leaving low
 *    stump" is a removal, not a grind), so it is checked on its own term.
 *  - reductions are checked BEFORE removals, because "remove dead leader,
 *    reduce canopy by 15%" is a reduction with a bit of deadwooding, and
 *    calling it a removal would be flatly wrong in the customer's inbox.
 */
const VERBS: Array<[RegExp, string]> = [
  [/\bgrind|\bgrinding\b/,                                        'ground out'],
  [/\bsquare\s?(up|off)\b/,                                       'squared up'],
  [/\breduc|\bpollard/,                                           'reduced'],
  [/\b\d+\s*m(etre|tr)?s?\s+(of|off)\b/,                            'reduced'],
  [/dismantl|take\s?down|\btakedown\b|\bfell\b|\bfelled\b|\bfelling\b|\bfell\s+out\b|\bcut\s+down\b|\bremov/, 'took out'],
  [/dead\s?(wood|leader|branch|limb)/,                            'took the deadwood out of'],
  [/crown\s?lift|\blift(ed|ing)?\b/,                              'lifted'],
  [/\bthin(ned|ning)?\b/,                                         'thinned'],
  [/flat\s?top|\bshape|\btidy|\btidied\b/,                        'tidied'],
  [/\btrim/,                                                      'trimmed'],
  [/\bprun/,                                                      'pruned'],
  [/\bstorm|\bfallen|\bemergenc|\bclear/,                         'cleared'],
  [/\bplant/,                                                     'planted'],
  [/\bmulch|\bchip/,                                              'chipped'],
]

/** A removal word applied to a PART of the tree is not a whole-tree removal. */
const PART_REMOVAL = /\b(remov\w*|fell\s+out|cut\s+back|take\s+out)\s+(the\s+)?(dead|leader|limb|branch|overhang|epicormic|sucker|stub)/

function matchVerb(text: string): string | null {
  const t = text.toLowerCase()
  if (!t.trim()) return null
  for (const [re, verb] of VERBS) {
    if (!re.test(t)) continue
    // Skip a "removal" that only removes a leader/limb, unless something
    // else in the text says the whole tree came out.
    if (verb === 'took out' && PART_REMOVAL.test(t)
        && !/dismantl|take\s?down|cut\s+down|\bfelled\b|\bremove\s+(the\s+)?(tree|stump|whole)/.test(t)) {
      continue
    }
    return verb
  }
  return null
}

const GENERIC_VERB = 'did some work on'

function pickVerb(actionText: string, workType: string): string {
  return matchVerb(actionText) ?? matchVerb(workType) ?? GENERIC_VERB
}

/** Turn a raw subject token into "the two karo out front". */
function renderSubject(raw: string): string | null {
  let s = normaliseLines(raw).replace(/\n/g, ' ').toLowerCase().trim()
  s = s.replace(/^[\s*\-•·]+/, '').replace(/[\s*\-•·]+$/, '')
  // Leading verb, when the token is a whole clause ("reduce pittosporum").
  for (let i = 0; i < 2; i++) {
    s = s.replace(/^(re-?)?(reduce|reduces|reduced|reduction|remove|removes|removed|removal|prune|pruning|pruned|trim|trimmed|trimming|thin|thinned|lift|lifted|dismantle|fell|fell out|grind|square up|square off|tidy|shape|cut back|cut down|take out|plant|planted|chip|mulch|clear|deadwood)\b\s*/, '')
  }
  s = s.replace(/^\d+\s*m(etre|tr)?s?\s+(of\s+)?/, '')            // "1M of magnolia"
  s = s.replace(/\b(by\s+)?(approx(imately)?\s+)?\d+\s*%/g, '')    // "by approx 15%"
  s = s.replace(/\bat\s+(the\s+)?front\b/, 'out front')
  s = s.replace(/\bat\s+(the\s+)?(back|rear)\b/, 'out the back')
  s = s.replace(/\bin\s+(the\s+)?(drive(way)?|lawn|garden)\b/, 'in the $2')
  s = s.replace(/[.,;:]+$/, '').replace(/\s{2,}/g, ' ').trim()

  // "2x Karo" → "two karo"
  s = s.replace(/^(\d+)\s*x\s*/, (_m, n) => {
    const i = Number(n)
    return (i >= 2 && i <= 9 ? NUMBER_WORDS[i] : `${i}`) + ' '
  })
  s = clipWords(s, 40)
  if (!s || s.length < 3 || !/[a-z]{3}/.test(s)) return null

  s = macronise(s)
  return DETERMINED.test(s) ? s : `the ${s}`
}

/** Truncate on a word boundary, dropping a dangling conjunction. */
function clipWords(s: string, max: number): string {
  if (s.length <= max) return s
  let cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  if (sp > 8) cut = cut.slice(0, sp)
  return cut.replace(/\s+(and|with|for|to|on|of|the|a|in|at|plus|&)$/i, '').replace(/[\s,;:.\-–—]+$/, '')
}

type WorkPhrase = { verb: string; subject: string }

/** Parse one Xero/Quotient line item into (subject, action) pairs. */
function parseLineItem(description: string): WorkPhrase[] {
  const lines = normaliseLines(description).split('\n').map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []

  const workTypeLine = lines.find((l) => !l.startsWith('*')) ?? ''
  const pairs: Array<{ subject: string; actions: string[] }> = []
  let current: { subject: string; actions: string[] } | null = null

  for (const line of lines) {
    const wrapped = line.match(/^\*\s*([^*]+?)\s*\*$/)   // *Pohutukawa*
    if (wrapped) {
      if (isBoilerplateToken(wrapped[1])) continue
      current = { subject: wrapped[1], actions: [] }
      pairs.push(current)
      continue
    }
    const inline = [...line.matchAll(/\*\s*([^*\n]+?)\s*\*/g)].map((m) => m[1])
    if (inline.length) {
      // A single line holding both, e.g. "*Olive* Remove leaving low stump".
      const rest = line.replace(/\*[^*\n]*\*/g, ' ').replace(/\s{2,}/g, ' ').trim()
      for (const tok of inline) {
        if (isBoilerplateToken(tok)) continue
        current = { subject: tok, actions: rest ? [rest] : [] }
        pairs.push(current)
      }
      continue
    }
    const action = line.replace(/^\*+\s*/, '').trim()    // "* Reduce by approx 15%"
    if (!action || action === workTypeLine) continue
    if (current) current.actions.push(action)
  }

  if (pairs.length) {
    return pairs
      .map((p) => {
        const subject = renderSubject(p.subject)
        return subject ? { verb: pickVerb(p.actions.join('. '), workTypeLine), subject } : null
      })
      .filter(Boolean) as WorkPhrase[]
  }

  // ── Fallback: no asterisks, just free text like
  //    "Reduce pittosporum / 1M of Magnolia / Remove small fruit tree"
  // The work-type line ("Tree Pruning/Removal") is a heading, not a clause —
  // including it yields nonsense like "pruned the tree pruning".
  const body = (lines.length > 1 ? lines.filter((l) => l !== workTypeLine) : lines).join(' / ')
  const clauses = body.split(/\s*[\/;]\s*|\n/).map((c) => c.trim()).filter(Boolean)
  const out: WorkPhrase[] = []
  let carried: string | null = null
  for (const clause of clauses) {
    if (isBoilerplateToken(clause) || ADMIN_LINE.test(clause)) continue
    const lower = clause.toLowerCase()
    // Prefer a recognised species over the raw clause remainder.
    const species = SPECIES_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(lower))
    const subject = species
      ? renderSubject(lower.slice(Math.max(0, lower.indexOf(species) - 12)))
      : renderSubject(clause)
    if (!subject) continue
    const own = matchVerb(clause)
    if (own) carried = own
    out.push({ verb: own ?? carried ?? pickVerb('', workTypeLine), subject })
  }
  return out
}

/**
 * Build the lowercase past-tense phrase describing someone's most recent job.
 * `lineItems` accepts strings or objects with a description/detail/name/title.
 *
 * `address` is accepted for signature compatibility and is NOT appended: the
 * summary is interpolated mid-sentence ("we … back in March 2023"), so a
 * trailing ", Eastbourne" would derail the sentence. The suburb is stored in
 * its own `marketing_contacts.suburb` column and merged into the copy
 * separately if a template wants it.
 *
 * Returns null rather than something awkward — the templates are written to
 * still read correctly when the summary is missing, which it will be for a
 * meaningful minority of contacts.
 */
export function summariseJob(lineItems: unknown, _address?: unknown): string | null {
  const descriptions: string[] = (Array.isArray(lineItems) ? lineItems : [lineItems])
    .map((i: any) => {
      if (i == null) return ''
      if (typeof i === 'string') return i
      return String(i.description ?? i.detail ?? i.name ?? i.title ?? '')
    })
    .map(normaliseLines)
    .filter((d) => d.trim() && !isHeaderLineItem(d))   // drop the address/quote-number header

  const phrases: WorkPhrase[] = []
  for (const d of descriptions) {
    for (const p of parseLineItem(d)) {
      if (!phrases.some((x) => x.subject === p.subject)) phrases.push(p)
    }
  }
  if (!phrases.length) return null

  const render = (list: WorkPhrase[]): string => {
    if (list.length === 1) return `${list[0].verb} ${list[0].subject}`
    const [a, b] = list
    return a.verb === b.verb
      ? `${a.verb} ${a.subject} and ${b.subject}`
      : `${a.verb} ${a.subject} and ${b.verb} ${b.subject}`
  }

  let out = render(phrases.slice(0, 2))
  if (out.length > 80) out = render(phrases.slice(0, 1))
  if (out.length > 80) out = clipWords(out, 80)
  out = out.replace(/\s{2,}/g, ' ').replace(/[.,;:]+$/, '').trim().toLowerCase()
  out = macronise(out)
  return out.length >= 8 ? out : null
}

/**
 * Pull the suburb out of a free-text address, for the `suburb` column.
 * "12 Marine Parade, Eastbourne, Lower Hutt 5013" → "Eastbourne"
 */
export function suburbFromAddress(address: unknown): string | null {
  const parts = String(address ?? '')
    .split(',')
    .map((p) => p.replace(/\b\d{4}\b/g, '').replace(/\bnew zealand\b|\bnz\b/gi, '').trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  for (const cand of parts.slice(1)) {
    if (/^\d/.test(cand)) continue
    if (cand.length < 3 || cand.length > 30) continue
    if (/^(wellington|new zealand|nz)$/i.test(cand) && parts.length > 2) continue
    const s = cand.replace(/\s{2,}/g, ' ')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  return null
}

// ── Dates ───────────────────────────────────────────────────────────────────

/**
 * Accepts ISO strings, Date, unix SECONDS (which is what Quotient returns) or
 * milliseconds, and Xero's /Date(1234567890000+1300)/.
 */
function toDateStr(v: unknown): string | null {
  if (v == null || v === '') return null
  let d: Date
  if (v instanceof Date) d = v
  else if (typeof v === 'number') d = new Date(v > 1e11 ? v : v * 1000)
  else {
    const s = String(v).trim()
    if (!s) return null
    const xero = s.match(/\/Date\((-?\d+)/)
    if (xero) d = new Date(Number(xero[1]))
    else if (/^\d+$/.test(s)) { const n = Number(s); d = new Date(n > 1e11 ? n : n * 1000) }
    else d = new Date(s)
  }
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  if (y < 1990 || y > 2100) return null
  return d.toISOString().slice(0, 10)
}

const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b)
const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b)

// ── Import provenance trailer ───────────────────────────────────────────────
// A contact legitimately comes from Xero AND Quotient AND the app. To merge
// counts across sources without double-counting on a re-import, each source's
// contribution is recorded on the row as machine-readable trailer lines in
// `notes`:
//
//   [import] xero:jobs=3;value=1840.00 quotient:jobs=1;value=0.00
//   [quotes] 5515 5610
//
// job_count is then the sum across sources and never drifts, however many
// times each source is re-imported, and `[quotes]` keeps the Xero↔Quotient
// join stable. Human notes above the trailer are preserved untouched.

type Contribution = { jobs: number; value: number }
type Trailer = Record<string, Contribution>

function parseTrailer(notes: unknown): { human: string; trailer: Trailer; quotes: string[] } {
  const lines = String(notes ?? '').split('\n')
  const trailer: Trailer = {}
  const quotes: string[] = []
  const human: string[] = []

  for (const line of lines) {
    const t = line.trim()
    if (t.startsWith('[import]')) {
      for (const tok of t.replace('[import]', '').trim().split(/\s+/)) {
        const m = tok.match(/^([a-z]+):jobs=(\d+);value=([\d.]+)$/)
        if (m) trailer[m[1]] = { jobs: Number(m[2]), value: Number(m[3]) }
      }
    } else if (t.startsWith('[quotes]')) {
      for (const tok of t.replace('[quotes]', '').trim().split(/\s+/)) {
        if (/^\d+$/.test(tok) && !quotes.includes(tok)) quotes.push(tok)
      }
    } else {
      human.push(line)
    }
  }
  return { human: human.join('\n').trim(), trailer, quotes }
}

function formatNotes(human: string, trailer: Trailer, quotes: string[]): string | null {
  const keys = Object.keys(trailer).sort()
  const importLine = keys.length
    ? `[import] ${keys.map((k) => `${k}:jobs=${trailer[k].jobs};value=${trailer[k].value.toFixed(2)}`).join(' ')}`
    : ''
  const quoteLine = quotes.length ? `[quotes] ${quotes.slice(0, MAX_QUOTE_REFS).join(' ')}` : ''
  const out = [human, importLine, quoteLine].filter(Boolean).join('\n').trim()
  return out || null
}

// ── The normalised shape every source produces ──────────────────────────────

type Candidate = {
  source: 'xero' | 'quotient' | 'app'   // value written to marketing_contacts.source
  source_ref: string | null
  email: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  phone: string | null
  address: string | null
  suburb: string | null
  city: string | null
  client_id: string | null
  first_job_at: string | null
  last_job_at: string | null
  job_count: number
  lifetime_value: number
  services: string[]
  last_job_summary: string | null
  /** Quotient quote numbers — the Xero↔Quotient join key. */
  quote_nos: string[]
  /** Human basis for inferred consent, e.g. 'xero:paid-invoice-2024-03-11'. */
  consent_basis: string | null
}

// ── Xero ────────────────────────────────────────────────────────────────────

/** Decode the `scope` claim out of the stored Xero access token (a JWT). */
function tokenScopes(accessToken: string): string[] | null {
  try {
    const payload = accessToken.split('.')[1]
    if (!payload) return null
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
    const scope = claims.scope
    if (Array.isArray(scope)) return scope.map(String)
    if (typeof scope === 'string') return scope.split(/\s+/).filter(Boolean)
    return null
  } catch { return null }
}

async function getXeroAccess(supabase: any) {
  const { data: conn, error } = await supabase
    .from('xero_connections').select('*').eq('id', CONN_ID).single()
  if (error || !conn) throw new Error('Xero is not connected — connect it in Settings → Integrations first.')

  let accessToken  = conn.access_token
  let refreshToken = conn.refresh_token

  // Refresh if within 60s of expiry (same rule as xero-invoice / xero-sync).
  if (new Date(conn.expires_at).getTime() - 60_000 < Date.now()) {
    const clientId     = Deno.env.get('XERO_CLIENT_ID')
    const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')
    if (!clientId || !clientSecret) throw new Error('XERO_CLIENT_ID / XERO_CLIENT_SECRET secrets are not set.')

    const r = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    if (!r.ok) throw new Error('Xero token refresh failed — reconnect Xero in Settings.')
    const refreshed = await r.json()
    accessToken  = refreshed.access_token
    refreshToken = refreshed.refresh_token ?? refreshToken
    await supabase.from('xero_connections').update({
      access_token:  accessToken,
      refresh_token: refreshToken,
      expires_at:    new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at:    new Date().toISOString(),
    }).eq('id', CONN_ID)
  }

  // Fail fast and specifically if the connection was granted without the
  // scopes this importer needs. A refresh cannot widen a scope — the only fix
  // is reconnecting and approving the extra permission.
  // Xero replaced the broad `accounting.transactions` with granular scopes on
  // 2 Mar 2026 — invoices now live under `accounting.invoices`, and apps created
  // after that date reject the old name with invalid_scope at the consent
  // screen, so asking for it is not a fix. Each entry below is a list of
  // ALTERNATIVES: the connection satisfies the requirement if it holds any one
  // of them. `.read` variants are read-only; the bare scope is read+write and
  // therefore also grants the read.
  const NEEDED: Array<{ label: string; any: string[] }> = [
    { label: 'contacts', any: ['accounting.contacts.read', 'accounting.contacts'] },
    { label: 'invoices', any: ['accounting.invoices.read', 'accounting.invoices', 'accounting.transactions.read', 'accounting.transactions'] },
  ]
  const scopes = tokenScopes(accessToken)
  if (scopes) {
    const missing = NEEDED
      .filter((need) => !need.any.some((s) => scopes.includes(s)))
      .map((need) => need.any[1] ?? need.any[0])
    if (missing.length) {
      throw new Error(
        `Xero connection is missing the ${missing.map((m) => `"${m}"`).join(' and ')} ` +
        `scope${missing.length > 1 ? 's' : ''}. Reconnect Xero in Settings → Integrations and approve ` +
        `${missing.length > 1 ? 'them' : 'it'} — a token refresh cannot add a scope.`,
      )
    }
  }

  return { accessToken, tenantId: conn.tenant_id as string, tenantName: conn.tenant_name as string }
}

async function xeroGet(path: string, access: { accessToken: string; tenantId: string }, scopeHint: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${XERO_API}${path}`, {
      headers: {
        Authorization:    `Bearer ${access.accessToken}`,
        'Xero-tenant-id': access.tenantId,
        Accept:           'application/json',
      },
    })
    if (res.ok) return await res.json()

    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') ?? 5)
      await new Promise((r) => setTimeout(r, Math.min(wait, 20) * 1000))
      continue
    }
    const detail = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Xero refused the request (${res.status}). The connection is missing the "${scopeHint}" ` +
        `scope — reconnect Xero in Settings → Integrations and approve it.`,
      )
    }
    throw new Error(`Xero API ${res.status}: ${detail.slice(0, 300)}`)
  }
  throw new Error('Xero API rate limited — try again in a minute.')
}

type XeroHistory = {
  first: string | null
  last: string | null
  count: number
  value: number
  lastItems: string[]
  lastAddress: string | null
  allItems: string[]
  quotes: string[]
}

async function loadXeroCandidates(access: any, deadline: number) {
  // 1. Contacts
  const contacts: any[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() > deadline) break
    const data = await xeroGet(`/Contacts?page=${page}`, access, 'accounting.contacts.read')
    const batch: any[] = data.Contacts ?? []
    contacts.push(...batch)
    if (batch.length < XERO_PAGE) break
  }

  // 2. ACCREC invoices, with line items. Xero only returns line items when the
  //    `page` parameter is used, which is why paging is not optional here.
  const history = new Map<string, XeroHistory>()
  const where = encodeURIComponent('Type=="ACCREC"')
  for (let page = 1; page <= MAX_PAGES; page++) {
    if (Date.now() > deadline) break
    const data = await xeroGet(`/Invoices?where=${where}&page=${page}`, access, 'accounting.transactions.read')
    const batch: any[] = data.Invoices ?? []
    for (const inv of batch) {
      const cid = inv.Contact?.ContactID
      if (!cid) continue
      if (inv.Status === 'VOIDED' || inv.Status === 'DELETED') continue

      const date  = toDateStr(inv.DateString ?? inv.Date)
      const descs: string[] = (inv.LineItems ?? [])
        .map((li: any) => normaliseLines(li.Description)).filter((d: string) => d.trim())

      // The header line item carries the site address and the Quotient quote
      // number; the rest describe the work.
      const header = descs.find(isHeaderLineItem) ?? null
      const items  = descs.filter((d) => !isHeaderLineItem(d))
      const siteAddress = header
        ? header.split('\n').map((l) => l.trim()).find((l) => l && !/^Quote\s*Number/i.test(l)) ?? null
        : null

      const h = history.get(cid) ?? {
        first: null, last: null, count: 0, value: 0,
        lastItems: [], lastAddress: null, allItems: [], quotes: [],
      }
      h.count += 1
      h.value += Number(inv.AmountPaid ?? 0) || 0
      h.first = minDate(h.first, date)
      if (date && (!h.last || date >= h.last)) {
        h.last = date
        h.lastItems = items
        h.lastAddress = siteAddress ?? h.lastAddress
      } else if (!h.lastItems.length && items.length) {
        h.lastItems = items
      }
      h.allItems.push(...items)
      for (const q of parseQuoteNumbers(header ?? descs.join('\n'))) {
        if (!h.quotes.includes(q)) h.quotes.unshift(q)   // newest first
      }
      history.set(cid, h)
    }
    if (batch.length < XERO_PAGE) break
  }

  // 3. Fold together
  const out: Candidate[] = []
  for (const c of contacts) {
    const h = history.get(c.ContactID)
    const addr = (c.Addresses ?? []).find((a: any) => a.AddressType === 'STREET' && a.AddressLine1)
      ?? (c.Addresses ?? []).find((a: any) => a.AddressLine1)
      ?? null
    const addressText = addr
      ? [addr.AddressLine1, addr.AddressLine2, addr.City, addr.Region, addr.PostalCode].filter(Boolean).join(', ')
      : (h?.lastAddress ?? null)   // fall back to the site address off the invoice header

    const fullName = String(c.Name ?? '').trim() || null
    const first = String(c.FirstName ?? '').trim() || (fullName ? fullName.split(/\s+/)[0] : null)
    const last  = String(c.LastName ?? '').trim()
      || (fullName && fullName.split(/\s+/).length > 1 ? fullName.split(/\s+/).slice(1).join(' ') : null)

    out.push({
      source: 'xero',
      source_ref: c.ContactID ?? null,
      email: normaliseEmail(c.EmailAddress),
      first_name: first, last_name: last, full_name: fullName,
      phone: (c.Phones ?? []).find((p: any) => p.PhoneNumber)?.PhoneNumber ?? null,
      address: addressText,
      suburb: (addr?.AddressLine2 || null) ?? suburbFromAddress(addressText),
      city: addr?.City ?? null,
      client_id: null,
      first_job_at: h?.first ?? null,
      last_job_at:  h?.last ?? null,
      job_count:    h?.count ?? 0,
      lifetime_value: Math.round((h?.value ?? 0) * 100) / 100,
      services: deriveServices((h?.allItems ?? []).join('\n')),
      last_job_summary: h ? summariseJob(h.lastItems, addressText) : null,
      quote_nos: h?.quotes ?? [],
      consent_basis: h?.last ? `xero:paid-invoice-${h.last}` : null,
    })
  }
  return { candidates: out, meta: { xero_contacts: contacts.length, xero_invoiced_contacts: history.size } }
}

// ── Quotient (browser-extracted payload) ────────────────────────────────────

type RowError = { index: number; source_ref?: string; error: string }

function loadQuotientCandidates(rows: any[], errors: RowError[]) {
  const out: Candidate[] = []
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      errors.push({ index, error: 'not an object' }); return
    }
    const sourceRef = row.source_ref == null ? null : String(row.source_ref).trim() || null
    const bad = (msg: string) => errors.push({ index, source_ref: sourceRef ?? undefined, error: msg })

    // Everything except the optional array extras must be scalar.
    for (const [key, val] of Object.entries(row)) {
      if (val != null && typeof val === 'object' && !['line_items', 'quote_nos'].includes(key)) {
        bad(`field "${key}" must be a scalar`); return
      }
    }
    const num = (v: unknown, name: string): number | null => {
      if (v == null || v === '') return 0
      const n = Number(v)
      if (!isFinite(n) || n < 0) { bad(`${name} is not a non-negative number`); return null }
      return n
    }

    const quoteCount    = num(row.quote_count, 'quote_count')
    const acceptedCount = num(row.accepted_count, 'accepted_count')
    const acceptedTotal = num(row.accepted_total, 'accepted_total')
    if (quoteCount === null || acceptedCount === null || acceptedTotal === null) return

    const firstQuoted = toDateStr(row.first_quoted)   // Quotient sends unix SECONDS
    const lastQuoted  = toDateStr(row.last_quoted)
    if (row.first_quoted && !firstQuoted) { bad('first_quoted is not a valid date'); return }
    if (row.last_quoted  && !lastQuoted)  { bad('last_quoted is not a valid date'); return }

    const first = String(row.first_name ?? '').trim() || null
    const lastN = String(row.last_name ?? '').trim() || null
    const fullName = [first, lastN].filter(Boolean).join(' ') || (row.name ? String(row.name).trim() : null)
    const address  = String(row.address ?? '').trim() || null
    // Only ~43% of Quotient contacts have a city/suburb at all, so both stay
    // nullable and nothing downstream may assume they are present.
    const city     = String(row.city ?? '').trim() || null

    // Quotient gives quote history, not job history. Only an ACCEPTED quote
    // evidences work actually done, so unaccepted contacts get no job dates
    // and no inferred consent — they land as 'suppressed'.
    const hasWork = (acceptedCount ?? 0) > 0
    // Optional extras the browser snippet fills in from the accepted-quotes
    // list. `quote_nos` is the join key back to Xero's line items; the quote
    // title is only the property address, so it rarely yields a summary — the
    // Xero import supplies that when the two rows merge.
    const items: string[] = Array.isArray(row.line_items)
      ? row.line_items.map((s: any) => String(s)).filter(Boolean)
      : (row.last_job_title ? [String(row.last_job_title)] : [])
    const quoteNos: string[] = Array.isArray(row.quote_nos)
      ? row.quote_nos.map((q: any) => String(q).trim()).filter((q: string) => /^\d+$/.test(q))
      : []

    out.push({
      source: 'quotient',
      source_ref: sourceRef,
      email: normaliseEmail(row.email),
      first_name: first, last_name: lastN, full_name: fullName,
      phone: String(row.phone ?? '').trim() || null,
      address,
      suburb: suburbFromAddress(address) ?? city,
      city,
      client_id: null,
      first_job_at: hasWork ? firstQuoted : null,
      last_job_at:  hasWork ? lastQuoted : null,
      job_count:    hasWork ? Math.round(acceptedCount!) : 0,
      lifetime_value: hasWork ? Math.round(acceptedTotal! * 100) / 100 : 0,
      services: deriveServices(items.join('\n')),
      last_job_summary: hasWork ? summariseJob(items, address) : null,
      quote_nos: quoteNos,
      consent_basis: hasWork && lastQuoted ? `quotient:accepted-quote-${lastQuoted}` : null,
    })
  })
  return out
}

// ── The app's own clients ───────────────────────────────────────────────────

async function pageAll(supabase: any, table: string, select: string) {
  const rows: any[] = []
  for (let from = 0; ; from += DB_PAGE) {
    const { data, error } = await supabase.from(table).select(select)
      .order('created_at', { ascending: true }).range(from, from + DB_PAGE - 1)
    if (error) throw new Error(`Reading ${table} failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < DB_PAGE) break
  }
  return rows
}

async function loadClientCandidates(supabase: any) {
  const clients = await pageAll(supabase, 'clients', 'id, name, email, phone, address, created_at')
  const jobs    = await pageAll(supabase, 'jobs',
    'id, client_id, title, description, job_type, address, status, status_changed_at, estimated_value, created_at')
  const quotes  = await pageAll(supabase, 'quotes', 'id, job_id, status, total, line_items, created_at')

  const quotesByJob = new Map<string, any[]>()
  for (const q of quotes) {
    if (!q.job_id) continue
    const arr = quotesByJob.get(q.job_id) ?? []
    arr.push(q); quotesByJob.set(q.job_id, arr)
  }
  const jobsByClient = new Map<string, any[]>()
  for (const j of jobs) {
    if (!j.client_id) continue
    const arr = jobsByClient.get(j.client_id) ?? []
    arr.push(j); jobsByClient.set(j.client_id, arr)
  }
  const acceptedQuotes = (jobId: string) =>
    (quotesByJob.get(jobId) ?? []).filter((q) => ['accepted', 'complete', 'invoiced'].includes(q.status))

  return clients.map((c: any) => {
    const done = (jobsByClient.get(c.id) ?? [])
      .filter((j) => COMPLETED_JOB_STATUSES.includes(j.status))
      .map((j) => ({ ...j, _date: toDateStr(j.status_changed_at ?? j.created_at) }))
      .sort((a, b) => String(a._date ?? '').localeCompare(String(b._date ?? '')))

    const itemText: string[] = []
    let value = 0
    for (const j of done) {
      const best = acceptedQuotes(j.id).sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))[0]
      value += Number(best?.total ?? j.estimated_value ?? 0) || 0
      itemText.push(j.title ?? '', j.description ?? '', j.job_type ?? '',
        ...(best?.line_items ?? []).map((li: any) => String(li.description ?? '')))
    }

    const latest = done[done.length - 1]
    const latestQuote = latest ? acceptedQuotes(latest.id)[0] : null
    const latestItems = latestQuote?.line_items?.length
      ? latestQuote.line_items
      : (latest ? [latest.title ?? latest.description ?? ''] : [])
    const address  = latest?.address ?? c.address ?? null
    const lastDate = latest?._date ?? null

    const fullName = String(c.name ?? '').trim() || null
    const parts = fullName ? fullName.split(/\s+/) : []

    return {
      source: 'app' as const,
      source_ref: c.id,
      email: normaliseEmail(c.email),
      first_name: parts[0] ?? null,
      last_name: parts.length > 1 ? parts.slice(1).join(' ') : null,
      full_name: fullName,
      phone: c.phone ?? null,
      address,
      suburb: suburbFromAddress(address),
      city: null,
      client_id: c.id,
      first_job_at: done[0]?._date ?? null,
      last_job_at: lastDate,
      job_count: done.length,
      lifetime_value: Math.round(value * 100) / 100,
      services: deriveServices(itemText.join('\n')),
      last_job_summary: latest ? summariseJob(latestItems, address) : null,
      quote_nos: [],
      consent_basis: lastDate ? `clients:completed-job-${lastDate}` : null,
    } as Candidate
  })
}

// ── Merge / insert payload building ─────────────────────────────────────────

/** Keep whatever the office has already curated; only fill in blanks. */
const fill = (existing: any, incoming: any) =>
  (existing === null || existing === undefined || existing === '') ? (incoming ?? null) : existing

function buildInsert(c: Candidate, contactType: string, suppressed: boolean) {
  const hasHistory = c.job_count > 0 && !!c.last_job_at
  return {
    email: c.email,
    first_name: c.first_name, last_name: c.last_name, full_name: c.full_name,
    phone: c.phone, address: c.address, suburb: c.suburb, city: c.city,
    client_id: c.client_id,
    source: c.source, source_ref: c.source_ref,
    contact_type: contactType,
    first_job_at: c.first_job_at, last_job_at: c.last_job_at,
    job_count: c.job_count, lifetime_value: c.lifetime_value,
    services: c.services, last_job_summary: c.last_job_summary,
    // Inferred consent (UEMA s4) only where there is a real completed job, and
    // never for an address already on the global suppression list.
    consent_status: (hasHistory && !suppressed) ? 'inferred' : 'suppressed',
    consent_source: suppressed
      ? 'suppressed:on-do-not-email-list'
      : (c.consent_basis ?? `${c.source}:no-job-history`),
    consent_at: (hasHistory && !suppressed) ? new Date().toISOString() : null,
    notes: formatNotes('', { [c.source]: { jobs: c.job_count, value: c.lifetime_value } }, c.quote_nos),
  }
}

function applyMerge(existing: any, c: Candidate, contactType: string) {
  const { human, trailer, quotes } = parseTrailer(existing.notes)
  // Seed the trailer from the row's own source the first time we see a row
  // that predates the trailer format, so nothing is lost or double-counted.
  if (!Object.keys(trailer).length && (existing.job_count || existing.lifetime_value)) {
    trailer[existing.source] = {
      jobs: Number(existing.job_count ?? 0),
      value: Number(existing.lifetime_value ?? 0),
    }
  }
  trailer[c.source] = { jobs: c.job_count, value: c.lifetime_value }

  const jobCount = Object.values(trailer).reduce((s, t) => s + t.jobs, 0)
  // Xero is the accounting system of record, so its figure wins outright for
  // lifetime value; otherwise add up what the other sources know.
  const lifetimeValue = trailer.xero
    ? trailer.xero.value
    : Object.values(trailer).reduce((s, t) => s + t.value, 0)

  const services = Array.from(new Set([...(existing.services ?? []), ...c.services])).sort()
  const mergedQuotes = Array.from(new Set([...c.quote_nos, ...quotes])).slice(0, MAX_QUOTE_REFS)

  // Keep the existing summary unless this source's job is genuinely newer.
  const incomingIsNewer = !!c.last_job_at && (!existing.last_job_at || c.last_job_at > existing.last_job_at)
  const summary = (!existing.last_job_summary || incomingIsNewer)
    ? (c.last_job_summary ?? existing.last_job_summary ?? null)
    : existing.last_job_summary

  return {
    id: existing.id,
    email: existing.email ?? c.email,
    first_name: fill(existing.first_name, c.first_name),
    last_name:  fill(existing.last_name,  c.last_name),
    full_name:  fill(existing.full_name,  c.full_name),
    phone:      fill(existing.phone,      c.phone),
    address:    fill(existing.address,    c.address),
    suburb:     fill(existing.suburb,     c.suburb),
    city:       fill(existing.city,       c.city),
    client_id:  existing.client_id ?? c.client_id,
    // Only ever tighten the classification. If a row is already flagged
    // commercial — possibly by hand — an import must not reopen it to
    // marketing just because the incoming name looks residential.
    contact_type: existing.contact_type === 'commercial' ? 'commercial' : contactType,
    first_job_at: minDate(existing.first_job_at, c.first_job_at),
    last_job_at:  maxDate(existing.last_job_at,  c.last_job_at),
    job_count: jobCount,
    lifetime_value: Math.round(lifetimeValue * 100) / 100,
    services,
    last_job_summary: summary,
    notes: formatNotes(human, trailer, mergedQuotes),
    updated_at: new Date().toISOString(),
    // NOTE: consent_status, consent_source, consent_at, unsubscribe_token,
    // unsubscribed_at, unsubscribe_reason, bounced_at and complained_at are
    // DELIBERATELY absent from this patch. A re-import must never resurrect
    // someone who unsubscribed, bounced or complained, and must never silently
    // upgrade a 'suppressed' row to mailable. Changing consent is a human
    // decision made on the Campaigns page — never a side effect of an import.
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST required' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Verify caller is a full/office user.
  const callerToken = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(callerToken)
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401)
  const { data: profile } = await supabase.from('users').select('access_level').eq('id', caller.id).single()
  if (!['full', 'office'].includes(profile?.access_level ?? '')) {
    return json({ error: 'Forbidden — office access required' }, 403)
  }

  const deadline = Date.now() + 110_000

  try {
    const body   = await req.json().catch(() => ({}))
    const source = String(body.source ?? '')
    const dryRun = body.dry_run === true
    if (!['xero', 'quotient', 'clients'].includes(source)) {
      return json({ error: "source must be one of 'xero', 'quotient', 'clients'" }, 400)
    }

    const errors: RowError[] = []
    let candidates: Candidate[] = []
    let meta: Record<string, unknown> = {}

    if (source === 'xero') {
      const access = await getXeroAccess(supabase)
      const res = await loadXeroCandidates(access, deadline)
      candidates = res.candidates
      meta = { ...res.meta, tenant: access.tenantName }
    } else if (source === 'quotient') {
      const rows = body.contacts
      if (!Array.isArray(rows)) return json({ error: "'contacts' array required for source 'quotient'" }, 400)
      if (rows.length > MAX_ROWS) {
        return json({ error: `Too many contacts (${rows.length}). Max ${MAX_ROWS} per request — split the batch.` }, 413)
      }
      candidates = loadQuotientCandidates(rows, errors)
    } else {
      candidates = await loadClientCandidates(supabase)
    }

    const scanned = candidates.length + errors.length

    // Drop unusable addresses before anything touches the database.
    let skippedNoEmail = 0
    let skippedInvalid = errors.length
    const usable: Candidate[] = []
    for (const c of candidates) {
      if (!c.email) { skippedNoEmail++; continue }
      if (!isValidEmail(c.email)) { skippedInvalid++; continue }
      usable.push(c)
    }

    // Last write wins within a single batch, so a duplicated email in the
    // payload can't produce two conflicting inserts.
    const deduped = new Map<string, Candidate>()
    for (const c of usable) {
      const prev = deduped.get(c.email)
      if (prev) c.quote_nos = Array.from(new Set([...c.quote_nos, ...prev.quote_nos]))
      deduped.set(c.email, c)
    }

    // Existing list, the global do-not-email list, and the client roster.
    const existingRows = await pageAll(supabase, 'marketing_contacts',
      'id, email, source, source_ref, first_name, last_name, full_name, phone, address, suburb, city, ' +
      'client_id, contact_type, first_job_at, last_job_at, job_count, lifetime_value, services, ' +
      'last_job_summary, consent_status, notes')
    const byEmail     = new Map<string, any>()
    const bySourceRef = new Map<string, any>()
    const byQuoteNo   = new Map<string, any>()
    for (const r of existingRows) {
      byEmail.set(normaliseEmail(r.email), r)
      if (r.source_ref) bySourceRef.set(`${r.source}:${r.source_ref}`, r)
      for (const q of parseTrailer(r.notes).quotes) if (!byQuoteNo.has(q)) byQuoteNo.set(q, r)
    }

    const suppressions = new Set<string>()
    for (const s of await pageAll(supabase, 'email_suppressions', 'email, created_at')) {
      suppressions.add(normaliseEmail(s.email))
    }

    const clientByEmail  = new Map<string, string>()
    const clientByXeroId = new Map<string, string>()
    for (const cl of await pageAll(supabase, 'clients', 'id, email, xero_contact_id, created_at')) {
      if (cl.email) clientByEmail.set(normaliseEmail(cl.email), cl.id)
      if (cl.xero_contact_id) clientByXeroId.set(cl.xero_contact_id, cl.id)
    }

    // Build the writes.
    const inserts: any[] = []
    const updates: any[] = []
    const sample: any[] = []
    const takenIds = new Set<string>()
    let residential = 0, commercial = 0, suppressedNoHistory = 0, joinedOnQuoteNo = 0

    for (const c of deduped.values()) {
      // Link back to the operational client record where we can.
      c.client_id = c.client_id
        ?? (c.source === 'xero' && c.source_ref ? clientByXeroId.get(c.source_ref) ?? null : null)
        ?? clientByEmail.get(c.email) ?? null

      const contactType = classifyContact(
        c.full_name ?? [c.first_name, c.last_name].filter(Boolean).join(' '), c.email)
      if (contactType === 'commercial') commercial++; else residential++

      // Match in order of confidence: same source's own id, then the email
      // address, then the Quotient quote number shared with a Xero invoice.
      let existing = (c.source_ref ? bySourceRef.get(`${c.source}:${c.source_ref}`) : null)
        ?? byEmail.get(c.email) ?? null
      if (!existing) {
        for (const q of c.quote_nos) {
          const hit = byQuoteNo.get(q)
          if (hit && !takenIds.has(hit.id)) { existing = hit; joinedOnQuoteNo++; break }
        }
      }

      if (existing && !takenIds.has(existing.id)) {
        takenIds.add(existing.id)
        const patch = applyMerge(existing, c, contactType)
        updates.push(patch)
        if (sample.length < 5) sample.push({ action: 'update', existing_consent: existing.consent_status, ...patch })
      } else if (!existing) {
        const suppressed = suppressions.has(c.email)
        const row = buildInsert(c, contactType, suppressed)
        if (row.consent_status === 'suppressed') suppressedNoHistory++
        inserts.push(row)
        if (sample.length < 5) sample.push({ action: 'insert', ...row })
      }
      // else: two payload rows resolved to the same existing contact; the
      // first one already merged, so this one is a duplicate and is dropped.
    }

    let inserted = inserts.length
    let updated  = updates.length

    if (!dryRun) {
      inserted = await writeInserts(supabase, inserts, errors)
      updated  = await writeUpdates(supabase, updates, errors)
    }

    return json({
      ok: true,
      source,
      dry_run: dryRun,
      scanned,
      inserted,
      updated,
      skipped_no_email: skippedNoEmail,
      skipped_invalid: skippedInvalid,
      classified: { residential, commercial },
      suppressed_no_history: suppressedNoHistory,
      sample,
      errors: errors.slice(0, 50),
      error_count: errors.length,
      meta: { ...meta, joined_on_quote_no: joinedOnQuoteNo },
    })
  } catch (err: any) {
    console.error('import-marketing-contacts:', err)
    return json({ error: err?.message ?? String(err) }, 500)
  }
})

// ── Writers ─────────────────────────────────────────────────────────────────
// Chunked, with a per-row retry so one bad address can't sink a 4,000-row run.

async function writeInserts(supabase: any, rows: any[], errors: RowError[]) {
  let ok = 0
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const chunk = rows.slice(i, i + WRITE_CHUNK)
    const { error } = await supabase.from('marketing_contacts').insert(chunk)
    if (!error) { ok += chunk.length; continue }
    for (const row of chunk) {
      const { error: rowErr } = await supabase.from('marketing_contacts').insert(row)
      if (rowErr) errors.push({ index: -1, source_ref: row.source_ref, error: `${row.email}: ${rowErr.message}` })
      else ok++
    }
  }
  return ok
}

async function writeUpdates(supabase: any, rows: any[], errors: RowError[]) {
  let ok = 0
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const chunk = rows.slice(i, i + WRITE_CHUNK)
    // Every patch carries an identical key set, which PostgREST requires for a
    // bulk upsert — and none of those keys is a consent column.
    const { error } = await supabase.from('marketing_contacts').upsert(chunk, { onConflict: 'id' })
    if (!error) { ok += chunk.length; continue }
    for (const row of chunk) {
      const { id, ...patch } = row
      const { error: rowErr } = await supabase.from('marketing_contacts').update(patch).eq('id', id)
      if (rowErr) errors.push({ index: -1, source_ref: row.email, error: `${row.email}: ${rowErr.message}` })
      else ok++
    }
  }
  return ok
}
