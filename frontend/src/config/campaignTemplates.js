// Starter copy for the Campaigns feature.
//
// WHY THESE READ THE WAY THEY DO
// Every template below is modelled on emails real customers have sent US, unprompted,
// asking to come back (see docs/campaigns/inbound-repeat-work-signals.md). Their
// language is plain, specific and slightly apologetic: "In March 2023 you pruned our
// large magnolia… could you do this again?". So these emails are short, plain-text,
// signed by Josh, and they name the actual tree. They are deliberately NOT newsletters.
//
// Three rules if you edit these:
//   1. Name the specific tree. {{last_job_summary}} is the whole point — a generic
//      "time for your tree maintenance" throws away the only asset we have.
//   2. Every sentence must still read correctly when a merge tag resolves to ''.
//      Roughly half of contacts have no suburb and a minority have no job summary.
//      Read each template twice: once full, once with the optional tags empty.
//   3. No exclamation marks, no "Don't miss out", no ALL CAPS, no images. The
//      compliance footer is appended automatically by _shared/campaign.ts — do not
//      hand-write an unsubscribe line into the body.
//
// The 5% offer is deliberately understated and framed as a thank-you for being a past
// customer, not as a limited-time promotion — it has to be mentioned at booking, so
// it also acts as the attribution mechanism for measuring the campaign.

export const CTA_URL = 'https://www.urbantreeservices.net'

export const CAMPAIGN_TEMPLATES = [
  {
    id: 'lapsed-12-24',
    name: 'Past customer — 1 to 2 years on',
    audience: { min_months_since_job: 12, max_months_since_job: 24 },
    subject: 'Your trees at {{suburb}} — about due?',
    subjectFallback: 'Checking in on your trees',
    preheader: 'A quick note from Josh at Urban Tree Services.',
    body: `Hi {{first_name}},

Josh here from Urban Tree Services. We {{last_job_summary}} for you about {{months_since_job}} months ago.

Most of what we prune puts on enough growth in a couple of years that it starts crowding the house or the fence again, so I thought I'd check in rather than let it get away on you.

If you'd like me to take a look, you can book a free quote here:
${CTA_URL}

No obligation at all — happy to just tell you it can wait another year if that's the honest answer. And if you do go ahead, mention this email when you book and I'll take 5% off.

Cheers,
Josh Micallef
Urban Tree Services`,
  },

  {
    id: 'lapsed-24-plus',
    name: 'Past customer — 2 to 4 years on',
    audience: { min_months_since_job: 24, max_months_since_job: 48 },
    subject: 'Been a while — your trees in {{suburb}}',
    subjectFallback: 'Been a while — how are your trees getting on?',
    preheader: 'It has been a few years since we were out.',
    body: `Hi {{first_name}},

It's Josh from Urban Tree Services. It's been a fair while since we were out to you — we {{last_job_summary}}.

Three or four years is usually about when regrowth starts causing the same problem again: branches back over the roof, light blocked off, or a hedge that's crept out past where you want it.

If you'd like a fresh set of eyes on it, quotes are free and there's no pressure:
${CTA_URL}

And because you've had us out before, mention this email when you book and I'll take 5% off the job.

Cheers,
Josh Micallef
Urban Tree Services`,
  },

  {
    id: 'annual-hedge-olive',
    name: 'Annual customers — hedges & olives',
    audience: { services: ['hedge', 'pruning'], min_months_since_job: 9 },
    subject: 'Booking in the annual trim',
    preheader: 'Getting the yearly hedge and olive work scheduled.',
    body: `Hi {{first_name}},

Josh from Urban Tree Services. We're starting to book in the yearly trims now, and you came to mind — we {{last_job_summary}}.

Hedges and olives are the two that really do want doing every year. Leave them two seasons and it turns into a much bigger job than it needs to be.

If you'd like to get a time locked in, easiest is to request a quote here:
${CTA_URL}

Or just reply to this email and Ashley will sort it out. Mention this email when you book and there's 5% off for you as a returning customer.

Cheers,
Josh Micallef
Urban Tree Services`,
  },

  {
    id: 'winter-pruning',
    name: 'Seasonal — winter pruning window (Jun–Aug)',
    audience: { services: ['pruning'], min_months_since_job: 10 },
    // ⚠️ NEVER send this to a stone-fruit customer. Plums, peaches, apricots and
    // cherries (Prunus) must NOT be pruned in a NZ winter — cool wet conditions are
    // exactly when silver leaf spreads and enters fresh cuts. Stone fruit is pruned
    // in summer, in a dry spell. Telling a plum owner to prune in July is the kind
    // of mistake a knowledgeable customer spots immediately, and expertise is the
    // whole asset this campaign trades on. Same caution for pōhutukawa and other
    // myrtles (myrtle rust attacks fresh growth) — they want May–Aug or Jan–Feb,
    // and never more than 20–25% of canopy at once.
    caution:
      'Exclude stone fruit (plum, peach, apricot, cherry) — winter pruning spreads ' +
      'silver leaf. Check last_job_summary for these species before sending.',
    subject: 'Best time of year for pruning is about now',
    preheader: 'Why winter is the right window for most deciduous trees.',
    body: `Hi {{first_name}},

Josh from Urban Tree Services.

Now through to the end of winter is the best window for most deciduous trees — oaks, ash, liquidambar, plane. No leaves means we can see the structure properly, the tree isn't putting energy into growth, and the wounds close over cleanly before spring. (Plums and other stone fruit are the exception — those want doing in summer.)

We {{last_job_summary}} last time we were out. If that's due again, or something else has grown into the house since, this is the right time of year to get it sorted.

Free quote, no obligation:
${CTA_URL}

Mention this email when you book and I'll knock 5% off.

Cheers,
Josh Micallef
Urban Tree Services`,
  },

  {
    id: 'storm-season',
    name: 'Storm damage — the flagship send',
    audience: { min_months_since_job: 12 },
    subject: 'After February, worth a look at your trees',
    subjectFallback: 'After February, worth a look at your trees',
    preheader: 'The Council logged almost 900 tree jobs in a week. Damaged trees keep failing.',
    // ── EVERY FACT BELOW IS SOURCED. DO NOT EMBELLISH. ────────────────────────
    // A representation about risk has to be substantiable at the moment it is
    // made (Fair Trading Act s12A), so each claim here is tied to a primary
    // source and worded no stronger than that source supports:
    //
    //  • 193 km/h Mt Kaukau, 128 km/h Wellington Airport, 16 Feb 2026; strongest
    //    at both sites since 2013 — MetService via RNZ.
    //  • WCC logged almost 900 tree job tickets in the ~5 days after that storm,
    //    against about 2,000 in all of 2025 — Dr Bradley Schroder, WCC Parks and
    //    Open Spaces Manager, WCC news release 21 Feb 2026.
    //  • "Many trees are likely to be in an unstable state and may continue to
    //    fall or drop branches over the next few weeks" — same source. This is
    //    the Council saying it, not us, which is exactly why it belongs here.
    //  • 46 storms in the 12 months to Feb 2026, one roughly every 8 days against
    //    one every 19 across the previous 15 years — IAG Wild Weather Tracker
    //    Issue 8 (the report itself, not the press release).
    //
    // ❌ THINGS THAT WERE IN AN EARLIER DRAFT AND MUST NOT COME BACK:
    //  • "Fallen trees are among the leading causes of storm claims" — that line
    //    exists only in IAG's press release and on the evidence describes Cyclone
    //    Vaianu's ~890 claims, not the 33,174 annual ones. There is NO published
    //    annual cause breakdown. Not substantiable. Removed.
    //  • "900 trees fell" — 900 is COUNCIL JOB TICKETS, which include hanging
    //    branches and debris. Say "tree jobs".
    //  • "Storms are up 256%" — 256% is the rise in CLAIMS. Storms went 29 → 46.
    //  • Never "prevent". Use "reduce the risk". A guarantee is an s13 problem.
    //  • The man killed by a falling branch in Mount Victoria in Oct 2025 is on
    //    the public record, but it does not go in a promotional email. Not ever.
    //
    // Always date the claims in the copy. By late 2026 "one storm every eight
    // days" is describing a period that ended in February, and an undated version
    // reads as a claim about right now.
    body: `Hi {{first_name}},

Josh from Urban Tree Services.

You'll remember the February storm. Mt Kaukau recorded a 193 km/h gust and the airport 128 km/h — the strongest winds at both since 2013.

The part that stuck with me was afterwards. Wellington City Council logged almost 900 tree jobs in the week that followed. In all of 2025 they logged about two thousand. And their parks manager made the point that a lot of trees were left unstable and would keep dropping branches for weeks after the wind had gone.

That's the bit people miss. A tree that survived a storm looking fine can be quietly compromised — a cracked union, a torn root plate, deadwood shaken loose and left hanging. It comes down in the next ordinary blow, not the big one.

It's not just us imagining the weather is worse, either. In the twelve months to February, the country's largest insurer counted 46 storms — about one every eight days. Across the previous fifteen years it was one every nineteen.

We {{last_job_summary}} when we were last at your place. If it's been a while, it's worth someone having a proper look — I'll tell you honestly if there's nothing that needs doing.

${CTA_URL}

Mention this email when you book and I'll take 5% off the job.

Cheers,
Josh Micallef
Urban Tree Services`,
  },
]

// Sensible starting offer for any campaign that uses one. Kept structured so the
// footer terms are generated rather than hand-typed — a discount claim has to state
// its conditions and expiry to be safe under the Fair Trading Act.
export const DEFAULT_OFFER = {
  offer_code: 'REGROWTH5',
  offer_percent: 5,
  offer_terms:
    '5% off the quoted price of one job, for past Urban Tree Services customers. ' +
    'Mention this email when you book. Applies to the labour component of a new ' +
    'quote only, cannot be used with any other offer, and does not apply to work ' +
    'already quoted or booked.',
}
