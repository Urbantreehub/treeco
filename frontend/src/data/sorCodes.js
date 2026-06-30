// Spencer & Downer — Gardening Rate Card (Urban Tree Services)
// Source: Spencer_and_Downer_Codes.pdf
//
// Each code is prefixed by provider: SP- = Spencer, DW- = Downer.
// The same underlying code (e.g. YMG540) carries different rates per provider,
// so they are listed separately. Type "SP" or "DW" to filter by provider.
//
// rate: prefilled price (NZD, ex GST) per the rate card. null = quote required
//       (no fixed rate — enter the quoted amount manually).
// uom:  Hr / M2 / M3 / No. = qty × rate;  $ = charge item (enter total, qty 1).

export const SOR_CODES = [
  // ── Spencer (SP-) ───────────────────────────────────────────────────────
  { code: 'SP-YAA300', uom: 'Hr',  desc: 'Gardening Daywork Labour',           rate: 39.01 },
  { code: 'SP-YCX510', uom: 'M3',  desc: 'Green Waste Removal',                rate: 90.99 },
  { code: 'SP-YMG400', uom: 'M2',  desc: 'Hedge Prune',                        rate: 7.86 },
  { code: 'SP-YMG410', uom: '$',   desc: 'Small Tree/Bush Prune (quote required)', rate: null },
  { code: 'SP-YMG540', uom: 'No.', desc: 'Bush/Tree Cut Down ≤2m High',        rate: 35.46 },
  { code: 'SP-YMG550', uom: 'No.', desc: 'Bush/Tree Cut Down 2m–5m High',      rate: 154.65 },
  { code: 'SP-YMG555', uom: '$',   desc: 'Tree Cut Down >5m High (quote required)', rate: null },
  { code: 'SP-YMG560', uom: 'No.', desc: 'Tree Stump Removal 200–400mm',       rate: 187.20 },
  { code: 'SP-YMG565', uom: 'No.', desc: 'Small Tree Stump Removal ≤200mm',    rate: 56.29 },
  { code: 'SP-YMG570', uom: '$',   desc: 'Tree Prune (quote required)',        rate: null },

  // ── Downer (DW-) ────────────────────────────────────────────────────────
  { code: 'DW-YMG400', uom: 'M2',  desc: 'Hedge Prune',                        rate: 8.87 },
  { code: 'DW-YMG410', uom: '$',   desc: 'Small Tree/Bush Prune (quote required)', rate: null },
  { code: 'DW-YMG540', uom: 'No.', desc: 'Bush/Tree Cut Down ≤2m High',        rate: 45.22 },
  { code: 'DW-YMG550', uom: 'No.', desc: 'Bush/Tree Cut Down 2m–5m High',      rate: 174.62 },
  { code: 'DW-YMG555', uom: '$',   desc: 'Tree Cut Down >5m High (quote required)', rate: null },
  { code: 'DW-YMG560', uom: 'No.', desc: 'Tree Stump Removal 200–400mm',       rate: 329.47 },
  { code: 'DW-YMG565', uom: 'No.', desc: 'Small Tree Stump Removal ≤200mm',    rate: 63.55 },
  { code: 'DW-YMG570', uom: '$',   desc: 'Tree Prune (quote required)',        rate: null },
  { code: 'DW-YMG580', uom: '$',   desc: 'Poison/Dig Out Stump (quote required)', rate: null },
]

// Quick lookup by code
export const SOR_BY_CODE = Object.fromEntries(SOR_CODES.map(c => [c.code, c]))

// Charge items ($ UOM) — enter total value directly, qty = 1
export const CHARGE_CODES = new Set(SOR_CODES.filter(c => c.uom === '$').map(c => c.code))

export function searchSor(query) {
  if (!query || query.length < 2) return []
  const q = query.toUpperCase()
  return SOR_CODES.filter(c =>
    c.code.includes(q) ||
    c.desc.toUpperCase().includes(q)
  ).slice(0, 10)
}
