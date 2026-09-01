import { describe, it, expect } from 'vitest'
import {
  MERGE_TAGS, MERGE_TAG_KEYS, SEGMENT_PRESETS, MONTH_BUCKETS, SUBURB_FALLBACK_THRESHOLD, SERVICE_LABELS,
  renderPreview, mergeDataFor, formatDateNz, greetingName, emptyTagsIn,
  tagsIn, unknownTagsIn,
  validateCampaign, describeAudience, matchesAudience, bucketFor,
  suburbCoverage, chooseSubject,
  IMPORT_SOURCES, IMPORT_MAX_ROWS, importSource, parseQuotientPaste, pasteFingerprint,
  summaryRows, mailableFromSummary, describeImportOutcome, sampleName, explainImportError,
} from './campaigns'

// A campaign that passes every rule — each test below breaks exactly one thing,
// so a failure names the rule that regressed.
const GOOD = {
  name: 'Winter pruning 2026',
  subject: 'Time to book your winter pruning, {{first_name}}?',
  body: 'Hi {{first_name}},\n\nIt has been {{months_since_job}} months since {{last_job_summary}}.\n\nBook here: https://www.urbantreeservices.net\n\nJosh',
  cta_url: 'https://www.urbantreeservices.net',
}

describe('MERGE_TAGS', () => {
  it('covers every tag the sender supports', () => {
    expect(MERGE_TAGS.map(t => t.tag)).toEqual([
      'first_name', 'last_name', 'suburb', 'last_job_summary',
      'months_since_job', 'offer_code', 'offer_percent', 'offer_expires',
    ])
  })
  it('gives every tag a human label and an example', () => {
    for (const t of MERGE_TAGS) {
      expect(t.label).toBeTruthy()
      expect(t.example).toBeTruthy()
    }
  })
})

describe('SERVICE_LABELS', () => {
  // The authoritative list is SERVICE_PATTERNS in
  // supabase/functions/import-marketing-contacts/index.ts. If a tag is added
  // there and not here, the audience filter shows a raw slug — so this test
  // exists to fail loudly when the two drift apart.
  const IMPORTER_TAGS = ['pruning', 'reduction', 'removal', 'hedge', 'stump', 'planting', 'emergency']

  it('labels every tag the importer can emit', () => {
    for (const tag of IMPORTER_TAGS) {
      expect(SERVICE_LABELS[tag], `no label for service tag "${tag}"`).toBeTruthy()
    }
  })
  it('has no labels for tags the importer never emits', () => {
    expect(Object.keys(SERVICE_LABELS).sort()).toEqual([...IMPORTER_TAGS].sort())
  })
  it('reads correctly inside the audience sentence', () => {
    expect(describeAudience({ services: ['reduction'] }))
      .toBe('Residential customers who have had crown reductions done')
    expect(describeAudience({ services: ['emergency'] }))
      .toBe('Residential customers who have had storm & emergency work done')
  })
})

describe('renderPreview', () => {
  const contact = { first_name: 'Margaret', suburb: 'Karori', months_since_job: 14 }

  it('substitutes known tags', () => {
    expect(renderPreview('Hi {{first_name}} in {{suburb}}', contact)).toBe('Hi Margaret in Karori')
  })
  it('tolerates whitespace inside the braces', () => {
    expect(renderPreview('Hi {{ first_name }}', contact)).toBe('Hi Margaret')
  })
  it('coerces numbers to text', () => {
    expect(renderPreview('{{months_since_job}} months', contact)).toBe('14 months')
  })
  it('renders an unknown tag as empty rather than leaking it', () => {
    expect(renderPreview('Hi {{nonsense}}!', contact)).toBe('Hi !')
  })
  it('renders a known-but-missing value as empty', () => {
    expect(renderPreview('Hi {{last_name}}.', contact)).toBe('Hi .')
  })
  it('handles an empty or missing body', () => {
    expect(renderPreview('', contact)).toBe('')
    expect(renderPreview(null, contact)).toBe('')
    expect(renderPreview(undefined)).toBe('')
  })
  it('works with no contact at all', () => {
    expect(renderPreview('Hi {{first_name}}')).toBe('Hi ')
  })
  // The preview has to show what the sender produces. Leaving {{first-name}}
  // visible here would tell the office the tag survives to the inbox, while the
  // composer's warning right beside it says the opposite.
  it('collapses a malformed tag, the same way the sender does', () => {
    expect(renderPreview('Hi {{first-name}} and {{last.job}}!', contact)).toBe('Hi  and !')
    expect(renderPreview('Hi {{first name}}.', contact)).toBe('Hi .')
  })
  it('does not render a value off the prototype chain', () => {
    expect(renderPreview('{{constructor}}', contact)).toBe('')
  })
  it('leaves single braces and unclosed tags alone', () => {
    expect(renderPreview('{first_name} {{unclosed', contact)).toBe('{first_name} {{unclosed')
  })
})

describe('mergeDataFor', () => {
  // These fallbacks must match mergeValues() in _shared/campaign.ts exactly —
  // only first_name has one. Anything friendlier here would hide a real gap.
  it('greets by name, with a neutral fallback', () => {
    expect(mergeDataFor({}, {}).first_name).toBe('there')
    expect(renderPreview('Hi {{first_name}},', mergeDataFor({}, {}))).toBe('Hi there,')
  })
  it('leaves a missing suburb and job summary genuinely empty', () => {
    const d = mergeDataFor({ first_name: 'Sue' }, {})
    expect(d.suburb).toBe('')
    expect(d.last_job_summary).toBe('')
    // The gap the composer has to warn about, reproduced faithfully.
    expect(renderPreview('Your trees at {{suburb}} — about due?', d))
      .toBe('Your trees at  — about due?')
  })
  it('trims whitespace-only values to empty', () => {
    expect(mergeDataFor({ suburb: '   ' }, {}).suburb).toBe('')
  })
  it('pulls the offer from the campaign, not the contact', () => {
    const d = mergeDataFor({ first_name: 'Sue' }, { offer_code: 'WINTER15', offer_percent: 15, offer_expires_on: '2026-08-31' })
    expect(d.offer_code).toBe('WINTER15')
    expect(d.offer_percent).toBe('15')
    expect(d.offer_expires).toBe('31 August 2026')
  })
  it('leaves the offer blank when there is none', () => {
    const d = mergeDataFor({ first_name: 'Sue' }, {})
    expect(d.offer_code).toBe('')
    expect(d.offer_percent).toBe('')
    expect(d.offer_expires).toBe('')
  })
})

describe('formatDateNz', () => {
  it('formats a DATE the way a New Zealander reads it', () => {
    expect(formatDateNz('2026-08-31')).toBe('31 August 2026')
  })
  it('returns empty for null or rubbish', () => {
    expect(formatDateNz(null)).toBe('')
    expect(formatDateNz('not a date')).toBe('')
  })
})

describe('greetingName', () => {
  it('uses the first name, normalising imported casing', () => {
    expect(greetingName({ first_name: 'Colleen' })).toBe('Colleen')
    expect(greetingName({ first_name: 'JOHN' })).toBe('John')
    expect(greetingName({ first_name: 'john' })).toBe('John')
  })
  it('falls back to the first word of a full name', () => {
    expect(greetingName({ full_name: 'Kath Steenson' })).toBe('Kath')
  })
  it('falls back to "there" when there is no usable name', () => {
    expect(greetingName({})).toBe('there')
    expect(greetingName({ first_name: '   ' })).toBe('there')
  })
  it('does not greet a company record by name', () => {
    expect(greetingName({ first_name: 'Nitro Trust' })).toBe('there')
    expect(greetingName({ first_name: 'Coastal Properties Ltd' })).toBe('there')
    expect(greetingName({ first_name: 'Anne', last_name: 'Haase Trustees' })).toBe('there')
  })
  it('rejects names with digits, or absurd lengths', () => {
    expect(greetingName({ first_name: 'User42' })).toBe('there')
    expect(greetingName({ first_name: 'J' })).toBe('there')
    expect(greetingName({ first_name: 'x'.repeat(21) })).toBe('there')
  })
  it('accepts macronised and punctuated names', () => {
    expect(greetingName({ first_name: 'Māia' })).toBe('Māia')
    expect(greetingName({ first_name: "O'Brien" })).toBe("O'brien")
  })
})

describe('emptyTagsIn', () => {
  it('names the tags that would render as a gap', () => {
    const data = mergeDataFor({ first_name: 'Sue' }, {})
    expect(emptyTagsIn('Your trees at {{suburb}} — about due?', data)).toEqual(['suburb'])
  })
  it('returns nothing when every tag resolves', () => {
    const data = mergeDataFor({ first_name: 'Sue', suburb: 'Karori' }, {})
    expect(emptyTagsIn('Hi {{first_name}} in {{suburb}}', data)).toEqual([])
  })
  it('reports each tag once and counts unknown tags as gaps', () => {
    expect(emptyTagsIn('{{suburb}} {{suburb}} {{nonsense}}', {})).toEqual(['suburb', 'nonsense'])
  })
  it('treats a whitespace-only value as a gap', () => {
    expect(emptyTagsIn('{{suburb}}', { suburb: '  ' })).toEqual(['suburb'])
  })
  it('handles empty input', () => {
    expect(emptyTagsIn('', {})).toEqual([])
    expect(emptyTagsIn(null, {})).toEqual([])
  })

  // The regression this whole section exists for: the old [a-zA-Z0-9_]+ pattern
  // matched the sender's resolver exactly, which meant every merge tag a human
  // actually mistypes was invisible to the composer.
  it.each(['first-name', 'first name', 'last.job', 'First_Name', 'suburb!'])(
    'sees the malformed tag {{%s}}', bad => {
      expect(emptyTagsIn(`Hi {{${bad}}},`, { first_name: 'Sue' })).toEqual([bad])
    })

  it('still reports a malformed tag even when a same-named value exists', () => {
    // {{first name}} is not first_name — nothing resolves it.
    expect(emptyTagsIn('Hi {{first name}}', { 'first name': '' })).toEqual(['first name'])
  })

  it('does not resolve a tag off the prototype chain', () => {
    expect(emptyTagsIn('{{constructor}} {{toString}}', {})).toEqual(['constructor', 'toString'])
  })

  it('normalises padding inside the braces', () => {
    expect(emptyTagsIn('{{  suburb  }}', { suburb: '' })).toEqual(['suburb'])
  })
})

describe('tagsIn', () => {
  it('lists every tag written, once each, in order', () => {
    expect(tagsIn('Hi {{first_name}} in {{suburb}} — {{first_name}} again'))
      .toEqual(['first_name', 'suburb'])
  })
  it('catches malformed tags the sender cannot resolve', () => {
    expect(tagsIn('{{first-name}} {{last.job}} {{first name}}'))
      .toEqual(['first-name', 'last.job', 'first name'])
  })
  it('ignores single braces and unclosed tags', () => {
    expect(tagsIn('{first_name} and {{unclosed')).toEqual([])
  })
  it('handles empty input', () => {
    expect(tagsIn('')).toEqual([])
    expect(tagsIn(null)).toEqual([])
    expect(tagsIn(undefined)).toEqual([])
  })
})

describe('unknownTagsIn', () => {
  it('accepts every tag MERGE_TAGS documents', () => {
    const all = MERGE_TAG_KEYS.map(t => `{{${t}}}`).join(' ')
    expect(unknownTagsIn(all)).toEqual([])
  })
  it('flags a mistyped tag', () => {
    expect(unknownTagsIn('Hi {{first-name}},')).toEqual(['first-name'])
    expect(unknownTagsIn('Hi {{first name}},')).toEqual(['first name'])
    expect(unknownTagsIn('We {{last.job}} for you')).toEqual(['last.job'])
  })
  it('is case-sensitive — {{First_Name}} is not a tag the sender knows', () => {
    expect(unknownTagsIn('{{First_Name}}')).toEqual(['First_Name'])
  })
  it('flags an outright invented tag', () => {
    expect(unknownTagsIn('{{tree_species}}')).toEqual(['tree_species'])
  })
  it('finds nothing in copy with no tags at all', () => {
    expect(unknownTagsIn('Just a plain note from Josh.')).toEqual([])
  })
})

describe('suburbCoverage', () => {
  it('counts how much of an audience has a suburb', () => {
    const c = suburbCoverage([{ suburb: 'Karori' }, { suburb: '' }, { suburb: null }, {}])
    expect(c.total).toBe(4)
    expect(c.withSuburb).toBe(1)
    expect(c.without).toBe(3)
    expect(c.shareWithout).toBe(0.75)
  })
  it('does not divide by zero on an empty list', () => {
    expect(suburbCoverage([])).toMatchObject({ total: 0, without: 0, shareWithout: 0 })
  })
})

describe('chooseSubject', () => {
  const tpl = {
    subject: 'Your trees at {{suburb}} — about due?',
    subjectFallback: 'Checking in on your trees',
  }
  const withSuburb    = Array.from({ length: 10 }, () => ({ suburb: 'Karori' }))
  const halfWithout   = Array.from({ length: 10 }, (_, i) => ({ suburb: i < 5 ? 'Karori' : '' }))
  const oneWithout    = Array.from({ length: 10 }, (_, i) => ({ suburb: i === 0 ? '' : 'Karori' }))

  it('keeps the personalised subject when the whole audience has a suburb', () => {
    const r = chooseSubject(tpl, withSuburb)
    expect(r.subject).toBe(tpl.subject)
    expect(r.usedFallback).toBe(false)
  })
  it('swaps to the fallback when a high proportion have no suburb', () => {
    const r = chooseSubject(tpl, halfWithout)
    expect(r.subject).toBe('Checking in on your trees')
    expect(r.usedFallback).toBe(true)
    expect(r.without).toBe(5)
  })
  it('tolerates a small minority below the threshold', () => {
    expect(SUBURB_FALLBACK_THRESHOLD).toBe(0.2)
    expect(chooseSubject(tpl, oneWithout).usedFallback).toBe(false)
  })
  it('honours an explicit threshold', () => {
    expect(chooseSubject(tpl, oneWithout, 0).usedFallback).toBe(true)
  })
  it('leaves a subject that does not use {{suburb}} alone', () => {
    const plain = { subject: 'Booking in the annual trim' }
    const r = chooseSubject(plain, halfWithout)
    expect(r.subject).toBe('Booking in the annual trim')
    expect(r.usedFallback).toBe(false)
    expect(r.usesSuburb).toBe(false)
  })
  it('cannot swap when the template has no fallback', () => {
    const r = chooseSubject({ subject: 'Trees in {{suburb}}' }, halfWithout)
    expect(r.subject).toBe('Trees in {{suburb}}')
    expect(r.usedFallback).toBe(false)
  })
  it('does not swap on an empty audience', () => {
    expect(chooseSubject(tpl, []).usedFallback).toBe(false)
  })
})

describe('validateCampaign', () => {
  it('passes a well-formed campaign', () => {
    expect(validateCampaign(GOOD)).toEqual([])
  })

  it('flags a missing name', () => {
    const p = validateCampaign({ ...GOOD, name: '  ' })
    expect(p.join(' ')).toMatch(/name/i)
  })

  it('flags a missing subject', () => {
    const p = validateCampaign({ ...GOOD, subject: '' })
    expect(p.join(' ')).toMatch(/subject line/i)
  })

  it('flags a missing body', () => {
    const p = validateCampaign({ ...GOOD, body: '' })
    expect(p.join(' ')).toMatch(/body is empty/i)
  })

  it('does not pile on body rules when the body is empty', () => {
    const p = validateCampaign({ ...GOOD, body: '' })
    expect(p).toHaveLength(1)
  })

  it('flags a subject over 60 characters', () => {
    const long = 'Winter is the right time to prune your deciduous trees before spring'
    expect(long.length).toBeGreaterThan(60)
    expect(validateCampaign({ ...GOOD, subject: long }).join(' ')).toMatch(/60/)
  })

  it('accepts a subject of exactly 60 characters', () => {
    const sixty = 'x'.repeat(60)
    expect(validateCampaign({ ...GOOD, subject: sixty }).join(' ')).not.toMatch(/60 gets cut off/)
  })

  it('flags a body with no {{first_name}}', () => {
    const body = 'Hi there,\n\nBook here: https://www.urbantreeservices.net'
    expect(validateCampaign({ ...GOOD, body }).join(' ')).toMatch(/first_name/)
  })

  // The sender appends the CTA line only when the body doesn't already carry
  // the link, so a body without it still goes out with exactly one way to act
  // on the email. That makes this advice about how the email reads, not a
  // defect — the message has to say what the sender will do rather than
  // instruct the office to fix something that isn't broken.
  it('mentions the CTA url missing from the body, as advice', () => {
    const body = 'Hi {{first_name}}, give us a call some time.'
    const p = validateCampaign({ ...GOOD, body })
    expect(p.join(' ')).toMatch(/call-to-action link/i)
    expect(p.join(' ')).toMatch(/the sender will add it/i)
  })

  it('flags a missing CTA url outright — that one really is a broken email', () => {
    const p = validateCampaign({ ...GOOD, cta_url: '' })
    expect(p.join(' ')).toMatch(/Set a call-to-action link/i)
    expect(p.join(' ')).not.toMatch(/the sender will add it/i)
  })

  it('flags a merge tag the sender cannot resolve', () => {
    const body = 'Hi {{first-name}},\n\nBook: https://www.urbantreeservices.net'
    const p = validateCampaign({ ...GOOD, body })
    expect(p.join(' ')).toMatch(/\{\{first-name\}\} is not a merge tag/)
    expect(p.join(' ')).toMatch(/blank/)
    // …and tells you what does work.
    expect(p.join(' ')).toContain('{{first_name}}')
  })

  it('flags malformed tags in the subject and preheader too', () => {
    expect(validateCampaign({ ...GOOD, subject: 'Hi {{first name}}?' }).join(' '))
      .toMatch(/\{\{first name\}\} is not a merge tag/)
    expect(validateCampaign({ ...GOOD, preheader: 'About {{last.job}}' }).join(' '))
      .toMatch(/\{\{last\.job\}\} is not a merge tag/)
  })

  it('lists several bad tags in one message, pluralised', () => {
    const body = 'Hi {{first-name}}, about {{last.job}}: https://www.urbantreeservices.net'
    const p = validateCampaign({ ...GOOD, body })
    const line = p.find(x => /merge tag/.test(x))
    expect(line).toMatch(/\{\{first-name\}\}, \{\{last\.job\}\} are not merge tags/)
  })

  it('reports a bad tag once even when it appears in two places', () => {
    const p = validateCampaign({ ...GOOD, subject: 'Hi {{first-name}}', body: 'Hi {{first-name}} https://www.urbantreeservices.net' })
    expect(p.filter(x => /merge tag/.test(x))).toHaveLength(1)
  })

  it('accepts every documented merge tag', () => {
    const body = `Hi {{first_name}} {{last_name}} in {{suburb}}. We {{last_job_summary}} `
      + `{{months_since_job}} months ago. {{offer_code}} {{offer_percent}} {{offer_expires}}. `
      + 'https://www.urbantreeservices.net'
    expect(validateCampaign({ ...GOOD, body }).join(' ')).not.toMatch(/merge tag/)
  })

  it('flags a discount with no expiry (Fair Trading Act)', () => {
    const p = validateCampaign({ ...GOOD, offer_percent: 15 })
    expect(p.join(' ')).toMatch(/expir/i)
    expect(p.join(' ')).toMatch(/Fair Trading Act/)
  })

  it('accepts a discount that has an expiry', () => {
    expect(validateCampaign({ ...GOOD, offer_percent: 15, offer_expires_on: '2026-08-31' })).toEqual([])
  })

  it('does not treat a 0% offer as a discount claim', () => {
    expect(validateCampaign({ ...GOOD, offer_percent: 0 })).toEqual([])
  })

  it('flags an ALL-CAPS subject', () => {
    const p = validateCampaign({ ...GOOD, subject: 'BOOK YOUR PRUNING NOW' })
    expect(p.join(' ')).toMatch(/ALL CAPS/)
  })

  it('does not flag a short acronym-ish subject as shouting', () => {
    expect(validateCampaign({ ...GOOD, subject: 'Hi {{first_name}} — pruning time' }).join(' ')).not.toMatch(/ALL CAPS/)
  })

  it('flags excessive exclamation marks', () => {
    const p = validateCampaign({ ...GOOD, subject: 'Book now!! Winter pruning!!' })
    expect(p.join(' ')).toMatch(/exclamation/i)
  })

  it('allows a single exclamation mark', () => {
    expect(validateCampaign({ ...GOOD, subject: 'Winter pruning time, {{first_name}}!' }).join(' ')).not.toMatch(/exclamation/i)
  })

  it.each([
    ['A free quote on your trees',        'FREE'],
    ['Act now on winter pruning',         'ACT NOW'],
    ['Limited time on hedge trimming',    'LIMITED TIME'],
    ['Save $$$ on tree work',             '$$$'],
    ['100% tidy, every time',             '100%'],
    ['Guaranteed tidy tree work',         'GUARANTEED'],
  ])('flags the spam trigger in %s', (subject, label) => {
    const p = validateCampaign({ ...GOOD, subject })
    expect(p.join(' ')).toMatch(/spam-trigger/i)
    expect(p.join(' ')).toContain(label)
  })

  it('matches spam triggers case-insensitively and only as whole words', () => {
    expect(validateCampaign({ ...GOOD, subject: 'FrEe quote for you' }).join(' ')).toContain('FREE')
    expect(validateCampaign({ ...GOOD, subject: 'Freedom from leaf litter' }).join(' ')).not.toMatch(/spam-trigger/i)
    expect(validateCampaign({ ...GOOD, subject: 'We guarantee a tidy site' }).join(' ')).not.toMatch(/spam-trigger/i)
  })

  it('reports every problem at once on an empty campaign', () => {
    const p = validateCampaign({})
    expect(p.join(' ')).toMatch(/name/i)
    expect(p.join(' ')).toMatch(/subject/i)
    expect(p.join(' ')).toMatch(/body/i)
  })

  it('survives being called with nothing', () => {
    expect(Array.isArray(validateCampaign())).toBe(true)
  })
})

describe('describeAudience', () => {
  it('describes the whole list when there is no filter', () => {
    expect(describeAudience({})).toMatch(/Every residential customer/)
    expect(describeAudience()).toMatch(/Every residential customer/)
  })
  it('describes a minimum age with a "+"', () => {
    expect(describeAudience({ min_months_since_job: 12 }))
      .toBe('Residential customers whose last job was 12+ months ago')
  })
  it('describes a maximum age as a recency window', () => {
    expect(describeAudience({ max_months_since_job: 6 }))
      .toBe('Residential customers whose last job was in the last 6 months')
  })
  it('describes a range', () => {
    expect(describeAudience({ min_months_since_job: 6, max_months_since_job: 12 }))
      .toBe('Residential customers whose last job was between 6 and 12 months ago')
  })
  it('lists suburbs with "or"', () => {
    expect(describeAudience({ min_months_since_job: 12, suburbs: ['Karori', 'Khandallah'] }))
      .toBe('Residential customers whose last job was 12+ months ago, in Karori or Khandallah')
  })
  it('uses human service labels', () => {
    expect(describeAudience({ services: ['pruning', 'stump'] }))
      .toBe('Residential customers who have had pruning or stump grinding done')
  })
  it('falls back to the raw key for an unknown service', () => {
    expect(describeAudience({ services: ['mulching'] })).toContain('mulching')
  })
  it('joins three suburbs with commas and a final "or"', () => {
    expect(describeAudience({ suburbs: ['Karori', 'Khandallah', 'Ngaio'] }))
      .toBe('Residential customers in Karori, Khandallah or Ngaio')
  })
  it('mentions a repeat-customer filter', () => {
    expect(describeAudience({ min_job_count: 2 })).toMatch(/2 or more jobs/)
  })
  it('ignores a min_job_count of 1, which excludes nobody', () => {
    expect(describeAudience({ min_job_count: 1 })).toMatch(/Every residential customer/)
  })
  it('mentions a minimum spend', () => {
    expect(describeAudience({ min_lifetime_value: 2000 }))
      .toBe('Residential customers who have spent $2,000 or more with us')
  })
  it('ignores a minimum spend of 0, which excludes nobody', () => {
    expect(describeAudience({ min_lifetime_value: 0 })).toMatch(/Every residential customer/)
  })
  // The sentence must never claim a filter the sender won't apply.
  it('says nothing about a clause stored as a string, which the sender ignores', () => {
    expect(describeAudience({ min_months_since_job: '12' })).toMatch(/Every residential customer/)
    expect(describeAudience({ min_lifetime_value: '2000' })).toMatch(/Every residential customer/)
  })
  it('trims a suburb for reading without changing what is matched', () => {
    expect(describeAudience({ suburbs: [' Karori '] })).toBe('Residential customers in Karori')
  })
})

// These tests are the contract between this predicate and resolveAudience() in
// supabase/functions/_shared/campaign.ts. The page counts "N recipients match"
// with matchesAudience and the sender then resolves the audience with SQL — any
// disagreement means the number on screen is a lie about who gets emailed.
describe('matchesAudience', () => {
  const contact = {
    first_name: 'Sue', suburb: 'Karori', services: ['pruning', 'hedge'],
    job_count: 2, lifetime_value: 1450, months_since_job: 14,
  }

  it('matches everything when the filter is empty', () => {
    expect(matchesAudience(contact, {})).toBe(true)
    expect(matchesAudience(contact)).toBe(true)
  })
  it('applies a minimum months filter', () => {
    expect(matchesAudience(contact, { min_months_since_job: 12 })).toBe(true)
    expect(matchesAudience(contact, { min_months_since_job: 24 })).toBe(false)
  })
  it('applies a maximum months filter', () => {
    expect(matchesAudience(contact, { max_months_since_job: 24 })).toBe(true)
    expect(matchesAudience(contact, { max_months_since_job: 6 })).toBe(false)
  })
  it('excludes contacts with no job history when a months filter is set', () => {
    const never = { ...contact, months_since_job: null }
    expect(matchesAudience(never, { min_months_since_job: 12 })).toBe(false)
    expect(matchesAudience(never, {})).toBe(true)
  })
  it('matches on any of the selected services', () => {
    expect(matchesAudience(contact, { services: ['pruning'] })).toBe(true)
    expect(matchesAudience(contact, { services: ['stump', 'hedge'] })).toBe(true)
    expect(matchesAudience(contact, { services: ['stump'] })).toBe(false)
  })
  // The backend filters suburbs with .in('suburb', […]) — plain SQL equality.
  // Lowercasing both sides here counted people in who would never be mailed.
  it('matches suburbs exactly, case-sensitively, like the sender does', () => {
    expect(matchesAudience(contact, { suburbs: ['Karori'] })).toBe(true)
    expect(matchesAudience(contact, { suburbs: ['karori'] })).toBe(false)
    expect(matchesAudience(contact, { suburbs: ['KARORI'] })).toBe(false)
    expect(matchesAudience(contact, { suburbs: ['Ngaio'] })).toBe(false)
  })
  it('does not trim whitespace off either side of a suburb', () => {
    expect(matchesAudience(contact, { suburbs: [' Karori'] })).toBe(false)
    expect(matchesAudience({ ...contact, suburb: ' Karori ' }, { suburbs: ['Karori'] })).toBe(false)
    // …but the stored value matched verbatim does hit, which is what the
    // audience picker now builds its chips from.
    expect(matchesAudience({ ...contact, suburb: ' Karori ' }, { suburbs: [' Karori '] })).toBe(true)
  })
  it('matches any one of several suburbs', () => {
    expect(matchesAudience(contact, { suburbs: ['Ngaio', 'Karori'] })).toBe(true)
  })
  it('applies a minimum job count', () => {
    expect(matchesAudience(contact, { min_job_count: 2 })).toBe(true)
    expect(matchesAudience(contact, { min_job_count: 3 })).toBe(false)
  })

  // min_lifetime_value has always been applied by resolveAudience. It was
  // absent here, so a spend filter counted everyone in and mailed a fraction.
  it('applies a minimum lifetime value', () => {
    expect(matchesAudience(contact, { min_lifetime_value: 1000 })).toBe(true)
    expect(matchesAudience(contact, { min_lifetime_value: 1450 })).toBe(true)
    expect(matchesAudience(contact, { min_lifetime_value: 2000 })).toBe(false)
  })
  it('treats a missing lifetime value as zero', () => {
    const { lifetime_value, ...noSpend } = contact
    expect(matchesAudience(noSpend, { min_lifetime_value: 1 })).toBe(false)
    expect(matchesAudience(noSpend, { min_lifetime_value: 0 })).toBe(true)
  })
  it('copes with the NUMERIC string PostgREST returns', () => {
    expect(matchesAudience({ ...contact, lifetime_value: '1450.00' }, { min_lifetime_value: 1000 })).toBe(true)
    expect(matchesAudience({ ...contact, lifetime_value: '1450.00' }, { min_lifetime_value: 2000 })).toBe(false)
  })

  it('requires every clause to hold', () => {
    expect(matchesAudience(contact, { min_months_since_job: 12, suburbs: ['Karori'] })).toBe(true)
    expect(matchesAudience(contact, { min_months_since_job: 12, suburbs: ['Ngaio'] })).toBe(false)
    expect(matchesAudience(contact, { min_months_since_job: 12, min_lifetime_value: 5000 })).toBe(false)
  })
  it('treats blank filter values as "not set"', () => {
    expect(matchesAudience(contact, {
      min_months_since_job: '', min_job_count: '', min_lifetime_value: '', services: [], suburbs: [],
    })).toBe(true)
  })

  // resolveAudience gates each numeric clause on `typeof f.x === 'number'`, so
  // a value stored as a string is ignored by the sender. Ignoring it here too
  // keeps the count honest — a filter that looks applied but isn't would be
  // worse than one that visibly does nothing.
  it('ignores a numeric clause stored as a string, exactly as the sender does', () => {
    expect(matchesAudience(contact, { min_months_since_job: '24' })).toBe(true)
    expect(matchesAudience(contact, { min_job_count: '99' })).toBe(true)
    expect(matchesAudience(contact, { min_lifetime_value: '99999' })).toBe(true)
  })
  it('ignores a NaN clause rather than excluding everybody', () => {
    expect(matchesAudience(contact, { min_months_since_job: Number.NaN })).toBe(true)
  })

  // max_months_since_job is .lte() — inclusive. MONTH_BUCKETS' [0,6) is a
  // different question (a reporting histogram) and stays half-open.
  it('includes the boundary month, because the sender uses <= and >=', () => {
    const sixMonths = { ...contact, months_since_job: 6 }
    expect(matchesAudience(sixMonths, { max_months_since_job: 6 })).toBe(true)
    expect(matchesAudience(sixMonths, { min_months_since_job: 6 })).toBe(true)
    expect(bucketFor(6)).toBe('6-12')   // …while the histogram puts it in the next band
  })
})

describe('bucketFor', () => {
  it('places months into the reporting buckets', () => {
    expect(bucketFor(0)).toBe('0-6')
    expect(bucketFor(5)).toBe('0-6')
    expect(bucketFor(6)).toBe('6-12')
    expect(bucketFor(12)).toBe('12-24')
    expect(bucketFor(23)).toBe('12-24')
    expect(bucketFor(24)).toBe('24+')
    expect(bucketFor(120)).toBe('24+')
  })
  it('returns null for a contact with no job history', () => {
    expect(bucketFor(null)).toBe(null)
    expect(bucketFor(undefined)).toBe(null)
  })
  it('covers every bucket key', () => {
    expect(MONTH_BUCKETS.map(b => b.key)).toEqual(['0-6', '6-12', '12-24', '24+'])
  })
})

describe('SEGMENT_PRESETS', () => {
  it('offers the named starting points', () => {
    expect(SEGMENT_PRESETS.map(p => p.label)).toEqual([
      'Lapsed — 12+ months since last job',
      'Winter pruning — pruning customers, 9+ months',
      'Recent customers — last 6 months',
      'Best customers — $2,000+ lifetime',
      'Everyone eligible',
    ])
  })
  it('every preset carries a usable audience filter', () => {
    for (const p of SEGMENT_PRESETS) {
      expect(typeof p.audience).toBe('object')
      expect(describeAudience(p.audience)).toBeTruthy()
    }
  })
  // A preset written with a string value would be silently ignored by the
  // sender — the preset would look applied and mail the whole list.
  it('writes every numeric clause as a real number', () => {
    const NUMERIC = ['min_months_since_job', 'max_months_since_job', 'min_job_count', 'min_lifetime_value']
    for (const p of SEGMENT_PRESETS) {
      for (const key of NUMERIC) {
        if (key in p.audience) {
          expect(typeof p.audience[key], `${p.key}.${key}`).toBe('number')
        }
      }
    }
  })
})

// ── Importing ────────────────────────────────────────────────────────────────

describe('IMPORT_SOURCES', () => {
  // The keys are the `source` values the edge function accepts. A typo here is
  // a 400 from the function with no clue on the page as to why.
  it('offers exactly the three sources the function supports', () => {
    expect(IMPORT_SOURCES.map(s => s.key)).toEqual(['xero', 'quotient', 'clients'])
  })
  it('gives every source a label and an explanation', () => {
    for (const s of IMPORT_SOURCES) {
      expect(s.label).toBeTruthy()
      expect(s.blurb.length).toBeGreaterThan(40)
    }
  })
  it('marks only Quotient as needing a pasted payload', () => {
    expect(IMPORT_SOURCES.filter(s => s.needsPaste).map(s => s.key)).toEqual(['quotient'])
  })
  it('looks a source up by key, and returns null for anything else', () => {
    expect(importSource('xero').label).toBe('Xero')
    expect(importSource('mailchimp')).toBeNull()
  })
  // MAX_ROWS in the edge function. If the two drift, the paste sails through
  // here and comes back a 413 after the user has waited for the upload.
  it('caps a batch at the same 5000 rows the function does', () => {
    expect(IMPORT_MAX_ROWS).toBe(5000)
  })
})

describe('parseQuotientPaste', () => {
  const ROW = { source_ref: '1001', first_name: 'Colleen', last_name: 'Riches', email: 'colleen@example.co.nz' }

  it('accepts a JSON array of contacts', () => {
    const r = parseQuotientPaste(JSON.stringify([ROW, ROW]))
    expect(r.ok).toBe(true)
    expect(r.count).toBe(2)
    expect(r.contacts[0].email).toBe('colleen@example.co.nz')
  })
  it('tolerates whitespace around the paste', () => {
    expect(parseQuotientPaste(`\n  ${JSON.stringify([ROW])}  \n`).ok).toBe(true)
  })
  it('counts how many rows carry an email address', () => {
    const r = parseQuotientPaste(JSON.stringify([ROW, { ...ROW, email: '' }, { ...ROW, email: undefined }]))
    expect(r.count).toBe(3)
    expect(r.withEmail).toBe(1)
  })

  it('rejects an empty paste without mentioning JSON', () => {
    const r = parseQuotientPaste('   ')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Nothing pasted/)
  })
  // The most likely mistake: copying the console output, progress lines and all.
  it('explains a parse failure instead of throwing', () => {
    const r = parseQuotientPaste('contacts page 1: 100 (100 total)')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/isn’t valid JSON/)
  })
  it('rejects a single object', () => {
    const r = parseQuotientPaste(JSON.stringify(ROW))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/a single object/)
  })
  it('rejects a bare string or number', () => {
    expect(parseQuotientPaste('"hello"').error).toMatch(/a string/)
    expect(parseQuotientPaste('42').error).toMatch(/a number/)
    expect(parseQuotientPaste('null').error).toMatch(/null/)
  })
  it('rejects an empty array', () => {
    const r = parseQuotientPaste('[]')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/empty/)
  })
  it('rejects a batch over the cap and says to split it', () => {
    const r = parseQuotientPaste(JSON.stringify(Array.from({ length: IMPORT_MAX_ROWS + 1 }, () => ROW)))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/5,001/)
    expect(r.error).toMatch(/batches/)
  })
  it('accepts a batch of exactly the cap', () => {
    expect(parseQuotientPaste(JSON.stringify(Array.from({ length: IMPORT_MAX_ROWS }, () => ROW))).ok).toBe(true)
  })
  it('names the row when the array holds something that is not a contact', () => {
    const r = parseQuotientPaste(JSON.stringify([ROW, 'nope', ROW]))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Row 2/)
  })
  it('never throws, whatever it is handed', () => {
    for (const bad of [undefined, null, 0, {}, [], '{', '[{]']) {
      expect(() => parseQuotientPaste(bad)).not.toThrow()
      expect(parseQuotientPaste(bad).ok).toBe(false)
    }
  })
})

describe('pasteFingerprint', () => {
  // The dry run approves one exact payload. If an edited paste kept the old
  // fingerprint, "Import for real" would import rows nobody previewed.
  it('is stable for identical text', () => {
    expect(pasteFingerprint('[{"a":1}]')).toBe(pasteFingerprint('[{"a":1}]'))
  })
  it('changes when the text changes', () => {
    expect(pasteFingerprint('[{"a":1}]')).not.toBe(pasteFingerprint('[{"a":2}]'))
  })
  it('changes when rows are appended', () => {
    const a = JSON.stringify([{ email: 'a@b.co' }])
    const b = JSON.stringify([{ email: 'a@b.co' }, { email: 'c@d.co' }])
    expect(pasteFingerprint(a)).not.toBe(pasteFingerprint(b))
  })
  it('handles empty and nullish input', () => {
    expect(pasteFingerprint('')).toBe(pasteFingerprint(null))
    expect(typeof pasteFingerprint(undefined)).toBe('string')
  })
})

// A response in the exact shape the function's README documents.
const RESULT = {
  ok: true, source: 'xero', dry_run: true,
  scanned: 4357, inserted: 2810, updated: 1102,
  skipped_no_email: 402, skipped_invalid: 43,
  classified: { residential: 3689, commercial: 223 },
  suppressed_no_history: 611,
  sample: [], errors: [], error_count: 0,
  meta: { xero_contacts: 4102, joined_on_quote_no: 318 },
}

describe('summaryRows', () => {
  it('renders every count the function returns', () => {
    expect(summaryRows(RESULT).map(r => r.key)).toEqual([
      'scanned', 'inserted', 'updated', 'skipped_no_email', 'skipped_invalid',
      'residential', 'commercial', 'suppressed_no_history', 'error_count',
    ])
  })
  it('reads the nested classification split', () => {
    const by = Object.fromEntries(summaryRows(RESULT).map(r => [r.key, r.value]))
    expect(by.residential).toBe(3689)
    expect(by.commercial).toBe(223)
  })
  it('gives every row a label and an explanation', () => {
    for (const r of summaryRows(RESULT)) {
      expect(r.label).toBeTruthy()
      expect(r.hint).toBeTruthy()
    }
  })
  // A missing key must render as 0, not NaN or "undefined" — the table is the
  // thing the office reads before committing an import.
  it('renders a missing or malformed count as zero', () => {
    for (const r of summaryRows({})) expect(r.value).toBe(0)
    expect(summaryRows({ scanned: 'lots' })[0].value).toBe(0)
    expect(summaryRows().every(r => Number.isFinite(r.value))).toBe(true)
  })
  it('says commercial contacts are never marketed to', () => {
    const row = summaryRows(RESULT).find(r => r.key === 'commercial')
    expect(row.hint).toMatch(/excluded from marketing/i)
  })
  it('says a suppressed contact is not mailed without a human decision', () => {
    const row = summaryRows(RESULT).find(r => r.key === 'suppressed_no_history')
    expect(row.hint).toMatch(/human decision/i)
  })
})

describe('mailableFromSummary', () => {
  it('subtracts the unusable, the commercial and the suppressed', () => {
    // 4357 - (402 + 43) - 223 - 611
    expect(mailableFromSummary(RESULT)).toEqual({
      scanned: 4357, dropped: 445, commercial: 223, suppressed: 611, mailable: 3078,
    })
  })
  it('never reports a negative mailable count', () => {
    const r = mailableFromSummary({ scanned: 10, skipped_no_email: 40, classified: { commercial: 20 } })
    expect(r.mailable).toBe(0)
  })
  it('copes with an empty response', () => {
    expect(mailableFromSummary({}).mailable).toBe(0)
    expect(mailableFromSummary().scanned).toBe(0)
  })
})

describe('describeImportOutcome', () => {
  it('speaks in the conditional for a dry run', () => {
    const line = describeImportOutcome(RESULT)
    expect(line).toMatch(/would add 2,810/)
    expect(line).toMatch(/would merge 1,102/)
  })
  it('speaks in the past tense for a real import', () => {
    const line = describeImportOutcome({ ...RESULT, dry_run: false })
    expect(line).toMatch(/added 2,810/)
    expect(line).toMatch(/merged 1,102/)
    expect(line).not.toMatch(/would/)
  })
  it('carries the mailable figure, not just the scanned one', () => {
    expect(describeImportOutcome(RESULT)).toMatch(/3,078 of them mailable/)
  })
})

describe('sampleName', () => {
  it('joins first and last name', () => {
    expect(sampleName({ first_name: 'Colleen', last_name: 'Riches' })).toBe('Colleen Riches')
  })
  it('falls back to full_name, which is what some sources write', () => {
    expect(sampleName({ full_name: 'Coastal Properties Ltd' })).toBe('Coastal Properties Ltd')
  })
  it('prefers the split name when both are present', () => {
    expect(sampleName({ first_name: 'Dave', full_name: 'Dave & Sue Wilson' })).toBe('Dave')
  })
  it('says so rather than rendering blank', () => {
    expect(sampleName({})).toBe('(no name)')
    expect(sampleName()).toBe('(no name)')
    expect(sampleName({ first_name: '', last_name: null, full_name: '  ' })).toBe('(no name)')
  })
})

describe('explainImportError', () => {
  // The scope message names the exact scope that is missing. It must reach the
  // screen unaltered — it is the only actionable part of the failure.
  it('passes the Xero scope failure through verbatim and offers Settings', () => {
    const msg = 'Xero connection is missing the "accounting.transactions.read" scope. '
      + 'Reconnect Xero in Settings → Integrations and approve it — a token refresh cannot add a scope.'
    const out = explainImportError(500, msg)
    expect(out.message).toBe(msg)
    expect(out.settingsLink).toBe(true)
    expect(out.advice).toMatch(/cannot widen a scope/)
  })
  it('links to Settings when Xero is not connected at all', () => {
    const out = explainImportError(500, 'Xero is not connected — connect it in Settings → Integrations first.')
    expect(out.settingsLink).toBe(true)
  })
  it('explains a 401 as a dead session', () => {
    expect(explainImportError(401, 'Unauthorized').advice).toMatch(/Sign out and back in/)
  })
  it('explains a 403 as an access level', () => {
    expect(explainImportError(403, 'Forbidden — office access required').advice).toMatch(/office or full access/)
  })
  it('keeps the 413 message, which names the batch size', () => {
    const msg = 'Too many contacts (7000). Max 5000 per request — split the batch.'
    expect(explainImportError(413, msg).message).toBe(msg)
  })
  // Status 0 is the panel's own timeout/network failure. Re-running is safe —
  // the importer is idempotent — and saying so is the whole point.
  it('tells the user a timed-out import is safe to re-run', () => {
    expect(explainImportError(0, 'No response after 4 minutes.').advice).toMatch(/safe to re-run/)
  })
  it('always produces a message, even given nothing', () => {
    expect(explainImportError(500, '').message).toBeTruthy()
    expect(explainImportError(500, null).message).toBeTruthy()
  })
})
