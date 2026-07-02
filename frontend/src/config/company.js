// Company details + the "why choose us" credibility content shown on the
// client-facing quote (QuoteView).
//
// ⚠️  EDIT THESE TO MATCH YOUR REAL CREDENTIALS before sending quotes to
//     clients — the review count, rating, insurance figure and qualifications
//     below are sensible defaults, not verified claims. Everything a client
//     sees comes from this one file so it's easy to keep accurate.

export const COMPANY = {
  name: 'Urban Tree Services Limited',
  shortName: 'Urban Tree Services',
  phone: '027 203 1446',
  phoneRaw: '0272031446',
  website: 'www.urbantreeservices.net',
  email: 'office@urbantreeservices.net',
  gstNumber: '132-299-374',
  preparedBy: 'Josh Micallef',
  region: 'Wellington',
}

// Google Business rating — shown as social proof. Confirm against your live
// Google Business Profile and update as reviews accumulate.
export const REVIEWS = {
  rating: 5.0,
  count: 40,                       // ← update to your real review count
  url: 'https://www.google.com/search?q=Urban+Tree+Services+Wellington+reviews',
  quotes: [
    { text: 'Professional, tidy and turned up on time. Cleaned up better than they found it.', author: 'Verified Google review' },
    { text: 'Great communication and a fair price. Highly recommend for any tree work.', author: 'Verified Google review' },
  ],
}

// Qualifications & accreditations — the trust badges on the quote.
export const QUALIFICATIONS = [
  { label: 'Qualified Arborists', detail: 'NZ Certificate in Arboriculture — trained, not just experienced' },
  { label: 'Fully Insured', detail: '$2M public liability cover on every job' },
  { label: 'SiteWise Certified', detail: 'Independently audited health & safety systems' },
  { label: 'Growsafe & First Aid', detail: 'Current certifications across the crew' },
]

// The short "why us" selling points.
export const WHY_US = [
  'Locally owned and operated right here in Wellington',
  'Free, no-obligation quotes with clear itemised pricing',
  'Careful, tidy work — we treat your property like our own',
  'Fully insured for total peace of mind',
]
