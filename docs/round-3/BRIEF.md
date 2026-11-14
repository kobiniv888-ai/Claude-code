# Bayit (בית): round 3

**This round covers:**
- fixes from my latest phone recording
- a lighter home page
- a price guide for hosts
- an admin panel
- reviews
- several new features for hosts and guests

This brief adds to round 2. Everything in round 2 still applies unless this brief changes it.

---

## 0. How to work

1. Read the whole brief, then explore the current code and database.
2. Send me a plan before you start:
   - the phases
   - the database changes from section 12
   - any library you want to add
   - your questions

   Wait for my OK.
3. Work on a new git branch called `round-3`, and commit after each phase.
4. Ask me first before you change the database, add a library, or add any paid service.
5. After each phase:
   - Run the site in production mode.
   - Check it at 390×844 in Hebrew (light and dark) and at 1440×900 in English.
   - Take Playwright screenshots and look at them yourself. Fix anything that looks off.
   - Run the tests from section 13 that cover that phase.
   - Send me a short summary and tell me what to check on my phone.
6. Give me one simple command that runs the fast production version in the Codespace, and tell me exactly which link to open. I keep testing on the slow development server by mistake.

---

## 1. First, check my earlier requests

I sent you these as separate messages. Tell me which are done, and finish the rest in phase 1:
- **Login:**
  - The code appears on screen only in development, or with a special test setting. Never on the real site.
  - Google sign-in and email-code login work.
  - SMS codes are used only when a guest books and when a host verifies their phone.
- **Booking emails:** real bookings don't go live until the host is actually notified by email (Resend).
- **Hotels:** booked per room type, with a number of rooms for each type. Until that exists, hotels are contact-only, with no instant booking.
- **Country-ready:** the country is stored on every listing and place, and per-country settings live in one place.

---

## 2. Bugs (phase 1)

### 2.1 The calendar export link uses the temporary Codespaces address
On the place calendar, "Your Bayit link (export)" shows `https://didactic-disco-…`. If a host pastes it into Airbnb or Booking, it breaks when the Codespace sleeps or the domain changes.
- Build every link that leaves the site from one `SITE_URL` setting. That includes calendar links, emails, share links and the sitemap.
- Until the site is on its real domain, show "הקישור יעבוד אחרי שהאתר יעלה לכתובת הקבועה שלו" and disable the Copy button.

### 2.2 Going back in the post form shows empty answers
On listing 44, I went back from step 11:
- Step 2 showed no place type.
- Step 3 showed "Choose a city", with an empty neighborhood and address.

The draft card in "My places" still says "Batumi Center · Batumi", so the data is saved but the steps don't show it.

**Fix:**
- Every step loads its saved answers.
- Never save an empty value over a saved one, unless the user cleared it.
- Put the step in the URL (`?step=3`), so the browser's Back button, a reload and "Continue" all open the right step with its answers.
- Disable Next while a step is loading. On my first pass I got past step 2 while it was still loading.
- When "Some details need your attention" appears, scroll to the first highlighted field and focus it. Mine was off-screen.

### 2.3 Sale listings show no total price
Listing 43 (for sale) shows only "$2,647 למ״ר", under "פרטי המחיר". Every listing page needs its main price right under the title:

| type | price under the title |
|---|---|
| sale | the full price in the visitor's currency with ≈, the host's original price, and the price per m² |
| monthly | price per month |
| short stays and hotels | price per night, plus the total once dates are chosen |

### 2.4 Listings aren't translated, and titles have emojis
On the Hebrew site, listing 43's title and description show in Georgian, with 🏖️📍🎉 emojis.

**Translation:**
- Find out whether a translation service is actually connected, or whether only the demo listings came pre-translated, and tell me.
- If none is connected, propose 2–3 options with their monthly cost, and wait for my choice.
- Until then, show the original text with a "המקור ב[שפה]" label and a "תרגום" link that opens Google Translate with the text.
- Translate titles too, not only descriptions.
- Cache translations, and redo them when the host edits.
- Keep "תורגם אוטומטית · הצגת המקור".

**Emojis:** remove them from titles when saving, including in existing listings. Emojis in descriptions are fine.

### 2.5 Phone numbers keep the leading 0
The contact step shows my verified number as "+972 | 053-…".
- Save every phone number in international format, without the 0 after the country code (+972 53…, +995 5…). Fix the existing records.
- Test that WhatsApp links (`wa.me/972…`) and phone links work, for both Israeli and Georgian numbers.
- Use a phone-number library if one is already installed. Otherwise, ask me before adding one.

### 2.6 The address search copies a place's name into the private address
I searched for "sherif khimshiashvili 7". The private "Exact address" became "Public Service Hall, 7, Sherif Khimshiashvili…", the name of a government building.
- From a search result, fill in only the street and house number, never a place's name.
- The host adds the entrance and apartment number.
- Put the pin on the chosen result, and let the host edit both the address and the pin.

### 2.7 No Publish button, and drafts get forgotten
- **Publish button:** on step 14, the bottom bar has only Back. Put a big "פרסום" button there.
- **After publishing:** show a success screen with "view the listing", "share" and "connect your calendar". If the listing goes to review first, say so.
- **Drafts:** the Post page leads with "Start a new listing" even though I have an unfinished draft.
  - When drafts exist, show "המשך מהטיוטה" first, with the photo, title and step.
  - If someone starts a new listing anyway, ask whether they meant to continue their draft.

### 2.8 Prices still show in ₾ on the Hebrew site
Check round 2's currency defaults in a private window:

| language | default currency |
|---|---|
| Hebrew, Russian, Arabic | ₪ |
| English | $ |
| Georgian | ₾ |

A visitor's own choice always overrides the default.

### 2.9 There's no way to log out
- **Where:** add "התנתקות" at the bottom of the account page, in the side menu when signed in, and in the desktop account menu.
- **After logging out:** go to the home page with a short "התנתקתם" message, and clear private data from the device.
- **Settings:** add "התנתקות מכל המכשירים" to the account's security settings.

### 2.10 The calendar takes you out of the post form
In the "הזמנות ומחיר" step, "Open the place calendar" sent me to another page. I had to go all the way back through My account to return to my listing. Other hosts will get lost the same way.
- Open the calendar in a full-screen sheet on top of the form. "סיום" closes it and returns to the same step and scroll position.
- Any page reachable from the form has a clear "חזרה למודעה" button that returns to the same step.

---

## 3. Design and wording (phase 2)

### Menu
- **Jewish life:** this section has 5 links, as many as "Find a place". Replace them with one "חיים יהודיים בגאורגיה" link; the hub page has tabs.
- **Emergency numbers:** move "מספרי חירום" to "עזרה ובטיחות", since every traveler needs it.
- **Names:** use the same 4 names as the home tabs: לטווח קצר, חודשי, קנייה, מלונות. The menu currently says "Rent", and short stays are missing.

### Footer
The tagline is outdated: "kosher and Shabbat details… direct contact with no booking fees".
- **New tagline:**
  - HE: "בתים בגאורגיה, אצל מארחים שהתחייבו לקבל ישראלים בברכה. מזמינים באתר ומשלמים כשמגיעים."
  - EN: "Homes in Georgia from hosts who promise to welcome Israelis. Book on the site and pay when you arrive."
- **Bottom line:** replace "נבנה עבור הקהילה היהודית בגאורגיה ובכל העולם" with "נבנה על ידי משפחה ישראלית". I'll confirm this (see OWNER_TODO).
- **Where it shows:** hide the footer inside the post form and the booking flow.

### Card type labels
In "מקומות מומלצים", my sale listing shows "≈ ₾233,653" next to nightly stays, with no label, so it looks like a nightly price.
- Every card that isn't a short stay shows its type: "למכירה", "חודשי", or "מלון".
- On the home page, the recommended row shows only the type of the selected tab.

### Post page wording
- **The pledge:** the page promises "…and get the 'Welcomes Israelis' badge", but that badge is gone. Replace it with: "כל המארחים כאן מתחייבים לקבל אורחים ישראלים ויהודים בברכה. תאשרו את זה לפני הפרסום."
- **Review time:** change "reviewed by a person — usually within a few hours" to "usually within a day", until I can keep up.

### Step 9 (Jewish-friendly details)
The step says "This is what makes the site different — families look for exactly these details." That's the old message.
- Mark the step "אופציונלי" and add a "דילוג" button.
- Change the subtitle to: "מלאו רק מה שיש במקום. אורחים ששומרים כשרות או שבת מסננים לפי זה."

### Check-in and check-out pickers
They list all 96 times of the day, in AM/PM.
- **Times:** offer only the usual ones, every 30 minutes, plus "גמיש":
  - check-in: 12:00–22:00
  - check-out: 07:00–14:00
- **Format:** use each language's normal time format, which is 24-hour in Hebrew, Russian and Georgian.

### Small fixes
- **Filters:** the sheet says "חדרים" twice in a row. Name the section "חדרים ומיטות".
- **Airport:** "שדה תעופה · 4 ק״מ (BUS)": "BUS" is the airport code, but it reads like "bus". Show "שדה התעופה של בטומי · 4 ק״מ" instead.
- **Demo map points:** points like "בית חב״ד לדוגמה – בטומי" shouldn't have a "מסלול הליכה" button.
- **Map start view:** the map opens showing a lot of Russia, Armenia and Turkey.
  - Zoom to fit the places in the results, with some padding. If there are none, fit Georgia.
  - Optionally, dim everything outside Georgia.

---

## 4. A lighter home page (phase 2)

The home page is still too packed for a first visit. This replaces the home-page order in round 2, section 5.2.

**First visit (no history),** in this order:
1. The hero with the search card.
2. The promise line.
3. Category chips.
4. "מקומות מומלצים": at most 6 cards of the selected tab's type, plus "הכל ←".
5. "לאן נוסעים?" (cities).
6. "איך זה עובד", in one row.
7. The host card.
8. Footer.

Remove the Jewish life card from the home page. It stays in the menu, the footer and the "כשר ושבת" chip.

**Returning visitors:** right under the search card, add "המשך מאיפה שעצרתם". It shows:
- their last search, as one tap ("בטומי · 12–15 בדצמ׳ · 2 אורחים")
- "נצפו לאחרונה": up to 10 places, with a "ניקוי" button
- their saved lists, if they have any

**Recently viewed places:** keep them on the device for guests, and sync them to the account when someone is signed in, so nobody loses a place they liked.

---

## 5. Price guide for hosts (phase 4)

Hosts see what similar places cost, so they can price theirs. Only signed-in hosts see it, never guests.

**Where it appears:**
- in the "הזמנות ומחיר" step of the post form, and when editing a listing
- on a "מדריך מחירים" page under "הנכסים שלי"

**What it compares:**
- first by city, deal type, property type and bedrooms. Use the neighborhood instead of the city when there's enough data.
- then, when there's enough data, also by bathrooms, kitchen, sea view, new or old building, and size

**What it shows:**
- the middle price and the usual range (the middle half of the prices)
- the lowest and highest prices, but only when there are at least 10 similar places
- the right unit for each type:

| type | prices shown |
|---|---|
| short stays and hotels | per night, plus the weekend price |
| monthly | per month |
| sale | full price and price per m² |

**Where the numbers come from:**
- only published, non-demo listings on Bayit
- later, also the nightly prices of completed bookings
- never prices copied from other sites

**When there isn't enough data:**
- Show a range only when there are at least 5 similar places.
- Otherwise, widen the comparison (the whole city, or all sizes) and say exactly what is being compared.
- If even that's too few, show "עדיין אין מספיק מקומות דומים".

**In the price step:** show where the host's price sits, for example "המחיר שלכם, ₾55, נמוך מרוב המקומות הדומים בבטומי".

**Reference prices (optional):** in the admin panel, I can add a price range from a public report, with its source and date. It's shown separately from Bayit's own data, labeled "לפי [מקור], [חודש שנה]".

**Privacy:** never show listing names or links in the guide, or any number that points to a single listing.

**Currency:** show prices in the host's currency, converted with ≈.

---

## 6. For hosts

### 6.1 Mistake check before publishing (phase 4)
On the preview step, and when editing a published listing, show a "בדיקה לפני פרסום" panel.

**Errors** (block publishing):
- The exact address is missing for a short stay or hotel. Guests get the address after they book.
- Fewer than 5 photos.
- Phone numbers, emails or links in the title or description.

**Warnings** (the host can publish anyway):
- Max guests is lower or higher than the beds can sleep.
- 0 bathrooms.
- Times written in the description that don't match the check-in and check-out settings. Catch everyday wording too, like "בשעה 1 בצהריים" or "10 בבוקר", in all 5 languages.
- Prices in the description in a different currency from the listing's, such as שקל, ₪ or $ when the listing is in ₾.
- A title in a different language from the "I'm writing in" setting.
- A price far outside the price guide's usual range.
- No check-in time.
- The pin is outside the chosen city.
- No photo labeled kitchen, bedroom or bathroom.

**Photo room labels:** add an optional label to each photo (bedroom, kitchen, bathroom, living room, view, balcony, building). Use the labels for this check and to group the gallery by room.

**Test case:** use my listing 44, which has several of these problems:
- The description says check-in at 13:00 and check-out at 10:00, but the settings say check-in from 10:00 and check-out until 13:00.
- Max guests is 1, though it has a double bed and a sofa bed.
- Bathrooms is 0.
- The description mentions a "200 שקל" fine, while the listing is priced in lari.

Don't change my listing's data yourself. I'll fix it (see OWNER_TODO).

### 6.2 Host stats (phase 4)
**What each listing shows,** over the last 7 and 30 days, with a small chart:
- views
- saves
- contact taps, per contact method
- bookings
- booked nights and occupancy, for short stays

**How to count:**
- Count each visitor once per day.
- Don't count the host, admins, bots or demo listings.
- Don't store personal data for this; an anonymous daily visitor ID is enough.

**Where it shows:**
- small numbers on each card in "הנכסים שלי"
- full stats on the listing's manage page
- guests never see any of it

**Weekly email:** send hosts a summary like "השבוע: 120 צפיות, 8 שמירות, הזמנה אחת", with an unsubscribe link.

### 6.3 Holiday prices and long-stay discounts (phase 4)
- **Holiday prices:** in the place calendar, the host selects dates and sets a price per night for them, optionally with a minimum stay. Show Jewish holidays on the host calendar (from the existing Hebrew calendar code), since Israeli demand peaks then.
- **Long-stay discounts:** in the price step, a % discount for 7+ nights and for 28+ nights.
- **Which price applies:** a date price first, then the weekend price, then the regular price.
- **Booking total:**
  - Calculate it on the server, line by line, and copy it into the booking.
  - The guest sees every line before confirming, for example: "₾55 × 3 לילות", "₾80 × 2 לילות חג", "הנחה לשבוע −10%", "דמי ניקיון".

---

## 7. For guests

### 7.1 Trip page after booking (phase 5)
Each booking gets a page, linked from the confirmation, every booking email and "הנסיעות שלי".

**It shows:**
- status, dates, guests, the itemized total, and how to pay on arrival
- the exact address with a map, plus "פתיחה ב-Google Maps" and "פתיחה ב-Waze" buttons
- check-in and check-out times, the house rules, and the host's contact buttons
- the free-cancellation deadline, with a cancel button
- "הוספה ליומן"
- the safety note "בית לא גובה תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם.", plus a link to the emergency numbers

**Only if the stay includes a Friday night or a Jewish holiday,** also show:
- candle-lighting and havdalah times for that city on those dates
- the nearest verified synagogue, Chabad house and kosher place, with walking times
- "המארח לא עונה בשבת", if the host turned that setting on

Otherwise, none of this appears.

**Weak connections:** keep the page light so it opens on a weak connection. If it's simple to do, make it work offline after the first visit.

### 7.2 Shared wish lists (phase 5)
- **Lists:**
  - "שמורים" becomes lists: a default list plus named ones, such as "בטומי באוגוסט".
  - Tapping the heart saves to the last list used. A long press opens a sheet to choose another list.
- **Sharing:**
  - The owner can share a list through a private link that anyone can open without an account (view only).
  - Add a WhatsApp button, with a preview image showing the first place's photo and the list's name.
  - The owner can stop sharing, and the link then stops working.
  - Someone who opens a shared list and then signs up can copy it to their own account.
- **Saving:** lists are kept on the device for guests and merged into the account when they sign in.

### 7.3 Distance to the sea and to ski lifts (phase 5)
- **What to calculate:** the walking time from the pin, the same way as the synagogue walking time (shown with "≈"). Recalculate it whenever the pin moves.
  - In Batumi, Kobuleti and the coastal towns nearby: to the nearest beach.
  - In Gudauri, Bakuriani and Mestia: to the nearest ski lift.
- **Data:** use a small static dataset from OpenStreetMap, stored in the repo, with no live calls. Add OpenStreetMap to the photo and data credits.
- **Where it shows:**
  - as a card tag, "≈ 5 דק׳ הליכה לים" (or "למעליות"), when it's 15 minutes or less. It counts toward the 2-tag limit from round 2 and comes first in those towns.
  - as a highlight on the listing page
  - as a "קרוב לים" or "קרוב למעליות" filter chip in those towns
- **Replaces:** when a listing has a pin, this calculated value replaces the manual "Near the sea" amenity.

### 7.4 Price alerts (phase 5)
- **Saving a search:** a "שמירת חיפוש" button on the results page saves the city, type and filters (and the dates, if chosen) under a name.
- **Emails:**
  - when new listings match a saved search, at most one email a day
  - when a place in one of the user's saved lists lowers its price
- **Managing alerts:**
  - Users can pause or delete alerts from their account.
  - Every email has an unsubscribe link and uses the user's language.
- **Until email is set up,** these emails go to the admin outbox.

---

## 8. Trust

### 8.1 Real reviews (phase 5)
- **Who can review:** only the guest of a completed booking, once per booking, from checkout until 14 days later. Monthly rentals and sales have no reviews for now.
- **What a review contains:**
  - 1–5 stars overall
  - optional quick ratings: cleanliness, accuracy, check-in, communication, location and value
  - text
- **Translation:** translate reviews, with "הצגת המקור".
- **The host:** can post one public reply, and can report a review to the admin. The host can't edit or delete reviews.
- **The admin:** can hide a review that breaks the rules, with a logged reason, but never edit it.
- **Showing ratings:** show the average and the count on cards and on the listing page only once a listing has 3 reviews. Before that, show the reviews without an average.
- **Asking for reviews:** ask guests for a review by email after checkout, and on the trip page.
- **Never invent, seed, import or buy reviews.** Demo listings have none.

### 8.2 "Turned away?" reports (phase 3)
This is how the site enforces its promise.

**Where guests can report:**
- when a host cancels a booking: in the cancellation email and in "הנסיעות שלי" ("המארח ביטל? ספרו לנו")
- on the trip page
- in the "…" menu on every listing ("דיווח על המארח")

**The form asks what happened:**
- the host cancelled because of who I am
- the host asked about my religion or where I'm from
- the host refused or ignored me
- other

It also asks when it happened, with optional text and screenshots (images only, with a size limit).

**What happens next:**
- The report goes to the admin queue as urgent, and I get an email.
- The guest gets a confirmation.
- The host isn't told who reported until I decide.

**My actions:**
- dismiss the report, warn the host, hide their listings, or remove the host
- each action needs a reason, the host gets an email, and every action is logged
- reports are never public

**Automatic flags:** flag hosts who have 2 or more reports, or who cancelled bookings within 48 hours of the booking.

### 8.3 "ביקרנו במקום" badge (phase 3)
- **Who sets it:** only the admin, with the visit date and an internal note saying who visited.
- **Where it shows:**
  - on the listing page with the visit month: "ביקרנו במקום · נובמבר 2026"
  - as a card tag (it counts toward the 2-tag limit)
  - as a filter

---

## 9. Admin panel (phase 3)

**Access:**
- Only admin accounts can open it. Make my account the first admin, and ask me which one.
- Check every admin page and action on the server.

**Sections:**
- **Home:** "דורש טיפול", with counts.
- **Listings to review:**
  - each host's first listing waits for review, as the site promises
  - show the listing together with its mistake-check results
  - I can approve it, ask for changes (with a message to the host) or reject it (with a reason). Each action emails the host.
- **Reports:** turned-away reports, listing reports and review reports.
- **Flags:** host cancellations within 48 hours, no-shows, and hosts with several reports.
- **Bookings:** search, and booking details.
- **Users and hosts:** search, verification status, block or unblock.
- **Verifications:** if the site collects ID or ownership documents, review them here.
  - Documents stay private and are deleted after review.
  - Ask me how we should verify.
- **Badges:** "ביקרנו במקום".
- **Community places:** the round-2 form for real places: name, type, address, coordinates, the date it was verified, and the source.
- **Reference prices** for the price guide.
- **Email outbox,** until email is set up.

**Notifications:** email me when a listing needs review or a report comes in, and send me a daily summary.

**Audit log:** record every admin action.

---

## 10. Google: city pages and basics (phase 6)

**City pages:** a page for each city and type, in each language. For example, `/he/batumi/short-stays` is "דירות לטווח קצר בבטומי". Make the same for monthly, sale and hotels, in Tbilisi, Batumi and the other cities.

**Each page has:**
- a clear title
- 2–3 short paragraphs about the area. Write them only from facts you can check, with no invented numbers, and mark them for my review.
- the real listings
- a map
- a short "how booking works" section
- links to the city's Shabbat times and to the other types

**Indexing:** let Google index a page only when it has at least 3 real listings. Otherwise, set it to noindex and show "עדיין אין כאן מקומות · פרסמו את שלכם".

**Basics:**
- a unique title and description for every page, in every language
- hreflang between the languages, and canonical links
- a `sitemap.xml` with the city pages and the real published listings
- a `robots.txt`
- structured data only where Google supports it, for example breadcrumbs

**Never let Google index demo listings or non-production addresses:**
- Demo listing pages get noindex and stay out of the sitemap.
- Any host that isn't `SITE_URL` (like the Codespaces address) sends noindex on every page.

---

## 11. Things only I can do (add them to OWNER_TODO.md)

1. **Domain and hosting (first).** Give me 2–3 hosting options with their monthly cost, and check that each one allows a business site. The calendar links, the Google pages and the share links all depend on this.
2. **Fix my listing 44:**
   - the check-in and check-out times
   - max guests
   - bathrooms
   - move the late-checkout fine into the house rules, in lari
   - add photos of the kitchen, the balcony and the building entrance, and use only my own photos
3. **Listing 43:** write a Hebrew title and description, without emojis.
4. **Admin:** tell you which account is the admin.
5. **Translation:** choose a translation service.
6. **Verification:** decide how we verify IDs and ownership.
7. **Footer:** approve the footer line "נבנה על ידי משפחה ישראלית".
8. **City pages:** review their texts.
9. **Reference prices (optional):** add ranges from public reports.
10. **Google Search Console:** set it up after the domain is live.

---

## 12. Database changes (propose them first, and wait for my OK)

Adapt these to the existing schema:
- **Phone numbers:** stored in international format, with the existing ones migrated.
- **Listing:**
  - photo room labels
  - `seaWalkMinutes` and `liftWalkMinutes`
  - `visitedAt` and `visitedNote`
  - `weeklyDiscountPct` and `monthlyDiscountPct`
  - translations per language, plus the source language
- **DatePrice:** listing, start, end, price per night, and an optional minimum number of nights.
- **Review:** one per booking, with ratings, text, language, the host's reply, and a hidden flag with its reason.
- **ReviewReport.**
- **Report:** type, what happened, text, attachments, status and admin notes.
- **SavedList** (owner, name, share token, sharing on or off) and **SavedListItem.**
- **SavedSearch:** user, filters, name, when it was last sent, and whether it's active.
- **ListingStatDaily:** listing, date, views, saves, and contact taps per method.
- **RecentlyViewed:** synced to the account.
- **ReferencePrice:** city, type, property type, bedrooms, low, high, currency, source, link and date.
- **AdminAction:** for the audit log.

---

## 13. Tests, order of work, and done

**End-to-end tests (Playwright),** run in production mode:
1. **Post form:** fill in every step, go back to step 1 and forward again, and reload in the middle. Nothing is lost.
2. **Booking:**
   - A guest books a demo short stay: picks dates, sees the itemized total, confirms, and lands on the trip page.
   - The host sees the booking, and the dates are blocked.
   - The guest cancels.
3. **Reports:** a guest sends a "turned away" report, and it appears in the admin panel.
4. **Listing review:** the admin approves a host's first listing, and the host's email appears in the outbox.
5. **Logout:** log out, then log in again.
6. **Shared lists:** a shared list opens for someone who is logged out.
7. **Price guide:**
   - With the real listings, it shows "not enough data".
   - With test-only data, it shows a range. Never put that data in the real database.
8. **Rotation:** rotate the phone (390×844 → 844×390 → 390×844), and the layout comes back correctly.

**Phases:**
1. Section 1 (earlier requests) and section 2 (bugs, including logout and the calendar).
2. Section 3 (design and wording) and section 4 (lighter home page).
3. Section 9 (admin panel), plus 8.2 (reports) and 8.3 (visited badge).
4. Section 6 (mistake check, host stats, holiday prices and discounts) and section 5 (price guide).
5. Section 7 (trip page, shared lists, sea and ski distance, price alerts) and 8.1 (reviews).
6. Section 10 (Google), the full test run, and Lighthouse numbers in production.

**Done when:**
- **Post form:**
  - every bug in section 2 is fixed
  - going back never loses answers
  - the calendar never takes a host out of the form
- **Logout:** anyone can log out.
- **Home page:** first-time visitors see a short home page, and returning visitors see their recent places at the top.
- **Hosts:** they see the price guide, the mistake check and their stats. Guests never see these.
- **Guests:** a guest can book, see the trip page, cancel, report a host, and leave a review after the stay.
- **Admin:** the panel handles listing reviews, reports, flags, badges, community places and reference prices.
- **Google:** the city pages exist, and demo listings and non-production addresses are never indexed.
- **Finish:**
  - all the tests above pass
  - Lighthouse mobile scores 90 or more in production
  - `OWNER_TODO.md` is up to date
