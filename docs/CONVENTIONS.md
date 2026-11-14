# Bayit — engineering conventions

Read this before changing code. It is the contract every part of the site follows.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, React 19), TypeScript strict |
| UI | Tailwind CSS v4 + shadcn/ui (Radix, RTL-enabled) in `src/components/ui`, Lucide icons |
| i18n | next-intl 4, routes under `src/app/[locale]`, messages in `messages/<locale>/<namespace>.json` |
| Database | PostgreSQL + Prisma 7 (`prisma/schema.prisma`, client generated to `src/generated/prisma`) |
| Auth | Better Auth (Prisma adapter, phone-number plugin, Google/Apple), own TOTP 2-step login |
| Maps | Leaflet + react-leaflet + OpenStreetMap tiles (tile URL in `src/config/site.ts`) |
| Jewish calendar | `@hebcal/core` (the library behind hebcal.com) — runs on our server, no API limits |
| Images | sharp (re-encode to WebP, strip EXIF, watermark, perceptual hash); HEIC/HEIF via heic-decode 2.1.0 (libheif-js 1.23.5, WebAssembly) on the server when the browser could not convert it. Every upload goes through `prepareUploadImage` (`src/lib/images.ts`); never pass upload bytes to sharp directly |
| Email | Resend (falls back to the dev outbox) |
| SMS / VoIP check | Twilio Programmable Messaging with our own code text (a Messaging Service; Israel and Georgia mobile numbers only; codes on screen in test mode) + Lookup. Login-code rules: `src/lib/auth/code-rules.ts` |
| Translation | Microsoft Azure AI Translator v3 (default) or Google Cloud Translation v2, behind one interface in `src/lib/translate/` (`TRANSLATE_PROVIDER`); without a key the owner's text shows with "Original in …" and a Google Translate link |
| CAPTCHA | Cloudflare Turnstile (skipped when not configured) |

Next.js 16 notes: `middleware.ts` is now `src/proxy.ts`; `params`, `searchParams`, `cookies()` and
`headers()` are async; page props can be typed with the global helpers `PageProps<"/[locale]/x">` and
`LayoutProps<"/[locale]">`. `cacheComponents` is **off** — pages that read the DB or the session are
dynamic as usual. Bundled docs: `node_modules/next/dist/docs/`.

## Golden rules

1. **No hard-coded interface text.** Every visible string comes from `messages/`. Use
   `getTranslations` (server) or `useTranslations` (client). Five languages: `he en ru ar ka`.
   Hebrew is the main language; English is the fallback for missing keys.
2. **Right-to-left works by construction.** Use logical Tailwind utilities only:
   `ms-* me-* ps-* pe-* start-* end-* text-start text-end border-s border-e rounded-s rounded-e`.
   Never `ml- mr- pl- pr- left- right- text-left text-right` (except for things that must not flip,
   like a map). Directional icons (arrows, chevrons) get `className="rtl:-scale-x-100"`.
   Carousels get `direction: dir` from `useLocale()`.
3. **LTR islands.** Phone numbers, prices, listing IDs, emails and URLs are wrapped in
   `<Ltr>` (`@/components/common/ltr`) inside text.
4. **User-written text gets `dir="auto"`** (titles, descriptions, bios, notes, ticket messages).
5. **Western digits everywhere.** Format numbers, money and dates only with `@/lib/format`
   (it forces `-u-nu-latn`). Do not use `toLocaleString`, `Intl.*` directly, or next-intl's
   `useFormatter`. In ICU plural messages write `{count}` instead of `#`.
6. **Icons:** Lucide only (plus the brand logos in `@/components/common/brand-icons`). Never emojis.
   In server components on public pages, draw Lucide icons from the sprite
   (`@/components/ds/sprite-icons`; add names in `scripts/generate-icon-sprite.mjs` and run it):
   a lucide-react icon is a client component and costs HTML, RSC data and hydration. Interactive
   parts that are hidden or far down on first paint can load later with `deferredIsland`
   (`@/components/ds/deferred-island`). Until an island hydrates, React cannot commit any
   client-side navigation, so every island also opens at the first click, key press or back/forward;
   keep that, and test a link and a filter tap on a fresh page after adding one.
   `BottomSheet` (`@/components/ds/bottom-sheet`) already loads its vaul/Radix code only when
   idle, at the first touch or when it opens; other dialogs and menus that are closed on first
   paint should load the same way (`next/dynamic`, mounted from the first opening). In client
   components import design-system parts from their own files (`@/components/ds/chip`), not from
   the `@/components/ds` barrel, which pulls every part (sheets, popovers) into the page.
   `ListingCard` takes `sizes` when the card is narrower than its grid default (carousels), and
   `deferPhoto` further down a long list (phones load that photo after the page). Decorative photos
   below the first screen go in `<AfterLoad>` (`@/components/home/after-load`). A segment's
   `not-found.tsx` is rendered into the data of every page below it: keep the site frame out of
   `app/[locale]/not-found.tsx` (public 404s get it from `(site)/` and `[...rest]/`). CSS a page
   needs for its first paint is imported from `globals.css`, not from a component (that becomes a
   separate render-blocking request); parts loaded later (maps) may import their own.
7. **Links and navigation:** import `Link`, `redirect`, `useRouter`, `usePathname` from
   `@/i18n/navigation`, never from `next/link` / `next/navigation` (except `notFound`).
8. **Server-only code** (`db`, auth, storage, email…) imports `"server-only"`. The Prisma client is
   `import { db } from "@/lib/db"`. Generated types/enums: `@/generated/prisma/client` (server) and
   `@/generated/prisma/enums` (safe for client code).
9. **Every mutation is a server action or route handler that checks the session and ownership**
   (we do not rely on database row-level security, so the check must be in code). Validate input
   with zod. Rate-limit anything public. Staff actions call `audit()`; destructive ones (ban,
   suspend, warn, reject, hide, delete, role changes, "mark reviewed") write their row with
   `auditOrThrow(entry, tx)` inside the change's transaction, so they stop when the row cannot be
   written. A session whose 2-step code is not entered yet counts as signed out everywhere
   (`requireUserForAction`; code that reads `getCurrentUser()` checks `twoFactorVerified`). **Every
   new server action or route handler gets a rule in `tests/unit/endpoints/registry.ts`**, or
   `tests/unit/endpoints/endpoint-registry.test.ts` fails.
10. **Every state is designed:** loading (skeletons, not spinners), empty, error and not-found get
    friendly text and a clear next step (`@/components/common/states`).
    Fast public pages (home, search, listing, Jewish Life, help and the other `(site)` pages without
    their own) have **no route `loading.tsx`**: React shows streamed content at least 300 ms after a
    skeleton, which made it the slowest part of the first paint. Use `<Suspense>` around a slow
    section instead. The listing page's and the booking review's skeletons are shown for taps on
    their links only, by `layout/navigation-skeleton.tsx` in the site shell (first visits get the
    page in one response).
11. **Accessibility:** semantic HTML, labels on every input, `alt` on images, visible focus, keyboard
    reachable dialogs/menus (shadcn does this), color contrast AA.
12. **Mobile first** from 360px. Test at 360px in Hebrew (RTL) and English.
13. **Config, not constants.** Brand, colors, cities, currencies, limits and paid-feature prices live
    in `src/config/site.ts`. Runtime admin settings come from `getSettings()` (`@/lib/settings`).
14. **Fair housing:** build for the community through features (kosher, Shabbat, synagogues, Hebrew).
    Never add fields that limit who may rent or buy.
15. **Never invent real-world data** (places, reviews, testimonials). Demo data is marked `isDemo`.

## Folder layout

```
src/
  app/
    [locale]/            all pages (layout sets <html lang dir>)
      (site)/…           public site pages
      account/…          user dashboard
      admin/…            admin panel (staff + 2-step login)
    api/…                route handlers (auth, uploads, media, ical, cron)
  components/
    ui/                  shadcn primitives (do not put business logic here)
    common/              shared building blocks (Ltr, states, brand icons, container…)
    layout/              header, footer, bottom nav, switchers
    listing/             listing card, price, badges, gallery…
    <feature>/           components owned by one feature
  config/site.ts         THE config file
  i18n/                  routing, navigation, request config, message loader
  lib/                   domain logic (see "Core modules")
  generated/prisma/      generated Prisma client (git-ignored)
messages/<locale>/<namespace>.json
prisma/schema.prisma, prisma/seed/
docs/
```

## Translations

* One file per namespace per language: `messages/he/search.json`, `messages/en/search.json`, … The
  file name is the namespace: `useTranslations("search")`.
* A namespace is **owned by one feature**. Do not edit another feature's namespace; put your
  strings in your own namespace even if a similar string exists elsewhere. `common` (owned by the
  layout) holds generic words (Save, Cancel, Back, Next, Close, Loading, Show more…) that anyone may
  *read*.
* All five language files of a namespace must have the same keys (`npm run i18n:check`).
* The browser only receives the text its client components read, per route
  (`src/i18n/client-messages.ts`): the root layout sends `SHELL_MESSAGES`, the (site) layout adds
  `SITE_MESSAGES`, and a route segment's layout adds `ROUTE_MESSAGES[segment]` with
  `<RouteMessages route="…">`. `/admin`, `/account`, `/post` and `/dev` mount a provider with all
  of them. When a client component on a public page reads a new namespace (or part of one), add
  it there; `npm test` (`src/i18n/client-messages.test.ts`) names what is missing.
* Styles: public pages load `src/app/globals.css`, which skips the admin, account, wizard and dev
  folders; their layouts add `src/app/sections.css`. A component used on a public page must not
  live in those folders (`src/app/stylesheets.test.ts`).
* Write real translations in all five languages (Hebrew, English, Russian, Arabic, Georgian).
  Native speakers will review before launch, so prefer clear, simple wording.
* Do not put U+2011 (non-breaking hyphen) in messages: only Rubik's Arabic face (32 KB) lists it
  (and has no glyph for it), so one such character downloads that file on any page. Use a plain hyphen.
* Database content that is translated (city names, FAQ, scam alerts…) is a JSON object
  `{ he, en, ru, ar, ka }`; read it with `pickLocalized(value, locale)` from `@/i18n/locale`.
* Listing text: the owner's original is in `Listing.title/description` (+ `originalLocale`);
  versions in every language are rows in `ListingTranslation` (`isAuto`, `editedByOwner`).

## Core modules (import paths)

| Path | What it provides |
|---|---|
| `@/config/site` | `siteConfig`, `locales`, `AppLocale`, `CurrencyCode`, `Localized` |
| `@/config/countries` | `countryConfig(code)` (time zone, map area, pin box, local currency, phone default, emergency number), `isInCountry`, `DEFAULT_COUNTRY`: THE place for per-country values (pure) |
| `@/lib/phone` | `normalizePhone(raw, defaultCountry)` → E.164 without the national 0, `whatsappHref`, `telHref`, `smsHref`, `isValidPhone`, `planPhoneFix` (clean-up dry run). Every phone save path and wa.me/tel: link uses it (client-safe) |
| `@/lib/text/emoji` | `stripTitleEmoji(title)`, `hasTitleEmoji` (titles only; descriptions keep emoji) |
| `@/lib/auth/logout` | `logOut({ homeHref, everywhere })` (client): the session ends ON THE SERVER first (`logOutHere`/`logOutEverywhere` in `@/lib/auth/logout-actions`, an error when it could not), then private device data goes (`@/lib/auth/device-data`), home with "התנתקתם". Every logout button uses it |
| `@/i18n/locale` | `isRtl`, `dirFor`, `intlLocale`, `pickLocalized`, `isAppLocale` |
| `@/i18n/navigation` | `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` |
| `@/lib/db` | `db` (Prisma client, server-only) |
| `@/lib/geo` | `haversineMeters`, `walkingMinutes`, `approximateLocation`, bounds helpers (pure) |
| `@/lib/geo/public-walk` | `publicWalkTimes` (use it in every loader), `publicWalkMinutes`, `publicNearby`, `publicKm`: every walking time leaves the server rounded UP to 5 minutes and reads "up to N" ("עד 5 דק׳", "עד 10 דק׳", never "≈"), without meters, in every page, RSC payload, JSON answer, share image and email; at most `MAX_PUBLIC_WALKS` (3) per listing in `PUBLIC_WALK_ORDER` (sea/lifts, synagogue, stop, supermarket); never a Chabad house (community map only). Distances in whole km. Filters and the synagogue sort keep using the exact stored value on the server only (security 6.d, founder's answers (2)/(3)) |
| `@/lib/log-scrub` | `scrubText`, `scrubValue`, `maskEmail`: installed on `console.*` at server start and applied to Sentry events. Still log ids only — never an email, phone, code, address or token (tests/unit/log-hygiene.test.ts checks every call) |
| `@/lib/security/taint` | `taintObject(what, row)`, `taintValue(what, lifetime, secret)`: React taint for raw rows with exact address / contacts, sessions and secret settings (`experimental.taint`). A DTO built from the fields is fine |
| `@/lib/admin/maintenance/retention` | the daily retention jobs (guest contacts 3 months after check-out, audit log 1 year, outbox 90 days…), run by `/api/cron/cleanup` |
| `@/lib/listing/fields` | vocabularies: deal/property types, amenities, Shabbat & Jewish features, contact channels, moderation reasons |
| `@/lib/format` | `formatNumber`, `formatMoney`, `formatDate`, `formatTime`, `formatDateRange`, `formatRelativeTime` (client-safe) |
| `@/lib/toast` | `toast(…)`, `toast.success/error/info/warning/message(…)` — use it instead of importing `sonner` (sonner loads after the page has started) |
| `@/lib/currency` | `getRates`, `getDisplayCurrency`, `refreshExchangeRates` (server); `@/lib/currency/convert` → `convert`, `toUsd` (client-safe) |
| `@/components/providers/currency-provider` | `CurrencyProvider`, `useCurrency()` → `{ currency, rates, convert, format }` |
| `@/lib/hebcal` | Shabbat times, holidays in a range, "is it Shabbat/holiday now", Hebrew date (server) |
| `@/lib/settings` | `getSettings()`, `updateSettings()`, `isShabbatModeActive()`, `assertNotShabbatMode()` |
| `@/lib/audit` | `audit({ actorId, action, targetType, targetId, details })` (never throws); `auditOrThrow(entry, tx)` for destructive staff actions (throws `audit_failed`) |
| `@/lib/email` | `sendEmail({ to, template, locale, data })` — templates translated via `emails` namespace |
| `@/lib/translate` | `translateText`, `translateListing(listingId)`, `scheduleListingTranslation(id, contentUpdatedAt)` (after an autosaved edit of a live listing); adapters in `@/lib/translate/{azure,google}` implement `TranslationProvider` (`./provider.ts`), picked in `./registry.ts` |
| `@/lib/site-url` | `siteUrl()`, `absoluteUrl(path)`, `isPermanentSiteUrl(url)` (client-safe): EVERY link that leaves the site (calendar export, emails, SMS, share links, sitemap, canonical) is built from `SITE_URL`; `BETTER_AUTH_URL` stays the running origin. Show copyable links with `<CopyLinkField>` (`@/components/common/copy-link-field`), which disables Copy on a temporary address |
| `@/lib/storage` | `putObject`, `getObject`, `deleteObject`, `publicUrl`, encrypted private files |
| `@/lib/crypto` | `encrypt`, `decrypt`, `hmacHash`, `randomToken` |
| `@/lib/images` | `processListingPhoto`, `processPrivateImage`, `perceptualHash`, `hammingDistance` |
| `@/lib/risk` | `assessListing(listingId)`, `scanText(text)` — automatic scam checks |
| `@/lib/rate-limit` | `rateLimit(key, { limit, windowSeconds, failOpen? })`, `assertRateLimit(...)`, `rateLimitByIp`, `assertRateLimitByIp`: **fail closed** (a broken store refuses: `{ ok: false, failed: true }` / RateLimitError); `failOpen: true` only for harmless counters (alert quotas) |
| `@/lib/site-env` | `readSiteEnv`, `siteEnv`, `isProductionSite`, `testModeAllowed`, `testModeOn`, `demoAllowed` (pure): THE place for "which kind of site is this" (`SITE_ENV`) |
| `@/lib/startup-check` | `startupProblems(env)`, `startupWarnings(env)`, `formatStartupProblems` (pure): the start-up settings rules; `src/instrumentation-node.ts` exits when a problem is listed |
| `@/config/production-hosts` | `PRODUCTION_HOSTS` (the real domain names, added on launch day), `isRealSiteHost`: development/staging never start on them, codes never show on screen for them |
| `@/lib/site-env-marker` | The real site marks its database at start (`SiteSetting` "siteEnvironment"); a development/staging server, `scripts/check-site-marker.ts` (build) and the seed refuse a marked database |
| `@/lib/security/events` | `recordSecurityEvent({ type, userId?, ip?, meta? })` (never throws, no personal data), `purgeOldSecurityEvents(now)` (90 days); types in `@/lib/security/event-types` (`SECURITY_EVENT_TYPES`; tests/unit/security-events-emitters.test.ts checks each one is recorded somewhere). Logins, refused codes, codes sent, permission denials, the first refusal of each rate-limit window, contact reveals, exports and deletions are all recorded |
| `@/lib/listing/ical-token` | `newIcalToken()` (256-bit base64url), `isStrongIcalToken()`: every listing create path and "replace calendar link" |
| `@/lib/geocode` | `geocodeAddress(query, locale)` (server): address search through OpenStreetMap Nominatim, cached, 1 request per second site-wide. The browser calls `GET /api/geocode?q=&locale=` (signed in, once per Search/Enter), never Nominatim |
| `@/lib/turnstile` | `verifyTurnstile(token)` |
| `@/lib/request` | `getClientIp()`, `getCountryCode()`, `getDeviceId()` |
| `@/lib/action` | `ActionResult<T>`, `ok()`, `fail()` helpers for server actions |
| `@/lib/auth/server` | Better Auth instance `auth` |
| `@/lib/auth/client` | `authClient`, `useSession`, `signOut` (client) |
| `@/lib/auth/session` | `getSession()`, `getCurrentUser()`, `requireUser()`, `requireStaff(permission)`: staff also need the SameSite=Strict staff cookie and lose their 2-step check after 12 idle hours (`@/lib/auth/staff-session`) |
| `@/lib/auth/fresh-proof` | `requireFreshProof(user)` before every sensitive change (contact email, phone, login methods, 2-step settings, recovery codes, deleting the account): throws `fresh_proof_required` unless a code was entered in this session in the last 5 minutes. In the browser `useFreshProof()` (`@/components/auth/use-fresh-proof`): `proof.run(action)` asks for the code and retries. After the change: `notifySecurityChange()` (`@/lib/auth/security-notices`, the OLD address is told) and `endOtherSessions()` (`@/lib/auth/account-sessions`) |
| `@/lib/auth/session-cookies` | The login cookies' names: `__Host-bayit.*` wherever they are Secure (`bayit.*` on plain-http `next dev`) |
| `@/lib/auth/permissions` | staff roles and `can(role, permission)` |
| `@/components/auth/*` | `LoginDialog`, `useRequireLogin()`, `UserMenu`, `PhoneInput` |
| `@/lib/listing/search-params` | parse/serialize search filters (shared by home search bar, search page, filters) |
| `@/lib/listing/queries` | `searchListings`, `countListings`, `getListingCards`, `getListingByPublicId`, `getSimilarListings` |
| `@/lib/listing/urls` | `listingPath(publicId, title)` → `/listing/1234-sunny-flat-in-vake` |
| `@/lib/home/history-store` | `createHistoryStore` (client): the visitor's history in localStorage, kept **only with "preferences" cookie consent** (removed on "necessary only"; its keys are in `PRIVATE_STORAGE_KEYS`, so logout clears them). Used by recently viewed and the last search (`@/lib/home/last-search-store`) |
| `@/lib/legal/*` | Terms + 18+ (`terms`: `TERMS_VERSION`, rules; `terms-server`: `requireTermsFor(userId, "booking" \| "publish", input)` in the booking and publish actions, logged in `TermsAcceptance`; bump `TERMS_VERSION` when the Terms change and everyone is asked again), the cookie list (`cookies`: **every cookie the site sets is listed there and is essential**; a new one fails `tests/unit/cookies-essential.test.ts`), the times the legal pages quote (`retention-facts`, from `@/lib/retention-times`), the accessibility coordinator setting (`accessibility`) |
| `@/lib/recently-viewed/*` | "נצפו לאחרונה": `core` (merge, limits 50 kept / 10 shown, consent rule; pure), `device` (the device copy; hooks in `@/hooks/use-recently-viewed`), `server` (`recordAccountView`, `mergeDeviceViews`, `getAccountViews`: the account copy, table `RecentlyViewed`), `client.mergeDeviceIntoAccount()` (once per tab after sign-in). `trackListingView` writes signed-in views through |
| `@/components/listing/*` | `ListingCard`, `ListingCardSkeleton`, `ListingGrid`, `Price`, `ListingBadges`, `FavoriteButton`, field icons |

## Server actions

```ts
"use server";
import { ok, fail, type ActionResult } from "@/lib/action";

export async function doThing(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();            // or requireStaff("moderation")
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.flatten().fieldErrors);
  await assertRateLimit(`thing:${user.id}`, { limit: 10, windowSeconds: 60 });
  // ownership check! e.g. where: { id, ownerId: user.id }
  …
  return ok({ id });
}
```
`fail(code)` returns a message key; show it with `t(\`errors.${code}\`)` from your namespace or
the shared `common.errors.*`.

## Roles and permissions

`UserRole`: `USER`, `ADMIN`, `MODERATOR`, `SUPPORT`, `EDITOR`. Staff must have 2-step login enabled
and verified in the current session to open `/admin`. Every admin action is written to `AuditLog`.

| Permission | ADMIN | MODERATOR | SUPPORT | EDITOR |
|---|---|---|---|---|
| moderation (listings queue) | ✓ | ✓ | | |
| reports | ✓ | ✓ | view | |
| users.view | ✓ | ✓ | ✓ | |
| users.manage (warn/suspend/ban/verify) | ✓ | ✓ | | |
| verifications | ✓ | ✓ | | |
| tickets | ✓ | | ✓ | |
| content (home, cities, places, FAQ, alerts, banned words, translations) | ✓ | | | ✓ |
| settings, roles, audit log | ✓ | | | |
| tell the host who reported (turned-away reports) | ✓ | | | |
| who sent a report (`reports.reporter`) | ✓ | | | |
| phone numbers of guests and accounts (`bookings.guest_phone`) | ✓ | | | |

Who sent a report and phone numbers are ADMIN only (founder's decision Q12): the admin queries
never read them for other staff (`@/lib/admin/staff-visibility`), so they never reach the page.
Staff other than an ADMIN never decide about their own items (a report about them or sent by them,
their own listing); nobody marks their own booking, host or guest flag reviewed.

**Booking limits and guest flags** (`@/lib/booking/guest-flags`): at most 2 upcoming bookings per
verified phone number across accounts (checked in the booking transaction); a booking attempt
carries an idempotency key, so a repeat returns the same booking. Admin → Flags lists long stays
(14+ nights) and guests with 3 cancellations in 90 days or 2 no-shows in a year FOR REVIEW ONLY
(nothing automatic; "reviewed" is an audit entry). A cancellation with `FLIGHT_CANCELLED_REASON`
or inside a travel-disruption window (`isTravelDisruptionCancellation`, false until the windows
exist) never counts. "Show contact" works for at most 40 different listings a day per account.

## Listing lifecycle

`DRAFT → (publish) → automatic checks → LIVE | IN_REVIEW`; moderator: `LIVE | NEEDS_CHANGES | REJECTED`.
Owner: `PAUSED`, `RENTED`/`SOLD`, `DELETED` (soft). Cron: `LIVE → EXPIRED` after the expiry setting
(default 60 days), with a warning email first. Enough open reports → `HIDDEN` until a moderator
checks it. The first listing of every account always goes to `IN_REVIEW`. Public pages only show
`LIVE` listings (and only `isDemo` ones while the "demo data" setting is on).

Public data never includes: `address`, `lat`, `lng`, `cadastralCode`, `contactMethods` values
(until "Show contact" by a signed-in user), documents, or anything about other users' accounts.

## Local development

```
npm ci && npm run deps:scripts  # exact locked packages; then the only install scripts we allow
cp .env.example .env            # then fill DATABASE_URL etc. (SITE_ENV="development")
npm run db:push && npm run db:seed
npm run dev                     # http://localhost:3000 (listens on 127.0.0.1 only)
```

**Which site is this?** Our own `SITE_ENV` (`development` / `staging` / `production`,
`@/lib/site-env`: `readSiteEnv`, `siteEnv`, `isProductionSite`, `testModeAllowed`, `testModeOn`,
`demoAllowed`) decides every security rule: test mode, demo logins/accounts/listings, indexing,
dev-only shortcuts. Never decide those with `NODE_ENV` (it only says `next dev` or a production
build; keep it for build and dev-tool behaviour). The server refuses to start when `SITE_ENV` is
missing or a required setting is unsafe (`src/lib/startup-check.ts`, called from
`src/instrumentation.ts`).

**Packages (supply chain):** builds and setups use `npm ci`, never `npm install` or a blind
`npm update`. `.npmrc` turns every install script off; the reviewed ones run with
`npm run deps:scripts` (`scripts/allowed-install-scripts.mjs`, checked by
`tests/unit/install-scripts.test.ts`). A new dependency needs the founder's OK first, and avoid
versions younger than about two weeks unless they are a security fix. Dependabot
(`.github/dependabot.yml`) proposes updates weekly. Lighthouse is not a dependency: run
`npx lighthouse@13.6.0 …` when measuring.
Several dev servers can run side by side: `NEXT_DIST_DIR=.next-b npx next dev -H 127.0.0.1 -p 3101` (a development server only ever listens on this machine: `npm run dev` binds 127.0.0.1).
Scripts that import server modules run with `tsx --require ./scripts/server-script.cjs` (it makes `server-only` a no-op; avoid `--conditions=react-server`, which breaks tsx on some Node 22 versions).

**Remembered devices** (`DeviceLink`, 1 year) only mean "don't send a new-device alert again" and
risk links between accounts. Nothing skips or shortens a login step because a device is known: no
"trusted device" for the 2-step code, for staff or anyone (tests/unit/no-trusted-device.test.ts).

**Login codes and SMS** go through `limitCodeSend` (`@/lib/auth/login-rate-limit`) for every code
that really goes out (login, "confirm it's you", unlock, contact address): per inbox/number, IP
(IPv6 by /64), device; counted only when sent. Paid texts also pass `@/lib/auth/sms-guard`, per
source first (account + IP block, `withSmsSource`): brake, share of the budget, trusted reserve.

Checks before you finish: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm test`.
Before a release: `npm run security:check`.
