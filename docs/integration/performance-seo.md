# Performance, SEO, links and console errors (2026-10-31)

Production build (`next build` + `next start`, port 3604), local Postgres with the demo data.
Lighthouse 12.8 (mobile preset: Moto G Power, slow 4G, 4× CPU, simulated throttling), Playwright
1.63 for the crawler, the SEO checks and the PWA checks.

## Lighthouse (mobile)

Pages: `/he`, `/en/search?city=tbilisi`, `/he/listing/89-…` (live demo listing), `/he/jewish-life`,
`/en/help`. Scores are Performance / Accessibility / Best Practices / SEO.

| Page | Before | After (HTTP/1.1) | After (HTTP/2) |
|---|---|---|---|
| `/he` | 47 / 100 / 100 / 100 | 65 / 100 / 100 / 100 | 63 / 100 / 100 / 100 |
| `/en/search?city=tbilisi` | 52 / 100 / 100 / 100 | 62 / 100 / 100 / 100 | 63 / 100 / 100 / 100 |
| listing page | n/a¹ | 62 / 100 / 100 / 92 | 61 / 100 / 96² / 92 |
| `/he/jewish-life` | 64 / 100 / 100 / 100 | 72 / 100 / 100 / 100 | 71 / 100 / 100 / 100 |
| `/en/help` | 72 / 100 / 100 / 100 | 75 / 100 / 100 / 100 | 80 / 100 / 100 / 100 |

| Page | Before: LCP · TBT | After (HTTP/2): LCP · TBT |
|---|---|---|
| `/he` | 6.7 s · 1,920 ms | 4.9 s · 780 ms |
| search | 6.8 s · 1,220 ms | 4.8 s · 790 ms |
| jewish-life | 4.9 s · 630 ms | 3.2 s · 940 ms |
| help | 4.8 s · 410 ms | 2.6 s · 660 ms |

¹ The first run measured the wrong URL for the listing. Measured with only the messages fix
applied, it scored 57 (LCP 5.2 s, TBT 1,000 ms).
² A server action posted through the local HTTPS proxy was refused (Origin ≠ Host). This came
from the proxy setup, not the site.

TBT changes by ±300 ms from one run to the next on this shared machine, so compare the LCP and
transfer-size columns rather than single TBT values.

What one page load transfers, gzip:

| Page | HTML before → after | JS before → after |
|---|---|---|
| `/he` | 139 KB → 78 KB | 470 KB → 343 KB |
| search | 121 KB → 66 KB | 513 KB → 413 KB |
| jewish-life | 138 KB → 76 KB | 399 KB → 324 KB |
| help | 110 KB → 56 KB | 390 KB → 320 KB |

On a deployed host the HTTP/2 column is closer to what users get. Local `next start` is
HTTP/1.1, so Lighthouse models six connections for about 30 scripts. The HTTP/2 run used a local
TLS proxy that forwarded to port 3604. With real (devtools) throttling, `/en/help` has LCP 1.9 s
and `/he` has 2.2 s. **Performance 90+ is still not reached.** The rest of the cost is main-thread
work on a 4× slower CPU (see "Open" below). Accessibility, Best Practices and SEO are at 100 except
for the two listing issues described below.

### Performance fixes

- **All interface text was sent to every page** (~300 KB of Hebrew in the HTML and the RSC
  payload). Public pages now get only the namespaces their client components read
  (`src/i18n/client-messages.ts`). `/account`, `/admin` and `/post` mount their own
  `NextIntlClientProvider` with every namespace. Result: HTML is about half the size. The rule is
  in CONVENTIONS → Translations.
- **libphonenumber on every page** (~50 KB gz). The header user menu formatted the phone number in
  the browser; the server formats it now.
- **The login form loaded with every page** (phone input, country list, cmdk). It now loads when
  the login dialog opens, with a skeleton while it loads.
- **zod on the home page** (~31 KB gz). The search bar's URL parser used zod for one number check
  and one slug check. These are now plain checks; behavior is the same and the tests pass.
- **The date picker on the home page** (react-day-picker + date-fns). It now loads when the dates
  popover or sheet opens.
- **Full-page style recalculations on every load.** next-themes' `disableTransitionOnChange` added
  and removed a global style each time it applied the theme on mount: four full restyles of about
  2,300 elements. That option is off. The theme switcher now turns transitions off only for a real
  change (`useSetTheme`).
- **LCP images** got `fetchPriority="high"`: the first card photo and the listing's main photo.
  Next 16's `priority` no longer sets it.
- **Tailwind** scanned `.claude/` (design-skill examples) and `docs/`, which added unused classes.
- **Cache headers** for `public/brand`, `public/icons` and `public/images`: one week plus
  stale-while-revalidate. They were `max-age=0`.

## Mobile performance pass (2026-10-31, second pass)

Production build on port 3701, Lighthouse 12.8 mobile preset (simulated throttling), Chromium
from `/opt/pw-browsers`, `--headless=new --no-sandbox`, HTTP/1.1. Every number is the **median
of several runs**: the machine is shared and TBT moves by ±150 ms between runs, so the "after"
column gives the range of two 5-run passes on the final build.

| Page | Before (median of 3): Perf · LCP · TBT | After (medians of 5): Perf · LCP · TBT |
|---|---|---|
| `/he` | 66 · 6.5 s · 470 ms | 81–83 · 3.4–3.8 s · 290–360 ms |
| `/en/search?city=tbilisi` | 56 · 6.1 s · 990 ms | 77–78 · 4.0–4.1 s · 340–360 ms |
| `/he/listing/89-…` | 57 · 5.3 s · 1,060 ms | 71–77 · 4.3 s · 340–520 ms |
| `/he/jewish-life` | 63 · 4.3 s · 960 ms | 75–79 · 3.9 s · 350–490 ms |
| `/en/help` | 52 · 4.2 s · 4,500 ms¹ | 82–85 · 3.1–3.2 s · 330–420 ms |

CLS is 0–0.045 (see "Open"); FCP 1.4–1.7 s. ¹ One noisy baseline run; the help page was at
66–75 in other baseline runs. **90+ is still not reached** — see "Open".

### How Lighthouse's simulated LCP behaves here

The unthrottled load on localhost is so fast that every font, preloaded image and most of the
~300 KB of JavaScript have finished downloading before the first paint. Lantern then counts all of
them as needed for the LCP, so on this setup **LCP ≈ the time to download everything that ended
before the LCP paint** on slow 4G. Two things follow: the LCP element should paint in the first
frame (anything that paints later pulls more requests in), and every KB requested early counts.
A small wrapper around Lantern's `FirstContentfulPaint.getFirstPaintBasedGraph` (run with
`lighthouse -A` on saved artifacts; not committed) printed the graphs: e.g. `/he` before this pass had 236 KB of fonts, 279 KB of
scripts and 50 KB of preloaded below-the-fold photos in its LCP graph.

### Changes (each measured)

| Change | Effect |
|---|---|
| **No `loading.tsx` on the fast public pages** (home and other `(site)` pages without their own, search, listing, Jewish Life, help). React reveals streamed content at least 300 ms after the skeleton, so the LCP always came after the scripts. The whole page now arrives in one response. | help 52 → 77, Jewish Life 63 → 84, together with the two card changes below. Old listing slugs now get a real HTTP redirect (307). |
| **Listing cards are server components** (`listing-card.tsx` lost `"use client"`), so on the home page, similar listings and the search grid only the photo, heart, compare and price islands hydrate. | `/he` TBT 470 → 240 ms. |
| **Photo carousel without Embla on load** (`photo-carousel.tsx`, `photo-carousel-engine.tsx`): the server renders the first photo only; the other slides and Embla (lazy chunk) start on hover/focus/prev-next, or once the card is near the screen and the browser is idle (so the first swipe works on phones). | ~10 fewer elements and no Embla setup per card. Swipe, arrows and keys checked in en/he. |
| **Cookie banner earlier in the document** (after the header). It is fixed to the bottom but was the last thing in the HTML and the LCP element on first visits, painted after everything else. Its slide-in no longer starts at opacity 0. | `/he` 69 → 84, together with the font, preload and 4-card changes below. |
| **Fonts: "₾" from a 13 KB face, "≈" from a system font** (`fonts.ts`, `globals.css`). See the fixed "Open" row below. A Hebrew "Wi‑Fi" with a non-breaking hyphen (U+2011, only in the 162 KB Noto Sans Arabic file) pulled 213 KB of Arabic/Hebrew fonts into the listing page; it is a plain hyphen now. | Fonts per page 236–263 KB → 36–62 KB. Listing LCP 6.0 → 4.5 s. |
| **No preloads for photos below the fold**: home rows and cities load lazily, search preloads only the first card, and the listing gallery no longer preloads its main photo twice (the mosaic copy, hidden on phones, was 88 KB). | — (part of the LCP gains above) |
| **Home rows show 4 cards** (featured and newest; one row on large screens, "See all" opens the search). | `/he` HTML −25 KB, DOM −400 elements. |
| **Search grid/list cards rendered on the server** (`result-cards.tsx`); the client list stays for the map view (hover ↔ pin). **The filter sidebar only renders on large screens** (370 elements and 140 KB of HTML that phones never show; phones use the drawer). Its placeholder column also reserves the sidebar's height (`h-[calc(100dvh-var(--header-height)-2rem)]` on both): without it, a short result list grew by ~70 px when the sidebar mounted after hydration on desktop, which moved the footer under the pointer (caught by the e2e language-switcher test in the final regression gate). | search 74 → 78, CLS 0.036 → 0. |
| **sonner and Better Auth no longer load with every page.** Toasts go through `@/lib/toast` (same calls; sonner loads with `<AppToaster>` after start). The login-dialog provider takes "signed in" from the server instead of `useSession()` (which also sent a session request on every load); `signOut` and `getSession` are imported when used. | −25 KB JS per page, one request less. |
| **Area map on the listing page starts when scrolled near** (`useNearViewport`); before, Leaflet and the tiles loaded with the page. | Map checked: loads after scrolling, tiles shown. |
| Tried and reverted: `experimental.inlineCss`. The stylesheet was inlined into the HTML several times (help: 1.3 MB of HTML) and every page got slower (TBT ~900 ms). | — |

Checked after the changes: carousel swipe (he, 412 px), arrows and keys (en, 1280 px), favorites
open the login dialog when signed out, toasts appear, the listing map loads, search grid/list/map
views and the hover ring next to the map. axe (WCAG 2.0/2.1 A + AA) finds 0 violations on the five
pages plus `/ar` and the map view at 360 px and 1280 px.

## Link crawler (production)

Playwright opens every internal `<a href>` in a new tab at 1280 px. It records the status, console
errors, page errors, failed requests and CSP violations (`securitypolicyviolation`). Links outside
the crawl scope are checked by status only.

| Crawl | Pages opened | Links checked by status | 4xx/5xx |
|---|---|---|---|
| Signed out, from `/he /en /ru /ar /ka` | 245 | 10 | 0 |
| Owner (demo Yossi), `/account` and `/post` in 5 languages | 160 | 111 | 0 |
| Admin (temporary 2-step-verified admin), `/en/admin` and `/he/admin` | 192 | 40 | 0 |

Console problems found and fixed:
- **CSP violation on 250+ pages** (listing, owner, contact, account, admin). zod 4 calls
  `Function("")` to test whether it may compile schemas, and the CSP has no `'unsafe-eval'`. The
  root layout now runs a one-line inline script before any bundle that switches zod to `jitless`
  (`src/lib/zod-jitless.ts`).
- **Hydration error (#418) on `/ka/account/settings`**. Spoken-language names came from
  `Intl.DisplayNames`, which has Georgian data in Node but not in Chrome. The server now provides
  the names.

After the fixes, these pages had no errors when opened again: listing, contact, owner,
`/ka/account/settings` and the listing edit page.

Interactions checked at 360 px: mobile menu (en, he), dates popover, search filters drawer,
listing report dialog, share menu, and the lazy login dialog in en/he/ka (the phone field gets
focus). No console errors and no missing-message keys.

## SEO

Checked on 17 public page types × 5 languages plus a listing page. Results:
- Every public page has one translated `<title>`, a description, `lang`/`dir`, a self-canonical
  URL, hreflang alternates for the 5 languages plus x-default, a manifest link, Open Graph and
  Twitter tags.
- Private pages (`/login`, `/account`, `/post`, `/admin`, `/verify-phone`, `/two-factor`) redirect
  or are `noindex`.

Fixed:
- **Sitemap listing URLs.** Every language used the slug of the original title, so 4 of 5 listing
  URLs were non-canonical and only reached the real page through a client-side redirect. Each
  language now has its own canonical URL with matching hreflang (`listingPathsByLocale`, shared
  with the page's own alternates).
- **About, How it works, Safety and the legal pages had no `og:image`.** A page's `openGraph`
  replaces the layout's. `contentMetadata` now uses the shared `pageMetadata()`.

Verified:
- `sitemap.xml`: 415 URLs and 2,490 hreflang links. All static and city URLs and a sample of
  listing URLs return 200.
- `robots.txt`: disallows the private areas and has an absolute `Sitemap:` line.
- Listing JSON-LD parses (`Apartment`, schema.org context).
- Listing Open Graph: title with city, description with price and place, absolute JPEG image that
  returns 200.

## PWA

- The manifest is valid. All four icons return 200 PNG. `start_url /` redirects to the visitor's
  language.
- The service worker registers in production (scope `/`) and controls the page after a reload.
- Offline, a page never visited shows `offline.html` ("You're offline", in all 5 languages).

## Also fixed

**Message loader under load** (`src/i18n/messages.ts`). A burst of about 300 requests at once on
a cold server ran out of file handles:
- `readdir` errors were cached as "no messages" for 60 s.
- Every request read all 66 files again.

Now one load per language runs at a time, and only a missing folder counts as empty.

## Open

| Severity | Issue |
|---|---|
| High | **Performance below 90 on mobile (71–85 after the second pass above).** What is left: (1) ~300 KB of JavaScript on every page, which Lighthouse counts into the LCP here — the biggest parts are react-dom (73 KB), the Next runtime (45 KB) and ~70 KB of Radix for the header menus, tooltips, sheet and dialogs that also hydrate on phones where they are hidden; loading those menus on first use is the next step. (2) Hydration: lucide-react 1.x icons are client components, so every icon in a server component is serialized into the RSC payload (up to 25 KB on the listing page) and hydrates; icons are ~45% of the DOM (svg + paths). (3) Interface text: every public page ships ~55 KB of messages (tickets, listing, jewishLife, search…) that most pages never read; per-route providers would cut it. (4) Page-specific client trees: the help center's Radix accordion, Jewish Life's places explorer. Measure again on the real host (HTTP/2, CDN): the lab result here depends on how fast localhost delivers the scripts. |
| ~~Medium~~ Fixed | ~~One "₾" downloads 168 KB of font.~~ A 13 KB face goes first in the stack for U+20BE (a copy of Noto Sans Georgian latin-ext, `src/components/layout/font-files/`, SIL OFL), and "≈" (U+2248, in none of our Noto files) comes from a system font through `local()` ("Bayit Symbols" in `globals.css`); without a matching local font the browser falls back as before. Avoid U+2011 (non-breaking hyphen) in interface text: only Noto Sans Arabic (162 KB) has it. The last three (`auth.json` he, "ה-QR" on the 2-step setup pages) were replaced in the final regression gate; `grep -rn $'‑' messages` is empty. |
| Low | **Listing SEO 92 in Lighthouse.** Next 16 streams listing metadata after the shell for user agents that are not on its bot list, and Lighthouse 12 no longer sends "Chrome-Lighthouse". Real crawlers (Googlebot renders JS; WhatsApp, Facebook, Telegram, Twitter, Slack and Discord are on Next's bot list) get it in `<head>`. Viber is not on that list; add it with `htmlLimitedBots` if Viber previews matter. |
| Low | Bare listing links (`/listing/113`) now get a real `308` to the canonical slug from `src/proxy.ts` (public listings only, query kept, `Cache-Control: no-store` because the slug follows the title). Old slugs (`/listing/113-old-title`) are redirected by the page itself; since the listing route has no `loading.tsx` any more (second performance pass) that is a real HTTP `307`. Internal links always use the canonical slug. |
| Low | The zod `jitless` switch relies on zod's shared config global (`globalThis.__zod_globalConfig`). Check that it still exists when zod is upgraded. |
| Low | **Cookie banner reflows when the script font arrives** (CLS ≈ 0.04 on `/he` and the listing page): it is fixed to the bottom and painted with the fallback font first, so its top edge moves when Noto Sans Hebrew swaps in. It was the same on slow connections before; Lighthouse sees it now that the banner paints with the first screen. Fix with fallback metric overrides (`size-adjust`, ascent) for the script faces. |
| Low | Client navigations to the pages without `loading.tsx` keep the current page until the next one has loaded (no skeleton). A small navigation progress indicator (`useLinkStatus`) would give feedback on slow connections. |
| Info | `/help/new-ticket` is `noindex` on purpose (it is a form). |
| Info | When a cold server runs out of file handles, Turbopack keeps failing the chunks it could not load until restart. The message-loader fix lowers the load, but the server still needs a restart in that case. |
