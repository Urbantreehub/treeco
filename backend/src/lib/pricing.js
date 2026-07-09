// Quote money maths — GST-inclusive totals for a set of line items.
// Used by both the create (POST) and update (PUT) quote endpoints so the two
// can never drift apart.

export const GST_RATE = 0.15

// A blank, zero, or invalid quantity is charged as 1 unit.
function qtyOf(i) {
  const q = Number(i.qty)
  return q > 0 ? q : 1
}

// A line item counts toward the subtotal unless it's been explicitly
// deselected (selected === false). Missing rate defaults to 0.
// gst and total are rounded to whole cents.
export function calcQuoteTotals(lineItems) {
  const items = lineItems ?? []
  const subtotal = items
    .filter(i => i.selected !== false)
    .reduce((sum, i) => sum + qtyOf(i) * (Number(i.rate) || 0), 0)
  const gst = +(subtotal * GST_RATE).toFixed(2)
  const total = +(subtotal + gst).toFixed(2)
  return { subtotal, gst, total }
}
