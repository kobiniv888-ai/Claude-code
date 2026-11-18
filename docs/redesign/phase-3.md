# Redesign — Phase 3 (listing page, sign-in and navigation, Jewish life, post wizard)

*Checked on 1–2 November 2026 on branch `redesign`. Phase 3 redesigns everything a guest or host
meets after the search: the listing page, sign-in, the header, bottom bar and side menu, Saved,
Help, Contact, Safety, Jewish life and the post-a-listing wizard. Three engineers built it; this
page is the integration check.*

## Final check

| Check | Result |
|---|---|
| `npx tsc --noEmit` | no errors |
| `npx eslint .` | no errors, no warnings |
| `npm run i18n:check` | 40 namespaces × 5 languages, all keys match |
| `npx vitest run` | 68 files, 769 tests pass |
| Production build (`next build`) | passes |
| End-to-end tests (`npm run test:e2e`, on port 3924) | 45 of 45 pass (run twice: before and after the fixes below) |
| axe (WCAG 2.1 A/AA) on the listing page (home + hotel), the sign-in sheet, `/login` and 7 wizard steps, at 390 Hebrew light and dark and 1440 English | no serious or critical findings (3 kinds found and fixed, see below) |
| Horizontal overflow at 360 px in he, en, ru, ar, ka (16 pages each) | none (4 found and fixed, see below) |
| Screenshots at 390×844 Hebrew (light and dark), 1440×900 English, plus Arabic and Russian first screens | checked, see below |
| Browser console | no errors on any of the screens below |

## What was built

### 1. Listing page (`/he/listing/91`, hotel: `/he/listing/111`)
- **Gallery.** On phones, a full-width swipeable carousel with a "1 / 6" counter and round back,
  share and save buttons. "כל התמונות" opens a photo grid in a bottom sheet; a tap opens the
  full-screen viewer. On desktop, a mosaic (1 big + 4) with "All N photos". Video and 360° tours
  are kept.
- **Title block.** The badge row (מקבלים ישראלים בברכה · מאומת · דמו, then Promoted / New /
  Price dropped / Business), a big title, "city · neighborhood" with a pin, and a meta line
  (posted date · views · ID). Real data only.
- **Price** with its unit, the currency switch, and one note line (per m², minimum stay or
  price dropped).
- **Key facts** as 2-column icon tiles.
- **"לשומרי מסורת" card:** a navy header, then the kosher kitchen, the nearest synagogue on foot
  with its name, a Chabad house when it is within 30 minutes, "the host keeps Shabbat", the
  Shabbat checklist with ✓/✗ (including the sukkah), the other Jewish features, hotel kosher
  supervision and meals, and this week's Shabbat times for the city with the candles and a live
  countdown.
- **Description** with "קראו עוד" (only when the text is really cut) and the
  "auto-translated · show original" switch. Then the amenity chips and house rules as chips.
- **Location map:** the approximate-area circle, a house pin, and synagogues and kosher places
  within 2.5 km, with a legend and walking times. It loads only when scrolled near.
- **Host card:** photo or initials, name, the green "welcomes" badge, verified badges,
  languages, member since, local time and contact hours. Reply times were removed: nothing
  computes them.
- **Safety tip, video-call tip, report**, then a "נכסים דומים" carousel with the shared card.
- **Sticky contact bar on phones:** the price, a green WhatsApp button (login → CAPTCHA → safety
  tip → WhatsApp with a ready message that ends with the listing link), "הצגת טלפון" when the
  owner has a phone, and "⋯" for Telegram, Viber and "כל דרכי הקשר". Desktop keeps a sticky side
  box with the same actions.
- **Hotels:** room types as cards with a photo carousel, fact chips and a price.
- **Skeleton:** a page-shaped `loading.tsx` shows at once. This is a deliberate exception to the
  "no `loading.tsx` on fast public pages" rule in CONVENTIONS; the reason is in the file.

### 2. Sign-in, header, bottom bar, side menu
- **Sign-in sheet:** an original animated SVG (a key turns, the door with a mezuzah opens onto
  warm light, a heart and a green check appear; a still picture with reduced motion), a short
  headline, 3 benefit rows, then the phone form (+972 in he/en/ru/ar, +995 in ka, remembered
  choice). Google and Apple show only when configured. A bottom sheet on phones, a centred dialog
  from 768 px; `/login` has the same card.
  - The title is "Log in to continue" when an action opened it (WhatsApp, save…), and
    "ברוכים הבאים לבית" from the menu or the bottom bar.
- **Header (phones and tablets):** hides when scrolling down, comes back when scrolling up, near
  the top, on keyboard focus and on every new page. It stays while a sheet or the menu is open
  and never hides with reduced motion. The desktop header does not hide (the sticky map column
  on search sits under it).
- **Bottom bar:** a navy pill slides to the tapped tab at once (mirrored in RTL); "+" is a raised
  coral button with a springy press.
- **Side menu:** Post and Log in buttons on top, icon rows in groups (search, Jewish life, help
  and safety), then the language, currency and theme pickers as pills, then the legal links.

### 3. Saved, Help, Contact, Safety
- **Saved:** the shared card grid with a private note, Compare and Remove under each card. The
  empty state has a coral heart, "התחילו לחפש" and 3 city chips.
- **Help:** a search hero, topic tiles, chip filters and FAQ accordions; the urgent scam report
  is the first contact card.
- **Contact:** the urgent scam path as a coral strip above the form, and a side card for email,
  help and safety.
- **Safety:** a sticky "on this page" chip row, one-line warning signs that open on tap, and
  numbered help steps.

### 4. Jewish life (`/he/jewish-life`)
- A synagogue photo hero with a slow zoom, and a card with the 4 round quick actions (מפת
  הקהילה, זמני שבת, לוח שנה עברי, מספרי חירום).
- The promise in a green card ("כל המארחים כאן מקבלים ישראלים ויהודים בברכה") with 3 one-tap
  searches: near a synagogue, kosher kitchen, Shabbat-friendly.
- Photo cards for synagogues, kosher food and community, with the real number of places; a tap
  filters the map below without a reload.
- The Shabbat countdown card with candles and chips for every city, next to the table of all
  cities with the parasha.
- The places map and list, the Hebrew calendar (month switch), upcoming holidays, guides "coming
  soon", and emergency numbers as big tap-to-call cards (only 112 until admins add more).

### 5. Post-a-listing wizard (`/he/post`)
- "שלב X מתוך Y" with one bar segment per step (done = navy, current = coral). The button opens
  a sheet listing every step.
- A sticky footer: full-width Back / Next on phones, a floating pill on desktop.
- Deal type as 4 photo tiles; property type, amenities and Jewish features as big icon tiles.
  The real "מתאים לשבת" badge appears once it is earned.
- Photos: a "תמונת שער" badge with a coral ring, 40 px buttons, a bigger drop zone; drag to
  reorder as before.
- **Pledge step (required):** the statement in big type, "למה זה חשוב" with the green badge, a
  big checkbox and a green "אישור ההתחייבות" button. It saves the accepted text version through
  `acceptPledge`.
- Preview: the site's one listing card, filled from the wizard, with the green badge once the
  pledge is accepted.
- Steps, URLs, autosave, validation, room types, iCal, contact (+995 default), translations and
  publishing are unchanged.

## Integration fixes made in this check

| Problem | Where | Fix |
|---|---|---|
| Georgian listing pages were 33 px wider than a 360 px phone and slid sideways: the host card's long "welcomes" badge widened its grid column | `listing-page/contact-box.tsx` | the owner block grid is `grid-cols-1`, so the badge truncates |
| The contact bar cut the Arabic hotel price ("ابتداءً من ≈ 73 $" lost its first digit) | `listing/[id]/page.tsx` | the bar price may wrap to a second line |
| axe "definition-list" and "dlitem" (serious) on every listing page: `dt`/`dd` were wrapped in an extra `div` | `listing-page/contact-box.tsx` (host facts) | `dt` and `dd` are direct children of the row; the icon sits inside the `dt` |
| axe "color-contrast" (serious) in the wizard's Jewish step: the not-yet-earned Shabbat badge was at 55 % opacity (2.9:1) | `wizard/steps/jewish-step.tsx` | greyscale only, no opacity |
| Wizard contact step overflowed in Russian and Georgian, and the "shown first" pill covered the arrows | `wizard/steps/contact-step.tsx` | the row wraps; the move/remove buttons go to a second line when needed |
| Wizard preview step overflowed in Georgian ("ნაბიჯი 8: …" buttons don't wrap) | `wizard/steps/publish-step.tsx` | these buttons may wrap |
| Account overview (not redesigned, but every login lands there) overflowed in Russian and Georgian | `account/page.tsx`, `account/overview.tsx` | `grid-cols-1` and long badge names may break |

No translation, schema, package or test changes were needed; the end-to-end tests that the
builders updated (the WhatsApp-first contact flow and the new Shabbat section on Jewish life)
protect the same behaviour as before.

## What to check on your phone

Open the codespace address in Hebrew, then switch to dark mode in the menu and look again.

1. **A listing** (`/he/listing/91`):
   - swipe the photos; tap "כל התמונות", then a photo;
   - scroll: the navy "לשומרי מסורת" card, the Shabbat checklist, this week's times;
   - the bar at the bottom stays: tap "WhatsApp" (it asks you to log in first), then "⋯".
2. **A hotel** (`/he/listing/111`): the room-type cards, and "הצגת טלפון" in the bar.
3. **Sign-in:** tap "כניסה" in the bottom bar. Watch the door open; swipe the sheet down to close.
4. **Header and bottom bar:** on search, scroll down (the header slides away) and a little up
   (it comes back). Tap the bottom tabs and watch the navy pill slide.
5. **Menu (☰):** the groups, then the language, currency and theme pills at the bottom.
6. **Saved** (log in as the demo guest): cards with notes; then log in as the owner for the
   empty state.
7. **Help, Contact, Safety:** search the help, open an FAQ, tap a chip on Safety.
8. **Jewish life** (`/he/jewish-life`): the 4 round buttons, the green promise card, tap the
   "בתי כנסת" photo card (the map filters), switch the Shabbat city to בטומי, and move the
   calendar to next month. Tap 112.
9. **Post a listing** (+): the deal photos, the steps sheet ("שלב 1 מתוך 11"), add photos and
   pick a cover, the pledge step, and the preview.
10. **Russian, Arabic and Georgian:** open a listing and the wizard's contact step. Nothing should
    slide sideways.

In the codespace (development mode) a round "N" button sits at the bottom-left corner. It is
Next.js's developer button, covers the "כניסה" tab and the "⋯" button, and does not exist on the
real site.

## Screenshots

All screenshots are in this session's scratchpad (`…/scratchpad/gate3/shots/`, side-by-side
sets in `…/gate3/m/`):
- 390×844 Hebrew light (`he-light-*`) and dark (`he-dark-*`): the listing page from top to the
  map, "כל התמונות", the "⋯" menu, the hotel room types and the phone tap, the sign-in sheet
  (two animation moments, typing, `/login`), the header hidden and back, the bottom-bar pill,
  the side menu (top and pickers), Saved (with items and empty), Help, Contact, Safety, Jewish
  life (hero to emergency numbers, the Batumi switch, the calendar month switch), and the
  wizard (start page, deal, property, photos, Jewish, pledge, preview, steps sheet);
- 1440×900 English (`en-desk-*`): the same pages;
- Arabic and Russian phones (`ar-light-f-*`, `ru-light-f-*`): first screens of the listing,
  hotel, Jewish life, sign-in, menu, Help, Safety, Contact, wizard and Saved.

## Open issues

- **Map tiles need the CARTO key** (`NEXT_PUBLIC_MAP_TILE_KEY`). Without it the listing map and
  the community map show a plain background and the "no key" notice.
- **Jewish life on phones is long.** The places list shows all 13 places as full cards (each with
  the "sample point" warning) before the Shabbat times, calendar and emergency numbers. Showing
  3 places with "show all", or the map first, would shorten it a lot. The quick-action buttons
  do jump straight to each section.
- **Listing contact on phones depends on the owner's channels.** Listing 91's owner has only
  WhatsApp and Telegram, so its bar has no "הצגת טלפון"; the hotel has all of them.
- **The hotel bar price** ("החל מ־≈ 229₪") now wraps to two lines on 360 px phones in Hebrew and
  Arabic. It is readable; a shorter "from" form in the bar would keep it on one line.
- **Accordions don't animate their height** (transform/opacity rule); they fade and slide.
- **"Alerts for new places"** is not a sign-in benefit yet: `siteConfig.features.savedSearchAlerts`
  is off, so that row says "Contact hosts directly" until the flag is turned on.
- **The listing route has a `loading.tsx`**, a documented exception to CONVENTIONS.
- **Lighthouse was not measured in this phase** (the speed phase, brief §11.7, follows).
- **Wizard photos with a cover** were checked by the builder and by the end-to-end posting test
  (which uploads photos), not in this check's screenshots: the gate's draft had no photos.

## Hebrew wording noticed (not changed)

- **"חבר/ה מאז"** in the host card is the only slash form left on the listing page. "באתר מאז
  אוגוסט 2026" would read better and needs no gender.
- **"הכל" and "הכול"** are still mixed: the "הכל ←" section links and the home search card say
  "הכל"; search, filters and the new Jewish-life map chips say "הכול" (also noted in phase 2).
- **"דמו" and "הדגמה"** are still mixed: listing badges say "דמו", Jewish-life places say
  "(נקודת הדגמה)" and "נקודה לדוגמה — לא מקום אמיתי" (open since phase 1).
- **"חד-פעמי"** in the sign-in text uses a hyphen; elsewhere the site uses the maqaf ("ו־", "מ־").
- **The struck-through "מקום לסוכה"** in the Shabbat checklist means "no room for a sukkah".
  Screen readers hear "אין: מקום לסוכה"; sighted readers may find a plain "אין מקום לסוכה" clearer.
