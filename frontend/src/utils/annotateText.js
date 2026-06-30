import { GLOSSARY, TREE_NAMES } from '../data/arboriculture'

// Build lookup maps once at module load
const glossaryPatterns = GLOSSARY.flatMap(g =>
  g.match.map(m => ({ pattern: m.toLowerCase(), id: g.id, term: g.term }))
).sort((a, b) => b.pattern.length - a.pattern.length) // longest first

const treePatterns = Object.entries(TREE_NAMES)
  .map(([common, latin]) => ({ pattern: common.toLowerCase(), latin }))
  .sort((a, b) => b.pattern.length - a.pattern.length)

// Escape string for use in regex
function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a combined regex from all patterns (glossary + tree names)
// Returns array of segments: { type: 'text'|'glossary'|'tree', text, id?, latin? }
export function annotateSegments(text) {
  if (!text || typeof text !== 'string') return [{ type: 'text', text: text || '' }]

  // Collect all matches: { start, end, type, text, id?, latin? }
  const matches = []
  const seenLatinKeys = new Set() // avoid duplicate Latin annotations per text block

  // Glossary matches
  for (const { pattern, id, term } of glossaryPatterns) {
    const re = new RegExp(`\\b${esc(pattern)}s?\\b`, 'gi')
    let m
    while ((m = re.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'glossary', text: m[0], id })
    }
  }

  // Tree name matches — only annotate the first occurrence of each
  for (const { pattern, latin } of treePatterns) {
    const re = new RegExp(`\\b${esc(pattern)}\\b`, 'gi')
    let m
    while ((m = re.exec(text)) !== null) {
      const key = pattern.toLowerCase()
      if (!seenLatinKeys.has(key)) {
        matches.push({ start: m.index, end: m.index + m[0].length, type: 'tree', text: m[0], latin })
        seenLatinKeys.add(key)
      }
    }
  }

  if (matches.length === 0) return [{ type: 'text', text }]

  // Sort by start position, resolve overlaps (keep earlier/longer match)
  matches.sort((a, b) => a.start - b.start || b.end - a.end)
  const resolved = []
  let cursor = 0
  for (const m of matches) {
    if (m.start < cursor) continue // skip overlapping
    resolved.push(m)
    cursor = m.end
  }

  // Build segments
  const segments = []
  let pos = 0
  for (const m of resolved) {
    if (m.start > pos) segments.push({ type: 'text', text: text.slice(pos, m.start) })
    segments.push(m)
    pos = m.end
  }
  if (pos < text.length) segments.push({ type: 'text', text: text.slice(pos) })

  return segments
}
