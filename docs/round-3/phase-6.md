# Round 3, phase 6: city pages, the Google basics, the full test run and the speed check

This phase covers section 10 of the brief (city pages and the Google basics), the full test run of
section 13 and the Lighthouse numbers in production, with your answer 10 in `docs/round-3/PLAN.md`
(the city-page texts live in the message files and are marked for your review). It is the last
phase of round 3: the round's "Done when" list, item by item, is in `docs/round-3/final.md`.

Four people built the parts side by side (city pages, the Google basics, speed, and the fixes from
a review). This final check put them together and tested them **in production mode** (the fast
version, the way visitors will get it) on 7 November 2026.

The fast version starts the same way as before: in the codespace terminal run
`bash .devcontainer/start-prod.sh` and open the address ending in **`-3000.app.github.dev/he`**.

## What changed

### City pages (brief 10)

- **A page for each city and type, in each language.** For example `/he/batumi/short-stays` is
  "דירות לטווח קצר בבטומי". The four types are short stays (`short-stays`), monthly (`monthly`),
  sale (`sale`) and hotels (`hotels`), for all 10 cities: Tbilisi, Batumi, Kutaisi, Kobuleti,
  Gudauri, Bakuriani, Borjomi, Kazbegi, Sighnaghi and Mestia.
- **Each page has:**
  - a clear title and one line under it, and the four types as chips with their counts
  - the places (the same cards and filters as the search, up to 24, with "לכל התוצאות והמסננים")
  - 2–3 short paragraphs about the city with its photo, written only from facts that can be
    checked, with no numbers, prices, distances or "best" claims, and marked for your review
    (`OWNER_TODO.md`, item 8)
  - a map, which loads only when you scroll near it or tap "הצגת המפה" (so the page stays fast),
    and is hidden when the page has no places
  - a short "how booking works": dates → book on the site → pay on arrival for short stays and
    hotels; contact → see the place → agree directly for monthly rentals and sales, with a link to
    the full explanation
  - this week's Shabbat times for the city, with a link to the city's times on the Jewish life
    page, and links to the city's other types
- **No places at all:** "עדיין אין כאן מקומות" with a "פרסמו את שלכם" button that opens the post
  form.
- **A city page** (`/he/batumi`): the four types with their counts, the newest places, the about
  text, a map and the Shabbat times.
- **In the footer:** a new row "ערים בגאורגיה" with a link to each city.
- **Unknown addresses** (a city that doesn't exist or is switched off, a type that doesn't exist,
  `/en/Batumi` with a capital letter) show the normal "page not found". The other pages (search,
  about, help, post, Jewish life, admin, account) work as before, and `/he/rent`, `/he/hotels` and
  `/he/buy` still lead to the search.
- **Listing pages** have a new path at the top on wider screens (a computer or a tablet): home →
  the city → that city's page of the listing's type → the listing. On phones the photos stay first,
  as before; Google gets the same path either way.

### What Google may see (brief 10, "Basics" and "Never let Google index…")

- **Only the real site can be indexed.** The real site is exactly the address in `SITE_URL`.
  Every other address (the codespace, a preview, a test server) answers "noindex" on every page,
  file and photo, so Google never keeps them. If `SITE_URL` is missing or doesn't match the address
  people open, the server prints a loud warning at start (`OWNER_TODO.md`, "Keys the real site
  needs").
- **Demo listings are never indexed:** their pages say "noindex", and they never appear in the
  sitemap, whatever the demo setting.
- **A city page is indexed only with at least 3 real listings.** Below that it says "noindex". A
  city page (`/he/batumi`) is indexed when any of its types is. Search pages: only a plain
  landing (a type and/or a city, nothing else) with at least 3 real listings; a city + type search
  points Google to the city page instead. Filtered, sorted, dated and map searches are never
  indexed.
- **A unique title and description** for every public page in every language (checked by a test
  that opens every public page in all five languages). Listing titles now include the
  neighborhood, and two live listings with the same title in one city get "· #number".
- **hreflang** (the link between the five languages of a page) and **canonical links** (the one
  address Google should keep) on every public page.
- **`sitemap.xml`** lists the main pages, the city pages with at least 3 real listings (and their
  city pages), the search landings that qualify and every real published listing, in each
  language (and the guides, once they are switched on). Today, with only demo listings, it lists
  only the main pages.
- **`robots.txt`**: on the real site everything is open except the admin panel, the account pages
  and the site's internal addresses, with a line pointing to the sitemap. On any other address
  everything is open (so Google can read the "noindex") and there is no sitemap line. The private
  pages (login, the post form, saved places, shared lists) say "noindex" themselves.
- **Structured data only where Google supports it:** a breadcrumb path on city pages and listing
  pages, and the site's name on the home page. The old listing, FAQ and site-search data was
  removed (Google no longer shows it for sites like ours, and some of it could be read as
  ratings). Demo listings carry none.
- Owner pages and a listing's "all reviews" page are never indexed (their links still count).

### Speed (brief 13, "Lighthouse mobile scores 90 or more")

- **The home page's first screen** waits for the first recommended card, so the title and the
  first photo appear together instead of one after the other.
- **The city photos** on the home page, and search result photos from the third card on (on
  phones), load right after the page instead of with the first screen.
- **The server warms itself after a start:** right after the fast version starts, it prepares the
  Hebrew home page and its first photos, then the other languages and the search 20 seconds later.
  Before, the first visitor after a start waited for that (Lighthouse 85–86 on the first run).
- **Lighter pages:** a page no longer carries a hidden second header, footer and cookie notice for
  the "page not found" case (about 41 KB less on every page); one stylesheet fewer before the
  first paint; the error page and a few small blocks ("המשך מאיפה שעצרתם", the place suggestions)
  load their code only when they are needed.

### The how-it-works page

- It still said that you can't book on the site and that you log in with Apple or a phone code. Its
  guest steps, owner steps and questions now match the About page and the Help FAQ (please read it
  in Hebrew, `OWNER_TODO.md`, "Content and wording").

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (49 groups × 5 languages) and 2,434 unit tests in 230 files (city pages: the four types
  and their search filters, the 3-real-listings rule, the counts, the reserved city names; Google:
  the real-site rule, the "noindex" header on other addresses, robots.txt, the sitemap with its
  special characters, the canonical and the landing rules, unique titles and descriptions on every
  public page in five languages, the listing breadcrumb; speed: the warm-up and the photo loading).
- **End-to-end tests in production mode: all 131 passed** in one clean run (6.5 minutes), nothing
  re-run, none skipped, with staff using the real 2-step login. Every test from section 13 of the brief is among them (the list, with
  the test names, is in `docs/round-3/final.md`). New for this phase:
  - **City pages:** a page with demo listings shows them, the booking steps and the links, loads
    the map only near the screen and is "noindex"; the city page lists the four types with their
    counts; a page without places shows "עדיין אין כאן מקומות · פרסמו את שלכם"; unknown cities and
    types answer "not found" while the pages next to them work; with 3 real listings (test-only,
    removed afterwards) a page and its city page can be indexed, with 2 they can't.
  - **Google:** on a test address every answer (pages, files, photos, the API, share images) says
    "noindex, nofollow"; robots.txt has no sitemap; the sitemap has no demo listing; a demo listing
    says "noindex"; a city page under 3 real listings says "noindex"; every content page has its
    canonical and the five languages; a filtered search is "noindex" and points to its landing; the
    home page carries only the site's name.
  - **Speed:** the home page's first paint waits for the first card; the city photos load after
    the page and appear; on a phone, search photos from the third card on load after the page; the
    place suggestions appear at the first tap; unknown addresses show "page not found" inside the
    site's frame.
- **Lighthouse (phone setting, production):** the home page `/he` scored between 89 and 93 in 18
  runs, 92 most often, and 90 or more in 15 of them; the three runs at 89 are explained under "Open
  issues". Right after a fresh start (no warm-up by us) it scored 91, 91 and 92 while the machine
  was quiet. `/he/batumi/short-stays`: 92, 93, 93. A listing: 92, 91, 88. Search: 81, 88, 87. Every
  number is in `docs/round-3/final.md`.
- **Screenshots** in production mode at 390×844 in Hebrew (light and dark), 1440×900 in English and
  360 px in Georgian, all looked at: the home page, the Batumi city page, "דירות לטווח קצר
  בבטומי", an empty city page ("נכסים למכירה במסטיה"), a demo listing with its new path at the top.
  Also `robots.txt` and `sitemap.xml` on the test address and on an address set up as the real
  site. Nothing needed a change in the code. Two small things are listed under "Open issues": the
  Georgian name of the hotels type is cut with "…" in its chip at 360 px, and when the map
  background can't load, its notice sits in the middle of the map, over a pin.
- Test accounts, listings and sessions were removed afterwards.

## What to check on your phone, in this order

1. Start the fast version and open the `-3000.app.github.dev/he` address **in a private tab**.
2. Scroll to the bottom of the home page: **"ערים בגאורגיה"**. Tap **בטומי**. You see the Batumi
   page: the four types with their counts, the newest places, "בטומי בקצרה", the map and this
   week's Shabbat times.
3. Tap **"דירות לטווח קצר"**. The title is "דירות לטווח קצר בבטומי". Check the cards, "לכל
   התוצאות והמסננים", the paragraphs about Batumi, "הצגת המפה", the three steps of "איך מזמינים",
   the Shabbat times link and the links to the other types.
4. **Read the city texts** (item 8 in `OWNER_TODO.md`): open each city from the footer and read
   "… בקצרה". Tell us what to change.
5. Open **`/he/mestia/sale`**: "עדיין אין כאן מקומות" and "פרסמו את שלכם".
6. On a computer (or a tablet held sideways), open a listing (for example **104**): at the top,
   the path דף הבית / בטומי / דירות לטווח קצר / the listing. On a phone the photos stay first.
7. Open **`/robots.txt`** on the codespace address: "Allow: /" and no sitemap line, because the
   codespace is not the real site (it also tells Google "noindex" on every page). After the domain
   is live, open `https://<your domain>/robots.txt` and `/sitemap.xml`: the first has a sitemap
   line, the second lists the site's pages.
8. The home page: the title and the first photo appear together; the city photos come a moment
   later.
9. The **"איך זה עובד"** page (menu → עזרה ובטיחות, or the footer): it now says you book short
   stays and hotels on the site and pay on arrival.

## Open issues

- **The city pages are hidden from Google today,** because none has 3 real listings yet (demo
  listings never count). They open for Google by themselves as real listings arrive.
- **Google indexes nothing until `SITE_URL` is the real domain** (`OWNER_TODO.md`, "Keys the real
  site needs"), and Search Console comes after that (item 10).
- **Lighthouse is not 90 on every run.** (Fixed on 8 November for the home page: see "Final speed
  pass" at the end. Search can still score 87–89 in some runs.) On this machine the home page
  scored 89 in 3 of 18 runs: twice right after a fresh start while the machine was still busy
  with the build or the test run (the same fresh start scored 91–92 once the machine was quiet),
  and once on a quiet machine. In that run the page arrived very fast and Lighthouse's phone
  simulation counted all the page's scripts (about 240 KB) into the moment the first photo
  appears (3.7 s instead of about 3.2 s).
  Search scored 81–88 and a listing 88–92 for the same reason. The fix is to send less script
  before the first screen appears, which is a bigger change than this check should make; it is the
  first speed task for the next round. Please also measure the real site with PageSpeed Insights
  once it is online (`OWNER_TODO.md`, "Speed"): a real server with HTTP/2 and a CDN is usually
  faster than this test machine.
- **Georgian at 360 px:** the hotels type, "სასტუმროები და საოჯახო სასტუმროები", is cut with "…" in
  its chip at the top of a city page (the title and the lists below show it whole). A shorter
  Georgian name would fix it; that is a question for a native speaker
  (`OWNER_TODO.md`, "Translations to check").
- **When the map background can't load** (no internet, or a problem at the map service), the
  notice "רקע המפה לא זמין כרגע…" sits in the middle of the map and can cover a pin. The pins still
  work. On the real site, with the map key, the background loads.
- **The city texts are drafts** until you approve them (item 8); the Russian, Arabic and Georgian
  versions are our translations.
- **The sitemap's "last changed" date** for a city page is the newest change of its listings; the
  main pages have none (Google ignores a date that never changes).

## Decisions taken while you were away (the careful option, as you asked)

**City pages**
- The texts use only facts that can be checked: no numbers, prices, distances, "best" or
  "cheapest". Airports are mentioned only as "has an international airport" or "the nearest
  international airport in Georgia is in Tbilisi"; synagogues only for Tbilisi (the Great
  Synagogue) and Kutaisi. When in doubt, the sentence was left out.
- Below 3 real listings a page is always "noindex". "עדיין אין כאן מקומות" appears only when the
  page has no places to show at all; a page with places (demo ones while the demo data is on, or
  1–2 real ones) shows them with a "פרסמו את שלכם" band under them, because "no places here yet"
  above real cards would be false (`docs/round-3/PLAN.md`, "Open questions").
- A city page (`/he/batumi`) is indexed when any of its four types is.
- City names that clash with the site's own addresses (for example "post" or "hotels") can't be
  used: the admin's city form refuses them.
- The map on a city page loads only when you scroll near it or tap "הצגת המפה".

**Google**
- Only `SITE_URL` decides what the real site is (not the address the codespace uses for links).
  Every address the request names must match it, so a forwarded test address never counts.
- On the real site, robots.txt closes only the admin panel, the account pages and the internal
  addresses; the login, the post form, saved places, shared lists and unsubscribe pages stay open
  to crawlers so they can read their "noindex" (a page closed in robots.txt can still be listed by
  Google without its text).
- The home page's site-search data, the listing data (with prices and ratings) and the FAQ data
  were removed: Google shows none of them for a site like ours today, and rating data with no
  reviews could be read as invented. Only breadcrumbs and the site's name stay.
- A search landing points Google to the city page when one exists for it, so the same places are
  not indexed twice.

**Speed**
- The server's warm-up runs only on the fast version on a normal server, never on Vercel (each
  function would warm itself) and never in development; `WARM_ON_START=0` turns it off.
- On phones, search photos from the third card on load after the page; on wider screens they load
  right away.
- The admin and development "page not found" shows only the logo (the public one keeps the whole
  frame).

**Decided in this check**
- `OWNER_TODO.md` now starts with the ten items of brief section 11, in the brief's order and with
  its numbers, and then "Keys the real site needs": `SITE_URL`, then Resend and Google (your
  answer 9: without them nobody can log in), then the rest. Items that are done were taken out; the decision on verification
  is marked done, with the later step under it.
- The listing in the Lighthouse numbers is measured on its own address (the one cards link to).
  The short address `/he/listing/89` first forwards to it, which costs Lighthouse's slow-phone
  simulation about 0.3 s and 5–10 points (79–84); both are in `docs/round-3/final.md`.

## Security and quality check after phase 6

After phase 6 was built, a review went through it looking for problems with Google (what it can
see and index), the city pages, the texts and the speed changes. Everything it confirmed was fixed
(18 findings) before this final check, each with a test where one makes sense:

- **The sitemap broke on a special character.** A search address with "&" made the whole sitemap
  unreadable for Google. Every address in it is now written safely; a test reads the sitemap with
  a strict reader.
- **A wrong language hint in the page headers.** The site also sent the language links in a header,
  pointing to the wrong addresses. They now come only from the page itself.
- **A missing `SITE_URL` would silently hide the whole site from Google.** The server now prints a
  loud warning at start when it runs on a real domain without `SITE_URL`, or when `SITE_URL` is a
  different address (for example `bayit.ge` against `www.bayit.ge`). The README and
  `OWNER_TODO.md` say so.
- **robots.txt hid the "noindex" from Google** on the private pages, which Google can then still
  list without their text. Only the admin panel, the account pages and the internal addresses are
  closed now; the rest say "noindex" themselves.
- **City names that clash with the site's own addresses** ("post", "hotels"…) would have broken
  pages; the admin form now refuses them, and the city lists skip them.
- **The listing path at the top pointed to the search**; it now goes through the city page.
- **Listings with the same title** had the same Google title; the neighborhood (and, when needed,
  "· #number") now makes each one unique.
- **The share-image test** checked an address that didn't exist; it now follows the real share
  image of a listing and of a shared list.
- **The how-it-works page, the city texts and a few labels** said things that were no longer true
  or were stronger than the facts (for example "quieter" for Makhinjauri and Gonio, and the airport
  sentences for Gudauri and Kazbegi). They were corrected.
- **The grey page shown while a listing opens** no longer adds to every page's first load: its code
  loads when the phone is idle or at the first touch, and the page jumps to the top only when the
  grey page is really shown (before, a tap that came too early could jump to the top of the old
  page).

## Final speed pass (8 November)

The one item of the "Done when" list that was still open was the speed score on a phone: the home
page had to score 90 or more in Lighthouse on every run, and it scored 89 in 3 runs of 18. A last
speed pass closed it, without changing anything you can see.

**What changed.** The page now sends its code in fewer, larger files; the pieces that are not
needed to show the first screen (the search filters, the small pop-up messages, the error page,
the app's install information) load a moment later; most icons are written into the page itself
instead of coming from a separate file; and the search page, like the home page, shows its first
screen together with the first result's photo. Pages, features, the five languages, right-to-left
and dark mode are the same: screenshots of the home page, search (list and map), a listing, the
Batumi short-stays page and the "page not found" page, at 390×844 in Hebrew (light and dark) and
at 1440×900 in English, were compared pixel by pixel with the version before; only the clock and
the demo data's dates differ.

**The numbers** (production build on this machine, Lighthouse's phone setting, quiet machine):

- home page `/he`: 96 and 96 right after two fresh starts, then 96, 96, 96, 90, 96, 90, 96, 90:
  **10 of 10 at 90 or more** (it was 89–93 before)
- a listing: 94, 96, 96, 95, 95 (was 88–92)
- `/he/batumi/short-stays`: 92, 90, 90, 96, 95 (was 92–93)
- search: 94, 87, 94, 94, 94 (was 81–88)

A page scores 96 or 90 depending on a race inside the test (whether the page's main script starts
before the first photo is on screen); the home page stays at 90 or more either way. Search can
still drop to 87–89 when it loses that race, and the home page's 90 has little to spare, so a slow
or busy machine could show 89. The real test is PageSpeed Insights on the real site
(`OWNER_TODO.md`, "Speed").

**Checked again on the new code:** all automatic checks green, the demo data reloaded, all 131
end-to-end tests passed in one clean run (6.3 minutes). The first test run found one mistake in the
speed work: after logging out, the "התנתקתם" message could disappear. It was fixed before the clean
run. The error page was also tried with a real failure (the database stopped while a page was open):
the full error page appears, in light and dark.
