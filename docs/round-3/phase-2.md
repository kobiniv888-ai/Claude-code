# Round 3, phase 2: design, wording and a lighter home page

This phase covers section 3 of the brief (design and wording: the menu, the footer, card labels,
the Post page, step 9, the check-in pickers and the small fixes) and section 4 (a lighter home page
with "המשך מאיפה שעצרתם").

Three people built the parts side by side. This check put them together and tested them **in
production mode** (the fast version, the way visitors will get it) on 4 November 2026.

The fast version starts the same way as in phase 1: in the codespace terminal run
`bash .devcontainer/start-prod.sh` and open the address ending in **`-3000.app.github.dev/he`**.

## What changed

### The home page (brief section 4)

- **A first visit** now shows, in this order: the purple band with the search card, the promise
  line, the category chips, "מקומות מומלצים", "לאן נוסעים?", "איך זה עובד" in one row, the host
  card, and the footer. Nothing else.
- **The Jewish life card is gone from the home page.** Jewish life is still in the menu, in the
  footer and behind the "כשר ושבת" chip.
- **"מקומות מומלצים" follows the tab you pick** in the search card: at most 6 places, all of that
  tab's type, so a sale never sits among nightly stays. "הכל ←" opens the search for that type. A
  tab with no places says so and invites hosts to list one.
- **Returning visitors** get "המשך מאיפה שעצרתם" right under the search card. It shows:
  - the last search as one tap, for example "בטומי · 12–15 בדצמ׳ · 2 אורחים";
  - "שמורים · N מקומות" when you are signed in and have saved places;
  - "נצפו לאחרונה": up to 10 places, with "ניקוי" (and "ביטול" in the message that follows, in
    case it was a mistake).
- **Recently viewed places are kept on the device for guests and in the account when signed in.**
  Sign in on another phone and the same list is there. A last search is remembered only when it
  names a place or dates, and it disappears after 30 days or once the check-in day has passed.
- **Privacy:** the device keeps this history only when the visitor allowed "preferences" in the
  cookie notice. "Necessary only" removes it. Logging out clears it from the device.

### The menu

- "Find a place" now starts with the four home-tab names: **לטווח קצר, חודשי, קנייה, מלונות**
  ("השכרה" is gone), then the map and saved places.
- **One "חיים יהודיים בגאורגיה" row** instead of five.
- **"מספרי חירום" is under "עזרה ובטיחות"** and opens the emergency numbers, which now also have
  their own section on the safety page.
- On a computer, the tab row uses the same four names. "אודות" moved out of that row (eight tabs
  did not fit in Georgian); it stays in the phone menu and the footer.

### The footer

- **The new tagline:** "בתים בגאורגיה, אצל מארחים שהתחייבו לקבל ישראלים בברכה. מזמינים באתר
  ומשלמים כשמגיעים."
- **The bottom line:** "נבנה על ידי משפחה ישראלית" (it is in `OWNER_TODO.md` for your OK).
- A "מספרי חירום" link in the help column.
- **No footer inside the post form, the edit form and the booking pages**, so nothing leads away
  from the task. The Post start page and the trip page keep it.

### Cards, the Post page and the form

- **Every card that isn't a short stay shows its type** after the price: "למכירה", "חודשי" or
  "מלון", in a small outlined label.
- **The Post page pledge sentence:** "כל המארחים כאן מתחייבים לקבל אורחים ישראלים ויהודים בברכה.
  תאשרו את זה לפני הפרסום." The promise of a badge is gone.
- **Review time:** "בדרך כלל תוך יום" everywhere (the form and the "being checked" messages).
- **Step 9 (Jewish-friendly details)** has the new subtitle, an "אופציונלי" tag and a "דילוג"
  button. "דילוג" keeps what you already ticked and moves on.
- **Check-in and check-out pickers** offer only the usual times, every 30 minutes, plus "גמיש":
  check-in 12:00 to 22:00, check-out 7:00 to 14:00. Hebrew, Russian and Georgian use the 24-hour
  clock, English uses "2:00 PM". "גמיש" shows on the listing, the booking review, the trip page,
  the emails and the calendar file as "צ׳ק-אין גמיש" / "צ׳ק-אאוט גמיש". A time saved earlier that
  is not in the new list (for example 10:00) is kept and shown as it was.

### Small fixes

- The filters section is called **"חדרים ומיטות"**.
- The airport line reads **"שדה התעופה של בטומי · 2 ק״מ"**, with no airport code.
- Demo community places have **no "מסלול הליכה" button** and no directions link.
- **Map start view:** the map fits the places in the results, with some room around them, and all
  of Georgia when there are none. This check fixed one more thing: on a computer, the map reaches
  below the bottom of the screen until you scroll, so one Tbilisi result opened out of sight. The
  results are now fitted into the part of the map you can see.

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (44 groups × 5 languages) and 1,323 unit tests (one new in this check, for the
  map fix).
- **End-to-end tests in production mode: all 81 passed** on the final build, nothing re-run (80 of
  80 before the map fix and its new test). The first run had 2 failures that were not bugs in the
  site: the site allows 20 phone login codes an hour
  from one address, and with the new tests the whole run asked for 22. The new tests now sign in
  with an email code (the way people log in on the real site), and the run stays under the limit.
- **New tests for this phase**, all in Hebrew:
  - a first visit gets the brief's sections in the brief's order, and no Jewish life card;
  - "מקומות מומלצים" follows each of the four tabs, with "למכירה", "חודשי" or "מלון" on every card
    but short stays, and never a sale among short stays;
  - a returning visitor sees "המשך מאיפה שעצרתם" with the last search and recently viewed;
    "ניקוי" empties it; after signing in on a fresh device, the list comes from the account; and
    "ניקוי" while signed in clears the account's list too;
  - the side menu has the four tab names, one Jewish life link, and "מספרי חירום" under "עזרה
    ובטיחות", which opens the emergency numbers;
  - the footer has the new lines, is hidden in the post form, the edit form and the booking review,
    and stays on the Post page;
  - check-in offers exactly 12:00 to 22:00 every 30 minutes plus "גמיש" (Hebrew and English), and
    check-out 7:00 to 14:00;
  - on a computer, every Tbilisi result is on the first screen of the map.
- **Screenshots** at 390×844 in Hebrew (light and dark) and 1440×900 in English, all looked at:
  the home page (first visit and returning), the side menu, the footer, cards with type labels, the
  filters' "חדרים ומיטות", a listing's airport line, the map (Tbilisi, and an empty search), the
  Post page, step 9 and the check-in picker. Georgian, Russian and Arabic were checked at 360 px
  wide too: nothing is cut off or runs off the screen.
- **Speed (Lighthouse, phone, home page `/he`):** **88** (5 runs: 92, 88, 88, 88, 88). Round 2
  ended at 91. Nothing jumps while the page loads (layout shift 0). The biggest thing on the first
  screen is now the first recommended photo, which appears a little later than the title did. The
  goal of 90 is measured again in phase 6.
- Test accounts, listings, sessions and recently viewed rows were removed afterwards.

## What to check on your phone, in this order

1. Start the fast version and open the `-3000.app.github.dev/he` address **in a private tab**.
   The home page is short: search card, promise line, chips, "מקומות מומלצים", "לאן נוסעים?",
   "איך זה עובד", the host card, the footer. No Jewish life card.
2. In the search card, tap **קנייה**: the recommended row shows only places for sale, each with
   "למכירה". Tap **חודשי** and **מלונות**, then back to **לטווח קצר**.
3. In the cookie notice choose **"אישור הכל"**. Search for **Batumi** with dates and 2 guests, open
   two listings, then go back to the home page: "המשך מאיפה שעצרתם" shows the search and the two
   places. Tap the search: it opens again. Tap **"ניקוי"**: the places go ("ביטול" brings them
   back).
4. Open the **menu (☰)**: the four names לטווח קצר, חודשי, קנייה, מלונות; one "חיים יהודיים
   בגאורגיה"; under "עזרה ובטיחות", tap **"מספרי חירום"**: the safety page opens at the numbers.
5. Scroll to the **footer**: the new tagline and "נבנה על ידי משפחה ישראלית".
6. Search **Tbilisi** and open the map: it opens on Tbilisi's places, with some room around them.
   Remove Tbilisi from the search: the map shows the places all over Georgia.
7. Open **listing 104** and scroll to the map: "שדה התעופה של בטומי", with no code.
8. Log in as the demo owner (+995 555 000 011, the code shows on screen) and open **"פרסום
   מודעה"**: the new pledge sentence and "בדרך כלל תוך יום". Continue a draft or start a new
   listing: there is no footer inside the form.
9. Go to **step 9**: "אופציונלי" and "דילוג". Then **"הזמנות ומחיר"**: the check-in list starts at
   12:00 and ends at 22:00, with "גמיש" at the top.
10. Log in on a **second phone or browser** with the same account: the home page shows the same
    "נצפו לאחרונה".

## Open issues

- **Speed:** 88 on this machine, 2 below the goal of 90 (round 2: 91). It is measured again on the
  real hosting in phase 6, where a CDN usually does better.
- **Dimming outside Georgia on the map** (optional in the brief) is not done: there is no border
  data on this machine, and adding it would mean a new file from the internet. A portrait phone
  will always show some of the neighbouring countries above and below Georgia.
- **Map background:** the test machine has no map tiles, so the screenshots show the pins on a
  plain background. Please look at the map once on your phone.
- **Saved lists:** "שמורים · N מקומות" links to your saved places. Named lists that can be shared
  come in phase 5; the home page will show them then.
- **The tests are close to the login-code limit** (20 phone codes an hour from one address). New
  tests should sign in with an email code or reuse a session.

## Decisions taken while you were away (the careful option, as you asked)

- **"חדרים ומיטות"** is your wording, but the section filters rooms, bedrooms and bathrooms;
  there is no beds filter.
- **"אודות" left the computer tab row** because eight tabs didn't fit in Georgian. It stays in the
  phone menu and the footer.
- **Old links** like `/search?deal=rent` still work; they just don't highlight a tab.
- **A search for a city with no results** still opens the map on that city, not on all of Georgia.
- **The footer tagline in Russian, Arabic and Georgian** is our translation (in `OWNER_TODO.md`
  for a native speaker).
- **"דילוג" sits at the top of step 9**, next to the title, because three buttons don't fit in the
  bottom bar at 360 px in Georgian or Russian.
- **Times:** Hebrew writes "7:00" (the language's usual form), not "07:00". Arabic uses the 12-hour
  clock like English. A time saved earlier that is not in the new list is kept, never changed.
- **The device keeps the history only with "preferences" cookies**; the account copy is part of the
  account and does not depend on the cookie choice. Hidden or deleted listings are skipped on the
  home page but stay in the list.
- **Admin → Content → Home** lists the new sections only. Old switches for the Jewish life card,
  Shabbat times and recently viewed are ignored.
- **The map fit on a computer** (this check): results are fitted into the visible part of the map,
  so they are all on the first screen.
- **Tests sign in with email codes** where they can, to stay under the site's own login limit,
  which stays as it is.
