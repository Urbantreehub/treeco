// Quote money maths for the quote builder.
// Prices are entered EX GST; totals are shown INCL GST at 15%.
// Kept here (rather than inline in QuoteBuilder) so it can be unit-tested.

export const GST = 0.15

// ex → incl GST
export function inclGst(v) {
  return Number(v || 0) * (1 + GST)
}

// Sum the line items and add GST.
// A line counts toward the subtotal unless it's an optional extra that hasn't
// been selected. Blank/NaN qty or rate is treated as 0.
export function calcTotals(items) {
  const subtotal = (items ?? [])
    .filter(i => !i.optional || i.selected)
    .reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0)
  const gst = subtotal * GST
  return { subtotal, gst, total: subtotal + gst }
}
