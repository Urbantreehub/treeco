// Quote money maths for the quote builder.
// Prices are entered EX GST; totals are shown INCL GST at 15%.
// Kept here (rather than inline in QuoteBuilder) so it can be unit-tested.

export const GST = 0.15

// ── Per-line add-on catalogs ────────────────────────────────────────────────
// Each line item can offer a "Disposal" choice and (for stump grinding) a
// "Grindings" choice. The office picks which options to offer and a markup
// price for each; the client picks one on the quote. Builders show the short
// label; the quote shows the full description.
export const DISPOSAL_OPTIONS = [
  { key: 'take_all',   short: 'Take all',   full: 'All cuttings taken off site' },
  { key: 'leave_wood', short: 'Leave wood', full: 'All bush chipped and wood left in 30cm firewood rings near base of tree' },
  { key: 'leave_all',  short: 'Leave all',  full: 'All cuttings left on site' },
]
export const GRINDINGS_OPTIONS = [
  { key: 'leave', short: 'Leave', full: 'All grindings left on site raked back into stump cavity' },
  { key: 'take',  short: 'Take',  full: 'All grindings taken off site' },
]

// The client-selected option for an add-on group (defaults to the first offered).
export function selectedAddon(group) {
  const opts = group?.options
  if (!Array.isArray(opts) || !opts.length) return null
  return opts.find(o => o.key === group.selected) ?? opts[0]
}

// Markup (ex GST) added to a line by its selected disposal + grindings options.
export function lineExtras(i) {
  return ['disposal', 'grindings'].reduce((sum, g) => {
    const opt = selectedAddon(i?.[g])
    return sum + (Number(opt?.price) || 0)
  }, 0)
}

// ex → incl GST
export function inclGst(v) {
  return Number(v || 0) * (1 + GST)
}

// A blank, zero, or invalid quantity is charged as 1 unit.
function qtyOf(i) {
  const q = Number(i.qty)
  return q > 0 ? q : 1
}

// Ex-GST contribution of a single line: qty × rate + selected add-on markups.
export function lineSubtotal(i) {
  return qtyOf(i) * (Number(i.rate) || 0) + lineExtras(i)
}

// Sum the line items and add GST.
// A line counts toward the subtotal unless it's an optional extra that hasn't
// been selected. A missing rate is treated as 0 (a free line).
export function calcTotals(items) {
  const subtotal = (items ?? [])
    .filter(i => !i.optional || i.selected)
    .reduce((s, i) => s + lineSubtotal(i), 0)
  const gst = subtotal * GST
  return { subtotal, gst, total: subtotal + gst }
}
