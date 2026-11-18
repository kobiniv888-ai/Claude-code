# Redesign — Phase 2 (home, search, filters, map)

*Checked on 1 November 2026 on branch `redesign`. Phase 2 redesigns the three screens a guest sees
first: the home page, the search results with the filters sheet, and the map. The listing page,
sign-in, Jewish life and the other pages keep their phase-1 layout until their phases.*

## Final check

| Check | Result |
|---|---|
| `npx tsc --noEmit` | no errors |
| `npx eslint .` | no errors, no warnings |
| `npm run i18n:check` | 40 namespaces × 5 languages, all keys match |
| `npx vitest run` | 66 files, 754 tests pass |
| Production build (`next build`) | passes |
| End-to-end tests (`npm run test:e2e`, on port 3914) | 45 of 45 pass (6 failed before the fixes below) |
| Screenshots at 390×844 Hebrew (light and dark), 1440×900 English, plus en/ru/ka/ar phones | checked, see below |
| Browser console | no errors on any of the screens below |

## What was built

### 1. Home (`/he`)
- **Hero:** a full-width photo slideshow of Georgia under a dark gradient. It shows the promise:
  - the small line "בית · נכסים בגאורגיה";
  - the headline "בית בגאורגיה, אצל מארחים שמחכים לכם";
  - the line "כל המארחים כאן מקבלים ישראלים ויהודים בברכה — בלי דחיות ובלי להסתיר מאיפה באתם. רק לישון טוב וליהנות."

  Photos crossfade every 7 seconds with a slow zoom. A pause button stops them. With reduced
  motion, only the first photo shows.
- **Search card** over the bottom of the photo:
  - the 4 deal tabs;
  - "לאן?" with instant suggestions;
  - "מתי?" (the Hebrew holiday calendar in a bottom sheet) and a guests stepper for short stays
    and hotels, or rooms and budget for monthly rent and buying;
  - a big navy "חיפוש" button.
- **Trust strip** under the card: מקבלים ישראלים בברכה · מארחים דוברי עברית · כשר, שבת ובית
  כנסת · בלי דמי תיווך · בעלים מאומתים.
- **Sections** (admins still turn them on and off and order them in Admin → Content → Home):
  - "לאן נוסעים?": a city photo for each city, with the real number of homes and that week's
    "כניסת שבת" time;
  - category photo tiles;
  - "נכסים מומלצים" and "נכסים חדשים" carousels with the shared listing card;
  - the Jewish-life band, with a live Shabbat countdown, the city chips and links to the
    community map, kosher food, the Hebrew calendar and emergency numbers;
  - the pledge section, "כאן אף אחד לא ידחה אתכם בגלל מי שאתם";
  - "איך זה עובד" with numbered steps for guests and for owners;
  - a short safety tip;
  - the "פרסמו את הנכס שלכם בחינם" card with a photo.
- **Footer:** accordions on phones, plus labelled language and currency pickers. The demo bar is
  one slim line that can be closed, and it stays closed on that device.

### 2. Search results (`/he/search?city=tbilisi`)
- **Top of the page on phones:**
  - a sticky summary line ("טביליסי · הוספת תאריכים") that reopens the search sheet;
  - a sticky chip row: "סינון (n)", deal type, price, rooms, then the Jewish quick chips (כשר ·
    מתאים לשבת · ליד בית כנסת · דובר עברית). Active chips are filled navy.
- **Count and sort** on one line ("5 נכסים בטביליסי · מומלץ ▾"). Sort opens a "מיון לפי" sheet.
- **Floating "מפה | מיון" pill** above the bottom bar.
- **Desktop:** the list and the map side by side, and the filters open as a side panel.
- **Loading:** cards fade into shimmering skeletons when loading takes longer than 200 ms.
- **No results:** a friendly empty state with one-tap fixes, each shown only when it brings
  results ("הסרת הסינון „5+ חדרי שינה” · נכס אחד", "חיפוש בכל גאורגיה").

### 3. Filters sheet
- Full height on phones, with "סינון", × and "ניקוי". Active filters appear as removable chips at
  the top.
- Deal type is a segmented control, and property types are icon tiles.
- **Price:** a histogram in the user's currency, a slider with two handles and min/max fields.
- Rooms, bedrooms and bathrooms are "הכול | 1+ … 5+" rows.
- **"כשרות ושבת":** big icon toggles for every Jewish filter from the brief.
- Every other filter is kept, in collapsed sections.
- **Footer:** "ניקוי הכול" and a live count ("הצגת 5 נכסים") that rolls to the new number. At 0
  results the sheet explains why and suggests fixes.
- No URL parameter changed; old links still work.

### 4. Map
- **Price pills:** navy pills ("₪266"). The tapped pill turns coral and grows.
- **Clusters:** count bubbles. Markers scale in when they appear.
- **Tapping a pill:**
  - on a phone, a card slides up from the bottom;
  - on desktop, it opens in a popup and the matching card in the list is highlighted.
- **"קהילה יהודית" layer:** synagogues, Chabad houses and kosher places, each with its own icon
  and a small legend. It reads the existing Jewish-life places (demo points say "דמו").
- **Controls:** "טוען…" and then "5 נכסים באזור", "חיפוש בזמן הזזת המפה", "מרכז מחדש" and
  "רשימה".
- **Kept:** CARTO tiles (light and dark), the map always starts on Georgia, and it loads only
  when needed.

### 5. Fixes made while joining the three parts
- **Page wider than the phone in Russian and Georgian search** (`search-results.tsx`). The long
  count line ("5 вариантов: Тбилиси · Рекомендуемые") stretched the results column to 396 px
  (Russian) and 453 px (Georgian) on a 390 px phone. That pushed the bottom bar half off the
  screen. The column is now limited to the screen width, and the count shortens with "…".
- **"Short stay" wrapped onto two lines** in the English home search card on phones. English now
  uses the same smaller tab text as Russian and Georgian, so all four tabs fit on one line
  (`home-search-card.tsx`).
- **A 168 KB font for one sign** (`src/components/layout/fonts.ts`):
  - **Cause:** every Hebrew page with a ₪ price downloaded the whole Noto Sans latin-ext font
    (168 KB), because that file claims ₪ before the Hebrew font does. On search it arrived
    before the first paint.
  - **Fix:** a small face just for ₪ (`shekelSign`) now comes first. It uses a 12 KB copy of the
    Noto Sans Hebrew font, the same way the ₾ sign already worked.
  - **Result:** the 168 KB file is no longer downloaded on any page.
- **Home sections below the first screen** use `content-visibility: auto` (`page.tsx`). The
  browser skips their layout until they come near the screen, so the hero paints sooner and the
  photos further down no longer compete with the hero photo. Going back to the home page from a
  listing still returns to the same spot.
- **The footer jumped on desktop search** (`search-results.tsx`). The map column appears only after
  the page becomes interactive, so the footer jumped down by ~180 px. A click aimed at the
  language menu then landed on "Русский". The map column now keeps its place, with a shimmering
  placeholder, from the first paint.
- **End-to-end tests updated where phase 1 changed things on purpose:**
  - **Demo data trimmed to 20 listings:** Tbilisi now has 2 short stays, not 3
    (`guest.spec.ts`, `mobile.spec.ts`).
  - **+972 default prefix:** the contact test now uses the helper that switches to +995
    (`guest.spec.ts`).
  - **Pledge step:** the preview moved to step 11, and the test owner accepted the pledge
    (`trust.spec.ts`).
  - **Lazy Jewish-life map:** the test scrolls to the places list first (`features.spec.ts`).

## Speed (Lighthouse mobile, production build, `next start`)

Measured with simulated throttling (mobile, 4× slower CPU, slow 4G). Each figure is the median
of 3 runs.

| Page | Before the joining fixes | After (final build) |
|---|---|---|
| `/he` (home) | Performance 74, LCP 4.0 s, FCP 1.7 s | **Performance 80**, LCP 4.6 s, FCP 1.8 s |
| `/he/search?city=tbilisi` | Performance 69, LCP 5.6 s, FCP 2.7 s | **Performance 78**, LCP 4.4 s, FCP 1.8 s |

The runs vary a lot. Across 6 runs of the same phone code, home scored 80–82 (plus one outlier
at 59) and search scored 78–81. Home's score rose because the first paint is steadier, not
because its LCP fell: the LCP stays at 4–4.6 s. Search lost about 1 s of LCP and 0.9 s of FCP
with the font fix.

The other scores on home: accessibility 100, best practices 100, CLS 0–0.04 (the cookie banner).
On an unthrottled desktop Chrome, the hero photo (the LCP) paints in about 0.4 s.

**The target (≥ 90, LCP < 2.5 s) is not met yet.** The hero image is not the problem: it is
23 KB, high priority, in the HTML and not lazy. What is left is site-wide and belongs to the speed
phase (brief §11.7):
1. **The HTML is heavy.** The home document is 626 KB (101 KB compressed). Every component
   appears twice: once as HTML, and once in the React data for the browser (281 KB). This data
   includes ~62 KB of interface text for client components. One listing card is ~18 KB of HTML.
   In the simulation, the hero photo cannot start loading until the whole document has
   arrived (about 1.1 s of the LCP).
2. **One global stylesheet** (272 KB, 42 KB compressed) blocks the first paint on every page,
   including the admin styles. Before the first paint the browser spends ~250 ms on style and
   layout, which is 1 s at the simulated phone speed.
3. **The Hebrew page loads 3 small fonts plus the Latin one** (35 + 12 + 12 + 13 KB) before the
   text settles.

These items were measured, not fixed: each needs a careful change to the shared shell, the card or
the CSS setup.

## What to check on your phone

Open the codespace address in Hebrew, then switch to dark mode in the menu and look again.

1. **Home** (`/he`):
   - within the first screen you should read: places in Georgia, "every host welcomes Israelis
     and Jews", and "כשר, שבת ובית כנסת";
   - the photos should change slowly (every ~7 s). Tap the pause button at the top corner;
   - in the search card, switch between the 4 tabs: "מתי?/כמה אורחים?" becomes rooms and budget
     for "חודשי" and "קנייה";
   - type "טב" in "לאן?", choose טביליסי, tap "חיפוש".
2. **Scroll the home page:** the city photos with "כניסת שבת", the category tiles, the two
   carousels (swipe them), the Shabbat countdown, the pledge, "איך זה עובד", and the footer
   accordions.
3. **Search** (`/he/search?city=tbilisi`):
   - scroll: the summary and the chip row stay at the top;
   - tap "כשר" in the chip row: it turns navy and the list updates;
   - tap "מומלץ ▾": the sort sheet slides up.
4. **Filters:** tap "סינון":
   - drag the price handles (choose "קצר" first);
   - tap "מטבח כשר": the button at the bottom should roll to the new count;
   - swipe the sheet down to close it.
5. **Map:** tap "מפה" in the floating pill:
   - tap a price pill: it turns coral and a card slides up;
   - turn on "קהילה יהודית";
   - tap "רשימה" to go back.
6. **No results:** choose filters that nothing matches (for example 5+ bedrooms with a kosher
   kitchen in Tbilisi). The page should offer one-tap fixes.
7. **Russian and Georgian** (switch language in the menu): open search. The page must not slide
   sideways, and the bottom bar must sit fully on the screen.

## Screenshots

All screenshots are in the scratchpad of this session (`…/scratchpad/gate2/shots/`). They cover
the home page, the search list, the filters sheet (open, and after choosing kosher), the sort
sheet, the map (with a tapped pill), the community layer and the empty state. Each was taken at
390×844 Hebrew in light and in dark, and at 1440×900 English. There are also first screens in
English, Russian, Georgian and Arabic on a phone.

## Open issues

- **Lighthouse target:** about 80 on home and 78 on search, against a target of 90 (see
  "Speed"). The remaining causes are site-wide and belong to the speed phase.
- **Map tiles need the CARTO key** (phase-1 task B). Without it the map shows a plain background
  and the "no key" notice. Price pills and the community layer could not be checked over real
  tiles.
- **The map's status chip** ("5 נכסים באזור") is light grey in dark mode. It has enough contrast,
  but looks a little bright.
- **Community places overlap listing pins** when the map shows all of Georgia (demo data sits in
  the same cities).
- **Synagogue tiles** in the Jewish-life band show "תמונה בקרוב" until the Wikimedia script runs
  (phase-1 task A).
- **Featured homes on desktop:** only 2 demo listings are promoted, so the "נכסים מומלצים" row
  has 2 cards and empty space beside them. This comes from the data, not the layout.
- **Count line in Russian and Georgian search on phones:** it now shortens with "…"
  ("5 вариантов: Тби…") to make room for the long sort name.
- **Known shared-code issues** (from the builders, not changed in this phase):
  - CSS modules do not work: the Turbopack `*.css` rule in `next.config.ts` turns
    `*.module.css` into plain CSS.
  - `cn()` drops the custom text sizes (`text-h1`, `text-small`…) when they are combined with a
    text colour. The builders suggest `createCn` from `cn/config` with a font-size extension in `src/lib/utils.ts`.
- **CLS 0.04 from the cookie banner** on the first visit (home and search). It appears after the
  page has painted.

## Hebrew wording noticed (not changed)

- **"הכל" and "הכול":** the home search card and the home "הכל ←" links write "הכל", but search
  and filters write "הכול". One spelling everywhere would read better.
- **"קצר" in the filters' deal control** is short for "לטווח קצר", the home tab's name. On its own
  it reads oddly. "לילות" or "יומי" would fit the space.
- **Still open from phase 1:** "דמו" versus "הדגמה" (listing page and Jewish-life map), and the
  demo greeting "שלום, Demo".
