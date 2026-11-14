# Bayit (בית): redesign round 2

**New brand (purple, ב logo), a cleaner and smaller layout, Jewish content as an extra, and booking short stays on the site.**

Read this whole brief before you change anything. It replaces the design decisions of the first redesign brief. Anything from round 1 that this brief doesn't mention stays as it is.

---

## 0. How to work

1. Explore the codebase and the current state after round 1.
2. Send me your plan before you start:
   - the phases, and which pages and components you'll touch
   - the booking data model (section 7)
   - your questions

   Wait for my OK.
3. Work on a new git branch called `redesign-2`. Commit after each phase.
4. **Ask me first** before you change the database schema, add a library, or add any paid service.
5. After each phase:
   - Run the site and check it at 390×844 in Hebrew (light and dark), and at 1440×900 in English.
   - Take Playwright screenshots and look at them yourself. Fix anything that looks off.
   - Send me a short summary and tell me what to check on my phone.

**Design files.** If the repo has a folder called `design/`, it contains:
- the logo files (`design/logo/*.svg`)
- ready-made icons and share images (`design/png/`)
- two phone mockups of the new home page (`design/mockups/bayit-home-light.png` and `design/mockups/bayit-home-dark.png`)

Open the mockups and match them. If the folder isn't there, everything you need is in this brief: the logo's SVG code is in 3.1 and the mockups are described in 3.8.

---

## 1. What Bayit is (short reminder)

Bayit is a Hebrew-first site, also in English, Russian, Arabic and Georgian. Israeli and Jewish travelers use it to find places in Georgia: short stays, monthly rentals, homes for sale, and hotels or guesthouses.

**The promise:** every host on Bayit has promised to welcome Israeli and Jewish guests, so nobody gets turned away for who they are.

**Who uses it:** mostly regular Israeli travelers, and many of them aren't religious. Kosher food, Shabbat and synagogue info matter to some of them. So these are a helpful extra, not the main thing.

**Goals of this round:**
- Look professional and calm.
- Be understood within seconds.
- Show more on each phone screen.
- Let guests book short stays on the site itself.

---

## 2. What's wrong now (from my phone recording after round 1)

**Design**
- **Everything feels too big on the phone.** Normal body text is fine. The problems:
  - Headings are huge; one listing title takes 4 lines.
  - Buttons and tags are thick.
  - There's a lot of empty space.

  So each screen shows very little.
- **It looks chopped and all over the place.** The home page has about 12 sections that all look equally important. It also uses about 6 kinds of cards and 5–6 accent colors: navy/periwinkle, coral, green, orange and red-brown. Nothing tells the eye what matters.
- **There's too much Jewish content everywhere:**
  - Shabbat times on every city card
  - a Shabbat countdown on the home page and on every listing
  - a big "Shabbat-friendly near a synagogue" tile
  - synagogue walking times repeated on cards and on listings
- **The colors look plain, and the logo (a house in a blue square) looks like a template.**
- **The cards are crowded:**
  - up to 5 colored tags plus "+2"
  - two prices, for example "≈ 195₾ · $75 original"
  - the green "מקבלים ישראלים בברכה" badge on every single card
- **The listing page repeats itself:**
  - the walk to the synagogue appears 3 times
  - the safety warning appears twice
  - "Welcomes Israelis" appears twice
  - every listing shows the same city-wide Shabbat countdown
- **Short stays can only be arranged through WhatsApp or Telegram.** We want booking on the site, like Airbnb and Booking.

**Bugs:** the full list is in section 8.

**Already good. Keep all of these:**
- the promise and the required pledge
- the Georgian condition terms in the post form (black, white and green frame)
- the private exact address and the private cadastral code
- the live-video safety tip
- the owner's local time and best time to call
- "Auto-translated · Show original"
- the CARTO maps and phone login
- all 5 languages and the demo labels
- the help center and the safety center

---

## 3. The new brand

### 3.1 Logo

**The mark** is the Hebrew letter ב drawn as a house:
- a roof (^) instead of the letter's flat top line
- the right wall
- the base, with the letter's small foot sticking out on the right

The left side stays open, like an open house. The letter's name, "bet", means "house", and בית starts with it.

**The name next to the mark:**
- **"Bayit"** everywhere.
- **"בית"** when the site language is Hebrew, and in Hebrew share images, emails and social posts.

**Delete the old logo and the old house icon everywhere:** header, footer, favicon, web app manifest, emails, share images and loading screens.

Create these files, or copy them from `design/logo/` if it exists.

`public/brand/bayit-mark.svg`: the mark alone. It uses `currentColor`, so CSS sets its color, and its box is tight so it sits well next to text.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="126 109 294 304"><path d="M150 238 L256 142 L362 238 L362 380 M150 380 L414 380" fill="none" stroke="currentColor" stroke-width="54" stroke-linejoin="round" stroke-linecap="butt"/></svg>
```

`public/brand/bayit-app-icon.svg`: the white mark on a purple rounded square, for the favicon and app icons.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#4B2A8C"/><g transform="translate(-19 -5)"><path d="M150 238 L256 142 L362 238 L362 380 M150 380 L414 380" fill="none" stroke="#FFFFFF" stroke-width="54" stroke-linejoin="round" stroke-linecap="butt"/></g></svg>
```

`public/brand/bayit-app-icon-square.svg`: a full-bleed square (no rounded corners), for maskable app icons.
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#4B2A8C"/><g transform="translate(256 256) scale(0.82) translate(-273 -261)"><path d="M150 238 L256 142 L362 238 L362 380 M150 380 L414 380" fill="none" stroke="#FFFFFF" stroke-width="54" stroke-linejoin="round" stroke-linecap="butt"/></g></svg>
```

**`<Logo>` component**
- Build it from the inline mark SVG plus the name as live text.
- The name is Rubik SemiBold (600). Latin letter-spacing is −0.01em; Hebrew has none.
- Sizes: the mark's height is 1.4 × the font size, and the gap is 0.25 × the font size. In the header, use a 22px font and a 31px mark.
- The mark comes first in reading order: left of "Bayit" in LTR, right of "בית" in RTL.
- Colors: purple on white or lavender; white on purple and on dark backgrounds. Never put the purple mark on a dark background.
- The logo is a link to the home page, with `aria-label` "Bayit" (or "בית" in Hebrew).
- Never stretch, rotate, outline or recolor it, and never add shadows or gradients.

**Icons**

Generate these from `bayit-app-icon.svg`. Ask me before adding an image library, or use the ready PNGs in `design/png/`.
- `favicon.ico` with 16, 32 and 48 sizes, plus a 32px PNG or SVG icon
- an Apple touch icon at 180
- PWA icons at 192 and 512
- a maskable 512 icon, made from the square version
- the manifest: name "Bayit · בית", short name "Bayit"
- `theme-color` set to #4B2A8C for light and #0F0D14 for dark

**Share images (Open Graph, 1200×630)**
- Purple background, the white mark, the name, and the page's tagline, all in the page's language ("בית" for Hebrew, "Bayit" for the others).
- Use the framework's built-in share-image generation.
- Listing pages use the listing's first photo with a purple bar and the logo.
- Default images are in `design/png/bayit-share-image-he.png` and `-en.png`.

### 3.2 Colors

**Purple and white in light mode. Purple and black in dark mode.** (The brand story, for the About page: purple is Israel's blue and Georgia's red mixed together.)

**Light**

| token | hex | used for |
|---|---|---|
| primary | `#4B2A8C` | main buttons, selected tabs and chips, links, the logo, the active nav item, the header and hero band |
| primary-pressed | `#3B206F` | pressed and hover states |
| primary-tint | `#F4F0FB` | selected chip backgrounds, soft highlight blocks |
| primary-tint-border | `#E4DAF5` | borders of tinted blocks |
| bg | `#FFFFFF` | page background |
| surface-muted | `#F4F2F7` | segmented-control track, photo placeholders |
| text | `#18161F` | all headings and body text |
| text-muted | `#5E5A6B` | secondary text |
| placeholder | `#6B6778` | input placeholders |
| border | `#ECEAF1` | lines, card borders |
| border-strong | `#E4E1EA` | input borders |
| error | `#B42318` | error messages only |
| success | `#1E7B4F` | "verified" and "booking confirmed" only |

**Dark**

| token | hex | used for |
|---|---|---|
| bg | `#0F0D14` | page background |
| surface | `#18161F` | cards |
| raised | `#221F2C` | raised areas, segmented-control track |
| border | `#2A2733` | lines |
| border-strong | `#3A3646` | input borders |
| text | `#F4F3F7` | headings and body text |
| text-muted | `#A29FAE` | secondary text |
| primary-button | `#7B52E3` | main buttons, with white text (deep purple disappears on black) |
| primary-text | `#B9A4FF` | links, icons, active nav item |
| bottom-nav | `#141219` | bottom navigation bar |
| error | `#FF8A80` | errors only |
| success | `#6FD39A` | verified and confirmed only |

**Color rules**
- **Purple is the only accent color.**
  - No coral, navy, orange or green badges.
  - The "דמו" tag becomes a neutral grey tag.
  - Red and green appear only in error and success messages.
- **Use purple sparingly:** main buttons, selected states, links, the logo, and the header/hero band. Most of each screen is white (or black) with near-black (or near-white) text.
- Never set long text in purple.
- All text must have at least 4.5:1 contrast. These tokens pass, so keep it that way.
- The theme follows the device by default. Keep the light/dark/device switch in the menu.

### 3.3 Type

**Fonts**
- **Rubik** for everything; it covers Hebrew, Latin, Cyrillic and Arabic.
- Add **Noto Sans Georgian** as the fallback for Georgian.
- Load only the weights you use (400, 500, 600) through the framework's font loader.

**Mobile sizes**

| element | size / weight / line height | notes |
|---|---|---|
| hero title | 26px / 600 / 1.2 | max 2 lines |
| page title | 22px / 600 / 1.25 | |
| section title | 18px / 600 | |
| listing title (on its page) | 22px / 600 | max 3 lines, then an ellipsis |
| card title | 15px / 500 | 1 line |
| body | 16px / 400 / 1.5 | never smaller |
| form inputs | 16px | smaller makes iPhones zoom in |
| secondary text | 14px | |
| labels and captions | 12–13px | |
| price on cards | 16px / 600 | |

**Desktop:** hero 40px, page title 30px, section title 22px. Body stays 16px.

### 3.4 Spacing and shapes

- **Grid:** 4px.
- **Page padding:** 16px on phones and 24px on tablets. Desktop content is at most 1200px wide.
- **Spacing:** 32px between sections on phones (not 64px or more), and 12px inside cards.
- **Corner radius:** 16px for cards and photos, 12px for inputs, 14px for buttons. Chips and tags are full pills.
- **Heights:**
  - main buttons 48px; secondary buttons 40px
  - chips 34px
  - tags 22–24px with 12px text
  - every tap target at least 44px (use padding to get there)
- **Shadows:** only the floating search card and bottom sheets have one. Cards get a 1px border and no shadow.

### 3.5 Icons

Use one stroke icon set (the one already in the repo) with a 1.75–2px stroke, at 20–24px. Icons are grey or purple. No multicolored icon circles.

### 3.6 Motion

Keep motion subtle and fast:
- bottom sheets slide up in about 250ms
- skeletons while loading
- photos fade in
- the heart pops when tapped

Remove anything big or slow: the zooming hero slideshow and the staggered fade-in of every section. Honor `prefers-reduced-motion`.

### 3.7 Photos

- **Real photos only.** No AI-generated images.
- **Make them smaller:** home-page carousel cards about 70% of the screen width, city cards about 140px wide.
- Keep `CREDITS.md` and `PHOTOS_NEEDED.md` up to date.

### 3.8 The mockups, in words

**Light home (390×844), RTL**
- **Header:** 56px tall, purple, with the white ב mark and "בית" on the right. On the left: a "HE" pill with a white outline and a white menu icon.
- **Hero band:** the purple continues below the header, with a white two-line title and one white line under it. The band ends with 28px rounded bottom corners.
- **Search card:** white, with a soft shadow, overlapping the band by 48px. Inside it:
  - a light-grey segmented track where "לטווח קצר" is selected (purple pill, white text)
  - the "לאן?" field with a purple pin icon
  - two half-width fields, "מתי?" and "אורחים"
  - a full-width purple "חיפוש" button with a search icon
- **Under the card:** a purple shield icon and "כאן אף אחד לא ידחה אתכם בגלל מי שאתם".
- **Recommended places:** the "מקומות מומלצים" title with a purple "הכל ←" link. Cards are 250px wide with a 150px photo, a purple "חדש" tag and a white round heart button. Under the photo: the price line, the title, and the location in grey.
- **Bottom nav:** white, with the active "ראשי" in purple and a raised purple "+" circle with a white border.

**Dark home:** the same layout on `#0F0D14`, with these differences:
- no purple band
- the title is white, with "שמחכים לכם" in lavender (`#B9A4FF`)
- the search card is `#18161F` with a `#2A2733` border
- the selected tab and the search button are bright purple (`#7B52E3`)
- icons are lavender
- the bottom nav is `#141219`

---

## 4. Jewish content becomes an extra

**Remove:**
- the Shabbat time chips on city cards
- the Shabbat countdown card on the home page and on listing pages
- the big "Shabbat-friendly near a synagogue" category tile (it becomes a filter chip)
- the green "מקבלים ישראלים בברכה" badge on cards. Every host has accepted the pledge, so on a card it tells you nothing.
- the synagogue walking time as a standard card tag (see the card rules in 5.3)

**Keep, in their proper place:**
- **In the filters:** a "כשרות ושבת" group in the filter sheet, with plain toggles:
  - מטבח כשר
  - ארוחות כשרות
  - מתאים לשבת
  - בית כנסת במרחק הליכה (≤10 / ≤20 דק׳)
  - המארח שומר שבת
  - המארח דובר עברית

  Also add a quick "כשר ושבת" chip in the results chip row and in the home category row.
- **On listing pages:** one folded "כשרות ושבת" section, closed by default. Show it only if the place has at least one of these features (see 5.4).
- **The Jewish life hub:** keep the "חיים יהודיים בגאורגיה" page with Shabbat times by city, the calendar, the community map, emergency numbers and the guides. Link to it from:
  - the menu
  - one slim card near the bottom of the home page
  - the folded section on listings ("זמני שבת ב[עיר] ←")

**The promise: say it once per screen, clearly.**
- Home: the hero's subtitle.
- Search results: one slim line above the results, with a shield icon: "כל המארחים כאן התחייבו לקבל ישראלים בברכה".
- Listing page: one line in the host block at the top.
- Post form: the required pledge step, which already exists.

---

## 5. Page by page

### 5.1 Header, menu, bottom nav

**Header**
- 56px tall. In light mode: purple, with the white logo and white icons. In dark mode: `#0F0D14` with the white logo.
- The language pill and the menu button sit on the other side from the logo.
- Keep the hide-on-scroll-down, show-on-scroll-up behavior.

**Bottom nav**
- Five items: ראשי, חיפוש, "+" (פרסום), שמורים, פרופיל.
- The active item is purple (lavender in dark mode).
- The "+" is a purple circle with a white plus (bright purple in dark mode). Remove the coral.

**Side menu:** same items as now. Icons are grey, and the active item is purple. Remove the multicolored icon circles.

**Bug fix:** the bottom nav must never cover content.
- Give every page bottom padding equal to the nav's height plus the safe-area inset.
- On first load, the hero's search button was partly hidden behind the "+".

### 5.2 Home: short and clear

Show only these, in this order:

1. **Header and purple hero band**
   - Title: "בית בגאורגיה, אצל מארחים שמחכים לכם"
   - One line under it: "כל המארחים כאן מקבלים ישראלים בברכה."
   - No slideshow and no photo behind the text.
2. **Search card overlapping the band** (white, with a shadow)
   - Segmented tabs: לטווח קצר / חודשי / קנייה / מלונות.
   - The "לאן?" field.
   - Two fields under it: "מתי?" and "אורחים" for stays and hotels, or "חדרים" and "תקציב" for monthly rentals and buying.
   - A full-width purple "חיפוש" button.
   - The whole card must be fully visible above the bottom nav on a 390×844 screen.
3. **Promise line** with a shield icon: "כאן אף אחד לא ידחה אתכם בגלל מי שאתם".
4. **Category row:** small chips, each with an icon, scrolling sideways: דירות, בתים ווילות, חדרים, מלונות, למכירה, כשר ושבת. This replaces the big photo tiles.
5. **"מקומות מומלצים":** a carousel of cards about 70% of the screen wide, with the next card peeking in, plus a "הכל ←" link.
   - "נצפו לאחרונה" appears right after it, only for visitors with history.
6. **"לאן נוסעים?":** small city cards with a photo, the city name and the number of places. No Shabbat times.
7. **"איך זה עובד":** one compact row of 3 steps with icons:
   - מחפשים → מזמינים באתר → משלמים למארח כשמגיעים
   - The host version of these steps moves to the post page.
8. **Slim card:** "חיים יהודיים בגאורגיה · זמני שבת, בתי כנסת, אוכל כשר ←".
9. **Host card:** "יש לכם מקום בגאורגיה? פרסמו בחינם", with a button.
10. **Footer:** accordions on phones, plus language and currency.

**Remove from the home page:**
- the 5-chip trust strip
- the 4 "למה בית" cards
- the separate "נכסים חדשים" section (merge it into the recommended places)
- the safety tip (it lives on listings and in the safety center)
- the Shabbat card
- the long "how it works" cards

The demo banner stays slim and dismissible.

### 5.3 Search results, filters, map

**Results page**
- **Sticky top:** a search summary pill (city · dates · guests) that reopens the search sheet, plus a "סינון" button with a count.
- **Chip row** (scrolls sideways): price, rooms, property type, "כשר ושבת". Active chips use the purple tint with purple text.
- **One slim line:** the promise line, then the count and sort ("24 מקומות · מומלץ ▾").
- **Cards:** one column on phones, compact (rules below), with a floating "מפה" pill.
- **Desktop (1024px and up):** the list on one side and the map on the other.

**Filters sheet:** keep the round-1 structure with the new style. Add the "כשרות ושבת" group as plain toggles, not big icon tiles. The apply button keeps its live count.

**Map:** keep CARTO. Price pills are purple; the selected one is darker and bigger. Keep the community layer toggle.

**Listing card** (one component, used everywhere)
- **Photo:** 4:3, swipeable, at most 5 dots.
- **On the photo:** the heart in the top corner on the end side, plus at most one tag: "חדש" or "דמו" (grey).
- **Under the photo:**
  - the title (1 line)
  - "אזור · עיר" (1 line, grey)
  - one line of facts: "2 אורחים · חדר שינה 1 · מיטה 1"
  - the price line, by type:

| type | price line |
|---|---|
| short stays | "₪420 / לילה" (weight 600), plus "₪1,260 סה״כ" in grey once dates are chosen |
| monthly | "₪6,200 / חודש" |
| sale | "₪1.2M" |

- **Tags:** at most 2 small text tags, chosen from: מטבח כשר, מתאים לשבת, "X דק׳ לבית כנסת" (only from verified places), דובר עברית. If the visitor filtered by one of these, show that tag first.
- **One price only,** in the visitor's currency, with "≈" if converted. The host's original currency appears only on the listing page.

### 5.4 Listing page: quiet, every fact once

**Short stays, top to bottom:**
1. **Gallery:** swipeable, a "1/12" counter, floating back, share and save buttons, and "כל התמונות".
2. **Title:** 22px, max 3 lines. Under it: "אזור · עיר", then one line of facts: guests · bedrooms · beds · baths.
3. **Host line:** avatar or initials, "מארח: [שם] · מאומת", and the pledge line with a shield: "המארח התחייב לקבל ישראלים בברכה".
4. **Three highlights** with icons, computed from the listing's data (for example צ׳ק-אין עצמי, נוף לים, מטבח כשר).
5. **Description:** 5 lines, then "קראו עוד" opens the rest in a bottom sheet. Keep "תורגם אוטומטית · הצגת המקור".
6. **"מה יש במקום":** 6 amenities, then "הצגת כל 18".
7. **"כשרות ושבת" accordion:** closed by default, and only shown if the place has at least one of these features. It contains:
   - the kitchen's kosher status
   - the Shabbat checklist, written plainly (see bug 8.8)
   - the nearest synagogue's name and walking time, only from verified places
   - a link: "זמני שבת ב[עיר] ←"

   No countdown.
8. **"זמינות":** a 2-month calendar with booked dates lightly crossed out. Tapping dates sets the booking dates.
9. **Location:** a map of the approximate area, with "המיקום המדויק יישלח אחרי ההזמנה".
10. **"חשוב לדעת":** one section with:
    - check-in and check-out times
    - house rules (3, then "הצגת הכל")
    - the cancellation policy
    - the pay-at-check-in note
    - the live-video safety tip. This is the only safety block on the page.
11. **Full host card:** languages, member since, local time, and best time to call.
12. **"מקומות דומים":** a carousel.

**Sticky bottom bar (short stays):**
- The price per night (plus the total once dates are chosen) and a purple "הזמנה" button, or "בחירת תאריכים" if no dates are picked yet.
- "שאלה למארח" (WhatsApp) and "השוואה" (compare) move into the "…" menu.

**Monthly rentals and homes for sale:**
- The same page, without the booking calendar.
- The sticky bar keeps WhatsApp and "הצגת טלפון", as now.
- For sale listings, fold the price history under "היסטוריית מחיר".

**Remove:**
- duplicate safety blocks
- the Shabbat card
- the repeated "Welcomes Israelis"
- duplicate synagogue entries (show each place only once)

### 5.5 Booking: the guest's side (new, for short stays and hotel rooms)

**Decisions:**
- **Guests book on the site and pay the host at check-in.** Bayit takes no money in this round; online payment is a later phase.
- **Booking is instant.** If the dates are free, the booking is confirmed right away. A host can't pick who books; this is how the site enforces the pledge.
- **Hosts set rules, not people:** minimum nights, maximum guests, check-in times and house rules.

**Steps**
1. **Dates and guests**
   - A calendar sheet with unavailable dates disabled and a minimum-nights hint.
   - Guest counters for adults, children and infants, with the maximum enforced.
2. **Review page, "אישור הזמנה"**
   - **The stay:** photo, title, dates, guests.
   - **Price breakdown:** "₪420 × 3 לילות", the cleaning fee if the host set one, and "סה״כ".
   - **Currency note:** "התשלום למארח בהגעה, ב[מטבע המארח]. הסכום בשקלים הוא הערכה."
   - **Payment and rules:**
     - the payment methods the host accepts at check-in
     - the cancellation policy in plain words
     - the house rules, with a checkbox: "קראתי ואני מסכים/ה"
   - **Guest details:** the guest's name, a verified phone number (log in or get a code if needed), and an optional message to the host.
   - **A clear note:** "בית לא גובה תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם."
   - **The button:** "אישור הזמנה".
3. **Confirmation page**
   - a booking number, dates and guests
   - the exact address and the host's phone and WhatsApp, revealed only now
   - "הוספה ליומן" (an .ics file) and a directions link
   - "מה עכשיו": 3 short steps
4. **Notifications to the guest and the host**
   - Use email and SMS through whatever the project already has. If there's no provider, ask me; in development, just log the messages.
   - Send a reminder 3 days before arrival.
   - Each person gets messages in their own language.
5. **"הנסיעות שלי" in the account:** upcoming and past trips, booking details, and cancelling according to the policy (with a reason).
6. **After the stay:** mark the booking completed automatically the day after checkout.
   - Reviews come in a later phase: prepare for them, but don't build them now.

### 5.6 Booking: the host's side

**New post-form step, "הזמנות ומחיר"** (short stays and hotels):
- price per night, an optional weekend price, and an optional cleaning fee
- minimum nights and maximum guests
- check-in from / check-out until
- cancellation policy, one of 3 presets:
  - גמישה: free cancellation until 24 hours before check-in
  - בינונית: until 5 days before
  - קפדנית: until 14 days before
- payment methods accepted at check-in, and the currency

**Calendar page for each listing**
- Block and unblock dates, and see bookings.
- **Import (iCal):** the host pastes their Airbnb or Booking calendar link. Sync it every hour, and block imported dates on Bayit.
- **Export (iCal):** a private Bayit calendar link the host pastes into Airbnb or Booking. This prevents double bookings.

**"הזמנות לנכסים שלי"** (for hosts)
- A list of bookings, with details and a way to contact the guest.
- **Host cancellations:**
  - Hosts can cancel only with a reason: "הזמנה כפולה", "בעיה בנכס" or "אחר".
  - Log every host cancellation.
  - Flag cancellations made within 48 hours of the booking for review. This is how we catch hosts who cancel because of who the guest is.
- A "לא הגיע" (no-show) report button after the check-in date. Log these; we'll decide the rules later.

### 5.7 Post form (wizard)

- **Split step 4,** "ספרו לאורחים על המקום" (about 20 fields today), into short steps:
  - גודל וחדרים
  - הבניין
  - מצב ומאפיינים (optional, folded)
  - כותרת ותיאור

  Only the essentials are required.
- **Add the "הזמנות ומחיר" step** for short stays and hotels (5.6).
- **Keep:** the Georgian condition terms, the private exact address, the private cadastral code, autosave, and the required pledge step.
- **Map step:** open on Georgia (bug 8.1).
- **Address search:** see bug 8.9.

### 5.8 Account

- **Greeting:**
  - Show "שלום, [שם פרטי]".
  - Ask for the first name at sign-up (required) and in the settings. If it's missing, show "שלום!".
  - Never show a phone number or "+972" as a name (bug 8.2).
- **Tabs:**
  - סקירה
  - הנסיעות שלי
  - הנכסים שלי
  - הזמנות לנכסים שלי (hosts only)
  - שמורים
  - אימות
  - הגדרות

### 5.9 Jewish life page (the hub)

- Keep all its content, but restyle it and make it calmer.
- It includes:
  - the Shabbat times card with city chips, and the times table
  - the calendar and the holidays
  - the community map
  - the emergency numbers (the 112 card)
  - the guides
- Add tabs or jump links at the top so it isn't one endless scroll.

**Community places**
- **Never invent real places.** Demo places stay labeled "(דמו)".
- Never use demo places for walking-time tags on real listings.
- Add a simple admin form for real places: name, type, address, coordinates, the date it was verified, and the source.
- List what's needed in `OWNER_TODO.md`.

### 5.10 About page: the founder story

**Replace the placeholder** ("כאן המייסדים יכתבו את הסיפור שלנו…") with the drafts below:
- Translate them into the other languages.
- Keep `[השם שלכם]` / `[Your name]` as visible placeholders.
- I'll review the text.
- Don't name any other company on the page.

**Hebrew draft:**

> **למה הקמנו את בית**
>
> כשטיילנו כמשפחה וניסינו לשכור מקום לינה באתרים הגדולים, רוב המארחים דחו אותנו, רק בגלל שאנחנו יהודים ומישראל.
>
> לא רצינו שאף משפחה תרגיש ככה בחופשה שלה.
>
> אז הקמנו את בית: מקום שבו ישראלים ויהודים יכולים למצוא ולהזמין דירה, חדר או בית בגאורגיה, בלי לפחד שידחו אותם ובלי להתבייש בדת שלהם או במקום שבו נולדו.
>
> כל מארח בבית מתחייב לקבל אתכם בברכה. ככה אתם יכולים פשוט לישון טוב וליהנות מהחופשה.
>
> הצבע שלנו סגול: הכחול של ישראל והאדום של גאורגיה, ביחד.
>
> [השם שלכם]

**English draft:**

> **Why we built Bayit**
>
> When we traveled as a family and tried to rent a place on the big booking sites, most hosts turned us down, only because we are Jewish and from Israel.
>
> We didn't want any family to feel that way on their vacation.
>
> So we built Bayit: a place where Israelis and Jews can find and book an apartment, a room or a house in Georgia, without being afraid of being turned away and without hiding their religion or where they were born.
>
> Every host on Bayit promises to welcome you. So you can just sleep well and enjoy your trip.
>
> Our color is purple: Israel's blue and Georgia's red, together.
>
> [Your name]

Link "הסיפור שלנו" from the footer and the menu.

### 5.11 Help, safety, legal

- **Help:** update the FAQ for bookings. Cover:
  - how booking works and paying at check-in
  - cancellations, and what happens if the host cancels
  - calendar sync for hosts
- **Terms of use:** add the booking rules:
  - Bayit is a platform, and the stay agreement is between the guest and the host.
  - Bayit takes no payments.
  - Booking is instant.
  - The cancellation presets.
  - No-shows.
  - The pledge, and what happens if a host breaks it.

  Mark it clearly as a draft for a lawyer.
- **Placeholders:**
  - Keep the visible placeholders, such as `[שם החברה, מספר הרישום והכתובת]`, and list them in `OWNER_TODO.md`.
  - Never invent company details.

---

## 6. Languages and defaults

**Name:** "בית" when the language is Hebrew, "Bayit" in all other languages. This applies to the logo, page titles, emails and share images.

**Default currency** (when the visitor hasn't chosen one; remember their choice):

| language | currency |
|---|---|
| Hebrew, Russian, Arabic | ₪ ILS |
| English | $ USD |
| Georgian | ₾ GEL |

**Default phone prefix:**
- +972 for Hebrew, Russian, Arabic and English; +995 for Georgian.
- A host's contact phone defaults to +995.
- The country picker is searchable and remembers the last choice.
- Never guess from the phone's system language; many Israelis set their phones to English (US).

**Every new string:**
- Write it in all 5 languages: he, en, ru, ar, ka.
- Keep RTL and LTR correct by using logical CSS properties and mirroring directional icons.
- Check long Georgian and Russian strings for cut-off text.

---

## 7. Booking data model (propose it first and wait for my OK)

Adapt this proposal to the existing schema:

- **Listing** (short stays and hotels):
  - `bookingMode`: `'instant' | 'contact'`
  - `pricePerNight`, `weekendPrice?`, `cleaningFee?`, `currency`
  - `minNights`, `maxGuests`, `checkInFrom`, `checkOutUntil`
  - `cancellationPolicy`: `'flexible' | 'moderate' | 'strict'`
  - `paymentMethodsAtCheckIn[]`
  - `icalImportUrls[]`, `icalExportToken`
- **AvailabilityBlock:**
  - `listingId`, `start`, `end` (exclusive)
  - `source`: `'host' | 'ical' | 'booking'`
  - `sourceRef`
- **Booking:**
  - `id`, and a short human-readable `code`
  - `listingId`, `guestUserId`
  - `checkIn`, `checkOut`, `adults`, `children`, `infants`
  - `nightlyPrice`, `cleaningFee`, `total`, `currency`: all copied at booking time
  - `status`: `'confirmed' | 'cancelled_by_guest' | 'cancelled_by_host' | 'completed' | 'no_show'`
  - `cancelReason`, `cancelledAt`, `messageToHost`, `createdAt`
- **Rules:**
  - **No overlaps:** confirmed bookings and blocks for the same listing must never overlap. Enforce it with a database constraint or a transaction.
  - **Dates:** use Georgia's time zone (`Asia/Tbilisi`). Nights = checkOut − checkIn.
  - **Hotels with several room types:** book by room type if the data model supports room types. Otherwise treat each hotel listing as one unit for now, and tell me.
  - **The round-1 pledge fields stay:** acceptance date and version.

---

## 8. Bugs to fix

**8.1 The post-form map opens over Russia.**
- On step 3 ("Where is it?"), with no city chosen, the map opens over southern Russia (Grozny, Makhachkala). The pin lands at 42.60026, 47.03616, and the form says "The pin is outside Georgia".
- **Fix:** open on Georgia's borders by default, or on the chosen city. Never place a pin until the user taps the map or picks a search result.
- **Likely cause:** the classic Leaflet sizing problem. Call `invalidateSize()` once the map's container is visible and sized, or set the view after mount.

**8.2 "Hello, +972" on the account page.** See 5.8.

**8.3 Georgian text gets cut off.**
- The welcome badge on photos read "ისრაელელებს სიამოვნებით ვხვდე…". Removing the badge from cards fixes that one.
- Check all 5 languages for cut-off tags, buttons and tabs. Allow wrapping or use shorter translations.

**8.4 The layout gets stuck after rotating the phone.**
- After I turned the phone sideways and back, the site stayed in a wide, zoomed-out layout until I reloaded.
- **Look for:**
  - widths measured in JavaScript
  - fixed pixel widths
  - `100vw` combined with a scrollbar
  - any horizontal overflow
- **Test with Playwright:** 390×844 → 844×390 → 390×844.

**8.5 Prices show in ₾ on the Hebrew site.** Use the currency defaults in section 6.

**8.6 The phone prefix defaults are wrong.** See section 6.

**8.7 The bottom nav covers content.** See 5.1.

**8.8 The Shabbat checklist is confusing.**
- "No" items are crossed out, and some are double negatives, like "✗ ~~No motion-sensor lights~~".
- **Fix:** write each item as a plain statement with a ✓ or ✗ icon and no strikethrough, for example:
  - "✓ מפתח רגיל (לא קוד ולא מנעול חשמלי)"
  - "✗ אין מעלית שבת · קומה 21"
  - "✗ יש חיישני תנועה בכניסה"
  - "✓ פלטה"
  - "✓ מיחם"
  - "✓ שעון שבת לתאורה"
  - "✗ אין מקום לסוכה"

**8.9 The address search breaks OpenStreetMap's rules.**
- The post form's address field searches on every keystroke against OpenStreetMap's free Nominatim server. Its usage policy forbids search-as-you-type and allows at most 1 request per second for the whole app. Apps that break the rules get blocked, like our map tiles were.
- **Change it:**
  - Search only when the user presses "חיפוש" or Enter.
  - Route searches through our own server, with caching, a clear User-Agent/Referer, and a site-wide limit of 1 request per second.
  - Keep the OpenStreetMap credit.
- If you think search-as-you-type is worth it, propose a provider that allows it, with its cost, and ask me.

**8.10 Speed.** I'm still looking at the development server; I can tell from the "N" circle and the "Compiling…" and "Rendering…" labels. Photos took about 4 seconds to sharpen, and "Creating…" in the post form took several seconds. See section 9.

**8.11 Pins on dark maps are hard to see.** In dark mode, keep the dark map tiles, but make pins and area circles clearly visible: a purple pin with a white border.

---

## 9. Speed

- **One command for the fast version:** give me a single command to run the production build in the Codespace on the same forwarded port, and add it to the README.
- **In production:**
  - The hero shows immediately, without waiting for images.
  - Photos go through the framework's image component with correct `sizes`, AVIF/WebP, lazy loading below the fold, and blur placeholders.
  - The map loads only when it's shown.
  - Fonts: only the Rubik weights in use, preloaded.
  - Shabbat and calendar data are cached.
- **Targets** (Lighthouse on mobile, production build): Performance ≥ 90, LCP < 2.5s, CLS < 0.1. Tell me the actual numbers.
- **Booking screens must feel instant:** use skeletons and show results before the server confirms.

---

## 10. OWNER_TODO.md

Create this file in the project root and keep it updated. List everything only I can do or decide:
- Review the About story (Hebrew and English) and the translations, and add my name.
- Real community places (synagogues, Chabad houses, kosher restaurants) with addresses.
- The legal placeholders (company name, registration number, address), plus a lawyer's review of the Terms (bookings) and the Privacy policy.
- Email and SMS provider keys for booking notifications, if they're missing.
- Confirm the CARTO key is registered for commercial use.
- Photos needed (see `PHOTOS_NEEDED.md`).
- Anything else you find that needs me.

---

## 11. Don'ts

- Don't copy any other site's logo, colors, names or text.
- No AI-generated images.
- Don't invent reviews, ratings, user counts, real places, company details or prices.
- Don't take payments or add payment code in this round.
- Don't remove languages, the pledge, demo labels, verified owners, safety features, or existing URLs.
- Don't add libraries, paid services or schema changes without asking me.

---

## 12. Order of work, and when it's done

**Phases**

1. **Brand and design system:**
   - color tokens for light and dark
   - Rubik plus Noto Sans Georgian
   - the `<Logo>` component, favicons, app icons, manifest and share images
   - restyled components: Button, Chip, Tag, Card, Sheet, Skeleton, EmptyState, Header, BottomNav, StickyBar, Accordion and Calendar
   - an updated `/dev/ui` page that shows them all
   - the old logo and old colors removed everywhere
2. **Jewish content as an extra, the home page, the listing card, and results, filters and map.**
3. **The quiet listing page.**
4. **Booking**, in this order:
   1. the data model (after my OK)
   2. the host's booking settings, calendar and iCal sync
   3. the guest booking flow
   4. confirmation and notifications
   5. "הנסיעות שלי" and the host's bookings list
5. **Other pages:** the post-form split, the account page, the About story, the Help and Terms updates, and the Jewish life hub restyle.
6. **Finish:** the bugs in section 8, the speed work in section 9, and a final check.

**Done when:**
- The site is purple and white in light mode and purple and black in dark mode.
- The ב logo is everywhere: header, favicon, app icons, share images. No coral, navy or green is left over.
- On a 390px-wide phone, the whole home-page search card is visible on first load.
- Headings follow the type scale, and no listing title wraps past 3 lines.
- The home page has only the sections in 5.2.
- Cards have at most 2 small tags and one price, and no welcome badge.
- Kosher and Shabbat info appears only in the filters, the folded listing section, and the Jewish life page.
- **A guest can book a short stay on the site:**
  - pick dates and see the total
  - confirm, and get the address and the host's contact
- **On the host side:**
  - the host sees the booking
  - the dates are blocked
  - iCal import and export work
- Every bug in section 8 is fixed.
- Lighthouse on mobile scores ≥ 90 in production.
- `OWNER_TODO.md` exists and is up to date.
