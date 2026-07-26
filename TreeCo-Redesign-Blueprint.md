# TreeCo — App Redesign Blueprint

## Clean, iPhone-native visual identity · Terracotta & Cream

> **What this is.** A design blueprint for restyling the existing TreeCo PWA to look
> and feel like a native iPhone app, using the warm terracotta / cream / navy palette
> from the reference artwork. It changes **look, not logic** — no data model, route, or
> business rule changes. A visual draft (six mocked screens + the design system) is
> published as an Artifact alongside this document.

---

## 1. Design direction

Three ideas drive the whole redesign:

1. **One accent, used with confidence.** The old theme fought itself with three accents
   (moss green, amber, bark brown). The new system has a single brand accent —
   **terracotta**, sampled directly from the reference icons — with navy as ink and a
   cream-to-peach ground. Semantic colours (green/amber/red/blue) are reserved strictly
   for job status and alerts, so brand and state never get confused.

2. **iPhone-native, not "web app on a phone".** White rounded tiles (18px radius), a
   translucent blurred **bottom tab bar**, large touch targets, generous spacing, and the
   native SF system font. It should feel like Reminders or Fitness, not a dashboard.

3. **Summary before detail.** Every screen leads with the one number or the one thing that
   needs attention, then the supporting detail. The crew reads it one-thumbed on site; the
   office reads the same screens at a desk.

---

## 2. Colour tokens

Sampled from the reference: terracotta icon glyphs, cream→peach gradient, navy wordmark.

```css
:root {
  /* ── Brand ── */
  --terra:      #C15A34;   /* PRIMARY — buttons, active nav, brand marks   (was --moss) */
  --terra-deep: #A2451F;   /* pressed / gradient end                                     */
  --terra-soft: #F0C4A6;   /* soft fills, spark bars                                      */
  --terra-wash: #FBEDE1;   /* tinted icon chips, subtle backgrounds                       */
  --peach:      #F7DFC7;   /* gradient stop (sign-in, hero washes)                        */

  /* ── Ink & ground ── */
  --ink:        #22384F;   /* PRIMARY TEXT & dark surfaces   (was --bark #2C2416)         */
  --ink-2:      #64717F;   /* secondary text                                             */
  --ink-3:      #97A0AB;   /* tertiary / captions                                        */
  --cream:      #FCF5EC;   /* app background   (was --cream #FAF8F4 — warmer now)         */
  --card:       #FFFFFF;   /* tile surface                                               */
  --line:       #EFE6DA;   /* warm hairline    (was --border #E2DDD6)                     */

  /* ── Semantic (status only — never brand) ── */
  --ok:    #4F7A4A;        /* scheduled / healthy                                        */
  --warn:  #D08A1E;        /* quote sent / due soon                                      */
  --crit:  #C43B2C;        /* overdue / declined                                         */
  --info:  #4A7FA5;        /* new lead / quote visit                                     */

  /* ── Form ── */
  --radius-card: 18px;
  --radius-ctrl: 14px;
  --radius-chip: 999px;
  --shadow:      0 1px 2px rgba(40, 25, 10, 0.05);
  --shadow-lift: 0 8px 24px -12px rgba(40, 25, 10, 0.30);
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
}
```

### Old → new mapping (for the code swap)

| Old token        | Old value  | New token     | New value  |
|------------------|------------|---------------|------------|
| `--bark`         | `#2C2416`  | `--ink`       | `#22384F`  |
| `--bark-mid`     | `#3D3322`  | `--ink` @ 90% | —          |
| `--moss`         | `#4A6741`  | `--terra`     | `#C15A34`  |
| `--moss-pale`    | `#E8F0E6`  | `--terra-wash`| `#FBEDE1`  |
| `--amber`        | `#D4851A`  | `--warn`      | `#D08A1E`  |
| `--cream`        | `#FAF8F4`  | `--cream`     | `#FCF5EC`  |
| `--border`       | `#E2DDD6`  | `--line`      | `#EFE6DA`  |
| `--radius` `10px`| —          | `--radius-card` | `18px`   |

The nav (`Layout.jsx`) currently uses `--bark` as the sidebar/bottom-bar background. In
the redesign the **bottom tab bar goes light** (translucent cream with blur, terracotta
for the active tab), which is the single most iOS-defining change. The desktop sidebar can
stay dark but should switch from bark-brown to **navy `--ink`**.

---

## 3. Typography

The app already uses the Apple system stack. The redesign **leans into that as a
deliberate choice** — SF is the native iOS face, so it makes the app read as a real Apple
app without embedding a webfont. Hierarchy is carried by weight + size, not new families.

| Role     | Size / weight        | Usage                                    |
|----------|----------------------|------------------------------------------|
| Display  | 24–28px / 800        | Screen titles ("Business Health")        |
| Title    | 19px / 750           | Card & section titles                    |
| Body     | 14px / 500           | Addresses, descriptions                  |
| Label    | 11px / 750, +0.07em, uppercase | Eyebrows, KPI labels           |
| Numeric  | 22–26px / 800, `tabular-nums` | Prices, KPIs                    |

- Prices, KPIs and any aligned digits use `font-variant-numeric: tabular-nums`.
- Titles get `text-wrap: balance`. Body copy stays ~60 characters wide.

---

## 4. Components

| Component        | Redesign spec                                                                 |
|------------------|-------------------------------------------------------------------------------|
| **Bottom tab bar** | Translucent cream + `backdrop-filter: blur`, top hairline, terracotta active tab, 66px tall, safe-area padded. Replaces the dark bar. |
| **Card / tile**  | White, 18px radius, `--shadow`. The base unit for everything.                  |
| **Hero KPI**     | Full-width terracotta→terra-deep gradient tile for the single most important number. |
| **Stat KPI**     | White tile: uppercase label, big tabular number, muted sub-line.               |
| **Status chip**  | Pill: coloured dot + text on a tint of its semantic colour. Never terracotta.  |
| **Segmented filter** | iOS pill row; active pill is navy `--ink`, rest white.                     |
| **Quick actions**| 4-up grid of rounded `--terra-wash` icon squares with labels (Call / Map / Quote / Photos). |
| **Primary button** | Terracotta, white text, 14px radius, full-width where it's the main action. |
| **List row**     | Title + address + status chip on the left, price right-aligned in tabular figures. |
| **Sparkline**    | `--terra-soft` bars, current month `--terra`. Faint month labels beneath.      |
| **Alert row**    | Tinted card (crit/warn), coloured dot, one-tap action chip on the right.        |

---

## 5. Screen-by-screen

Six screens are drawn in the Artifact. The redesign applies the same rules everywhere else.

| # | Screen | File | Redesign notes |
|---|--------|------|----------------|
| 1 | **Sign in** | `pages/Login.jsx` | Cream→peach gradient, terracotta starburst mark, navy "TreeCo" wordmark, rounded fields, terracotta button. Sets the reference mood. |
| 2 | **Home — Business Health** | `pages/Dashboard.jsx` | Greeting + avatar header; hero "Crew days booked" gradient tile; Win rate & Active jobs tiles; revenue sparkline card; "Needs attention" alert row. Fleet table → card list on mobile. |
| 3 | **Jobs** | `pages/Pipeline.jsx` | Vertical mobile list with a segmented status filter (All / New / Sent / Scheduled / Invoice); each row a white tile with status chip + price. Desktop keeps the kanban board, restyled. |
| 4 | **Job detail** | `components/JobDetailPanel.jsx` | Terracotta gradient hero (client, address, status, price); iOS quick-action grid; scope in a plain card. |
| 5 | **Calendar** | `pages/Calendar.jsx` | Day view; one colour per crew (terracotta Isuzu, green Nissan, blue quote visits); time-gutter + coloured event blocks. FullCalendar theme variables retinted. |
| 6 | **Safety** | `pages/Safety.jsx` | Worst-first alert cards (crit/warn), SiteWise progress bar, toolbox-meeting scheduler row. |

Others follow the same tokens with no new patterns: **Planner, Mulch, Tools, Team,
Clients, Settings, Quote Builder / View, Work Order, SWMS / SOP / Risk Assessment**.

---

## 6. Implementation path (low-risk, incremental)

The whole business logic is untouched. Suggested order:

1. **Tokens.** Update `frontend/src/config/theme.css` per §2. Because pages already use CSS
   variables (`var(--moss)`, `var(--bark)` …), most of the app re-skins from this one file.
2. **Add aliases.** Add `--terra`, `--ink`, `--line` etc. and point the legacy
   `--moss`/`--bark` at them so nothing breaks mid-migration; retire the old names page by page.
3. **Nav.** `Layout.jsx` — light translucent bottom bar with terracotta active state;
   desktop sidebar bark → navy.
4. **Card radius & shadow.** Bump card radius to 18px and adopt the warm soft shadow.
5. **Screen passes.** Work the six screens above first (highest traffic), then the rest.
6. **PWA chrome.** Update `theme_color` / `background_color` in the web-app manifest and any
   splash/icon assets to terracotta + cream.

No route, hook, Supabase, or API changes are required for the redesign.

---

*Palette sampled from the reference artwork. This blueprint pairs with the published
Artifact mockup of six redesigned screens.*
