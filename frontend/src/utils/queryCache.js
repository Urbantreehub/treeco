// Tiny in-memory query cache for stale-while-revalidate (F23). Lets a screen
// paint last-known data instantly on revisit while it refreshes behind — so
// tab-switching never shows a skeleton for a screen already loaded this session.
//
// In-memory only (cleared on full reload) — this is a perceived-speed layer,
// not a persistence layer. Keys are per-dataset strings, e.g. 'pipeline:jobs'.

const cache = new Map()

export function hasCache(key) { return cache.has(key) }
export function readCache(key) { return cache.get(key) }        // undefined if absent
export function writeCache(key, value) { cache.set(key, value); return value }
export function clearCache(key) {
  if (key == null) cache.clear()
  else cache.delete(key)
}
