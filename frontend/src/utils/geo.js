// Geographic helpers for the scheduling planner + calendar truck tracking.
// Keyless: geocoding goes through the `geocode` edge function (OSM Nominatim);
// distance/clustering is pure client-side haversine maths.

import { supabase } from '../config/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

// Depot — Urban Tree Services base (Wellington). Used as the start point for
// quote-run ordering and truck-progress baselines. Adjust if the yard moves.
export const DEPOT = { lat: -41.2865, lng: 174.7762, label: 'Wellington' }

// Google Maps search link for an address — used everywhere an address is shown
// so anyone can open directions and eyeball that the place is real. Prefers
// exact coords when we have them (drops a precise pin), else falls back to the
// free-text address query.
export function mapsHref(address, lat, lng) {
  if (lat != null && lng != null) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
  if (!address) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

// Great-circle distance in kilometres.
export function haversineKm(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return null
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLng = (b.lng - a.lng) * Math.PI / 180
  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Fraction (0..1) of the way from `start` to `dest` that `current` has covered,
// measured by remaining straight-line distance. Used to slide the truck icon
// along a scheduled job's progress track on the calendar.
export function progressFraction(start, current, dest) {
  const total = haversineKm(start, dest)
  const remaining = haversineKm(current, dest)
  if (total == null || remaining == null || total < 0.05) return remaining != null && remaining < 0.15 ? 1 : 0
  return Math.max(0, Math.min(1, 1 - remaining / total))
}

// Greedy geographic clustering: groups points within `radiusKm` of each other
// into runs, seeding each cluster from the point nearest the depot. Returns an
// array of clusters, each { items: [...], centroid: {lat,lng} }.
export function clusterByProximity(points, radiusKm = 5, maxPerCluster = 8) {
  const pts = points.filter(p => p.lat != null && p.lng != null)
  const remaining = [...pts].sort((a, b) => (haversineKm(DEPOT, a) ?? 0) - (haversineKm(DEPOT, b) ?? 0))
  const clusters = []
  while (remaining.length) {
    const seed = remaining.shift()
    const cluster = [seed]
    for (let i = remaining.length - 1; i >= 0; i--) {
      if (cluster.length >= maxPerCluster) break
      if ((haversineKm(seed, remaining[i]) ?? Infinity) <= radiusKm) {
        cluster.push(remaining.splice(i, 1)[0])
      }
    }
    const centroid = {
      lat: cluster.reduce((s, p) => s + p.lat, 0) / cluster.length,
      lng: cluster.reduce((s, p) => s + p.lng, 0) / cluster.length,
    }
    clusters.push({ items: orderRoute(cluster), centroid })
  }
  // Biggest, tightest clusters first — the best candidate runs.
  return clusters.sort((a, b) => b.items.length - a.items.length)
}

// Nearest-neighbour ordering of stops starting from the depot — a cheap,
// good-enough route order for a day's quote run.
export function orderRoute(points, start = DEPOT) {
  const pts = [...points]
  const ordered = []
  let cur = start
  while (pts.length) {
    let bi = 0, bd = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = haversineKm(cur, pts[i]) ?? Infinity
      if (d < bd) { bd = d; bi = i }
    }
    cur = pts[bi]
    ordered.push(pts.splice(bi, 1)[0])
  }
  return ordered
}

// Total distance of an ordered route including the depot round-trip.
export function routeDistanceKm(orderedPoints, start = DEPOT) {
  if (!orderedPoints.length) return 0
  let d = haversineKm(start, orderedPoints[0]) ?? 0
  for (let i = 1; i < orderedPoints.length; i++) d += haversineKm(orderedPoints[i - 1], orderedPoints[i]) ?? 0
  d += haversineKm(orderedPoints[orderedPoints.length - 1], start) ?? 0
  return d
}

// Ensure a job has coords — returns {lat,lng} from cache or geocodes via the
// edge function and caches. Returns null if it can't be resolved.
export async function ensureJobCoords(job) {
  if (job?.lat != null && job?.lng != null) return { lat: job.lat, lng: job.lng }
  if (!job?.id || !job?.address) return null
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ job_id: job.id }),
    })
    const data = await res.json()
    return data.ok ? { lat: data.lat, lng: data.lng } : null
  } catch {
    return null
  }
}

// Kick off a batch geocode of all un-geocoded jobs (fire-and-forget).
export async function batchGeocodeJobs() {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/geocode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
      body: JSON.stringify({ batch: true }),
    })
    return await res.json()
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
