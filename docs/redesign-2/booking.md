# Booking on Bayit (round 2, phase 4)

Guests book short stays and hotel rooms on the site and **pay the host at check-in**. Bayit takes no
money and has no payment code. Booking is **instant**: if the nights are free, the booking is
confirmed at once. A host cannot choose guests (this is how the site enforces the pledge); hosts set
rules (minimum nights, maximum guests, check-in times, house rules), not people.

Code: `src/lib/booking/` (engine), `src/lib/email/templates.ts` (booking emails), `src/lib/sms.ts`
(texts), `src/lib/ical.ts` + `src/app/api/ical/**` (calendars), `src/app/api/cron/**` (jobs).
Text: `messages/<locale>/booking.json` (shared vocabulary) and `messages/<locale>/emails.json`
(`templates.booking_*`, `sms.booking_*`, `booking.*` labels).

## Data model (docs/redesign-2/PLAN.md, "Booking data model")

**Listing** (existing fields reused: `price` with `pricePeriod NIGHT`, `cleaningFee`, `currency`,
`minStayNights`, `maxGuests`, `checkInFrom`, `checkOutUntil`, `icalImportUrls`, `icalToken`):

| New field | Meaning |
|---|---|
| `bookingMode` | `INSTANT` (guests book on the site) or `CONTACT` (ask the host). Default `CONTACT`; short stays and hotels switch to `INSTANT` when the host saves the booking settings. Monthly rentals and sales are always `CONTACT`. |
| `weekendPrice` | Optional price for Friday and Saturday nights. |
| `cancellationPolicy` | `FLEXIBLE` (24 hours), `MODERATE` (5 days, default), `STRICT` (14 days). |
| `paymentMethodsAtCheckIn` | `"cash" \| "card" \| "bank_transfer"`, in the host's currency. |

**AvailabilityBlock**: `source` is `OWNER` (the host), `ICAL` (imported) or `BOOKING`;
`sourceRef` = the iCal UID or the booking id; `bookingId` (unique) links a booking's nights.
`endDate` is exclusive. `icalUid` is kept as a legacy copy of the UID.

**Pushing this schema onto an existing database:** `prisma db push` asks for `--accept-data-loss`
before it adds the unique index on `AvailabilityBlock.bookingId` (it can't tell the column is new).
Run `npx prisma db execute --file prisma/sql/before-push.sql` first (idempotent: it adds the new,
empty column and its index); the Codespace scripts and `scripts/vercel-build.mjs` already do.

**Booking**: `code` ("BT-" + 5 characters without 0/O/1/I, e.g. `BT-7K3Q9`), listing, guest, host;
`checkIn`/`checkOut` (Georgian calendar days, `@db.Date`), `nights`, `adults`, `children`, `infants`;
money copied at booking time (`nightlyPrice`, `weekendPrice`, `subtotal`, `cleaningFee`, `total`,
`currency`) plus the guest's estimate (`displayCurrency`, `displayTotal`); terms copied at booking
time (`cancellationPolicy`, `paymentMethods`); `status`; cancellation (`cancelReasonCode`,
`cancelReason`, `cancelledAt`, `cancelledById`, `flaggedForReview`); `noShowReportedAt`,
`messageToHost`; guest snapshot (`guestName`, verified `guestPhone`, `locale`); `rulesAcceptedAt`,
`reminderSentAt`. Hotels: `roomTypeId` + `roomTypeName` (a snapshot of the names).

## Rules

- **Dates.** Calendar days in `Asia/Tbilisi` (UTC+4 all year). Nights = checkOut − checkIn.
  Weekend nights = Friday and Saturday nights. A stay may start today (Georgia time) and at most
  730 days ahead; at most **90 nights** on the site.
- **Guests.** At least one adult. Adults + children count toward `maxGuests`; **infants (under 2)
  do not** (at most 5).
- **Price.** Nightly breakdown (weekday / weekend), subtotal, cleaning fee, total — in the host's
  currency (cent arithmetic, no float drift), plus an estimate in the guest's display currency
  from the stored exchange rates. `quoteStay()` in `pricing.ts` is pure and runs the same rules on
  the review page, in the action and inside the transaction.
- **Hotels with room types.** The guest picks a room type and pays its nightly price (in its
  currency); the whole listing is still booked as one unit. The listing's weekend price does not
  apply to room types; its cleaning fee only when the currencies match. Booking per room type with
  a room count can come later.
- **No overlaps.** `createBooking()` runs in **one transaction** that locks the listing row
  (`SELECT … FOR UPDATE`), re-reads the listing (prices and terms are copied from this locked
  read), checks every block (OWNER, ICAL, BOOKING), then creates the booking and its BOOKING block.
  Two guests can never get the same night (integration test: two concurrent bookings → exactly one
  succeeds; it fails without the lock).
- **Who can book.** Listing `LIVE`, `bookingMode INSTANT`, short stay or hotel; a signed-in guest
  (Google, email code, or phone in dev/test) whose account is active and has a **verified phone**;
  house rules accepted; not the guest's own listing; no block between guest and host (a refusal
  caused by a block is written to the audit log, `booking.refused_blocked`). **Demo listings** can
  only be booked in development / test mode or by demo accounts — never by a real guest on the real
  site. Rate limits: 8 bookings per account per hour, 20 per IP per hour. During Shabbat mode (the
  admin setting) new bookings are paused like posting and messaging.
- **Cancellation policies.** Free cancellation ends 24 hours / 5 days / 14 days before the
  **check-in time** on the check-in day (the listing's "check-in from", else 14:00, Georgia time).
  Guests pay at check-in, so a later cancellation is only recorded as *late* (in the audit log and
  the host's email) — nothing is charged.
- **Guest cancels** a confirmed booking any time until the end of the check-in day, with a reason
  (`CHANGE_OF_PLANS`, `FOUND_OTHER_STAY`, `TRAVEL_PROBLEM`, `HOST_ASKED`, `OTHER` + text). "The host
  asked me to cancel" flags the booking for review (a way around the pledge).
- **Host cancels** only with a reason (`DOUBLE_BOOKING`, `PROPERTY_ISSUE`, `OTHER` + text), until the
  end of the check-in day. Every host cancellation is in the audit log (`booking.cancel_by_host`,
  with hours since booking and days before check-in); those **within 48 hours of the booking** set
  `flaggedForReview`. The guest's email explains that every host cancellation is reviewed and how
  to tell us if it was about who the guest is.
- Both cancellations delete the booking's block (the nights are free again) and tell the other side.
- **No-show** ("לא הגיע"): the host can report it from the day after check-in until 7 days after
  check-out (late arrivals happen), on a confirmed or completed booking → `NO_SHOW`, logged
  (`booking.no_show`). The rules for no-shows are decided later.
- **Completed**: a confirmed booking becomes `COMPLETED` the day after check-out (cron); the guest
  gets a thank-you email. Reviews come later (see "Deferred").
- **Reveal.** The exact address, the map point / directions (Google Maps, Waze) and the host's
  phone / WhatsApp are returned only to the **guest of a CONFIRMED or COMPLETED booking**
  (`getGuestTrip().reveal`, `canRevealHostContact`). The host sees the guest's name and verified
  phone for their own bookings. The public iCal feed never holds guest details.
- **Account deletion.** `releaseBookingsOfDeletedAccount(userId)` cancels the account's upcoming
  bookings (as guest or host), tells the other side and clears the guest snapshot (to be called by
  "Delete my account").

## Statuses

`CONFIRMED` → `CANCELLED_BY_GUEST` | `CANCELLED_BY_HOST` (before/on the check-in day) →
or `COMPLETED` (cron, day after check-out) → or `NO_SHOW` (host report, from a confirmed or
completed booking). Labels: `booking.status.*`.

## Notifications

Each person in their own language: the guest in `Booking.locale` (the language they booked in), the
host in their account language. Email through `sendEmail` (Resend, else the dev outbox) with the
phase-1 brand header; text through `sendSms` (Twilio Messaging when `TWILIO_MESSAGING_SERVICE_SID`
or `TWILIO_FROM_NUMBER` is set, else only logged; production logs keep no names or numbers). Demo
accounts never get a real text (`logOnly`), nor a real email when Resend is set up.

| Event | Guest | Host |
|---|---|---|
| Booked | `booking_confirmed_guest` (address, host phone/WhatsApp, times, total, how to pay, policy + free-until date, "never pay in advance") + SMS | `booking_new_host` (guest name/phone, message, pledge reminder) + SMS |
| 3 days before arrival (cron) | `booking_reminder_guest` + SMS | `booking_reminder_host` + SMS |
| Guest cancels | — | `booking_cancelled_by_guest` (reason, late note) + SMS |
| Host cancels | `booking_cancelled_by_host` (reason, nothing was charged, search link, how to report) + SMS | — |
| Day after check-out | `booking_completed` (email only) | — |

Bookings made 3 days or less before arrival get no separate reminder (`reminderSentAt` is set when
booked: the confirmation is the reminder).

## Scheduled jobs (vercel.json, `CRON_SECRET`-protected)

| Route | Schedule (UTC) | What |
|---|---|---|
| `/api/cron/booking-reminders` | daily 06:17 (10:17 in Georgia) | Reminders for check-ins within 3 days; each booking is claimed with `reminderSentAt` before sending (at most once; catches up on missed days). |
| `/api/cron/complete-bookings` | daily 04:47 | `CONFIRMED` → `COMPLETED` the day after check-out, one by one (idempotent). |
| `/api/cron/ical-sync` | hourly at :23 | Imports Airbnb / Booking.com calendars; imported nights block bookings. Overlaps with confirmed Bayit bookings are logged and returned as `conflicts` (bookings are never changed). |

## Calendars (iCal)

- **Export** `GET /api/ical/<icalToken>.ics`: every block; Bayit bookings as `SUMMARY:Reserved`,
  everything else `Not available`. Dates only — no names, notes or addresses.
- **Import**: `icalImportUrls`, hourly; each event becomes an `ICAL` block (`sourceRef` = UID).
- **Guest's "add to calendar"** `GET /api/ical/booking/<code>.ics?lang=he`: signed-in guest of a
  confirmed booking only (it holds the address and the host's phone); all-day event over the stay,
  times, host, phone, amount and link in the description; `private, no-store`.

## API for the pages (what other engineers use)

Server-only (`import` in server components):
- `getBookingQuote(stay, { displayCurrency })` (`service.ts`) → `{ ok, quote, roomType, cancellationPolicy, paymentMethods }` or `{ ok: false, error, minNights?, maxGuests? }`.
- `getUnavailableDates(listingId, { from, to })` → merged `{ start, end }[]` (all sources; fits
  `DateBlock` of the listing-page calendar); `isRangeFree(listingId, checkIn, checkOut)`;
  `getCalendarBlocks(listingId, range)` → blocks with `source` and `bookingCode` (host calendar).
- `getGuestTrips(userId, locale)` → `{ upcoming, past }`; `getGuestTrip(userId, code, locale)` →
  details + `reveal` (null unless confirmed/completed) + `cancellation { policy, freeUntil, lateNow }`
  + `canCancel` + `icsPath`.
- `getHostBookings(hostId, locale, { listingId?, scope })`; `getHostBooking(hostId, code, locale)` →
  guest phone, message, `canCancel`, `canReportNoShow`; `hostHasBookings(hostId)`.

Server actions (`actions.ts`, return `ActionResult`; errors are `booking.errors.<code>`):
`quoteBookingAction`, `createBookingAction` (→ `{ id, code, path }`, path = the trip page),
`cancelBookingAsGuestAction`, `cancelBookingAsHostAction`, `reportNoShowAction`.
Schemas: `schemas.ts` (also `bookingSettingsSchema` for the host's "הזמנות ומחיר" step).
Pure helpers (client-safe): `pricing.ts`, `dates.ts`, `overlap.ts`, `policy.ts`, `code.ts`,
`constants.ts` (vocabularies, limits, paths `TRIPS_PATH = /account/trips`, `tripPath(code)`,
`HOST_BOOKINGS_PATH = /account/host-bookings`, `hostBookingPath(code)`, `bookingIcsPath(code)`).

## Guest pages (brief 5.5 steps 1–5)

- **Dates and guests sheet** (`src/components/booking/dates-guests-sheet.tsx`): the listing's
  sticky bar ("בחירת תאריכים") and the desktop box open it. Calendar with booked nights disabled
  (`AvailabilityPicker`) and the minimum-nights hint, adults / children (2–12) / infants (under 2)
  counters with the maximum enforced, and the live price (`quoteStay` in the browser). The stay
  state lives in `<StayProvider>` (`listing-page/stay-dates.tsx`: now also `guests`, `setGuests`,
  `maxGuests`, `instant`, `quote`); the address keeps `checkIn`, `checkOut`, `adults`, `children`,
  `infants`. Listings that are not `INSTANT` show "שאלה למארח" instead of "הזמנה".
- **Review page** `/listing/<id>/book?checkIn&checkOut&adults&children&infants&room`
  (`components/booking/booking-review.tsx`, terms from `getGuestBookingTerms` in
  `lib/booking/guest-review.ts`): the price shows at once (`quoteGuestStay` in `lib/booking/guest.ts`,
  the same pure rules as the server) and `quoteBookingAction` confirms it and that the nights are
  free (250 ms debounce). Not signed in → the login sheet; no verified phone → `<PhoneCheck>` inline;
  no SMS service on the real site → an explanation and "שאלה למארח". Taken dates → a friendly
  message, `router.refresh()` (fresh calendar) and the dates sheet. Closed states: own listing,
  not instant / not public, demo listing on the real site, Shabbat mode. Client text: the nested
  route key `"listing/[id]/book"` in `src/i18n/client-messages.ts` (`booking`, `auth.verifyPhone`).
- **Confirmation = the trip page** `/account/trips/<code>?booked=1`: code, dates, guests, the exact
  address with Google Maps / Waze, the host's phone and WhatsApp (ready message with the code),
  "הוספה ליומן" (`/api/ical/booking/<code>?lang=`), "מה עכשיו", the amount paid on arrival, the
  policy with the free-cancellation date, and "ביטול ההזמנה" (`components/booking/cancel-trip.tsx`).
- **"הנסיעות שלי"** `/account/trips` (account nav item `trips`): upcoming (soonest first, "in N
  days") and past / cancelled trips (`components/booking/trip-card.tsx`).

## Demo data

`prisma/seed/listings/booking-settings.ts`: every demo short stay and hotel is `INSTANT`, with mixed
policies, payment methods and three weekend prices. `prisma/seed/bookings.ts`: the demo guest Noa
(+995555000021) at Yossi's listings — `BT-DEM2A` upcoming (in 9 days), `BT-DEM3B` completed (20 days
ago), `BT-DEM4C` cancelled by the guest. Fixed ids (`demo-booking-*`), dates move with each seed run.

## Deferred

- **Reviews** (after `COMPLETED`; the thank-you email and the status are the hook).
- **Online payment**, deposits and charging late cancellations or no-shows (no payment code now).
- **Per-room-type inventory** (several rooms of a type, booked separately).
- Rules for no-shows and late cancellations (only recorded now); an admin view of
  `flaggedForReview` bookings (the flag and the audit log are there).
- A database-level exclusion constraint (the transaction + row lock enforce the rule today).
