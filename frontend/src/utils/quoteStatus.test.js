import { describe, it, expect } from 'vitest'
import { isExpired, effectiveStatus, followUpBucket, ACCEPTED_STATUSES } from './quoteStatus'

const DAY = 86400000
const HOUR = 3600000
const NOW = new Date('2026-07-27T12:00:00Z').getTime()
const ago = (ms) => new Date(NOW - ms).toISOString()
const inDays = (n) => new Date(NOW + n * DAY).toISOString().slice(0, 10)

describe('isExpired', () => {
  it('is true for a sent quote past its valid_until', () => {
    expect(isExpired({ status: 'sent', valid_until: inDays(-1) }, NOW)).toBe(true)
  })
  it('is true for an opened quote past its valid_until', () => {
    expect(isExpired({ status: 'viewed', valid_until: inDays(-5) }, NOW)).toBe(true)
  })
  it('is false when still within validity', () => {
    expect(isExpired({ status: 'sent', valid_until: inDays(10) }, NOW)).toBe(false)
  })
  it('is false without a valid_until', () => {
    expect(isExpired({ status: 'sent', valid_until: null }, NOW)).toBe(false)
  })
  it('is false for non-live statuses even if the date passed', () => {
    expect(isExpired({ status: 'accepted', valid_until: inDays(-9) }, NOW)).toBe(false)
    expect(isExpired({ status: 'draft', valid_until: inDays(-9) }, NOW)).toBe(false)
  })
  it('treats the expiry day itself as still valid', () => {
    expect(isExpired({ status: 'sent', valid_until: inDays(0) }, NOW)).toBe(false)
  })
})

describe('effectiveStatus', () => {
  it('returns expired for a lapsed sent quote', () => {
    expect(effectiveStatus({ status: 'sent', valid_until: inDays(-1) }, NOW)).toBe('expired')
  })
  it('returns the stored status otherwise', () => {
    expect(effectiveStatus({ status: 'accepted', valid_until: inDays(-1) }, NOW)).toBe('accepted')
    expect(effectiveStatus({ status: 'sent', valid_until: inDays(3) }, NOW)).toBe('sent')
  })
})

describe('followUpBucket', () => {
  it('flags an unopened quote after 12h', () => {
    expect(followUpBucket({ status: 'sent', sent_at: ago(13 * HOUR), opened_count: 0 }, NOW)).toBe('unopened')
  })
  it('does not flag an unopened quote before 12h', () => {
    expect(followUpBucket({ status: 'sent', sent_at: ago(2 * HOUR), opened_count: 0 }, NOW)).toBe(null)
  })
  it('does not flag "unopened" once it has been opened', () => {
    expect(followUpBucket({ status: 'viewed', sent_at: ago(13 * HOUR), opened_count: 2 }, NOW)).toBe(null)
  })
  it('escalates to chase after 3 days', () => {
    expect(followUpBucket({ status: 'viewed', sent_at: ago(4 * DAY), opened_count: 1 }, NOW)).toBe('chase')
  })
  it('escalates to final after 14 days', () => {
    expect(followUpBucket({ status: 'sent', sent_at: ago(20 * DAY) }, NOW)).toBe('final')
  })
  it('ignores resolved and unsent quotes', () => {
    expect(followUpBucket({ status: 'accepted', sent_at: ago(20 * DAY) }, NOW)).toBe(null)
    expect(followUpBucket({ status: 'draft', sent_at: null }, NOW)).toBe(null)
  })
})

describe('ACCEPTED_STATUSES', () => {
  it('covers the won-revenue statuses', () => {
    expect(ACCEPTED_STATUSES).toEqual(['accepted', 'complete', 'invoiced'])
  })
})
