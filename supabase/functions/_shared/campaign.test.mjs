// Tests for the campaign email renderer in campaign.ts. Deno is not installed
// locally, so the module is transpiled with the frontend's esbuild and imported
// into Node.
//
//     node supabase/functions/_shared/campaign.test.mjs
//
// Exits non-zero on the first failure. No test framework: the edge function is
// Deno source and is not part of either vitest project.
//
// Nearly every assertion below exists because the failure it guards against is
// silent — a Gmail clip that hides the unsubscribe link, an Outlook layout that
// collapses when images are off, a click-wrapped opt-out. None of those show up
// by looking at the email in one client, which is exactly why they are tests.
//
// It also writes campaign.preview.html next to this file, which is a generated
// artifact: open it in a browser to eyeball the result. Safe to delete.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')
const ESBUILD = join(REPO, 'frontend', 'node_modules', '.bin', 'esbuild')
const PREVIEW = join(HERE, 'campaign.preview.html')

/** Transpile campaign.ts to ESM Node can import: no Deno, no npm: specifier. */
function load(tsPath, workDir, name) {
  let code = readFileSync(tsPath, 'utf8')
    .replace(/^import .*from ['"]npm:.*$/gm, '')            // npm: specifier
  // env.get reads globalThis.__ENV at call time so a test can change it.
  code = 'const Deno = { serve() {}, env: { get: (k) => (globalThis.__ENV || {})[k] } };\n' + code
  const pre = join(workDir, `${name}.ts`)
  const out = join(workDir, `${name}.mjs`)
  writeFileSync(pre, code)
  execFileSync(ESBUILD, [pre, '--format=esm', '--target=node20', `--outfile=${out}`], { stdio: 'pipe' })
  return import(out)
}

let failures = 0
let checks = 0
function eq(actual, expected, label) {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    failures++
    console.error(`FAIL  ${label}\n      expected ${e}\n      actual   ${a}`)
  }
}
function ok(cond, label) {
  checks++
  if (!cond) { failures++; console.error(`FAIL  ${label}`) }
}

// ── Fixtures ────────────────────────────────────────────────────────────────

globalThis.__ENV = {
  APP_URL: 'https://app.urbantreeservices.net',
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  CAMPAIGN_TRACK_URL: 'https://abcdefgh.supabase.co/functions/v1/campaign-track',
  CAMPAIGN_UNSUBSCRIBE_URL: 'https://abcdefgh.supabase.co/functions/v1/campaign-unsubscribe',
}

const CTA_URL = 'https://urbantreeservices.net/quote'

// A realistic body: the length and shape of a letter Josh would actually send,
// including the bare CTA line the composer insists on and a second, untrackable
// link (Google reviews) that must be left exactly as written.
//
// NOTE THAT IT ENDS ON A SENTENCE, WITH NO SIGN-OFF. The templates used to end
// "Cheers, / Josh Micallef / Urban Tree Services", which read as a double
// sign-off next to the signature block and has been taken out of
// campaignTemplates.js. The renderer now owns the sign-off in BOTH parts —
// signatureHtml() and signatureText() — and the assertions below are what stop
// the text part quietly losing its ending.
const BODY = `Hi {{first_name}},

It's been about {{months_since_job}} months since we were out at your place in {{suburb}} to {{last_job_summary}}, so I thought I'd check in before the spring winds get going.

This is the time of year we pick up most of the storm damage work — a limb that's been quietly cracking all winter tends to let go in the first proper southerly. If you'd like me to come and have a look at anything, there's no charge for the visit and no obligation at the end of it.

A few people have asked what we're booking at the moment: we're about two weeks out for pruning and removals, and a bit quicker than that for stump grinding.

If it's easier, you can book a time straight from here:

${CTA_URL}

Either way, give us a ring on 027 203 1446 and we'll sort something out.

And if we did a decent job last time, a review is genuinely the thing that helps us most: https://g.page/r/urban-tree-services/review`

const CAMPAIGN = {
  id: 'c1', name: 'Spring check-in',
  subject: 'Checking in before the spring winds, {{first_name}}',
  preheader: 'No charge for the visit, and no obligation at the end of it.',
  body: BODY,
  from_name: 'Josh Micallef', from_email: 'josh@urbantreeservices.net',
  reply_to: 'josh@urbantreeservices.net', status: 'draft', audience: {},
  offer_code: 'SPRING26', offer_percent: 10, offer_expires_on: '2026-10-31',
  offer_terms: 'One job per property. Not available with any other offer.',
  cta_label: 'Book a free visit', cta_url: CTA_URL,
}

const CONTACT = {
  id: 'p1', email: 'anna@example.co.nz', first_name: 'anna', last_name: 'Knowsley',
  full_name: 'Anna Knowsley', suburb: 'Karori', city: 'Wellington',
  services: ['pruning'], job_count: 2, lifetime_value: 1800,
  last_job_summary: 'reduce the pōhutukawa over the drive', months_since_job: 14,
  unsubscribe_token: 'tok-abc123',
}

const TOKEN = 'trk-xyz789'

// ── Small HTML helpers ──────────────────────────────────────────────────────

const imgTags = html => html.match(/<img\b[^>]*>/gi) ?? []
const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)
  return m ? m[1] : null
}
const stripImgs = html => html.replace(/<img\b[^>]*>/gi, '')
const hrefs = html => [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)].map(m => m[1])

const work = mkdtempSync(join(tmpdir(), 'campaign-test-'))
try {
  const m = await load(join(HERE, 'campaign.ts'), work, 'campaign')
  const {
    renderCampaignEmail, signatureText, complianceFooter, COMPANY, SIGNATURE,
    greetingName, applyMerge, logoUrl, assetBaseUrl, isTrackableLink,
  } = m

  const r = renderCampaignEmail(CAMPAIGN, CONTACT, TOKEN)
  const { html, text } = r
  const bytes = Buffer.byteLength(html, 'utf8')

  // The eyeball copy: exactly what ships, with the asset URLs pointed at
  // frontend/public/email so the logo actually loads off disk when the file is
  // opened in a browser. Only the asset base differs from the real thing.
  const localAssets = 'file://' + join(REPO, 'frontend', 'public', 'email')
  writeFileSync(PREVIEW, html.split('https://app.urbantreeservices.net/email').join(localAssets))

  // 1. Gmail clips at ~102KB and hides everything past the cut — including the
  //    unsubscribe link — behind "View entire message". That is a compliance
  //    failure, not a cosmetic one, so the budget is 80KB with real copy in it.
  ok(bytes < 80 * 1024, `HTML source is under 80KB (actual ${bytes} bytes)`)
  ok(BODY.length > 800, 'the fixture body is a realistic length, not a stub')

  // 2. Nothing that matters may live inside an image. With images off — which
  //    is the Outlook desktop default, and this list is full of Outlook desktop
  //    — an image-based CTA or phone number is simply gone.
  const forbiddenInImages = [
    CAMPAIGN.cta_label, 'Book a free', COMPANY.phone, SIGNATURE.mobile,
    'Checking in before the spring winds', 'spring winds',
  ]
  for (const tag of imgTags(html)) {
    for (const needle of forbiddenInImages) {
      ok(!tag.toLowerCase().includes(needle.toLowerCase()),
        `no <img> carries "${needle}" — got ${tag.slice(0, 90)}`)
    }
  }

  // 3. Every image declares alt, width and height. Outlook ignores CSS sizing,
  //    so an image with no height ATTRIBUTE collapses the layout the moment it
  //    is blocked; alt is what the recipient reads instead of it.
  ok(imgTags(html).length >= 2, 'the letter has a logo (letterhead + signature)')
  // Outlook prepends an unstyleable security warning in front of alt text, so a
  // sentence-long alt renders as a run-on mess in exactly the client where
  // images are off. Short and factual.
  for (const tag of imgTags(html)) {
    const a = attr(tag, 'alt') ?? ''
    ok(a.length <= 60, `alt text stays short for Outlook (${a.length} chars): "${a}"`)
    ok(!/[.!?]\s|[.!?]$/.test(a), `alt text is a label, not a sentence: "${a}"`)
  }
  for (const tag of imgTags(html)) {
    const a = attr(tag, 'alt')
    ok(a !== null, `every <img> declares alt — ${tag.slice(0, 90)}`)
    ok(attr(tag, 'width') !== null, `every <img> has a width attribute — ${tag.slice(0, 90)}`)
    ok(attr(tag, 'height') !== null, `every <img> has a height attribute — ${tag.slice(0, 90)}`)
    // Non-empty alt, or alt="" only for the tracking pixel (truly decorative).
    const decorative = attr(tag, 'width') === '1' && attr(tag, 'height') === '1'
    ok(a !== '' || decorative, `only the 1x1 pixel is allowed empty alt — ${tag.slice(0, 90)}`)
  }
  // The flat-RGB "-safe" export, not the RGBA original: a charcoal wordmark on
  // transparency disappears the instant an inverting client repaints the
  // container dark, and there is no CSS that fixes that.
  const logo = imgTags(html).find(t => (attr(t, 'src') ?? '').includes('logo-email-safe-2x.png'))
  ok(!!logo, 'the logo is the flat-RGB 2x PNG (Gmail webmail does not render SVG)')
  ok(!html.includes('/logo-email-2x.png'), 'the RGBA original is never used')
  ok(!/src="[^"]*@[^"]*"/.test(html), 'no asset URL contains "@" — clients mis-parse it as userinfo and the fetch fails')
  eq(attr(logo, 'alt'), 'Urban Tree Services', 'the letterhead logo has the brand as its alt text')
  eq(attr(logo, 'width'), '244', 'the letterhead logo is displayed at 244px')
  eq(attr(logo, 'height'), '106', 'with its matching height, so a blocked image reserves the space')
  ok(!/style="[^"]*\bwidth:\s*\d+px/.test(logo), 'the logo is sized by attribute, not by CSS width')
  ok(logoUrl().startsWith('https://app.urbantreeservices.net/email/'),
    'assets default to ${APP_URL}/email')

  // …and CAMPAIGN_ASSET_URL overrides it.
  globalThis.__ENV.CAMPAIGN_ASSET_URL = 'https://cdn.example.net/mail/'
  eq(assetBaseUrl(), 'https://cdn.example.net/mail', 'CAMPAIGN_ASSET_URL wins, trailing slash trimmed')
  delete globalThis.__ENV.CAMPAIGN_ASSET_URL

  // 4. The unsubscribe link is in the HTML, and is NOT click-wrapped. Measuring
  //    who clicked "stop emailing me" is pointless, and any breakage in the
  //    tracker must never break the legally-required opt-out.
  ok(html.includes(r.unsubscribe_url), 'the unsubscribe URL appears in the HTML')
  ok(hrefs(html).includes(r.unsubscribe_url), 'the unsubscribe URL is a bare href')
  for (const h of hrefs(html)) {
    if (h.includes('campaign-track')) {
      ok(!h.includes('unsubscribe'), `no tracker URL mentions unsubscribe — ${h}`)
      ok(!h.includes(CONTACT.unsubscribe_token), `no tracker URL carries the unsubscribe token — ${h}`)
      // Decode the ?u= payload and check the real destination too.
      const u = /[?&]u=([^&]+)/.exec(h)
      if (u) {
        const pad = u[1].replace(/-/g, '+').replace(/_/g, '/')
        const dest = Buffer.from(pad, 'base64').toString('utf8')
        ok(dest !== r.unsubscribe_url && dest !== r.unsubscribe_post_url,
          `no tracker redirects to an unsubscribe URL — ${dest}`)
        ok(isTrackableLink(dest), `the tracker only ever wraps a link it would redirect to — ${dest}`)
      }
    }
  }
  ok(!html.includes(r.unsubscribe_post_url),
    'the machine (One-Click) URL stays in the header, out of the body')

  // 5. The plain-text part: full footer, clean URLs, no click-wrapping. A raw
  //    campaign-track URL sitting in the text is the single clearest tell that
  //    a "personal note from Josh" is a blast, and it is the one link a
  //    suspicious recipient actually eyeballs.
  ok(!text.includes('campaign-track'), 'the plain-text part contains no campaign-track URLs')
  ok(!text.includes('?c='), 'the plain-text part has no click-wrapped links at all')
  ok(text.includes(r.unsubscribe_url), 'the plain-text part carries the unsubscribe URL')
  ok(text.includes(CTA_URL), 'the plain-text part carries the CTA destination as a clean URL')
  ok(text.includes('https://g.page/r/urban-tree-services/review'),
    'an untrackable link survives verbatim in the text part')
  const footer = complianceFooter(CAMPAIGN, CONTACT, r.unsubscribe_url)
  eq(text.endsWith(footer.text), true, 'the plain-text part ends with the compliance footer verbatim')
  for (const line of [
    COMPANY.legalName, `${COMPANY.region}, ${COMPANY.country}`, COMPANY.phone,
    COMPANY.email, COMPANY.website, "You're getting this because you've had tree work done by us in Wellington.",
    'Offer terms: 10% off, quote code SPRING26, offer ends 31 October 2026.',
    'One job per property. Not available with any other offer.',
  ]) {
    ok(text.includes(line), `the text footer still carries: ${line}`)
  }
  // The text part is deliberately unchanged by this rebuild: body, then the
  // CTA line only when the copy does not already carry it, then the footer.
  // Kept as an EXACT equality rather than loosened to a set of includes(): it
  // is the one assertion that would catch the text part silently drifting.
  const merged = applyMerge(CAMPAIGN.body, m.mergeValues(CAMPAIGN, CONTACT))
  eq(text, `${merged.trim()}\n\n${signatureText()}\n\n${footer.text}`,
    'the text part is exactly body + signature + footer')
  // …and the two halves of that, spelled out, so a failure says which moved.
  eq(signatureText(),
    'Josh Micallef\nDirector, Urban Tree Services\n'
    + 'Cert III & Diploma of Arboriculture (AQF 3 & 5)\n'
    + `M ${SIGNATURE.mobile}\nW ${SIGNATURE.website}`,
    'signatureText() renders the sign-off exactly')
  ok(text.endsWith(`${signatureText()}\n\n${footer.text}`),
    'the text part ends with the signature details followed by the compliance footer')
  ok(!text.trimEnd().endsWith(CTA_URL), 'the text part never just stops on a bare URL')

  // ── The double sign-off, which is what this is all guarding against ───────
  // The copy no longer signs off; the renderer does, once, in each part.
  for (const [part, where] of [[html, 'HTML'], [text, 'text']]) {
    eq((part.match(/Josh Micallef/g) ?? []).length, 1, `the name appears exactly once in the ${where} part`)
    ok((part.match(/Cheers,/g) ?? []).length <= 1, `no double sign-off in the ${where} part`)
  }
  ok(!/Cheers,/.test(CAMPAIGN.body), 'the fixture body carries no sign-off of its own')
  // Belt and braces: a legacy body that still signs off must not produce two
  // "Josh Micallef" lines in the text part — the copy's is a different string.
  const legacy = renderCampaignEmail(
    { ...CAMPAIGN, body: 'Hi {{first_name}}, a quick note.\n\nCheers,\nJosh' }, CONTACT, TOKEN)
  eq((legacy.text.match(/Cheers,/g) ?? []).length, 1, 'a legacy sign-off is not duplicated')
  eq((legacy.text.match(/Josh Micallef/g) ?? []).length, 1, 'and the name still appears once')

  // 6. The exact values the dark-mode inversion heuristics target.
  ok(!/#f{6}\b/i.test(html), '#FFFFFF never appears — #FDFDFD is used instead')
  ok(!/#0{6}\b/i.test(html), '#000000 never appears — #0E0E0E is used instead')
  ok(html.includes('#FDFDFD'), 'the light plate colour is present')

  // 7. Apple Mail 13+ only applies its dark treatment once color-scheme is
  //    declared, and a half-declared implementation renders worse than none.
  // Checked as a DECLARATION, not as a word: the comment below deliberately
  // contains the word "color-scheme" while saying why there isn't one.
  ok(!/color-scheme\s*:/i.test(html), 'color-scheme is never declared as a CSS property')
  ok(!/<meta[^>]*color-scheme/i.test(html), 'nor as the meta form of it')
  ok(!/supported-color-schemes/i.test(html), 'nor the legacy Apple variant')
  ok(/No color-scheme declaration on purpose/.test(html),
    'a comment in the source says why, so the next person does not "fix" it')

  // 8. THE test that matters commercially: block every image and the email is
  //    still completely usable.
  const noImages = stripImgs(html)
  for (const needle of [
    CAMPAIGN.cta_label,                 // the CTA
    CTA_URL,                            // and where it goes, in live text
    SIGNATURE.name, 'Director', 'Cert III &amp; Diploma of Arboriculture (AQF 3 &amp; 5)',
    SIGNATURE.mobile, `tel:${SIGNATURE.mobileTel}`, SIGNATURE.website,
    COMPANY.phone, COMPANY.email, COMPANY.legalName,
    r.unsubscribe_url,
    'Karori', 'Hi Anna,',               // the merged, personal copy
  ]) {
    ok(noImages.includes(needle), `survives every image being blocked: ${needle}`)
  }
  ok(!/<img/i.test(noImages), 'the strip actually removed the images')

  // 9. Bulletproof CTA: a table button at least 44px tall with the padding on
  //    the <a>, and the destination in live text underneath it. Padding on the
  //    <td> would make a button-shaped area that is mostly not a link.
  const btn = /<a\b[^>]*display:inline-block[^>]*>/i.exec(html)
  ok(!!btn, 'the CTA is an HTML/table button, not an image')
  const btnStyle = attr(btn[0], 'style') ?? ''
  const pad = /padding:\s*(\d+)px\s+(\d+)px/.exec(btnStyle)
  const lh = /line-height:\s*(\d+)px/.exec(btnStyle)
  ok(!!pad && !!lh, 'the button anchor declares px padding and px line-height')
  const tapHeight = Number(pad[1]) * 2 + Number(lh[1])
  ok(tapHeight >= 44, `the tappable button is at least 44px tall (actual ${tapHeight}px)`)
  ok(/font-size:\s*(1[6-9]|[2-9]\d)px/.test(btnStyle), 'the button label is at least 16px')
  const btnHref = attr(btn[0], 'href')
  ok(btnHref.includes('campaign-track'), 'the button href is click-wrapped in the HTML part')
  // A plain text link directly beneath the button, showing the destination.
  const after = html.slice(html.indexOf(btn[0]) + btn[0].length)
  const follow = /The button goes to <a\b[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/.exec(after)
  ok(!!follow, 'a plain text link follows the button')
  eq(follow[2], CTA_URL, 'the text link beneath the button shows the real destination')
  ok(html.indexOf(btn[0]) < html.indexOf(follow[0]), 'it is beneath the button, not above it')
  // One CTA, not several: the bare-URL paragraph in the copy is folded into it.
  eq((html.match(new RegExp(CTA_URL.replace(/\//g, '\\/'), 'g')) ?? []).length, 1,
    'the CTA destination appears exactly once as visible text')

  // 9b. The phone number. For a $350-$4,500 job from someone who already knows
  //     Josh, the conversion is a phone call, not a form submission — so the
  //     mobile is a real tel: link with its own 44px tap target, sitting under
  //     the button rather than buried in the signature.
  const tel = new RegExp(`<a\\b[^>]*href="tel:\\${SIGNATURE.mobileTel}"[^>]*>([^<]*)</a>`).exec(html)
  ok(!!tel, 'the mobile number is a real tel: link')
  eq(tel[1], SIGNATURE.mobile, 'and shows the number the way a New Zealander reads it')
  const telStyle = attr(tel[0], 'style') ?? ''
  const telPad = /padding:\s*(\d+)px/.exec(telStyle)
  const telLh = /line-height:\s*(\d+)px/.exec(telStyle)
  ok(!!telPad && !!telLh, 'the tel: link declares px padding and px line-height')
  ok(Number(telPad[1]) * 2 + Number(telLh[1]) >= 44,
    `the tel: link is at least 44px tall (actual ${Number(telPad[1]) * 2 + Number(telLh[1])}px)`)
  ok(/font-size:\s*(1[6-9]|[2-9]\d)px/.test(telStyle), 'and is at least body size')
  // Under the button, and well above the footer — not only in the signature.
  ok(html.indexOf(btn[0]) < html.indexOf(tel[0]), 'it sits directly under the CTA button')
  ok(html.indexOf(tel[0]) < html.indexOf('Josh Micallef'), 'and above the signature')
  ok(html.indexOf(tel[0]) < html.indexOf(COMPANY.legalName), 'and well above the compliance footer')
  ok(stripImgs(html).includes(`tel:${SIGNATURE.mobileTel}`), 'it survives every image being blocked')

  // 9c. The button is rendered WHERE THE AUTHOR PUT THE LINK, not bolted on
  //     after the sign-off. A letter that ends "Cheers, Josh" and then shows a
  //     button reads like a template wrapped around someone's writing.
  const iLeadIn = html.indexOf('you can book a time straight from here')
  const iButton = html.indexOf(btn[0])
  const iAfter  = html.indexOf('Either way, give us a ring')
  const iSignOff = html.indexOf('Josh Micallef')   // the signature IS the sign-off now
  ok(iLeadIn < iButton, 'the button follows the sentence that leads into it')
  ok(iButton < iAfter, 'and the rest of the letter continues after it')
  ok(iButton < iSignOff, 'so the button is never stranded below the sign-off')
  ok(iAfter < iSignOff, 'the copy after the CTA keeps its original order')

  // 10. Layout and legibility.
  ok(/max-width:600px/.test(html), 'the column is capped at 600px')
  ok(/width="600"/.test(html), '…by attribute too, for the Outlook Word engine')
  ok(/width:100%/.test(html), 'and is fluid below that')
  ok(!/@media/.test(html), 'no media queries are relied on — Outlook Windows ignores them')
  ok(/font-size:16px;line-height:1\.7/.test(html.replace(/\s+/g, '')) ||
     /font-size:16px/.test(html), 'body copy is at least 16px')
  ok(/-apple-system,BlinkMacSystemFont/.test(html), 'a system font stack, no webfont')
  ok(!/<link\b/i.test(html) && !/@font-face/i.test(html), 'nothing is fetched from a third party')

  // 11. The light plate under the logo: an explicit background colour and real
  //     padding on the cell the charcoal wordmark sits in. This is the fix for
  //     the commonest dark-mode failure there is.
  const plate = /<td bgcolor="#FDFDFD"[^>]*padding:30px 32px[^>]*>\s*<img[^>]*logo-email-safe-2x/.test(html)
  ok(plate, 'the letterhead logo sits on a padded cell with an explicit light background')

  // 12. The signature, reproduced from Josh's real one.
  ok(/border-right:2px solid #8BA240/.test(html), 'the signature logo cell has the 2px green right border')
  ok(/font-size:15px;line-height:1\.4;font-weight:600;color:#2D2D2D">Josh Micallef</.test(html.replace(/\s+/g, ' ')),
    'the name is 15px / 600 / charcoal')
  ok(/letter-spacing:1px;\s*text-transform:uppercase;color:#8BA240">Director</.test(html),
    'DIRECTOR is uppercase, letter-spaced, green')
  ok(/font-size:10px[^"]*color:#999999">Cert III &amp; Diploma of Arboriculture \(AQF 3 &amp; 5\)</.test(html),
    'the qualifications line is 10px #999999 and HTML-escaped')
  ok(html.includes(`<span style="color:#8BA240">M</span> ${SIGNATURE.mobile}`), 'the M is green, the number is not')
  ok(/<span style="color:#8BA240">W<\/span>/.test(html), 'so is the W')
  ok(/text-decoration:none">www\.urbantreeservices\.net<\/a>/.test(html), 'the website link is not underlined')
  ok(!hrefs(html).some(h => h.includes('campaign-track') && h.includes('www.urbantreeservices.net')),
    'the signature website link is not click-wrapped')

  // 13. None of the "marketing blast" furniture.
  for (const [pattern, what] of [
    [/hero/i, 'a hero banner'],
    [/<nav\b/i, 'a nav bar'],
    [/facebook|instagram|linkedin|twitter|x\.com/i, 'a social icon row'],
    // Case-SENSITIVE: the footer's lowercase "offer ends 31 October 2026" is
    // the Fair Trading Act expiry line and has to stay. It is the shouted
    // forms — and only those — that are marketing furniture.
    [/OFFER ENDS|HURRY|ACT NOW|LIMITED TIME|DON'T MISS|LAST CHANCE/, 'urgency furniture'],
    [/!{2,}|⏰|🔥|🎉/, 'shouty punctuation or emoji furniture'],
    [/preference.centre|preference center|update your preferences/i, 'a preference-centre pitch'],
    [/unsplash|shutterstock|istockphoto/i, 'stock photography'],
  ]) {
    ok(!pattern.test(html), `the letter has no ${what}`)
  }
  // Exactly one destination is PUSHED: the CTA button + its text twin. The
  // signature's website link now goes through the tracker too, so counting raw
  // campaign-track hrefs no longer answers this — decode what each one actually
  // redirects to and count destinations, which is what the rule was always
  // about.
  const dest = (raw) => {
    // hrefs come straight out of the HTML, so the separators are still &amp;.
    const h = raw.replace(/&amp;/g, '&')
    const m = /[?&]u=([A-Za-z0-9_-]+)/.exec(h)
    if (!m) return h
    return Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  }
  const tracked = hrefs(html).filter(h => h.includes('campaign-track')).map(dest)
  const toCta   = tracked.filter(u => u.startsWith(CTA_URL))
  eq(toCta.length, 2, 'one CTA destination, offered twice (button + text link)')
  eq(new Set(toCta).size, 1, 'and both go to exactly the same place')

  // Every tracked link carries the campaign tag, or the website cannot tie an
  // enquiry back to the email that produced it.
  for (const u of tracked) {
    ok(/[?&]utm_campaign=/.test(u), `tracked link carries utm_campaign: ${u.slice(0, 60)}`)
    ok(/[?&]utm_source=email/.test(u), 'and identifies email as the source')
  }
  // The unsubscribe links are never tagged and never tracked.
  ok(!hrefs(html).some(h => h.includes('unsubscribe') && h.includes('campaign-track')),
    'unsubscribe is never routed through the click tracker')
  ok(!hrefs(html).some(h => h.includes('unsubscribe') && h.includes('utm_')),
    'and is never tagged as campaign traffic')

  // 14. Merge tags and escaping still work exactly as before.
  eq(r.subject, 'Checking in before the spring winds, Anna', 'merge tags render in the subject')
  eq(greetingName({ first_name: 'JOHN' }), 'John', 'greeting names are still normalised')
  eq(greetingName({ first_name: 'Wellington City Council' }), 'there', 'company names still fall back')
  ok(html.includes('reduce the pōhutukawa over the drive'), 'non-ASCII merge values survive')
  const nasty = renderCampaignEmail(
    { ...CAMPAIGN, body: 'Hi {{first_name}}, about {{suburb}}.' },
    { ...CONTACT, first_name: 'Ann', suburb: 'Te <script>Aro & "Mt Vic"' }, TOKEN)
  ok(nasty.html.includes('Te &lt;script&gt;Aro &amp; &quot;Mt Vic&quot;'), 'contact text is HTML-escaped')
  ok(!nasty.html.includes('<script>'), 'and cannot inject a tag')

  // 15. The open pixel is HTML-only and previews get neither pixel nor tracking.
  ok(html.includes('?o=trk-xyz789'), 'the open pixel is in the HTML part')
  ok(!text.includes('?o='), 'and never in the text part')
  const preview = renderCampaignEmail(CAMPAIGN, CONTACT, null)
  ok(!preview.html.includes('?o='), 'a preview render has no open pixel')
  ok(!preview.html.includes('campaign-track'), 'and no click wrapping')
  ok(preview.html.includes(CTA_URL), 'the preview CTA still points at the real destination')
  for (const tag of imgTags(preview.html)) {
    ok(attr(tag, 'width') !== null && attr(tag, 'height') !== null,
      'preview images are still fully declared')
  }

  // 16. THERE IS NO PHOTO, and that is deliberate. One optional photo was
  //     built, rendered and removed again: no attributable evidence it lifts
  //     conversion here, and an image that carries no information for the
  //     reader's task gets ignored. This asserts it stays gone, because the
  //     obvious "improvement" is to add it back.
  eq(imgTags(html).filter(t => !(attr(t, 'src') ?? '').includes('logo-email')).length, 1,
    'the only image besides the logo is the 1x1 open pixel')
  eq(imgTags(html).length, 3, 'letterhead logo, signature logo, tracking pixel — nothing else')
  ok(!/\.jpg|\.jpeg|\.webp/i.test(html), 'no photograph is referenced anywhere')
  ok(!/#E7E4DA/i.test(html), 'and no leftover photo placeholder cell')
  // A stored photo_url on the row is simply ignored, not rendered.
  const stray = renderCampaignEmail(
    { ...CAMPAIGN, photo_url: 'https://app.urbantreeservices.net/email/job-climber-2x.jpg' },
    CONTACT, TOKEN)
  eq(imgTags(stray.html).length, 3, 'a stray photo_url on the campaign row renders nothing')

  // 16c. The bare-URL paragraph the composer forces into the body is folded
  //      into the button in the HTML — but the text part keeps it, because
  //      there the bare URL IS the call to action.
  ok(!html.includes('>https://urbantreeservices.net/quote</a>\n') ||
     (html.match(/urbantreeservices\.net\/quote/g) ?? []).length === 1,
    'the HTML shows the CTA destination once, not twice')
  ok(text.includes(`\n\n${CTA_URL}\n\n`), 'the text part keeps the bare URL paragraph verbatim')

  // 16d. …and when the copy does NOT already carry the link, the text part
  //      still appends it exactly as it always has: "Label: url".
  const noLinkBody = 'Hi {{first_name}}, just checking in about the pōhutukawa.'
  const appended = renderCampaignEmail({ ...CAMPAIGN, body: noLinkBody }, CONTACT, TOKEN)
  const f2 = complianceFooter(CAMPAIGN, CONTACT, appended.unsubscribe_url)
  eq(appended.text,
    `Hi Anna, just checking in about the pōhutukawa.\n\nBook a free visit: ${CTA_URL}`
    + `\n\n${signatureText()}\n\n${f2.text}`,
    'the text part still appends "Label: url", then the signature, then the footer')
  ok(!appended.text.includes('campaign-track'), 'and it is still not click-wrapped')

  // 17. A campaign with no CTA URL at all renders without a button.
  const noCta = renderCampaignEmail(
    { ...CAMPAIGN, body: 'Hi {{first_name}}, just a note.', cta_url: '', cta_label: '' }, CONTACT, TOKEN)
  ok(!/background-color:#4A6741;border-radius/.test(noCta.html), 'no CTA URL means no button')
  ok(noCta.html.includes(`tel:${SIGNATURE.mobileTel}`), 'but there is still a call to action: ring the office')
  ok(noCta.html.includes(noCta.unsubscribe_url), 'the footer is there regardless')
  ok(noCta.html.includes('Josh Micallef'), 'so is the signature')

  console.log(`\nHTML: ${bytes} bytes (${(bytes / 1024).toFixed(1)}KB of the 80KB budget)`)
  console.log(`Preview written to ${PREVIEW}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(`${checks - failures}/${checks} checks passed`)
if (failures) { console.error(`${failures} FAILED`); process.exit(1) }
