# Designing one app for Mac, iPad and iPhone — the rules used in the redesign

Drawn from Apple's Human Interface Guidelines (Liquid Glass era, 2025–26), Material's window size classes, and how Mail, Notes, Things 3, Linear, Notion and Fantastical adapt the same screen.

## The rules in one screen

1. Two layers, always: content is flat and edge-to-edge; navigation and controls float above it. Never put glass-style chrome inside content.
2. Width decides navigation. Under 768px: bottom tab bar and push navigation. 768–1023px: collapsible sidebar over list + detail. 1024px and up: sidebar + list + detail. 1280px and up: optional inspector pane, the first to hide when the window narrows.
3. Three to five tabs, never hidden or disabled. Search is the trailing tab on iPhone and the trailing toolbar item on iPad and Mac.
4. One prominent action per view, tinted with the single accent, on the trailing edge. Everything else neutral.
5. 44×44pt hit targets (28pt absolute minimum), about 12pt between bezelled controls.
6. Type: system font (SF on Apple devices). Body 17pt on iOS and iPadOS, 13pt on macOS. No Light or Thin weights.
7. Sheets on phone (medium and large detents, grabber, swipe to dismiss, Cancel leading and Done trailing), popovers on iPad and Mac. One sheet at a time.
8. Two disclosure levels at most: primary information visible, secondary behind More, a disclosure or a context menu, never a third layer.
9. Drag and drop everywhere, with an equal non-drag path (menu or keyboard) for every drop outcome.
10. Touch drag: long-press 200–300ms plus 5–8px tolerance; `touch-action: none` on the handle only, never on the scrolling list.
11. Neutral palette, one accent, hairline borders, 8pt grid, light and dark both designed.
12. Swipe actions and the top context-menu items must match.

## Liquid Glass changes that matter

- Controls and navigation float above content; use a scroll-edge blur, not a background, to separate a bar from content.
- Colour sparingly: tint the background of the one primary action, keep tab and toolbar glyphs monochrome.
- Concentric corner radii: nested radius = parent radius minus padding; capsules are half the height.
- Toolbar items grouped by glass background, at most three groups; don't mix text and icon buttons in one group.
- Sheets get larger radii and half sheets are inset; action sheets spring from the element that triggered them.
- Sidebars are inset and content extends beneath them.
- Respect Reduce Transparency, Increase Contrast and Reduce Motion.

## Reference apps

- Apple Mail and Notes: three panes on iPad Pro with a toggle to two; both secondary columns collapse in portrait; on iPhone the same hierarchy is push navigation with search above the list.
- Things 3: identical sidebar on iPad and Mac; on iPhone the sidebar is the root list; drag a task onto a day to reschedule.
- Fantastical: sidebar list + week grid on iPad and Mac, inspectors in popovers; iPhone is a ticker plus a list; tap-hold-drag to reschedule, handles to resize.
- Linear: keyboard-first desktop, Inbox and Triage with accept / decline / snooze; mobile is a purpose-built subset.

## Drag and drop on the web (2026)

| | dnd-kit | Atlassian pragmatic-drag-and-drop | FullCalendar resource timeline |
|---|---|---|---|
| Mechanism | pointer / touch / keyboard sensors | native HTML5 drag events | own interaction plugin |
| iPad Safari | works with activation constraint and `touch-action` on the handle | unreliable on touch per open issues | works; `longPressDelay` default 1000ms |
| Accessibility | built in: Space / Enter to pick up, arrows to move, live-region announcements | build your own alternative flows | none built in |
| Licence | MIT | Apache-2 | commercial for business use |

Recommendation: dnd-kit (already in the project) for lists, board and the scheduler grid; keep FullCalendar only if its resizing and timeline are worth the licence.

Affordances (Atlassian guidelines): always-visible handle for primary drags; drag preview at ~0.8 opacity, original dimmed to 40%; 2px drop line with an 8px terminal; container highlight only when the drop is valid; auto-scroll near edges; light haptic on lift; undo toast rather than confirmation.

## Simplicity principles with evidence

- Progressive disclosure (Nielsen): show the few most important options, offer the rest on request; more than two levels usually fails.
- Hick's law: decision time grows with the number of choices; cut visible options per screen, categorise long menus.
- Jakob's law: copy iOS and macOS conventions rather than inventing.
- Heuristics that matter most here: visibility of status, user control and undo, error prevention only for irreversible loss, recognition over recall, accelerators (⌘K, swipe actions) never as the only path.
- One primary action per screen; full-width primary button on iPhone.
- Today / Inbox-zero pattern (Things, Linear Triage); one CTA in every empty state.

## Visual design for clean B2B in 2026

Near-black text rather than pure black; a grey ramp with a slight hue bias toward the accent; one accent for the primary action, selection and links; hairline borders over shadows (shadows only for floating layers); radii 6 / 8 / 12 with concentric nesting; 8pt grid; inset-grouped lists on iPhone, dense flat rows on iPad and Mac; dark mode required; Lucide icons on the web as the SF Symbols equivalent; comfortable / compact density toggle on iPad and Mac only.

## How the same Job screen adapts

- iPhone: reached from Today by push; header with one full-width tinted button that changes with state; secondary actions as a row of three 44pt icon buttons; sections as inset-grouped lists; photos as a horizontal strip; edits in sheets; swipe actions on line items; bottom tabs Today · Jobs · Schedule · More.
- iPad: sidebar collapsible by edge swipe; middle list with persistent selection; detail with a top toolbar (leading back and title, centre common actions, trailing search, More and the one prominent action); edits in popovers anchored to the field; drag the job from the list onto a day / truck row in Schedule; supporting pane for photos and activity at 1024px and up.
- Mac: same three columns plus inspector at 1280px and up; resizable 1pt dividers; ⌘K command palette; undo after every drag; never critical controls at the window bottom.

Sources: developer.apple.com/design/human-interface-guidelines (layout, split-views, tab-bars, sidebars, materials, color, typography, sheets, popovers, modality, toolbars, search-fields, context-menus, lists-and-tables, drag-and-drop, gestures, accessibility, buttons, dark-mode, widgets); developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass; WWDC25 sessions 219, 356, 323; developer.android.com adaptive-apps canonical-layouts and window size classes; github.com/clauderic/dnd-kit and dnd-kit/docs; atlassian.design pragmatic-drag-and-drop design and accessibility guidelines; fullcalendar.io/docs/timeline-view; nngroup.com progressive-disclosure, ten-usability-heuristics, empty-state-interface-design; lawsofux.com; culturedcode.com/things/features; macstories.net Fantastical and Things reviews; linear.app/now/how-we-redesigned-the-linear-ui.
