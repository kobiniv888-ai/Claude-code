# Round 3, phase 1: your earlier requests and the bugs

This phase covers section 1 of the brief (your earlier requests: login, booking alerts, hotels,
country) and section 2 (the bugs from your phone recording, including logging out and the
calendar). It also covers what the plan added to phase 1: the codespace starts the fast version
by itself, the slow version shows a "development version" strip, demo accounts can't open the real
admin panel, and verification decision (b).

Five people built the parts side by side. This check put them together and tested them **in
production mode** (the fast version, the way visitors will get it) on 3–4 November 2026.

## The fast version: one command, one link

In the codespace terminal:

```bash
bash .devcontainer/start-prod.sh
```

Then open the address it prints, the one ending in **`-3000.app.github.dev/he`**
(`https://<your-codespace-name>-3000.app.github.dev/he`). The codespace also starts it by itself
when it opens. If a page shows a thin strip **"גרסת פיתוח (איטית)"** at the top, you are on the
slow version: run the command above and reload.

## What changed

### Your earlier requests (brief section 1)

- **Login.** The login code appears on screen only on the development version or in the
  codespace's test mode, never on the real site. Google sign-in and email codes work once their
  keys are set. SMS codes are used only when a guest books and when a host checks their phone:
  guests no longer see "verify your phone" on their account page (a phone that is already verified
  still shows). If the real site has neither Google nor the email service, nobody could log in, so
  the admin panel shows a red warning and the server prints one when it starts.
- **Booking alerts** (your answer 4). Each host chooses how we tell them about new bookings and
  cancellations: **email**, **Telegram** and **browser notifications**, more than one at a time.
  Instant booking needs email or Telegram, because those two confirm that the message was
  accepted. Notifications alone never count: a host whose only channel is notifications gets
  "שאלה למארח" instead of instant booking. If no confirming channel accepts the alert, the booking
  is undone, the guest sees "שאלה למארח", and you are told. A bounced email pauses only email;
  bookings go on while Telegram works. Telegram shows "בקרוב" until you create the bot (it's in
  `OWNER_TODO.md`).
- **Hotels** (your answer 3) are contact-only until booking by room type is built in phase 4:
  guests see "שאלה למארח", never instant booking, so one booking can't block the whole hotel.
- **Country-ready.** Every listing and every community place now stores its country. The
  per-country settings (time zone, map area, local currency, phone prefix, emergency number 112)
  live in one file. Nothing changes for Georgia.

### The bugs (brief section 2)

- **2.1 Calendar link.** Every link that leaves the site (calendar export, emails, share links,
  sitemap) is built from one setting, `SITE_URL`. Until the site is on its real domain, the
  calendar link says "הקישור יעבוד אחרי שהאתר יעלה לכתובת הקבועה שלו" and Copy is off.
- **2.2 Going back in the post form.** Every step loads its saved answers, also after the form's
  Back button, the phone's Back button, a reload or "Continue". Only answers you changed are saved,
  so an empty step can never wipe a saved one. The step is in the address (`?step=3`). Next waits
  while a step loads or a photo uploads. "Some details need your attention" scrolls to the first
  marked field.
- **2.3 Price under the title.** Every listing shows its main price right under the title. A sale:
  the full price in your currency with ≈, the host's original price ("$68,000 במקור") and the
  price per m². Monthly: per month. Short stays and hotels: per night, plus the total once dates
  are chosen (hotels say "החל מ־").
- **2.4 Translation and emojis.** No translation service is connected yet: only the demo listings
  were translated, by hand (they now say "תורגם ידנית"). Microsoft Azure Translator, your choice,
  is built in and starts working when you add its key. Until then a listing shows its original
  text with "המקור בגאורגית · תרגום", and "תרגום" opens Google Translate. Titles are translated
  too, translations are kept, and they are redone when the host edits. Emojis are removed from
  titles when saving (descriptions keep them).
- **2.5 Phone numbers** are saved as +972 53… and +995 5…, without the 0. The phone field shows
  the country button and the number without the 0; typing "053…" drops the 0 by itself. WhatsApp
  and phone links work for Israeli and Georgian numbers. Numbers already saved are fixed by a
  clean-up that you run from the admin panel (see "Maintenance" below).
- **2.6 Address search** fills in only the street and house number, never a building's name. The
  host adds the entrance and apartment, and both the address and the pin stay editable.
- **2.7 Publish and drafts.** The last step has a big "פרסום" button in the bottom bar. After
  publishing, a success screen offers "view", "share" and "connect your calendar" (or says the
  listing is being checked, usually within a day). The Post page leads with "המשך מהטיוטה" (photo,
  title, step) when you have a draft, and asks before starting a new one.
- **2.8 Currency.** Hebrew, Russian and Arabic start in ₪, English in $, Georgian in ₾. Your own
  choice wins. The currency menu also has "אוטומטי (לפי השפה)" to go back to the language's
  default.
- **2.9 Logging out.** "התנתקות" is at the bottom of the account page, in the side menu and in the
  desktop account menu. It goes to the home page with "התנתקתם" and clears private data from the
  device (recently viewed, compare list). Settings → security has "התנתקות מכל המכשירים".
- **2.10 Calendar inside the form.** In "הזמנות ומחיר", "פתיחת היומן של המקום" opens the calendar
  in a sheet over the form. "סיום" closes it and you are on the same step at the same place. Pages
  that can be reached from the form have "חזרה למודעה".

### Also in this phase (the plan)

- **Admin safety.** Demo staff accounts can open the admin panel only on a test address (the
  codespace or this computer), never on the real domain. In the fast version, even the demo admin
  has to set up Google Authenticator once; the slow version skips it for demo accounts only.
- **Your admin account** (your answer 1) comes from private codespace secrets, never from a file:
  steps in `OWNER_TODO.md`, item 8. Google Authenticator is required for it, also in the codespace.
- **Verification (b).** No ID documents: the ID and owner badges are hidden, no new ID uploads, and
  old ID requests are shown read-only to staff.
- **Maintenance page** (Admin → תחזוקה), for your phone: "גיבוי מלא עכשיו" (a full database
  backup), then for each clean-up "בדיקה (בלי שינוי)" shows what would change, and "הרצה" runs
  it. A run needs a backup from the last hour. The four clean-ups: phone numbers, emojis in titles,
  contact taps stop storing who tapped, and the stored ID and selfie photos.

## How it was checked

- **Automatic checks, all green:** database schema check, type check, code check (lint), the
  translation check (44 groups × 5 languages), and 1,211 unit tests (6 of them new in this check).
- **End-to-end tests in production mode: all 68 passed** on a clean run, nothing re-run (68 passed
  on the final build too; the numbers are in "What the tests found" below). The first run had one
  failure, an old test that still expected a contact tap to store who tapped; your answer 8 changed
  that, so the test now checks that the tap is counted without the person.
- **Staff log in for real.** The tests use no shortcut: they log in with a phone code and then a
  real authenticator code, computed the way Google Authenticator does it. A wrong code is refused,
  and the demo admin can't skip the authenticator in production mode.
- **New tests for this phase:**
  - post form: fill in every step, go back to step 1 and forward again (the form's Back, the
    phone's Back once, and a reload in the middle): nothing is lost
  - log out, then log in again
  - prices per language in a fresh browser: ₪ for Hebrew, Russian and Arabic, $ for English,
    ₾ for Georgian; your choice wins; "אוטומטי" goes back
  - a hotel offers "שאלה למארח", not instant booking, even when its owner's alerts work
  - the booking test still passes for a short stay, and the host's alert is recorded as accepted
    by email (the outbox, in test mode)
  - a host whose only channel left is browser notifications gets "שאלה למארח"
  - the alert settings show email, Telegram ("בקרוב" without a bot) and browser notifications
- **Screenshots** at 390×844 in Hebrew (light and dark) and 1440×900 in English, all looked at:
  the post form steps 2 and 3 after going back, the last step with "פרסום", the success screen,
  `/post` with a draft, the calendar sheet in the form, a sale listing's price, an untranslated
  listing's "המקור בגאורגית", logging out on the account page, the maintenance page check, the
  host alert settings and the development strip. Nothing needed fixing.
- Test accounts, listings and sessions were removed afterwards.

## What to check on your phone, in this order

1. Start the fast version (the command above) and open the `-3000.app.github.dev/he` address.
   There should be **no** "גרסת פיתוח" strip.
2. **Currency:** open the site in a private tab. Prices are in ₪. Switch the language to English:
   $. Georgian: ₾. In the footer's currency menu, pick ₾, then "אוטומטי (לפי השפה)".
3. **Log in** as the demo owner: "Log in with a phone code (test mode)", +995 555 000 011 (the code
   shows on screen). Open the menu: "התנתקות" is at the bottom. Tap it: you land on the home page
   with "התנתקתם". Log in again.
4. **Post form** ("פרסום מודעה"): if you have a draft, "המשך מהטיוטה" comes first. Go to step 3,
   search "sherif khimshiashvili 7": the exact address gets only the street and number. Fill a few
   steps, then go back with the form's "הקודם" and with the phone's back gesture: every answer is
   still there. Reload the page in the middle: same step, same answers.
5. In **"הזמנות ומחיר"**, tap "פתיחת היומן של המקום": the calendar opens over the form; "סיום"
   brings you back to the same place. The calendar link says it will work once the site is on its
   permanent address, and Copy is off.
6. In **"יצירת קשר"**, the phone shows "+972" and the number without the 0.
7. On the **last step**, the big "פרסום" button is in the bottom bar. Publish: the success screen
   shows "view", "share" and "connect your calendar".
8. **A sale listing** (for example 102): the price under the title has ≈, "במקור" and the price per
   m². Your **listing 43**: the Georgian text shows with "המקור בגאורגית · תרגום"; "תרגום" opens
   Google Translate.
9. **Account → הגדרות → התראות על הזמנות** (as the demo owner): email, Telegram with "בקרוב", and
   browser notifications. On an iPhone, notifications work only after "Add to Home Screen".
10. **A hotel** (listing 111): "שאלה למארח", no "בחירת תאריכים".
11. **Admin** (demo admin +995 555 000 001, open `/he/admin`): in the fast version it asks you to
    set up Google Authenticator once. Then **תחזוקה**: tap "גיבוי מלא עכשיו", then "בדיקה (בלי
    שינוי)" on each clean-up to see the counts. Run them ("הרצה") only when the counts look right.

## Open issues

- **Nobody can log in on the real site** until the email service (Resend) or the Google keys are
  set. The admin panel and the server warn about it. This is item 3–4 in `OWNER_TODO.md`.
- **Translation** starts only when the Azure key is set (item 5). Until then, listings show their
  original language with the Google Translate link.
- **Telegram** shows "בקרוב" until you create the bot (item 7).
- **Old phone numbers and emojis in titles** stay as they are until you run the clean-ups from
  Admin → תחזוקה (item 9). The new rules apply to everything saved from now on.
- **Browser notifications** were checked with unit tests and a stored device in the end-to-end
  test; a real phone notification can only be tried on your phone (the test browser can't reach
  Google's or Apple's notification service).
- **Speed (Lighthouse)** was not measured in this phase; it is measured in phase 6.
- **In production mode, phone logins are limited to 10 tries a minute per address** (a protection
  of the login library). Only the codespace's test mode uses phone logins, and only for the demo
  accounts, so you should not notice it. The tests wait and try again when they hit it.
- **Hotels** stay contact-only until booking by room type is built in phase 4.

## Decisions taken while you were away (the careful option, as you asked)

- Guests verify their phone only inside the booking, never from the account page (each check is a
  paid SMS). A phone already verified still shows.
- Numbers already in the database are not changed automatically: they wait for your dry run and
  run in Admin → תחזוקה, after a backup (your answer 8).
- If a named translation service has no key, translation turns off; it never switches to another
  paid service by itself. Demo listings are labelled "תורגם ידנית".
- A hotel shows "החל מ־" (from) per night with no total, because the total depends on the room.
- Demo staff accounts are refused on any address that isn't this computer or the codespace,
  including temporary preview addresses, so they can never work on the real site.
- Old ID verification requests stay visible to staff, read-only (no approve or reject).
- Browser notifications are accepted only from the real notification services (Google, Mozilla,
  Apple, Microsoft), so nobody can make the site call other addresses.
- The "חזרה למודעה" button on the phone-check page shows only to hosts who came from the form.
- The tests use their own admin account with real 2-step login, created for each run and deleted
  afterwards, instead of changing the demo admin.

## Answers still needed

- **The domain name** (item 1 in `OWNER_TODO.md`), so links, calendar links and emails use it.
- **Per-country settings:** today they are the time zone, map area, local currency, phone prefix
  and emergency number. Should anything else differ by country later (for example the company
  details or which countries can receive SMS)? Nothing is needed for Georgia now.
- **The footer line** "נבנה על ידי משפחה ישראלית" (item 12): confirm it or send another line. It
  arrives in phase 2.
