# Things only you can do or decide

This list is kept up to date as the work goes on. It was last updated during redesign round 2.

## Content and wording
- [ ] Review the About page story in Hebrew and English (and the other translations), then replace
      `[השם שלכם]` / `[Your name]` with your name.
- [ ] Review the Hebrew notes in `docs/redesign/hebrew-notes.md`.
- [ ] Listing page "חשוב לדעת" (phase 3): check the wording of the payment line ("משלמים למארח
      בהגעה. בית לא גובה תשלום."), the three cancellation lines (24 hours / 5 days / 14 days
      before arrival) and the neutral line for listings without a policy ("את תנאי הביטול כדאי
      לסכם עם המארח לפני ההגעה."). They should match the booking Terms once a lawyer has read them.
- [ ] The nearest synagogue on a listing appears only for real (non-demo) places. With the demo
      places only, no listing shows one until real synagogues are added (see "Real data").
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
      **Admin → Content → Places**. Demo places stay marked "(דמו)", and they are never used for
      walking times on real listings.
- [ ] Your own photos: see `PHOTOS_NEEDED.md`.

## Legal
- [ ] Company name, registration number and address, to replace the visible placeholders such as
      `[שם החברה, מספר הרישום והכתובת]`.
- [ ] A lawyer's review of the Terms of use (booking rules) and the Privacy policy. Both are marked
      as drafts.

## Services and keys
- [ ] **CARTO map key.** Confirm it is registered for commercial use (free up to 1 million tiles a
      month), then add it as the Codespaces secret `NEXT_PUBLIC_MAP_TILE_KEY` (and on Vercel later).
- [ ] **SMS (Twilio) and email (Resend):** see "Login & messages" below.

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
- [ ] **An SMS service for booking and host phone checks (Twilio).** Without it, the real site says
      "Phone verification isn't available yet" — so **hosts cannot post** and the booking phone
      check (next phase) cannot run until it is set up. Costs:
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
- [ ] **Footer tagline.** It still says the site has "kosher and Shabbat details". Say if you want
      it to talk about the pledge or booking instead.
