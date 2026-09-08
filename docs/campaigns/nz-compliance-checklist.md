# NZ compliance — what every campaign must satisfy

This is New Zealand law, not US. **CAN-SPAM does not apply**, and its physical-postal-
address requirement is not a NZ obligation (we include location details anyway because
it helps deliverability and looks legitimate).

Three statutes matter. Each one is enforced somewhere specific in the code, so the
rules can't quietly drift out of the product.

---

## 1. Unsolicited Electronic Messages Act 2007 (UEMA)

Administered by the Department of Internal Affairs. It governs commercial electronic
messages with a New Zealand link.

### Consent — the basis for this entire list

UEMA recognises **express**, **inferred** and **deemed** consent. This programme runs
on **inferred consent**: an existing business relationship with a past customer.

⚠️ **The regulator reads this more narrowly than most businesses assume, and this is
the single most important finding in this document.** DIA's published guidance states:

> *"We don't consider that you can reasonably infer consent from a single transaction."*

and, separately:

> *"If someone has been on your existing database and has not 'unsubscribed', it does
> not mean that consent can be inferred."*

Consent strength comes from **ongoing relationship, not elapsed time** — DIA's phrasing
is that *"over time the on-going correspondence becomes evidence of a relationship."*
There is no statutory time limit in NZ, but there is also no safe harbour.

**And the burden of proof is reversed.** UEMA s9(3): *"A person who contends that a
recipient consented to receiving a commercial electronic message has the onus of proof
in relation to that matter."* If DIA asks, Urban Tree Services must prove consent — DIA
does not have to prove its absence. That is why `consent_status`, `consent_source` and
`consent_at` are stored per contact rather than assumed.

**What this means for the 2,230-person list, stated plainly:** only **346 of them are
repeat customers** with the multi-job history that makes inferred consent comfortably
defensible. The remaining ~1,884 had a single transaction. That does not make emailing
them unlawful — the statute is open-textured and a paid job is a real business
relationship — but it is a weaker position than the raw number suggests.

> **DECIDED — Josh, 2 Sep 2026.** Single-job customers are **in**. He has read the
> position above and accepted the risk. This is a legitimate call for the business owner
> to make: DIA's "single transaction" line is guidance, not statute; the people in
> question paid for work at their own homes; and the practical exposure for a small
> operator sending a low-frequency, genuinely useful reminder — with accurate sender
> details and an instant unsubscribe — is a formal warning at worst, not a penalty.
>
> What this changes: **nothing in the code.** The importer already marks anyone with an
> accepted, completed job as `inferred`, regardless of how many jobs they've had. The
> narrower position was only ever a recommendation in this document.
>
> What it does raise is the **complaint rate**, which is the thing that actually bites
> (see `CAMPAIGNS-SETUP.md` §9). Single-job customers from years ago are likelier to have
> forgotten who Urban Tree Services is. The mitigations already built for that are the
> ones to lean on: the "you're getting this because…" line, naming the specific tree and
> the date, and the warm-up ramp that sends to the most recent customers first.

That has a direct consequence for the data model, and it is the reason the importer
behaves the way it does:

- Only contacts with a **genuinely completed and paid job** are marked
  `consent_status = 'inferred'`.
- A Quotient contact who was only ever *quoted* — never accepted, never invoiced — is
  imported as `suppressed` and is **not** mailable without a separate decision.
- The older the relationship, the weaker the inference. The 878 contacts last seen 4+
  years ago are the weakest claim on the list. See `CAMPAIGNS-SETUP.md` §7.

### Sender identification

Every message must clearly and accurately identify the sender and give contact details
that stay valid. → `complianceFooter()` in `supabase/functions/_shared/campaign.ts`
emits the legal entity name (Urban Tree Services Limited), region, phone, email and
website on every send. It is appended automatically; campaign bodies must not
hand-write their own.

### Functional unsubscribe

Required on every commercial message. It must be free, it must work for **at least 30
days** after the message was sent, and requests must be honoured within **5 working
days**.

How that is met here — the unsubscribe is instant, not batched:

| Requirement | Implementation |
|---|---|
| Present on every send | `complianceFooter()`, appended by the renderer, not by the template |
| Works without login | `campaign_unsubscribe` is a `SECURITY DEFINER` RPC granted to `anon` |
| Never breaks | Token is permanent (`marketing_contacts.unsubscribe_token`), not campaign-scoped, so old emails keep working indefinitely — well beyond 30 days |
| Actioned immediately | RPC sets `consent_status='unsubscribed'` **and** writes to `email_suppressions` in the same transaction |
| Fast enough for the mailbox providers | s9(2) allows **5 working days**, but **Google requires 48 hours and Yahoo 2 days** — and they are the ones who can silently junk-folder you. We suppress instantly; treat the statutory 5 days as a backstop only |
| Can't be re-subscribed by accident | The importer is explicitly forbidden from overwriting `unsubscribed` / `bounced` / `complained` state on re-import |
| Honoured at send time | The sender may only read `campaign_audience_eligible`, never the base table |
| One-click support | `List-Unsubscribe` + `List-Unsubscribe-Post` headers, backed by a real POST endpoint |

The unsubscribe link is **never click-tracked**. Measuring who is trying to leave is
both distasteful and a legal risk if the tracking redirect ever fails.

**Do not mix marketing into transactional email.** UEMA s6(b) exempts quotes the
customer asked for, job confirmations, invoices and receipts. The moment a "5% off your
next prune" line is added to one of those, **the whole message becomes a commercial
electronic message** and needs consent, sender ID and an unsubscribe. Google penalises
the same mixing independently, for deliverability. Keep the two streams separate — which
the architecture already does, since campaigns never touch the quote-email path.

**Penalties** (s45, on application by DIA to the High Court): up to **$200,000 for an
individual** and **$500,000 for a body corporate**. Separately, an affected person can
claim compensation and damages (s46), and liability can attach to all three for the same
event (s48). DIA's usual first step with a small business acting in good faith is a
formal warning (s23). Limitation period is two years (s50).

---

## 2. Privacy Act 2020

Holding customer contact details for marketing engages the Information Privacy
Principles — in particular purpose limitation (IPP1), awareness (IPP3), retention
(IPP9) and access and correction (IPP6/7).

Practical effect on this build:

- The footer states **why** the person is receiving the email ("You're getting this
  because you've had tree work done by us in Karori"). That is the IPP3 awareness
  point, and it is also the single line most likely to stop someone hitting "spam".
- `campaign_sends` stores the exact `subject_sent` and `body_sent` per recipient, so
  an access request can be answered precisely rather than approximately. Campaigns →
  Results → a campaign → **Recipients** reads that back in the app: search the address,
  open the row, and the copy that person was handed is on screen. No SQL editor, which
  matters because a request answered from the SQL editor tends not to get answered.
- A deletion request should remove the `marketing_contacts` row **but leave the
  `email_suppressions` row in place** — that row is the mechanism that stops a future
  import re-adding them, and keeping it is consistent with the purpose.

---

## 3. Fair Trading Act 1986 — the 5% offer

A discount claim must not mislead. The risks with "5% off" are claiming a saving
against a price never actually charged, and omitting the conditions.

Enforcement in code:

- `campaigns` stores `offer_code`, `offer_percent`, `offer_expires_on` and
  `offer_terms` as **structured fields**, and the footer terms are generated from
  them — so the terms can't drift away from the offer actually being run.
- `validateCampaign()` in `frontend/src/utils/campaigns.js` refuses a campaign that
  sets `offer_percent` with no `offer_expires_on`. An open-ended discount with no
  expiry is the classic Fair Trading problem.
- The default terms in `frontend/src/config/campaignTemplates.js` state the scope
  plainly: one job, labour component, not with other offers, not on work already
  quoted.

Because the offer is redeemed by *mentioning it when booking*, it also doubles as the
attribution mechanism — Ashley noting "mentioned the email" at booking is the only
reliable way to measure revenue from this, since a phone booking has no click trail.

---

## The pre-send checklist

Run this before flipping `campaign_send_enabled` on for a new campaign:

- [ ] Audience contains **no commercial accounts** (Downer, Spencers Henshaw, councils, Kāinga Ora, property managers)
- [ ] Every recipient has real completed work behind them, not just an old quote
- [ ] Footer renders with the correct legal name, phone, email and reason-for-receiving
- [ ] Unsubscribe link resolves and completes on a real device, logged out
- [ ] If there's an offer: percent, expiry and terms are all set and truthful
- [ ] Subject line passes `validateCampaign()` with no spam-trigger warnings
- [ ] A test send has been read on a phone, in both HTML and plain text
- [ ] DMARC record is live (see `CAMPAIGNS-SETUP.md` §3)

---

*Written 2 Sep 2026 as engineering documentation of how the feature meets its
obligations. It is not legal advice — if a campaign ever goes beyond past customers
into cold outreach, the inferred-consent basis no longer holds and the position needs
proper review.*
