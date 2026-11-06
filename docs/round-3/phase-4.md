# Round 3, phase 4: the mistake check, host stats, holiday prices, the price guide and hotels by room type

This phase covers section 6 of the brief (6.1 the mistake check before publishing, 6.2 host stats,
6.3 holiday prices and long-stay discounts), section 5 (the price guide for hosts) and your answer 3
in `docs/round-3/PLAN.md`: **hotels are booked by room type**, and they take instant bookings again.

Six people built the parts side by side. This check put them together and tested them **in
production mode** (the fast version, the way visitors will get it) on 6 November 2026.

The fast version starts the same way as before: in the codespace terminal run
`bash .devcontainer/start-prod.sh` and open the address ending in **`-3000.app.github.dev/he`**.
The first start with the new code also reloads the demo data by itself (it has new demo hotels,
discounts and a holiday price), which takes a minute longer.

## What changed

### "בדיקה לפני פרסום": the mistake check (brief 6.1)

- **Where:** on the last step of the post form ("תצוגה מקדימה ופרסום") and on the same step when
  you edit a listing. While editing, every other step also shows a short line at the top
  ("בדיקה לפני פרסום: 2 דברים לתיקון") that opens the panel.
- **Errors ("יש לתקן לפני פרסום", in red) stop publishing.** The site checks them itself when the
  host taps "פרסום", so they can't be skipped by any trick:
  - no exact address for a short stay or a hotel (guests get it after they book);
  - fewer than 5 photos (for a hotel, the room types' photos count too);
  - a phone number, an email address, a link or an @username in the title or the description.
- **Warnings ("כדאי לבדוק") don't stop publishing:**
  - the maximum number of guests doesn't match the beds (a single bed sleeps 1, a double or a sofa
    bed 2), also for each hotel room type;
  - 0 bathrooms;
  - times in the description that don't match the check-in and check-out settings, in all 5
    languages, including everyday wording like "בשעה 1 בצהריים" or "10 בבוקר";
  - prices in the description in another currency than the listing's ("200 שקל" in a listing in
    lari);
  - a title written in another language than the "I'm writing in" setting;
  - a price far below or far above the price guide's usual range (only when the guide has enough
    places to compare);
  - no check-in time;
  - the pin outside the chosen city;
  - no photo labelled kitchen, bedroom or bathroom.
- Each line says which step fixes it and has a **"לתיקון"** button that opens that step. When
  everything is fine it says **"הכל נראה טוב"**.
- **The admin review page** ("בדיקת מודעות") shows the same issues inside its "בדיקה לפני פרסום"
  box, next to the automatic checks of phase 3.
- **Your listing 44** shows exactly the problems you described: check-in 13:00 and check-out 10:00
  in the text against 10:00 and 13:00 in the settings, 1 guest for a double bed and a sofa bed, 0
  bathrooms and the "200 שקל" fine. We didn't change your listing (item 10 in `OWNER_TODO.md`).

### Photo room labels

- Under each photo in the photo step (and in the edit form, and for hotel room types' photos)
  there is a choice: חדר שינה, מטבח, חדר רחצה, סלון, נוף, מרפסת, הבניין, or no label.
- On the listing page, **"כל התמונות"** groups the photos by room once at least 2 rooms are
  labelled, with chips at the top to jump to a room. Photos without a label come last ("עוד
  תמונות").
- The demo listings already have labels.

### Host stats (brief 6.2)

- **On each card in "הנכסים שלי":** "30 הימים האחרונים:" views · saves · contact taps, and bookings
  for short stays and hotels.
- **The stats page** ("סטטיסטיקה", from the card): the last 7 or 30 days, with small charts for
  views, saves and contact taps, taps per contact method (WhatsApp, phone, Telegram…), and for
  short stays and hotels the bookings, the booked nights and the occupancy. For a hotel, the
  occupancy is per room type too (booked room-nights out of the rooms offered). A table under the
  charts gives the numbers per day.
- **How it counts:** each visitor once a day per listing, with an anonymous daily ID (no personal
  data is stored for it). The host, the staff, a device the host or the staff ever signed in on,
  search engines and other robots, demo listings and listings that aren't on the site never count.
- **Guests never see any of it:** the stats page is for the listing's owner only.
- **The weekly email** goes to hosts on **Sunday morning, from 09:00 Israel time** (your default):
  "השבוע: 120 צפיות, 8 שמירות, הזמנה אחת", the numbers of each listing (up to 10, the busiest
  first) and a link to its stats. It has an **unsubscribe link**; the host can also switch it off
  in Settings → "התראות" ("סיכום שבועי של המודעות").

### The price guide (brief 5)

- **Only hosts see it, never guests:**
  - in **"הזמנות ומחיר"** (short stays and hotels) or the price step (monthly rentals and sales) of
    the post form, and the same step when editing;
  - on a new page, **"מדריך מחירים"**, with a button next to "פרסום מודעה" in "הנכסים שלי": "one of
    my places" or "a city and a type".
- **What it shows:** the middle price and the usual range (the middle half of the prices); the
  lowest and highest only from 10 places; per night plus the weekend price for short stays and
  hotels, per month for monthly rentals, the full price and the price per m² for sales. In the
  price step it says where the host's price sits, for example **"המחיר שלכם, ₾55, נמוך מרוב
  המקומות הדומים בבטומי"**, and it follows the price as the host types.
- **What it compares:** city, deal type, type of place and bedrooms first; the neighborhood
  instead of the city when there are enough places there; then also bathrooms, kitchen, sea view,
  new or old building and size, when there are enough. Hotels compare each room type. It always
  says exactly what it compared, and when it had to widen ("משווים לכל טביליסי", "לכל הגדלים").
- **Where the numbers come from:** only listings on the site, never demo listings, and **never the
  host's own listings**. A group counts only with at least 5 places of at least 3 different owners
  (your default). Prices in other currencies are converted to the host's currency and marked ≈.
- **Privacy:** no names, links or any number that could point to one listing.
- **Reference prices** you add in the admin panel ("מחירי ייחוס") show in a separate box, "לפי
  [מקור], [חודש שנה]".
- **Today it says "עדיין אין מספיק מקומות דומים" everywhere**, because the site has only demo
  listings and they never count. That is expected: the range appears once there are real hosts.
  The tests checked the range with test-only places that were removed afterwards.

### Holiday prices, long-stay discounts and the itemized total (brief 6.3)

- **Holiday prices ("מחיר לתאריכים"):** in the place calendar, the host selects nights, taps
  "מחיר לתאריכים" and sets a price per night, optionally a minimum stay and a short note for guests
  ("פסח"). The prices are listed under the calendar, each with a delete button.
- **Jewish holidays on the host calendar** (Israel schedule) for the 13 months shown, with chips
  like "חנוכה · 4–12 בדצמ׳" that select the holiday's nights and a reminder that demand from Israel
  peaks then.
- **Long-stay discounts** in "הזמנות ומחיר": a % for 7 nights or more and a % for 28 nights or
  more (up to 60%), with a live example of what a week costs the guest.
- **Which price a night gets:** a holiday price first, then the weekend price, then the regular
  price. 28+ nights get the monthly discount, 7+ nights the weekly one, never both. The discount
  comes off the nights only, never off the cleaning fee.
- **The total is calculated on the site's server, line by line, and copied into the booking.** The
  guest sees every line before confirming, in the dates sheet and on "אישור הזמנה", for example
  "$85 × 4 לילות", "$110 × 3 לילות (חנוכה)", "הנחה לשבוע −10%", "דמי ניקיון". The same lines show
  on the trip page, the host's booking page, the admin booking page and in the booking emails.
- A stay that touches a holiday price with a longer minimum stay is refused with a clear message
  ("בתאריכים 4–12 בדצמ׳ (חנוכה) המארח מקבל הזמנות של 3 לילות לפחות").
- The demo short stay **89** (Yossi's flat in Vake) has a 10% weekly and 20% monthly discount and
  a demo Chanukah price.

### Hotels: booking by room type (your answer 3)

- **The room type editor** (step "סוגי חדרים"): name, photos, beds (including sofa beds), maximum guests,
  size, in-room amenities, price per night and weekend price, an on/off switch ("מוצע לאורחים")
  and **"כמה חדרים כאלה להציע בבית"**, with the hint that a hotel may offer fewer rooms than it
  has. A room type with upcoming bookings can't be deleted; it can be switched off instead.
- **The guest** picks dates, sees the free room types with their price per night, the total for
  the chosen nights and how many rooms are left, picks a room type and **how many rooms** (a family
  can book 2 rooms in one booking, up to 10), and books instantly. Payment on arrival, the same
  rules as short stays. Full room types can't be picked. If 4 adults don't fit one room, it asks
  for a second room.
- **One booking never closes the whole hotel.** A room type is free on a night while its booked and
  closed rooms are fewer than its number of rooms. Two guests who try to take the last room at the
  same moment can't both get it: the second one gets "החדרים האלה נתפסו הרגע".
- **The hotel calendar** works per room type: chips switch between the room types and "כל המלון";
  each night shows the free rooms ("2/3"); the host closes or reopens N rooms, sees the bookings
  of the selected nights and sets holiday prices per room type. Closing nights in "כל המלון"
  closes every room. The **sync-gap note** is above the calendar: Bayit checks the other sites'
  calendars every hour and they check Bayit every few hours, so keep a room or two of each type off
  Bayit.
- Hotels take instant bookings only when they have at least one active room type with a price per
  night; otherwise they stay "שאלה למארח", and the post form says what is missing.
- The trip page, the host's booking pages, the admin booking page and the emails show the room
  type and the number of rooms. The price guide, the mistake check and the stats work per room
  type.
- The demo hotel **111** (Batumi) and the demo guesthouse **112** (Kutaisi) have room types.

## What iCal can and can't do for hotels

iCal is the calendar link that Airbnb, Booking.com and most other sites use to share busy dates.

- **It can:** say which nights are busy, for one calendar. Bayit gives **each room type its own
  link** to paste into the other site, and can read **each room type's** links from the other
  sites. A night on Bayit's link for a room type is busy only when that type has no free room
  left. Each booking that comes from another site takes **one room** of that type. The hotel's own
  link ("כל המלון") is busy only when the whole hotel is full or closed, and a booking read into
  "כל המלון" closes the whole hotel, so connecting each room type separately is usually better.
- **It can't:** say how many rooms are booked, send prices, guest names or the room type, or update
  at once. Booking.com and Airbnb usually give one calendar per room (or per listing), not per
  room type with a count, so a hotel with 3 identical rooms on Booking.com connects 3 calendars, or
  offers fewer rooms on Bayit. The other sites read Bayit's link every few hours (Bayit reads
  theirs every hour), so two guests on two sites can still book the last room in that gap: that is
  why the calendar suggests keeping a room or two off Bayit.
- **Later:** a channel manager (a paid service that hotels use to share room counts and prices
  with all sites at once) can replace iCal for bigger hotels.

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (45 groups × 5 languages) and UNIT_TESTS unit tests (about 380 of them new in
  this phase, for every rule: each mistake-check error and warning, listing 44's exact problems,
  the visitor counting and who never counts, the weekly email's day and hour, the price guide's
  groups, widening and privacy, which price a night gets, the discounts, the cleaning fee, free
  rooms per night, two guests taking the last room at once, and the iCal feeds per room type).
- **End-to-end tests in production mode: E2E_TOTAL passed** in one clean run, nothing re-run, with
  staff using the real 2-step login. New for this phase:
  - **13.2 (booking, updated):** the guest sees the itemized total in the dates sheet, on
    "אישור הזמנה" and on the trip page; a second test adds a test-only holiday price and a weekly
    discount and follows the lines ("$90 × שני לילות (E2E חג)", "הנחה לשבוע −10%", the cleaning
    fee) from the review page into the booking, the trip page and the host's page, and checks the
    holiday price's minimum stay.
  - **13.7 (price guide):** with the real listings it says "עדיין אין מספיק מקומות דומים" (on the
    page and in the post form); with test-only places in a hidden test city it shows the range and
    where the host's price sits, and follows the price as it is typed. Another host and a guest
    get nothing; a signed-out visitor goes to the login page. The test places are removed.
  - **Mistake check:** listing 44's problems (on a test copy, never listing 44 itself) are exactly
    the warnings; "לתיקון" opens the right step; a missing address stops "פרסום" on the server, and
    once fixed the listing publishes (and waits for review, as a first listing); photo labels are
    saved and "כל התמונות" groups by room; the admin review page lists the host's issues.
  - **Host stats:** a visitor counts once a day, the host never; the card and the stats page show
    it; the weekly email lands in the outbox with the right subject; its unsubscribe link switches
    it off and on.
  - **Hotel booking:** a guest books 2 rooms of one room type; the host's calendar shows "1 מתוך 3
    חדרים פנויים"; a second tab asking for 2 more rooms is refused; cancelling frees the rooms.
- **What the check fixed in the tests:** the end-to-end test that posts a listing now fills in the
  exact address (the new mistake check rightly refused to publish without it), and the test of the
  admin's booking page now expects the cleaning fee among the price lines. The new tests sign their
  test accounts in without login codes, because the site allows only 30 login codes an hour from
  one address and the whole run comes from one; staff still use the real 2-step login.
- **Screenshots** in production mode at 390×844 in Hebrew (light and dark) and 1440×900 in English,
  plus Georgian at 360 px where the text is long, all looked at: the photo step with room labels;
  the mistake check with errors, with warnings and clean; the edit form's short line; "כל התמונות"
  grouped by room; "הנכסים שלי" with the numbers; a stats page with charts; the weekly email (taken
  from the outbox); the price step with the guide and "המחיר שלכם…"; "מדריך מחירים" with not
  enough data and with a range; the host calendar with Chanukah and the holiday-price window; the
  dates sheet and "אישור הזמנה" with a holiday price, the weekly discount and the cleaning fee; the
  trip page; the room type editor with "כמה חדרים כאלה להציע בבית"; the hotel calendar per room type
  with the sync note; the room picker with 2 rooms; and the admin review page.
- **What the check fixed itself:**
  - **The mistake check** split an email address or a link in two at its hyphen
    ("host-" on one line, the rest on the next). It now stays in one piece.
  - **"מדריך מחירים"** wrote the site's name in Latin letters in Hebrew ("ב-Bayit"); it now says
    "בבית", like the rest of the site. A place whose title starts with Latin letters no longer
    scrambles its number in the "one of my places" list.
  - **Russian and Georgian on a phone:** the button at the bottom of the dates sheet was cut off
    ("Перейти к брон…"). It now says "Продолжить" / "გაგრძელება". A Georgian sentence there ended
    with two full stops.
  - **Demo data:** an owner block on listing 89 covered most of its demo Chanukah price, so the
    holiday price could hardly be tried. Demo owner blocks now skip the demo holiday nights.
- **Lighthouse (phone, production, `/he`): LIGHTHOUSE.** Phase 6 must reach 90.
- Test accounts, listings, bookings, the test city, sessions and emails were removed afterwards.

## What to check on your phone, in this order

1. Start the fast version and open the `-3000.app.github.dev/he` address **in a private tab**.
   The first start with the new code reloads the demo data (a minute longer).
2. **Log in as the demo host Yossi** (+995 555 000 011, the code shows on screen). Menu → **"הנכסים
   שלי"**: each card shows "30 הימים האחרונים:" with views, saves, contact taps and bookings. Open
   a listing's **"סטטיסטיקה"**: the charts, and "7 הימים האחרונים" / "30 הימים האחרונים". (The demo
   numbers are made up; real ones start counting from today.)
3. Next to "פרסום מודעה" tap **"מדריך מחירים"**: for any of Yossi's places it says "עדיין אין
   מספיק מקומות דומים", because demo listings never count. Try "עיר וסוג נכס" too.
4. Open listing **89**'s **"יומן"** (calendar). The Jewish holidays are marked; under the calendar
   the chip **"חנוכה · 4–12 בדצמ׳"** selects its nights; tap **"מחיר לתאריכים"** to see the window
   (close it, or set a price on other nights and delete it from the list under the calendar). The
   demo Chanukah price ($110) is in that list.
5. **"עריכה"** of listing 89 → **"הזמנות ומחיר"**: the two discount fields (10% and 20% on this demo
   place) with the example, and the price guide panel. Then the last step, **"תצוגה ופרסום"**:
   "בדיקה לפני פרסום".
6. **Log out and log in as the demo guest** (+995 555 000 021). Open listing **89**, choose **1 to 8
   December** (7 nights, 4 of them on Chanukah; if those nights are taken, any 7 free nights that
   include some of 4–12 December), and look at **"פירוט המחיר"**: "$85 × 3 לילות", "$110 × 4 לילות
   (חנוכה)", "הנחה לשבוע −10%", "דמי ניקיון" and the total. **"המשך להזמנה"** → "אישור הזמנה"
   shows the same lines. You can book and cancel it from the trip page.
7. Still as the guest, open the demo hotel **111**: choose 2 nights, **4 adults**, pick "חדר זוגי
   סטנדרטי": it asks for a second room; tap **+** next to "מספר חדרים". The total is for 2 rooms.
   "המשך להזמנה" keeps the room type and the rooms.
8. **Log out and log in as the demo hotel** (+995 555 000 015). "הנכסים שלי" → listing 111 →
   **"יומן"**: chips for each room type and "כל המלון", "6/6" on each night, and the note about
   the sync gap. **"עריכה"** → **"סוגי חדרים"** → "עריכה" on a room type: **"כמה חדרים כאלה להציע
   בבית"**, the weekend price, sofa beds, amenities and the on/off switch.
9. **Your listing 44** (with your own account, once the codespace has the new code): "עריכה" → the
   last step: "בדיקה לפני פרסום" shows its warnings: the times in the description, 1 guest for a
   double bed and a sofa bed, 0 bathrooms and the "200 שקל" fine. Fixing them is item 10 in
   `OWNER_TODO.md`.
10. **The admin panel** (the demo admin +995 555 000 001, or your own admin account, with Google
    Authenticator) → **"בדיקת מודעות"** → a listing that waits: "בדיקה לפני פרסום" now includes
    "בדיקת הטעויות של המארח".
11. **The weekly email** arrives on the real site on Sunday morning. The codespace runs no scheduled
    jobs, so it doesn't arrive there; the screenshot in this check shows how it looks.

## Open issues

- **The price guide shows "not enough similar places" everywhere** until real hosts publish: demo
  listings never count, and a range needs 5 places of 3 owners. It was checked with test-only data.
- **The weekly email and the hourly calendar sync can't be tried in the codespace** (no scheduled
  jobs there). On the real site they run by themselves (with `CRON_SECRET`, see `OWNER_TODO.md`).
- **Emails stay in the outbox** ("תיבת דואר יוצא") until Resend is connected.
- **Hotels and other sites:** iCal can't share room counts (see above). Until a channel manager is
  added, a hotel should offer fewer rooms on Bayit than it has, as the calendar suggests.
- **"Later, also the nightly prices of completed bookings"** (brief 5): the price guide uses
  published listings only for now; completed bookings are too few to add yet.
- **Russian, Arabic and Georgian texts** of this phase are our translations, like the earlier ones.
- **Lighthouse is LIGHTHOUSE_SHORT on `/he`**; phase 6 has to reach 90 (the brief's target).

## Decisions taken while you were away (the careful option, as you asked)

**The mistake check**
- A time counts only next to a check-in or check-out word ("צ'ק אין בשעה 13:00"); "late check-out"
  and "early check-in" are skipped. An hour without am/pm matches both readings, and "גמיש" never
  warns. A wrong time links to the "הזמנות ומחיר" step and says to fix whichever is wrong.
- A price counts only when a number sits next to a currency word or sign ("200 שקל", "₪200").
- The title's language warns only when under 40% of its letters are in the chosen language's
  alphabet, so a Latin brand name in a Hebrew title is fine.
- "The pin is outside the city": more than 25 km from Tbilisi's centre, 20 km from Batumi's, 15 km
  from other cities (the site knows only each city's centre).
- Hotels aren't asked for a kitchen photo. With no photos at all, only "fewer than 5" shows.
- Guests vs beds is checked only when beds were entered; only exactly 0 bathrooms warns.
- Saving changes without publishing again (a paused or expired listing) isn't refused; a live
  listing's changes still go through the automatic checks, so the review rule is unchanged.

**Host stats and the weekly email**
- The email goes out on Sunday between 09:00 and 11:59 Israel time (the first try about 09:11). A
  Yom Tov Sunday moves it to Monday (Tuesday after a two-day Yom Tov). It covers Sunday to Saturday
  of the week before, in Georgian days.
- It is on by default, only for active accounts with a listing on the site and an email address.
  A week with nothing at all is skipped. At most 10 listings, the busiest first.
- Opening the unsubscribe link changes nothing: one tap on its button does, so a mail program
  that opens links by itself can't unsubscribe anyone. The link only switches this email.
- "Bookings" = bookings made in the period; "booked nights" = the nights of the period that are
  booked, whenever they were booked. Cancelled bookings and no-shows don't count.

**The price guide**
- Stricter privacy than "5 places of 3 owners": a group is shown only if comparing it with every
  wider group the host can also open can't reveal a single place. A hotel counts once, however
  many room types it has. Sizes are compared in fixed bands (bedrooms 0–4 and 5+, and so on).
- A kitchen or sea view the host didn't tick is "not said", not "no".
- The page is for anyone with at least one listing (drafts count); others see "מדריך המחירים
  מיועד למארחים". At most 60 guide questions per 10 minutes per account.
- Reference prices: at most 3, none older than 24 months, converted with ≈ when needed.
- A listing's guide uses the listing's currency; the city question uses the visitor's currency.

**Holiday prices and discounts**
- Two holiday prices of the same scope (the whole place, or one room type) can't share a night. A
  room type's own price may cover a whole-hotel one, and the room type's wins. Up to 60 holiday
  prices per listing, 120 nights each, from today up to two years ahead; a note up to 40
  characters; a minimum stay of 1 night means none.
- Discounts are whole percents up to 60%; 28+ nights get the monthly one instead of the weekly one.
- Bookings already made keep their price.

**Hotels**
- Up to 10 rooms in one booking; the guests allowed are the room type's maximum × the rooms.
- The cleaning fee is charged once per room booked, and shown as its own line.
- A hotel takes instant bookings only with at least one active room type priced per night.
- A room type with upcoming bookings can't be deleted, only switched off.
- Each booking read from another site's calendar takes one room of its room type; one read into
  "כל המלון" closes the whole hotel.

**Decided in this check**
- The tests sign test accounts in without login codes (the site allows 30 codes an hour from one
  address); staff still use the real 2-step login.
- The demo owner block that covered listing 89's demo Chanukah price is no longer created.
- In Russian and Georgian, the dates sheet's button says "Continue" instead of "Continue to
  booking", so it fits on a phone.
