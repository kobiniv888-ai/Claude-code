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

> **Trying the site in the Codespace — one command, one link.** The codespace starts the fast
> version (production mode) by itself when it opens. To start it (again) by hand, or after a
> `git pull`, run this in the Codespace terminal:
>
> ```bash
> bash .devcontainer/start-prod.sh
> ```
>
> Then open the address it prints at the end, the one ending in **`-3000.app.github.dev/he`**
> (for example `https://<your-codespace-name>-3000.app.github.dev/he`). It builds only when the code
> changed (3–5 minutes; otherwise it starts in seconds), serves the site on port 3000 and
> prepares the photos in the background. Logging in works (codes on screen). If a page shows a
> strip **"גרסת פיתוח (איטית)"**, you are on the slow development version: run the command above.
> Development version (hot reload, for programmers): `bash .devcontainer/start.sh --dev`. On your
> own computer: `npm run preview`. Details: [docs/CODESPACES.md](docs/CODESPACES.md).

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
npm ci && npm run deps:scripts   # exact locked packages, then the allowed install scripts (+ database client)
cp .env.example .env             # then fill the required values (see below); SITE_ENV="development"
npm run db:push                  # creates the tables
npm run db:seed                  # cities, FAQ, banned words + demo listings and demo users
npm run dev                      # http://localhost:3000 (listens on 127.0.0.1 only)
```

The server checks its settings when it starts and **refuses to start** (exit code 1, with the
list of what to fix) when `SITE_ENV` is missing or a required setting is missing or unsafe
(`src/lib/startup-check.ts`; run the same check by hand: `npx tsx scripts/check-startup-env.ts`).

### Installing packages

`.npmrc` sets `ignore-scripts=true`: no package runs its own install script (the npm worms of
2025 spread that way), not even our `postinstall`. After every `npm ci` or `npm install`, run
`npm run deps:scripts`: it runs only the reviewed install scripts in
`scripts/allowed-install-scripts.mjs` (Prisma's engine download) and then `prisma generate`.
`tests/unit/install-scripts.test.ts` fails when a package with a new install script appears.
Builds always use `npm ci` (the codespace scripts, Vercel's `installCommand`), never
`npm install` or a blind `npm update`. Ask the founder before adding a dependency. Lighthouse is
not a dependency: measure with `npx lighthouse@13.6.0 …`.

Generate the secrets in `.env` like this:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY (a different key)
openssl rand -hex 16      # HASH_SALT
```

### Logging in during development

The login offers Google (when `GOOGLE_*` is set), a **code by email** (always) and — in test mode
only — a **code by phone**. Test mode is `AUTH_TEST_MODE="true"` on a development or staging site
(`SITE_ENV`; `.env.example` has both for development): without Resend/Twilio nothing is sent and
the login form shows the code on screen (the server log masks codes, emails and phone numbers:
`src/lib/log-scrub.ts`). Without test mode no code
is ever shown, also under `npm run dev`; the real site (`SITE_ENV=production`) refuses to start
with test mode on. New accounts give
their first name in one short step. Demo users log in with the phone code ("Log in with a phone
code (test mode)" under the email form; see `docs/DEMO-DATA.md`):

| Phone | Role |
|---|---|
| +995 555 000 001 | Admin |
| +995 555 000 002 | Moderator |
| +995 555 000 003 | Support |
| +995 555 000 004 | Content editor |
| +995 555 000 011 – 016 | Demo owners |
| +995 555 000 021 | Demo guest |

Staff must use 2-step login (an authenticator app such as Google Authenticator) to open `/admin`.
`DEV_SKIP_STAFF_2FA="true"` in `.env` skips it **for the demo staff accounts only, on a
development server (`npm run dev`) of a development site**; a real staff account always needs its
code, a production build ignores it, and staging/production refuse to start with it.
Demo staff accounts can open the admin panel only on localhost or a Codespaces address, never on the
site's permanent address (`src/lib/auth/staff-access.ts`).

Emails are not sent until Resend is configured. You can read them under **Admin → Email outbox**.

### Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / run it |
| `npm run preview` | Production build, then serve it on port 3000 (the real speed) |
| `npm run check` | Typecheck + lint + translation check + unit tests |
| `npm ci && npm run deps:scripts` | Install exactly the locked packages, then the allowed install scripts (see "Installing packages") |
| `npx tsx scripts/check-startup-env.ts` | The server's start-up settings check, by hand (exit 1 + the list of problems) |
| `npm run security:check` | Before a release and on launch day: `npm audit --omit=dev` (fails on high/critical), Next.js/React at or above the patched floor, every locked package at least 14 days old unless listed with a reason in `scripts/package-age-allow.json` (security upgrades only), plus a reminder to read the Next.js/React advisories. `-- --skip-age` works offline but counts as a failure |
| `npm run ical:backfill-tokens -- --dry-run` / without the flag | Replace old, guessable calendar export tokens with 256-bit ones (idempotent) |
| `npm run i18n:check` | Checks that all 5 languages have the same text keys |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run db:seed` | Seed or refresh demo data (safe to run again) |
| `npm run demo:remove -- --yes` | Delete all demo data permanently |
| `npm run admin:grant -- --from-env` | Make the account in `BAYIT_ADMIN_EMAIL` / `BAYIT_ADMIN_PHONE` the admin (logged; refuses demo accounts; silent while unset). `--email` / `--phone` work too |
| `npm run db:backup` | Full database backup to `backups/<time>/` (also **Admin → Maintenance**) |
| `RESTORE_TARGET_URL=<empty database url> npm run db:restore -- backups/<time> --create-schema` | Restore a backup into a new, empty database (refuses one with rows) |
| `npm run cleanup -- <name> --dry-run` / `--run` | Data clean-ups (phones, title emojis, contact taps, ID files); `--run` needs a backup from the last hour |
| `npm run db:studio` | Browse the database |

### End-to-end tests

The Playwright tests in `tests/e2e/` walk through the "Definition of done" (brief, section 15):
languages and right-to-left, guest search and WhatsApp contact, posting a listing, moderation,
reports, tickets, scam checks, favorites, Jewish Life, help and the contact form.

1. Local database with demo data (`npm run db:seed`) and demo data visible. No Twilio: the tests
   read login codes from `GET /api/dev/last-otp`. Staff tests log in with real 2-step login: the
   test setup creates a test admin with an authenticator secret and computes its codes (no
   shortcut flag is needed or used).
2. `npm run test:e2e` — starts a development server on port 3601 (build folder `.next-3601`), or
   reuses one already running there. One file: `npx playwright test tests/e2e/guest.spec.ts`.
   Report: `npx playwright show-report`; traces of failed tests are in `test-results/`.
3. **Production mode** (what each phase is checked with): build, start the production server with
   login test mode on, and point the tests at it:

   ```
   NEXT_DIST_DIR=.next-4615 NEXT_PUBLIC_SITE_URL=http://localhost:4615 BETTER_AUTH_URL=http://localhost:4615 npx next build
   NEXT_DIST_DIR=.next-4615 NEXT_PUBLIC_SITE_URL=http://localhost:4615 BETTER_AUTH_URL=http://localhost:4615 SITE_ENV=development AUTH_TEST_MODE=true CRON_SECRET=e2e-only-cron-secret npx next start -p 4615
   E2E_PORT=4615 npx playwright test
   ```

   (`CRON_SECRET`: the host-stats test runs the weekly email through its cron route. Without a
   `CRON_SECRET` in `.env`, the tests use `e2e-only-cron-secret`, so the server needs the same.)

   In production the login library allows 10 phone-login requests a minute per address, and every
   test runs from the same one: the tests wait the seconds the server names and try again, so a
   full run takes a few minutes longer than against the development server. Our own HOURLY
   login-request limits (20 code requests an hour per address) are too few for a whole run from
   one address: when the server answers `RATE_LIMITED`, the test helper clears those hourly
   windows in the local test database and asks again (`tests/e2e/helpers/auth.ts`, test-only; the
   server has no bypass). Booking tests use a fresh test guest each (at most 2 upcoming bookings
   per phone).
4. **Refuse-to-start probes** against the same production build (the port must be free):
   `npx tsx tests/startup/next-start-probes.ts --dist .next-4615 --port 4615`. It checks that
   `next start` exits when `SITE_ENV` is missing, test mode is on with `SITE_ENV=production` or a
   secret is missing, and that complete fake production settings start without demo listings,
   codes on screen or demo logins. `npm test` runs the same start-up hook every time
   (`tests/unit/startup-refuse.test.ts`).

The tests create their own users (phones `+995 555 99x xxx`) and listings named "E2E …", and
delete them, with the demo listings' view and contact counters, when the run ends.

### Demo data: one switch

All demo listings, users and places are marked **Demo**. On the real site (`SITE_ENV=production`)
they are always hidden and demo accounts cannot sign in, whatever the admin switch says; on
development and staging sites the switch decides. Before launch, either:

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
* **The fast version (production mode), one command:** `bash .devcontainer/start-prod.sh` stops
  the development server, builds the site for production (3–5 minutes), serves it on the same port
  3000, prints the address to open and prepares the photos in the background. Development mode
  compiles every page on its first visit ("Compiling…", "Rendering…"), so only this mode shows how
  fast the site really is. Back to development: `bash .devcontainer/start.sh --dev`. On your own
  computer: `npm run preview`.
* Map key: add a Codespaces secret named `NEXT_PUBLIC_MAP_TILE_KEY` (the codespace reads it from
  its environment; real keys never go into `.env`); see
  [docs/CODESPACES.md](docs/CODESPACES.md#map-key-so-the-maps-show-streets).
* The codespace is a **development site** (`SITE_ENV=development`, set in `.env` by
  `.devcontainer/env-sync.sh`): test mode and demo data are allowed there, never on the real site.
* Your admin account: see "Going live", step 11 (three private Codespaces secrets).

**A password-protected test site (staging)** comes with the next brief (on Netlify): it builds
with `NODE_ENV=production`, runs with `SITE_ENV=staging` and may use test mode behind its password.
A staging site must pass the same start-up check as the real site (https address, TLS database,
`CRON_SECRET`, Turnstile keys — Cloudflare's test keys are fine there — S3 storage, its own VAPID
pair), except that with `AUTH_TEST_MODE=true` it needs no email or SMS provider.

**Vercel:** a deployment on Vercel's production environment (`VERCEL_ENV=production`) is the real
site: it only starts with `SITE_ENV=production` and every production setting (section 4). There is
no "quick preview" on a public address any more: test mode and demo accounts never run on one.

## 3. Going live (simple steps)

1. **Database.** Create a Postgres database on [Supabase](https://supabase.com) or
   [Neon](https://neon.tech). Copy its connection string into `DATABASE_URL`. Turn on daily
   backups (both offer them).
2. **Storage for photos and documents.** Create two buckets in
   [Cloudflare R2](https://developers.cloudflare.com/r2/): one **public** (listing photos) and one
   **private** (ID documents, ticket screenshots). Fill in the `S3_*` variables and set
   `STORAGE_DRIVER="s3"`. Private files are encrypted before they are uploaded.
3. **Hosting.** Import the repository into [Vercel](https://vercel.com) (`vercel.json` installs
   with `npm ci && npm run deps:scripts`; the build, `npm run vercel-build`, first runs the
   start-up settings check and stops when something is missing). In **Settings → Environment
   Variables** add the production variables of section 4 one by one. **Never copy your `.env`
   or anything from the codespace:** generate every secret fresh on the hosting
   (`BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `FIELD_ENCRYPTION_KEY`, `HASH_SALT`, `CRON_SECRET`, a new VAPID pair —
   development and production never share a key), and never set the development-only flags
   (`AUTH_TEST_MODE`, `DEV_SKIP_STAFF_2FA`, `NEXT_PUBLIC_SHOW_DEV_UI`, `EXTRA_ALLOWED_ORIGINS`):
   the real site refuses to start with them. Set `SITE_ENV="production"` and your real domain in
   `SITE_URL`, `NEXT_PUBLIC_SITE_URL` and `BETTER_AUTH_URL` (the same https address visitors
   open, with or without `www`). **Without `SITE_URL` the real site does not start**; only
   requests to its host are indexed, every other address says "noindex". On your own server
   behind a reverse proxy, pass the original `Host` (or `X-Forwarded-Host`) header through. The
   scheduled jobs in `vercel.json` (exchange rates, expiring listings, iCal sync, cleanup) start
   automatically with `CRON_SECRET`. Use Node.js 22.12 or newer (staging and production refuse
   to start on older Node). Add the real domain(s) to `src/config/production-hosts.ts`: a
   development or staging server on those names then refuses to start, and no login code is
   ever shown on screen for them.
4. **Create the tables** in the production database once (by hand: with `SITE_ENV=production`
   the build refuses `DB_PUSH_ON_BUILD` / `SEED_ON_BUILD`). First make the two database roles
   ([docs/DATABASE_ROLES.md](docs/DATABASE_ROLES.md): `bayit_app` for the site, `bayit_migrate`
   for table changes), then `MIGRATION_DATABASE_URL=<bayit_migrate url> npx prisma db push`
   (or `npx prisma migrate deploy` if you use migrations), with the address given for that one
   command and never saved into a `.env` file. Then
   `SITE_ENV=production DATABASE_URL=<prod url> npm run db:seed` to load cities, FAQ and banned
   words. With `SITE_ENV=production` the seed adds no demo users, staff, listings or scam alert;
   neither does a `SITE_ENV=development` that comes only from `.env` when the database is not on
   this machine (`prisma/seed/demo-decision.ts`). When the real site first starts it marks its
   database ("siteEnvironment" in `SiteSetting`): from then on a staging, preview or development
   server, build or seed refuses to run on it (`src/lib/site-env-marker.ts`).
5. **Phone codes** (only for bookings and a host's phone check, once per number — not a login on
   the real site). Create a Twilio **Messaging Service** and fill in `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN` and `TWILIO_MESSAGING_SERVICE_SID` (the site makes the code and sends its own
   text; Twilio Verify is not used). In the Twilio console, allow only Israel and Georgia in the
   Messaging geo permissions. **SMS Pumping Protection for Programmable Messaging** has a Basic
   tier that is on by default and a paid Advanced tier (see `OWNER_TODO.md`, your decision). The
   list of countries we send codes to is also in `src/config/site.ts` → `phone.smsAllowedCountries`. Without it, the phone check says "not
   available yet".
6. **Google and Apple login.** Create OAuth credentials and fill in `GOOGLE_*` / `APPLE_*`. The
   redirect URL is `https://<your domain>/api/auth/callback/google` (or `/apple`); after Google
   the visitor lands on `/login`, which asks a new account for its first name and then continues.
7. **Email** (also the email login codes). Create a [Resend](https://resend.com) account, verify
   your domain, and fill in `RESEND_API_KEY` and `EMAIL_FROM`. Never set `AUTH_TEST_MODE` here
   (the real site refuses to start with it).
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
11. **First admin (only the founder's account).** The admin account and the alert address are
    PRIVATE settings: never put the email or phone in code, docs, tests or commits.
    1. Sign in on the site once with the account that should be the admin (Google or an email
       code; phone login is off on the real site). The account must exist before it can be made
       admin.
    2. **In the codespace**, add three Codespaces secrets on github.com → your picture →
       **Settings → Codespaces → Secrets → New secret** (give each one access to this repository):
       - `BAYIT_ADMIN_EMAIL`: the email of that site account (or `BAYIT_ADMIN_PHONE`: its phone in
         international format, `+972…`; the email is used first when both are set)
       - `ADMIN_ALERT_EMAIL`: where admin alerts and the daily summary go (a different address)

       Then restart the codespace (or run `bash .devcontainer/start.sh`): the codespace puts the
       secrets in its environment (they are never copied into `.env`) and
       `npm run admin:grant -- --from-env` makes the account admin. It prints only a masked address (`s•••@g•••.com`), refuses demo accounts, writes the
       change to the audit log, and says nothing while the secrets are empty or the account does
       not exist yet (sign in, then run `npm run admin:grant -- --from-env` again).
    3. **On the real host**, put the same names in its environment settings and run
       `npm run admin:grant -- --from-env` once with that database's `DATABASE_URL` (or
       `--email …` / `--phone …` directly).
    4. Open `/admin`: it asks you to scan a QR code with **Google Authenticator** (2-step login is
       required for the admin, also in the codespace) and to keep the backup codes. After that you
       can give roles to others in **Admin → Roles**. The demo staff accounts never open the panel
       on the site's permanent address.
12. **Before announcing:** have a lawyer review the legal pages, have native speakers review the
    Georgian, Arabic and Russian text, replace the demo data with real content, and read
    `docs/SECURITY-REPORT.md`.

---

## 4. Environment variables

The server checks these when it starts and **refuses to start** when one is missing or unsafe
(`src/lib/startup-check.ts`, called from `src/instrumentation.ts`; `npx tsx
scripts/check-startup-env.ts` runs the same check). `next build` itself does not need `SITE_ENV`
(only `SITE_ENV=production` additionally needs `NEXT_PUBLIC_MEDIA_BASE_URL` at build time, for the
image settings); the server it builds does, and `npm run vercel-build` checks before building.

**Required** in every environment:

| Variable | Meaning |
|---|---|
| `SITE_ENV` | Which kind of site this is: `development` (your computer, the codespace), `staging` (the password-protected test site) or `production` (the real site). It decides test mode, demo data, indexing and the rules below — never `NODE_ENV` |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_SITE_URL` | Public address, e.g. `https://bayit.example` (no trailing slash) |
| `BETTER_AUTH_URL` | The address the site runs on (the same as `NEXT_PUBLIC_SITE_URL` on staging and production) |
| `BETTER_AUTH_SECRET` | Signs login sessions, 32+ random characters (`openssl rand -base64 32`) |
| `APP_ENCRYPTION_KEY` | Encrypts ID documents and 2-step secrets: 32 bytes in base64 (`openssl rand -base64 32`) |
| `FIELD_ENCRYPTION_KEY` | Encrypts the exact addresses, pins and guests' phones in the database: 32 bytes in base64, a key of its own. Required on staging and production (development falls back to a key derived from `BETTER_AUTH_SECRET`). Losing it loses those values; rotation with `FIELD_ENCRYPTION_KEY_PREVIOUS`: `docs/security/field-encryption.md` |
| `HASH_SALT` | Salt for hashing IPs and device ids in logs, 16+ characters (`openssl rand -hex 16`); the three secrets must differ |

**Also required on staging and production** (`SITE_ENV=staging` / `production`), generated fresh
on the hosting, never copied from a codespace: https addresses on one origin (no localhost or
Codespaces address); `DATABASE_URL` with `sslmode=require`; `CRON_SECRET` (32+ characters);
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`; `RESEND_API_KEY` + `EMAIL_FROM`;
`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_MESSAGING_SERVICE_SID` (or
`TWILIO_FROM_NUMBER`); `STORAGE_DRIVER="s3"` with the `S3_*` keys, two different buckets and
`NEXT_PUBLIC_MEDIA_BASE_URL` = `S3_PUBLIC_URL` (https); `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (a
new pair per site). Staging with `AUTH_TEST_MODE=true` may leave out the email and SMS keys.
**Production only:** `SITE_URL` (the same https origin; only its host is indexed by Google), no
`AUTH_TEST_MODE`, no `EXTRA_ALLOWED_ORIGINS`, no Cloudflare test keys; `SECURITY_CONTACT_EMAIL`
(private: the address in `/.well-known/security.txt`); `SENTRY_DSN` (EU region); the weekly
encrypted off-site backup: `BACKUP_ENCRYPTION_KEY` + `OFFSITE_S3_ENDPOINT`, `OFFSITE_S3_REGION`,
`OFFSITE_S3_BUCKET`, `OFFSITE_S3_ACCESS_KEY_ID`, `OFFSITE_S3_SECRET_ACCESS_KEY`
([docs/BACKUPS.md](docs/BACKUPS.md)); `DATABASE_URL` as the least-privilege role `bayit_app`, never
the owner ([docs/DATABASE_ROLES.md](docs/DATABASE_ROLES.md)). **Never on staging or
production:** `DEV_SKIP_STAFF_2FA`, `NEXT_PUBLIC_SHOW_DEV_UI`, or any secret from a codespace (the
codespace marks its own keys with `bayit-dev-` / `BAYITDEV`, and staging and production refuse to
start with a marked key).

| Variable | Meaning |
|---|---|
| `SITE_URL` | **On the real site:** its permanent address, e.g. `https://bayit.ge`. Outgoing links are built from it, and only its host is indexed by Google (any other host, and every development or staging site, says "noindex") |

**Optional.** Each has a safe fallback in development:

| Variable | Meaning | Without it |
|---|---|---|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google login | Button hidden |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | Apple login | Button hidden |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` + `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`) | Text messages (`sendSms`): phone codes (our own text; bookings, host phone check) and booking texts, Israel and Georgia mobile numbers only | Codes on screen in test mode; "not available yet" on the real site; other texts only logged |
| `AUTH_TEST_MODE` | Test mode: login codes on screen, only with `SITE_ENV` development (localhost / this codespace) or staging (its own address). The real site refuses to start with it | Off: no codes on screen, also under `npm run dev` |
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
| `EXTRA_ALLOWED_ORIGINS` | Extra hosts/origins allowed to open the site and log in (e.g. a tunnel); refused on the real site | This codespace's own address and localhost are allowed automatically on development sites |
| `OVERPASS_ENABLED`, `OVERPASS_URL` | Nearby supermarkets and transport from OpenStreetMap | On, public Overpass server |
| `CRON_SECRET` | Protects the scheduled jobs (`/api/cron/*`); required (32+ characters) on staging and production | Jobs refuse to run |
| `CLIENT_IP_HEADER` | Trusted header with the visitor IP: `cf-connecting-ip` whenever Cloudflare proxies the site (on Vercel too), `x-nf-client-connection-ip` on Netlify. Required off Vercel on staging/production (the server refuses to start) | Vercel's own header (Vercel only, nothing in front) |
| `MALWARE_SCAN_URL`, `MALWARE_SCAN_TOKEN` | External malware scanner for uploads | Built-in checks only |
| `SENTRY_DSN` (+ optional `SENTRY_RELEASE`) | Error monitoring: server crashes, failed actions and failed scheduled jobs go to Sentry (no SDK; path without query, no user data, messages scrubbed; environment = `SITE_ENV`). **Required on the real site**, in Sentry's EU region | Errors only in the server log |
| `MIGRATION_DATABASE_URL` | Only for changing the tables (`prisma db push`, `npm run db:encrypt-fields`): the role `bayit_migrate` ([docs/DATABASE_ROLES.md](docs/DATABASE_ROLES.md)). Never set on the running site | `DATABASE_URL` does both (development) |
| `MAINTENANCE_MODE` | `on`: every public page answers a calm "back soon" page (503) in 5 languages; only an admin with 2-step login gets through (Admin → Maintenance has the same switch). See `INCIDENT_PLAN.md` | Off |
| `ADMIN_ALERT_TELEGRAM_CHAT_ID` | PRIVATE: the Telegram chat for the hourly security alerts | The admins who connected the bot |
| `OFFSITE_RETENTION_DAYS` | How long each off-site backup copy stays locked | 60 |
| `DEV_SKIP_STAFF_2FA` | Skip 2-step login for the demo staff accounts (a development server of a development site only; never for a real account) | Off; ignored by production builds; staging/production refuse to start with it |
| `BAYIT_ADMIN_EMAIL`, `BAYIT_ADMIN_PHONE` | PRIVATE: the account `npm run admin:grant -- --from-env` makes admin (also at every codespace start); Codespaces secrets of the same names | Nobody is made admin |
| `ADMIN_ALERT_EMAIL` | PRIVATE: where admin alerts and the daily summary go (a Codespaces secret of the same name) | The real admins' email addresses, else the outbox |
| `BACKUP_DIR` | Folder for full backups (Admin → Maintenance, `npm run db:backup`) | `./backups` (git-ignored) |
| `NEXT_DIST_DIR` | Separate build folder (only for running several dev servers) | `.next` |

---

## 5. How it is built

Next.js 16 (App Router), TypeScript, Tailwind CSS v4 and shadcn/ui (RTL), next-intl (`/he /en /ru
/ar /ka` URLs with hreflang), PostgreSQL with Prisma 7, Better Auth (phone code, Google, Apple) plus
our own 2-step login, Leaflet with OpenStreetMap, `@hebcal/core` for Shabbat and holiday times,
sharp for photos (re-encoded, location data removed, watermarked, fingerprinted), heic-decode
(libheif in WebAssembly) for iPhone HEIC photos that the browser could not convert itself (see
"Image uploads" below), Resend, Twilio, Google Cloud Translation and Cloudflare Turnstile. It
installs as an app on phones (PWA).

### Image uploads

Every upload field offers JPEG, PNG and WebP, so an iPhone sends JPEG on its own. A HEIC file that
still arrives is converted to JPEG in the browser where it can be decoded (Safari;
`src/lib/media-client.ts`), otherwise on the server: `prepareUploadImage` in `src/lib/images.ts`
decodes it with **heic-decode 2.1.0** (ISC; it uses **libheif-js 1.23.5**, LGPL-3.0, WebAssembly,
no install scripts, loaded only on that path and kept out of the bundle by `serverExternalPackages`)
and hands the raw pixels to sharp, so no EXIF, GPS, XMP or maker notes survive. Limits: the file
size, at most 50 megapixels (checked before decoding), 40 HEIC decodes per user per hour, one
decode at a time per server. AVIF and GIF are refused. `tests/fixtures/heic/gps-photo.heic` (made
by `make-gps-heic.mjs` next to it) is a fake iPhone photo with GPS that the tests use to prove
every stored image is clean.

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
