import { describe, it, expect } from 'vitest'
import {
  DEPOT, haversineKm, progressFraction,
  orderRoute, routeDistanceKm, clusterByProximity,
} from './geo'

describe('haversineKm', () => {
  it('is 0 for the same point', () => {
    expect(haversineKm({ lat: -41, lng: 174 }, { lat: -41, lng: 174 })).toBeCloseTo(0)
  })

  it('returns null when a point is missing or has no coords', () => {
    expect(haversineKm(null, { lat: 1, lng: 1 })).toBeNull()
    expect(haversineKm({ lat: 1, lng: 1 }, undefined)).toBeNull()
    expect(haversineKm({ lat: null, lng: 1 }, { lat: 1, lng: 1 })).toBeNull()
  })

  it('matches a known distance (Wellington → Auckland ≈ 494 km)', () => {
    const wlg = { lat: -41.2865, lng: 174.7762 }
    const akl = { lat: -36.8485, lng: 174.7633 }
    const d = haversineKm(wlg, akl)
    expect(d).toBeGreaterThan(480)
    expect(d).toBeLessThan(510)
  })
})

describe('progressFraction', () => {
  const start = { lat: 0, lng: 0 }
  const dest = { lat: 0, lng: 1 }

  it('is 0 at the start', () => {
    expect(progressFraction(start, start, dest)).toBeCloseTo(0)
  })

  it('is 1 at the destination', () => {
    expect(progressFraction(start, dest, dest)).toBeCloseTo(1)
  })

  it('is ~0.5 halfway there', () => {
    expect(progressFraction(start, { lat: 0, lng: 0.5 }, dest)).toBeCloseTo(0.5, 1)
  })

  it('stays within [0, 1] even past the destination', () => {
    const f = progressFraction(start, { lat: 0, lng: 2 }, dest)
    expect(f).toBeGreaterThanOrEqual(0)
    expect(f).toBeLessThanOrEqual(1)
  })
})

describe('orderRoute', () => {
  it('visits the nearest stop to the depot first', () => {
    const far = { id: 'far', lat: -41.0, lng: 174.0 }
    const near = { id: 'near', lat: DEPOT.lat + 0.01, lng: DEPOT.lng + 0.01 }
    const ordered = orderRoute([far, near])
    expect(ordered[0].id).toBe('near')
    expect(ordered).toHaveLength(2)
  })
})

describe('routeDistanceKm', () => {
  it('is 0 for an empty route', () => {
    expect(routeDistanceKm([])).toBe(0)
  })

  it('includes the depot round trip (out and back)', () => {
    const stop = { lat: DEPOT.lat + 0.1, lng: DEPOT.lng }
    expect(routeDistanceKm([stop])).toBeCloseTo(2 * haversineKm(DEPOT, stop), 5)
  })
})

describe('clusterByProximity', () => {
  it('groups nearby points and separates far ones', () => {
    const a1 = { lat: -41.28, lng: 174.77 }
    const a2 = { lat: -41.29, lng: 174.78 } // ~1.4 km from a1
    const b1 = { lat: -40.90, lng: 175.00 } // ~40+ km away
    const clusters = clusterByProximity([a1, a2, b1], 5)
    const sizes = clusters.map(c => c.items.length).sort((x, y) => y - x)
    expect(clusters).toHaveLength(2)
    expect(sizes[0]).toBe(2)
  })

  it('drops points that have no coordinates', () => {
    const clusters = clusterByProximity(
      [{ lat: null, lng: null }, { lat: -41.28, lng: 174.77 }], 5,
    )
    const total = clusters.reduce((n, c) => n + c.items.length, 0)
    expect(total).toBe(1)
  })
})
