# Round 2: final check

Round 2 is built. The site is now purple and white (purple and black in dark mode) with the ב logo.
The home page is short. Jewish details are an extra. A guest can book a short stay on the site, and
the host sees it. Every check passes except one: Lighthouse on this machine gives 77–90, and the
goal is 90 or more (numbers below).

Checked on 2 November 2026, on a production build, at 390×844 in Hebrew (light and dark), at
1440×900 in English, and on the first screens in Arabic, Russian and Georgian.

## "Done when", item by item

| | Item | Notes |
|---|---|---|
| ✓ | Purple and white in light mode, purple and black in dark mode | Header, hero band, buttons, chips, map pins. |
| ✓ | The ב logo everywhere; no coral, navy or green left over | Header, footer, favicon, app icons, manifest, share images, emails and the offline page all use the new mark. Old color names in the code now point to purple. Green appears only for "verified", "booking confirmed" and the WhatsApp button (your call, see `OWNER_TODO.md`). |
| ✓ | The whole home search card is visible on first load at 390px | Fixed in this check. On a first visit, the cookie notice covered the search button in English, Russian and Georgian. On phones it is now compact (one row of buttons), so the whole card shows above it. |
| ✓ | Headings follow the type scale; listing titles stop at 3 lines | Fixed in this check: account, login, owner, guide and photo-credit page titles were 24px bold and are now the 22px page-title size. Listing titles are cut with "…" after 3 lines (Russian and Georgian reach exactly 3). |
| ✓ | The home page has only the sections in 5.2 | Hero, search card, promise line, category chips, recommended places (plus recently viewed), cities, how it works, the Jewish life card, the host card and the footer. |
| ✓ | Cards: at most 2 small tags, one price, no welcome badge | |
| ✓ | Kosher and Shabbat only in the filters, the folded listing section and the Jewish life page | As the brief allows, they also appear in the "כשר ושבת" chip, as small card tags and as a listing highlight ("מטבח כשר"). Two leftovers wait for your decision in `OWNER_TODO.md`: the footer tagline and the holiday helpers. |
| ✓ | A guest picks dates, sees the total, confirms, and gets the address and the host's contact | End-to-end test, plus screenshots. |
| ✓ | The host sees the booking, the dates are blocked, iCal import and export work | End-to-end test for the booking list, the calendar and the export. Import was checked here by feeding a calendar file to a demo listing: the nights showed as taken for guests and dashed on the host's calendar ("תפוס לפי היומן של …"). The test data was removed. |
| ✓ | Every bug in section 8 is fixed | All 11 bugs. See `phase-*.md` and the bugs test (`tests/e2e/bugs.spec.ts`). |
| ✗ | Lighthouse on mobile ≥ 90 in production | 77–90 here (table below). Please measure the real site after it goes online (it's in `OWNER_TODO.md`). |
| ✓ | `OWNER_TODO.md` exists and is up to date | |

## Automatic checks

All green: schema check, type check, lint, translation check (42 groups × 5 languages), 925 unit
tests, production build, and 54 end-to-end tests. Two of the end-to-end tests (currency, phone
search) timed out once while the development server was still compiling, and passed when run again.
Accessibility scans (axe) of the home page, search, the filter sheet, a listing, the booking review,
the confirmation and the post form found no problems after the fixes below.

## Fixed in this check

- **Cookie notice on phones** (`cookie-consent.tsx`): smaller, with the three buttons in one row,
  so the home search card stays fully visible on a first visit.
- **Page titles** (`page-header.tsx` and 4 pages): on the 22px / 30px title size.
- **Booking review:** the dates and guests list was built so screen readers could misread it.

## Lighthouse (mobile, production build)

Lighthouse 12.8 mobile preset on this machine, with nothing else running. Each number is the
middle of 3 runs.

| Page | Score | Largest paint (goal < 2.5 s) | Blocking time | Layout shift (goal < 0.1) |
|---|---|---|---|---|
| Home `/he` | 86 (79–89) | 3.7 s | 192 ms | 0 |
| Search, Tbilisi | 86 (83–87) | 3.4 s | 337 ms | 0 |
| A listing | 77 (75–90) | 4.7 s | 279 ms | 0 |
| Booking review | 90 (88–92) | 3.3 s | 135 ms | 0.001 |

On a local test, every script counts toward the first paint, so these scores are lower than a real
host with a CDN would get. Layout shift is fine everywhere.

## What to check on your phone, in this order

1. In the Codespace terminal, start the fast version (the one command is below). Open the same
   forwarded address as before on your phone.
2. **Home, light then dark** (switch in the menu): purple band and ב logo in light mode, black in
   dark mode. The whole search card is visible without scrolling, even with the cookie notice.
3. **Search** Tbilisi. Open "סינון" and find the "כשרות ושבת" group. Tap "מפה" and check that the
   pins are easy to see.
4. **Open a short stay.** Check the title, the host line with the pledge, the closed "כשרות ושבת"
   section, the calendar and "חשוב לדעת".
5. **Book it:** "בחירת תאריכים" → pick dates → see the total → "הזמנה" → sign in as the demo guest
   (+995555000021; the code appears on screen) → "אישור הזמנה". You should see the address and the
   host's phone and WhatsApp.
6. **Be the host:** sign in as Yossi (+995555000011) → "הזמנות לנכסים שלי" shows the booking. On the
   listing's "יומן", the nights are taken, and the iCal links are there.
7. **Turn the phone sideways and back.** The layout should not get stuck.
8. **Switch the language** to Georgian, Russian and Arabic. Look for cut-off text.
9. **Post form, step "Where is it?":** the map opens on Georgia with no pin. The address search
   runs only when you press "חיפוש" or Enter.

## The fast version, one command

```
bash .devcontainer/start-prod.sh
```

It builds and starts the production version on the usual forwarded port. Photos are prepared in the
background for 2–3 minutes after it starts.

## Open items

- **Speed:** the site scores 77–90 here. Please check the real site with PageSpeed Insights once it
  is online.
- **Waiting for you** (all in `OWNER_TODO.md`): the About story and your name, real community places,
  the legal placeholders and a lawyer's review, SMS and email keys, the CARTO key, photos, the
  footer tagline, the WhatsApp green, and the holiday helpers.
- **Small, for us:** on the smallest phones (360px wide), the Georgian cookie notice still covers
  the search button on a first visit. It's fine at 390px in all 5 languages.
- **Small, for us:** a short listing link with no title in the address (`/listing/89/book?…`)
  first shows the loading screen and then moves to the full address. Links on the site always use
  the full address, so visitors don't see this.
