# Round 3, phase 5: the trip page, shared lists, the walk to the sea and the lifts, price alerts and real reviews

This phase covers section 7 of the brief (7.1 the trip page after booking, 7.2 shared wish lists,
7.3 the walking time to the sea and to the ski lifts, 7.4 saved searches and price alerts) and
8.1 (real reviews), with your answers 6, 7 and 10 in `docs/round-3/PLAN.md`.

Six people built the parts side by side (the database changes first). This check put them
together and tested them **in production mode** (the fast version, the way visitors will get it)
on 7 November 2026.

The fast version starts the same way as before: in the codespace terminal run
`bash .devcontainer/start-prod.sh` and open the address ending in **`-3000.app.github.dev/he`**.
The first start with the new code also reloads the demo data by itself (the demo places now know
their walk to the sea or the lifts), which takes a minute longer.

## What changed

### The trip page (brief 7.1)

- **Every booking has its page** ("פרטי ההזמנה", from "הנסיעות שלי", the confirmation and every
  booking email). It shows the status, the dates with the check-in and check-out times, the
  guests, the itemized total and how to pay on arrival.
- **The exact address with a map** (the map loads by itself when you scroll to it; with data
  saver on or on a very slow connection, only after a tap), and the buttons **"פתיחה ב-Google
  Maps"** and **"פתיחה ב-Waze"**.
- **The host's contact buttons** (WhatsApp, Telegram, phone…, the ones the host chose) and the
  hours the host answers, the house rules, the free-cancellation deadline in Georgia time with
  the cancel button, a short "מה עכשיו" list, and the safety note word for word: "בית לא גובה
  תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם.", with a link to the emergency numbers.
- **"הוספה ליומן"** downloads a calendar file with the stay, the address and the booking number
  (it opens in the phone's calendar); **"Google Calendar"** opens Google's calendar with the same
  details.
- **Only when the stay includes a Friday night or a Yom Tov**, a section "שבת בזמן השהייה" shows
  the candle-lighting and Havdalah times for that city on those dates, the nearest synagogue,
  Chabad house and kosher place with walking times (only places our team checked), and "המארח
  לא עונה בשבת" when the host chose that. Otherwise none of it appears.
- **"שמירה לשימוש בלי אינטרנט"** (your answer 10: a button, not automatic): one tap keeps a copy
  of this page on the phone; it then opens without internet, with a line that says it is the
  saved copy. The copy stays only on that device, is removed a week after check-out, and is
  deleted when you log out. It belongs to the account that saved it: when that sign-in ends in any
  other way (30 days without use, "log out of all devices" or deleting the account on another
  device, a suspension) or another account signs in on the phone, the copy is deleted the next
  time any page of the site opens with internet. A cancelled trip's copy is deleted too. When the
  internet is there but the site doesn't answer (a server error, a connection that stalls or
  breaks off), the saved copy opens instead and says so, with "טעינת העמוד העדכני".
- **After the stay**, the page asks "איך הייתה השהייה?" with five quick stars (see reviews below).

### Saved lists you can share (brief 7.2, your answer 7)

- **"שמורים" is now lists:** the default list "שמורים" plus your own, such as "בטומי באוגוסט".
- **The heart saves to the list you used last.** A long press on the heart (on a computer: a right
  click) opens "שמירה ברשימה": choose a list or make a new one. **One list per place:** choosing
  another list moves the place there.
- **The saved page** ("מודעות שמורות") has a tab for each list, and on each place "העברה" (move)
  and remove; each list can be renamed, deleted (its places go back to "שמורים") and shared.
- **Sharing:** "שיתוף" makes a private link that anyone can open without an account, view only.
  It shows the places and the list's name, never the owner's name. There is a WhatsApp button,
  and the link's preview image shows the first place's photo and the list's name. "הפסקת
  השיתוף" turns the link off at once; sharing again makes a new link.
- **Copying:** someone who opens a shared list can tap "העתקה לרשימות שלי"; without an account the
  login window opens first, and the list is then copied into their account.
- **Without an account,** the heart saves on the device; "שמורים" shows those lists. After logging
  in they move into the account (nothing is lost or doubled).
- **On the codespace address** the share link shows but "העתקה" and WhatsApp are switched off,
  like the calendar link, until the site is on its own domain (`SITE_URL`).

### The walk to the sea and to the ski lifts (brief 7.3, your answer 10)

- **The data** is a small file of beaches and coastline (Sarpi, Gonio, Batumi, Makhinjauri,
  Chakvi, Kobuleti and nearby) and of ski-lift boarding points (Gudauri, Bakuriani, Mestia with
  Hatsvali and Tetnuldi), taken from OpenStreetMap on 7 November 2026 and kept with the site. No
  live calls to any map service.
- **The walking time** is worked out from the place's pin the same way as the synagogue walking
  time, and shown with "≈". It is recalculated whenever the host moves the pin.
- **On cards:** "≈ 5 דק׳ הליכה לים" or "≈ 7 דק׳ הליכה למעליות" when it is 15 minutes or less. In the
  sea and ski towns it comes first, and it counts toward the two small tags.
- **On the listing page:** a highlight near the top, "≈ 3 דקות הליכה לים", with "הערכה לפי מפת
  OpenStreetMap" under it.
- **In search:** a "קרוב לים" chip in Batumi and Kobuleti, and "קרוב למעליות" in Gudauri, Bakuriani
  and Mestia (also in the filters). Elsewhere the chip doesn't appear.
- **It replaces "Near the sea":** a listing with a pin no longer shows the host's own "near the
  sea" tick; the calculated walk is used instead.
- **Credits:** the photo credits page is now "קרדיט לתמונות ולנתונים", with a "נתוני מפה" part:
  "© OpenStreetMap contributors" and the licence links.
- Demo places: Batumi 3, 4, 9 and 15 minutes to the sea (one more at 18 minutes, which is too far
  for the tag), Kobuleti 4, Gudauri 7 minutes to the lifts, Bakuriani 9.

### Saved searches and price alerts (brief 7.4)

- **"שמירת חיפוש"** on the results page (next to "מפה" on a phone) saves the city, the type, the
  filters and the dates if chosen, under a name the site suggests ("השכרה לטווח קצר בבטומי ·
  10–14 בדצמ׳") and you can change. Without an account it asks you to log in first.
- **Emails:** at most one email a day about new places that match your saved searches (in the
  morning, Israel time, never on Shabbat or Yom Tov), and an email when a place in one of your
  lists lowers its price by 3% or more. The same place is never sent twice for one search.
- **"התראות וחיפושים שמורים"** in the account: two switches (new places, price drops), and each
  saved search with an on/off switch, open, rename and delete.
- Every email is in the user's language and has an unsubscribe link (opening the link changes
  nothing; one tap on its button does). Until Resend is connected they wait in Admin → "תיבת דואר
  יוצא".

### Real reviews (brief 8.1, your answer 6)

- **Who can review:** only the guest of a stay that happened (short stays and hotels), once per
  booking, from the day after check-out until 14 days later. Never demo listings: they have no
  reviews, and none were made up, seeded or imported.
- **The review:** 1 to 5 stars, six optional quick ratings (ניקיון, התאמה לתיאור, צ׳ק-אין,
  תקשורת עם המארח, מיקום, תמורה למחיר) and the text (at least 20 characters, at least 15 of them
  letters or digits, so a row of dots or emoji isn't a review; no phone numbers, emails or links). Before posting, the guest ticks "I understand it can't be edited or deleted".
- **It shows** as "דנה · נובמבר 2026": the first name and the month only.
- **The average** shows on the card ("★ 4.7 (3)") and on the listing page ("4.7 מתוך 5 · 3
  ביקורות", plus a topic only when 3 reviews rated it) only from 3 reviews. Before that the reviews
  show with "הדירוג הממוצע יופיע אחרי 3 ביקורות".
- **Translation:** a review is translated automatically for other languages, with "הצגת המקור",
  once the Azure key is set; until then it shows as written. Reviews and replies written before the
  key was set, or whose translation failed once, are translated by the daily job (up to 100 a day)
  and by `npm run translate:missing`.
- **All reviews:** the listing page shows the newest 30; with more, "מוצגות 30 הביקורות האחרונות
  מתוך N" and a link to a page with every review, 20 a page.
- **The host** (Account → "ביקורות") can post one public reply, which is final, and can report a
  review to the admin. The guest can report the host's reply there too.
- **The admin** (Admin → "דיווחים" → tab "ביקורות") sees each reported review in full and can hide
  it with a reason and an internal note (both logged), or show it again. Never edit it. Hiding
  removes it from the listing and from the average, and closes its reports. The guest and the host
  get an email with the reason's name (never the note). The same tab lists the newest reviews,
  reported or not, so the admin can open and hide any review; the booking and user pages link to
  their reviews.
- **Asking for reviews:** the day after the stay, the guest gets "איך הייתה השהייה?" by email
  (instead of the plain thank-you, so one email, not two), and the trip page asks too. The guest can
  turn these emails off.

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (48 groups × 5 languages) and 2,211 unit tests (about 230 of them new in this
  phase, for every rule: Friday night and Yom Tov in a stay, the cancellation deadline, the
  calendar file, one list per place and moving, sharing on and off, copying, the device lists
  merging, the walking-time maths and the 15-minute tag, the search filters, the daily email
  window, once a day, never twice, the price-drop rule, one review per booking, the 14-day window,
  first name and month, the average from 3, hiding and showing).
- **End-to-end tests in production mode: all 107 passed** in one clean run, nothing re-run, with
  staff using the real 2-step login. New for this phase:
  - **The trip page:** the demo guest books a Thursday→Saturday stay; the page shows the itemized
    total, the address, Google Maps and Waze, candle lighting and Havdalah, "המארח לא עונה בשבת",
    the safety note and the emergency link; the calendar file has the stay, the address and the
    booking number; "שמירה לשימוש בלי אינטרנט" keeps the page and it opens with the internet off;
    another account gets "not found"; the guest cancels and the Shabbat section goes away.
  - **13.6, a shared list opens for someone logged out:** a list is made with a long press, two
    places go into it, it is shared, a logged-out browser opens it (view only, no owner name, not
    indexed by Google) and its preview image loads; "העתקה לרשימות שלי" asks to log in; another
    user copies it; after "הפסקת השיתוף" the link and its image are gone. Also: hearts on a
    device move into the account after logging in.
  - **The walk to the sea:** Batumi cards show "≈ N min walk to the sea" **as the first tag**; the
    "Near the sea" chip keeps only those; Tbilisi has no chip; Gudauri has "Near the lifts"; the
    listing page highlight names OpenStreetMap; the credits page has the licence links.
  - **Saved searches and price alerts:** a search is saved from the results page; a new matching
    place gives one email, never twice; a price drop gives its email; pausing the search stops
    them.
  - **Reviews:** a guest reviews a finished stay from the trip page (a too-short text and a phone
    number are refused); it shows as "Dana · <month>" with no average; the host replies once (a
    second reply is refused) and reports it; the admin hides it with a reason and a note; with 3
    reviews the average shows on the listing and on the card.
- **What the check fixed in the tests:** the trip-page test found two "מספרי חירום" links (one in
  the footer) and now looks inside the page. In one run, a test opened the booking page signed out:
  the tests keep a sign-in from an earlier test for speed, and that sign-in had ended. The tests now
  check a kept sign-in before using it and sign in again when it is gone (the cause could not be
  pinned down; two more full runs passed). The distance test now also checks that the sea tag comes
  first and that a card has at most two tags.
- **Screenshots** in production mode at 390×844 in Hebrew (light and dark) and 1440×900 in English,
  plus Georgian at 360 px, all looked at: the trip page with and without a Friday night, the
  Shabbat section, "הוספה ליומן" and "שמירה לשימוש בלי אינטרנט" (saved, and the saved copy opened
  offline), the saved lists page, the list sheet, the share window, a shared list opened logged
  out, the WhatsApp preview image, Batumi cards with the sea tag, Gudauri with the lifts tag, the
  listing page highlight, the "קרוב לים" chip, the save-search window, the alerts page, the
  saved-search and price-drop emails, the trip page's review question, the review form, a listing
  with one review (no average) and with three (the average), the host's reply and report, the admin
  "ביקורות" tab, the hide form and a hidden review, the review-request email, and the credits page
  with OpenStreetMap.
- **What the check fixed itself:** the Hebrew review-request email said "איך הייתה השהייה ב-סטודיו
  שקט…" (a hyphen after "ב" before a Hebrew word is wrong). It now says "איך הייתה השהייה? סטודיו
  שקט…" and "השהייה שלכם הסתיימה: …", which reads well whatever the place's name is.
- **Lighthouse (phone, production, `/he`): 85, 91, 91** (the first run right after the server
  started, before the images were prepared). The home page carries the same amount of code as in
  phase 4. Phase 6 must reach 90 on every run.
- Test accounts, listings, bookings, reviews, reports, lists, saved searches, sessions and emails
  were removed afterwards.

## What to check on your phone, in this order

1. Start the fast version and open the `-3000.app.github.dev/he` address **in a private tab**.
   The first start with the new code reloads the demo data (a minute longer).
2. **Search Batumi.** The cards show "≈ 3 דק׳ הליכה לים" as the first small tag. Tap **"קרוב לים"**
   in the chips row: only places within 15 minutes stay. Open listing **104**: near the top,
   "≈ 3 דקות הליכה לים" with "הערכה לפי מפת OpenStreetMap".
3. **Search Gudauri:** "קרוב למעליות" and "≈ 7 דק׳ הליכה למעליות" on the card (listing 107).
4. At the bottom of any page, **"קרדיט לתמונות"** → "נתוני מפה": OpenStreetMap and its licence.
5. **Log in as the demo guest** (+995 555 000 021, the code shows on screen). On the results,
   **press and hold a heart**: "שמירה ברשימה" opens. Tap "רשימה חדשה", call it "בטומי באוגוסט" and
   save. Save another place: it goes into the same list (the last one used). Long-press it again
   and choose "שמורים": it moves.
6. Menu → **"שמורים"**: the tabs of your lists. Open "בטומי באוגוסט" → **"שיתוף"** → "יצירת קישור
   לשיתוף". On the codespace address "העתקה" and WhatsApp are off; press and hold the link in the
   box to copy it, and open it in another private tab: the list opens without logging in, view
   only, and "העתקה לרשימות שלי" asks to log in. Back in the first tab, **"הפסקת השיתוף"**; the link
   now says the page isn't found.
7. Search Batumi again → **"שמירת חיפוש"** (next to "מפה") → the suggested name → "שמירה". Then
   your account → **"חיפושים שמורים"** ("התראות וחיפושים שמורים"): the two email switches and your search,
   with its own switch, rename and delete. The emails themselves arrive in the morning on the real
   site (the codespace runs no scheduled jobs); the screenshots in this check show them.
8. **The trip page.** Open listing **89**, choose a **Thursday to Saturday** in the coming weeks and
   book. On the page after booking: the total, the address with "פתיחה ב-Google Maps" and "פתיחה
   ב-Waze", the host's buttons, **"שבת בזמן השהייה"** with candle lighting and Havdalah and "המארח
   לא עונה בשבת", the safety note. Tap **"הוספה ליומן"**: the phone's calendar opens with the stay.
   Tap **"שמירה לשימוש בלי אינטרנט"**, turn on flight mode and open the page again: the saved copy
   opens. Turn flight mode off and cancel the booking with "ביטול ההזמנה". A Sunday to Tuesday
   booking shows no Shabbat section.
9. **Reviews:** demo listings have none and can't get any (that's the rule), so on the codespace you
   will see only the empty "ביקורות" pages: your account → "ביקורות", and Admin → "דיווחים" → tab
   "ביקורות". The review form, a listing with reviews, the host's reply and the admin's hide form
   are in the screenshots of this check; on the real site the first reviews come the day after the
   first real stays.

## Open issues

- **Reviews can't be tried with demo data** (demo listings never get reviews, and none were
  invented). They were checked end to end with test-only listings and stays, removed afterwards.
- **Reviews are shown as written** until the Azure translation key is set (then each review is
  translated, with "הצגת המקור").
- **Hiding a host's reply on its own** needs a database change (a "reply hidden" field). Until
  then the admin can only hide the whole review with its reply.
- **A saved trip copy on a phone that never comes back online** after its sign-in ended stays on
  it until it does (or a week after check-out passes and the site opens offline). Nothing on the
  phone can check the account without internet.
- **Emails stay in the outbox** ("תיבת דואר יוצא") until Resend is connected. The daily
  saved-search and price-drop email and the review request after a stay run on the real site's
  scheduled jobs (`CRON_SECRET`), not in the codespace.
- **The saved copy of a trip page** shows everything except the place's photo when there is no
  internet (an empty frame where the small photo is). The address, times, host and payment are all
  there.
- **Share links and their WhatsApp button** work only once the site is on its own domain
  (`SITE_URL`), like the calendar links.
- **The walking times** are estimates from OpenStreetMap (a straight line with a detour factor, at
  walking pace). A new beach path or lift won't show until the data is taken again.
- **Lighthouse is 85–91 on `/he`** (91 after the first run); phase 6 has to reach 90 every time.
- **Russian, Arabic and Georgian texts** of this phase are our translations, like the earlier ones.

## Decisions taken while you were away (the careful option, as you asked)

**The trip page**
- "A Jewish holiday" means a day of Yom Tov on the Israeli calendar; Chol HaMoed, Chanukah, Purim
  and fasts don't count. Arriving on Saturday afternoon doesn't count as a Friday night.
- The Shabbat section shows only for confirmed bookings (not cancelled or finished ones).
- "המארח לא עונה בשבת" shows when the host turned on "לא עונה בשבת", keeps Shabbat, or chose the
  Shabbat-keeping host feature. No new setting was needed.
- Nearby places: only real places our team verified, within 5 km of the exact pin, one of each
  kind. Demo listings therefore say "we haven't checked places near here yet".
- "שמירה לשימוש בלי אינטרנט" keeps only this page on this device, removes it a week after
  check-out, and deletes it at logout. (Hardening:) The copy is tied to the account that saved it
  (a coded key, never the account number): signed out in any way, or another account signed in,
  and it is deleted at the next page load with internet. It is never offered or kept for a
  cancelled trip or after the keep window. The site deletes a copy only on a clear sign (signed
  out, "not found" for this account, cancelled), never because of a server error; with a saved copy
  the trip page waits up to 8 seconds for the whole page, then shows the copy. The open page
  refreshes the copy by itself when what it shows changed (times, address, host's buttons, price)
  or the copy is more than an hour old.
- The calendar file uses the check-in and check-out times; with "גמיש" it is an all-day event.

**Lists**
- When a shared list is copied, places the viewer already saved stay in their own list.
- "שמורים" can't be renamed or deleted; deleting another list moves its places to "שמורים".
- List names are unique per account, up to 60 characters, and can't contain a phone number,
  email, link or username (they can become public).
- A shared page shows nothing about its owner, not even a first name, isn't indexed by Google and
  isn't cached. A list whose owner is suspended or deleted doesn't open.
- Saving on the device doesn't wait for the cookie choice (the visitor asked with a tap); logout
  clears it. Sharing a device list needs an account.
- The preview image is a JPEG (a PNG photo is about 1 MB, over WhatsApp's preview limit).
- Limits: 50 lists per account; 100 places on a shared page or in a copy; 20 lists and 200 places
  on a device.
- Moving a place keeps the price it was saved at (for price-drop emails); only a new save sets a
  new price.

**The walk to the sea and the lifts**
- 15 minutes or less shows the tag and passes the "קרוב" filter; beyond 30 minutes no time is kept.
- The nearest beach counts; the coastline is used only when no beach is within reach.
- The host's own "near the sea" tick is kept only for listings without a pin.

**Saved searches and price alerts**
- The daily email goes out between 08:00 and 11:59 Israel time (your daily-summary window), never on
  Shabbat or Yom Tov, at most once a day per person, with up to 5 places per search and 10 searches.
  Only places published after the search was saved, never demo places, never the person's own.
- A price drop counts from 3%. A drop of more than 50% is most likely a change from per week to per
  night or a typing mistake, so it sends nothing (if it stays three days, it becomes the new price
  silently). At most 5 price-drop emails per person per morning. Another currency can't be compared,
  so it sends nothing.
- Up to 20 saved searches per account; a search's name up to 80 characters.

**Reviews**
- The window is the day after check-out to 14 days after, in Georgia days. No-shows and cancelled
  bookings never count. One review per booking, also for a hotel booking with 2 rooms.
- (Hardening:) A host can't report "didn't arrive" once the guest reviewed the stay (a review and a
  report at the same moment never both succeed). When a host reports it, the guest gets an email
  with a link to contact us; the admin can clear a wrong report on the booking's page (with a
  note, logged), and the guest can then review within the usual window.
- The name shown is the first name only; a deleted account, or a name that looks like a phone
  number, shows "אורח".
- The average needs 3 visible reviews, with one decimal; a topic's average needs 3 ratings of that
  topic.
- Hiding needs one of six reasons (offensive content, discrimination or hate, personal details,
  not about the stay, not a genuine review, breaks the rules) and a note; the guest and the host
  get an email with the reason's name, never the note.
- After a stay the guest gets the review request instead of the thank-you email (one email, not
  two), unless they turned review requests off.

**Decided in this check**
- The Hebrew review-request email no longer puts "ב-" before the place's name.
- The tests check a kept sign-in before using it (see "How it was checked").
