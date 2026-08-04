// Common, ready-to-insert quote line items for tree work — so the standard
// disposal choices and repeated jobs (stump grinding) don't get re-typed each
// time. Each preset carries a partial line item; QuoteBuilder fills in the rest
// (id, qty, image fields) and the user sets the price.
//
// Convention that matches how quotes are written: put the species/tree in the
// item title (renders bold), and the works as "- " bullet lines in the detail.

// Disposal / material — what happens to the arisings. "All arisings removed" is
// the usual default; the rest are optional priced alternatives the client can
// toggle on the quote.
export const DISPOSAL_PRESETS = [
  {
    key: 'remove_all',
    label: 'All arisings removed from site (default)',
    item: { description: 'All arisings removed from site', detail: '', optional: false, rate: '' },
  },
  {
    key: 'firewood',
    label: 'Leave timber cut to firewood rounds',
    item: { description: 'Timber left on site — cut to firewood rounds', detail: '', optional: true, rate: '' },
  },
  {
    key: 'long_lengths',
    label: 'Leave timber in long lengths',
    item: { description: 'Timber left on site in long lengths', detail: '', optional: true, rate: '' },
  },
  {
    key: 'mulch',
    label: 'Leave mulch on site',
    item: { description: 'Mulch left on site', detail: '', optional: true, rate: '' },
  },
  {
    key: 'all_debris',
    label: 'Leave all debris on site',
    item: { description: 'All debris left on site', detail: '', optional: true, rate: '' },
  },
]

// Common works.
export const WORK_PRESETS = [
  {
    key: 'stump_grind',
    label: 'Stump grinding',
    item: {
      description: 'Stump grinding',
      detail: '- Grind stump to approx. 200mm below ground level\n- Arisings left on site to backfill the hole',
      optional: false, rate: '',
    },
  },
  {
    key: 'reduction',
    label: 'Crown reduction',
    item: {
      description: 'Crown reduction',
      detail: '- Reduce overall height and spread by approx. 20%\n- Maintain natural shape and remove deadwood',
      optional: false, rate: '',
    },
  },
  {
    key: 'removal',
    label: 'Tree removal',
    item: {
      description: 'Tree removal',
      detail: '- Dismantle and remove tree in sections\n- All arisings removed from site',
      optional: false, rate: '',
    },
  },
]
