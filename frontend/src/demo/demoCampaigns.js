// Demo mailing list — one campaign that has been sent and one still in draft,
// with the per-recipient send log and tracking events behind them. Wired into
// DEMO_TABLES in supabase.js so the Campaigns page has a real send to show
// rather than four empty tabs.
//
// The send log is the point of the seed. "1,240 sent" tells you nothing about
// whether the feature works; a list of people with the exact copy each of them
// was handed does, and it is the part of the page that is hardest to picture
// from an empty state.
//
// Everything here is invented. The addresses are on example.com so no real
// inbox can ever be reached from a demo build, and the mock client never talks
// to a backend anyway.
import { isEmptyTenant } from './mockData'

// Days ago, as an ISO timestamp. Relative so the demo never looks abandoned.
function daysAgo(n, hour = 9, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

// yyyy-mm-dd, n months back — the shape marketing_contacts.last_job_at has.
function monthsAgoYmd(n) {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const SENT_BODY = `Hi {{first_name}},

It's been a while since we were out at your place, and this is the time of year
the wind finds anything that's grown out over the roof.

We're in your area over the next few weeks. If you'd like us to take a look
while we're nearby, just reply to this email or give us a call — no charge for
the quote, and no obligation.

Cheers,
Josh
Urban Tree Services`

// The audience the composer filters against (campaign_audience_eligible).
export const DEMO_MARKETING_CONTACTS = [
  { id: 'mc-1', email: 'angela.knight@example.com', first_name: 'Angela', last_name: 'Knight',
    full_name: 'Angela Knight', suburb: 'Karori', city: 'Wellington', contact_type: 'residential',
    consent_status: 'inferred', source: 'quotient', job_count: 2, lifetime_value: 3420,
    services: ['pruning'], last_job_at: monthsAgoYmd(19), months_since_job: 19,
    last_job_summary: 'Crown lift on two pohutukawa' },
  { id: 'mc-2', email: 'd.faletau@example.com', first_name: 'Daniel', last_name: 'Faletau',
    full_name: 'Daniel Faletau', suburb: 'Newtown', city: 'Wellington', contact_type: 'residential',
    consent_status: 'inferred', source: 'xero', job_count: 1, lifetime_value: 1150,
    services: ['hedge'], last_job_at: monthsAgoYmd(14), months_since_job: 14,
    last_job_summary: 'Hedge trim, front boundary' },
  { id: 'mc-3', email: 'r.tait@example.com', first_name: 'Richard', last_name: 'Tait',
    full_name: 'Richard Tait', suburb: 'Island Bay', city: 'Wellington', contact_type: 'residential',
    consent_status: 'inferred', source: 'quotient', job_count: 3, lifetime_value: 6890,
    services: ['pruning', 'removal'], last_job_at: monthsAgoYmd(26), months_since_job: 26,
    last_job_summary: 'Gum removal and stump grind' },
  { id: 'mc-4', email: 'sam.whiterod@example.com', first_name: 'Sam', last_name: 'Whiterod',
    full_name: 'Sam Whiterod', suburb: null, city: 'Wellington', contact_type: 'residential',
    consent_status: 'inferred', source: 'import', job_count: 1, lifetime_value: 780,
    services: [], last_job_at: monthsAgoYmd(31), months_since_job: 31,
    last_job_summary: null },
  { id: 'mc-5', email: 'jparker@example.com', first_name: 'Jess', last_name: 'Parker',
    full_name: 'Jess Parker', suburb: 'Miramar', city: 'Wellington', contact_type: 'residential',
    consent_status: 'inferred', source: 'app', job_count: 1, lifetime_value: 2240,
    services: ['removal'], last_job_at: monthsAgoYmd(13), months_since_job: 13,
    last_job_summary: 'Pine removal, rear section' },
]

export const DEMO_CAMPAIGNS = [
  {
    id: 'demo-camp-winter',
    name: 'Winter check-in — customers 12+ months on',
    subject: 'Anything need doing before the spring winds, {{first_name}}?',
    preheader: 'We\'re back in your area over the next few weeks',
    body: SENT_BODY,
    from_name: 'Josh at Urban Tree Services',
    from_email: 'office@urbantreeservices.net',
    reply_to: 'office@urbantreeservices.net',
    status: 'sent',
    scheduled_at: null,
    started_at: daysAgo(6, 8, 5),
    sent_at: daysAgo(6, 8, 41),
    audience: { min_months_since_job: 12 },
    offer_code: null, offer_percent: null, offer_expires_on: null, offer_terms: null,
    cta_label: 'Get a free quote',
    cta_url: 'https://www.urbantreeservices.net',
    stats: { recipients: 5, sent: 4, failed: 0, skipped: 1, queued: 0, opened: 3, clicked: 1, unsubscribed: 1 },
    created_by: 'demo-josh',
    created_at: daysAgo(8),
    updated_at: daysAgo(6, 8, 41),
  },
  {
    id: 'demo-camp-storm',
    name: 'Storm damage — same-week call-outs',
    subject: 'Storm damage? We have same-week call-outs',
    preheader: null,
    body: 'Hi {{first_name}},\n\nIf the wind has left anything hanging over a roof, driveway or fence line, we have same-week call-outs across {{suburb}} this month.\n\nSend a photo back to this email and we can usually price it without coming out.\n\nJosh\nUrban Tree Services',
    from_name: 'Josh at Urban Tree Services',
    from_email: 'office@urbantreeservices.net',
    reply_to: 'office@urbantreeservices.net',
    status: 'draft',
    scheduled_at: null, started_at: null, sent_at: null,
    audience: {},
    offer_code: null, offer_percent: null, offer_expires_on: null, offer_terms: null,
    cta_label: 'Get a free quote',
    cta_url: 'https://www.urbantreeservices.net',
    stats: {},
    created_by: 'demo-josh',
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
  },
]

// One row per recipient of the sent campaign, including the two that a real
// send always produces and an empty state never shows: a hard bounce and
// somebody skipped because they had already unsubscribed.
//
// subject_sent / body_sent are the rendered copy, merge tags already resolved —
// that is what the table stores, and what the Recipients list reads back.
const rendered = (name) => SENT_BODY.replace('{{first_name}}', name)

export const DEMO_CAMPAIGN_SENDS = [
  {
    id: 'demo-send-1', campaign_id: 'demo-camp-winter', contact_id: 'mc-1',
    email: 'angela.knight@example.com', status: 'sent', provider_id: 'demo-resend-1',
    error: null, skip_reason: null, attempts: 1,
    subject_sent: 'Anything need doing before the spring winds, Angela?',
    body_sent: rendered('Angela'),
    opened_at: daysAgo(6, 11, 5), open_count: 6,
    clicked_at: daysAgo(6, 11, 7), click_count: 1,
    queued_at: daysAgo(6, 8, 5), sent_at: daysAgo(6, 8, 6),
    marketing_contacts: { first_name: 'Angela', last_name: 'Knight' },
  },
  {
    id: 'demo-send-2', campaign_id: 'demo-camp-winter', contact_id: 'mc-3',
    email: 'r.tait@example.com', status: 'sent', provider_id: 'demo-resend-2',
    error: null, skip_reason: null, attempts: 1,
    subject_sent: 'Anything need doing before the spring winds, Richard?',
    body_sent: rendered('Richard'),
    opened_at: daysAgo(5, 19, 42), open_count: 1,
    clicked_at: null, click_count: 0,
    queued_at: daysAgo(6, 8, 5), sent_at: daysAgo(6, 8, 12),
    marketing_contacts: { first_name: 'Richard', last_name: 'Tait' },
  },
  {
    id: 'demo-send-3', campaign_id: 'demo-camp-winter', contact_id: 'mc-2',
    email: 'd.faletau@example.com', status: 'sent', provider_id: 'demo-resend-3',
    error: null, skip_reason: null, attempts: 1,
    subject_sent: 'Anything need doing before the spring winds, Daniel?',
    body_sent: rendered('Daniel'),
    opened_at: daysAgo(6, 12, 30), open_count: 2,
    clicked_at: null, click_count: 0,
    queued_at: daysAgo(6, 8, 5), sent_at: daysAgo(6, 8, 18),
    marketing_contacts: { first_name: 'Daniel', last_name: 'Faletau' },
  },
  {
    id: 'demo-send-4', campaign_id: 'demo-camp-winter', contact_id: 'mc-5',
    email: 'jparker@example.com', status: 'sent', provider_id: 'demo-resend-4',
    error: null, skip_reason: null, attempts: 2,
    subject_sent: 'Anything need doing before the spring winds, Jess?',
    body_sent: rendered('Jess'),
    opened_at: null, open_count: 0, clicked_at: null, click_count: 0,
    queued_at: daysAgo(6, 8, 5), sent_at: daysAgo(6, 8, 39),
    marketing_contacts: { first_name: 'Jess', last_name: 'Parker' },
  },
  {
    id: 'demo-send-5', campaign_id: 'demo-camp-winter', contact_id: 'mc-4',
    email: 'sam.whiterod@example.com', status: 'skipped', provider_id: null,
    error: null, skip_reason: 'unsubscribed before this campaign went out', attempts: 0,
    subject_sent: null, body_sent: null,
    opened_at: null, open_count: 0, clicked_at: null, click_count: 0,
    queued_at: daysAgo(6, 8, 5), sent_at: null,
    marketing_contacts: { first_name: 'Sam', last_name: 'Whiterod' },
  },
]

export const DEMO_CAMPAIGN_EVENTS = [
  { id: 'demo-ev-1', campaign_id: 'demo-camp-winter', send_id: 'demo-send-1', contact_id: 'mc-1',
    kind: 'unsubscribed', url: null, created_at: daysAgo(5, 9, 2),
    marketing_contacts: { first_name: 'Daniel', last_name: 'Faletau', email: 'd.faletau@example.com' } },
  { id: 'demo-ev-2', campaign_id: 'demo-camp-winter', send_id: 'demo-send-2', contact_id: 'mc-3',
    kind: 'opened', url: null, created_at: daysAgo(5, 19, 42),
    marketing_contacts: { first_name: 'Richard', last_name: 'Tait', email: 'r.tait@example.com' } },
  { id: 'demo-ev-3', campaign_id: 'demo-camp-winter', send_id: 'demo-send-1', contact_id: 'mc-1',
    kind: 'clicked', url: 'https://www.urbantreeservices.net', created_at: daysAgo(6, 11, 7),
    marketing_contacts: { first_name: 'Angela', last_name: 'Knight', email: 'angela.knight@example.com' } },
  { id: 'demo-ev-4', campaign_id: 'demo-camp-winter', send_id: 'demo-send-1', contact_id: 'mc-1',
    kind: 'opened', url: null, created_at: daysAgo(6, 11, 5),
    marketing_contacts: { first_name: 'Angela', last_name: 'Knight', email: 'angela.knight@example.com' } },
  { id: 'demo-ev-5', campaign_id: 'demo-camp-winter', send_id: 'demo-send-3', contact_id: 'mc-2',
    kind: 'opened', url: null, created_at: daysAgo(6, 12, 30),
    marketing_contacts: { first_name: 'Daniel', last_name: 'Faletau', email: 'd.faletau@example.com' } },
  { id: 'demo-ev-6', campaign_id: 'demo-camp-winter', send_id: 'demo-send-4', contact_id: 'mc-5',
    kind: 'sent', url: null, created_at: daysAgo(6, 8, 39),
    marketing_contacts: { first_name: 'Jess', last_name: 'Parker', email: 'jparker@example.com' } },
]

// Getters, like seededJobs/seededClients: the empty-tenant flag is read at
// mount time so one demo build can act as a brand-new account with no list.
export const seededMarketingContacts = () => (isEmptyTenant() ? [] : DEMO_MARKETING_CONTACTS)
export const seededCampaigns         = () => (isEmptyTenant() ? [] : DEMO_CAMPAIGNS)
export const seededCampaignSends     = () => (isEmptyTenant() ? [] : DEMO_CAMPAIGN_SENDS)
export const seededCampaignEvents    = () => (isEmptyTenant() ? [] : DEMO_CAMPAIGN_EVENTS)
