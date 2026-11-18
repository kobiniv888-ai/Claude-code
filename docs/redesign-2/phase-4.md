# Round 2, phase 4: booking

Guests now book short stays and hotel rooms on the site and **pay the host at check-in**. Bayit
takes no money and has no payment code. Booking is instant: if the nights are free, the booking is
confirmed at once. The rules, the data model, the notifications and the API for the pages are in
[`booking.md`](booking.md); this page is the gate summary.

Three parts were built side by side and then checked together at this gate:
- the booking core (schema, engine, emails and texts, scheduled jobs, iCal, demo data)
- the guest side (dates and guests sheet, review page, confirmation, "הנסיעות שלי")
- the host side ("הזמנות ומחיר" in the post form, the calendar page, "הזמנות לנכסים שלי",
  `/admin/bookings`)

## What changed

### Guest (brief 5.5)
1. **Dates and guests.** The listing's sticky bar ("בחירת תאריכים", then "הזמנה") and the desktop
   box open one sheet: the calendar with taken nights crossed out and disabled, the minimum-nights
   hint, adults / children / infants counters (the maximum is enforced; infants don't count) and
   the live price ("$70 × 2 לילות", cleaning fee, "סה״כ"). The dates stay in the address.
2. **Review page "אישור הזמנה"** (`/listing/<id>/book?checkIn&checkOut&adults…`): the stay, the
   price breakdown with the currency note, payment methods at check-in, the cancellation policy in
   plain words with the free-cancellation date, the house rules with "קראתי ואני מסכים/ה", the
   guest's name, the verified phone (`<PhoneCheck>` inline when needed), an optional message, and
   "בית לא גובה תשלום. לעולם אל תשלמו מראש בקישור ששלחו לכם.". The server re-checks the price and
   the free nights a moment after the page opens and again when booking; nights that were just
   taken show "התאריכים האלה נתפסו הרגע" with a fresh calendar, never an error page.
3. **Confirmation** = the trip page `/account/trips/<code>?booked=1`: the code (copy button),
   dates, guests, the exact address with Google Maps / Waze, the host's WhatsApp and phone,
   "הוספה ליומן" (.ics), "מה עכשיו" in 3 steps, the amount to pay on arrival and the policy.
4. **"הנסיעות שלי"** (`/account/trips`, a new account tab): upcoming trips (soonest first, "בעוד N
   ימים") and past / cancelled ones; cancelling with a reason, according to the policy.
5. **Notifications** in each person's language: email (Resend, else the outbox) and SMS (Twilio
   Messaging, else the log). Reminder 3 days before arrival; "completed" the day after check-out.

### Host (brief 5.6)
- **"הזמנות ומחיר"** in the post form (short stays and hotels, in place of "מחיר"): price per
  night, weekend price, cleaning fee, deposit, minimum nights, maximum guests, check-in / check-out
  times, the 3 cancellation presets and the payment methods at check-in. Saving it turns instant
  booking on (a nightly price and at least one payment method are needed).
- **Calendar page** (`/account/listings/<id>/calendar`, "יומן" on each card in "הנכסים שלי"):
  block / open ranges, bookings as purple bars, imported nights dashed, the private export link
  and up to 3 import links with "סנכרון עכשיו". iCal sync runs every hour.
- **"הזמנות לנכסים שלי"** (`/account/host-bookings`): upcoming / past / cancelled, the guest's
  name, verified phone (call, WhatsApp) and message; cancelling only with one of the 3 reasons
  (logged; within 48 hours of the booking it is flagged for review) and "האורח לא הגיע" after the
  check-in day.
- **`/admin/bookings`** (staff with "moderation"): flagged cancellations, no-shows, latest bookings.

## Gate check

### Automated checks

| Check | Result |
|---|---|
| `npx prisma validate` | valid |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `npm run i18n:check` | 42 namespaces × 5 languages, all keys match |
| `npx vitest run` | 81 files, 900 tests passed, including the database test that sends two bookings for the same nights at once (exactly one succeeds) |
| Production build (`next build`) | passes; new routes: `listing/[id]/book`, `account/trips`, `account/trips/[code]`, `account/host-bookings`, `account/host-bookings/[code]`, `account/listings/[id]/calendar`, `admin/bookings`, `api/ical/booking/[code]`, `api/cron/booking-reminders`, `api/cron/complete-bookings` |
| End-to-end, whole suite (desktop + phone projects) | 47 tests, all green (one run had a single flaky failure in `mobile.spec.ts` "the Map pill opens the map", a search-page test; it then passed 3 out of 3 times on its own) |

### New end-to-end test: `tests/e2e/booking.spec.ts`

It runs in Hebrew, as the demo guest Noa and the demo host Yossi, on demo short stay #91 ($70 a
night, $20 cleaning, at least 2 nights). The test:
1. Opens the dates sheet and picks two free weekday nights next month. The sheet shows the total,
   $160.
2. Goes on to "המשך להזמנה". The review page shows the total and the "never pay in advance" line.
   Pressing "אישור הזמנה" without the house rules box ticked shows "יש לאשר את כללי הבית." and
   makes no booking.
3. Ticks the box, adds a message and confirms. The trip page opens with "ההזמנה אושרה!", the code,
   the exact address and a WhatsApp/phone link. The database row is `CONFIRMED`, 2 nights, total
   160.00. The guest's "הוספה ליומן" .ics holds the stay.
4. Checks that "הנסיעות שלי" lists the booking.
5. Tries to book the same nights a second time, from a second tab that was opened on the review
   page before step 3. The page says "התאריכים האלה נתפסו הרגע" and stays on the review page.
   There is still exactly one confirmed booking for those nights, and the listing calendar shows
   them as "תפוס" and disabled.
6. As Yossi: "הזמנות לנכסים שלי" lists the booking, its page shows the guest's message, and the
   listing's calendar marks the check-in day with the booking code.
7. Checks the private iCal export: it has the nights as `SUMMARY:Reserved` and not the guest's
   message.
8. As the guest, cancels with "שינוי בתוכניות". The status becomes `CANCELLED_BY_GUEST`, the
   booking's block is deleted, the listing calendar is free again and the iCal export no longer
   has the nights.
9. Checks that the guest's pages logged no console errors.

The booking's message starts with "E2E ". The suite's global teardown (`cleanupTestData`) now also
removes such bookings, together with their blocks, audit rows, outbox emails and `booking:*` rate
limits, even after a crash.

### Screens checked

Screenshots were taken at 390×844 in Hebrew (light and dark) and at 1440×900 in English. They
cover the dates sheet, the review page, the confirmation, "הנסיעות שלי", the host calendar,
"הזמנות לנכסים שלי" (the list and a booking), and the "הזמנות ומחיר" step.

A script also checked 7 pages in all 5 languages at 360 px wide: the review page, the
confirmation, trips, the host list, a host booking, the calendar and the wizard step. None of the
35 pages scrolls sideways or has an element sticking out of the screen.

### Fixes made at the gate
- **`owner-admin.spec.ts` updated for an intended UI change.** For short stays, step 8 is now
  "Bookings and price", and the maximum number of guests moved there from the details step. The
  test now fills in the price per night and the maximum guests, and picks "Cash", which is needed
  for instant booking.
- **Deploy and Codespace pushes.** On a database that already has the round-1 tables, `prisma db
  push` stops and asks for `--accept-data-loss` before it adds the unique index on
  `AvailabilityBlock.bookingId`. As a result, the Codespace start script (`.devcontainer/start.sh`)
  and a Vercel build with `DB_PUSH_ON_BUILD=true` would have failed. The new
  `prisma/sql/before-push.sql` adds that new, empty column and its index first. It is idempotent
  and does nothing on an empty database. `start.sh`, `setup.sh` and `scripts/vercel-build.mjs` now
  run it (`prisma db execute`) before `db push`. It was checked on a scratch database: round-1
  schema → script → push went through with no prompt. The flag was never used.
- **Demo listings no longer promise a discount that booking doesn't give.** The booking total has
  no weekly/monthly discount (the host step removed them), but 9 bookable demo listings still
  showed "הנחה שבועית 10%". `booking-settings.ts` now clears both discounts for bookable demo
  listings, and the local database was updated the same way.
- **`OWNER_TODO.md`:** booking emails use the Resend keys (about 5 emails per booking; without
  Resend there are no booking emails on the real site).
- Removed 3 leftover outbox emails of an earlier test booking (`BT-8EA9K`) that no longer exists.

## What to check on your phone

Log in as the demo guest (+995555000021) and the demo host Yossi (+995555000011) on the dev or
Codespaces preview (codes show on screen there).

1. **Book.** Open a short stay (for example #91), tap "בחירת תאריכים", pick two free nights, add a
   guest, check the total, tap "המשך להזמנה". On the review page: does everything fit at 360–390
   px without sideways scrolling? Is the price, the currency note and the "never pay in advance"
   line clear? Tick "קראתי ואני מסכים/ה" and tap "אישור הזמנה".
2. **Confirmation.** The booking number, the address, Waze / Google Maps, WhatsApp to the host
   (the message is ready, with the booking number), "הוספה ליומן" (it should open your phone's
   calendar).
3. **"הנסיעות שלי"** in the account menu: the trip is listed; open it and cancel with a reason.
4. **As Yossi:** "הזמנות לנכסים שלי" lists the booking with the guest's phone; the listing's
   "יומן" shows it as a purple bar; block two days and open them again.
5. **Post form:** edit a short stay and open the "הזמנות ומחיר" step. Are the cancellation
   presets and payment methods clear?
6. **Dark mode** and **another language** (Russian or Georgian have the longest words) on the
   review page and the trip page.

## Open issues

- **"No SMS service" state on the real site: not tested in a browser.** In development, codes are
  always shown, so the phone check never reports "not available". From the code: for a guest
  without a verified phone, the review page explains that booking on the site needs a phone check
  that isn't available yet, and "שאלה למארח" (WhatsApp / phone reveal) replaces "אישור הזמנה". If
  the host has no contact channel at all, that button renders nothing and only the explanation
  remains. Publishing requires a contact method, so this should not happen in practice.
- **Booking texts are only logged** until `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`)
  is set, and **booking emails go only to the outbox** until Resend is set up (`OWNER_TODO.md`).
- **Hosts' times in the wizard** use the browser's own time field. A computer set to English
  shows "02:00 PM" even on the Hebrew site; phones follow their own settings.
- **Money format:** in Hebrew, amounts inside a left-to-right island (host lists, the confirmation
  steps) read "290$", while amounts in running text read "$ 290". Both are correct for
  `he-IL`, but a single style would look tidier (phase 6).
- **Other machines need a re-seed** (`npm run db:seed`) to drop the old demo discounts. The
  Codespace start script re-seeds by itself.
- **The Next.js dev indicator** (the round "N" button) covers the start of the sticky bar's button
  in development screenshots. It doesn't appear on the real site.
