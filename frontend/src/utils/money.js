// Money formatting, in one place.
//
// Before this there were 13 separate nzd() definitions across the frontend with
// three different decimal conventions and one that formatted NZ dollars as AUD.
// More importantly, the same helper was used for both ex- and incl-GST values in
// the same file, so nothing at a call site told you which you were looking at.
//
// Convention now:
//   - INTERNAL / staff surfaces (pipeline, calendar, dashboard, work order, job
//     detail, sent quotes) show EX-GST, labelled.
//   - CLIENT-FACING surfaces (the quote page, quote emails/SMS, the Spencers
//     invoice PDF) stay INCL-GST — that's what a residential client is agreeing
//     to pay, and changing it would misrepresent quotes already accepted.
//
// Use exGst()/inclGst() rather than nzd() wherever the basis could be ambiguous;
// they carry the label with them so it can't drift from the number.

export const GST_RATE = 0.15

export function nzd(v, dp = 2) {
  if (v == null || v === '') return null
  return '$' + Number(v).toLocaleString('en-NZ', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })
}

// Whole dollars — for dense list/card contexts where cents are noise.
export const nzd0 = (v) => nzd(v, 0)

export const toIncl = (ex) => Number(ex || 0) * (1 + GST_RATE)
export const toEx   = (incl) => Number(incl || 0) / (1 + GST_RATE)

// Formatted strings with the basis attached. `dp` defaults to whole dollars
// because these are mostly used in cards and list rows.
export function exGst(v, dp = 0) {
  const s = nzd(v, dp)
  return s == null ? null : `${s} ex GST`
}

export function inclGst(v, dp = 0) {
  const s = nzd(v, dp)
  return s == null ? null : `${s} incl GST`
}

// A quote row's ex-GST value. Prefers the stored subtotal; falls back to
// deriving it from total, since two queries in the app select `total` without
// `subtotal` and back-filling every call site is riskier than a safe fallback.
export function quoteEx(quote) {
  if (!quote) return null
  if (quote.subtotal != null) return Number(quote.subtotal)
  if (quote.total != null) return toEx(quote.total)
  return null
}
