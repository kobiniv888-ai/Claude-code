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
| High | **Performance below 90 on mobile (61–80).** The remaining cost is main-thread work: hydration of about 2,000 DOM nodes (listing cards are ~110 nodes each: 6 carousel slides, dots, badges), Embla setting up on every card, the Suspense reveal of `loading.tsx` (React waits at least 300 ms after the skeleton, then restyles the whole page), and relayouts when fonts swap in. Next steps: render only the first carousel slide and start Embla on interaction; show fewer cards on the home page; try `experimental.inlineCss`; measure on the real host (HTTP/2, CDN). |
| Medium | **One "₾" downloads 168 KB of font.** The lari sign is only in Noto Sans latin-ext, a 168 KB variable file. "≈" pulls the Arabic and Georgian symbol faces (+41 KB). `/he` and search download 254 KB of fonts. Options: put a script font's smaller latin-ext face first in the stack, or a `local()` symbol face for U+20BE/U+2248. This needs a design decision. |
| Low | **Listing SEO 92 in Lighthouse.** Next 16 streams listing metadata after the shell for user agents that are not on its bot list, and Lighthouse 12 no longer sends "Chrome-Lighthouse". Real crawlers (Googlebot renders JS; WhatsApp, Facebook, Telegram, Twitter, Slack and Discord are on Next's bot list) get it in `<head>`. Viber is not on that list; add it with `htmlLimitedBots` if Viber previews matter. |
| Low | Short or old listing slugs redirect on the client (meta refresh, status 200) because the page streams behind `loading.tsx`. Internal links always use the canonical slug. |
| Low | The zod `jitless` switch relies on zod's shared config global (`globalThis.__zod_globalConfig`). Check that it still exists when zod is upgraded. |
| Info | `/help/new-ticket` is `noindex` on purpose (it is a form). |
| Info | When a cold server runs out of file handles, Turbopack keeps failing the chunks it could not load until restart. The message-loader fix lowers the load, but the server still needs a restart in that case. |
