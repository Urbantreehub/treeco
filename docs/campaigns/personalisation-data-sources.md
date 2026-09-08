# Where the personalisation data comes from

The whole strategy rests on saying *"we pruned your magnolia in March 2023"* rather
than *"time for tree maintenance"*. That sentence has to be assembled from real data.
Here is exactly where each piece lives.

## The join: Xero ↔ Quotient

Xero invoice line items contain a header line of the form:

```
20A Poole Street Taita Lower Hutt
Quote Number: 5515
```

`Quote Number` is the **Quotient quote_no**. This is the join key between the two
systems, and it means we can combine Quotient's contact + email + quote history with
Xero's line-item detail and confirmed payment. Neither system alone is enough:

- **Quotient** has the email address and the full accepted-quote history
  (`first_quoted`, `last_quoted`, `quote_count`, `accepted_total`) — but the quote
  *title* is only the property address, not the work.
- **Xero** has the actual work described species by species, and proves the job was
  *paid* (which is what makes inferred consent solid) — but its contact records are
  thinner.

## What the Xero line items actually look like

These are real, from July 2026. The detail available is much better than expected:

- `Tree Pruning/Removal — Reduce pittosporum / 1M of Magnolia / Remove small fruit tree`
- `Pohutukawa reduction — *Pohutukawa* Reduce by approx 15% *All cuttings left on lawn below*`
- `Tree pruning — *2x Karo at front* Flat top and round sides to tidy and shape`
- `Tree prune — *Sycamore* Remove dead leader, Reduce canopy by 15%`
- `Tree pruning and removal — *Griselinia hedge* Square up top and lightly prune face … *Olive* Remove leaving low stump … *2x Ratas at front* Prune all house overhang back`
- `Tree removal — *Cabbage tree* Remove leaving low stump`
- `Dismantle — *Banksia* Fell out leader into neighbours yard`

**Format convention:** the species sits between asterisks (`*Pohutukawa*`), and the
actions are the `*` bullet lines under it. That is a reliably parseable structure —
`summariseJob()` should extract the `*species*` tokens first and fall back to the
free text only if none are found.

## Species vocabulary seen in the data

pōhutukawa · pittosporum · magnolia · karo · griselinia · sycamore · cabbage tree ·
banksia · gum · beech · camellia · corokia · rātā · olive · plum · yucca · cherry ·
cotoneaster · coprosma · pear · cypress · liquidambar · macrocarpa · pūriri · kōwhai ·
tī kōuka

Use the macronised Māori spellings in customer-facing copy (pōhutukawa, rātā, pūriri,
kōwhai) — it is correct te reo and reads as local and careful, which is the brand.

## Resulting merge fields

| Field | Source | Example |
|---|---|---|
| `first_name` | Quotient `GenContact.name_first` | "Colleen" |
| `suburb` / `city` | Quotient `GenContactAddress.city` | "Khandallah" |
| `last_job_at` | Quotient `last_quoted` ∪ Xero invoice date | 2023-03-14 |
| `months_since_job` | derived in the eligible view | 42 |
| `last_job_summary` | **Xero line items** via `summariseJob()` | "reduced the pōhutukawa and tidied the karo out front" |
| `services` | `deriveServices()` over line-item text | `{pruning, removal}` |
| `job_count` / `lifetime_value` | Quotient `accepted_count` / Xero paid totals | 2 · $1,830 |

## Caveat worth knowing

Roughly half of Quotient contacts have a usable address/city, and Xero's line-item
detail only exists for jobs that were actually invoiced. `last_job_summary` will
therefore be missing for a meaningful minority — the copy must degrade gracefully to
a version that still works without it, rather than emitting an awkward gap. The
send-time renderer treats an empty merge tag as empty string, and the templates are
written so the sentence still reads correctly when the summary is absent.
