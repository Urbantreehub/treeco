# DRAFT — Blog content plan (informational, Wellington/NZ tree care)

**Status:** Draft for review. Eight article ideas targeting informational search intent to feed the
top of funnel and internally link down to service and suburb pages. New posts slot into the existing
`posts` array in `src/data/posts.js` (fields: `slug`, `title`, `date`, `excerpt`, `image`,
`category`, `body[]`). Voice: professional, warm, no-hype, NZ English (clean-up, organise, metre).

Internal-link target key:
- **Removal** → `/services/tree-removal/tree-removal/`
- **Stump** → `/services/stump/stump-grinding/`
- **Trimming** → `/services/tree-pruning/tree-trimming/`
- **Crown reduction** → `/services/tree-pruning/crown-reduction/`
- **Power lines** → `/services/tree-pruning/power-lines/`
- **Storm/Emergency** → `/services/emergency/storm/`
- **Quote** → `/request-a-quote/`
- **Karori suburb page** → `/tree-removal-karori/` (once live)

---

## 1. How much does tree removal cost in Wellington?

- **Target keyword:** how much does tree removal cost in Wellington
- **Working title (≤60):** How Much Does Tree Removal Cost in Wellington? (48)
- **Search intent:** Commercial-investigation — homeowner pricing a job before committing.
- **Outline:**
  - What actually drives the price: size, species, health, and above all access
  - Why Wellington's hill sections and tight driveways affect cost (fell vs roped dismantle)
  - Rough guide ranges (small / mid-sized / large & high-risk) with the honesty caveat
  - What's included in a proper quote — clean-up, green waste, stump options
  - Why the same qualified arborist quoting and doing the work protects you from surprises
- **Internal links:** Removal, Stump, Quote

## 2. Do I need council consent to remove a tree in Wellington?

- **Target keyword:** council consent to remove a tree Wellington
- **Working title (≤60):** Do You Need Consent to Remove a Tree in Wellington? (51)
- **Search intent:** Informational — checking legal obligations before acting.
- **Outline:**
  - Protected trees under the Wellington City District Plan, in plain English
  - Notable / heritage tree registers and what "notable" means for you
  - Trees on or near boundaries, reserves and road frontages
  - How to check a tree's status (and how we do it during a free assessment)
  - What happens if consent is needed — and how we can help
- **Internal links:** Removal, Quote

## 3. When is the best time to prune trees in New Zealand?

- **Target keyword:** best time to prune trees NZ
- **Working title (≤60):** The Best Time to Prune Trees in New Zealand (43)
- **Search intent:** Informational — timing tree work to the seasons.
- **Outline:**
  - Why winter dormancy suits most deciduous pruning (cleaner cuts, clear structure)
  - Evergreens and natives — different timing considerations
  - When NOT to prune: heavy frost, peak summer heat, nesting-bird season
  - Species that need special timing (and why flowering matters)
  - When timing is irrelevant — deadwood, hazards and storm damage come out anytime
- **Internal links:** Trimming, Crown reduction

## 4. How to storm-proof your trees before a Wellington winter

- **Target keyword:** storm damage tree prevention Wellington
- **Working title (≤60):** Storm-Proofing Your Trees Before a Wellington Winter (51)
- **Search intent:** Informational / seasonal — preventing failures before the wind hits.
- **Outline:**
  - Why Wellington's wind makes this non-optional
  - Crown thinning to let wind pass through and cut sail area
  - Deadwooding and spotting weak unions, cracks and lifting roots
  - A pre-winter tree checklist for homeowners
  - When to get a professional assessment — and how fast we respond after a storm
- **Internal links:** Trimming, Storm/Emergency, Quote

## 5. Protected and notable trees in Wellington: what you need to know

- **Target keyword:** notable trees Wellington
- **Working title (≤60):** Protected & Notable Trees in Wellington Explained (49)
- **Search intent:** Informational — understanding protection status and responsibilities.
- **Outline:**
  - What the notable-tree register is and how trees end up on it
  - What you can and can't do to a protected tree
  - Owning a protected tree: your maintenance responsibilities
  - Applying to work on or remove a protected tree
  - How an arborist's report supports a consent application
- **Internal links:** Removal, Quote

## 6. 8 signs your tree might be dangerous (and needs an arborist)

- **Target keyword:** signs a tree is dangerous / dying
- **Working title (≤60):** 8 Signs Your Tree Might Be Dangerous (37)
- **Search intent:** Informational — worried homeowner diagnosing a tree.
- **Outline:**
  - Dead crown and large deadwood
  - Fungal brackets at the base or on the trunk
  - Cracks, splits and weak branch unions
  - A sudden lean or soil lifting around the roots
  - Trunk decay and hollowing
  - Why some of these can be managed — and some can't — plus how to get it assessed
- **Internal links:** Removal, Storm/Emergency, Quote

## 7. Tree removal near power lines: who's responsible and what's the law?

- **Target keyword:** trees near power lines NZ responsibility
- **Working title (≤60):** Trees Near Power Lines: Who's Responsible in NZ? (49)
- **Search intent:** Informational — safety and legal responsibility.
- **Outline:**
  - The Electricity (Hazards from Trees) Regulations in plain English
  - Where the property owner's responsibility begins
  - Required clearances and the fire / outage risk of ignoring them
  - Why you must never cut near live lines yourself
  - How qualified line-clearance pruning works
- **Internal links:** Power lines, Trimming, Quote

## 8. Stump grinding vs full stump removal: which do you need?

- **Target keyword:** stump grinding vs removal
- **Working title (≤60):** Stump Grinding vs Removal: Which Do You Need? (45)
- **Search intent:** Commercial-investigation — choosing between two services.
- **Outline:**
  - How stump grinding works and what it leaves behind
  - How full stump-and-root removal differs
  - Grinding for lawns, replanting and paving over
  - Full removal for building, foundations and major landscaping
  - How to decide — and how we advise during a free assessment
- **Internal links:** Stump, Removal, Quote

---

### Publishing notes
- Aim for ~700–1,000 words each; lead with the direct answer (helps featured snippets and AI answers).
- Keep the `body[]` block format used in `posts.js`: `{ h2 }` for subheadings, strings for paragraphs, `{ list: [] }` for bullets.
- Interlink new posts with the existing library (e.g. #6 pairs with the live "How Will I Know When My Tree Needs to Be Removed?" post).
- Each post should carry at least one service CTA and the phone number (027 203 1446).
- Prioritise #1, #2 and #4 first — highest commercial intent and clearest local search demand.
