# Redesign round 2: plan and decisions

The brief is `docs/redesign-2/BRIEF.md`. The work is on branch `redesign-2`, with a commit after
each phase.

The founder asked for the work to go ahead without waiting for answers. Every decision the brief
would have asked about is recorded here, in **Decisions**. Each one can be changed later.

## Phases

| # | Phase | Main pages and components |
|---|---|---|
| 1 | Brand and design system | `globals.css` tokens: purple/white in light, purple/black in dark. Rubik plus Noto Sans Georgian. `<Logo>` (ב mark). Favicon, app icons, manifest, theme colors, share images. Button, Chip, Tag, Card, Sheet, Skeleton, EmptyState, Header, BottomNav, StickyBar, Accordion and Calendar. `/dev/ui`. Old logo and old colors removed. |
| 2 | Jewish content as an extra; home; listing card; results, filters and map | `src/components/home/**`, `listing/listing-card.tsx`, `search/**`, `maps/**`. Shabbat chips, the countdown, the big tile and the welcome badge come off the cards. |
| 3 | Quiet listing page | `src/components/listing-page/**` and the contact bar |
| 4 | Booking | Schema, then the booking service, the host's booking step, the calendar and iCal, the guest flow, confirmation and notifications, "הנסיעות שלי" and the host's bookings list |
| 5 | Other pages | The post-form split, account (first name, tabs), the About story, the Help FAQ and Terms, the Jewish life hub restyle, and the admin form for real community places |
| 6 | Finish | The bugs in section 8, the speed work in section 9, and a final check against "Done when" |

After each phase: screenshots at 390×844 in Hebrew (light and dark) and 1440×900 in English, then
fixes, a commit, and a short summary.

## Booking data model

This adapts brief section 7 to the existing schema. Existing fields are reused wherever they
already mean the same thing.

**Listing.** Existing fields already cover:
- `price` with `pricePeriod = NIGHT` = price per night
- `cleaningFee`, `currency`
- `minStayNights` = minimum nights
- `maxGuests`, `checkInFrom`, `checkOutUntil`
- `icalImportUrls`, and `icalToken` = the private export link

New fields:
- `bookingMode`: `INSTANT` | `CONTACT`. Short stays and hotel rooms use `INSTANT` once the host has
  saved the booking settings. Monthly rentals and sales are always `CONTACT`.
- `weekendPrice` (optional): used for Friday and Saturday nights.
- `cancellationPolicy`: `FLEXIBLE` (24 hours) | `MODERATE` (5 days) | `STRICT` (14 days). The
  default is `MODERATE`.
- `paymentMethodsAtCheckIn String[]`: cash, card or bank transfer at arrival. The host's own
  currency applies.

**AvailabilityBlock.**
- `source` gains `BOOKING`. It now has `OWNER` (the host), `ICAL` and `BOOKING`.
- `sourceRef`: the iCal UID, or the booking id.
- `bookingId`: unique and optional. Cancelling a booking deletes its block.

**Booking (new).**
- Identity: `id`, a short `code` like `BT-7K3Q9`, `listingId`, `guestUserId`, `hostUserId`.
- Stay: `checkIn` and `checkOut` as dates in Asia/Tbilisi, `nights`, `adults`, `children`,
  `infants`.
- Money, copied when the booking is made: `nightlyPrice`, `weekendPrice`, `subtotal`,
  `cleaningFee`, `total`, `currency`.
- Display estimate: `displayCurrency` and `displayTotal`.
- Terms, also copied at booking time: `cancellationPolicy` and `paymentMethods`.
- Status: `CONFIRMED` | `CANCELLED_BY_GUEST` | `CANCELLED_BY_HOST` | `COMPLETED` | `NO_SHOW`.
- Cancellation: `cancelReasonCode` (`DOUBLE_BOOKING` | `PROPERTY_ISSUE` | `OTHER` | a guest
  reason), `cancelReason` (free text), `cancelledAt`, `cancelledById`, and `flaggedForReview`. That
  flag is set for host cancellations within 48 hours of the booking.
- Arrival and messages: `noShowReportedAt`, `messageToHost`.
- Guest snapshot: `guestName`, `guestPhone`, `locale`.
- Housekeeping: `rulesAcceptedAt`, `reminderSentAt`, `createdAt`, `updatedAt`.

**Rules**
- **No overlaps.** Each booking runs in one transaction that locks the listing row
  (`SELECT … FOR UPDATE`). It checks for any overlapping block (host, iCal or booking), then
  creates the booking and its block together. Two guests can therefore never get the same night.
- **Dates and nights.** Dates are calendar days in `Asia/Tbilisi`. Nights = checkOut − checkIn.
- **Hotels with several room types.** For now each hotel listing is booked as one unit. Room types
  still show with their prices, and the room-type choice is saved on the booking for the host.
  Booking per room type, with a count of rooms, can come later.
- **The pledge.** The round-1 pledge fields stay unchanged.

## Decisions

These are the questions the brief asked, answered so the work could go on:
1. **Schema changes.** Only those listed above, plus `verifiedAt`, `verifiedById` and `source` on
   `JewishPlace` (5.9), plus `firstName` on `User` (5.8).
2. **No new libraries.**
   - Share images use Next.js's built-in `next/og`.
   - `favicon.ico` is written by a small script that uses `sharp`, which is already installed.
   - Fonts come from `next/font/google`.
3. **No paid services.**
   - Booking emails go through the existing email module: Resend when it is configured,
     otherwise the dev outbox.
   - SMS goes through a new `sendSms`. It uses Twilio Messaging when keys exist and otherwise only
     logs. That's listed in `OWNER_TODO.md`.
4. **Address search** (8.9) runs on "חיפוש"/Enter only, through our own server route. That route
   caches results, sends a clear User-Agent, holds the whole site to 1 request per second, and
   keeps the OSM credit. No paid geocoder.
5. **Default currency.** he/ru/ar → ILS, en → USD, ka → GEL. A visitor's own choice always wins.

## Login (founder request after the brief)

1. **Ways to log in, in this order:** Google (when `GOOGLE_*` is set), a 6-digit code by email
   (Better Auth `emailOTP`, sent with `sendEmail` as the 5-language `login_code` email; always
   offered), and a code by phone only where codes may be shown on screen. New accounts are created
   by the email code (or Google).
2. **Codes on screen** only in development (`NODE_ENV !== "production"`) or with
   `AUTH_TEST_MODE=true` when the request's Host / X-Forwarded-Host **and** the configured site
   address are localhost, 127.0.0.1, ::1 or `*.app.github.dev`
   (`src/lib/auth/code-display.ts`, unit-tested). A small "Development / Test mode" strip shows on
   the login UI; the server logs a loud warning. `start-prod.sh` turns test mode on for the
   Codespaces preview. Codes sent by a real SMS/email service are never kept or shown.
3. **SMS only to check a number**: a guest's booking and a host before posting, through
   `<PhoneCheck>` + `sendPhoneCheckCode` / `confirmPhoneCheckCode`
   (`src/lib/auth/phone-check-actions.ts`). **Once per number**: a number the account already has
   verified is accepted without sending anything (`src/lib/auth/phone-once.ts`, unit-tested); a
   number another account has is refused before any SMS. Phone LOGIN over HTTP is refused outside
   development/test mode. Without an SMS service, the real site says "not available yet".
   *Conservative choice:* phone login is off on the real site even when Twilio is set up (the
   founder asked not to offer it); demo phone logins keep working in dev/test mode, and demo
   numbers always get on-screen codes there (their numbers are fake), even with Twilio set up.
4. **SMS provider:** Twilio Verify when set up; otherwise Twilio Messaging (`sendSms`,
   `src/lib/sms.ts`) with a Better Auth code; otherwise nothing.
5. **First name** (`User.firstName`): asked once right after the first sign-up (in the login sheet
   or on `/login`, required, one field) and in Settings → Profile. Google sign-ups take Google's
   given name and skip the step. `requireUser()` sends an account without one to `/login`, which
   asks and continues to `next`. Demo accounts are never asked. Phone sign-ups no longer get their
   number as a name; saving a first name also replaces an empty/phone/email full name. The
   greeting is "שלום, <first name>" or "שלום!"; a phone number or email is never shown as a name
   (header menu, account, host cards).
6. **Security details:** email codes are stored hashed, limited per address and per IP (Postgres)
   and behind Turnstile like phone codes; the outbox and production logs mask the code; the email
   endpoints other than sign-in are disabled; `name`/`image` in the sign-in request are refused.
