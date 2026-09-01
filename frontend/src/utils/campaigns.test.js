import { describe, it, expect } from 'vitest'
import {
  MERGE_TAGS, SEGMENT_PRESETS, MONTH_BUCKETS, SUBURB_FALLBACK_THRESHOLD, SERVICE_LABELS,
  renderPreview, mergeDataFor, formatDateNz, greetingName, emptyTagsIn,
  validateCampaign, describeAudience, matchesAudience, bucketFor,
  suburbCoverage, chooseSubject,
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

  it('flags a body that omits the CTA url', () => {
    const body = 'Hi {{first_name}}, give us a call some time.'
    expect(validateCampaign({ ...GOOD, body }).join(' ')).toMatch(/call-to-action link/i)
  })

  it('flags a missing CTA url outright', () => {
    const p = validateCampaign({ ...GOOD, cta_url: '' })
    expect(p.join(' ')).toMatch(/Set a call-to-action link/i)
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
})

describe('matchesAudience', () => {
  const contact = { first_name: 'Sue', suburb: 'Karori', services: ['pruning', 'hedge'], job_count: 2, months_since_job: 14 }

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
  it('matches suburbs case-insensitively', () => {
    expect(matchesAudience(contact, { suburbs: ['karori'] })).toBe(true)
    expect(matchesAudience(contact, { suburbs: ['Ngaio'] })).toBe(false)
  })
  it('applies a minimum job count', () => {
    expect(matchesAudience(contact, { min_job_count: 2 })).toBe(true)
    expect(matchesAudience(contact, { min_job_count: 3 })).toBe(false)
  })
  it('requires every clause to hold', () => {
    expect(matchesAudience(contact, { min_months_since_job: 12, suburbs: ['Karori'] })).toBe(true)
    expect(matchesAudience(contact, { min_months_since_job: 12, suburbs: ['Ngaio'] })).toBe(false)
  })
  it('treats blank filter values as "not set"', () => {
    expect(matchesAudience(contact, { min_months_since_job: '', min_job_count: '', services: [], suburbs: [] })).toBe(true)
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
      'Everyone eligible',
    ])
  })
  it('every preset carries a usable audience filter', () => {
    for (const p of SEGMENT_PRESETS) {
      expect(typeof p.audience).toBe('object')
      expect(describeAudience(p.audience)).toBeTruthy()
    }
  })
})
