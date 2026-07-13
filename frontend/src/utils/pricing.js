// Quote money maths for the quote builder.
// Prices are entered EX GST; totals are shown INCL GST at 15%.
// Kept here (rather than inline in QuoteBuilder) so it can be unit-tested.

export const GST = 0.15

// ex → incl GST
export function inclGst(v) {
  return Number(v || 0) * (1 + GST)
}

// A blank, zero, or invalid quantity is charged as 1 unit.
function qtyOf(i) {
  const q = Number(i.qty)
  return q > 0 ? q : 1
}

// Sum the line items and add GST.
// A line counts toward the subtotal unless it's an optional extra that hasn't
// been selected. A missing rate is treated as 0 (a free line).
export function calcTotals(items) {
  const subtotal = (items ?? [])
    .filter(i => !i.optional || i.selected)
    .reduce((s, i) => s + qtyOf(i) * (Number(i.rate) || 0), 0)
  const gst = subtotal * GST
  return { subtotal, gst, total: subtotal + gst }
}
