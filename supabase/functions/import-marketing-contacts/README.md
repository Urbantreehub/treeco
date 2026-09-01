# import-marketing-contacts

Populates `marketing_contacts` — the Campaigns mailing list — from the three places
Urban Tree's customer history actually lives: **Xero**, **Quotient**, and the app's
own **clients** table.

```
POST /functions/v1/import-marketing-contacts
Authorization: Bearer <session JWT of a full/office user>
Content-Type: application/json

{ "source": "xero" | "quotient" | "clients", "contacts": [...], "dry_run": true }
```

Deploy with:

```bash
supabase functions deploy import-marketing-contacts
```

---

## Always dry-run first

`"dry_run": true` computes the entire result — every insert, every merge, the
classification split, the sample rows — and writes **nothing**. Run it, read the
`sample` array, then run it again for real.

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/import-marketing-contacts" \
  -H "Authorization: Bearer $SESSION_JWT" \
  -H "Content-Type: application/json" \
  -d '{"source":"xero","dry_run":true}' | jq
```

`$SESSION_JWT` is a signed-in **full or office** user's access token (in the app:
`supabase.auth.getSession()` → `data.session.access_token`). The anon key alone
gets a 401 — importing the customer list is not an anonymous operation.

### Response

```jsonc
{
  "ok": true,
  "source": "xero",
  "dry_run": true,
  "scanned": 4357,              // rows seen from the source
  "inserted": 2810,             // new contacts (or would-be, in a dry run)
  "updated": 1102,              // merged into an existing contact
  "skipped_no_email": 402,      // no email address at all
  "skipped_invalid": 43,        // malformed email, or a row that failed validation
  "classified": { "residential": 3689, "commercial": 223 },
  "suppressed_no_history": 611, // imported as consent_status='suppressed'
  "sample": [ /* first 5 rendered rows, exactly as they will be written */ ],
  "errors": [ { "index": 12, "source_ref": "1003", "error": "…" } ],
  "error_count": 3,
  "meta": { "xero_contacts": 4102, "joined_on_quote_no": 318 }
}
```

---

## Source: `xero`

```json
{ "source": "xero", "dry_run": false }
```

Pulls straight from the Xero API using the stored `xero_connections` row (the same
connection Settings → Integrations sets up, refreshed the same way as
`xero-invoice`):

- `GET /Contacts?page=N` — name, `EmailAddress`, `Addresses`, `IsCustomer`.
- `GET /Invoices?where=Type=="ACCREC"&page=N` — **with line items**. Xero only returns
  line items when the `page` parameter is present, which is why paging is mandatory
  rather than an optimisation.

Per contact it derives first invoice date, last invoice date, invoice count, lifetime
value (sum of `AmountPaid` on ACCREC, excluding VOIDED/DELETED), and the line-item
descriptions of the most recent invoice (which become `last_job_summary`).

### Required Xero scopes

| Scope | Used for |
|---|---|
| `accounting.contacts.read` | `GET /Contacts` |
| `accounting.transactions.read` | `GET /Invoices` |

The function decodes the `scope` claim out of the stored access token and fails
**before** calling Xero if either is missing, naming the exact scope:

> Xero connection is missing the "accounting.transactions.read" scope. Reconnect Xero
> in Settings → Integrations and approve it — a token refresh cannot add a scope.

A refresh token cannot widen a scope. The only fix is disconnecting and reconnecting
Xero with the wider consent screen.

---

## Source: `clients`

```json
{ "source": "clients", "dry_run": false }
```

Seeds from the app's own data: `clients` joined to `jobs` (status
`complete_to_invoice` or `invoiced` = work actually done) and to their accepted /
complete / invoiced `quotes` for line items and value. Written with
`source = 'app'`, `source_ref = clients.id`, and `client_id` linked.

---

## Source: `quotient`

Quotient has **no read API**, so the rows are extracted in the browser and POSTed:

```json
{
  "source": "quotient",
  "contacts": [
    {
      "source_ref": "1001",           // Quotient contact_id — the row's identity
      "first_name": "Colleen",
      "last_name": "Riches",
      "email": "colleen@example.co.nz",
      "phone": "021 555 0000",
      "address": "77 Cockayne Rd",
      "city": "Khandallah",
      "first_quoted": 1552521600,     // unix SECONDS
      "last_quoted": 1652521600,
      "quote_count": 3,
      "accepted_count": 2,
      "accepted_total": 1830.5,
      "type": "person",
      "quote_nos": ["5515", "5610"],  // optional — the join key back to Xero
      "last_job_title": "..."          // optional — improves last_job_summary
    }
  ]
}
```

- Max **5000** rows per request (413 above that — split the batch).
- Each row is validated on its own. A bad row lands in `errors` with its index and
  the rest of the batch still imports.
- Only an **accepted** quote counts as work done. A contact with
  `accepted_count = 0` gets no job dates and is imported as `consent_status =
  'suppressed'`, never mailed without a human decision.

### Browser extraction snippet

> **Verified against the live account on 2 Sep 2026.** Running the snippet below on a
> 40-contact sample produced 39 rows with a usable email, 30 with a city and 38 with a
> phone number, in the exact shape the `quotient` source expects. Across the full
> account there are **4,357 active contacts and 3,142 accepted quotes back to May
> 2019**, of which **2,266 contacts have accepted work**.
>
> The quote-number join is matched on **normalised customer name**, not an id, because
> the Quotient quote list exposes only `_companyOrPerson`. Measured over the full data
> set that joins **98% (2,220 of 2,266)**. The ~2% that miss are name variants
> ("Vela", "Petrina IPM"); they still import correctly and simply arrive without
> `quote_nos`/`last_job_title`, so `last_job_summary` falls back rather than breaking.
> Templates are written to read correctly when that tag is empty.

You must be logged in to <https://go.quotientapp.com> in the same tab. Open the
site, then DevTools → Console, paste, and wait — there are ~4,400 contacts, so it
takes a few minutes. Progress is logged, and partial results survive on
`window.__qtRows`, so re-running resumes rather than starting over.

```js
// Quotient → TreeCo mailing-list extraction. Run on go.quotientapp.com.
(async () => {
  const ORG = 31059;
  const api = async (path) => {
    const r = await fetch(`/${ORG}/api-1/${path}`, {
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'same-origin',
    });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
  };
  const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
  const normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // 1. Accepted quotes → quote numbers per customer. `quote_no` is the same
  //    number that appears in Xero's invoice line items ("Quote Number: 5515"),
  //    which is how the two systems get joined on a real key.
  const quotesByName = new Map();
  for (let page = 1; page <= 100; page++) {
    const d = await api(`quotes?status=accepted&page=${page}`);
    const batch = d.GenQuoteCombo ?? [];
    for (const q of batch) {
      const key = normKey(q._companyOrPerson);
      if (!key) continue;
      const arr = quotesByName.get(key) ?? [];
      arr.push({ no: String(q.quote_no), title: q.title, modified: Number(q.modified) || 0 });
      quotesByName.set(key, arr);
    }
    console.log(`quotes page ${page}: ${batch.length} (${quotesByName.size} customers)`);
    if (batch.length < 100) break;
    await sleep(120);
  }

  // 2. Contact list.
  const list = [];
  for (let page = 1; page <= 100; page++) {
    const d = await api(`contacts?page=${page}`);
    const batch = d.GenContact ?? [];
    // archive_id === 1 means ACTIVE in Quotient, not archived. Verified against
    // the live account: all 4,357 active contacts carry archive_id 1, and the
    // ?archive=archived view returns none. Filtering on `!c.archive_id` here
    // silently discards every single contact.
    list.push(...batch.filter((c) => c.archive_id === 1));
    console.log(`contacts page ${page}: ${batch.length} (${list.length} total)`);
    if (batch.length < 100) break;
    await sleep(120);
  }

  // 3. Detail per contact, 4 at a time. Cached on window.__qtRows so a re-run resumes.
  const cache = (window.__qtRows ||= new Map());
  let done = 0;
  const worker = async (queue) => {
    while (queue.length) {
      const c = queue.pop();
      if (!cache.has(c.contact_id)) {
        try { cache.set(c.contact_id, await api(`contacts/view/${c.contact_id}`)); }
        catch (e) { console.warn('skip', c.contact_id, e.message); cache.set(c.contact_id, null); }
        await sleep(80);
      }
      if (++done % 100 === 0) console.log(`details ${done}/${list.length}`);
    }
  };
  const queue = [...list];
  await Promise.all([1, 2, 3, 4].map(() => worker(queue)));

  // 4. Shape the rows. NOTE: for individual contacts the person data is in
  //    GenContact, not PeopleContact. Timestamps are unix SECONDS.
  const out = [];
  for (const c of list) {
    const d = cache.get(c.contact_id);
    if (!d) continue;
    const g  = d.GenContact?.[0] ?? {};
    const ad = d.GenContactAddress?.[0] ?? {};
    const ph = d.GenContactPhone?.[0] ?? {};
    const st = d.GenContactQuoteStats?.[0] ?? {};
    const email = String(g.email ?? '').trim().toLowerCase();
    if (!email) continue;                       // nothing to mail

    const name = [g.name_first ?? c.name_first, g.name_last].filter(Boolean).join(' ');
    const qs = (quotesByName.get(normKey(name)) ?? []).sort((a, b) => b.modified - a.modified);

    out.push({
      source_ref:     String(c.contact_id),
      first_name:     g.name_first ?? c.name_first ?? null,
      last_name:      g.name_last ?? null,
      email,
      phone:          ph.phoneOther ?? null,
      address:        ad.address ?? null,
      city:           ad.city ?? null,          // only ~43% of contacts have one
      first_quoted:   st.first_quoted ?? null,
      last_quoted:    st.last_quoted ?? null,
      quote_count:    Number(st.quote_count ?? 0),
      accepted_count: Number(st.accepted_count ?? 0),
      accepted_total: Number(st.accepted_total ?? 0),
      type:           c.type ?? null,
      quote_nos:      qs.map((q) => q.no).slice(0, 40),
      last_job_title: qs[0]?.title ?? null,
    });
  }

  window.__qtExport = out;
  console.log(`✅ ${out.length} contacts with an email address.`);
  const payload = JSON.stringify(out);
  try { await navigator.clipboard.writeText(payload); console.log('📋 Copied to clipboard.'); }
  catch { console.log('Clipboard blocked — run  copy(JSON.stringify(window.__qtExport))'); }
  console.log(payload.length > 2_000_000 ? '(large — paste in batches, see below)' : payload);
})();
```

Then paste the JSON into **Campaigns → Import → Quotient**, or POST it yourself:

```bash
jq -n --slurpfile c contacts.json '{source:"quotient", dry_run:true, contacts:$c[0]}' \
  | curl -sS -X POST "$SUPABASE_URL/functions/v1/import-marketing-contacts" \
      -H "Authorization: Bearer $SESSION_JWT" -H "Content-Type: application/json" -d @- | jq
```

To split a >5000-row export into batches, in the same console:

```js
const B = 1000, all = window.__qtExport;
for (let i = 0; i < all.length; i += B) {
  console.log(`--- batch ${i / B + 1} ---`);
  console.log(JSON.stringify(all.slice(i, i + B)));
}
```

---

## Suggested order

1. `clients`  — small, and links `marketing_contacts.client_id` to the operational record.
2. `quotient` — the widest coverage of email addresses and quote history.
3. `xero`     — last, so its paid-invoice figures and line-item detail win the merge.

Every source is safe to re-run. Counts do not drift (see the notes trailer below).

---

## Rules the importer enforces

**Consent is never overwritten.** If a contact already exists, the merge patch simply
does not contain `consent_status`, `consent_source`, `consent_at`,
`unsubscribe_token`, `unsubscribed_at`, `unsubscribe_reason`, `bounced_at` or
`complained_at`. A re-import can never resurrect someone who unsubscribed, bounced or
complained, and never silently promotes a `suppressed` row to mailable. Changing
consent is a human decision made on the Campaigns page.

**New rows only get inferred consent with real history.** `consent_status='inferred'`
(UEMA s4 — an existing customer relationship) is set only where there is a completed,
paid job, with `consent_source` recording the basis, e.g.
`xero:paid-invoice-2024-03-11`. Everything else is imported `suppressed`. An address
already on `email_suppressions` is imported `suppressed` too.

**Commercial accounts are excluded from marketing.** `classifyContact()` marks
Downer, Spencers Henshaw, councils, Kāinga Ora, `*.govt.nz`, body corporates,
property managers, real-estate brands, schools, trusts and `Ltd`/`Limited` names as
`commercial`; `campaign_audience_eligible` only ever returns `residential`. The
classification is only ever tightened on a merge — a row already marked commercial is
never reopened to marketing by an import.

**Emails** are trimmed and lowercased; anything without a valid address is skipped and
counted (`skipped_no_email` / `skipped_invalid`).

---

## How a contact is matched to an existing row

In order of confidence:

1. `(source, source_ref)` — the same system's own id.
2. `lower(email)`.
3. **Quotient quote number.** Every Xero ACCREC invoice has a header line item (no
   quantity or unit amount) reading e.g.

   ```
   20A Poole Street Taita Lower Hutt
   Quote Number: 5515
   ```

   `5515` is the Quotient `quote_no`. Matched numbers are stored on the contact, so
   the Xero↔Quotient join is a real key rather than fuzzy name matching, and it stays
   stable across re-imports.

### The `notes` trailer

Merging across sources needs per-source provenance, so each source's contribution is
recorded as machine-readable trailer lines at the end of `notes`:

```
Prefers mornings, back gate is unlocked.        ← human notes, never touched
[import] quotient:jobs=2;value=1830.50 xero:jobs=3;value=2400.00
[quotes] 5610 5701 5515
```

`job_count` is the sum across sources — so re-importing Xero ten times still gives the
same number. `lifetime_value` takes Xero's figure outright when Xero has one (it is
the accounting system of record) and otherwise sums the rest. `services` arrays are
unioned; `first_job_at` keeps the earliest and `last_job_at` the latest;
`last_job_summary` is only replaced when the incoming job is genuinely more recent.
Blank fields are filled in, populated ones are left alone.

---

## `last_job_summary`

This is the whole point of the import — the copy says *"we pruned your magnolia in
March 2023"*, not *"time for tree maintenance"*. The value is a **lowercase
past-tense verb phrase** designed to be interpolated mid-sentence:

> we **reduced the pōhutukawa out front** back in March 2023 — it'll be about due

so it carries no leading capital, no full stop, no price, and no suburb (the suburb
has its own column; appending it would derail the sentence).

Xero line items follow a reliable convention that `summariseJob()` parses:

```
Tree pruning                      ← work type
*Pohutukawa*                      ← subject, between asterisks
* Reduce by approx 15%            ← action, an asterisk bullet
*All cuttings taken off site*     ← boilerplate, discarded
```

Real examples in, real output out:

| Line item | Summary |
|---|---|
| `Tree pruning / *Pohutukawa* / * Reduce by approx 15%` | `reduced the pōhutukawa` |
| `Tree pruning / *2x Karo at front* / * Flat top and round sides to tidy and shape` | `tidied the two karo out front` |
| `Tree prune / *Sycamore* / * Remove dead leader / * Reduce canopy by 15%` | `reduced the sycamore` |
| `*Griselinia hedge* Square up top … *Olive* Remove leaving low stump` | `squared up the griselinia hedge and took out the olive` |
| `Dismantle / *Banksia* / * Fell out leader` | `took out the banksia` |
| `Reduce pittosporum / 1M of Magnolia / Remove small fruit tree` | `reduced the pittosporum and the magnolia` |
| `Travel`, `Green waste disposal` | `null` |

Species are normalised to macronised te reo in the output (pōhutukawa, rātā, pūriri,
kōwhai, tī kōuka) — the source data is unmacronised. Reductions are recognised ahead
of removals, because *"remove dead leader, reduce canopy by 15%"* is a reduction with
a bit of deadwooding and calling it a removal would be flatly wrong in a customer's
inbox.

The summary is `null` for a meaningful minority of contacts (Quotient quote titles are
just the property address, and only invoiced jobs have line-item detail). Campaign
templates must read correctly without it — never emit an awkward gap.

## Exported helpers

`classifyContact(name, email)`, `deriveServices(text)`, `summariseJob(lineItems, address)`,
`suburbFromAddress(address)`, `parseQuoteNumbers(text)`, `normaliseEmail`, `isValidEmail`
are exported so the Campaigns UI and any backfill script behave identically to the
importer.
