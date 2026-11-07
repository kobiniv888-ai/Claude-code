# Round 3: final check

Round 3 is built: the fixes from your phone recording, a lighter home page, the price guide, the
mistake check and the stats for hosts, the admin panel, the trip page, shared lists, the walk to
the sea and the lifts, price alerts, real reviews, "turned away?" reports, the "ביקרנו במקום"
badge, booking by room type for hotels, and the city pages and Google basics. Each phase has its
own summary in `docs/round-3/phase-1.md` … `phase-6.md`.

This final check was made on 7 November 2026 on a production build (the fast version, the way
visitors will get it), at 390×844 in Hebrew (light and dark), at 1440×900 in English and at 360 px
in Georgian.

**In short:** every "Done when" item is met except one. All 131 end-to-end tests (every test of
section 13 among them) passed in one clean run in production mode, and every automatic check is
green. Lighthouse on a phone is close but not 90 on every run: the home page scored between 89 and
93 in 18 runs (90 or more in 15), the city page 92–93, a listing 88–92 and search 81–88. The
numbers, the reason and the next step are below.

## "Done when" (brief section 13), item by item

| | Item | Where it is proven |
|---|---|---|
| ✓ | **Post form:** every bug in section 2 is fixed | `docs/round-3/phase-1.md` ("The bugs", 2.1–2.10, with screenshots). Tests: `post-form.spec.ts` (2.2), `owner-admin.spec.ts` "a new user signs up, posts a listing with photos and it goes into review" (2.7, the "פרסום" button), `platform.spec.ts` (2.5 phone format, 2.8 prices per language, 2.9 logout), and the unit tests `site-url.test.ts` (2.1), `listing-page/headline.test.ts` (2.3), `geocode/core.test.ts` (2.6) and `wizard/patch.test.ts` (2.2, an empty step never wipes a saved answer). |
| ✓ | **Post form:** going back never loses answers | `post-form.spec.ts` "post form: every step filled, back to step 1 and forward again, a reload in the middle — nothing is lost". |
| ✓ | **Post form:** the calendar never takes a host out of the form | Phase 1: the calendar opens in a full-screen sheet over "הזמנות ומחיר", "סיום" returns to the same step, and pages reachable from the form have "חזרה למודעה" (`docs/round-3/phase-1.md`, 2.10, with screenshots). |
| ✓ | **Logout:** anyone can log out | `platform.spec.ts` "log out from the account page: home with 'You're logged out', private device data gone; log in again" and "log out of all devices ends every session of the account". |
| ✓ | **Home page:** first-time visitors see a short home page, returning visitors see their recent places at the top | `phase2.spec.ts` "a first visit: hero and search card, promise line, chips, recommended, cities, how it works, host card, footer — and no Jewish life card" and "a returning visitor: the last search and recently viewed, “ניקוי”, …"; `home.spec.ts` (4 tests). |
| ✓ | **Hosts:** they see the price guide, the mistake check and their stats; guests never see these | `price-guide.spec.ts` (2 tests, "… only to the host"), `mistake-check.spec.ts` (5 tests), `host-stats.spec.ts` "views count once a day, never the host's; the card, the stats page and the weekly email show them". |
| ✓ | **Guests:** a guest can book, see the trip page, cancel, report a host, and leave a review after the stay | `booking.spec.ts` (2 tests), `trip-page.spec.ts` (2 tests), `hotel-booking.spec.ts`, `reports.spec.ts`, `phase3.spec.ts` (turned-away report from a cancelled booking), `reviews.spec.ts`. |
| ✓ | **Admin:** the panel handles listing reviews, reports, flags, badges, community places and reference prices | `phase3.spec.ts` (listing review, the "דורש טיפול" counts, the "ביקרנו במקום" badge, who decides, every admin page answers "not found" to non-staff), `admin.spec.ts` (3 tests), `owner-admin.spec.ts` (3 tests), `reviews.spec.ts` (hiding a review), `staff-login.spec.ts` (the real 2-step login); flags, community places and reference prices also in the unit tests (`src/lib/admin/*.test.ts`, `src/lib/admin/content/content.test.ts`) and the phase-3 screenshots. |
| ✓ | **Google:** the city pages exist, and demo listings and non-production addresses are never indexed | `city-pages.spec.ts` (5 tests) and `seo.spec.ts` (10 tests); the real site's rules in the unit tests `tests/unit/seo-proxy.test.ts`, `seo-production-db.test.ts` and `seo-metadata.test.ts`. |
| ✓ | **Finish:** all the tests above pass | All 131 end-to-end tests passed in production mode in one clean run (6.5 minutes), nothing re-run, none skipped, staff on the real 2-step login; every test of section 13 is in the table below. Plus 2,434 unit tests. |
| ✗ | **Finish:** Lighthouse mobile scores 90 or more in production | Almost. Home `/he`: 89–93 in 18 runs, 90 or more in 15 (two of the three 89s came right after a build or the test run, while the machine was still busy). City page 92, 93, 93. A listing 92, 91, 88. Search 81, 88, 87. See "Lighthouse" below. |
| ✓ | **Finish:** `OWNER_TODO.md` is up to date | Rewritten in this check: the ten items of brief section 11 in the same order, then the keys the real site needs. |

## The tests of section 13, one by one

All in `tests/e2e/`, run in production mode in the one clean run described below.

| # | Brief | Spec and test |
|---|---|---|
| 1 | Post form: every step, back to step 1 and forward, reload in the middle — nothing lost | `post-form.spec.ts` › "post form: every step filled, back to step 1 and forward again, a reload in the middle — nothing is lost" |
| 2 | Booking: a guest books a demo short stay with the itemized total and lands on the trip page; the host sees it and the dates are blocked; the guest cancels | `booking.spec.ts` › booking › "guest books free nights → confirmation, trips, host list and calendar, iCal → guest cancels" (demo short stay 91; the itemized lines "$70 × שני לילות" and "דמי ניקיון"; lands on `/he/account/trips/BT-…`, the trip page; the host's list and calendar; the guest cancels and the nights are free again). Also "holiday price and weekly discount: the itemized lines from the review page to the booking (brief 6.3)" and `trip-page.spec.ts` › "Friday-night stay: total, address, Maps/Waze, candle lighting, safety note, .ics, offline, not found for others, cancel". |
| 3 | A "turned away" report appears in the admin panel | `reports.spec.ts` › turned-away report › "the demo guest reports the host from the listing menu, and it waits in the admin queue as urgent"; `phase3.spec.ts` › "turned-away report from a cancelled booking (brief 8.2, test 13.3)" › "the guest reports with a screenshot from “הנסיעות שלי”; the admin sees it urgent, with the guest's choice, date and booking" |
| 4 | The admin approves a host's first listing, and the host's email is in the outbox | `phase3.spec.ts` › "listing review (brief 9, test 13.4)" › "a host's first listing waits for review; the admin approves it and the host's email is in the outbox" |
| 5 | Log out, then log in again | `platform.spec.ts` › "log out from the account page: home with 'You're logged out', private device data gone; log in again" |
| 6 | A shared list opens for someone logged out | `shared-list.spec.ts` › "a shared list: share, open logged out, copy, stop sharing" |
| 7 | Price guide: "not enough data" with the real listings, a range with test-only data | `price-guide.spec.ts` › price guide › "with the real listings it says there aren't enough similar places" and "with test-only places it shows a range and where the host's price sits, only to the host" (the test-only places are removed afterwards) |
| 8 | Rotation 390×844 → 844×390 → 390×844, the layout comes back | `bugs.spec.ts` › "rotating the phone (8.4)" › "portrait → landscape → portrait keeps the phone layout" for `/he`, `/he/search` and `/en/listing/104` |
| + | City pages (brief 10) | `city-pages.spec.ts` › city pages (5 tests) |
| + | Google basics (brief 10) | `seo.spec.ts` (10 tests) |

## Automatic checks

All green, in production mode where it applies:

- database schema check (`prisma validate`), type check (`tsc`), code check (`eslint .`, no
  problems), translation check (49 groups × 5 languages, all keys match), and 2,434 unit tests in
  230 files
- the demo data reloaded (`npm run db:seed`) before the run
- production build (`next build`, 1 min 19 s)
- **end-to-end tests: 131 passed, 0 failed, 0 flaky, 0 skipped**, in one run of 6.5 minutes with
  retries off, against `next start` with the test login codes on screen, staff logging in with a
  phone code and a real authenticator code
- afterwards: no test accounts, listings, bookings, reports or sessions left in the database

## Lighthouse (phone setting, production)

Lighthouse 12.8.2 (the copy in the project), phone preset (simulated slow 4G and a 4× slower
processor), on `next start` on this machine, port 4694. Each run is one page load; "fresh start"
means the server was just started, with no warm-up by us and no prepared photos.

**Home page `/he`** (the brief's measure). The set asked for (one run right after a fresh start,
then four after a warm-up) was made on a quiet machine: **92**, then **93, 90, 89, 92**. All runs:

| When | Scores | Notes |
|---|---|---|
| Fresh start, machine quiet | 91, 91, 92 | The server prepares the home page and its first photos by itself right after it starts. |
| Fresh start, machine still busy (right after the build / right after the test run) | 89, 89 | The page work was the same; the browser's own work took longer (blocking time ~200 ms instead of ~120 ms). |
| After a warm-up, three sets | 91, 92, 93, 92 · 93, 90, 89, 92 · 92, 92, 91, 92, 91 | |

18 runs: 89 three times, 90 once, 91 five times, 92 seven times, 93 twice. The layout never moved
(layout shift 0 in every run). First paint 1.4 s; the first card photo (the largest paint) 3.0–3.7 s.

**Other pages** (3 runs each, after a warm-up):

| Page | Scores |
|---|---|
| `/he/batumi/short-stays` | 92, 93, 93 |
| A listing, on its own address (`/he/listing/89-…`) | 92, 91, 88 |
| The same listing through the short address `/he/listing/89` (it forwards to the one above) | 79, 84, 84 |
| `/he/search` | 81, 88, 87 |

**Why some runs are under 90.** Lighthouse doesn't measure a real slow phone: it loads the page on
this machine and then simulates a slow phone from what it saw. When the page arrives very fast, all
of its scripts (about 240 KB on the home page) have arrived before the first photo is painted, and
the simulation then counts them before that photo: 3.7 s instead of about 3.2 s, and 89 instead of
92. On search and listings there is more script, so the effect is bigger. The phase-6 speed work
(the first screen waits for the first card, photos lower on the page load later, the server warms
itself after a start, ~41 KB less on every page) moved the home page from 85–91 to 89–93; the next
step is to send less script before the first screen, which is a larger change than a final check
should make. The real site, on a server with HTTP/2 and a CDN, should also be measured with
PageSpeed Insights once it is online (`OWNER_TODO.md`, "Speed").

## What this check fixed

Nothing in the site's code needed a change: the checks, the 131 tests and the screenshots
(390×844 in Hebrew light and dark, 1440×900 in English, 360 px in Georgian: the home page, the
Batumi city page, "דירות לטווח קצר בבטומי", an empty city page, a demo listing) showed no problem
that needed fixing now. This check:

- rewrote `OWNER_TODO.md` so it follows brief section 11 exactly (the ten items, in order, with
  their numbers), then the keys the real site needs (`SITE_URL`, then Resend and Google as your
  answer 9 asks, then the rest), and took out what is done
- wrote `docs/round-3/phase-6.md` and this file
- privacy check of every file in the project (no personal email address or phone number of yours
  anywhere): one test used a phone number that looks like a real Tbilisi landline; it now uses an
  obviously made-up one (`src/lib/admin/content/content.test.ts`)
- checked `robots.txt` and `sitemap.xml` both on a test address (everything "noindex", no sitemap
  line) and on an address set up as the real site (a sitemap line, the admin and account pages
  closed, no "noindex" on public pages, "noindex" on a demo listing and on any other address)

## Still open

- **Lighthouse is not 90 on every run** (above). Next round: less script before the first screen,
  then measure the real site with PageSpeed Insights.
- **Google indexes nothing yet:** not until `SITE_URL` is the real domain, and each city page only
  once it has 3 real listings (demo listings never count). Then Search Console (item 10).
- **Texts waiting for you:** the city-page texts (item 8), the footer line (item 7), the how-it-works
  page, the About page story and your name, the Help FAQ. The Russian, Arabic and Georgian texts are
  our translations; a native speaker's read is welcome. In Georgian at 360 px the hotels type is cut
  with "…" in its chip on city pages (a shorter Georgian name would fix it).
- **Your listings 43 and 44** are on your codespace's database, not on the test one; they wait for
  you (items 2 and 3).
- **Emails stay in the admin outbox** until Resend is set; scheduled emails run only on the real
  site (`CRON_SECRET`); share links and calendar links work only on the real domain.
- **Reviews can't be tried with demo data** (demo listings never get reviews); they were tested with
  test-only stays.
- **Hiding a host's reply on its own** needs a database change; for now the admin hides the whole
  review.
- **When the map background can't load,** its notice sits in the middle of the map and can cover a
  pin (the pins still work).
- Smaller open items from earlier phases are in `docs/round-3/phase-1.md` … `phase-5.md` ("Open
  issues").

## Your next steps, in order

1. **Domain and hosting** (`OWNER_TODO.md`, item 1). Buy the domain and choose hosting (A by
   default). Tell us the domain.
2. **The keys the real site needs** (`OWNER_TODO.md`, "Keys the real site needs"), in this order:
   `SITE_URL`, Resend (email), Google login, `CRON_SECRET`, Telegram, the map key, Twilio (SMS),
   and the Azure translator key (item 5). Without Resend or Google nobody can log in, and without
   `SITE_URL` Google indexes nothing.
3. **Your admin account** through the private settings (item 4), then Google Authenticator.
4. **The data clean-ups** in Admin → תחזוקה, in the codespace, before the data moves.
5. **Your listings 44 and 43** (items 2 and 3).
6. **Read and approve:** the footer line (item 7), the city-page texts (item 8), the how-it-works
   page, the About page story with your name, and the Help FAQ.
7. **Once the site is live:** Google Search Console with the sitemap (item 10), PageSpeed Insights
   on the real address, and the first Sunday's weekly host email.
8. **When you have time:** reference prices (item 9), real community places with their check
   dates, the lawyer's review of the Terms and the Privacy policy, and the company details.
