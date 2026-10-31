# Phase 1 — status against the brief

*Checked on 31 October 2026, against `docs/BRIEF.md`. Written for the founders: what is finished,
what is partly finished, what waits for Phase 2, and how to try each thing yourself.*

## In one paragraph

Everything the brief lists for Phase 1 is built and working on the local copy of the site, with two
exceptions that need more than a quick fix: **mobile speed** (Google Lighthouse scores 71–85, the
brief asks for 90+) and **a few protections that only switch on with outside services** (CAPTCHA
keys, a malware scanner, error-monitoring account, backups, Cloudflare). The other open points are
small and listed at the end.

**Final check (31 October 2026, after the second speed pass and the security follow-ups): all
green.** The database schema check, type check, lint, translation check (33 groups × 5 languages),
659 unit tests, the production build and all 45 end-to-end tests (which walk through the brief's
"Definition of done") pass, and an accessibility scan (WCAG 2.1 A/AA) finds 0 problems on the home
page, the Arabic search, a listing, My account and the admin moderation queue on a 360 px phone.
Mobile Lighthouse Performance: home 81–83, search 77–78, listing 71–77, Jewish Life 75–79, help
82–85 (52–66 before the speed pass; target 90+).

**Status words used below**

| Word | Meaning |
|---|---|
| **Done** | Built and checked in the browser. |
| **Partial** | Works, but one part is missing or needs an outside service — see "Known gaps". |
| **Phase 2** | The brief puts it in Phase 2. The database and screens are prepared; the feature is switched off. |

**How to try things.** Run the site (README, step 1) and open `http://localhost:3000`. Sign in at
`/login` with a demo phone number; in development the 6-digit code appears on the login form.

| Who | Phone |
|---|---|
| Admin | +995 555 000 001 |
| Moderator / Support / Content editor | +995 555 000 002 / 003 / 004 |
| Owner "Yossi" (keeps Shabbat, has a listing in every status) | +995 555 000 011 |
| Guest "Noa" (favorites, a support ticket) | +995 555 000 021 |

---

## 1. Languages, design and the whole site (brief sections 4, 5)

| Requirement | Status | Where / how to test |
|---|---|---|
| 5 languages (he main, en, ru, ar, ka), own address each (`/he`, `/en`…) | Done | Language menu in the header (native names, no flags). Every page exists in all 5. |
| Hebrew and Arabic fully right-to-left | Done | Open `/he` and `/ar` on a phone: menus, arrows, carousels and forms are mirrored. |
| Phone numbers, prices, IDs stay left-to-right inside RTL text | Done | Any price or listing ID on `/he`. |
| First visit follows the browser language (else English), choice remembered | Done | Open `/` with a Russian browser → `/ru`. |
| hreflang tags, sitemap, structured data for listings | Done | `/sitemap.xml`; page source of any listing (JSON-LD). |
| Auto-translated listings, "Auto-translated · Show original", owner can edit each language | Done (needs Google Translate key) | Listing page → "Show original". Wizard step 10 → edit each language. Without the key, listings show the original text. |
| Place names in 5 languages; search works in any of them | Done | Search for Tbilisi, טביליסי, Тбилиси, تبليسي or თბილისი — same results. |
| Fonts for all 5 scripts (Noto) | Done | — |
| Western digits everywhere; dates/numbers follow the language | Done | Any price or date in `/ar`. |
| Mobile first, 360 px and up | Done | Tested at 360 px in Hebrew, Arabic, Russian and Georgian, plus tablet and desktop. |
| Brand colors (deep blue, terracotta, off-white, green Verified, amber warnings), contrast AA, light/dark mode | Done | Sun/moon button in the header. Colors and name in `src/config/site.ts`. |
| Lucide icons only, never emojis | Done | — |
| Mobile bottom bar (Home, Search, Post +, Saved, Profile); sticky WhatsApp/Call on listings | Done | Any page on a phone; any listing page on a phone. |
| Desktop top bar with tabs, language and currency switchers, Saved, Profile, "Post a listing" | Done | "Messages" appears with in-site chat (Phase 2). |
| Footer links (About, How it works, Safety, Help, Jewish Life, Terms, Privacy, Accessibility, Contact, social) | Done | Bottom of every page. |
| Every state designed: empty, error, loading (skeletons), 404 | Done | `/he/anything` for the 404; a search with no results; any page while it loads. |
| Installable app (PWA) with an offline page | Done | In the phone browser menu: "Add to Home Screen". |
| Cookie consent banner | Done | First visit shows it; the Cookie policy page (`/he/legal/cookies`) lets visitors change their choice. |

## 2. Pages (brief section 6)

### Home

| Requirement | Status | Where / how to test |
|---|---|---|
| Big search bar: Where · Deal · Dates / move-in · Guests · Search | Done | Top of `/he`. |
| Quick categories (apartments, houses and villas, rooms, hotels, for sale, Shabbat-friendly near a synagogue) | Done | Under the search bar. |
| Popular cities with photos (the 10 cities); admins can add more | Done | Admin → Content → Cities. |
| Featured ("Promoted"), newest, recently viewed | Done | Home page sections. Featured are picked by admins (Admin → Content → Featured); paid promotion is Phase 2. |
| "Why us", "How it works" for guests and owners | Done | Home page. |
| This week's Shabbat times for Tbilisi and Batumi | Done | Home page. |
| Safety tip strip → Safety Center; big "List your property for free" button | Done | Home page. |
| Real reviews only, no invented testimonials | Done | There are none; reviews are Phase 2. |
| Admins choose which home sections show and in what order | Done | Admin → Content → Home page. |

### Search results

| Requirement | Status | Where / how to test |
|---|---|---|
| Grid, list and map views; desktop split view list + map | Done | `/en/search`, view buttons. |
| "Search as I move the map" | Done | Map view on desktop, checkbox on the map. |
| Filters: sidebar on desktop, pull-up drawer on phones | Done | `/en/search`. |
| Active filters as removable chips + "Clear all" + live result count | Done | Change a filter in the drawer: the button reads "Show 19 homes" and updates as you go. |
| 9 sort options (Recommended … Price dropped); "Price per m²" only for sales, "Top rated" waits for reviews | Done | Sort menu. |
| Listing card: photo carousel, price and period, facts, Jewish badges, Verified, heart, "New" / "Price dropped" / "Promoted" | Done | Any card. |
| Pagination; going back keeps the scroll position | Done | Open a listing from page 2 and press Back. |
| Holiday tip when the dates include a holiday ("Your dates include Pesach — filter for…") | Done | `/en/search?deal=short-stay&checkIn=2027-04-20&checkOut=2027-04-27`. Holidays are also marked in the date picker. |
| "Save this search" alerts | Phase 2 | — |

### Listing page

| Requirement | Status | Where / how to test |
|---|---|---|
| Gallery: swipe, fullscreen, up to 30 photos, optional video and 360° tour link | Done | `/en/listing/91`. |
| Title, price, key facts, listing ID, "Updated" date, view count | Done | Top of the listing. |
| Sticky contact box: photo, name, badges, languages, member since, reply time, **owner's local time**, contact hours | Done | Right column (desktop) / bottom bar (phone). |
| "Replies after Shabbat" during Shabbat and holidays | Done | Visible only from Friday candle lighting to Saturday night, on Yossi's listings (e.g. 91). |
| Description with "Show original / translation" | Done | — |
| Amenities, Jewish-friendly section, house rules, all costs | Done | — |
| Availability calendar with iCal import and export | Done | Calendar on the listing; owners find the export link and import fields in wizard step 8. Imports refresh hourly (`/api/cron/ical-sync`). |
| Map with the approximate area only | Done | The map point is shifted with a server secret; the exact address is never sent to the browser. |
| Nearby with walking times (synagogue, Chabad, kosher food, mikveh, supermarket, transport) and airport distance | Done | "Nearby" section. Supermarket/transport use OpenStreetMap. |
| Candle lighting and Havdalah for the city; holidays in the guest's dates | Done | "Shabbat times" section; pick dates to see holidays. |
| Share (WhatsApp, Telegram, Facebook, copy link), Report, safety tip, similar listings | Done | — |
| Sale listings: price per m² and price-drop history | Done | `/en/listing/102` → "Price changes". |
| Reviews | Phase 2 | — |

### Post a listing (wizard)

| Requirement | Status | Where / how to test |
|---|---|---|
| Progress bar, auto-saved drafts, Back on every step | Done | `/he/post` (sign in first). |
| Steps 1–10 as in the brief (deal, type, location with pin, details, amenities, Jewish details, photos, price + calendar, contact + "no answer on Shabbat", preview in 5 languages + rules + Publish) | Done | Walk through as a new user. |
| Photos: 5–30, drag to reorder, cover, compression, location data removed, light watermark | Done | Step 7. |
| After publishing: checks run, then "live" or "we're checking your listing" | Done | Step 10 result page. |
| Listings expire after 60 days unless renewed (admins can change it); warning email 3 days before | Done | Admin → Settings → Listing expiry. Owner: My account → Listings → Renew. |
| Hotels/guesthouses: business page with room types, each with photos and price | Done | `Demo Hotel Batumi` profile and listing. |

### My account

| Requirement | Status | Where / how to test |
|---|---|---|
| My listings with every status (Live, In review, Needs changes + reason, Paused, Expired, Draft, Rented/Sold) | Done | Sign in as Yossi → `/en/account/listings`. |
| Actions: edit, pause, renew, mark rented/sold, delete | Done | Same page. "Bump" is Phase 2 (paid). |
| Stats per listing: views, contact clicks per channel, saves | Done | Listing → "Stats". |
| Favorites with notes; compare up to 3 | Done | Sign in as Noa → Favorites; Compare. |
| My support tickets with full history and rating | Done | Noa → Tickets. |
| Verification center (ID, ownership, business) | Done | `/en/account/verification`. |
| Settings: language, currency, notifications, Hebrew dates, 2-step login, connected accounts, download my data, delete my account | Done | `/en/account/settings`. |
| Saved searches, messages, reviews | Phase 2 | — |

### Other pages

| Requirement | Status | Where / how to test |
|---|---|---|
| Owner profile: name, photo, badges, languages, member since, reply rate, active listings, Report profile, Block | Done | Click the owner's name on a listing. |
| Jewish Life: map of synagogues, Chabad, kosher food, mikvaot, heritage sites (admins add; demo points marked) | Done | `/he/jewish-life`. The 13 demo points are clearly named "sample point" — replace them with real places. |
| Shabbat and holiday times per city; Jewish calendar | Done | Same page. |
| Guide articles | Done (tool) / content Phase 2 | Admins can write articles (Admin → Content → Articles); the brief's articles still need writing and a lawyer's check. |
| About (what, who, story, how it works, values, contact) | Done | `/he/about`. "Our story" shows a visible note until the founders write it. |
| Help center: searchable FAQ in 6 topics, 5 languages | Done | `/he/help`. |
| Tickets: categories (incl. urgent scam report), screenshots, linked listing; status Open → In progress → Waiting for you → Resolved → Closed; email on every reply; rating | Done | Help → "Open a ticket". |
| Contact form | Done | `/he/contact`. |
| Safety Center incl. current scam alerts posted by admins | Done | `/he/safety`. |
| Legal: Terms, Privacy, Cookies (+ banner), Listing rules, Accessibility | Done (draft text) | `/he/legal`. Each page is marked "Draft — to be reviewed by a lawyer". |

### Admin panel (`/en/admin`, staff only, 2-step login)

| Requirement | Status | Where / how to test |
|---|---|---|
| Overview: new users, listings, reports, open tickets, top cities, contact clicks | Done | Admin home. |
| Moderation queue with risk score and reasons; approve / ask for changes / reject; reason sent in the owner's language | Done | Admin → Moderation. |
| Reports; listings auto-hidden after 3 open reports until checked | Done | Admin → Reports. The number is in Admin → Settings. Only reports from different trusted accounts (older than 7 days or phone-verified) on different devices count; every report still shows here. |
| Users: search, verify, warn, suspend, ban, internal notes, change role | Done | Admin → Users. |
| Verification requests (documents deleted after review; only "verified on … by …" kept) | Done | Admin → Verifications. |
| Tickets: assign, internal notes, **saved replies** | Done | Admin → Tickets → a ticket. **New:** "Saved replies" button on the Tickets page to add, edit and delete them in 5 languages. |
| Content: home sections, featured, cities and neighborhoods, Jewish places, articles, FAQ, interface text (translations), scam alerts, banned words | Done | Admin → Content. |
| Settings: listing expiry, paid-feature prices, Shabbat mode, default currency, scam-alert banner switch, demo-data switch | Done | Admin → Settings. |
| Roles (Admin, Moderator, Support, Content editor); every admin action logged | Done | Admin → Roles; Admin → Audit log. |
| Email outbox (see every email the site sent) | Done | Admin → Email outbox. |

## 3. Listing details, filters and contact (brief sections 7, 8)

| Requirement | Status | Where / how to test |
|---|---|---|
| All listing fields (deal and property types, basics, Georgian frame conditions, heating, view, private cadastral code, amenities) | Done | Wizard steps 1–5; search filters. |
| Jewish-friendly fields: synagogue/Chabad walking time (automatic), kitchen level, Shabbat checklist, mezuzot, separate beds, sukkah space, Pesach-ready, big family, kosher food/mikveh nearby, host keeps Shabbat, Hebrew-speaking host; hotel kosher certificate and meals; shared-room men/women/families | Done | Wizard step 6; filters "Jewish-friendly". |
| Prices in GEL, USD, ILS, EUR; deposit, cleaning, utilities, minimum stay, discounts | Done | Wizard step 8. GBP/AED are prepared for Phase 3. |
| Display currency by country (ILS in Israel, GEL in Georgia, USD elsewhere), owner's original price always shown | Done | Currency switcher in the header. |
| Extra filters: price range, dates, verified only, private/business, photos/video, posted within | Done | Filters. "Rating" waits for reviews (Phase 2). |
| Owners choose and order contact methods (WhatsApp, Telegram, Viber, Messenger, call, SMS, email) | Done | Wizard step 9. Email goes through a form; the address stays hidden. |
| One tap opens the app with a ready message in the guest's language (title, ID, dates, guests) | Done | Listing → Show contact → WhatsApp. |
| Contact details only after "Show contact" while signed in (Google, Apple or phone code) | Done | Google/Apple buttons appear once their keys are set. |
| Owner's local time and preferred hours; "Replies after Shabbat" | Done | Contact box. |
| Safety tip the first time someone contacts an owner | Done | First "Show contact" of a new account. |
| Every contact click counted for the owner's stats | Done | Owner → listing Stats. |
| Phone numbers in international format with a country picker and validation | Done | Login and wizard step 9. |

## 4. Jewish and Georgian touches (brief section 9)

| Requirement | Status | Where / how to test |
|---|---|---|
| Shabbat times on the home page and every listing (computed on our server with the Hebcal library) | Done | — |
| Jewish holidays in the date picker, with a tip | Done | Search bar date picker (dots on holidays); tip above the results. |
| Hebrew date next to the regular date (optional setting) | Done | Account → Settings → "Show Hebrew dates"; shown with Shabbat times and in the Jewish calendar. |
| "Keeps Shabbat" host badge and automatic "Replies after Shabbat" | Done | Yossi's listings. An automatic chat reply comes with in-site chat (Phase 2). |
| Shabbat mode (admin, off by default): browsing open; posting, messaging and support pause; "Shabbat Shalom" banner | Done | Admin → Settings → Shabbat mode. |
| Georgian-friendly: local property terms, GEL, +995 format, Georgian from day one | Done | — |
| Partner directory | Phase 2 | — |

## 5. Trust and anti-scam (brief section 10)

| Requirement | Status | Where / how to test |
|---|---|---|
| Badges: phone verified, ID verified (checked by hand), owner verified (NAPR extract / business registration), property verified | Done | Owner → Verification center; Admin → Verifications. "Property verified" visits are a paid Phase 2 service; admins can already grant the badge. |
| Risk score on every new or edited listing; low risk goes live, high risk waits | Done (see gap 3) | Admin → Moderation shows the score and reasons. |
| Same photos in another listing or account (fingerprint) | Done | Upload a photo another account uses → flagged. |
| Same photos found elsewhere online; text hidden inside photos | Partial | Needs a paid image-search / text-recognition service; the hooks exist. |
| Price far below the area's usual price | Done | — |
| Scam phrases in 5 languages, hidden phone numbers or links in the text | Done | Admin → Content → Banned words (test box included). |
| New account posting many listings fast, several accounts on one device, VoIP numbers | Done | VoIP check needs Twilio. |
| First listing of every account always checked by a person | Done | Post as a new user → "We're checking your listing". |
| Safety tip at first contact; video-call tip with today's date and the listing ID | Done | Contact box. |
| Report on every listing and profile (6 reasons); hidden after several reports | Done | "Report" on a listing. Fake new accounts or one device cannot hide a listing. Messages arrive with chat (Phase 2). |
| Users can block each other | Done | Owner profile → Block. |
| Paid placements always labeled "Promoted" | Done | — |
| Warnings for owners about guest-side scams (fake overpayment, "refund the difference") | Done | Safety Center → tips for owners. |
| Site-wide scam-alert banner switch | Done | Admin → Settings (switch) and Admin → Content → Scam alerts. |
| Listings expire and show "Updated" date | Done | — |
| Reviews only from people who contacted the owner | Phase 2 | — |

## 6. Security, privacy and legal (brief section 11)

Full details: `docs/SECURITY-REPORT.md`.

| Requirement | Status | Where / how to test |
|---|---|---|
| HTTPS, secure headers (CSP, HSTS), OWASP Top 10 protections | Done | HTTPS itself comes from the host. |
| Password-free login (phone code, Google, Apple); 2-step login for everyone, required for staff | Done | Account → Settings → 2-step login. |
| Users only see and change their own data (checked in code on every action) | Done | Reviewed action by action in the security pass. |
| Rate limits everywhere; invisible CAPTCHA on sign-up/login, support forms, email to owner | Done (needs Turnstile keys) | — |
| CAPTCHA on "Show contact", publishing and reports | Done (needs Turnstile keys) | Invisible; checked on the server. Without keys it is skipped. See gap 2. |
| SMS-pumping protection | Done | Only allowed countries, per-phone and per-address limits. Turn on Twilio Fraud Guard. |
| Uploads: type and size checks, re-encoding, hidden data removed | Done | — |
| Malware scanning of uploads | Partial | The connection exists; needs a scanner service (`MALWARE_SCAN_URL`). |
| ID and ownership documents encrypted, staff-only, deleted after review | Done | Files never sent are deleted after 48 hours; photos of deleted listings after 30 days (daily cleanup job). |
| Secrets in environment variables | Done | Every variable is listed in `README.md` and `.env.example`. |
| Error monitoring (Sentry) | Partial → code done | **New:** server errors are sent to Sentry once `SENTRY_DSN` is set. Browser errors are not collected yet. |
| Daily backups, Cloudflare | Open (hosting setup) | README, "Going live". |
| Cookie consent, privacy policy, download my data, delete my account | Done | Account → Settings. |
| Fair housing: features, not "who may rent" rules | Done | No field limits who may rent or buy. |
| Security review with a short report | Done | `docs/SECURITY-REPORT.md`. A lawyer still needs to review the legal pages. |

## 7. SEO, sharing, speed, accessibility, notifications (brief section 14)

| Requirement | Status | Where / how to test |
|---|---|---|
| Server-side rendering, clean URLs per language, sitemap, schema.org for listings | Done | `/sitemap.xml`, `/robots.txt`. |
| Sharing previews (main photo, title, price, city) | Done | Paste a listing link into WhatsApp. |
| Lighthouse 90+ on mobile | **Partial** | Today 71–85 Performance (was 52–66 before the second performance pass; Accessibility and Best Practices 100, SEO 92–100). See gap 1 and `docs/integration/performance-seo.md`. |
| WCAG 2.1 AA, screen readers, keyboard, alt text, Accessibility statement | Done | 0 automatic violations across 333 page checks (`docs/integration/ux-a11y.md`). A manual audit with real screen-reader users is still recommended. |
| Emails in the user's language: welcome, listing live / in review / approved / needs changes / rejected / about to expire / expired / hidden, ticket replies | Done | Admin → Email outbox. Phone verification is the SMS code itself. |
| New message and saved-search emails; WhatsApp/phone notifications | Phase 2 | — |

## 8. Definition of done (brief section 15)

| Item | Status |
|---|---|
| Works on phone, tablet and desktop from 360 px | Done |
| 5 languages switch correctly; Hebrew and Arabic fully RTL, nothing overlapping | Done |
| New user can sign up, verify the phone, post with photos, see it go live or into review | Done (end-to-end test) |
| Guest can search, filter, sort, use the map, open a listing and message the owner on WhatsApp with a ready message | Done (end-to-end test) |
| Admin can approve or reject listings, handle reports and answer tickets | Done (end-to-end test) |
| Report buttons, safety tips and automatic scam checks work | Done (end-to-end test) |
| No "lorem ipsum", no broken links, no console errors | Done (end-to-end test) |
| Lighthouse 90+ | **Not yet** (71–85 on mobile) |
| Security checklist done, with a short report | Done in code; production settings still to do (gap 4) |

## 9. Demo data and setup (brief section 16)

| Requirement | Status | Where / how to test |
|---|---|---|
| 25 demo listings in Tbilisi (Vake, Saburtalo, Old Tbilisi…), Batumi, Kutaisi, Gudauri, Bakuriani, in 5 languages, marked "Demo" | Done | `docs/DEMO-DATA.md`. |
| Demo removable with one switch | Done | Admin → Settings → "Show demo data" (hide) or "Delete all demo data". |
| README with setup, going live and every environment variable | Done | `README.md`. |
| Name, colors, cities, currencies and paid-feature prices in one config file | Done | `src/config/site.ts` (prices can also be changed in Admin → Settings). |

---

## Known gaps / next steps

In order of importance. "Before launch" items are needed before real users arrive.

1. **Mobile speed (Lighthouse 90+) — not reached.** Pages score 71–85 on a slow phone test (they
   were 52–66). Done in the second pass: lighter listing cards (server-rendered, photo carousel
   starts when used or on screen), fewer cards on the home page, no skeleton screens on fast pages,
   much smaller fonts, the map and toasts load later. What is left is mostly the JavaScript every
   page loads (header menus, icons, interface text) — details and next steps in
   `docs/integration/performance-seo.md`. *Medium–high; before launch, and measure on the real
   host.*
2. **CAPTCHA on "Show contact", "Publish" and reports — done.** The invisible check is in place
   and verified on the server; it switches on with the Turnstile keys (gap 4). Try it once with
   real keys before launch. *Low.*
3. **Re-checks after some edits — done.** Paused, expired, rented or sold listings that were
   edited since the last check are checked again before they go back online, and so is a live
   listing whose price changes; risky ones wait for a moderator. *Done.*
4. **Production setup (outside the code).** Set every variable from `.env.example` (Turnstile,
   `CRON_SECRET`, encryption key, hash salt, Twilio with Fraud Guard, Resend, R2 storage, Google
   Translate, **`SENTRY_DSN`**), turn on daily database backups, put the domain behind Cloudflare,
   connect a malware scanner, and book an outside penetration test. *High; before launch.*
5. **People, not code.** A lawyer reviews the legal pages; native speakers check the Russian,
   Arabic and Georgian text; the founders write "Our story"; real Jewish Life places replace the
   13 demo points; then switch demo data off or delete it. *High; before launch.*
6. **Image search online and text inside photos.** Needs a paid service; the checks are ready to
   connect. *Low–medium.*
7. **Missing listing pages answer "200" instead of "404"** (they show the designed "not found"
   page and are hidden from Google, but the status code is wrong). Short listing links like
   `/listing/113` now get a real permanent redirect (308) from the server. *Low–medium (SEO); a
   layout decision.*
8. **Small things.** Browser-side errors are not sent to Sentry yet; the sitemap needs splitting
   above 9,000 listings; Georgian numbers above 1,000 inside some sentences can differ between
   server and browser. *Low.*

**Phase 2 (prepared, switched off):** reviews and "Top rated", in-site chat and "Messages", saved
searches and alerts, paid bump and featured, premium plan, ID-verification service, partner
directory, investor calculator, WhatsApp and phone notifications.
