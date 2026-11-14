# Round 3, phase 3: the admin panel, "turned away" reports and "ביקרנו במקום"

This phase covers section 9 of the brief (the admin panel), 8.2 ("Turned away?" reports) and 8.3
(the "ביקרנו במקום" badge).

Four people built the parts side by side. This check put them together and tested them **in
production mode** (the fast version, the way visitors will get it) on 4 November 2026.

The fast version starts the same way as before: in the codespace terminal run
`bash .devcontainer/start-prod.sh` and open the address ending in **`-3000.app.github.dev/he`**.
The admin panel is at the same address with **`/he/admin`** at the end. In the fast version it
always asks for **Google Authenticator** (2-step login), also for the demo admin.

## What changed

### The admin panel (brief 9)

- **Home: "דורש טיפול".** One block at the top with a count and a link for everything that waits
  for you, the most urgent first: reports from guests who were turned away (marked "דחוף"),
  listings waiting for review, other open reports, host cancellations within 48 hours, hosts with
  several reports, guests who didn't come (for information only), bookings that were not saved
  because the host got no alert, and emails that failed or are only kept in the outbox. When
  nothing waits, it says so.
- **Listings to review ("בדיקת מודעות").**
  - Every host's **first listing always waits for you**, as the site promises. If the site can't
    tell for sure (a database error), the listing waits too.
  - A host with an open flag (see "סימונים") also waits with every **new** listing. Changes to
    their listings that are already on the site are not held.
  - When you **ask for changes** or **reject**, the host's fixed listing comes **back to you**. It
    never goes on the site by itself.
  - The review page says **why the listing waits** and has a **"בדיקה לפני פרסום"** box: each
    automatic check (verified phone, first listing, photos already on the site, price compared
    with the area, suspicious phrases, contact details in the text, and more) with "תקין" or what
    it found. The host's own mistake check (phase 4) will be added to the same box.
  - Approve, ask for changes (with a message) or reject (with a reason): **each one emails the
    host.** When email isn't available for that host, the message goes by Telegram or a browser
    notification instead.
- **Reports ("דיווחים").** Three tabs: guests who were turned away, listings and profiles, and
  reviews (empty until reviews arrive in phase 5). Turned-away reports are always at the top and
  marked "דחוף". Details below.
- **Flags ("סימונים").** Three lists: host cancellations within 48 hours of the booking, guests who
  didn't come, and hosts with 2 or more reports in the last 12 months (dismissed reports don't
  count). "סימון כנבדק" closes a flag; a new report opens it again.
- **Bookings ("הזמנות").** Search by booking number, guest name, phone, email or listing number,
  with filters for status and dates. Each booking has its own page: dates, guests, the price lines,
  the cancellation, the alerts the host got, and any report about it.
- **Users and hosts ("משתמשים").** A "hosts only" filter. A user's page now shows their
  listings, bookings as a host and as a guest, reports about them and by them, their flags, and
  block or unblock.
- **Verifications ("אימותים").** As you decided (option b), no ID documents are collected. Old
  requests stay read-only. Every time staff open a stored document, it is written to the audit
  log.
- **"ביקרנו במקום".** See below.
- **Community places.** The round-2 form (name, type, address, coordinates, the date it was
  checked and the source) is unchanged, under Content → מקומות יהודיים.
- **Reference prices ("מחירי ייחוס")** for the price guide of phase 4: city (and neighborhood if
  you want), deal type, property type, bedrooms, a low and a high price, the currency, where the
  numbers come from (name, link and month) and a note. A range can be switched off without
  deleting it. Only ranges you add from public reports are kept: never single listings.
- **Email outbox ("תיבת דואר יוצא").** Every email the site would send is kept here until the
  email service (Resend) is connected. Once it is, "שליחה מחדש" sends one that waited.
- **Emails to you.** You get an email when a listing starts waiting for review (at most one per
  listing every 6 hours) and right away when a report comes in (turned-away reports as "דחוף").
  **A daily summary** arrives at 08:00 Israel time (at the latest before noon), never on Shabbat
  or Yom Tov; the morning after, it covers the days you missed. These go to the private address
  `ADMIN_ALERT_EMAIL` (item 8 in `OWNER_TODO.md`). Until that is set, they go to the real admin
  accounts, or stay in the outbox.
- **Audit log ("יומן פעולות").** Every staff action is recorded, including opening a report's
  screenshots or a stored document.
- **Only staff get in.** Every admin page and every admin action is checked on the server. A
  signed-in user who is not staff gets "page not found", on every page and file of the panel.

### "Turned away?" reports (brief 8.2)

- **Where a guest can report:**
  - in the **"…" menu on every listing**: "דיווח על המארח";
  - in **"הנסיעות שלי"**, under a trip the host cancelled: "המארח ביטל? ספרו לנו";
  - on the **trip page** (a card after a host cancellation, and a link on every trip);
  - in the **cancellation email**: its link opens the form right away.
- **The form** asks what happened (the host cancelled because of who I am / asked about my religion
  or where I'm from / refused or ignored me / something else), when it happened (it starts on the
  day of the cancellation), the guest's own words (needed for "something else") and up to 5
  screenshots (images only, up to 5 MB each). The hidden details inside a photo (such as where
  it was taken) are removed, and the photo is stored privately.
- **What happens next:** the report waits at the top of your queue as **urgent**, you get an
  email, and the guest gets a confirmation. **The host is not told who reported.** The trip then
  shows "דיווחתם על ההזמנה הזו", so the same booking isn't reported twice.
- **Your decisions** (each with a reason, each written to the audit log):
  - **דחייה** (dismiss): when the report shows no real problem. Nobody gets an email, because the
    host never knew about it.
  - **אזהרה למארח** (warn): the host gets an email with the reason, in their language.
  - **הסתרת כל המודעות שלו** (hide all their listings): their live listings leave the site;
    bookings already made stay. The host gets an email.
  - **הסרת המארח** (remove the host): the account is blocked and signed out, and its listings
    paused. The host gets an email.
  - **לספר למארח מי דיווח** (tell the host who reported): a separate step, only when you decide
    it's needed: only an admin (you) sees this button, a moderator never does. The host gets only
    the guest's first name.
- **Screenshots** can be opened only by staff with the right permission, one tap at a time, and
  every opening is in the audit log. They are deleted 180 days after your decision.
- **Automatic flags:** a host with 2 or more reports in 12 months, or a host who cancelled within
  48 hours of the booking, shows up under "סימונים". Turned-away reports never hide a listing by
  themselves: you decide.
- **Reports are never public.**

### "ביקרנו במקום" (brief 8.3)

- **Only an admin** sets it, in Admin → "ביקרנו במקום": find the listing by number or title,
  "הוספת ביקור", the visit date and an internal note saying who visited. Moderators can see the
  list but not change it. Demo listings can't get it.
- **On the listing page**, under the host's name: "ביקרנו במקום · נובמבר 2026" (the month only).
- **On cards** it is the first tag, in green with a pin, and it counts toward the 2-tag limit.
- **As a filter:** "ביקרנו במקום" in the filters, under "המודעה".
- **The note and who entered it stay in the admin panel.** The tests check that they never reach
  the public pages.
- The badge **doesn't expire** and stays when the host edits the listing. The badges page warns
  you when the address, the pin or most of the photos changed after the visit.
- "הסרת התג" takes it off the site at once (with a reason, kept in the audit log).

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (44 groups × 5 languages) and 1,478 unit tests (about 150 of them new in this
  phase, for every rule: who may do what, the review rule, flags, the daily summary's hours, the
  report form, who learns what, the badge).
- **End-to-end tests in production mode: all 88 passed** on a clean run, nothing re-run, and all
  88 again on a second build with the fixes below (the last one-line fix, the flags label, was
  checked with the screenshots and the report test). The tests sign in with email codes where
  they can, so the run stays under the site's limit of 20 phone codes an hour. Staff use the real
  2-step login (an authenticator code, computed the way Google Authenticator does it).
- **New tests for this phase** (6, plus the turned-away test the reports builder added):
  - **13.4:** a new host publishes a first listing; it waits for review; the review page says why
    and shows "בדיקה לפני פרסום"; the admin approves it, and the host's "approved" email is in the
    outbox (in the database and on the outbox page).
  - **Ask for changes:** the admin asks for changes; the host gets the email, fixes the text and
    saves; the listing comes back to review (not to the site) and waits in the queue again.
  - **13.3 from a cancelled booking:** under "הנסיעות שלי", "המארח ביטל? ספרו לנו" opens the form
    on the trip; the date starts on the cancellation day; the guest picks a reason and another day,
    writes a few words and adds a screenshot. The report is saved as urgent, with the booking; the
    guest gets a confirmation and you get an email. In the admin panel it is in "אורחים שנדחו",
    marked "דחוף", with the guest's choice, the date they picked, the booking number and the
    screenshot. The guest who sent the screenshot can't open it through the staff link; the
    admin's opening is in the audit log. Afterwards the trip says it was reported.
  - **13.3 from the listing's "…" menu** (the reports builder's test): the report waits at the top
    of the queue as urgent.
  - **"דורש טיפול":** the numbers on the admin home are the same as in the database (listings
    waiting, turned-away reports, other reports), urgent first, each row opens its list, and the
    block reads "דורש טיפול" in Hebrew.
  - **"ביקרנו במקום":** the admin adds a visit (the note is required); the listing page shows
    "ביקרנו במקום · נובמבר 2026"; on the card it is the first tag, with at most 2 tags; the filter
    finds it; **the note and who entered it are nowhere in the public pages** (the page text and
    its hidden page data were searched); removing the badge takes it off at once.
  - **Only staff:** a signed-in user who is not staff gets "page not found" on every admin page of
    this phase (home, badges, flags, bookings and a booking, reference prices and the form, reports
    and a report, the outbox, a user, a listing review) and on the staff-only screenshot and
    document links.
- **Screenshots** in production mode at 390×844 in Hebrew (light and dark) and 1440×900 in
  English, all looked at: the admin home with "דורש טיפול", the review page with "בדיקה לפני
  פרסום", flags (both lists), a booking search and a booking, a user's page, reference prices (the
  list and the form), the reports queue and a report, the guest's report form (from the listing
  and from a cancelled trip), "הנסיעות שלי", a cancelled trip, the badges page, a listing with
  "ביקרנו במקום" and a card with the tag. Georgian and Russian were checked at 360 px too.
- **What the check fixed:**
  - **Dark mode:** the red "דחוף" tags and the red count on the reports tab had white text on light
    red (hard to read). They now use dark text in dark mode, like the rest of the site.
  - **Georgian on a phone:** on the badges page, a long visit date and the "changed since the
    visit" warning ran past the right edge. They now wrap.
  - **Hebrew text boxes:** in the report form and the admin notes, the grey example text stood on
    the left with the full stop in front. It now starts on the right, like the label.
  - **Flags:** "מודעה 4025" no longer breaks between the word and the number.
- Test accounts, listings, bookings, reports, screenshots, reference prices and sessions were
  removed afterwards (the tests' own clean-up now also removes uploaded screenshots and reference
  prices).

## What to check on your phone, in this order

1. Start the fast version and open the `-3000.app.github.dev/he` address **in a private tab**.
2. **Log in as the demo guest** (+995 555 000 021, the code shows on screen). Open **listing 108**,
   tap **"…"** next to the booking button → **"דיווח על המארח"**. Choose "המארח שאל על הדת שלי או
   מאיפה אני", write a few words, add a screenshot from your phone if you like, and send it. You
   see "תודה שסיפרתם לנו".
3. Open the menu → **"הנסיעות שלי"**: the demo guest's trips. (A trip the host cancelled shows
   "המארח ביטל? ספרו לנו".)
4. **Log out and log in as the demo admin** (+995 555 000 001), then open **`/he/admin`**. The fast
   version asks you to set up Google Authenticator once (scan the code with the app, then type
   the 6 digits). If your own admin account is already set up (item 8 in `OWNER_TODO.md`), use it
   instead.
5. **"דורש טיפול"** at the top of the home page: the report from step 2 is the first row, marked
   "דחוף". Tap it: the report list opens on "אורחים שנדחו".
6. Open the report: what the guest chose, when it happened, their words and the screenshot
   ("הצגת צילום המסך"). Try **"דחייה"** with a short reason (nobody gets an email). The report
   moves to the closed ones.
7. **"בדיקת מודעות"**: open a listing that waits (if there is none, post a test listing from a new
   account: as its first listing, it waits). Look at "למה המודעה מחכה" and "בדיקה לפני פרסום".
   Approve it, then open **"תיבת דואר יוצא"**: the host's "approved" email is at the top.
8. **"סימונים"**, **"הזמנות"** (type a booking number such as BT-DEM2A) and **"משתמשים"** (open a
   host): look around, nothing to change.
9. **"ביקרנו במקום"**: type the number of a listing that is not a demo (for example your listing
   44), "הוספת ביקור", today's date and a note. Open the listing: "ביקרנו במקום · נובמבר 2026"
   under the host's name; in the search, its card has the green tag first. Back in the admin,
   **"הסרת התג"** unless someone really visited.
10. **"מחירי ייחוס"** (optional): "הוספת טווח" shows the form. Add a range only from a real public
    report, with its link and month.
11. On the real site, the **daily summary** arrives at 08:00 Israel time. The codespace runs no
    scheduled jobs, so it doesn't arrive there.

## Open issues

- **The daily summary can't be tried in the codespace:** the codespace runs no scheduled jobs. On
  the real site it runs by itself (with `CRON_SECRET`, see `OWNER_TODO.md`).
- **Emails stay in the outbox** ("תיבת דואר יוצא") until Resend is connected (item 3 in
  `OWNER_TODO.md`). Until then you see your alerts there, not in your inbox.
- **The "ביקורות" tab is empty** until reviews arrive in phase 5; review reports come with them.
- **"בדיקה לפני פרסום"** lists the automatic checks for now; the host's own mistake check is added
  to the same box in phase 4, together with the price guide that uses the reference prices.
- **On a computer** there is no "…" bar on a listing: "דיווח על המארח" is a link under the host
  card. On a phone it is in the "…" menu next to the booking button.

## Decisions taken while you were away (the careful option, as you asked)

- **Reviews of listings:** a host's first listing always waits, even if the check itself fails.
  A flagged host's **new** listings wait; changes to their listings already on the site don't. A
  listing sent back ("ask for changes" or a rejection) always comes back to you after the fix.
- **Flags:** a flag closes only when staff tap "סימון כנבדק", and any new report opens it again.
  Guests who didn't come are listed for information only. Turned-away reports count toward the
  "several reports" flag (2 or more in 12 months; dismissed ones don't count), but never hide a
  listing by themselves.
- **Your decisions on a report:**
  - "דחייה" needs a reason for the team and sends no email (the host never knew about the report).
  - Warning, hiding all listings and removing the host each need a reason and email the host,
    without naming the guest. Removing a host also needs the permission to manage users. Hiding
    all listings takes only the live ones off the site; bookings already made stay.
  - Telling the host who reported is a separate step, admins only, once per report, for
    turned-away reports only, never after a dismissal, never for a guest who deleted their
    account, and only when the host has an email address (otherwise nothing is recorded). It gives
    the guest's first name only and doesn't close the report; a revealed report can't be dismissed
    any more (close it with "סימון כטופל").
  - Every decision claims the report first, so two people deciding at once never both act. Staff
    other than an admin never decide a report about themselves (or one they sent), never approve
    or restore their own listing, and nobody marks their own booking or host flag reviewed.
  - After "hide all their listings" or "remove the host", the host stays flagged until someone
    marks them reviewed: a paused, expired or new listing waits for review instead of going live.
    Removing a host pauses only live listings; hidden ones stay hidden until a moderator restores
    them.
  - Approve and restore publish the listing as the moderator saw it: when the host saved a change
    after the automatic checks ran, the checks run again first (the review page warns about it).
- **Guests' reports:** one open report per guest, host and booking; at most 5 reports a day per
  guest; the date must be within the last year. Screenshots are deleted 180 days after your
  decision; the report itself and its text stay.
- **"ביקרנו במקום":** only an admin sets it (moderators only see the list). It doesn't expire and
  stays when the host edits; the badges page warns when the address, the pin or most photos
  changed. The visit date can't be in the future or more than 2 years back. The site shows the
  month only.
- **Emails to you:** at most one "waiting for review" email per listing every 6 hours (and 20 an
  hour in all); the rest are in the queue and the daily summary. The summary goes out once a day,
  between 08:00 and noon Israel time, never on Shabbat or Yom Tov, and covers the days you missed
  (up to a week).
- **Audit log:** opening the same document again within 10 minutes is written once.
- **Reference prices:** a range belongs to a city (and, if you choose, a neighborhood); deleting a
  city that has no listings also deletes its ranges. The month of a report is kept as its first
  day.

## Security and quality check after phase 3

After phase 3 was built, five separate reviews went through it, each looking for one kind of
problem: who can see and do what, personal data, two people acting at the same moment, the admin
pages on a phone, and the wording in all five languages. Everything they confirmed was fixed, and
then the whole site was checked again in production mode.

### What was found and fixed (most important first)

**Who can see and do what**
- Only an admin (you) can tell a host which guest reported them. Before, a moderator could do it
  too. A moderator now sees a short note instead of the button, and the site refuses the step for
  anyone who isn't an admin, whatever way it is asked.
- Staff other than an admin no longer decide anything about themselves: a report about them or one
  they sent, or approving or restoring their own listing. Nobody, you included, marks their own
  booking or host flag as reviewed.
- A host is never told the name of a guest who deleted their account. If the host has no email
  address that works, nothing is recorded, so you can try again later.

**Personal data**
- "Download my data" no longer includes the team's internal visit note, who visited or the internal
  report count. Any new kind of listing information must now be decided on before it can appear in
  the download.
- Every opening of a report screenshot by staff is in the audit log (once per 10 minutes, like
  documents), and a problem with the log never stops the screenshot from opening.

**Two people, or two taps, at the same moment**
- Each decision on a report "takes" the report first. If two staff members decide at the same
  moment, only one decision goes through, and the host is never warned or emailed twice. If the
  step on the host's account fails, the report goes back to open.
- "Tell the host who reported" and "dismiss" can no longer both happen to the same report.
- A guest who taps "send" twice gets one report, and can't get past the 5-a-day limit that way.
- If a new report about a host arrives while the flags page is open, "mark reviewed" asks you to
  look again first.
- Approving or restoring a listing the host changed after the automatic checks ran: the checks run
  again first, and the review page warns you.

**Hosts after a decision**
- After "hide all their listings" or "remove the host", the host stays flagged until someone marks
  them reviewed: a listing they bring back, renew or post waits for review instead of going live.
- Removing a host pauses only their live listings; hidden ones stay hidden.
- Edits to a live listing are always checked (also when the host clears the price), and if the
  check can't run, the listing waits for review. A hidden listing that now contains a blocked word
  goes to review instead of back online.

**Uploads, limits and night jobs**
- Screenshot uploads: the "too many uploads" limit is checked before the file is even read, and a
  report screenshot can be at most 5 MB.
- Turned-away reports have their own email allowance, so an urgent one reaches you even in a busy
  hour.
- The night clean-up: one failing step no longer stops the others, and two runs at once no longer
  trip over each other.
- "Delete all demo data" now also deletes the screenshots and attachments only demo rows used.

**Your emails and the daily summary**
- An email that only waits in the outbox (while Resend isn't connected) no longer counts as
  delivered, so Telegram and phone notifications are tried too.
- The email about a host's first listing no longer says "the checks found a risk" when they found
  nothing.
- When the hourly email limit holds back a "waiting for review" email, that listing isn't silenced
  for the next 6 hours.
- "Send again" in the outbox is refused for demo and test addresses, demo or deleted accounts, and
  guest-to-host messages (their reply address isn't kept).
- The daily summary: after more than a week without one, the next covers the last 7 days; a run
  that stopped half-way is taken over after 5 minutes; and it is tried every hour that morning, so
  one failed send is tried again.

**Admin lists and numbers**
- Search finds a pasted phone number even with hidden marks, Arabic-Indic digits, a phone or
  WhatsApp link or a leading 0, and booking numbers with hidden marks. Searching by name or email
  no longer stops at 200 people.
- "דורש טיפול": when a number couldn't be counted, the block says so instead of "all clear" (and
  the daily summary waits for the next run). Each row opens a list counted the same way, and the
  flags number no longer counts guests who didn't arrive.
- Reference prices: "45,5" is read as 45.5 and "1,500" as 1,500; "1.500" is refused.
- Saving the same "ביקרנו במקום" date again keeps what was recorded at the visit.
- How many hours a host took to cancel is rounded the same way on every page, and a report's
  decision date is the day it was in Georgia.

**Forms, phones and languages**
- The report form's date is now a calendar in the page's language ("4 בנובמבר 2026"), not the
  phone's own date field, which could show 11/03 for 3 November.
- After a mistake in the report form, the screen moves to the field to fix; after sending, to
  "סגירה"; after removing a screenshot, back to "add screenshots". Admin dialogs announce a
  missing field and move to it.
- On a phone, admin tabs wrap onto a second line instead of scrolling sideways, and row buttons are
  at least 44 px tall.
- Names and "+30 נקודות" no longer jump around inside Hebrew sentences; Hebrew wording follows the
  site's style ("הכל", "דמו"); a Russian plural was fixed; and the audit log now shows readable
  names for the older actions too (content, places, FAQ, cities, maintenance, Telegram links).

### What this final check fixed itself
- **Georgian on a phone:** on "מחירי ייחוס" (and any admin page with a button next to its title), a
  long button covered the title and squeezed the description into a narrow column. The button now
  moves under the title when there is no room.
- **Hebrew search boxes in the admin panel** (bookings, outbox and the other lists) showed their
  grey example text from the left, with "#1234" in front. It now starts on the right.
- **Filter boxes on a phone:** the last drop-down was a little narrower than the one above it.
  They are now the same width.
- **A moderator's report page** said "only you can decide to tell them" who reported. It now says
  only an admin can.
- Two automatic tests were brought up to date with the changes (the new calendar, and the "…" menu
  that is now called "אפשרויות נוספות"), and one new test checks the moderator rules with a real
  moderator account and real 2-step login: no "tell the host who reported" button, and no
  decisions on a report about their own listing or on their own listing waiting for review, while
  the admin sees both.

### How it was checked
- **Automatic checks, all green:** database schema check, type check, code check, translation
  check (44 groups × 5 languages) and 1,571 unit tests (about 90 of them new in this check).
- **End-to-end tests in production mode: all 89 passed** in one clean run, nothing re-run, with
  staff using the real 2-step login.
- **Screenshots** in production mode of every page the fixes touched, at 390×844 in Hebrew (light
  and dark) and 1440×900 in English, plus Georgian at 360 px where the layout changed: the admin
  home, the reports list, an open and a decided report, the "warn the host" dialog, flags, bookings
  and a booking, the outbox, reference prices and the form, "ביקרנו במקום", a user's page, a
  listing review, the guest's report form (with its calendar and an error), the listing's "…" menu
  and the host's statistics.
- Test accounts, listings, reports, sessions and files were removed afterwards.

### Still open
- **Demo listings waiting for review** show "the results may be out of date" on the review page,
  because the demo data has no time for its checks. Approving runs the checks again, so nothing
  goes wrong; real listings don't show it.
- **The date filters in the admin panel** (for example on "הזמנות") still use the phone's own date
  field, so an English phone shows mm/dd/yyyy. Only staff use them; they can get the same calendar
  as the report form later.
- **Leftovers from earlier test runs** are still in this computer's database (not on the real
  site): two "Gate" test accounts with made-up @example.test addresses and their outbox emails, an
  account named after a phone number from 31 October, and two deleted "(test)" listings. They
  disappear with the next database reset (`npm run db:reset`).
