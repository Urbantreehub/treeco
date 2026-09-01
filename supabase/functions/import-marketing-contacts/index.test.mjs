// Tests for the pure helpers in index.ts — summariseJob() and the contact
// matcher. Deno is not installed locally, so the function is transpiled with
// the frontend's esbuild and imported into Node.
//
//     node supabase/functions/import-marketing-contacts/index.test.mjs
//
// Exits non-zero on the first failure. No test framework: the edge function is
// Deno source and is not part of either vitest project.
//
// The summariseJob fixtures are NOT invented. Every `before` string below was
// taken from a real `marketing_contacts.last_job_summary` in production, and
// each `input` is a line item that reproduces that exact string under the
// version of summariseJob that shipped it — asserted, so the fixtures cannot
// quietly stop describing the bug they were written for.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const ESBUILD = join(REPO, 'frontend', 'node_modules', '.bin', 'esbuild')

/** Transpile index.ts to ESM Node can import: no Deno, no npm: specifier. */
function load(tsPath, workDir, name) {
  let code = readFileSync(tsPath, 'utf8')
    .replace(/^import \{ createClient \}.*$/m, '')            // npm: specifier
  code = 'const Deno = { serve() {}, env: { get: () => "" } };\n' + code
  const pre = join(workDir, `${name}.ts`)
  const out = join(workDir, `${name}.mjs`)
  writeFileSync(pre, code)
  execFileSync(ESBUILD, [pre, '--format=esm', '--target=node20', `--outfile=${out}`], { stdio: 'pipe' })
  return import(out)
}

let failures = 0
let checks = 0
function eq(actual, expected, label) {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`)
  }
}
function ok(cond, label) {
  checks++
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
}

// ── summariseJob fixtures ───────────────────────────────────────────────────
// `before`  — the real production output, reproduced by `input`.
// `after`   — what the fixed function must emit: clean, or null. Never broken.

const MALFORMED = [
  {
    label: '"all" kept in the subject + a measurement fragment as a subject',
    input: 'Tree pruning\nPrune all trees out the back\nReduce by approx 2 meters',
    before: 'pruned the all trees out the back and reduced the by approx 2 meters',
    after: 'pruned the trees out the back',
  },
  {
    label: 'an action bullet wearing a *subject*’s asterisks',
    input: 'Tree tidy\n*Pohutukawa out front*\n*Out one branch rubbing on service line*',
    before: 'tidied the pōhutukawa out front and the out one branch rubbing on service line',
    after: 'tidied the pōhutukawa out front',
  },
  {
    label: 'leading verb stripped off an action, leaving "out …"',
    input: 'Shape and tidy\n*Pohutukawa out front*\n*Prune out one branch rubbing on service line*',
    before: 'tidied the pōhutukawa out front and the out one branch rubbing on service line',
    after: 'tidied the pōhutukawa out front',
  },
  {
    label: 'an infinitive action treated as a subject',
    input: 'Tree reduction\n*Camellia near stairs*\n*To round over and shape*',
    before: 'reduced the camellia near stairs and the to round over and shape',
    after: 'reduced the camellia near stairs',
  },
  {
    label: 'trailing dangling preposition after truncation',
    input: 'Tree removal\nRemove all trees along lhs of driveway from front to rear',
    before: 'took out the all trees along lhs of driveway from',
    after: 'took out the trees along lhs of driveway',
  },
  {
    label: '"all" inside a *subject* group',
    input: 'Tree pruning\n*Prune all pohutukawas on property boundary*',
    before: 'pruned the all pōhutukawas on property boundary',
    after: 'pruned the pōhutukawas on property boundary',
  },
  {
    label: 'species window cutting mid-word ("round over" → "nd over")',
    input: 'Mulch delivery\nChip all mulch left on car pad\nRound over one camellia',
    before: 'chipped the all mulch left on car pad and the nd over one camellia',
    after: 'chipped the mulch left on car pad',
  },
  {
    label: 'a participle action ("leaving low stumps") as a second subject',
    input: 'Tree removal\n*Remove all cypress along rear lhs*\n*Leaving low stumps*',
    before: 'took out the all cypress along rear lhs and the leaving low stumps',
    after: 'took out the cypress along rear lhs',
  },
  {
    label: 'same, with a longer subject',
    input: 'Tree removal\n*Remove all trees on lhs of driveway pictured*\n*Leaving low stumps*',
    before: 'took out the all trees on lhs of driveway pictured and the leaving low stumps',
    after: 'took out the trees on lhs of driveway pictured',
  },
  {
    label: '"all" with the generic verb',
    input: '*Reduce all trees along rear of building*',
    before: 'did some work on the all trees along rear of building',
    after: 'did some work on the trees along rear of building',
  },
  {
    label: '"all" on a grind',
    input: 'Stump grinding\nGrind all trees between driveway and lhs',
    before: 'ground out the all trees between driveway and lhs',
    after: 'ground out the trees between driveway and lhs',
  },
  {
    label: 'an action joined onto the subject with "and"',
    input: 'Tree removal\nRemove all trees and poison stumps',
    before: 'took out the all trees and poison stumps',
    after: 'took out the trees',
  },
  {
    label: 'every group is boilerplate or an action — nothing usable survives',
    input: 'Tree removal\n*All cypress along rear lhs*\n*Leaving low stumps*',
    before: 'took out the leaving low stumps',
    after: null,
  },
]

// Real production summaries that are already correct. These must not move.
const GOOD = [
  ['Tree pruning\n*Banksia out the back*\n* Remove deadwood', 'took the deadwood out of the banksia out the back'],
  ['Tree tidy\n*Trees along lhs of driveway*\n* Tidy up', 'tidied the trees along lhs of driveway'],
  ['Stump grinding\n*Cabbage stump*\n* Grind out\n*Ficus*\n* Reduce by 20%', 'ground out the cabbage stump and reduced the ficus'],
  ['Tree removal\n*Ash and Silver Birch near entrance*\n*Trees leaving low stumps*',
    'took out the ash and silver birch near entrance and the trees leaving low stumps'],
  ['Tree pruning\n*Avocado and Cherry overhanging rhs*\n* Prune back', 'pruned the avocado and cherry overhanging rhs'],
  ['Tidy\n*Silver pear out the back*\n* Tidy up\n*Fig out the back*\n* Prune',
    'tidied the silver pear out the back and pruned the fig out the back'],
  ['Tree reduction\n*Pohutukawa out the back*\n* Reduce by 15%', 'reduced the pōhutukawa out the back'],
  ['Reduce cherry tree in rear yard', 'reduced the cherry tree in rear yard'],
]

// The examples the README documents. Behaviour here is contractual.
const DOCUMENTED = [
  [['Tree pruning\n*Pohutukawa*\n* Reduce by approx 15%'], 'reduced the pōhutukawa'],
  [['Tree pruning\n*2x Karo at front*\n* Flat top and round sides to tidy and shape'], 'tidied the two karo out front'],
  [['Tree prune\n*Sycamore*\n* Remove dead leader\n* Reduce canopy by 15%'], 'reduced the sycamore'],
  [['*Griselinia hedge* Square up top and sides\n*Olive* Remove leaving low stump'],
    'squared up the griselinia hedge and took out the olive'],
  [['Dismantle\n*Banksia*\n* Fell out leader'], 'took out the banksia'],
  [['Reduce pittosporum / 1M of Magnolia / Remove small fruit tree'], 'reduced the pittosporum and the magnolia'],
  [['Travel', 'Green waste disposal'], null],
  [['*All cuttings taken off site*'], null],
  [['12 Marine Parade\nQuote Number: 5515'], null],
  [[null, '', '   '], null],
  [[{ description: 'Hedge trim\n*Griselinia hedge*\n* Square up' }], 'squared up the griselinia hedge'],
]

/** Patterns that make a summary unusable in "We {{summary}} for you …". */
export const MALFORMED_PATTERNS = [
  [/(^|\s)(the|a|an)\s+all\b/, 'determiner + "all"'],
  [/(^|\s)(the|a|an)\s+(and|or|by|to|at|on|in|of|off|for|from|with|out|over|under|up|down|into|near|along|between|through|leaving|left|approx|nd)\b/,
    'determiner + a fragment'],
  [/(\s|^)(and|or|with|for|to|on|of|the|a|an|in|at|by|from|near|along|out|over|into|up|down)$/, 'dangling trailing word'],
  [/(^|\s)the\s+the\b/, 'doubled determiner'],
  [/^\s*(and|or|the|a|an|by|to|of|in|on|at)\b/, 'does not start with a verb'],
  [/[.;:,]\s*$/, 'trailing punctuation'],
  [/[A-Z]/, 'uppercase'],
]

export function malformedReason(s) {
  if (s == null) return null            // null is a supported, correct outcome
  if (!s.trim()) return 'empty'
  for (const [re, why] of MALFORMED_PATTERNS) if (re.test(s)) return why
  return null
}

// ── Matching fixtures ───────────────────────────────────────────────────────
// The 30 real duplicates are one person under two email addresses. Five of them:
const SAME_PERSON = [
  ['Alan Knowsley',    'Khandallah',   'aknowsley@xtra.co.nz',           'aknowsley@raineycollins.co.nz'],
  ['Brian Johnston',   'Karori',       'brianandsandyjohnston@xtra.co.nz', 'brian.johnston@xtra.co.nz'],
  ['David Evans',      'Ngaio',        'davidevans74@gmail.com',         'davidevans01@hotmail.com'],
  ['Bronwen Green',    'Seatoun',      'bronwen.green01@gmail.com',      'bgreen01@xtra.co.nz'],
  ['David Cunningham', 'Johnsonville', 'cunningdavid@gmail.com',         'cunninghamd205@gmail.com'],
]

// Different people at ONE property. Merging these would take away one person's
// own ability to unsubscribe, so they must stay two rows.
const SAME_ADDRESS_DIFFERENT_PEOPLE = [
  ['Khandallah', 'Brent Cresswell', 'Anne Haase'],       // 29 Woodmancote Road
  ['Khandallah', 'Samuel Hack',     'Lianne Hack'],      // 48 Satara Crescent
  ['Seatoun',    'Craig Davis',     'Elizabeth Davis'],  // 110 Inglis St
]

const row = (id, email, full_name, suburb, extra = {}) => ({
  id, email, full_name, suburb, source: 'xero', source_ref: `x-${id}`,
  first_name: full_name.split(' ')[0], last_name: full_name.split(' ').slice(1).join(' '),
  notes: null, job_count: 1, lifetime_value: 100, services: [], consent_status: 'inferred',
  ...extra,
})

const candidate = (email, full_name, suburb, extra = {}) => ({
  source: 'quotient', source_ref: null, email, full_name, suburb,
  first_name: full_name ? full_name.split(' ')[0] : null,
  last_name: full_name ? full_name.split(' ').slice(1).join(' ') : null,
  quote_nos: [], job_count: 1, lifetime_value: 0, services: [],
  first_job_at: '2024-01-01', last_job_at: '2024-01-01', last_job_summary: null,
  client_id: null, phone: null, address: null, city: null, consent_basis: null,
  ...extra,
})

/** Build the same indexes the handler builds, from a set of existing rows. */
function buildIndex(m, rows) {
  const idx = {
    bySourceRef: new Map(), byEmail: new Map(), byQuoteNo: new Map(),
    byNameSuburb: new Map(), ambiguousKeys: new Set(), takenIds: new Set(),
  }
  for (const r of rows) {
    idx.byEmail.set(m.normaliseEmail(r.email), r)
    if (r.source_ref) idx.bySourceRef.set(`${r.source}:${r.source_ref}`, r)
    const nk = m.nameSuburbKey(r.full_name, r.suburb)
    if (nk) {
      if (idx.byNameSuburb.has(nk)) idx.ambiguousKeys.add(nk)
      else idx.byNameSuburb.set(nk, r)
    }
  }
  return idx
}

// ── Run ─────────────────────────────────────────────────────────────────────

const work = mkdtempSync(join(tmpdir(), 'import-marketing-contacts-'))
try {
  const m = await load(join(HERE, 'index.ts'), work, 'current')
  const { summariseJob, nameSuburbKey, normaliseKey, matchExistingContact, pickSummary, applyMerge } = m

  // 1. The fixtures still describe the bug: `before` must be reproducible by
  //    the shipped version. Skipped (with a warning, not a failure) when git
  //    cannot hand us the committed file — the rest of the suite still runs.
  let shipped = null
  try {
    const head = execFileSync('git', ['show', 'HEAD:supabase/functions/import-marketing-contacts/index.ts'],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const p = join(work, 'head-src.ts')
    writeFileSync(p, head)
    shipped = await load(p, work, 'head')
  } catch {
    console.warn('note: could not load the committed index.ts from git; skipping the "before" assertions')
  }
  if (shipped && shipped.summariseJob) {
    for (const f of MALFORMED) {
      eq(shipped.summariseJob([f.input]), f.before, `fixture still reproduces the bug — ${f.label}`)
    }
    for (const [input, expected] of GOOD) {
      eq(shipped.summariseJob([input]), expected, `fixture reproduces the good output — ${expected}`)
    }
  }

  // 2. Every malformed production string is now clean or null …
  for (const f of MALFORMED) {
    const out = summariseJob([f.input])
    eq(out, f.after, `fixed — ${f.label}`)
    eq(malformedReason(out), null, `no longer malformed — ${f.label}`)
  }

  // 3. … and nothing that was already correct moved.
  for (const [input, expected] of GOOD) {
    eq(summariseJob([input]), expected, `unchanged — ${expected}`)
    eq(malformedReason(expected), null, `the good fixture itself is clean — ${expected}`)
  }

  // 4. The documented contract.
  for (const [input, expected] of DOCUMENTED) {
    eq(summariseJob(input), expected, `README — ${JSON.stringify(expected)}`)
  }

  // 5. Odds and ends that must never throw or leak a fragment.
  for (const junk of [null, undefined, '', '   ', [], [''], ['*'], ['***'], ['and'], ['by approx 2 meters'],
    ['Remove all'], ['all'], ['To round over and shape'], ['Leaving low stumps'], ['*Leaving low stumps*'],
    ['Travel'], ['Deposit'], ['Quote Number: 5515'], [{}], [{ description: null }], [42], [['nested']]]) {
    const out = summariseJob(junk)
    ok(out === null || typeof out === 'string', `returns null or a string — ${JSON.stringify(junk)}`)
    eq(malformedReason(out), null, `never malformed — ${JSON.stringify(junk)}`)
  }

  // 6. Macronised te reo survives.
  eq(summariseJob(['Tree pruning\n*Pohutukawa*\n* Reduce']), 'reduced the pōhutukawa', 'macron: pohutukawa')
  eq(summariseJob(['Tree pruning\n*Rata*\n* Reduce']), 'reduced the rātā', 'macron: rata')
  eq(summariseJob(['Tree pruning\n*Puriri*\n* Reduce']), 'reduced the pūriri', 'macron: puriri')
  eq(summariseJob(['Tree pruning\n*Kowhai*\n* Reduce']), 'reduced the kōwhai', 'macron: kowhai')
  // "*All cuttings taken off site*" is boilerplate, but "*All pohutukawas on
  // boundary*" is a real subject that happens to start the same way. The
  // asterisk parser discards both; the free-text fallback then renders the
  // second one properly instead of emitting "the all pōhutukawas".
  eq(summariseJob(['Tree removal\n*All pohutukawas on boundary*\n* Fell']),
    'took out the pōhutukawas on boundary', 'a real "All …" subject renders without the "all"')
  eq(summariseJob(['Tree removal\n*All cuttings taken off site*\n* Fell']), null,
    'genuine boilerplate is still discarded')

  // 6b. Length: two phrases that will not fit fall back to the leading one
  //     whole, rather than being cut in half at 80 characters.
  {
    const long = summariseJob([
      'Tree work\n*Pohutukawa on the front boundary by the letterbox*\n* Reduce by 15%\n' +
      '*Silver birch at the rear of the property near the shed*\n* Reduce by 15%'])
    ok(long.length <= 80, `a long summary is kept under 80 chars (${long.length})`)
    eq(malformedReason(long), null, 'a long summary is not cut into a fragment')
    ok(!/\sand\s*$/.test(long), 'a long summary never ends on "and"')
  }

  // ── The name + suburb match key ───────────────────────────────────────────

  eq(normaliseKey('  Alan  KNOWSLEY-Smith '), 'alan knowsley smith', 'normaliseKey collapses and lowercases')
  eq(normaliseKey('Khandallah'), 'khandallah', 'normaliseKey: suburb')
  eq(nameSuburbKey('Alan Knowsley', 'Khandallah'), 'alan knowsley|khandallah', 'nameSuburbKey shape')
  eq(nameSuburbKey('ALAN  knowsley', ' khandallah '), 'alan knowsley|khandallah', 'nameSuburbKey normalises both halves')

  // Guards: a missing or thin half yields no key at all.
  eq(nameSuburbKey('Alan Knowsley', null), null, 'no suburb → no key')
  eq(nameSuburbKey('Alan Knowsley', ''), null, 'blank suburb → no key')
  eq(nameSuburbKey(null, 'Khandallah'), null, 'no name → no key')
  eq(nameSuburbKey('Alan', 'Khandallah'), null, 'given name only → no key')
  eq(nameSuburbKey('Jo', 'Karori'), null, 'too short → no key')
  eq(nameSuburbKey('Alan Knowsley', 'NZ'), null, 'suburb too short → no key')

  // 7. The 30 real duplicates: same person, different address in each system.
  for (const [name, suburb, quotientEmail, xeroEmail] of SAME_PERSON) {
    const existing = row('r1', xeroEmail, name, suburb)
    const idx = buildIndex(m, [existing])
    const c = candidate(quotientEmail, name, suburb)
    const hit = matchExistingContact(c, idx)
    eq(hit.matched_by, 'name_suburb', `merges on name+suburb — ${name}`)
    ok(hit.row === existing, `merges into the right row — ${name}`)
  }

  // The same rows still match on email first when the addresses agree.
  {
    const existing = row('r1', 'alan@example.co.nz', 'Alan Knowsley', 'Khandallah')
    const idx = buildIndex(m, [existing])
    eq(matchExistingContact(candidate('alan@example.co.nz', 'Alan Knowsley', 'Khandallah'), idx).matched_by,
      'email', 'email still wins over name+suburb')
  }

  // 8. Two different people at one property stay two rows.
  for (const [suburb, personA, personB] of SAME_ADDRESS_DIFFERENT_PEOPLE) {
    const existing = row('r1', 'a@example.co.nz', personA, suburb)
    const idx = buildIndex(m, [existing])
    const hit = matchExistingContact(candidate('b@example.co.nz', personB, suburb), idx)
    eq(hit.matched_by, null, `stays separate — ${personA} vs ${personB} (${suburb})`)
    eq(hit.row, null, `no row claimed — ${personA} vs ${personB}`)
  }

  // 9. A row with no suburb falls through to an insert rather than guessing.
  {
    const existing = row('r1', 'jsmith@example.co.nz', 'John Smith', 'Karori')
    const idx = buildIndex(m, [existing])
    eq(matchExistingContact(candidate('john.smith@gmail.com', 'John Smith', null), idx).matched_by, null,
      'incoming row with no suburb → insert')
    const noSuburbExisting = row('r2', 'jsmith@example.co.nz', 'John Smith', null)
    eq(matchExistingContact(candidate('john.smith@gmail.com', 'John Smith', 'Karori'),
      buildIndex(m, [noSuburbExisting])).matched_by, null, 'existing row with no suburb → insert')
    eq(matchExistingContact(candidate('john.smith@gmail.com', null, 'Karori'), idx).matched_by, null,
      'incoming row with no name → insert')
  }

  // 10. Same name, different suburb — two different John Smiths.
  {
    const idx = buildIndex(m, [row('r1', 'jsmith@example.co.nz', 'John Smith', 'Karori')])
    eq(matchExistingContact(candidate('john.smith@gmail.com', 'John Smith', 'Island Bay'), idx).matched_by, null,
      'same name, different suburb → insert')
  }

  // 11. Two existing people already share a name+suburb: the key identifies
  //     neither, so a third row must not be swallowed by whichever came first.
  {
    const idx = buildIndex(m, [
      row('r1', 'js1@example.co.nz', 'John Smith', 'Karori'),
      row('r2', 'js2@example.co.nz', 'John Smith', 'Karori'),
    ])
    ok(idx.ambiguousKeys.has('john smith|karori'), 'a duplicated key is marked ambiguous')
    eq(matchExistingContact(candidate('js3@gmail.com', 'John Smith', 'Karori'), idx).matched_by, null,
      'an ambiguous key never matches')
  }

  // 12. A row already claimed this run is not claimed twice.
  {
    const existing = row('r1', 'aknowsley@raineycollins.co.nz', 'Alan Knowsley', 'Khandallah')
    const idx = buildIndex(m, [existing])
    idx.takenIds.add('r1')
    eq(matchExistingContact(candidate('aknowsley@xtra.co.nz', 'Alan Knowsley', 'Khandallah'), idx).matched_by, null,
      'a taken row is not matched again')
  }

  // 13. (source, source_ref) still outranks everything.
  {
    const existing = row('r1', 'other@example.co.nz', 'Alan Knowsley', 'Khandallah',
      { source: 'quotient', source_ref: '1001' })
    const idx = buildIndex(m, [existing])
    const c = candidate('aknowsley@xtra.co.nz', 'Alan Knowsley', 'Khandallah', { source_ref: '1001' })
    eq(matchExistingContact(c, idx).matched_by, 'source_ref', 'source_ref wins')
  }

  // 14. On a name+suburb merge the row keeps the email already on file, the
  //     other address is preserved in the notes trailer, and consent is not
  //     touched.
  {
    const existing = row('r1', 'aknowsley@raineycollins.co.nz', 'Alan Knowsley', 'Khandallah', {
      notes: 'Back gate is unlocked.\n[import] xero:jobs=3;value=1840.00\n[quotes] 5515',
      job_count: 3, lifetime_value: 1840, first_job_at: '2019-05-02', last_job_at: '2024-03-11',
      services: ['pruning'], contact_type: 'residential', consent_status: 'unsubscribed',
    })
    const c = candidate('aknowsley@xtra.co.nz', 'Alan Knowsley', 'Khandallah',
      { job_count: 2, lifetime_value: 900, quote_nos: ['5610'], services: ['stump'] })
    const patch = applyMerge(existing, c, 'residential')

    eq(patch.email, 'aknowsley@raineycollins.co.nz', 'the address already on file stays primary')
    ok(String(patch.notes).includes('[alt-emails] aknowsley@xtra.co.nz'), 'the alternate address is preserved')
    ok(String(patch.notes).startsWith('Back gate is unlocked.'), 'human notes are untouched')
    ok(String(patch.notes).includes('[quotes] 5610 5515'), 'quote refs are merged')
    eq(patch.job_count, 5, 'job counts are summed across sources')
    for (const k of ['consent_status', 'consent_source', 'consent_at', 'unsubscribed_at',
      'unsubscribe_token', 'bounced_at', 'complained_at']) {
      ok(!(k in patch), `the merge patch never carries ${k}`)
    }
    // Re-running the same merge is idempotent: no duplicate alt-email line.
    const again = applyMerge({ ...existing, notes: patch.notes }, c, 'residential')
    eq(String(again.notes).match(/aknowsley@xtra\.co\.nz/g).length, 1, 'alt emails do not accumulate')
  }

  // 15. pickSummary — what a re-import does to last_job_summary.
  {
    const existing = { last_job_at: '2024-03-11', last_job_summary: 'pruned the all trees out the back' }
    const same = { last_job_at: '2024-03-11', last_job_summary: 'pruned the trees out the back' }
    eq(pickSummary(existing, same), 'pruned the all trees out the back',
      'by default a re-import KEEPS the stored summary')
    eq(pickSummary(existing, same, true), 'pruned the trees out the back',
      'refresh_summaries re-renders the same job')
    eq(pickSummary({ last_job_at: '2024-03-11', last_job_summary: null }, same),
      'pruned the trees out the back', 'an empty summary is always filled in')
    eq(pickSummary(existing, { last_job_at: '2025-06-02', last_job_summary: 'reduced the pōhutukawa' }),
      'reduced the pōhutukawa', 'a genuinely newer job wins without the flag')
    eq(pickSummary(existing, { last_job_at: '2023-01-01', last_job_summary: 'ground out the stump' }, true),
      'pruned the all trees out the back', 'refresh never lets an OLDER job overwrite')
    eq(pickSummary(existing, { last_job_at: '2024-03-11', last_job_summary: null }, true),
      'pruned the all trees out the back', 'refresh never blanks a summary')
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`${checks - failures}/${checks} checks passed`)
if (failures) { console.error(`${failures} FAILED`); process.exit(1) }
