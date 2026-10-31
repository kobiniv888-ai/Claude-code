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
| Images | sharp (re-encode to WebP, strip EXIF, watermark, perceptual hash) |
| Email | Resend (falls back to the dev outbox) |
| SMS / VoIP check | Twilio Verify + Lookup (falls back to a dev code in the server log) |
| Translation | Google Cloud Translation v2 (falls back to "not translated yet") |
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
7. **Links and navigation:** import `Link`, `redirect`, `useRouter`, `usePathname` from
   `@/i18n/navigation`, never from `next/link` / `next/navigation` (except `notFound`).
8. **Server-only code** (`db`, auth, storage, email…) imports `"server-only"`. The Prisma client is
   `import { db } from "@/lib/db"`. Generated types/enums: `@/generated/prisma/client` (server) and
   `@/generated/prisma/enums` (safe for client code).
9. **Every mutation is a server action or route handler that checks the session and ownership**
   (we do not rely on database row-level security, so the check must be in code). Validate input
   with zod. Rate-limit anything public. Staff actions call `audit()`.
10. **Every state is designed:** loading (skeletons, not spinners), empty, error and not-found get
    friendly text and a clear next step (`@/components/common/states`).
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
* The browser only receives the namespaces its client components read: public pages get every
  namespace except `SECTION_ONLY_NAMESPACES` in `src/i18n/client-messages.ts` (admin, wizard,
  dashboard, legal, emails…); `/admin`, `/account` and `/post` mount a provider with all of them.
  If a client component on a public page starts reading one of those namespaces, remove it from
  that list.
* Write real translations in all five languages (Hebrew, English, Russian, Arabic, Georgian).
  Native speakers will review before launch, so prefer clear, simple wording.
* Database content that is translated (city names, FAQ, scam alerts…) is a JSON object
  `{ he, en, ru, ar, ka }`; read it with `pickLocalized(value, locale)` from `@/i18n/locale`.
* Listing text: the owner's original is in `Listing.title/description` (+ `originalLocale`);
  versions in every language are rows in `ListingTranslation` (`isAuto`, `editedByOwner`).

## Core modules (import paths)

| Path | What it provides |
|---|---|
| `@/config/site` | `siteConfig`, `locales`, `AppLocale`, `CurrencyCode`, `Localized` |
| `@/i18n/locale` | `isRtl`, `dirFor`, `intlLocale`, `pickLocalized`, `isAppLocale` |
| `@/i18n/navigation` | `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` |
| `@/lib/db` | `db` (Prisma client, server-only) |
| `@/lib/geo` | `haversineMeters`, `walkingMinutes`, `approximateLocation`, bounds helpers (pure) |
| `@/lib/listing/fields` | vocabularies: deal/property types, amenities, Shabbat & Jewish features, contact channels, moderation reasons |
| `@/lib/format` | `formatNumber`, `formatMoney`, `formatDate`, `formatTime`, `formatDateRange`, `formatRelativeTime` (client-safe) |
| `@/lib/currency` | `getRates`, `getDisplayCurrency`, `refreshExchangeRates` (server); `@/lib/currency/convert` → `convert`, `toUsd` (client-safe) |
| `@/components/providers/currency-provider` | `CurrencyProvider`, `useCurrency()` → `{ currency, rates, convert, format }` |
| `@/lib/hebcal` | Shabbat times, holidays in a range, "is it Shabbat/holiday now", Hebrew date (server) |
| `@/lib/settings` | `getSettings()`, `updateSettings()`, `isShabbatModeActive()`, `assertNotShabbatMode()` |
| `@/lib/audit` | `audit({ actorId, action, targetType, targetId, details })` |
| `@/lib/email` | `sendEmail({ to, template, locale, data })` — templates translated via `emails` namespace |
| `@/lib/translate` | `translateText`, `translateListing(listingId)` |
| `@/lib/storage` | `putObject`, `getObject`, `deleteObject`, `publicUrl`, encrypted private files |
| `@/lib/crypto` | `encrypt`, `decrypt`, `hmacHash`, `randomToken` |
| `@/lib/images` | `processListingPhoto`, `processPrivateImage`, `perceptualHash`, `hammingDistance` |
| `@/lib/risk` | `assessListing(listingId)`, `scanText(text)` — automatic scam checks |
| `@/lib/rate-limit` | `rateLimit(key, { limit, windowSeconds })`, `assertRateLimit(...)` |
| `@/lib/turnstile` | `verifyTurnstile(token)` |
| `@/lib/request` | `getClientIp()`, `getCountryCode()`, `getDeviceId()` |
| `@/lib/action` | `ActionResult<T>`, `ok()`, `fail()` helpers for server actions |
| `@/lib/auth/server` | Better Auth instance `auth` |
| `@/lib/auth/client` | `authClient`, `useSession`, `signOut` (client) |
| `@/lib/auth/session` | `getSession()`, `getCurrentUser()`, `requireUser()`, `requireStaff(permission)` |
| `@/lib/auth/permissions` | staff roles and `can(role, permission)` |
| `@/components/auth/*` | `LoginDialog`, `useRequireLogin()`, `UserMenu`, `PhoneInput` |
| `@/lib/listing/search-params` | parse/serialize search filters (shared by home search bar, search page, filters) |
| `@/lib/listing/queries` | `searchListings`, `countListings`, `getListingCards`, `getListingByPublicId`, `getSimilarListings` |
| `@/lib/listing/urls` | `listingPath(publicId, title)` → `/listing/1234-sunny-flat-in-vake` |
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
npm install
cp .env.example .env            # then fill DATABASE_URL etc.
npm run db:push && npm run db:seed
npm run dev                     # http://localhost:3000
```
Several dev servers can run side by side: `NEXT_DIST_DIR=.next-b npx next dev -p 3101`.
Scripts that import server modules run with `tsx --conditions=react-server`.

Checks before you finish: `npm run typecheck`, `npm run lint`, `npm run i18n:check`, `npm test`.
