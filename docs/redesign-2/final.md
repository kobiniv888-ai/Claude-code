# Round 2: final check

Round 2 is built. The site is now purple and white (purple and black in dark mode) with the ב logo.
The home page is short. Jewish details are an extra. A guest can book a short stay on the site, and
the host sees it. After a hardening pass (12 problems found and fixed, see below) and a speed pass,
every check passes except one: Lighthouse on this machine gives 90–91 on home, a listing and the
booking review, but 87 on search, and the goal is 90 or more everywhere (numbers below).

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
| ✗ | Lighthouse on mobile ≥ 90 in production | After the speed pass: 91 home, 90 listing, 90 booking review, but 87 search (table below). Please measure the real site after it goes online (it's in `OWNER_TODO.md`). |
| ✓ | `OWNER_TODO.md` exists and is up to date | |

## Automatic checks

All green after the hardening and speed passes: schema check, type check, lint, translation check
(42 groups × 5 languages), 947 unit tests, production build, and all 60 end-to-end tests, which
passed on the first run with nothing re-run (in the earlier check, two tests had timed out once
while the development server was still compiling). Screenshots at 390×844 in Hebrew, light and
dark, of home, search (the "מפה" button tapped right after the page loaded: the map opened in under
2 seconds), a listing and the booking review show no problems.
Accessibility scans (axe) of the home page, search, the filter sheet, a listing, the booking review,
the confirmation and the post form found no problems after the fixes below.

## Fixed in this check

- **Cookie notice on phones** (`cookie-consent.tsx`): smaller, with the three buttons in one row,
  so the home search card stays fully visible on a first visit.
- **Page titles** (`page-header.tsx` and 4 pages): on the 22px / 30px title size.
- **Booking review:** the dates and guests list was built so screen readers could misread it.

## Hardening pass

After the round was built, a reviewer went through the login, the booking and the phone screens
the way a cheater or an unlucky visitor would. 12 problems were confirmed (one more report turned
out to be wrong). All 12 are fixed, and each fix has an automatic test that fails without it.

**Login and privacy**
- Someone could check, one number after another, whether a phone number has an account here. That
  check now asks for the "not a robot" test and allows only a few tries an hour.
- When a text message failed to send, the full phone number could end up in the server logs. Now
  only the error code is written there.
- One visitor could fill the address search of the post form so it was slow for everyone. Each
  visitor now has a lower limit and at most 2 searches waiting.

**Booking**
- A listing that is no longer public (its host is suspended, or its end date has passed) could
  still be booked with a direct request. It is now refused, by the same rule as the listing page.
- If the host changed the price or the cancellation rules while a guest was on the review page,
  the booking used the new terms the guest never saw. Now the booking stops, the page shows the new
  total with a short message in the guest's language, and the guest confirms again.
- If a host deleted their account at the very moment someone booked, that booking could stay
  "confirmed" on a listing that no longer exists. Now the host's listings stop taking bookings
  first, and then the upcoming bookings are cancelled.
- Guests with a warning on their account could log in but could not book. Now they can book.
  Suspended guests still can't, even after the suspension's end date, until staff lift it (the
  careful choice; it's in `OWNER_TODO.md` if you want it to end by itself).
- When a guest deleted their account, the reason they had typed when cancelling a booking was
  kept. It is now erased too (what hosts wrote when they cancelled stays).

**Phones**
- A tap on "מפה" (Map) made while the page was still loading could do nothing. This was the
  "first tap is lost" problem, and it is fixed for every button that loads late.
- On the phone map with "search as I move the map", dragging or pinching the map never updated the
  results. It does now.
- On phones, an early tap on the listing's share button did nothing. It now opens the phone's
  share sheet (or the share menu, if the phone can't).
- On a first visit on a small phone, the cookie notice covered the home search button (Russian and
  Georgian at 360px, all 5 languages on very short screens). On phones it now shows one short
  sentence.

## Lighthouse (mobile, production build)

Measured after the speed pass: Lighthouse 12.8, mobile preset, signed out, on a production build
on this machine with nothing else running. One warm-up run, then 5 runs; the score is the middle
one of the 5 (all 5 in brackets). "Before" was measured the same way just before the speed pass. It
is higher than the table in the earlier check, which was measured while the machine was busy.

| Page | Before | After | Largest paint (goal < 2.5 s) | Blocking time | Layout shift (goal < 0.1) |
|---|---|---|---|---|---|
| Home `/he` | 81 | **91** (92/91/91/93/88) | 3.2 s | 130 ms | 0 |
| A listing | 76 | **90** (90/91/78/88/91) | 3.3 s | 146 ms | 0 |
| Search, Tbilisi | 85 | **87** (83/89/89/84/87) | 3.4 s | 230 ms | 0 |
| Booking review | 70 | **90** (90/93/90/91/90) | 3.2 s | 174 ms | 0 |

**Result: ✗, not yet.** Three of the four pages reach 90; search is at 87. Be aware of three things:

- **The booking review number is for what a signed-out visitor sees** on a demo listing (a short
  "this demo listing can't be booked" notice). The booking form itself could not be measured in this
  setup. On that page, the footer used to jump down (layout shift 0.28, goal < 0.1); this is fixed.
- **The listing's 78** was one run with a single long pause that no script was blamed for, the same
  kind of outlier as in the "before" runs.
- **Largest paint is still 3.2–3.4 s, not 2.5 s.** On a local test every script counts toward it,
  and React, Next.js and the translation library alone are about half of what is counted. A real
  host with a CDN should do better: please check the live site (it's in `OWNER_TODO.md`).

What the speed pass changed, in short: the listing and the booking review now arrive as one
complete page instead of a loading screen first (a loading screen still shows when you tap a link
to them); the "…" menus, the "Kosher and Shabbat" and "Price history" sections, the cookie
switches and the side menu load their code only when they are needed (a tap made while they load
is not lost); and background downloads wait until you first touch or scroll the page.

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

- **Speed:** here the site scores 91 on home, 90 on a listing and on the booking review, and 87 on
  search; the first big paint takes 3.2–3.4 s instead of 2.5 s. Please check the real site with
  PageSpeed Insights once it is online. For us: search is the next page to speed up, and the
  booking form (as a signed-in guest sees it) still needs its own measurement.
- **Waiting for you** (all in `OWNER_TODO.md`): the About story and your name, real community places,
  the legal placeholders and a lawyer's review, SMS and email keys, the CARTO key, photos, the
  footer tagline, the WhatsApp green, the holiday helpers, and whether a suspension should end by
  itself on its end date.
- **Cookie notice on small phones (fixed in the hardening pass):** on phones the notice now shows
  one short sentence, so at 360×780 and larger it no longer covers the home search button in any
  of the 5 languages (an end-to-end test checks Georgian and Russian). On very short screens
  (360×640) a notice at the bottom cannot stay clear of the button at any height. We accept that:
  it shows only on a first visit, and one tap on it clears it.
- **Short listing links (fixed in the speed pass):** a link with no title in the address
  (`/listing/89/book?…`) used to show the loading screen first. It now goes straight to the full
  address.
