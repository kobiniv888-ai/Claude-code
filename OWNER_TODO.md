# Things only you can do or decide

This list is kept up to date as the work goes on. It was last updated at the end of redesign
round 2. The round-2 summary, the "Done when" checklist and what to check on your phone are in
`docs/redesign-2/final.md`.

## Content and wording
- [ ] **About page story (phase 5).** The About page (linked as "הסיפור שלנו" from the footer and
      the menu) now opens with your Hebrew and English drafts, word for word, translated into
      Russian, Arabic and Georgian. Please review all five and send your name: the signature shows
      `[השם שלכם]` / `[Your name]` / `[Ваше имя]` / `[اسمكم]` / `[თქვენი სახელი]` until then
      (`messages/<lang>/about.json` → `story.signature`). The rest of the page (what Bayit is, how
      booking works, values) was updated for booking and needs a quick read too.
- [ ] **Help FAQ for bookings (phase 5).** New questions: "how booking works and when do I pay",
      "cancellations and what happens if the host cancels" (under "הזמנות ויצירת קשר") and "calendar
      sync" (under "פרסום מודעה"). Old answers that said we take no bookings, or that you log in
      with Apple or a phone code, were updated. Seeded questions are restored by re-running the
      seed, so make lasting changes in `prisma/seed/faq.ts` (or tell us).
- [ ] Review the Hebrew notes in `docs/redesign/hebrew-notes.md`.
- [ ] Listing page "חשוב לדעת" (phase 3): check the wording of the payment line ("משלמים למארח
      בהגעה. בית לא גובה תשלום."), the three cancellation lines (24 hours / 5 days / 14 days
      before arrival) and the neutral line for listings without a policy ("את תנאי הביטול כדאי
      לסכם עם המארח לפני ההגעה."). They should match the booking Terms once a lawyer has read them.
- [ ] Walking times (the synagogue tag on cards, the nearest synagogue on a listing, the "near a
      synagogue" filter) come only from **real places with a verification date**. With the demo
      places only, no real listing shows one until real synagogues are added and verified (see
      "Real data"). Demo listings never show the tag.
- [ ] **New home page wording in Russian, Arabic and Georgian** (phase 2): the hero title, the line
      under it and the promise line ("here, no one will turn you away for who you are") need a
      native speaker's read.
- [ ] **Shorter labels so nothing is cut off on small phones** (phase 2–3 check). Please have a
      native speaker confirm these:
      - Georgian: "ოტელი" for hotels in the filter sheet's deal row, "ყველა" for "any" in the
        filters, "როდის?" ("when?") in the search pill before dates are chosen, and the search
        field hint "ქალაქი, უბანი ან ID".
      - Russian: "На месяц" in the filter sheet's deal row, "Когда?" in the search pill, and the
        search field hint "Город, район или ID".
      - English: the search field hint is now "City, area or listing ID".

## Real data
- [ ] Real community places (synagogues, Chabad houses, kosher restaurants and shops): name,
      address, coordinates, the date you checked it and your source. Add them in
      **Admin → Content → Places**: the form now has **"תאריך הבדיקה"** (date verified, with a
      "היום" button) and **"מקור"** (source: a call, a visit, the community's site; staff only).
      Only places with a date count for walking times; saving recomputes the listings within 5 km.
      The list can be filtered to "real, not verified". Demo places stay marked "(דמו)", can't be
      verified, and are never used for walking times on real listings. A real place added before
      this change counts only after you give it a date.
- [ ] Your own photos: see `PHOTOS_NEEDED.md`.

## Legal
- [ ] Company name, registration number and address, to replace the visible placeholders such as
      `[שם החברה, מספר הרישום והכתובת]`.
- [ ] A lawyer's review of the Terms of use (booking rules) and the Privacy policy. Both are marked
      as drafts. The Terms now have "Bookings through Bayit" (platform only, the stay agreement is
      between guest and host, no payments, instant booking, the three cancellation presets,
      no-shows) and "The welcome pledge" (what a host may not do, and what we may do if a host
      breaks it), with an extra "draft for a lawyer" box. Visible placeholders the lawyer must
      fill: whether a host may charge for a late cancellation, the no-show rules, and the wording of
      sanctions and the host appeal process (plus the existing company details, governing law and
      liability cap).
- [ ] **Privacy policy and bookings.** It doesn't yet describe what a booking shares: the guest's
      name and verified phone go to the host; the exact address and the host's phone go to the
      guest. Please have the lawyer add this.
- [ ] **Decide later: no-shows and late cancellations.** Guests pay at arrival, so today a "didn't
      arrive" report from a host and a cancellation after the free period are only recorded (and
      host cancellations within 48 hours of a booking are flagged for review). Tell us if you want
      consequences (warnings, limits on booking) and how they should read in the Terms.

## Services and keys
- [ ] **CARTO map key.** Confirm it is registered for commercial use (free up to 1 million tiles a
      month), then add it as the Codespaces secret `NEXT_PUBLIC_MAP_TILE_KEY` (and on Vercel later).
- [ ] **SMS (Twilio) and email (Resend):** see "Login & messages" below.
- [ ] **Translation of listings (Google Cloud Translation).** Every listing's title and description
      is translated into the other four languages automatically when the owner sends it, edits it,
      and when a moderator approves it, but only once this key exists. Without it, each listing
      shows only the language the owner wrote it in. Setup, about 10 minutes:
      1. Go to console.cloud.google.com and create a project (for example "bayit"). Google asks for
         a billing account (a card) even for the free part.
      2. Enable the **Cloud Translation API** (APIs & Services → Library).
      3. Create a key (APIs & Services → Credentials → Create credentials → API key). Then
         **restrict it**: under "API restrictions" choose only "Cloud Translation API".
      4. On github.com → your photo → Settings → Codespaces → Secrets → **New secret**: name
         `GOOGLE_TRANSLATE_API_KEY`, value = the key, repository = this one. Restart the codespace.
         The next `bash .devcontainer/start-prod.sh` copies it in and translates the listings that
         are already waiting (also by hand: `npm run translate:missing`).
      - **Cost (estimate, check cloud.google.com/translate/pricing):** the first 500,000 characters
        a month are free, then about $20 per million characters. One listing (about 1,500
        characters) into 4 languages is about 6,000 characters, so roughly 80 new or edited listings
        a month are free.

## Login & messages
How people log in now (your request after the brief): **Google** (when set up), a **6-digit code by
email** (always), and — only on test servers — a code by phone for the demo accounts. SMS codes are
used only to check a phone number: a guest making a booking, and a host before posting. Each number
is checked **once**: an account that already has it verified never gets another SMS.
Prices below were checked on the providers' public pricing pages on 2 November 2026; they change,
so look again before you pay.

- [ ] **Google sign-in keys (free).**
      1. [Google Cloud Console](https://console.cloud.google.com) → create a project (e.g. "Bayit").
      2. **APIs & Services → OAuth consent screen**: type "External", app name "Bayit", your support
         email, your domain, links to the Privacy policy and Terms. Publish it.
      3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type "Web
         application". Authorized redirect URI: `https://<your domain>/api/auth/callback/google`
         (add `http://localhost:3000/api/auth/callback/google` for testing on a computer).
      4. Put the Client ID and Client secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (on
         Vercel: Settings → Environment Variables). The "Continue with Google" button appears by
         itself. New Google users skip the first-name step: their first name comes from Google.
- [ ] **Resend for email (login codes and all other emails).** Free plan: 3,000 emails a month,
      at most 100 a day, 3 domains. Pro: $20 a month for 50,000 emails (no daily limit; $0.90 per
      extra 1,000). Steps: sign up at [resend.com](https://resend.com) → **Domains → Add domain** →
      add the DNS records it shows at your domain registrar (SPF, DKIM) until it says "Verified" →
      **API Keys → Create** → set `RESEND_API_KEY` and `EMAIL_FROM` (e.g.
      `Bayit <no-reply@your-domain>`). Without it, **email login does not work on the real site**
      (the login form says it isn't available yet) and emails only appear in Admin → Email outbox.
      The 100-a-day free limit is the first one you'd hit: move to Pro when sign-ups grow.
      **Booking emails use the same keys** (nothing extra to set up): the guest's confirmation
      (with the address and the host's phone), "new booking" to the host, a reminder to both 3
      days before arrival, cancellation notices and a thank-you after the stay — about **5 emails
      per booking**, so the free plan's 100 a day covers roughly 15–20 bookings a day next to the
      login codes. Without Resend, guests and hosts get **no booking emails** on the real site
      (they still see everything in "הנסיעות שלי" / "הזמנות לנכסים שלי", and texts go out if Twilio
      Messaging is set up).
- [ ] **An SMS service for booking and host phone checks (Twilio).** Without it, the real site says
      "Phone verification isn't available yet" — so **hosts cannot post** and **guests cannot book
      on the site** (a guest without a verified number sees "booking on the site isn't available
      yet" on the "אישור הזמנה" page, with "שאלה למארח" — WhatsApp — instead). Costs:
      - Twilio Verify: **$0.05 per successful check** plus the SMS itself.
      - SMS to **Israel: $0.2575** per message; to **Georgia: $0.1684** per message (Twilio's price
        list; carrier fees may be added).
      - So one Israeli phone check costs about **$0.31**, a Georgian one about **$0.22**. "Once per
        number" keeps this low: a guest pays it once, not for every booking.
      - Cheaper option: a Twilio **Messaging Service** only (`TWILIO_MESSAGING_SERVICE_SID`), where
        the site makes the code itself — you pay just the SMS price. The same keys also send the
        booking text messages.
      Steps: [twilio.com/try-twilio](https://www.twilio.com/try-twilio) → upgrade the account (a
      trial only texts your own phone) → **Verify → Services → Create** → set `TWILIO_ACCOUNT_SID`,
      `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. In **Messaging → Settings → Geo
      permissions** allow only Israel and Georgia, and turn on **Fraud Guard** (protects against
      SMS-pumping fraud).
- [ ] **Booking text messages (Twilio Messaging).** Booking texts need
      `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM_NUMBER`) — Twilio Verify alone only sends codes,
      so with Verify only the booking texts are just written to the server log (emails still go
      out). The texts, each in the person's own language (wording in `messages/<lang>/emails.json`,
      "sms"):
      - to the guest: "booking confirmed" (with a link to the address and the host's contact), a
        reminder 3 days before arrival, and "the host cancelled";
      - to the host: "new booking" (guest, dates, number of guests), the reminder, and "the guest
        cancelled".
      A normal booking sends about **4 texts**. Hebrew, Russian, Arabic and Georgian texts are
      Unicode (70 characters per SMS part), so each is usually **2–3 parts** — roughly **$0.50–0.80
      per text to Israel** at the prices above, about $2–3 per booking. If that is too much, tell us
      and we will send only the confirmation and the cancellation by text (emails cover the rest).
- [ ] **Scheduled jobs need `CRON_SECRET` and a plan that allows hourly jobs.** Calendar sync now
      runs every hour (Airbnb / Booking.com imports, to avoid double bookings); booking reminders
      and "stay completed" run daily. Set `CRON_SECRET` on Vercel, and check that your Vercel plan
      runs hourly cron jobs (if it only allows daily ones, a free external cron service can call
      `/api/cron/ical-sync` every hour with the same secret).
- [ ] **Apple sign-in (optional).** Needs the Apple Developer Program, **$99 a year**, and a real
      https domain. Google + email cover almost everyone, so this can wait.
- [ ] **Never turn on `AUTH_TEST_MODE` on the real site.** It shows login codes on screen so
      testers can log in without SMS or email. It only works on localhost and Codespaces previews
      (the server ignores it on any other address and writes a loud warning), and
      `bash .devcontainer/start-prod.sh` turns it on for the Codespaces preview only.
- [ ] **Decide later: phone login for real users.** On the real site, phone codes are not a way to
      log in (only to check a number). If real people signed up with only a phone number before
      launch, they can no longer reach those accounts (there is no email on them) — tell us and we
      will add a way back for them.

## Speed (after the site is online)
- [ ] **Check the real speed with PageSpeed Insights** (pagespeed.web.dev) on `/he`, a search and
      a listing once the site is deployed. After the hardening speed pass the local lab test gives
      91 on home, 90 on a listing and on the booking review, and 87 on search; on this machine
      every script counts into the first paint (numbers in `docs/redesign-2/final.md` and
      `docs/integration/performance-seo.md`). A host with HTTP/2 and a CDN (e.g. Vercel) was ~1 s
      faster in our proxy test.
- [ ] **Try the fast version on your phone:** `bash .devcontainer/start-prod.sh` in the Codespace
      (same address as before; photos are prepared in the background for 2–3 minutes).

## Look and feel (decide when you have a minute)
- [ ] **The WhatsApp button stays WhatsApp green.** This is the only green besides "verified" and
      success messages. Say if you want it purple.
- [ ] **Red stays for safety.** The emergency number card (112) and the scam-alert banners stay
      red. Say if you want them neutral.
- [ ] **Arabic share images** show "Bayit" with the English tagline, because the image generator
      can't draw Arabic letters.
- [ ] **Jewish holidays outside the Jewish life page.** The brief keeps kosher and Shabbat details to
      the filters, the folded listing section and the Jewish life page. Two round-1 holiday helpers
      were kept because the brief doesn't mention them: a small "holidays in your dates" box above
      the search results (only when the chosen dates include a holiday), and holiday dots in the
      date pickers. Say if they should go.
- [ ] **Guest booking choices (conservative, change any time).** Children are "ages 2 to 12",
      adults "13+" (labels only; infants under 2 don't count toward the maximum). The booking
      confirmation is the trip's own page in "הנסיעות שלי" (`/account/trips/BT-…`), so the link in
      the confirmation email and the page after booking are the same. Short stays and hotels whose
      host hasn't saved booking settings show "שאלה למארח" instead of "הזמנה". The guest's name
      for the host is prefilled with the account's first name.
      - **Warned and suspended accounts.** A guest with a warning can book. A suspended guest
        can't, and their listings stay hidden, even after the end date staff gave the suspension,
        until staff lift it in the admin ("הפעלה מחדש"). Say if a suspension should end by itself on
        its end date.
- [ ] **Host booking choices (conservative, change any time).**
      - **No weekly/monthly discounts on booked stays.** The booking total is nights × price (+ the
        weekend price and the cleaning fee). A discount the total doesn't apply would be a broken
        promise, so the "הזמנות ומחיר" step has no discount fields and saving it clears old ones
        (demo listings still show theirs until the next seed run). Say if you want discounts back:
        the booking engine would then apply them too.
      - **The host sees the guest's phone and WhatsApp** for confirmed and completed bookings only
        (not after a cancellation).
      - **Imported calendars:** each link's last result (read OK / why it failed) is shown after
        "סנכרון עכשיו", and the page re-checks by itself when the last sync is older than 30 minutes.
        Errors from the hourly sync are not stored (that would need a new database field).
      - **"How to connect" steps for Airbnb and Booking.com** describe their menus in general words;
        please check them against the real sites once.
- [ ] **Jewish life page (phase 5).** It is calmer now: a short title band, a sticky row of jump
      links (Shabbat times, calendar, community map, emergency numbers, guides), no big photo or
      zoom, and on phones the month list shows only days with times or holidays (with "show every
      day") and the holidays list shows four (with "N more"). All the content is still there.
- [ ] **Footer tagline.** It still says the site has "kosher and Shabbat details". Say if you want
      it to talk about the pledge or booking instead.
