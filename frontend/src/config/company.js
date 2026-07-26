// Company details + the "why choose us" credibility content shown on the
// client-facing quote (QuoteView).
//
// ⚠️  EDIT THESE TO MATCH YOUR REAL CREDENTIALS before sending quotes to
//     clients — the review count, rating, insurance figure and qualifications
//     below are sensible defaults, not verified claims. Everything a client
//     sees comes from this one file so it's easy to keep accurate.
//
// In DEMO mode (VITE_DEMO=true) every real identifier below is replaced with a
// neutral fictional company so a showcase build carries no real business data —
// no GST number, phone, personal name, email or Google-reviews link. The
// production build is unaffected.

const IS_DEMO = import.meta.env.VITE_DEMO === 'true'

export const COMPANY = IS_DEMO ? {
  name: 'Evergreen Arbor Co.',
  shortName: 'Evergreen Arbor',
  phone: '04 000 0000',
  phoneRaw: '0400000000',
  website: 'www.example-arbor.co',
  email: 'office@example-arbor.co',
  gstNumber: '000-000-000',
  preparedBy: 'Demo User',
  region: 'Wellington',
} : {
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

// Email address that auto-creates pipeline leads: enquiry emails forwarded/CC'd
// here are turned into new_lead jobs (Postmark inbound → inbound-lead function).
// ⚠️ Set this to your actual Postmark inbound address before relying on it.
export const LEAD_INTAKE_EMAIL = IS_DEMO ? 'leads@example-arbor.co' : 'leads@urbantreeservices.net'

// Public quote-request form (also embeddable via /embed.js).
export const BOOKING_URL = IS_DEMO ? 'https://demo.example-arbor.co/book' : 'https://app.urbantreeservices.net/book'

// Google Business rating — shown as social proof. Confirm against your live
// Google Business Profile and update as reviews accumulate.
export const REVIEWS = {
  rating: 5.0,
  count: 40,                       // ← update to your real review count
  url: IS_DEMO ? '#' : 'https://www.google.com/search?q=Urban+Tree+Services+Wellington+reviews',
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
