# Bayit

Bayit (בית, "home") is a home-listing website for Georgia, the country (Tbilisi, Batumi, Kutaisi…).
Israeli and Jewish owners list apartments, houses, rooms, hotels and property for sale. Jewish
travelers, families and investors find them and contact the owner directly by WhatsApp, Telegram,
Viber, Messenger, phone or email. There are no bookings or payments in Phase 1.

* **Languages:** Hebrew (the main language), English, Russian, Arabic and Georgian. Hebrew and
  Arabic are fully right-to-left.
* **Jewish-friendly details:** kosher kitchen level, a Shabbat checklist, walking time to the nearest
  synagogue and Chabad house, Shabbat and holiday times, and holiday tips in the date picker.
* **Trust:** phone, ID and ownership verification, automatic scam checks on every listing,
  moderation, reports, and safety tips at the moment of contact.

"Bayit" is a working name. The name, logo, colors, cities, currencies, limits and paid-feature
prices are all in **`src/config/site.ts`**. The logo files are in `public/brand/`.

| Document | What's in it |
|---|---|
| `docs/BRIEF.md` | The product brief |
| `docs/PLAN.md` | Site map, database tables, outside services and costs, open decisions |
| `docs/CONVENTIONS.md` | Engineering rules (read before changing code) |
| `docs/DEMO-DATA.md` | Demo listings and demo logins |
| `docs/SECURITY-REPORT.md` | Security review and anything still open |
| `docs/PHASE1-STATUS.md` | Phase 1 checked against the brief: what is done, what is open, how to test |

---

## 1. Run it on your computer

You need **Node.js 20.9+** (22 recommended) and **PostgreSQL 14+**. Docker is not required.

```bash
git clone <this repo> bayit && cd bayit
npm install                      # also generates the database client
cp .env.example .env             # then fill the 5 required values (see below)
npm run db:push                  # creates the tables
npm run db:seed                  # cities, FAQ, banned words + demo listings and demo users
npm run dev                      # http://localhost:3000
```

Generate the secrets in `.env` like this:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -hex 16      # HASH_SALT
```

### Logging in during development

Phone codes are **not sent by SMS** until Twilio is configured. The code is printed in the terminal
where `npm run dev` runs, and the login page shows it too. Demo users (see `docs/DEMO-DATA.md`):

| Phone | Role |
|---|---|
| +995 555 000 001 | Admin |
| +995 555 000 002 | Moderator |
| +995 555 000 003 | Support |
| +995 555 000 004 | Content editor |
| +995 555 000 011 – 016 | Demo owners |
| +995 555 000 021 | Demo guest |

Staff must use 2-step login (an authenticator app) to open `/admin`. To skip it **in
development only**, set `DEV_SKIP_STAFF_2FA="true"` in `.env`. It is ignored in production.

Emails are not sent until Resend is configured. You can read them under **Admin → Email outbox**.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm run preview` | Production build, then serve it on port 3000 (the real speed) |
| `npm run check` | Typecheck + lint + translation check + unit tests |
| `npm run i18n:check` | Checks that all 5 languages have the same text keys |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run db:seed` | Seed or refresh demo data (safe to run again) |
| `npm run demo:remove -- --yes` | Delete all demo data permanently |
| `npm run db:studio` | Browse the database |

### End-to-end tests

The Playwright tests in `tests/e2e/` walk through the "Definition of done" (brief, section 15):
languages and right-to-left, guest search and WhatsApp contact, posting a listing, moderation,
reports, tickets, scam checks, favorites, Jewish Life, help and the contact form.

1. Local database with demo data (`npm run db:seed`), demo data visible, and
   `DEV_SKIP_STAFF_2FA="true"` in `.env`. No Twilio: the tests read login codes from
   `GET /api/dev/last-otp`.
2. `npm run test:e2e` — starts a development server on port 3601 (build folder `.next-3601`), or
   reuses one already running there. One file: `npx playwright test tests/e2e/guest.spec.ts`.
   Report: `npx playwright show-report`; traces of failed tests are in `test-results/`.

The tests create their own users (phones `+995 555 99x xxx`) and listings named "E2E …", and
delete them, with the demo listings' view and contact counters, when the run ends.

### Demo data: one switch

All demo listings, users and places are marked **Demo**. Before launch, either:

* hide them: **Admin → Settings → Show demo data** (off), or
* delete them for good: **Admin → Settings → Delete all demo data**, or `npm run demo:remove -- --yes`.

---

## 2. See it on your phone

**Quickest: GitHub Codespaces.** It needs only your GitHub account. The real website, with its own
database and the demo data, starts in a free cloud computer, and you open it in your phone's
browser. Logging in works, because the code is shown on screen. Step-by-step guide:
**[docs/CODESPACES.md](docs/CODESPACES.md)**.

In a codespace:
* `bash .devcontainer/start.sh` starts the site (and reloads missing or expired demo data).
* **Feel the real speed on your phone:** `bash .devcontainer/start-prod.sh` stops the development
  server, builds the site for production (a few minutes), serves it on the same port 3000 and
  prints the address to open. Development mode compiles every page on its first visit
  ("Compiling…", "Rendering…"), so only this mode shows how fast the site really is. Back to
  development: `bash .devcontainer/start.sh`. On your own computer: `npm run preview`.
* Map key: add a Codespaces secret named `NEXT_PUBLIC_MAP_TILE_KEY` (or set it in `.env`); see
  [docs/CODESPACES.md](docs/CODESPACES.md#map-key-so-the-maps-show-streets).

**A public preview on Vercel (about 20 minutes, free accounts):**


You can do all of this from a phone browser.

1. **Database:** sign up at [neon.tech](https://neon.tech) (free) → create a project → copy the
   connection string (it starts with `postgresql://`).
2. **Hosting:** sign up at [vercel.com](https://vercel.com) with your GitHub account → **Add New →
   Project** → import this repository.
3. Before you press Deploy, open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string |
   | `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY` | two different random strings of 32+ characters (any password generator) |
   | `HASH_SALT` | another random string |
   | `CRON_SECRET` | another random string |
   | `DB_PUSH_ON_BUILD` | `true` (creates the tables) |
   | `SEED_ON_BUILD` | `true` (loads the demo listings) |

4. Deploy. Vercel gives you an address like `https://bayit-xyz.vercel.app`. Add two more
   variables with that address, `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL`, then redeploy
   (**Deployments → ⋯ → Redeploy**).
5. Open the address on your phone. In the browser menu choose **Add to Home Screen** to install it
   like an app.
6. Vercel deploys the repository's default branch. To preview this work branch, either merge it, or
   set **Settings → Git → Production Branch** to `claude/website-build-jm62em`.

In a preview, **browsing works right away**. Two things need one more service:
* **Logging in:** phone codes need Twilio. A free [Twilio trial](https://www.twilio.com/try-twilio)
  sends codes to your own verified phone. Create a Verify service and add `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`.
* **Uploading photos** in the post wizard needs Cloudflare R2 storage (see step 2 of "Going live").

Turn `DB_PUSH_ON_BUILD` and `SEED_ON_BUILD` off once the preview is set up.

## 3. Going live (simple steps)

1. **Database.** Create a Postgres database on [Supabase](https://supabase.com) or
   [Neon](https://neon.tech). Copy its connection string into `DATABASE_URL`. Turn on daily
   backups (both offer them).
2. **Storage for photos and documents.** Create two buckets in
   [Cloudflare R2](https://developers.cloudflare.com/r2/): one **public** (listing photos) and one
   **private** (ID documents, ticket screenshots). Fill in the `S3_*` variables and set
   `STORAGE_DRIVER="s3"`. Private files are encrypted before they are uploaded.
3. **Hosting.** Import the repository into [Vercel](https://vercel.com). Add every environment
   variable from your `.env`, with your real domain in `NEXT_PUBLIC_SITE_URL` and
   `BETTER_AUTH_URL`. The build command is `npm run build`. The scheduled jobs in `vercel.json`
   (exchange rates, expiring listings, iCal sync, cleanup) start automatically; set `CRON_SECRET`.
4. **Create the tables** in the production database once: `DATABASE_URL=<prod url> npx prisma db push`
   (or `npx prisma migrate deploy` if you use migrations). Then
   `DATABASE_URL=<prod url> npm run db:seed` to load cities, FAQ and banned words. Remove the demo
   data afterwards, as described above.
5. **Phone codes.** Create a [Twilio Verify](https://www.twilio.com/docs/verify) service and fill
   in `TWILIO_*`. In the Twilio console, turn on **Fraud Guard** and allow only the countries you
   need (this protects against SMS-pumping fraud). The list of countries we send codes to is also in
   `src/config/site.ts` → `phone.smsAllowedCountries`.
6. **Google and Apple login.** Create OAuth credentials and fill in `GOOGLE_*` / `APPLE_*`. The
   redirect URL is `https://<your domain>/api/auth/callback/google` (or `/apple`).
7. **Email.** Create a [Resend](https://resend.com) account, verify your domain, and fill in
   `RESEND_API_KEY` and `EMAIL_FROM`.
8. **Auto-translation.** Enable the Cloud Translation API in Google Cloud, create an API key
   restricted to it, and set `GOOGLE_TRANSLATE_API_KEY`.
9. **Cloudflare.** Put the domain behind Cloudflare (CDN and attack protection). Create a
   **Turnstile** widget and fill in the two `TURNSTILE` keys.
10. **Map tiles.** The maps use [CARTO basemaps](https://carto.com/basemaps) (light: Voyager,
    dark: Dark Matter), free for commercial use up to 1M tile requests a month. Get a key at
    https://carto.com/basemaps/apikey, set `NEXT_PUBLIC_MAP_TILE_KEY`, and in the CARTO dashboard
    restrict the key to your production domain and `*.app.github.dev`. The provider and key live
    in one file, `src/config/map.ts`: to switch providers later, add one entry there and set
    `NEXT_PUBLIC_MAP_TILE_PROVIDER`. Never use `tile.openstreetmap.org` (its policy forbids apps).
11. **First admin.** Log in once with your phone, then promote yourself in the database:
    `UPDATE "User" SET role = 'ADMIN' WHERE "phoneNumber" = '+972…';`. Open `/admin`. It asks you to
    set up 2-step login, and after that you can give roles to others in **Admin → Roles**.
12. **Before announcing:** have a lawyer review the legal pages, have native speakers review the
    Georgian, Arabic and Russian text, replace the demo data with real content, and read
    `docs/SECURITY-REPORT.md`.

---

## 4. Environment variables

**Required** in every environment:

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SITE_URL` | Public address, e.g. `https://bayit.example` (no trailing slash) |
| `BETTER_AUTH_SECRET` | Signs login sessions (`openssl rand -base64 32`) |
| `APP_ENCRYPTION_KEY` | Encrypts ID documents and 2-step secrets (`openssl rand -base64 32`) |
| `HASH_SALT` | Salt for hashing IPs and device ids in logs (`openssl rand -hex 16`) |

**Optional.** Each has a safe fallback in development:

| Variable | Meaning | Without it |
|---|---|---|
| `BETTER_AUTH_URL` | Auth base URL | Uses `NEXT_PUBLIC_SITE_URL` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login | Button hidden |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | Apple login | Button hidden |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Phone codes via Twilio Verify | Code printed in the server log (dev) |
| `TWILIO_VERIFY_CHANNEL` | `sms` or `whatsapp` | `sms` |
| `TWILIO_LOOKUP_ENABLED` | VoIP-number check during the scam checks | Off |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending email | Saved to the dev outbox only |
| `SUPPORT_EMAIL` | Address shown on Contact and Help | `support@bayit.example` |
| `STORAGE_DRIVER` | `local` or `s3` | `local` (folder `./storage`) |
| `STORAGE_LOCAL_DIR` | Folder for local storage | `./storage` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_PUBLIC_URL`, `S3_FORCE_PATH_STYLE` | S3-compatible storage (Cloudflare R2, Supabase, AWS) | — |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | Public base URL of uploaded photos | `/api/media/` |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile CAPTCHA | CAPTCHA skipped |
| `GOOGLE_TRANSLATE_API_KEY` | Auto-translating listings | Listings show in the original language |
| `NEXT_PUBLIC_MAP_TILE_KEY` | CARTO map tiles key (see "Going live", step 10) | Maps show pins on a plain background and "Map key missing" (dev) / "map unavailable" (production) |
| `NEXT_PUBLIC_MAP_TILE_PROVIDER` | Tile provider in `src/config/map.ts` | `carto` |
| `EXTRA_ALLOWED_ORIGINS` | Extra hosts/origins allowed to open the site and log in (e.g. a tunnel) | Codespaces and localhost are allowed automatically in development |
| `OVERPASS_ENABLED`, `OVERPASS_URL` | Nearby supermarkets and transport from OpenStreetMap | On, public Overpass server |
| `CRON_SECRET` | Protects the scheduled jobs (`/api/cron/*`) | Jobs refuse to run in production |
| `CLIENT_IP_HEADER` | Trusted header with the visitor IP (e.g. `cf-connecting-ip`) | Standard proxy headers |
| `MALWARE_SCAN_URL`, `MALWARE_SCAN_TOKEN` | External malware scanner for uploads | Built-in checks only |
| `SENTRY_DSN` (+ optional `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`) | Error monitoring: server crashes, failed actions and failed scheduled jobs go to Sentry (no SDK; path without query, no user data) | Errors only in the server log |
| `DEV_SKIP_STAFF_2FA` | Skip staff 2-step login (development only) | Off; ignored in production |
| `NEXT_DIST_DIR` | Separate build folder (only for running several dev servers) | `.next` |

---

## 5. How it is built

Next.js 16 (App Router), TypeScript, Tailwind CSS v4 and shadcn/ui (RTL), next-intl (`/he /en /ru
/ar /ka` URLs with hreflang), PostgreSQL with Prisma 7, Better Auth (phone code, Google, Apple) plus
our own 2-step login, Leaflet with OpenStreetMap, `@hebcal/core` for Shabbat and holiday times,
sharp for photos (re-encoded, location data removed, watermarked, fingerprinted), Resend, Twilio,
Google Cloud Translation and Cloudflare Turnstile. It installs as an app on phones (PWA).

```
src/app/[locale]/(site)   public site, account dashboard, post wizard
src/app/[locale]/admin    admin panel (staff + 2-step login)
src/app/api               auth, uploads, media, iCal, cron jobs
src/components            UI (ui/ = shadcn primitives)
src/lib                   domain logic: listing lifecycle, risk checks, search, email…
src/config/site.ts        the one config file
messages/<lang>/*.json    all interface text, 5 languages
prisma/schema.prisma      database schema; prisma/seed = demo data
```

Interface text is in `messages/`. Admins can also override any text from **Admin → Content →
Translations** without a deploy.
