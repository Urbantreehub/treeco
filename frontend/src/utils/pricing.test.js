import { describe, it, expect } from 'vitest'
import { GST, inclGst, calcTotals } from './pricing'

describe('inclGst', () => {
  it('adds 15% GST', () => {
    expect(inclGst(100)).toBeCloseTo(115)
    expect(GST).toBe(0.15)
  })

  it('treats blank/NaN as 0', () => {
    expect(inclGst(undefined)).toBe(0)
    expect(inclGst(null)).toBe(0)
    expect(inclGst('')).toBe(0)
  })
})

describe('calcTotals', () => {
  it('an empty list is all zeros', () => {
    expect(calcTotals([])).toEqual({ subtotal: 0, gst: 0, total: 0 })
  })

  it('handles a missing/undefined list without throwing', () => {
    expect(calcTotals(undefined)).toEqual({ subtotal: 0, gst: 0, total: 0 })
  })

  it('sums qty * rate and adds 15% GST', () => {
    const r = calcTotals([{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }])
    expect(r.subtotal).toBe(250)
    expect(r.gst).toBeCloseTo(37.5)
    expect(r.total).toBeCloseTo(287.5)
  })

  it('non-optional items always count', () => {
    expect(calcTotals([{ qty: 1, rate: 80 }]).subtotal).toBe(80)
  })

  it('optional items count only when selected', () => {
    expect(calcTotals([{ optional: true, qty: 1, rate: 100 }]).subtotal).toBe(0)
    expect(calcTotals([{ optional: true, selected: true, qty: 1, rate: 100 }]).subtotal).toBe(100)
  })

  // A blank, zero, or invalid quantity is charged as 1 unit (matches the backend).
  it('missing, zero, or blank qty is charged as 1 unit', () => {
    expect(calcTotals([{ rate: 100 }]).subtotal).toBe(100)
    expect(calcTotals([{ qty: 0, rate: 100 }]).subtotal).toBe(100)
    expect(calcTotals([{ qty: '', rate: 100 }]).subtotal).toBe(100)
  })

  it('blank/NaN qty or rate never produces NaN', () => {
    // qty 'x' → 1 unit at 100; second line has no rate → 0.
    const r = calcTotals([{ qty: 'x', rate: 100 }, { qty: 2, rate: null }])
    expect(r.subtotal).toBe(100)
    expect(Number.isNaN(r.total)).toBe(false)
  })
})
