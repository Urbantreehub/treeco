import { describe, it, expect } from 'vitest'
import { calcQuoteTotals, GST_RATE } from './pricing.js'

describe('calcQuoteTotals', () => {
  it('GST rate is 15%', () => {
    expect(GST_RATE).toBe(0.15)
  })

  it('an empty or missing list is all zeros', () => {
    expect(calcQuoteTotals([])).toEqual({ subtotal: 0, gst: 0, total: 0 })
    expect(calcQuoteTotals(undefined)).toEqual({ subtotal: 0, gst: 0, total: 0 })
  })

  it('sums qty * rate and adds 15% GST', () => {
    const r = calcQuoteTotals([{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }])
    expect(r.subtotal).toBe(250)
    expect(r.gst).toBe(37.5)
    expect(r.total).toBe(287.5)
  })

  it('rounds GST and total to whole cents', () => {
    // 99.99 * 0.15 = 14.9985 → 15.00
    const r = calcQuoteTotals([{ qty: 1, rate: 99.99 }])
    expect(r.gst).toBe(15)
    expect(r.total).toBe(114.99)
  })

  it('excludes items that are explicitly deselected', () => {
    const r = calcQuoteTotals([
      { qty: 1, rate: 100, selected: false },
      { qty: 1, rate: 50 },
    ])
    expect(r.subtotal).toBe(50)
  })

  // A blank, zero, or invalid quantity is charged as 1 unit (matches the frontend).
  it('missing or zero qty is charged as 1 unit', () => {
    expect(calcQuoteTotals([{ rate: 100 }]).subtotal).toBe(100)
    expect(calcQuoteTotals([{ qty: 0, rate: 100 }]).subtotal).toBe(100)
  })

  it('missing rate defaults to 0', () => {
    expect(calcQuoteTotals([{ qty: 3 }]).subtotal).toBe(0)
  })
})
