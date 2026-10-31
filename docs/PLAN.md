# Bayit — Phase 1 plan

Working name **Bayit (בית)**. A home-listing site for Georgia (the country) where Israeli and Jewish
owners list homes, rooms, hotels and property for sale, and Jewish travelers, families and investors
contact them directly. Phase 1 has no bookings or payments.

Decisions already made (Oct 31, 2026):

* **Backend:** PostgreSQL + Prisma. The site runs on any computer without outside accounts; in
  production the database can be on Supabase, Neon or any Postgres host. Access rules are enforced
  in the server code.
* **Maps:** Leaflet + OpenStreetMap (free, no key). Walking times are estimated from distance and
  shown as "approx.". Exact walking routes can be added later.
* **Pace:** plan, then build Phase 1 step by step, committing after each step.
* **Login:** Better Auth instead of Auth.js. It has phone codes, Google/Apple login and session
  security built in. 2-step login (an authenticator app) is our own code, and it is required for staff.
* **Shabbat times:** `@hebcal/core`, the open-source library behind hebcal.com. It runs on our own
  server, so there are no API limits and nothing breaks if hebcal.com is slow.

## 1. Site map

Every page exists in `/he`, `/en`, `/ru`, `/ar`, `/ka`. Hebrew and Arabic are right-to-left.

```
/                         Home: search bar, categories, popular cities, featured / newest /
                          recently viewed, why us, how it works, Shabbat times, safety strip
/search                   Results: grid · list · map (split view on desktop), filters, sort
  /rent /buy /hotels      shortcuts to /search with the deal type set
/listing/1234-title       Listing page (gallery, contact box, details, Jewish-friendly,
                          rules & costs, calendar, map, nearby, Shabbat times, share, report)
/owner/:id                Owner public profile
/post                     Post-a-listing wizard (10 steps, auto-saved drafts)
/login                    Google · Apple · phone code
/verify-phone, /two-factor
/account                  Dashboard
  /listings               My listings (status + actions) and /listings/:id/stats
  /favorites, /compare    Favorites with notes, compare up to 3
  /tickets, /tickets/:id  My support tickets
  /verification           Verification center (phone, ID, ownership, business)
  /settings               Language, currency, notifications, 2-step login, connected
                          accounts, download my data, delete account
/jewish-life              Map of synagogues, Chabad, kosher food, mikvaot, heritage sites;
                          Shabbat & holiday times per city; Jewish calendar
/about, /how-it-works
/safety                   Safety Center + current scam alerts
/help                     Searchable FAQ, /help/new-ticket, /contact
/legal/terms, /privacy, /cookies, /listing-rules, /accessibility
/admin                    Overview · moderation queue · reports · users · verifications ·
                          tickets · content (home, featured, cities, places, articles, FAQ,
                          translations, scam alerts, banned words) · settings · roles ·
                          audit log · email outbox
/offline, 404 and error pages
```

## 2. Database tables

**Accounts:** `User` (profile, role, status, badges, language, currency, 2-step login),
`Session`, `Account` (Google/Apple), `Verification` (phone codes), `DeviceLink` (anti-fraud),
`PhoneLookup` (VoIP check cache).

**Places:** `City`, `Neighborhood` (names in 5 languages + search text), `JewishPlace`.

**Listings:** `Listing` (every field in section 7 of the brief), `ListingTranslation` (5 languages,
auto/edited flags), `ListingPhoto` (processed photos + perceptual hash), `RoomType` (hotels),
`PriceChange` (price-drop history), `AvailabilityBlock` (calendar + iCal), `Favorite`,
`ContactClick`, `ListingStatDaily`.

**Trust & safety:** `Report`, `UserBlock`, `VerificationRequest` (documents encrypted, deleted after
review), `BannedWord`, `ScamAlert`.

**Support & content:** `Ticket`, `TicketMessage`, `SavedReply`, `FaqItem`, `Article` (Phase 2 guides).

**System:** `SiteSetting` (expiry days, Shabbat mode, thresholds…), `TranslationOverride`,
`AuditLog`, `AdminNote`, `EmailOutbox`, `ExchangeRate`, `RateLimit`.

**Planned for Phase 2:** `Promotion` (bump / featured) and `Payment` exist now. Reviews, chat and
saved searches get their tables when Phase 2 starts.

The full schema is `prisma/schema.prisma`.

## 3. Outside services and rough monthly cost

| Service | What for | Cost at launch |
|---|---|---|
| Vercel (Pro) | Hosting | $20/mo |
| Postgres: Supabase or Neon | Database + daily backups | $0 (free tier) → $19–25/mo |
| Cloudflare R2 | Photo and document storage | $0–5/mo (10 GB free, no traffic fees) |
| Cloudflare (Free) | CDN, attack protection, Turnstile CAPTCHA | $0 |
| Twilio Verify + Lookup | Phone codes (SMS/WhatsApp), VoIP detection | ≈ $0.05 per code + SMS fee by country (≈ $0.05–0.30), Lookup ≈ $0.01 — about $30–150/mo per 1,000 sign-ups |
| Google Cloud Translation | Auto-translating listings | First 500k characters/mo free, then $20 per 1M (≈ $0.16 per listing in 4 languages) |
| Resend | Email | $0 (3,000/mo) → $20/mo |
| Sentry | Error monitoring | $0 (developer plan) → $26/mo |
| Map tiles (MapTiler, Stadia or Carto) | OpenStreetMap tiles in production | $0–25/mo |
| Exchange rates (open.er-api.com) | Daily currency rates | $0 |
| Hebcal library | Shabbat and holiday times | $0 |
| Domain | | ≈ $15/yr |

**Total:** about $40–100 a month at launch, plus the per-use SMS and translation costs.

Everything except the database works without an account in development. Phone codes are printed in
the server log, emails go to a dev outbox in the admin panel, and translation is turned off.

## 4. Decisions you need to make

1. **Final name and domain.** "Bayit" is a placeholder, and the name, logo and colors are all set in `src/config/site.ts`.
2. **Country where the business is registered.** This decides the payment provider (Phase 2) and
   which privacy law is the main one (Israel, EU/UK GDPR or Georgia).
3. **Phone codes by SMS, WhatsApp or both.** WhatsApp codes are cheaper and Israelis use WhatsApp
   most. The list of countries we send codes to is in the config, as protection against SMS fraud.
4. **Admins:** who gets the Admin, Moderator, Support and Content-editor roles.
5. **Real content:** photos, the real list of synagogues, Chabad houses and kosher places (only
   admins add them), and the founders' story for the About page.
6. **People to review:** a lawyer for the legal pages and the property-buying guide, and native
   speakers to check the Georgian, Arabic and Russian text.
7. **Accounts to open before going live:** Vercel, a Postgres host, Cloudflare (R2 + Turnstile),
   Twilio, Resend, Google Cloud (Translation, plus Google login), Apple Developer (Apple login), and
   Sentry.

## 5. Build steps (Phase 1)

1. **Foundation.** Project setup, the config file, database schema, the 5 languages with RTL,
   theme (light/dark), and the layout: top bar, mobile bottom bar, footer, switchers, cookie
   banner, PWA, and the 404 and error pages.
2. **Core services.** Login (Google, Apple, phone code), 2-step login, roles, rate limits,
   CAPTCHA, formatting, currencies, Shabbat times, storage, the image pipeline, email, translation,
   the risk engine and the audit log.
3. **Demo data.** 25 demo listings in Tbilisi (Vake, Saburtalo, Old Tbilisi), Batumi, Kutaisi,
   Gudauri and Bakuriani, in 5 languages, all marked "Demo" and removable with one switch.
4. **Search.** Home page, results with filters, sort and map, and the listing card.
5. **Listing page.** Contact buttons with ready messages, the safety tip, reports and sharing.
6. **Post-a-listing wizard.** Photo processing, auto-translation, automatic checks, and
   publishing (live or in review).
7. **Dashboard.** My listings, stats, favorites, compare, tickets, the verification center and
   settings.
8. **Jewish Life, Help center and tickets, Safety Center, About, and the legal pages.**
9. **Admin panel.** Moderation, reports, users, verifications, tickets, content, settings, roles
   and the audit log.
10. **Hardening.** End-to-end tests for the "definition of done", a check at 360px in Hebrew and
    Arabic, Lighthouse, a security review with a short report, the README and the list of
    environment variables.

After each step the work is committed and pushed, with notes on how to test it.
