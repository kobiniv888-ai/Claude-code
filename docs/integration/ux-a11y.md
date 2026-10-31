# UX, accessibility and RTL pass (2026-10-31)

A browser pass over every page with axe-core and layout checks, using the `ui-ux-pro-max`
checklists (`references/quick-reference.md` §1–§3, `references/pro-rules.md` pre-delivery list).
The brand (deep blue + terracotta, off-white, Noto) is unchanged; only UX and accessibility
guidance was applied.

## Result

| Check | Before | After |
|---|---|---|
| axe-core, WCAG 2.0/2.1 A + AA tags | 7 rule types on 60+ pages (serious/critical) | **0 violations** on 333 page checks |
| Horizontal overflow (`scrollWidth > innerWidth`) | 0 | 0 |
| Overlapping fixed elements (header, bottom nav, cookie banner, contact bar, map button) | 0 | 0 |
| Focus hidden under the bottom bar / floating map button | yes (home, search) | no |
| Dialogs and drawers: focus moves in, stays in, Esc closes | drawer did not take focus | all pass |
| Focus returns to the opener after closing | lost (to `<body>`) for filters drawer, contact, report, photo lightbox and login dialogs | all pass |
| Pages without an `<h1>` | wizard (11 steps) and listing edit | none |
| Console errors | only transient dev hydration warnings while files were being edited | only the expected 404 on `/does-not-exist` |

Pages checked (signed in as the right demo user): home, about, contact, help, new ticket,
how it works, Jewish life, all legal pages, safety, search (grid, list, map), two listing pages,
two owner profiles, login, 404, every `/account` page (guest and owner), listing edit and stats,
`/post`, all 11 wizard steps, two-factor setup, and all 30 `/admin` pages.

Matrix: 360×780 in Hebrew and Arabic, 1440×900 in English (all pages); dark mode for the main
pages at 360 he, 360 ar and 1440 en; 360 Russian and Georgian for the main pages (long words).
All with `prefers-reduced-motion: reduce`.

## What was fixed

**Contrast**
- `--brand-verified` `#15803d` → `#13763a` (and `siteConfig.colors.verified`, `--chart-3`): green
  text on its own soft tints was 4.38–4.45:1, now ≥ 4.98:1. White on green is 5.71:1.
- Tabs: inactive tab text `foreground/60` → `/70` (was 4.18:1 on the muted tab bar).
- Table of contents numbers (legal pages), zero counts on the account tiles and past days on the
  listing availability calendar used faded text (2.1–3.7:1); they now use `muted-foreground`.

**Names, labels and ARIA**
- Mobile menu and account menu buttons: the visible language code / initials are now part of the
  accessible name (WCAG 2.5.3 label in name), e.g. "Open menu · HE".
- Calendar day buttons were named "Thursday, October 1st, 2026" while showing "1"; they are now
  named "Thursday, 1 October 2026" (localized by date-fns, no English "Today"/"selected" suffixes —
  the selected state is on the grid cell).
- Dialog and sheet close buttons said "Close" in English in every language; now `common.close`.
- Admin risk score badge used `aria-label` on a plain `<span>` (not announced); it now has
  screen-reader text. The "not translated" dot in the wizard got `role="img"`.
- City photo file input (admin) had no name.
- Owner profile facts: `<dl>` had `div > div > dt/dd`; the icon moved into the `<dt>`.
- Recharts charts are hidden from screen readers (the numbers are in text next to them) but their
  SVG was still focusable; `accessibilityLayer={false}`.
- Wizard step title is now the page `<h1>` (was the only page without one).

**Keyboard and focus**
- `useReturnFocus` (`src/components/ui/use-return-focus.ts`), used by `DialogContent`,
  `SheetContent` and `DrawerContent`: focus goes back to whatever opened the dialog. Radix only
  does this for its own `<Trigger>`, and most dialogs here are opened from state. The login dialog
  remembers its opener itself, because its phone field takes focus on mount.
- `Drawer` now moves focus into the drawer when it opens (vaul defaults to not doing so); the
  search filters drawer left focus on the page behind it.
- Focus is never hidden under fixed bars (WCAG 2.4.11): `scroll-padding-bottom` on phones for the
  bottom nav / listing contact bar / floating "Map" button, and a `scroll-margin-top` on focusable
  elements for the sticky header (anchors keep their own `scroll-mt-*`).
- Tab panels (`TabsContent`, e.g. "How it works" on the home page) are focusable but had no focus
  ring.
- Carousel arrow keys follow the screen in RTL (ArrowLeft = next), like the listing photo
  carousel and lightbox already did.

**Touch targets and layout**
- `TabsList` forced `h-8` with a selector that beat `className`, so tab lists meant to be taller or
  to wrap were clipped: the home "How it works" tabs were 23 px tall, and the wizard language tabs
  wrapped outside their bar at 360 px. Fixed in `ui/tabs.tsx`.
- Section headings with a "See all" link: in Georgian at 360 px the link overlapped the last line
  of the description. The link now wraps under the text when there is no room.
- 24 px minimum height for standalone small links (Shabbat times "All cities and calendar", safety
  tip "How to spot a scam", "Show original", holiday "Show in calendar").
- Account overview: a guest with no listings saw "See all 0 listings" and seven zero tiles; it now
  says "You haven't posted a listing yet" with a "Post a listing" link.

**Reduced motion**
- `src/lib/motion.ts` (`prefersReducedMotion`, `scrollBehavior`): the CSS reduced-motion rule does
  not reach `scrollIntoView({ behavior: "smooth" })` or Leaflet `flyTo`. Search, wizard, Jewish
  life places, recently viewed and the map pickers now jump instead of animating when asked.

## Files

`src/app/globals.css`, `src/config/site.ts`, `src/lib/motion.ts` (new),
`src/components/ui/{tabs,calendar,carousel,dialog,sheet,drawer}.tsx`,
`src/components/ui/use-return-focus.ts` (new),
`src/components/layout/mobile-menu.tsx`, `src/components/auth/{user-menu-client,login-dialog}.tsx`,
`src/components/common/{section-heading,safety-tip}.tsx`, `src/components/content/toc.tsx`,
`src/components/account/{overview,listing-stats-charts}.tsx`,
`src/components/admin/{badges,clicks-chart}.tsx`, `src/components/admin/content/city-form.tsx`,
`src/components/listing-page/{availability-calendar,listing-text}.tsx`,
`src/components/listing/recently-viewed.tsx`, `src/components/search/search-results.tsx`,
`src/components/shabbat/{shabbat-times-card,shabbat-times-strip}.tsx`,
`src/components/jewish-life/{upcoming-holidays,places-explorer,places-map}.tsx`,
`src/components/maps/location-picker.tsx`,
`src/components/wizard/{wizard-shell,wizard-chrome}.tsx`, `src/components/wizard/steps/publish-step.tsx`,
`src/app/[locale]/(site)/owner/[id]/page.tsx`. No new UI text (existing `common.close` and
`account.listings.*` keys are reused).

## What remains

| Item | Severity | Notes |
|---|---|---|
| ~~Bare listing URLs (`/listing/113`) redirect with a `<meta http-equiv="refresh">`~~ | Fixed | `src/proxy.ts` now answers a real `308` to the canonical slug for public listings (security follow-up pass). Checked on the production build: `curl` shows `308`, and axe (WCAG 2.1 A/AA) finds 0 violations and no `meta-refresh` after the redirect (he/ar 360 px, en 1280 px). |
| Small inline / text links below 44 px (footer links 36 px, admin table links ~20 px, inline links in sentences) | Low | All ≥ 24 px wide or inline in text, so they pass WCAG 2.2 target size (2.5.8) by the inline/spacing exceptions. Switches, radios and checkboxes are 16–18 px visually but already have an invisible hit area of about 40×32 px or more. |
| Section and category scrollers on the home page have no visible scroll buttons on phones | Low | They scroll by swipe and by keyboard (each card is focusable); "See all" links give the same content. |
| Demo listings created by end-to-end tests ("E2E …") show on the home page while the suite runs | Info | Test data of the parallel e2e work, cleaned up by that suite. |

## How to re-run

The scripts are not part of the repo (one-off audit tooling). In short: log in the demo guest,
owner and admin through `/api/auth/phone-number/*` + `/api/dev/last-otp` on a dev server, then for
each route and viewport run `new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"])`,
check `document.scrollingElement.scrollWidth > innerWidth`, intersect the rectangles of visible
`position: fixed/sticky` elements, list interactive elements under 24/40 px, tab through the page
checking `elementFromPoint` at the focused element's center, and open each dialog with the
keyboard (focus inside, Tab ×40, Esc, focus back on the opener).
