# Landing in the inbox

The short version: **the technical setup is already better than most small senders, and
the remaining risk is almost entirely non-technical.** Authentication is table stakes —
getting it wrong is fatal, getting it right earns nothing. What actually decides this is
complaint rate, list quality, and the fact that at ~200/day Urban Tree Services is
statistically invisible to the main free monitoring tool.

## On "bypassing" — worth being blunt

There is a lot of legitimate room to improve inbox placement. There is essentially none
in evading the filters, and the most commonly suggested "trick" is actively
self-defeating:

**Stripping the `List-Unsubscribe` header so the mail doesn't "look bulk."** It's a
policy breach at Gmail, Yahoo and Microsoft, and NZ's UEMA requires a working unsubscribe
regardless. But the practical argument is stronger than the legal one: *the unsubscribe
chip is the cheap exit.* Remove it and the easiest remaining exit is **Report Spam** —
which is the single most damaging signal in the entire system. You'd be trading a neutral
event for the worst possible one.

Same logic disposes of the rest: engagement-warming networks that fake opens and clicks
corrupt the only data telling you whether real customers care; snowshoeing across
subdomains is the exact opposite of what a 30-email-a-day sender needs; hidden text and
white-on-white keywords are individually-scored filter rules that *raise* your spam score.

One thing often assumed to be a trick is actually fine: asking recipients once, plainly,
to drag the email to Primary or add the address to their contacts. That's a request to a
person about their own inbox, not an attempt to fool a classifier.

## The number that matters more than everything else

**At 2,000 recipients, 2 spam complaints = 0.10%. Six = 0.30%.**

Google wants you under 0.10% and treats 0.30% as the point where you stop being eligible
for any mitigation — recoverable only after seven consecutive days back under. Large
senders have statistical cushioning. This list has none: **one irritated customer in every
333 puts the domain at the enforcement threshold.**

That single fact reframes the whole project. Sending four times a year rather than monthly,
naming the actual tree, opening with why they're receiving it, putting a real reply-to on
it — all of that reads as good manners, and all of it is really the deliverability
strategy. On a small list, politeness *is* the technical architecture.

## What actually drives classification, ranked

1. **User spam complaints.** "The single biggest factor to deprecate sender reputation."
2. **List quality and permission provenance.** Drives complaints, bounces and trap hits.
3. **Per-recipient engagement history.** Gmail models each recipient individually. Clicks
   and replies are strong positives; opens are now near-worthless post-Apple MPP.
4. **Authentication.** Necessary, not sufficient. Already done here.
5. **Sending pattern.** Volume spikes, long gaps and irregular bursts are real negatives.
6. **Link domains.** Under-discussed and genuinely important — shared tracking domains
   carry other senders' reputation.

Largely folklore, despite being everywhere: spam-trigger-word lists, image-to-text ratios,
domain age on its own, and "plain text beats HTML for deliverability" (plain text is still
the right call here, but for tone and clarity reasons, not a deliverability multiplier).

## Microsoft is the problem, not Gmail

| Provider | Inbox | Spam | Missing |
|---|---|---|---|
| Gmail | 87.2% | 6.8% | 6.0% |
| **Microsoft** | **75.6%** | **14.6%** | 9.8% |
| Yahoo/AOL | 86.0% | 4.8% | 9.2% |
| Apple | 76.3% | 14.3% | 9.4% |

And Microsoft is roughly **three times more represented in an Australasian list than a US
one** (30.2% of AU recipients vs 10.8% US). On a list of older NZ residential customers —
hotmail, outlook, live, plus xtra forwarded to hotmail — expect that skew or worse.

The catch: Microsoft's monitoring tools are IP-based and need you to own the IP. On
Resend's shared pool there is **no telemetry for Microsoft at all**. The only levers are
authentication, complaint avoidance and seed testing.

**Xtra behaves differently again.** Spark uses SMX, and NZ/AU regional ISPs *block and
defer* rather than junk — 2.8% spam but 15.5% missing. So for Xtra, watch Resend's logs
for deferrals and 5xx rejections, not spam placement.

## The Promotions tab is not worth chasing

The only traceable measurement: Primary read rate **22%** vs Promotions **19.2%** — about
three percentage points. Every dramatic figure in circulation ("30% lower opens in
Promotions") traces only to content farms citing each other.

Also worth knowing: **Google Workspace recipients don't have a Promotions tab at all**, so
this doesn't apply to any commercial customers on the list. And `List-Unsubscribe` does
**not** cause Promotions placement — that myth is the main reason senders strip a required
header.

The format already chosen — short, no images, low link count, real reply-to — earns
whatever Primary placement is available honestly. Spend no further effort on it.

## Low frequency is a structural advantage

Gmail's "Manage subscriptions" view (launched July 2025) sorts senders by **how many
emails they've sent you recently**, with one-click unsubscribe. High-frequency senders are
systematically the most exposed. At 4–6 sends a year, Urban Tree Services sits at the very
bottom of that list or doesn't appear at all. The instinct to send rarely is protecting
the domain.

## The five things to actually do

1. **Verify and recency-segment the list before the first send.** ~$20 for 2,000 addresses
   through BriteVerify/ZeroBounce/Kickbox. Best-spent money in the project. Then send
   most-recent-first, and treat 4+ years as a separate, closely-watched batch.
2. **Audit list provenance.** Make sure quoted-but-declined leads didn't get merged in with
   actual customers — weaker consent basis and a much higher complaint population. The
   importer already marks quote-only contacts `suppressed`; verify that held after import.
3. **Keep the app's transactional mail on the same From domain.** Quote emails, job
   confirmations and invoices are a continuous trickle of high-engagement mail that keeps
   the domain warm between the 4–6 seasonal sends. This is the best answer to the long-gap
   problem, and it's the reason **not** to split marketing onto a separate subdomain at
   this volume — 30 emails/day split two ways gives neither identity enough signal.
4. **Warm up best-first, with a manual stop-gate.** Check complaints and bounces after day
   1 and again after day 3, and be willing to stop mid-campaign. A 2,000-person send at
   200/day runs ten days; if days 1–3 damage reputation, days 8–10 land in spam.
5. **Set up Google Postmaster Tools and DMARC `rua=` now** — but treat **Resend's
   per-domain data as the real monitoring backbone.**

## Expect Postmaster Tools to be mostly blank

Google withholds data when daily volume is too low, for privacy. At ~200/day, of which
maybe half reach personal Gmail, expect intermittent or empty panels. Set it up anyway to
capture a baseline — but **blank is not the same as healthy**, and it must not be the
primary instrument.

When it does show data: **spam rate** counts only manual "report spam" on DKIM-authenticated
mail (not messages Gmail filtered itself), and **domain reputation** dropping from High to
Medium right after a send is the earliest actionable warning available. Ignore the IP
reputation panel entirely — on a shared pool it reflects Resend's other customers.

## Smaller things worth doing

- **Send off-the-hour.** Mailbox providers see a traffic spike in the first minute of every
  hour from bulk sends scheduled on the hour, and throttle accordingly. Schedule 10:07am,
  not 10:00.
- **Turn open tracking off.** The tracking pixel *is* an image — so an "image-free" email
  with open tracking contains exactly one image. And post-MPP the data is close to
  worthless. Keep click tracking, on a custom tracking domain.
- **Never change the From identity between campaigns.** It resets Gmail's per-recipient
  model. `Josh at Urban Tree Services <office@urbantreeservices.net>`, permanently.
- **Move DMARC to `p=quarantine`** after 4–8 weeks of clean `p=none` reports.
- **Drop addresses on dead NZ ISP domains** — `clear.net.nz`, `paradise.net.nz`,
  `ihug.co.nz`, `xnet.co.nz`. Expired domains get repurposed as spam traps, and a list
  built since 2019 will contain them.
- **Suppress role addresses** — `info@`, `admin@`, `accounts@`, `office@`. Higher complaint
  risk and trap-adjacent.
- **Brief the crew not to hit Report Spam** on test copies. It genuinely counts.
- **Skip BIMI and skip a dedicated IP.** BIMI needs `p=quarantine` plus a paid certificate
  and won't pay back at this volume. A dedicated IP needs a couple of hundred thousand
  messages a month to stay warm — at ~1,000/month it would perform materially *worse* than
  Resend's shared pool.

## Tools

| Tool | Cost | What it actually tells you |
|---|---|---|
| **mail-tester.com** | free | Pre-flight config check. Target 10/10. Says nothing about reputation or real placement. Useful as an SMX/Xtra proxy since it's SpamAssassin-based. |
| **aboutmy.email** | free | Better than mail-tester for verifying the RFC 8058 one-click setup — that the endpoint takes POST not GET, and that DKIM covers both List-Unsubscribe headers. |
| **MXToolbox** | free | Blacklist check across ~100 RBLs. Run at setup and after each campaign. |
| **GlockApps** | ~$59–79/mo | The only tool that answers "inbox vs spam, per provider". Buy one month around campaign 1, then cancel. Seeds have no engagement history, so read it as a floor. |
| **Google Postmaster Tools** | free | See above — set up, expect sparse data. |
| **Resend dashboard** | included | **The real instrument.** Pivot by recipient domain and watch bounces, deferrals, complaints and clicks per domain. |

---

*Sources are recorded in the research that produced this: Google's sender guidelines and
Postmaster Tools docs, Microsoft's 2025 high-volume sender requirements, Spamhaus on
spamtraps, and Validity's 2025 Email Deliverability Benchmark Report. Figures without a
traceable primary source were excluded — a large share of published email-deliverability
advice is content farms citing each other.*
