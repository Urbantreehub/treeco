# Mammuthus Sessions: subscription business model

Status: proposal, 13 September 2026. Source app: branch `claude/mammuthus-band-collab-4j0rw3`, folder `tools/mammuthus-sessions/`.

Mammuthus Sessions is currently a single-band workspace built to finish one album. This document records what it already does, then lays out how it becomes a subscription product sold to bands worldwide. All market figures and projections below are working assumptions, not measured results, and are marked as such.

## 1. What the app does today

Everything runs from one HTML file (about 1,800 lines) against Supabase for sign-in, database, file storage and live updates. It also runs as a Claude Artifact and in an offline preview mode. Five tabs: Songs, Calendar, Media & EPK, Money, Promo, plus Band settings and Chat.

### Write and record
- **Song records** with stage (Idea, Writing, Arranged, Demoed, Tracking, Mixing, Done), tempo, key, time signature, length, lyrics with copy and .txt download, session notes and reference tracks.
- **Writing checklist** per song: bass, drums, guitar 1, guitar 2, vocal melody, lyrics. **Tracking checklist**: drums, bass, guitar 1, guitar 2, vocals, scratch versus final take. Progress bars on the song list.
- **Audio versions**: every upload is a new version (v1, v2, ...), older versions kept. Waveform player with click to seek, A/B loop region, download of any version or a zip of a whole song's history. Files up to 100 MB, WAV bounces up to about 120 MB via chunked upload.
- **Timestamped notes** pinned to a moment in a specific version, drawn on the waveform, with edit, resolve, thumbs up and down, and @mentions.
- **Riff bank** for ideas that are not songs yet, with audio, tags, a "steal me" flag and one-click promotion to a song.
- **Google Drive import** that matches audio files in a folder to songs by title and alias, and re-offers files modified since.

### Rehearse and play
- **Setlists** built from the song list, reordered, with running time from song lengths, key, tempo and tuning per song, a print view, and a set-length target in hours.
- **Gig sheet** per gig event: load-in, soundcheck, set time and length, pay and paid flag, venue contact, backline, parking, stage plot and setlist.
- **Practice mode**: full-screen phone layout with latest audio, lyrics, big transport controls and auto-advance.
- **Metronome and tuner** in a floating panel. The metronome reads the song's tempo and time signature and can save a tapped tempo back to the song. The tuner uses the microphone.

### Organise
- **Calendar** of practices, gigs, jams and recording sessions with a plan field, Going / Maybe / Can't RSVPs, and add-to-phone links for Google Calendar and Outlook.
- **Availability grid**: six weeks where each member marks nights they cannot do. Nights everyone is free are highlighted with a "book" button.
- **Chat**: a band channel plus direct chats between any two members, with photo, video, audio and PDF attachments and unread indicators.
- **Activity feed** of uploads, notes, new songs, events and mentions. **Search** across songs, lyrics, notes, dates, setlists, riffs, chat and the EPK.
- **Push notifications** per device for new versions, notes, dates, money entries and mentions, via a Supabase Edge Function and a service worker.

### Money and merch
- **Expenses, income and settle-up transfers** split between members, per-member balances and a "who pays who" list.
- **Merch stock** with sizes and counts, and a sale log that books the income automatically.

### Promote
- **Media & EPK**: bio, pitch, genre, hometown, contact, links, press quotes, logo, captioned photo gallery, files. Copy as text or download as a self-contained .html.
- **Public EPK page** readable by promoters and press without signing in.
- **Release checklists** from a 14-step template with owners and due dates, a **content calendar** with platform, caption, media and status (idea, drafted, scheduled, posted), and a **press and radio outreach log**.
- **Contacts**: venues, promoters, engineers, photographers, bands, press, with click-to-call.

### Band settings
- Members with instruments and colours, album title, target date, notes, and a storage meter.

### What it is not, yet
- **Single tenant.** One Supabase project per band. The security rules let any signed-in user read and write everything, so it cannot host two bands in one project.
- **No billing, no plans, no admin roles.** Every member is equal.
- **English only**, with strings embedded in the file.
- **No native app.** It is a web app that installs to the home screen.
- **Tied to TreeCo's deployment.** It builds into TreeCo's Vercel output at `/band/`.

## 2. The product to sell

**Positioning.** Everything a band does except make the music: versions, notes, gigs, money, promo, in one place, priced per band. The nearest tools each cover one slice: BandHelper and OnSong cover setlists and gig logistics, Bandzoogle covers websites and EPKs, Splitwise covers money, SoundCloud private links and Dropbox cover audio, Discord covers chat. Bands stitch five subscriptions and a group chat together. The pitch is one login the whole band shares, with the version-plus-timestamped-notes loop as the hook nothing else offers cheaply.

**Working name.** Keep "Mammuthus Sessions" for now. Naming, trademark search and a domain are a launch task, not a blocker for this plan.

**Who buys.** The band, not the musician. One member (usually the organiser: the drummer, the manager, the one who books gigs) pays and the Money tab can split the subscription among members like any other expense. Secondary buyers: rehearsal studios, music schools and small labels that run several bands.

**Why per band beats per seat.** Bands are 3 to 7 people with very uneven engagement. Per-seat pricing punishes inviting the bass player who only reads the calendar. Unlimited members per band removes the friction that kills adoption, and the data model (one band, one document tree) already matches it.

## 3. Pricing and tiers

USD is the base currency. Prices are working proposals to test at launch.

| Tier | Price | Storage | Included | Who it is for |
|---|---|---|---|---|
| **Jam** (free) | $0 | 1 GB, 10 songs | Songs, versions, notes, calendar, chat, setlists, up to 5 members | Trial, school bands, covers bands |
| **Band** | $12 / month or $99 / year | 25 GB | Everything in Jam plus unlimited members and songs, Money and merch, EPK, gig sheets, availability grid, push, Drive import | The working original band |
| **Touring** | $29 / month or $249 / year | 200 GB | Everything in Band plus public EPK on a custom domain, release checklists and content calendar, press log, multiple bands per member, priority support | Bands that gig monthly and release regularly |
| **Studio** | $79 / month or $690 / year | 1 TB, up to 15 bands | Organisation account, admin roles, per-band spaces, studio-wide calendar, invoicing hooks | Rehearsal studios, music schools, small labels, managers |

Annual pricing is about 30 percent off and is the default shown, because bands break up and a paid year survives a quiet quarter.

**Add-ons.** Extra storage at $5 per 100 GB per month. Extra bands on Touring at $8 per band per month.

**Purchasing-power pricing.** Same tiers, three price bands set by billing country, enforced by Stripe with local currency:

| Band | Example countries | Multiplier on USD |
|---|---|---|
| A | US, Canada, UK, EU, Australia, New Zealand, Japan, Singapore | 1.0 |
| B | Brazil, Mexico, Argentina, Poland, Turkey, Thailand, Philippines, South Africa | 0.5 |
| C | India, Indonesia, Nigeria, Kenya, Pakistan, Egypt | 0.3 |

Local-currency examples for Band tier: NZ$19 / month, £9 / month, €11 / month, ₹299 / month, R$29 / month.

## 4. Unit economics

Assumptions for one Band-tier band on Supabase plus an object store with free egress (Cloudflare R2 or equivalent). Audio streaming is the cost that matters, so the audio bucket must not sit on a store that charges egress.

| Item | Per band per month |
|---|---|
| Revenue (blended monthly and annual, after PPP mix) | $9.50 |
| Payment fees (about 3 percent plus $0.30) | $0.60 |
| Storage, 10 GB average at $0.015 / GB | $0.15 |
| Database, auth, realtime, functions (shared Supabase Pro, amortised) | $0.40 |
| Email, push, monitoring (amortised) | $0.10 |
| Support (amortised at scale) | $0.50 |
| **Contribution margin** | **$7.75 (about 82 percent)** |

Churn drives everything. Bands break up, so assume 4 percent monthly churn on Band tier (about a two-year life) and 2.5 percent on annual and Touring. At $7.75 contribution and 4 percent churn, lifetime value is about $195 per band. Target customer acquisition cost under $60, which sets the ceiling for paid channels.

Fixed costs before headcount: Supabase Pro with a compute add-on, Vercel Pro, R2, Stripe Tax, transactional email, error tracking, a status page. Roughly $250 to $400 per month at launch, rising with usage rather than with band count.

## 5. International plan

- **Payments and tax.** Stripe Billing with Stripe Tax handles VAT, GST and US sales tax registration thresholds and invoices in about 135 currencies. Add PayPal in year one for Germany, Brazil and India where card penetration is low. Apple and Google in-app purchase only if a native wrapper ships, and then price native purchases 30 percent higher to cover the store fee.
- **Localisation.** Pull strings out of the file into a translation table. Launch languages in order of band density and existing English literacy: English, Spanish, Portuguese (Brazil), German, French, Japanese, Indonesian. Dates, time signatures, currencies and calendar links already come from the browser locale.
- **Data residency.** Supabase runs in US, EU (Frankfurt), UK, Sydney, Singapore, Tokyo and São Paulo. Pin each organisation to a home region at sign-up. EU bands stay in the EU, which is the GDPR requirement most likely to be asked about by schools.
- **Legal.** Terms of service with a DMCA and EU Copyright Directive notice-and-takedown process, because members upload recordings. A privacy policy and data processing agreement for studios and schools. An age floor of 16 with parental consent under it for the school segment.
- **Support hours.** Follow the sun by hiring the first support person in a time zone 8 to 10 hours from New Zealand, so two people cover most of the day.

## 6. Go-to-market

The viral loop is the plan. Musicians play in more than one band. Every member invited into one band is a potential organiser of their next band, and every public EPK page carries a "Made with" line. Design for it:

- **Free tier that is genuinely usable** so a band's second and third bands start free and convert when they hit storage or song limits.
- **Invite by link and by phone contact.** Onboarding measured by time to first version upload with a note from a second member.
- **Rehearsal studios and music schools** as channel partners. They already hold the venue contact and calendar features the app models. Offer Studio tier free for six months in exchange for a poster in every room and an onboarding link on their booking confirmation email.
- **Content and search.** Guides on gig sheets, stage plots, splitting band money, setlist timing. These are the queries bands type. The setlist print view and the EPK export are shareable artefacts that carry the name.
- **Communities.** Reddit music-maker and gear communities, Bandcamp and Discord scenes, YouTube gear channels with a sponsor code. Local scene launches, one city at a time, starting with Wellington and Melbourne, then Austin, Manchester and Berlin.
- **Referral.** One free month per referred band that pays.

## 7. What must be built before a launch

1. **Multi-tenant data model.** Add a bands table and a memberships table, put a band id on every document and storage path, and rewrite the security rules from "any signed-in user" to "members of this band". This is the largest change and the one everything else depends on.
2. **Accounts and roles.** Owner, admin, member. Owner holds the billing relationship. Magic link and Google sign-in. Switch between bands.
3. **Billing.** Stripe Checkout and customer portal, webhooks that set a plan and limits on the band record, limit enforcement on storage and song count, PPP price lookup by billing country.
4. **Separate the product from TreeCo.** Own repository, Vercel project, Supabase organisation, domain, email sender and legal entity. The current `/band/` route on the TreeCo domain should be retired once the new host is live.
5. **Move the audio bucket** to a store without egress fees, keep Supabase storage for small assets.
6. **Internationalisation** of the interface strings.
7. **Operational basics.** Backups with tested restore, error tracking, uptime monitoring, a status page, account deletion and data export for GDPR.
8. **Native wrappers** later, only if home-screen install proves to be an adoption barrier in a measured cohort.

Rough sequence: items 1 to 4 in the first eight to ten weeks, 5 and 7 by week twelve, 6 in the first quarter after launch, 8 after six months of data.

## 8. Three-year projection

All figures are targets to plan against, not forecasts. They assume 4 percent free-to-paid conversion, the churn above, a blended $9.50 revenue per paying band per month, and marketing spend held to the $60 acquisition cost ceiling.

| Year end | Free bands | Paying bands | Monthly recurring revenue | Annual run rate | Infrastructure and tools per month | People |
|---|---|---|---|---|---|---|
| Year 1 | 4,000 | 400 | $3,800 | $46,000 | $400 | Founder plus one part-time developer |
| Year 2 | 20,000 | 2,000 | $19,000 | $228,000 | $1,200 | Plus one support and one developer |
| Year 3 | 60,000 | 7,000 | $66,500 | $800,000 | $3,500 | Team of five |

Break-even on cash operating costs, excluding founder salary, sits around 350 paying bands. The Studio tier is the lever for year three: fifty studios at $79 contribute as much as 400 individual bands and churn far less.

## 9. Metrics to run the business on

- Bands created per week, and share created by an invited member of another band.
- Activation: share of new bands with a version upload and a note from a second member within seven days.
- Free-to-paid conversion at 30 days and at the storage or song limit.
- Monthly churn by tier and by band age.
- Revenue per paying band after PPP mix.
- Audio egress per band per month, because it is the one cost that can run away.
- Support tickets per hundred bands.

## 10. Risks

- **Bands break up.** Churn is structural. Annual plans, the Studio tier, and multi-band accounts for the individual musician are the hedges.
- **Free stacks are good enough.** Drive, Discord and a spreadsheet cost nothing. The answer is the version-and-notes loop and the money split, which are painful in those tools.
- **Copyright exposure.** Members will upload covers and samples. Notice-and-takedown, private-by-default storage and clear terms keep this in safe-harbour territory.
- **Payment friction.** Who in the band pays. The Money tab splitting the subscription automatically turns the objection into a feature.
- **App store dependence.** Staying a web app avoids the 30 percent fee and review delays. Only wrap natively if data shows install friction.
- **Coupling to the tree business.** Shared domain, deployment and legal entity today. Separate before the first paying customer.
