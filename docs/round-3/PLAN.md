# Round 3: plan and the founder's decisions

The brief is `docs/round-3/BRIEF.md`. The work is on branch `round-3`, with a commit after each phase.
The founder approved the plan on 3 November 2026 and is travelling without a computer. Keep going
through the phases and send short summaries. Where something is still open, choose the
conservative option, write it down here and in the phase summary, and ask.

## Phases (brief section 13, with the founder's changes)

| # | Phase |
|---|---|
| 1 | Section 1 (earlier requests) and section 2 (bugs, incl. logout and the calendar). Also: the codespace starts the fast version by itself; the slow version shows a "development version" strip; demo accounts can't open the real admin panel; verification decision (b). |
| 2 | Section 3 (design and wording) and section 4 (lighter home page). |
| 3 | Section 9 (admin panel), 8.2 (turned-away reports), 8.3 (visited badge). |
| 4 | Section 6 (mistake check, host stats, holiday prices, discounts), section 5 (price guide) **and hotel booking by room type** (see below). |
| 5 | Section 7 (trip page, shared lists, sea/ski distance, price alerts) and 8.1 (reviews). |
| 6 | Section 10 (city pages, Google basics), the full test run, Lighthouse in production. |

After each phase: run the site in production mode; Playwright screenshots at 390×844 Hebrew (light
and dark) and 1440×900 English, looked at and fixed; the section-13 tests for that phase; commit,
push, and a short summary with what to check on the phone.

## Founder's answers (binding)

1. **Admin.** The founder's own account becomes the only real admin. Which account (email or
   phone) is still to be confirmed by the founder. Google Authenticator (2-step login) is
   **required** for the admin account, also in the codespace: the development shortcut that skips
   2-step login may apply only to demo accounts, never to the founder's account.
2. **Translation: Microsoft Azure AI Translator.** Keep the provider behind one small interface
   (`src/lib/translate.ts`) so switching to Claude later is a configuration change plus one adapter,
   in case Hebrew–Georgian reads badly. Google stays as a second adapter.
3. **Hotels.** Contact-only until phase 4 (so one booking can never block the whole hotel). In
   phase 4, build **booking by room type**, then switch hotels back to instant booking:
   - A hotel has room types ("Double room, sea view"). Each has its own name, photos, beds, max
     guests, size, amenities, price per night (plus weekend and holiday prices) and the number of
     identical rooms of that type.
   - A room type is available on a night when its booked + blocked rooms are fewer than its number
     of rooms. One booking never blocks the whole hotel.
   - The guest picks dates, sees the free room types with prices, picks a room type and how many
     rooms (a family can book 2 rooms in one booking), and books instantly. Payment on arrival, the
     same rules as short stays.
   - The hotel calendar works per room type: block rooms, see bookings, sync with other sites where
     possible (tell the founder what iCal can and can't do for hotels).
   - The price guide, the mistake check and host stats work per room type too.
   - **Propose the database changes for room types to the founder before building them.**
4. **How hosts get booking alerts** (replaces "only email"):
   - Each host chooses how Bayit alerts them about new bookings and cancellations: **email**,
     **Telegram** (a free Bayit bot the host connects once) and **app/browser notifications**
     (free; on iPhone only after adding the site to the home screen). More than one can be on.
   - SMS and WhatsApp alerts: planned as paid options for later (WhatsApp needs a Business account
     and approved templates). No Viber alerts (Viber bots cost €100 a month).
   - A booking goes through if **at least one** of the host's alert channels accepted the message
     ("Resend accepted it" counts for email). If none did: refuse the booking and offer
     "שאלה למארח".
   - If a message later bounces or fails: alert the founder and the guest right away. A bounced
     email pauses new bookings for that host until their email works (with several channels: see
     "Open questions").
   - Only the automatic alerts change. Guests still contact hosts every way the host chose in the
     contact step (WhatsApp, phone, Telegram, Viber, Messenger, SMS, email).
5. **Verification: option (b).** No ID documents for now. Delete any ID or selfie photos already
   stored (after the backup), and hide the ID and owner badges until a paid service is added later.
   Trust comes from the verified phone and the "ביקרנו במקום" badge.
6. **Reviews:** show the guest's first name and the month ("דנה · אוקטובר 2026"); reviews and host
   replies are final once posted.
7. **Lists:** one list per place; choosing another list moves it.
8. **Data clean-ups** (phones to international format, emojis out of titles, contact taps stop
   storing who tapped, ID/selfie files deleted): only after the founder sees a dry run with counts,
   and only after a **full database backup**. The founder is on a phone, so the dry run, the backup
   and the run must be doable from the admin panel, not only from a terminal.
9. **Hosting and domain:** the founder buys the domain now and chooses hosting at launch (option A,
   Vercel Pro + Neon + Cloudflare R2, is the default). OWNER_TODO lists the domain, hosting, Resend
   and Google login keys first (without Resend or Google nobody can log in on the real site), plus
   the Azure key.
10. **The other defaults are approved:**
    - the weekly host email goes out Sunday 09:00 Israel time; the founder's daily summary arrives
      at 08:00 and not on Shabbat
    - the price guide needs at least 3 different owners per group and never counts the host's own
      listings
    - the trip page offers "save for offline" (not automatic)
    - turned-away reports never reveal the reporter unless the founder decides to
    - sea distances cover Batumi (with Gonio and Makhinjauri) and Kobuleti
    - city-page texts live in the message files, marked for review
    - the new footer line goes live and is listed in OWNER_TODO for confirmation

## Approved database changes (section 12, adapted)

Additive only; applied with `prisma/sql/before-push.sql` + `prisma db push`.

- New tables: `DatePrice`, `Review`, `SavedList`, `SavedSearch`, `RecentlyViewed`, `ReferencePrice`.
- Listing: `seaWalkMinutes`, `liftWalkMinutes`, `visitedAt`, `visitedNote`, `visitedById`,
  `checkInFlexible`, `checkOutFlexible`, `reviewCount`, `ratingSum`.
- ListingPhoto: `room` (enum `PhotoRoom`).
- Report: `kind` (GENERAL / TURNED_AWAY), new reasons, `bookingId`, `happenedOn`, `attachments`,
  `attachmentsDeletedAt`, `priority`, `adminNote`, `actionTaken`, `reporterRevealedAt`; target
  `REVIEW` + `reviewId` (covers the brief's ReviewReport).
- Booking: `priceLines`, `discount`, `hostNotifiedAt`, `flagReviewedAt`, `flagReviewedById`.
- User: `hostFlagReviewedAt`. JewishPlace: `countryCode`. Favorite: `listId`, `alertPrice`.
- Already covered by existing tables: `ListingStatDaily` (stats), `AuditLog` (= AdminAction),
  `ListingTranslation` + `Listing.originalLocale`, `weeklyDiscountPct` / `monthlyDiscountPct`.

**Not yet approved (proposed to the founder, wait for the OK):** the room-type booking changes and
the alert-channel changes (Telegram link, browser push subscriptions, channel health).

## Open questions (asked, waiting)

- Which account is the admin (email or phone)?
- OK for the room-type and alert-channel database changes, and for the `web-push` library (browser
  notifications need encrypted, signed messages)?
- With several alert channels: when a host's email bounces, pause only the email channel (bookings
  continue while Telegram or browser notifications work), or pause all new bookings until the email
  works? Working assumption: pause only that channel; a host with no working channel left goes to
  "שאלה למארח" automatically until one works again.
