# DRAFT — Suburb landing page: "Tree Removal in Karori"

**Status:** Draft template for review. This is a NEW page type the live site doesn't yet have
(there are no suburb pages under `src/pages/`). Do NOT add it live yet — this is the clonable
template for all suburbs. Voice matched to the site: professional, warm, no-hype, NZ English.

- **Suggested URL:** `/tree-removal-karori/` (or `/services/tree-removal/karori/` if you'd rather
  nest under services — keep whichever you pick consistent across suburbs, and keep `trailingSlash: 'always'`).
- **Suggested `<title>` (≤60):** Tree Removal Karori | Qualified Wellington Arborist (55)
- **Suggested meta description (≤155):** Tree removal in Karori by qualified arborists. Mature-tree and hill-property specialists, tidy clean-up, free no-obligation quotes. Call 027 203 1446. (152)

> **Cloning note:** Everything in {{double braces}} is the per-suburb variable. To spin up a new
> suburb page, copy this file and swap the suburb name, the two or three localised sentences, and
> the schema `name`/`areaServed`. Keep the service links and the client facts identical.

---

## H1

Tree Removal in {{Karori}}

## Intro

Looking for tree removal in {{Karori}}? We're a Wellington arborist team led by an arborist holding one of the highest arboriculture qualifications attainable, with 11+ years removing trees across the city's hills and tight sections. We know {{Karori}} well — its mature, established trees, its steep hill properties, and the narrow access that makes so many local jobs a roped, piece-by-piece dismantle rather than a straight fell. Whatever's in your garden, we'll assess it, quote it free, and remove it cleanly.

## Why {{Karori}} homeowners call us

{{Karori}} is one of Wellington's greener, more established suburbs, and with that comes some of the biggest, oldest trees in the city — macrocarpa, gum, oak and pine that have had decades to grow. Beautiful, but a lot of tree to manage when one turns dangerous, outgrows a section, or drops limbs onto a driveway. Add {{Karori}}'s hill properties, sloping sections and tight shared driveways, and removal here is rarely a simple job. It's exactly the kind of work we do best: high, awkward, close-quarters removals carried out safely by a qualified, insured crew.

- **Mature-tree specialists** — the large, established trees {{Karori}} is known for
- **Hill-property and tight-access capability** — roped sectional dismantling where a fell won't fit
- **The same qualified arborist quotes and does the work** — consistent advice from first look to final cut
- **Full clean-up** — brush chipped, timber cut to your preference, green waste removed
- **Local and trusted** — 4.9★ from 79 Google reviews, and trusted by Wellington city councils and national agencies

## What we remove in {{Karori}}

From a single dangerous tree to a fully overgrown back section, we handle it all: dead and declining trees, storm-damaged and wind-thrown trees, trees crowding a house or build, and removals close to fences, roofs and power lines. Where a tree can be saved with pruning or crown reduction instead, we'll tell you honestly before recommending removal. And once the tree's down, we can grind or fully remove the stump so you get the space back for good.

## Free, no-obligation quotes across {{Karori}}

Every job starts with a free on-site assessment. The qualified arborist looks over the tree, talks through your options, and leaves you with a clear written quote — no pressure to proceed. Storm damage or a dangerous tree that can't wait? We respond fast across {{Karori}} and the wider Wellington region.

**Call us on 027 203 1446** or request a free quote online.

## Related services

- [Tree Removal & Felling](/services/tree-removal/tree-removal/) — our full removal service
- [Stump Grinding & Removal](/services/stump/stump-grinding/) — clear the stump after removal
- [Tree Pruning & Trimming](/services/tree-pruning/tree-trimming/) — where a tree can be kept rather than removed
- [Emergency & Storm Damage](/services/emergency/storm/) — fast response for dangerous trees
- [All Services](/services/) · [Request a Quote](/request-a-quote/)

## FAQ

**Do you remove large, mature trees in Karori?**
Yes — {{Karori}}'s big, established trees are our speciality. We assess each one and use controlled felling where there's room, or roped sectional dismantling on tight or sloping sites, so even large removals are carried out safely.

**Can you access steep or hill properties?**
We can. A lot of {{Karori}} sits on the hills, and much of our work is roped, piece-by-piece removal on steep or awkward-access sections. It's routine work for our crew.

**Do I need council consent to remove a tree in Karori?**
Some trees are protected under the Wellington City District Plan or sit on a notable-tree register. We check protection status as part of your free assessment and can advise on or assist with consent where it's needed.

**How much does tree removal cost in Karori?**
It depends on the tree's size, health, species and access — and hill access can add to it. We give you a free, no-obligation written quote after seeing the tree, so you know the price up front.

---

## Schema notes

Two blocks to include, matching the site's existing pattern (`BreadcrumbList` + `FAQPage`, plus a
suburb-scoped `Service`). The site-wide `LocalBusiness` is already emitted by `BaseLayout.astro`
(with `@id` `https://urbantreeservices.net/#business`), so reference it via `provider` rather than
redefining it.

**Breadcrumb + Service (localised) JSON-LD:**

```json
[
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://urbantreeservices.net/" },
      { "@type": "ListItem", "position": 2, "name": "Tree Removal Karori", "item": "https://urbantreeservices.net/tree-removal-karori/" }
    ]
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    "name": "Tree Removal in Karori",
    "serviceType": "Tree Removal",
    "description": "Qualified-arborist tree removal in Karori, Wellington. Mature-tree and hill-property specialists. Free no-obligation quotes.",
    "provider": { "@id": "https://urbantreeservices.net/#business" },
    "areaServed": { "@type": "Place", "name": "Karori, Wellington" },
    "url": "https://urbantreeservices.net/tree-removal-karori/"
  }
]
```

**FAQPage JSON-LD:**

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Do you remove large, mature trees in Karori?",
      "acceptedAnswer": { "@type": "Answer", "text": "Yes — Karori's big, established trees are our speciality. We assess each one and use controlled felling where there's room, or roped sectional dismantling on tight or sloping sites, so even large removals are carried out safely." }
    },
    {
      "@type": "Question",
      "name": "Can you access steep or hill properties?",
      "acceptedAnswer": { "@type": "Answer", "text": "We can. A lot of Karori sits on the hills, and much of our work is roped, piece-by-piece removal on steep or awkward-access sections. It's routine work for our crew." }
    },
    {
      "@type": "Question",
      "name": "Do I need council consent to remove a tree in Karori?",
      "acceptedAnswer": { "@type": "Answer", "text": "Some trees are protected under the Wellington City District Plan or sit on a notable-tree register. We check protection status as part of your free assessment and can advise on or assist with consent where it's needed." }
    },
    {
      "@type": "Question",
      "name": "How much does tree removal cost in Karori?",
      "acceptedAnswer": { "@type": "Answer", "text": "It depends on the tree's size, health, species and access — and hill access can add to it. We give you a free, no-obligation written quote after seeing the tree, so you know the price up front." }
    }
  ]
}
```

## Suburbs to clone this for

Khandallah, Newtown, Miramar, Island Bay, Kelburn, Thorndon, Tawa, Churton Park, Ngaio,
Wadestown, Brooklyn, Berhampore, Wilton, Crofton Downs, Lower Hutt, Upper Hutt, Porirua,
Paraparaumu. (Best built as a data-driven `[suburb]` dynamic route, mirroring how
`services.js` drives `getStaticPaths` — a `suburbs.js` data file with per-suburb intro/notes
would let one template render all of them and avoid thin, duplicated pages.)
