# Round 2, phases 2–3: home, cards, results, listing page, login

Four parts were built side by side and then checked together at this gate:
- the home page
- the listing card, the results page, the filters and the map
- the quiet listing page
- the login changes (founder request after the brief)

## What changed

### Home (brief 5.2)
- **Only the brief's sections, in its order:**
  1. the purple band with the title and the promise line under it
  2. the search card overlapping the band
  3. the shield promise line
  4. six category chips (the last is "כשר ושבת")
  5. "מקומות מומלצים": one carousel, with promoted places first and then the newest
  6. "נצפו לאחרונה", only for visitors with history
  7. city cards, without Shabbat times
  8. "איך זה עובד" as one row of three steps
  9. the slim Jewish life card
  10. the host card
  11. the footer
- **Removed:** the photo hero, the slideshow, the trust strip, the "why us" cards, the "newest" row, the safety tip, the Shabbat countdown and the long "how it works" cards.
- **The whole search card fits above the bottom nav on first load:**

  | Screen | Language | Card ends | Bottom nav starts |
  |---|---|---|---|
  | 390×844 | Hebrew, English, Arabic | 511 px | 779 px |
  | 390×844 | Georgian | 543 px | 779 px |
  | 360×740 | Georgian | 561 px | 675 px |
  | 360×740 | Russian | 530 px | 675 px |
- **Dark mode:** there is no band. The card is `#18161F` with a border, and "שמחכים לכם" is lavender.
- **Admin home settings:** the section list now uses `categories, featured, recentlyViewed, cities, howItWorks, jewishLife, listCta`.
  - Saved round-1 lists are migrated: `shabbatTimes` becomes `jewishLife`, and the removed sections are dropped.

### Listing card, results, filters, map (brief 4 and 5.3)
- **The card** is one component, used everywhere:
  - **Photo:** 4:3, with at most 5 dots. On the photo there is only the heart and at most one tag: "דמו", then "מקודם", then "חדש".
  - **Below the photo:** one line for the title, then "אזור · עיר", then one facts line, then one price in the visitor's currency (with "≈" when converted).
  - **Tags:** at most 2 small grey ones (kosher kitchen, Shabbat-friendly, synagogue walk, Hebrew). A tag the visitor filtered by comes first.
  - **Removed from cards:** the welcome badge, "+N", "verified", "business", "price dropped" and the second price. The compare toggle now appears only on the desktop list view.
- **The results page:**
  - **Sticky top:** a summary pill and a "סינון" button with a count.
  - **Chip row:** price, rooms, property type and "כשר ושבת".
  - **One line under it:** the promise with a shield, then "N נכסים · מומלץ".
  - **Map:** a floating "מפה" pill.
  - **Desktop:** the list and the map side by side.
- **New `?kosherShabbat=1` filter.** A place matches if it has a kosher kitchen, OR is Shabbat-friendly, OR has kosher hotel meals. All old URLs still work.
- **The filters sheet:** the "כשרות ושבת" group is now plain switches. The apply button still shows the live count.
- **The map (bug 8.11):**
  - Price pills are purple. In dark mode they get a white border, and the selected one is darker and bigger.
  - Clusters get a white ring in dark mode.
  - The community layer toggle is still there.

### Quiet listing page (brief 5.4)
- **The new order:**
  1. gallery
  2. title (at most 3 lines)
  3. host line, with the pledge line once
  4. three highlights
  5. description (5 lines, then a sheet)
  6. amenities (6, then "show all")
  7. the folded "כשרות ושבת" section
  8. a 2-month availability calendar
  9. the approximate-area map
  10. "חשוב לדעת" (the only safety block)
  11. the host card
  12. similar places
- **Shabbat checklist (bug 8.8):** each item is now a plain ✓/✗ statement, with no strike-through.
- **Sticky bar for short stays and hotels:**
  - It shows the price per night, plus the nights and the total once dates are picked.
  - The purple button says "בחירת תאריכים" until dates are picked, then "הזמנה".
  - "שאלה למארח" (WhatsApp) and "השוואה" are in the "…" menu.
  - On desktop there is a booking box instead of the bar.
- **Monthly rentals and sales** keep WhatsApp and "הצגת טלפון". Sales fold the price history.
- **`/listing/[id]/book`** is a placeholder until phase 4. It is not indexed and keeps the chosen dates.
- **Removed:** the Shabbat countdown, the tradition card, the second safety block, the repeated "welcomes Israelis", repeated synagogue rows and the views count.

### Login (PLAN.md, "Login")
- **The order:** Google (when keys exist), then an email code (always offered), then a phone code only in development or test mode.
- **When codes appear on screen:**
  - always in development
  - with `AUTH_TEST_MODE=true`, only on localhost or `*.app.github.dev`
- **SMS is only used to check a number,** once per number.
- **First name:** asked once after sign-up. The greeting never shows a phone number or an email.

## Gate check

### Automated checks
- **All green:** `npx tsc --noEmit`, `npx eslint .`, `npm run i18n:check` (40 × 5), `npx vitest run` (77 files, 853 tests) and `next build`.
- **`npm run test:e2e`:** all 46 tests pass. On the first run 5 tests failed, all because the UI changed on purpose. The tests were updated to the new UI. None of them checks less than before:
  - **The results heading:**
    - On phones it shows only "5 נכסים"; screen readers still hear the full heading.
    - The tests now check the heading's accessible name ("2 homes in Tbilisi") instead of its raw text.
  - **"Kosher" quick chip:**
    - The quick chip is now "Kosher & Shabbat". The test checks that it filters and can be turned off again.
    - It also still checks the narrowing to 1 home with a removable chip, now through the "Kosher kitchen" switch in the sheet.
  - **"Shabbat-friendly":** it is now a switch in the filters sheet, not a button.
  - **Compare:** the toggle is only on the desktop list view now, so the test opens `view=list`.
  - **WhatsApp:**
    - On short stays, WhatsApp moved to "Ask the host".
    - The test still checks the whole path: log in → safety tip → WhatsApp with the ready message → the click is recorded.
  - **The pledge:** the published listing shows the pledge line ("The host has pledged to welcome Israelis") instead of the old green badge.

### Done-when items, checked with Playwright
| Item | Result |
|---|---|
| Whole home search card above the bottom nav at 390×844 | Yes, in all 5 languages (see the table above) |
| Home has only the 5.2 sections | Yes |
| Cards: ≤2 small tags, one price, no welcome badge | Yes (`MAX_CARD_TAGS = 2`) |
| No listing title past 3 lines | `line-clamp-3`; Russian and Arabic titles use 3 lines, Hebrew 2 |
| Listing states each fact once | Measured on listings 89, 104, 106 and 111: pledge line 1, live-video tip 1, "Shabbat times in…" link 1, no countdown, no "Welcomes Israelis" |
| Email-code login in development | Code shown on screen; sign-up → first name → `/account` "Hello, Gate" |
| Production build without SMS/email keys | No code and no phone option. The page says logging in isn't available yet. The phone login API returns `PHONE_LOGIN_DISABLED` |
| `AUTH_TEST_MODE=true` | Codes are shown on localhost. With a foreign `Host`, there is no test strip, the phone login API refuses, and `/api/dev/last-otp` returns 404 |
| Dark-mode map pins | Purple pills and clusters with a white border/ring, clearly visible |

**Where kosher and Shabbat details still appear:**
- the filters
- the folded listing section
- the Jewish life page
- the places the brief itself allows:
  - the card tags (5.3)
  - a "kosher kitchen" listing highlight (5.4)
  - the home "כשר ושבת" chip
  - the slim Jewish life card

Two round-1 holiday helpers remain. Both are in OWNER_TODO for the founder to decide:
- a small "holidays in your dates" box on results
- holiday dots in the date pickers

### Fixes made at the gate
- **Filters sheet footer (bug 8.3).**
  - The cause: the design-system Button is `shrink-0`. Next to the long Georgian "clear all" label, the "Show N homes" button was pushed off the screen in Georgian (both widths) and Russian (360 px).
  - The fix: the apply button can now shrink. On phones the duplicate "clear all" in the footer is hidden, because the sheet header already has "Clear".
- **The deal row in the filters sheet** at 360 px is now smaller on phones. It also has shorter labels:
  - Georgian: "ოტელი"
  - Russian: "На месяц"
- **Filters "any"** is now "ყველა" in Georgian (it was cut off in the rooms row).
- **The summary pill** said "Add dates", which was cut off in Georgian and Russian. It is now "როდის?" / "Когда?".
- **The search field hint** was cut off at 360 px. It is shorter in English, Russian and Georgian ("City, area or listing ID").
- **The "Recently viewed" heading** now uses the `text-h2` type scale, like the other home sections.
- **The e2e tests** were updated as described above.

## What to check on your phone
1. **Home, first screen.**
   - The whole white search card and its purple "חיפוש" button should sit above the bottom bar.
   - Switch to dark mode: there is no purple band, and "שמחכים לכם" turns lavender.
2. **The category chips.** Tap "כשר ושבת". You should get results with the chip turned on, and tapping it again turns it off.
3. **A listing card.** There should be one price, at most 2 grey tags, and on the photo only the heart and "דמו".
4. **The filters.** Open "סינון" in Georgian (KA).
   - The purple button at the bottom should show its full text.
   - Under "כשרות ושבת", the options are simple switches.
5. **A short-stay listing.**
   - Pick dates in "זמינות". The bar should show "N לילות · סה״כ" and the button should say "הזמנה".
   - "…" opens "שאלה למארח", "כל דרכי הקשר" and "השוואה".
   - Open "כשרות ושבת" and check that the list reads plainly (✓/✗, nothing crossed out).
6. **Map in dark mode.** Tap "מפה". The purple price pins should stand out on the dark map.
7. **Login.** Log in with your email. In the Codespaces preview (test mode) the code is shown on screen. Then type a first name; the menu should greet you by name.

## Open issues
- **Booking** arrives in phase 4.
  - "הזמנה" leads to the placeholder page.
  - The cancellation line is neutral until `cancellationPolicy` exists.
  - The home step "מזמינים באתר" already describes it.
- **On the real site without keys:**
  - Login needs Resend (email). Without it, the login page says logging in isn't available yet.
  - Posting needs an SMS service (host phone check).
  - Both are in OWNER_TODO.
  - The login subtitle still says "we'll email you a code" when email isn't available. It is only seen while no email service is set up.
- **Synagogue tags and the nearest synagogue** appear only for real, non-demo places. The demo data shows none. When phase 5 adds `verifiedAt`, count only verified places (`nearby.ts`).
- **Image sizes.** `ListingCard` has no `sizes` prop, so the home carousel requests 92vw photos for cards that are about 66vw wide. An additive prop would save bytes (phase 6, speed).
- **The Georgian demo banner** wraps to 3 lines at 360 px (phase 1 component).
- **Unused leftovers.** `home-motion.tsx` is now used only by the Jewish life hero (phase 5). `HERO_SLIDES`, `category.houses` and `category.shabbat` in `src/config/photos.ts` are unused.
- **The CARTO key** is missing on this machine, so the maps show the "missing key" notice instead of tiles in the screenshots.
