# Integration log — Phase A (2026-10-31)

All Phase 1 parts were checked together after the parallel build: checks, seed, production
build, a browser pass in every language, signed-in flows and a security sanity check.

## Result

| Check | Result |
|---|---|
| `npx prisma generate`, `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings (was 707 errors / 8,105 warnings, almost all from build folders) |
| `npm run i18n:check` | 33 namespaces × 5 languages, all keys match |
| `npm test` | 48 files, 632 tests pass |
| `npm run db:seed` (twice) | succeeds; row counts identical after the second run (idempotent) |
| `next build` (Turbopack) | succeeds with no warnings |
| Browser pass, production (`next start`) | 5 languages × 360 px and 1440 px: `/`, `/login`, `/verify-phone`, `/two-factor/setup`, `/does-not-exist`. No page errors, no failed requests, no CSP violations, no horizontal overflow |

## What was fixed

1. **Lint scope** (`eslint.config.mjs`). The extra build folders from side-by-side servers
   (`.next-*`), the generated Prisma client, local storage, test output and `.claude/` were
   being linted. They are now ignored.
2. **shadcn carousel** (`src/components/ui/carousel.tsx`). Fixed the React Compiler lint error
   "setState in effect". The component now reads Embla's state on render and re-renders on its
   events. It also unsubscribes from `reInit`, which it previously never did.
3. **Georgian hydration errors** (`src/lib/format.ts` + new `src/lib/format-georgian.ts`).
   Chrome ships without Georgian locale data, so `Intl` falls back to English there while Node
   prints Georgian. Every `/ka` page with a price or date failed hydration ("75 $" on the server
   vs "$75" in the browser). Georgian is now formatted the same way in every engine:
   - numbers with Russian separators, which are the same as Georgian;
   - dates in British English order, with Georgian month and weekday names filled in;
   - relative times built from the CLDR wording.

   Date output also normalizes thin and narrow no-break spaces. This fixes the Node/Chrome
   difference in `formatDateRange` that the wizard engineer reported. Tests are in
   `src/lib/format-georgian.test.ts`.
4. **Calendar `data-day`** (`src/components/ui/calendar.tsx`). It used `toLocaleDateString`,
   which also breaks hydration in Georgian. It now uses `day.isoDate`. The now-unused `locale`
   prop was removed from `CalendarDayButton`, along with its two callers in
   `src/components/search/holiday-calendar.tsx`.
5. **`?next=` lost on layout redirects** (`src/proxy.ts`). `requireUser`/`requireStaff` fall back
   to an `x-pathname` request header, but the proxy never set it. Signed-out visitors to
   `/account/*` landed on `/login` with no way back. The proxy now sets the header.
   `src/app/[locale]/admin/layout.tsx` no longer forces `next=/admin`, so deep links like
   `/admin/moderation` survive login.
6. **Session errors swallowed during render** (`src/components/layout/site-shell.tsx`). The
   `getCurrentUser().catch()` caught Next's internal dynamic-rendering signal. That produced
   dozens of "[layout] could not read the session" errors in every build. It now calls
   `unstable_rethrow` first.
7. **`next/image` `fill` warning on every card** (`src/components/listing/photo-carousel.tsx`).
   The image's parent link is now `relative`.
8. **Whole-project file tracing** (`src/lib/storage/local.ts`). Dynamic `fs` paths under
   `process.cwd()` made Turbopack trace the whole repository into the server build (3 build
   warnings). The storage root is now marked `turbopackIgnore`.
9. **429 on `/api/auth/get-session`** (`src/lib/auth/server.ts`). Better Auth limits every
   endpoint to 100 requests per 10 s per IP in production. The browser reads the session on
   every page, so visitors sharing a carrier or office IP could get errors and a signed-out
   flash. `get-session` is now exempt; it only reads the caller's own cookie. Sign-in and
   login-code limits are unchanged.
10. **Test data**:
    - Deleted the leftover `wiztest-tbilisi` / `wiztest-batumi` cities and their 3
      neighborhoods. They showed up as duplicate Tbilisi/Batumi entries in popular cities,
      suggestions and the sitemap, and no listing used them.
    - Removed my own test sessions, contact clicks and safety-tip flags.
11. **`tsconfig.json`** restored to the committed version. It had picked up stale `.next-3401`
    entries from dev servers.

## What was checked

- **Root redirect**: `/` with `Accept-Language: he` → `/he`; `fr` → `/en`; `ru`, `ar`, `ka` →
  their own languages (307).
- **Signed-out pages**:
  - `/verify-phone` and `/two-factor/setup` → `/login`.
  - `/account`, `/account/listings`, `/post` and `/admin/moderation` → `/login?next=…`.
  - `/does-not-exist` → designed 404 page in every language.
- **Login (dev server, dev code flow)**:
  - Demo guest, owner and admin logged in through `/login` with the code from `/api/dev/last-otp`.
  - The header showed the user menu each time.
- **Signed in as guest and owner**:
  - `/search`: filters and price sort; the map view had markers.
  - Listing page: Show contact → WhatsApp → safety tip → `wa.me/<owner>?text=…` with the
    ready message, including the listing ID.
  - `/post`, `/account` and `/account/listings` load.
  - `/admin` returns 404 for non-staff, by design.
- **Demo admin** (`DEV_SKIP_STAFF_2FA=true`): `/admin` and `/admin/moderation` load.
- **RTL**: full-page screenshots of `/he` and `/ar` at 360 px and 1440 px. The layout, header
  order, arrows, carousels, price isolation and footer columns are mirrored correctly, with
  nothing overlapping.
- **Security**:
  - `/api/media`: `../`, `%2e%2e` and `..%2F` traversal attempts → 404; `private/…` → 404;
    unknown key → 404.
  - `/api/uploads/listing-photo`, `/api/uploads/private`, `/api/account/*`,
    `/api/admin/documents/*` and `/api/tickets/attachment?key=…` → 401 when signed out.
  - All 4 `/api/cron/*` routes → 401 with no secret, with a wrong bearer token, or with
    `?secret=` in production.
  - `/api/dev/last-otp` → 404 in production.
- **PWA**: `/manifest.webmanifest`, `/sw.js` and `/offline.html` → 200 with the right content
  types.

## What remains (decisions for the owners)

- **Status codes under streaming.** `(site)/loading.tsx` starts every response as `200`. So
  `notFound()` on a missing listing or owner page gives a 200 with an injected
  `noindex` (also for bots), and a wrong listing slug is fixed by a client-side redirect plus
  the canonical link. Search engines will not index those pages.
  - Real 404/308 codes would need one of two changes: drop the group-level and
    listing/owner `loading.tsx` skeletons, or check existence in `proxy.ts` (a database query
    per request). This is the layout owner's call. Moving `notFound()` into
    `generateMetadata` was tried and does not help, because the group-level boundary
    streams first.
- **Georgian numbers inside translated messages.** next-intl formats `{count}` arguments with
  `Intl` itself. Numbers ≥ 1,000 in Georgian can still differ between server and Chrome. Pass
  numbers through `formatNumber` (most namespaces already do) when a count can be that large.
  The same applies to `Intl.DisplayNames` in `phone-input.tsx` (country names) and
  `listing-page/helpers.ts` (language names): Chrome shows them in English for `ka`.
- **Service-worker font preload notice.** On 404 pages Chrome logs "A preload … is not used
  because it is a cross-world service worker resource mismatch". It is informational; the font
  loads normally.
- **Edits to live listings go public before the checks re-run** (reported by the wizard
  engineer). This needs a "last checked" field or a scheduled re-check, which is a schema
  decision for the lifecycle owner.
- **Sitemap size.** The sitemap is a single file capped at 9,000 listings. It needs a sitemap
  index before that size.
- **Dev login on other ports.** Start the dev server with `BETTER_AUTH_URL` and
  `NEXT_PUBLIC_SITE_URL` set to that port, otherwise the phone login returns 403.
