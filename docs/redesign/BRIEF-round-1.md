# Bayit (בית) — redesign brief

Read this whole brief before you change anything. First explore the codebase. Then tell me your plan: which pages and components you'll touch, in what order, and any questions you have. Work on a new git branch called `redesign` and commit after each phase so we can always go back.

I recorded three screen videos that you can't watch, so section 3 describes them in detail. I may also attach three images (`bayit-ref-1-zillow.jpg`, `bayit-ref-2-myhome.jpg`, `bayit-ref-3-livo.jpg`). Each one has 8 captioned frames from those videos. If they're attached, use them together with the text.

---

## 1. What Bayit is, and the feeling it must give

Bayit is a Hebrew-first site, also available in English, Russian, Arabic and Georgian. Israeli and Jewish people use it to find places in Georgia: short stays, monthly rentals, homes to buy, and hotels or guesthouses. Guests contact owners directly by WhatsApp, Telegram, Viber or phone, with no booking fees.

**Why it exists:** when I traveled with my family, many hosts on Airbnb and Booking declined us only because we are Jewish and from Israel. On Bayit that never happens. Every host here is happy to host Israelis and Jews, so nobody has to be afraid of being refused or ashamed of their religion or where they were born. They can just sleep well and enjoy their vacation.

**This promise is the most important thing the redesign must show.** Within 3 seconds on the home page, a visitor must understand three things:
1. These are places in Georgia.
2. Every host here welcomes Israelis and Jews.
3. Jewish needs are built in: kosher, Shabbat, and a synagogue nearby.

## 2. What's wrong today (from my recording of the site on my phone)

I used Chrome on Android, at about 390px wide, in Hebrew. Both dark and light mode.

- **It looks plain.** There are almost no photos. Pages are white or navy boxes with small outline icons and paragraphs of text, and nothing moves. The home page today, top to bottom:
  - a text-only hero
  - 6 small category tiles
  - an empty "הנכסים החדשים" section
  - 4 text cards under "למה בית"
  - "איך זה עובד"
  - the Shabbat times cards
  - "שמרו על עצמכם"
  - "פרסמו את הנכס שלכם בחינם"
  - the footer
- **The purpose isn't clear.** The hero says "מוצאים בגאורגיה בית שמרגיש כמו בבית". That's nice, but nothing says that hosts here welcome Israelis and Jews, which is the whole point. Kosher, Shabbat and the walking time to the synagogue only appear inside sentences.
- **It looks empty.** There are no listings, so I keep hitting empty states:
  - "הנכסים הראשונים בדרך"
  - "לא נמצאו נכסים"
  - "עדיין אין כאן נכסים"
  - "0 נכסים" on the map

  I can't judge a design this way.
- **It feels slow.** I'm opening it through the Codespaces URL (`…app.github.dev`) while it runs in dev mode. The Next.js dev badge showed "Compiling…" and "Rendering…" on almost every page. On the Hebrew calendar (inside the Jewish life pages), "Rendering…" stayed on for about 30 seconds even though the page was already visible.
- **Bugs I hit:**
  1. **Map tiles blocked.** After I zoomed out, every tile turned into "403 Access blocked — App is not following the tile usage policy of OpenStreetMap's volunteer-run servers".
  2. **Map starts on the whole world.** With no city chosen, it opened on a world map with "0 נכסים". It should open on Georgia.
  3. **Login error.** I entered +995 555 00 00 21, tapped "שליחת קוד", and got "משהו השתבש. נסו שוב."
  4. **Missing sign-in buttons.** The login text says "בלחיצה אחת עם Google או Apple…", but no Google or Apple buttons appear.
  5. **Wrong phone default.** The prefix is always +995, but most guests will have Israeli numbers (+972).
  6. **Weak suggestions.** Typing "טב" in "לאן" only offers `חיפוש "טב"` with a spinner. It never suggests "טביליסי".

**Keep all of this.** Redesign it, but don't remove it:
- The bottom nav (ראשי, חיפוש, the big center "+" פרסום, שמורים, כניסה).
- The 4 deal tabs (לטווח קצר / השכרה חודשית / קנייה / מלונות).
- The property types.
- The Jewish filters:
  - המארח שומר שבת
  - המארח דובר עברית
  - ארוחת בוקר כשרה
  - ארוחות כשרות
  - ארוחות שבת
  - שעות רחצה נפרדות
  - מתאים למשפחות גדולות 8+
- The Hebrew calendar and Shabbat times per city (טביליסי, בטומי, קוטאיסי, קובולטי, גודאורי, בקוריאני, בורג'ומי, קזבגי, סיגנאגי, מסטיה), including the weekly parasha.
- The "חיים יהודיים בגאורגיה" page and its quick links: מפת הקהילה, זמני שבת, לוח שנה עברי, מספרי חירום.
- All 5 languages, with correct RTL and LTR.
- The currency choice (EUR / ILS / USD / GEL) and the theme choice (light / dark / system).
- Verified owners, and the "דמו" labels and banner.
- The help center, safety center and contact form.

## 3. The inspiration videos, described

Take their **patterns, layout ideas and motion**. Do **not** copy their logos, names, brand colors or text.

### 3.1 Zillow (mobile web). Main reference for results, cards, map, filters and the listing page

- **Results page**
  - At the top: a menu icon, a search field ("Address, neighborhood, city, ZIP") and "Sign in" (the avatar once you're signed in).
  - Under it, a row of pill buttons: "For rent ▾", "Filters (1) ▾" with a count badge, a solid blue "Save search", and a round AI sparkle button.
  - On scroll, the search field scrolls away but the pill row **sticks to the top**.
  - Then a title ("Houses For Rent"), the count ("276,826 rentals available") and "Sorted by Recommended".
- **Listing card, photo first**
  - An edge-to-edge photo, about 16:10, that you can swipe, with small dots.
  - Two tag pills on the photo: a white one ("Charming residences") and a blue one ("Special offer" or "10 Weeks Free"). A white outline heart sits in the opposite corner.
  - Under the photo: a big bold price ("$1,619+"), a small check icon with underlined "Total monthly price", and a "•••" menu.
  - One line with the name and address, cut off with an ellipsis.
  - Grey chips with the price per unit type ("$1,619+ 1bd").
  - One highlight line ("Valet trash • Rare in Maricopa County (6%)").
  - At the bottom, a phone icon and a full-width blue "Check availability" button.
- **Floating pill.** A white "Map | Sort" pill with a shadow floats at the bottom center of the list, above the tab bar.
- **Bottom tab bar.** 5 icons with labels; the active one is blue.
- **Map view**
  - Full screen, with purple circle markers that have a tiny house icon. Dense areas become cluster bubbles ("10 homes", "23 homes"), and some markers have a green "New" tag.
  - Pills at the top: "Remove Boundary ×" and "Re-center". Elsewhere: "Schools ▾" and "Draw" (draw your own search area).
  - A dark chip at the bottom left says "Loading…" while fetching, then shows a count ("1,421 of 186,610") or "No matching results". There's also a white "List" pill and a round layers button.
  - **Tapping a marker slides a listing card up from the bottom over the map**, with its photo carousel, tags, heart, price and details.
- **Filters**
  - A full-screen sheet with the title "Filters" and ×. Active filters appear as removable chips at the top ("$700/mo or less ×").
  - A segmented control: For Sale | For Rent | Recently Sold.
  - **Price:** a histogram showing how many homes sit at each price, with a two-handle range slider under it, a floating value bubble ("$1.4K"), and Min/Max inputs.
  - Bedrooms and bathrooms: segmented rows ("Any | 1+ | 2+ | 3+ | 4+ | 5+") plus a "Use exact match" checkbox.
  - Home type: a 2×2 grid of tiles, each with an icon and a label; the selected tile is tinted blue.
  - If nothing matches, it shows "No results found — Adjust your search criteria" right inside the sheet.
  - A sticky footer with "Reset all filters" (text link) and a big blue "Apply".
- **Sort.** A sheet titled "Sort results by" with full-width options; the selected one is highlighted.
- **Listing page**
  - **Gallery:** a full-width photo with floating round buttons: back on one side, and a white pill with heart, share and more on the other. On the photo there's an "All photos" button and dots. "All photos" opens a vertical scroll of big photos.
  - **Title block:** a small grey tag ("Special offer"), a **very large bold title** on two lines with a round blue phone button next to it, the address, a link to the website, and "Verified ✓" in green.
  - **Actions:** a row with a primary "⚡ Book tour now" (with a small second line, "Next: Tomorrow, 10:00am") and outline "Apply" and "Email" buttons. Below it, a green callout card with an icon ("Special offer!…").
  - **Key facts:** a 2-column grid of light-grey rounded tiles, each with an icon and short text ("Pet-friendly", "Covered parking", "In-unit laundry").
  - A tip card with a lightbulb ("Your dream home is waiting — Twenty new units were recently added").
  - **Units and highlights:** an "Available units" table with tiny floor-plan thumbnails and a "Message" link per row. "What's special" shows a highlight card and grey tag chips.
  - **Neighborhood:** a map with category chips (Highlights, Restaurants, Groceries), "Travel times — Add a destination", score tiles for "Getting around", and school cards with round colored score badges.
  - **Lower sections:** a cost calculator, horizontal carousels ("Nearby apartments", "Similar apartments") and an FAQ.
  - A **sticky blue "Book tour now" bar** stays at the bottom the whole time.
  - When a listing opened, Zillow showed a blank page with a spinner for about 2 seconds. We should do better.
- **Other screens**
  - An "Ask Zillow" AI chat with suggestion chips ("Help me set a rental budget", "What's it like to live in this area?").
  - Tapping the search field shows "Current Location" and "Your Saved Homes (1)".
  - Favorites have "Create collection" (a dialog with two selectable cards, Personal and Shared), a "Compare" checkbox per card, and a sort dropdown.
  - Empty pages show a friendly illustration and one button. A no-results page shows search tips with icons.

### 3.2 myhome.ge (Georgian site, green). Reference for the search form, bottom sheets and Georgian conventions

- **Home search card** (white, rounded):
  - A 2-column grid of dropdowns: Transaction type, Real estate type, Price, Area.
  - A Location field with a pin icon, and a free-text field ("ID, Phone, Text, Cadastral code").
  - A "Bedroom 1 2 3 4 5 6" row of small number chips (green when selected).
  - "Detailed filter (4)" with a count badge, a trash button to clear, and a big full-width green **Search**.
  - Under the card, a horizontal row of square icon tiles ("Apartments price", "For sale near metro", "For rent near metro", "Developers apartments").
- **Bottom sheets.** Every dropdown opens a sheet that **slides up from the bottom while the page behind dims to grey**. The header has the title, × and "Clear". Inside are chip groups:
  - transaction types
  - real estate types as **icon chips** (Apartments, Houses, Country houses, Land plots, Commercial, Hotels)
  - status (Old building, New building, Under construction)

  A green "Choose" button sits at the bottom. The price sheet adds a "Full | Square meter" switch, a small ₾/$ currency toggle, From/To inputs and two columns of quick-pick values.
- **Results**
  - A sticky "Show Filters (3)" bar, "Owner" and "Construction company" checkboxes, and "38934 listing forms were found".
  - Cards have a big rounded photo carousel. The next photo peeks in at the edge, and the last slide is dimmed with a camera icon and "+12 Photo".
  - A red "S-VIP" badge marks promoted listings. Hide and heart icons sit on the photo.
  - The price is bold ("200,000$"), with a tiny ₾/$ toggle and the price per m².
  - Then the title ("4 room apartment for sale in didube") and a row of icons for m², rooms, bedrooms and floor.
  - Last: the metro station, the address as a blue link, and the date ("31 Oct, 14:44").
- **New projects cards**
  - The photo has a blue "Under construction" tag (or a green "Finished" one) and white pills for payment options (Internal installments, Lump sum, Bank installments).
  - Below: the name with "From 1,700$", the developer's logo and name, and a district pill.
  - Then a mini table ("2 Rooms · From 43 m² · From 86,000$") and an outline "View the project" button.
  - Promoted cards get a soft tinted background.
- **Price statistics**
  - Dark rounded cards ("Average rent for 3-bedroom apartments") with a glowing red line chart that **draws itself from left to right when it scrolls into view**, and a green "Price statistics →" button on top.
  - A segmented "1 Bed. / 2 Bed. / 3 Bed. / Studio" control.
  - District tables with "Full price | m² price" and "USD | GEL" toggles.
- **Navigation.** A side menu of icon-plus-label rows, a footer with round social icons and accordions, and a bottom tab bar: Main, Searches, Add (+), Favorites, Profile.

### 3.3 livo.ge (Georgian site, blue). Reference for home sections, carousels, the listing contact bar and sign-in

- **Home**
  - A light-blue announcement banner.
  - A search card with a "For sale | For rent" segmented control, dropdowns, Location, "Keyword, ID, Tel.", bedroom number chips, "Detailed filter" and a big blue Search.
  - "Ask Livo AI — Find easily with AI help": a wide rounded banner with a **blue-to-coral gradient**, a sparkle icon and an arrow.
  - A horizontal row of **round colored icon buttons** with labels underneath (Evaluation, Auction, Property registration, Photo service, For sale near metro, Developer projects…).
- **Carousels**
  - "S-VIP Listings — View All →": tall photo cards in a horizontal carousel, with the next card peeking in. Each has a red "S-VIP" badge, a heart, small "Viewed" and "Owner" tags on the photo, and the price in ₾ with the price per m² and a ₾/$ toggle.
  - "New projects — View All →": similar cards with status and payment pills plus room-type rows. One card has a mint-green tint.
- **Listing page**
  - A big photo with a "1/12" counter.
  - A meta line: "31 Oct. 14:51 • 5 View • ID:26528114".
  - A big price ("831,744 ₾") with a currency toggle, a green "Top price" tag and the price per m².
  - The title and address, then a grey box with the cadastral code and a copy button.
  - Spec rows, each with an icon, a value and a small grey label.
  - A host card ("Tiko · 1 listings · Individual"), a report link, and a "Location" map with a black custom pin (a house icon) and a fullscreen button.
  - **A sticky bottom bar with the owner's name, an "Individual" tag, and a blue "📞 Show number" button.**
- **Sign-in modal.** An **animated illustration**: a padlock, a green shield with a check, and a password field where the ✱ stars pop in one by one while small dots float around. Then:
  - "Sign in for a better experience"
  - a green pill, "✓ Trusted by over 2 million users"
  - 3 benefit rows with icons
  - a blue "Sign in" button and "Don't have an account? Create"
- **Service page.** A huge condensed two-color uppercase headline, a gradient "Choose a service" card with a "Standard | Accelerated" toggle, a big price and a list with blue checks. Then numbered step cards ("02 Plan the visit", "03 …") in soft lavender and slate, with the number in a white rounded square.
- **Bottom tab bar.** Home, Searches, a **filled blue round "+"** in the middle, Favorites, Profile.

### 3.4 Motion I saw in them

- Bottom sheets slide up while the page dims, and slide back down when closed.
- Line charts draw in from left to right when they appear.
- The sign-in illustration is animated: the stars pop in one by one and the dots float.
- The price histogram's bars animate when the data loads.
- Photos show a grey placeholder first, then appear. Swipe carousels with dots are everywhere.
- On the map, a "Loading…" chip shows while fetching, markers appear, and tapping one brings up a card.
- While scrolling, the search bar scrolls away, the filter pills stay stuck at the top, and contact or booking bars stay stuck at the bottom.

## 4. Design direction

- **Photo-first.** Every listing, city, category and big section gets a real photo. Replace paragraphs with an icon and 2–4 words.
- **Simplified.** One clear main action per screen and short Hebrew copy. Put details behind "הצג עוד" or accordions.
- **Light theme as the default.** All three references are bright. Keep dark mode, and make it look just as good.
- **Colors.** Keep Bayit's navy and coral/terracotta (the "+" button), but use them with more confidence:
  - navy for primary buttons and headings
  - coral for the "+", highlights and the selected state
  - a warm off-white page and white cards
  - one green for "verified / welcomes" badges

  Contrast must meet WCAG AA.
- **Type.** Bigger, heavier headings in the Zillow style, with 16px body text. Fonts must cover Hebrew, Latin, Cyrillic, Arabic and Georgian, with proper fallbacks per script.
- **Shapes.** Rounded cards (16–20px), pill chips and buttons, soft shadows, and tap targets of at least 44px. Use one consistent icon set, a bit bigger than now, inside tinted circles (like livo's round buttons).
- **Mobile-first at 390px**, but desktop must look great too: grids of 3–4 columns, and list and map side by side on search.
- **Make prices Israel-friendly.** When the UI is in Hebrew and the user hasn't picked a currency, default to ₪ (ILS). Same idea for the phone prefix: +972 for Hebrew, +995 for Georgian, with a searchable country picker.

### Bayit badge system

Use the same badges everywhere: cards, listing page, filters and map popups. Show at most 3 on a card, then "+2".
- **"מקבלים ישראלים בברכה"** (green, the most prominent): the host accepted the Bayit pledge (below).
- "מאומת": verified owner (this already exists).
- "דובר עברית"
- "מטבח כשר" / "ארוחות כשרות"
- "מתאים לשבת", based on whatever the data model has (mechanical key, stairs or a Shabbat elevator, hot plate…).
- "X דק' הליכה לבית כנסת"
- "שומר שבת"

Use clear icons (Shabbat candles, a synagogue, a kosher stamp, a speech bubble), not emoji and not flags.

### The Bayit pledge (new, and it needs a DB field, so check with me before changing the schema)

When an owner lists a place, they must tick: **"אני מתחייב/ת לקבל בברכה אורחים ולקוחות ישראלים ויהודים, ולא לסרב לאף אחד בגלל דת או מדינת מוצא"**. Write it in all 5 languages. Listings with the pledge show the green badge. Add a short "ההבטחה של בית" section on the home page that explains it.

## 5. Page by page

### 5.1 Home (ראשי)
1. **Hero.** A full-bleed slideshow of real Georgia photos (Tbilisi old town, Batumi seafront, the Kazbegi mountains…) with a dark gradient so the text stays readable. Each photo crossfades slowly with a light zoom. On top: the eyebrow "בית · נכסים בגאורגיה", a big promise headline and one supporting line. Suggested copy (improve it if you can, keep it short):
   - H1: **"בית בגאורגיה, אצל מארחים שמחכים לכם"**
   - Sub: **"כל המארחים כאן מקבלים ישראלים ויהודים בברכה — בלי דחיות ובלי להסתיר מאיפה באתם. רק לישון טוב וליהנות."**
2. **Search card.** It floats over the bottom edge of the hero and is the star of the screen (like myhome and livo).
   - The 4 deal tabs, as a segmented control.
   - **לאן?**, with instant suggestions.
   - **מתי?** and **כמה אורחים?**, only for stays and hotels. For rent and buy, show rooms and budget instead.
   - A big navy **חיפוש** button.
3. **Trust strip.** 4–5 small icon-plus-text items in a horizontal scroll: מקבלים ישראלים בברכה · מארחים דוברי עברית · כשר ושבת · בלי דמי תיווך · בעלים מאומתים.
4. **"לאן נוסעים?"** A carousel of tall photo cards, one per city, with the name on the photo. Each shows the real number of listings and a small "כניסת שבת 17:31" tag taken from the existing zmanim code. Tapping a city opens the search filtered to that city.
5. **Categories as photo tiles** (2 columns on mobile): דירות, בתים ווילות, חדרים, מלונות ובתי הארחה, למכירה, מותאם לשבת ליד בית כנסת.
6. **"נכסים חדשים".** A carousel of the same listing card used in search, with a "הכל ←" link.
7. **"חיים יהודיים בגאורגיה" band.** Photos of the synagogues in Tbilisi and Batumi, plus this week's Shabbat card with a gentle candle-flame animation and a countdown ("שבת נכנסת בעוד 2 ימים ו־4 שעות"). Add links to the community map, kosher food, the Hebrew calendar and emergency numbers.
8. **"ההבטחה של בית".** The pledge in 3 icon-plus-line items. A strong title: "כאן אף אחד לא ידחה אתכם בגלל מי שאתם".
9. **"איך זה עובד".** Keep the guests/owners toggle. Show 3 steps with big numbers and an icon each, like livo's numbered cards.
10. A smaller, friendlier safety tip.
11. **"פרסמו את הנכס שלכם בחינם".** A big CTA card with a real photo.
12. **Footer.** Accordions on mobile, plus the language and currency pickers.

Make the demo banner a slim bar that can be dismissed.

### 5.2 Search results (חיפוש)
- **Sticky top bar.** A compact search summary ("טביליסי · 12–15 בדצמ' · 4 אורחים") that reopens the search sheet when tapped.
- **Sticky chip row** that scrolls sideways, under the summary:
  - "סינון (3)" with its count badge
  - deal type, price and rooms
  - Jewish quick chips: כשר · מתאים לשבת · ליד בית כנסת · דובר עברית

  Active chips are filled navy.
- **Count and sort** on one line ("24 נכסים · מומלץ ▾"). Sort opens a sheet.
- **One listing card component, reused everywhere:**
  - a swipeable photo carousel with dots; the last slide shows "+12 תמונות"
  - a heart, and up to 2 tags on the photo ("מקבלים ישראלים בברכה", "חדש", "דמו")
  - a big price with its unit ("₪450 ללילה" / "₪6,200 לחודש" / "₪1.2M")
  - the title, the city or neighborhood, an icon row (rooms, guests, m², floor) and the badge row

  The whole card is tappable.
- **Floating "מפה | מיון" pill** at the bottom center, above the bottom nav (like Zillow).
- **Loading:** shimmering skeleton cards, never a blank page or a lonely spinner.
- **No results:** a friendly empty state with one-tap fixes ("הסרת הסינון 'כשר'", "הרחבת האזור") instead of a dead end.
- **Desktop:** the list on one side and the map on the other.

### 5.3 Map
- It opens on Georgia, or on the searched city. Never the whole world.
- **Markers:** rounded navy price pills ("₪450"). The selected one turns coral and gets bigger. Clusters show counts, and markers animate in.
- **Layer toggle "קהילה יהודית"** that shows synagogues, Chabad houses and kosher places from the existing community-map data, each with its own icon.
- **Tapping a marker slides a listing card up** from the bottom (like Zillow).
- **Controls:**
  - a "חיפוש בזמן הזזת המפה" toggle
  - "מרכז מחדש"
  - a "טוען…" chip, then a count chip ("24 נכסים באזור")
  - a "רשימה" pill to go back
- Light and dark basemaps. Fix the tiles (section 9).

### 5.4 Filters (bottom sheet)
- **The sheet:** full height and slides up over a dimmed page. The header has "סינון", × and "ניקוי". Active filters show as removable chips at the top.
- **Deal type:** a segmented control.
- **Price:** a histogram of the listings' prices with a 2-handle slider, a value bubble and min/max inputs, all in the user's currency.
- **Rooms, beds and guests:** segmented rows, "הכל | 1+ | 2+ | 3+ | 4+ | 5+".
- **Property type:** a grid of icon tiles.
- **"כשרות ושבת" section:** big icon toggles instead of plain checkboxes.
- **Everything else:** collapsed sections (מאפיינים, פרטי הנכס, מפרסם, המודעה).
- **Sticky footer:** "ניקוי הכל", plus a big button with a **live count**: "הצגת 24 נכסים". The number animates as filters change. When the count is 0, the sheet explains that nothing matches and suggests what to change.

### 5.5 Listing page
1. **Gallery.** Full width and swipeable, with a "1/12" counter and floating round back, save and share buttons. "כל התמונות" opens a grid, and tapping a photo opens a fullscreen viewer.
2. **Title block.**
   - A badge row: מקבלים ישראלים בברכה · מאומת · and "דמו" for demo listings.
   - A big bold title, then the city and neighborhood with a pin.
   - A livo-style meta line (posted date · views · listing ID), using real data only.
3. **Price** with its unit and an inline currency switch.
4. **Key facts** as 2-column icon tiles (rooms, beds, guests, m², floor, parking, AC…).
5. **"לשומרי מסורת" highlight card**, like Zillow's colored callout:
   - kosher kitchen
   - the Shabbat checklist, with ✓/✗
   - space for a sukkah
   - whether the host keeps Shabbat
   - minutes on foot to the nearest synagogue, with its name
   - this week's Shabbat times for that city
6. **Description** with "קראו עוד". Then amenity chips and house rules.
7. **Location map** with a custom house pin and nearby synagogues and kosher places.
8. **Host card:** photo or initials, name, "מאומת", languages spoken and member since. Real data only.
9. **Small safety tip.** Then a "נכסים דומים" carousel.
10. **Sticky bottom contact bar** (like livo):
    - the price on one side
    - a green **WhatsApp** button that opens WhatsApp with a prefilled message in the user's language, including the listing link
    - "הצגת טלפון" as the secondary action
    - Telegram and Viber in a small menu
11. While the page loads, show a skeleton of it instantly. Never a blank page with a spinner.

### 5.6 Post a listing (+)
- A step-by-step wizard: one topic per screen, a progress bar, big tappable tiles and chips.
- Photo upload with drag-to-reorder and a choice of cover photo.
- A preview before publishing.
- **The pledge step is required.**

### 5.7 Sign-in
- **Layout:** a bottom sheet or modal like livo's, with a small **animated original illustration** (for example, a door opening with a key and a check mark).
- **Content:** a short headline, then 3 benefit rows with icons (saving places, alerts for new places, posting a listing).
- **Sign-in options:** Google and Apple buttons when they're configured, plus phone login with the country picker defaulting by language.
- **Errors:** clear messages in plain language.

### 5.8 Jewish life (חיים יהודיים)
- A photo hero (a synagogue).
- The 4 quick actions as big round icon buttons.
- A Shabbat card with the candle animation and the countdown, plus city chips to switch cities.
- Sections with photos: synagogues, kosher food, community.
- Emergency numbers as cards you can tap to call.

### 5.9 Saved, help, contact, safety, navigation
- **Saved:** the same cards, and a nice empty state with "התחילו לחפש".
- **Help, contact and safety:** friendlier icon cards, FAQ accordions, less text per screen.
- **Header:** compact. It hides when scrolling down and comes back when scrolling up.
- **Bottom nav:** the active indicator slides between tabs, and "+" stays the coral FAB.
- **Side menu:** icon-plus-label rows.

## 6. Motion: more moving parts, smooth and purposeful

- **Hero:** a slow crossfade with a light zoom (6–8 s per photo). On load, the headline, sub and search card fade up in a stagger.
- **Sections and cards:** fade up 12–16px over 300–400 ms with a 40–60 ms stagger, only the first time they appear.
- **Carousels:** CSS scroll-snap, with the next card peeking in and the active dot stretching into a pill.
- **Cards:** shrink slightly (0.98) when pressed. On desktop, the photo zooms slightly on hover.
- **Heart:** pops (scale 1 → 1.25 → 1) and fills with coral.
- **Bottom sheets:** slide up in about 250–300 ms over a dimmed backdrop, with a drag handle, and swipe down to close.
- **Filters:** the histogram bars grow when the sheet opens, and the count on the apply button rolls to the new number.
- **Loading:** shimmer skeletons, and photos that fade in from a blur placeholder.
- **Map:** markers scale in, the selected marker grows, and the card slides up.
- **Shabbat card:** a CSS candle flicker and a live countdown.
- **Charts and numbers** (if you add stats): draw or count up when they come into view.
- **Sign-in illustration:** a short looping animation, made as SVG or CSS.

**Rules:** animate only transform and opacity. Honor `prefers-reduced-motion` by turning off everything that isn't essential. Prefer CSS. If you need a library, use one small one consistently, and ask me before adding it.

## 7. Photos (important)

- **Never generate images with AI.** No AI art and no AI-made "photos".
- Use **real photos** from free sources: **Unsplash** or **Pexels** (free license), or **Wikimedia Commons** (check each file's license; CC BY and CC BY-SA require credit).
- **Download** them into the project (for example, `public/photos/…`) and optimize them. Don't hotlink.
- List every photo in `public/photos/CREDITS.md` with the file, source URL, author and license. If any license needs attribution, add a small "קרדיט לתמונות" link in the footer.
- **Good subjects:**
  - Tbilisi old town, Narikala and the wooden balconies
  - Batumi's seafront
  - Kazbegi and Gergeti
  - Gudauri and Bakuriani in winter
  - Borjomi, Sighnaghi and Mestia
  - the Great Synagogue of Tbilisi and the Batumi synagogue (Wikimedia Commons)
  - cozy apartments, villas, kitchens and hotel rooms, for the demo listings
- **Avoid:** people as the main subject, logos, watermarks, and anything that looks like a real business's listing.
- **If you can't find a fitting real photo,** don't fake it. Put a styled placeholder (a soft gradient, an icon and "תמונה בקרוב") and add an entry to **`PHOTOS_NEEDED.md`** in the project root with:
  - the file path to use
  - what the photo should show
  - the aspect ratio and minimum size
  - where it appears

  I'll provide those photos at the end.
- **Demo data:** seed 12–20 demo listings across the cities and deal types, using stock interior photos. They must always be labeled "דמו", be easy to remove with one flag or script, and never pretend to be real hosts or real reviews.

## 8. Speed

- **Measure in production mode,** not dev: `npm run build && npm start`. Run it on the forwarded Codespaces port so I can feel the real speed on my phone, and add the commands to the README.
- **Then fix what's actually slow:**
  - the hero photo uses `priority` and the right `sizes`
  - every image goes through `next/image` (AVIF/WebP, lazy-loaded below the fold, blur placeholders)
  - the map loads only when needed (dynamic import, no SSR)
  - heavy client JS stays out of the first load
  - Shabbat times and calendar data are cached or precomputed instead of computed on every request
  - find out why pages sat on "Rendering…" in dev: a slow or hanging request, or a Suspense boundary that never resolves
- **Make it feel instant.** Prefetch listing pages from the cards, and show skeletons immediately.
- **Target:** Lighthouse mobile Performance ≥ 90 and LCP < 2.5 s on the home page in production mode.

## 9. Bugs to fix

1. **Map tiles.** Stop using `tile.openstreetmap.org` directly; their servers are blocking us. Switch to a provider that allows app use with an API key, such as MapTiler or Stadia Maps (both have free tiers). Use light and dark styles, keep the attribution, and put the key in `.env` with a README note. Start the map on Georgia.
2. **Login.** Find out why sending the SMS code fails. If no SMS provider is configured, say so clearly in dev and show a friendly message to users. Show the Google and Apple buttons when they're configured, or change the text that promises them. Default the phone prefix by language.
3. **"לאן" suggestions.** Make them instant from a local list of Georgian cities and neighborhoods in all 5 languages, so "טב" → טביליסי and "Bat" → Batumi. Match typos and both spellings (בטומי / באטומי).

## 10. Don'ts

- Don't copy logos, brand names, colors or text from Zillow, myhome.ge or livo.ge.
- **Don't invent reviews, ratings, testimonials, user counts ("trusted by X") or response times.** Only show numbers that come from real data.
- Don't remove existing features, pages or languages. Write every new string in all 5 languages (he, en, ru, ar, ka). Keep RTL and LTR correct by using logical CSS properties and flipping directional icons.
- No AI-generated images.
- Don't add big libraries or change the database schema without asking me first.
- Don't break existing URLs.

## 11. How to work

0. Explore the repo, then send me your plan and your questions. Wait for my OK.
1. **Design system:**
   - tokens for colors (light and dark), type scale, spacing, radius and shadows
   - components: Button, Chip, SegmentedControl, Badge (the Bayit badges), ListingCard, PhotoCarousel, BottomSheet, Skeleton, EmptyState, SectionHeader with "הכל ←", StickyContactBar
   - a hidden `/dev/ui` page that shows all of them
2. **Demo data and photos:** the seeded demo listings, `CREDITS.md` and `PHOTOS_NEEDED.md`.
3. **Home page.**
4. **Search:** the results, the filters sheet, and the map with its tiles fix.
5. **Listing page.**
6. **The rest:** sign-in, Jewish life, saved, help, contact, safety, and the header, menu and bottom nav.
7. **Speed and bugs:** a speed pass in production mode, the remaining bug fixes, and a final check.

After each phase:
- Run the site and check it at 390×844 in Hebrew RTL (light and dark) and at 1440×900 in English LTR.
- If you can, take Playwright screenshots and look at them yourself.
- Fix anything that looks off.
- Then give me a short summary and tell me what to check on my phone.

## 12. Done when

- The home page explains the promise in 3 seconds, is full of real photos and has gentle motion.
- No page shows a blank screen or a long spinner. Skeletons everywhere.
- Every listing card shows the badge row, and the filters and map include the Jewish options.
- The pledge works when posting a listing and shows the green badge.
- The map opens on Georgia, its tiles load, and it works in light and dark.
- Login works, or fails with a clear message. The prefix defaults to +972 in Hebrew.
- All 5 languages, RTL and LTR, and light and dark mode look right.
- Lighthouse mobile ≥ 90 in production mode.
- `public/photos/CREDITS.md` and `PHOTOS_NEEDED.md` exist, and there are no AI images.
