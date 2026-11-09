# Things only you can do or decide

This list is kept up to date as the work goes on. It was last updated at the end of round 3
(phase 6, the final check, 7 November 2026). Round 3's summary, its "Done when" list and your next
steps are in `docs/round-3/final.md`; the plan and your answers are in `docs/round-3/PLAN.md`.

The first part is the list from the brief (round 3, section 11), in the same order and with the
same numbers. Start with 1: the calendar links, the Google pages and the share links all depend
on it. Right after the domain and the hosting come the keys in "Keys the real site needs": without
Resend (email) or Google login, nobody can log in on the real site.

## The ten things only you can do (brief, section 11)

1. [ ] **Domain and hosting (first).**
   - **Buy the domain** (you are doing this now) and tell us the name. Calendar links, Google
     pages, share links and emails are all built from it (`SITE_URL`, see below).
   - **Choose hosting.** The default is **A**. All three allow a business site (Vercel's free
     Hobby plan does not, so A means the paid Pro plan). The prices were checked on the
     providers' price pages on 3 November 2026, without VAT and without per-use costs (SMS,
     translation, extra traffic). Prices change: **check the current price before you pay.**
     - **A. Vercel Pro + Neon (database) + Cloudflare R2 (photos):** about **$25–45 a month**.
       The least work: the site is already set up for it, and Pro runs the hourly jobs.
     - **B. Railway Pro:** about **$20–30 a month**, one bill and one always-on server. Some
       setup work (scheduled jobs, database backups).
     - **C. A Hetzner server with Coolify:** about **€11–12 a month**, the cheapest, but you (or
       someone you pay) look after the server: updates, backups and security.
   - On A, the "גיבוי מלא" button in Admin → תחזוקה can't keep its files (there is no lasting
     disk), so Neon's own backups do that job there. Run the data clean-ups ("Before the data
     moves", below) in the codespace before the data moves.
   - Then set the keys in "Keys the real site needs" below, in that order.
2. [ ] **Fix your listing 44.** We don't change your listing. In "עריכה" → the last step
   ("בדיקה לפני פרסום") these problems are listed, each with a "לתיקון" button:
   - the check-in and check-out times (the description says check-in at 13:00 and check-out at
     10:00; the settings say the opposite)
   - max guests (1, with a double bed and a sofa bed)
   - bathrooms (0)
   - move the late-checkout fine into the house rules, in lari (the description says "200 שקל")
   - add photos of the kitchen, the balcony and the building entrance, only your own photos, and
     label them under each photo ("מטבח", "מרפסת", "הבניין")
3. [ ] **Listing 43:** write a Hebrew title and description, without emojis.
4. [ ] **Your admin account and the alert address.** These are private: never put them in a
   message, a file or a commit. On github.com → your picture → **Settings → Codespaces →
   Secrets → New secret**, add:
   - `BAYIT_ADMIN_EMAIL`: the email you log in with (or `BAYIT_ADMIN_PHONE`: your phone, +972…)
   - `ADMIN_ALERT_EMAIL`: where admin alerts and the daily summary go (a different address)

   Log in on the site once with that account, then restart the codespace: the account becomes
   the admin. Open `/admin` and set up **Google Authenticator** (scan the QR code, keep the backup
   codes). It is required for your account, also in the codespace. On the hosting, add the same
   names to its settings.
5. [ ] **Translation: Azure is your choice; add its key.** portal.azure.com → Create a resource →
   **Translator** → pricing tier **F0** (free, 2 million characters a month) → **Keys and
   Endpoint**: copy KEY 1 and the Location (region). Set `AZURE_TRANSLATOR_KEY` and
   `AZURE_TRANSLATOR_REGION` (Codespaces secrets and the hosting's settings). Above the free tier
   it costs about $10 per million characters (check the current price on Azure's price page).
   Without the key, each listing and review shows only the language it was written in, with a
   "תרגום" link to Google Translate. Google Cloud Translation stays as a second option
   (`GOOGLE_TRANSLATE_API_KEY` with `TRANSLATE_PROVIDER="google"`; the first 500,000 characters
   a month are free, then about $20 per million).
6. [x] **Verification: decided (b).** No ID or ownership documents for now. The ID and owner
   badges are hidden; trust comes from the verified phone and the "ביקרנו במקום" badge.
   - [ ] **Later:** when you want ID checks, choose a paid service (Veriff, Persona or Sumsub,
     roughly $1–2 a check; check the current price) and tell us. The badges come back without a
     database change.
7. [ ] **Footer line:** "נבנה על ידי משפחה ישראלית" is live (in all five languages). Approve it or
   send another line.
8. [ ] **City pages: review their texts.** 2–3 short paragraphs for each of the 10 cities, in 5
   languages, in `messages/<lang>/cityPages.json` → `cities.<city>.about.p1`–`p3`. They were
   written only from facts that can be checked (no numbers, prices, distances or "best" claims)
   and each city is marked `"_review": "draft — founder to review"`. Please also read the page
   titles, descriptions and leads and the "how booking works" steps in the same file. Tell us
   what to change; we remove the `_review` markers once you approve. You can see them at
   `/he/batumi` and `/he/batumi/short-stays` (and the same for every city and type).
   - Decided for now (say if you want it otherwise): a page with 1–2 real listings shows them,
     with a "פרסמו את שלכם" band under them; "עדיין אין כאן מקומות" appears only on a page with no
     places at all. Every page below 3 real listings is hidden from Google (`docs/round-3/PLAN.md`,
     "Open questions").
9. [ ] **Reference prices (optional).** For the hosts' price guide: **Admin → מחירי ייחוס →
   הוספת טווח**, only ranges copied from a public report (for example a real-estate agency's
   monthly report), with its name, link and month. Never single listings. They show separately,
   as "לפי [מקור], [חודש שנה]".
10. [ ] **Google Search Console, after the domain is live (free).** First make sure `SITE_URL` is
    the domain (see below), or Google indexes nothing. Then at
    [search.google.com/search-console](https://search.google.com/search-console) → **Add
    property** → **Domain** → add the TXT record it shows at your domain registrar → **Verify**.
    Then **Sitemaps** → enter `sitemap.xml` → **Submit**. The sitemap lists the city pages with at
    least 3 real listings and every real published listing (never demo ones). Look at **Pages** a
    week later to see what was indexed.

## Keys the real site needs
Set these on the hosting (and the same names as Codespaces secrets where it says so), in this
order. The detailed steps and prices are in "Login & messages" below.

- [ ] **`SITE_URL`** = `https://<your domain>`, in the hosting's settings (not needed in the
      codespace). Use the address people actually open (`https://bayit.ge` or
      `https://www.bayit.ge`, and redirect the other one to it). Until it is set:
      - **Google indexes nothing**: only the exact address in `SITE_URL` counts as the real site,
        and every other address says "noindex";
      - hosts can't copy their calendar link, and guests can't copy or send on WhatsApp the link
        of a shared list;
      - the server prints a warning at start.
- [ ] **Resend (email).** Sign up, add the domain and its DNS records until it says "Verified",
      create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM`. Then **Resend → Webhooks →
      Add endpoint** `https://<your domain>/api/webhooks/resend` with the events
      `email.bounced`, `email.complained` and `email.delivered`, and set its signing secret as
      `RESEND_WEBHOOK_SECRET` (a bounced booking email then alerts you and the guest).
- [ ] **Google login keys** (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; free). Until Resend or
      Google is set, the real site's admin panel shows a red warning.
- [ ] **`CRON_SECRET` and a plan that runs hourly jobs** (any long random text). The calendar sync
      runs every hour; reminders, "stay completed" with the review request, your daily summary,
      the hosts' weekly email and the saved-search and price-drop emails run every morning. Details
      below.
- [ ] **`FIELD_ENCRYPTION_KEY`** (SECURITY_REPORT 12.3.c): the key that encrypts the exact
      addresses, pins and guests' phones in the database. Make one for the real site and a
      **different** one for staging, each with `openssl rand -base64 32`, and set it in the
      hosting's settings (never copy the codespace's; the server refuses a codespace key, a reused
      secret, or no key). **Save both in your password manager with the date**: without the key
      nobody, not even you, can read those addresses and phones again, and keep every old key as
      long as a backup made with it exists. After the tables are created on the real database,
      run `npm run db:encrypt-fields` once (it adds the database rule that refuses unencrypted
      values). Changing the key later: `docs/security/field-encryption.md` → "Key rotation".
- [ ] **Telegram bot for booking alerts (free).** In Telegram, open **@BotFather** → `/newbot` →
      a name ("Bayit") and a username that ends in "bot". It gives you a token. Add three
      Codespaces secrets (and the same names on the hosting): `TELEGRAM_BOT_TOKEN` (the token),
      `TELEGRAM_BOT_USERNAME` (the username, without @) and `TELEGRAM_WEBHOOK_SECRET` (any long
      random text). Then, once the site is on its domain, open this address once in the phone's
      browser (with your token, domain and secret in place of the words in capitals):
      `https://api.telegram.org/botTOKEN/setWebhook?url=https://DOMAIN/api/webhooks/telegram&secret_token=SECRET`.
      It should answer `"ok":true`. Until the token is set, Telegram shows "בקרוב" in the hosts'
      alert settings and alerts go by email.
      **Browser notifications** need no account: make a NEW free key pair for the real site
      (`npx web-push generate-vapid-keys`) and put `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in the
      hosting's settings. Never copy the codespace's pair (development and production keep
      separate keys, SECURITY_REPORT 12.2.b); nobody has subscribed yet, so nothing breaks. After
      launch, keep the real site's pair for good (phones that turned notifications on would stop
      getting them).
- [ ] **CARTO map key.** Confirm it is registered for commercial use (free up to 1 million tiles a
      month; check the current terms), then add it as the Codespaces secret
      `NEXT_PUBLIC_MAP_TILE_KEY` (and on the hosting).
- [ ] **SMS (Twilio)** for the phone checks: without it, hosts cannot post and guests cannot book
      on the real site (details below).
- [ ] The **Azure translator key** is item 5 above.

## Before the data moves: data clean-ups (in the codespace, from your phone)
- [ ] Admin → **תחזוקה**: tap "גיבוי מלא עכשיו", then "בדיקה (בלי שינוי)" on each clean-up to see
      the counts, then "הרצה". The four clean-ups: phone numbers to international format, emojis
      out of titles, contact taps stop storing who tapped, and the stored ID and selfie photos
      deleted. A run needs a backup from the last hour, and each one can safely be run again.

## Content and wording
- [ ] **How it works page (round 3, phase 6).** Its guest steps, owner steps and questions now
      match the About page and the Help FAQ: short stays and hotels are booked on the site and
      paid to the host on arrival; monthly rentals and sales go straight to the owner; login is
      Google or an email code. Please read it in Hebrew (`messages/he/howItWorks.json`; the other
      four languages follow it).
- [ ] **About page story (phase 5).** The About page (linked as "הסיפור שלנו" from the footer and
      the menu) opens with your Hebrew and English drafts, word for word, translated into
      Russian, Arabic and Georgian. Please review all five and send your name: the signature shows
      `[השם שלכם]` / `[Your name]` / `[Ваше имя]` / `[اسمكم]` / `[თქვენი სახელი]` until then
      (`messages/<lang>/about.json` → `story.signature`). The rest of the page (what Bayit is, how
      booking works, values) needs a quick read too.
- [ ] **Help FAQ for bookings (phase 5).** New questions: "how booking works and when do I pay",
      "cancellations and what happens if the host cancels" (under "הזמנות ויצירת קשר") and "calendar
      sync" (under "פרסום מודעה"). Seeded questions are restored by re-running the seed, so make
      lasting changes in `prisma/seed/faq.ts` (or tell us).
- [ ] Review the Hebrew notes in `docs/redesign/hebrew-notes.md`.
- [ ] Listing page "חשוב לדעת" (phase 3): check the wording of the payment line ("משלמים למארח
      בהגעה. בית לא גובה תשלום."), the three cancellation lines (24 hours / 5 days / 14 days
      before arrival) and the neutral line for listings without a policy ("את תנאי הביטול כדאי
      לסכם עם המארח לפני ההגעה."). They should match the booking Terms once a lawyer has read them.
- [ ] Walking times (the synagogue tag on cards, the nearest synagogue on a listing, the "near a
      synagogue" filter) come only from **real places with a verification date**. With the demo
      places only, no real listing shows one until real synagogues are added and verified (see
      "Real data"). Demo listings never show the tag.
- [ ] **Translations to check with a native speaker (Russian, Arabic and Georgian).** These are
      our translations; a native speaker's read is welcome:
      - the home page (phase 2): the hero title, the line under it and the promise line ("here, no
        one will turn you away for who you are");
      - the "Turned away?" texts (phase 3): the report form ("דיווח על המארח"), the guest's
        confirmation, the emails to hosts after a decision and the "ביקרנו במקום" line;
      - phase 4: the mistake check, the price guide, the stats page, the weekly email, the
        holiday prices and discounts and the hotel room types. In Russian and Georgian the button
        at the bottom of the dates sheet says just "Продолжить" / "გაგრძელება" ("continue");
      - phase 5: the trip page, saved lists and sharing, the walk to the sea and the lifts, saved
        searches and price alerts, reviews and their emails;
      - phase 6: the city pages (item 8 above) and the footer's "ערים בגאורגיה" row. In Georgian
        the hotels type, "სასტუმროები და საოჯახო სასტუმროები", is too long for its chip at the top
        of a city page on a small phone (it ends in "…"): a shorter Georgian name would fix it;
      - the footer tagline.
- [ ] **Shorter labels so nothing is cut off on small phones** (phase 2–3). Please have a native
      speaker confirm these:
      - Georgian: "ოტელი" for hotels in the filter sheet's deal row, "ყველა" for "any" in the
        filters, "როდის?" ("when?") in the search pill before dates are chosen, and the search
        field hint "ქალაქი, უბანი ან ID".
      - Russian: "На месяц" in the filter sheet's deal row, "Когда?" in the search pill, and the
        search field hint "Город, район или ID".
      - English: the search field hint is "City, area or listing ID".
- [ ] **The Hebrew review-request email** reads "איך הייתה השהייה? <the place>" (no "ב-" before the
      place's name); say if you prefer other wording.

## Real data
- [ ] Real community places (synagogues, Chabad houses, kosher restaurants and shops): name,
      address, coordinates, the date you checked it and your source. Add them in
      **Admin → Content → Places**: the form has **"תאריך הבדיקה"** (date verified, with a
      "היום" button) and **"מקור"** (source: a call, a visit, the community's site; staff only).
      Only places with a date count for walking times; saving recomputes the listings within 5 km.
      The list can be filtered to "real, not verified". Demo places stay marked "(דמו)", can't be
      verified, and are never used for walking times on real listings.
- [ ] Your own photos: see `PHOTOS_NEEDED.md`.
- [ ] **"ביקרנו במקום".** When someone from Bayit visits a place, add it in **Admin → ביקרנו
      במקום**: the listing number, the visit date and a note saying who visited (the note stays in
      the admin panel). Only real listings can get it, never demo ones.
- [ ] **Hotels and guesthouses.** Hotels are booked by room type. For each real hotel: in "עריכה"
      → "סוגי חדרים" add every room type with its price per night, beds, maximum guests and **"כמה
      חדרים כאלה להציע בבית"** (offering a room or two fewer than you have lowers the
      double-booking risk with other sites). A hotel without an active room type with a price
      stays "שאלה למארח". If the hotel is also on Booking.com or Airbnb, connect each room type's
      calendar separately in its "יומן" (iCal can't share room counts: see
      `docs/round-3/phase-4.md`). A channel manager can come later for bigger hotels.
- [ ] **The hosts' weekly email.** Once Resend is connected and the site is online, look at the
      first Sunday's email (it also stays in Admin → "תיבת דואר יוצא"). Tell us if the day, the
      hour or the wording should change.

## Legal
- [ ] Company name, registration number and address, to replace the visible placeholders such as
      `[שם החברה, מספר הרישום והכתובת]`.
- [ ] A lawyer's review of the Terms of use (booking rules) and the Privacy policy. Both are marked
      as drafts. The Terms have "Bookings through Bayit" (platform only, the stay agreement is
      between guest and host, no payments, instant booking, the three cancellation presets,
      no-shows) and "The welcome pledge" (what a host may not do, and what we may do if a host
      breaks it), with an extra "draft for a lawyer" box. Visible placeholders the lawyer must
      fill: whether a host may charge for a late cancellation, the no-show rules, and the wording of
      sanctions and the host appeal process (plus the company details, governing law and
      liability cap).
- [ ] **Privacy policy and bookings.** It doesn't yet describe what a booking shares: the guest's
      name and verified phone go to the host; the exact address and the host's phone go to the
      guest. Please have the lawyer add this.
- [ ] **Decide later: no-shows and late cancellations.** Guests pay at arrival, so today a "didn't
      arrive" report from a host and a cancellation after the free period are only recorded (and
      host cancellations within 48 hours of a booking are flagged for review). Tell us if you want
      consequences (warnings, limits on booking) and how they should read in the Terms.

## Security round S1 (8 November 2026): what only you can do

- [ ] **`SITE_ENV` on every hosting.** Set `SITE_ENV=production` on the real site and
      `SITE_ENV=staging` on the password-protected staging site. Without it (or with a typo) the
      server refuses to start, on purpose. Never set `AUTH_TEST_MODE` on the real site: with
      `SITE_ENV=production` the server refuses to start if it is on.
- [ ] **Twilio Messaging.** Codes now go out as our own text through a Twilio **Messaging
      Service** (Twilio Verify and its "Fraud Guard" are not used). The steps, the geo permissions
      and the SMS Pumping Protection choice are in one place: "An SMS service for booking and host
      phone checks" below.
- [ ] **Two Google OAuth clients.** One for the real site with only the real domain's redirect
      address, and one for development (localhost, the codespace, staging). Never add a test
      address to the production client.
- [ ] **Recovery codes for your own 2-step login.** "Backup codes" are now **recovery codes**:
      Settings → Security → "New codes", then keep the 10 codes away from your phone. Accounts
      that turned on 2-step login before this round have none yet.
- [ ] **`ADMIN_ALERT_EMAIL`** must be set on the hosting, so the security alerts (staff logins on
      a new device, a locked 2-step login, a recovery code used, the SMS budget) reach you.
- [x] ~~Confirm three choices~~ — answered 8 November 2026 (afternoon): walking times show
      "up to N" for every value, phone numbers are ADMIN-only (support and moderators see the last
      2 digits), retention confirmed. See SECURITY_REPORT.md → "Your decisions" → addendum.
- [ ] **Second backup on Backblaze B2 (your answer (a)).** About $0/month for the database alone,
      about $0.35/month with 50 GB of photos. Steps:
      1. Create a **new Backblaze account** just for backups (not your personal one), with its own
         email address you control, and turn on **2-step login** (authenticator app) right away.
      2. At sign-up choose the **EU Central** region (it cannot be changed later for the account).
      3. Create a **private bucket** (e.g. `bayit-backup`) and switch **Object Lock ON while
         creating it** (the simplest moment to do it). Default retention: **Compliance mode,
         about 60 days**, so nobody — not even a stolen key, and not you — can delete or
         overwrite a backup during that time.
      4. Create an **application key limited to that one bucket**, allowed to list, read and
         write files only (no delete, no other buckets), named e.g. `bayit-backup-job`. Give it
         only to the backup job (the developer adds it as hosting secrets). Never use the account's
         master key there. Old backups go by a **lifecycle rule** on the bucket (e.g. after 90
         days), not by the key.
      5. Keep the account's recovery codes offline, like your other 2-step codes.
- [ ] **At deploy:** the login cookie got a new name, so everyone is logged out once and staff are
      asked for their 2-step code again.
- [ ] **Launch day — the real domain in the code.** Add the real domain(s) (e.g. `bayit.ge` and
      `www.bayit.ge`) to `src/config/production-hosts.ts` (ask the developer). A development or
      staging server on those names then refuses to start, and login codes never show on screen
      there. Keep staging on its own hosting project and address.
- [ ] **Launch day — `npm run security:check`.** Run it on the release (or look at the "security
      check" job on GitHub): no high/critical advisory, Next.js/React patched, every package at
      least 14 days old (security upgrades are listed with their reason in
      `scripts/package-age-allow.json`). On 8 November it still fails for ~85 non-security packages
      locked on 5 November; they are old enough from **19 November 2026**. Then read the Next.js
      and React security advisories (the links are in the output).
- [ ] **Launch day — the hosting.** Node.js 22.12 or newer; off Vercel (or behind Cloudflare) set
      `CLIENT_IP_HEADER` (the server refuses to start without it off Vercel). Leave
      `DB_PUSH_ON_BUILD` / `SEED_ON_BUILD` off for the real site (it refuses them); create the
      tables by hand once. The real site then marks its database, and no staging/preview server
      can run on it.
- [ ] **SMS controls.** If texts to Israel or Georgia pause (too few codes entered) or today's SMS
      budget runs out, the alert email links to **Admin → Maintenance → SMS codes**: "Resume texts"
      and "Reset today's budget" (each asks for a fresh authenticator code and is logged). Known
      accounts keep getting their codes during a pause.
- [ ] **Make "supply-chain tests" a required check** on `main` once branch protection is on
      (GitHub → Settings → Branches; the workflow is `.github/workflows/checks.yml`).

## Login & messages (the details)
How people log in: **Google** (when set up), a **6-digit code by email** (always), and — only on
test servers — a code by phone for the demo accounts. SMS codes are used only to check a phone
number: a guest making a booking, and a host before posting. Each number is checked **once**: an
account that already has it verified never gets another SMS. Prices below were checked on the
providers' public pricing pages on 2 November 2026; they change, so check the current price
before you pay.

- [ ] **Google sign-in keys (free).**
      1. [Google Cloud Console](https://console.cloud.google.com) → create a project (e.g. "Bayit").
      2. **APIs & Services → OAuth consent screen**: type "External", app name "Bayit", your support
         email, your domain, links to the Privacy policy and Terms. Publish it.
      3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type "Web
         application". Authorized redirect URI: `https://<your domain>/api/auth/callback/google`
         (add `http://localhost:3000/api/auth/callback/google` for testing on a computer).
      4. Put the Client ID and Client secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (on
         the hosting's settings). The "Continue with Google" button appears by itself. New Google
         users skip the first-name step: their first name comes from Google.
- [ ] **Resend for email (login codes and all other emails).** Free plan: 3,000 emails a month,
      at most 100 a day, 3 domains. Pro: $20 a month for 50,000 emails (no daily limit; $0.90 per
      extra 1,000). Steps: sign up at [resend.com](https://resend.com) → **Domains → Add domain** →
      add the DNS records it shows at your domain registrar (SPF, DKIM) until it says "Verified" →
      **API Keys → Create** → set `RESEND_API_KEY` and `EMAIL_FROM` (e.g.
      `Bayit <no-reply@your-domain>`). Without it, **email login does not work on the real site**
      (the login form says it isn't available yet) and emails only appear in Admin → Email outbox.
      The 100-a-day free limit is the first one you'd hit: move to Pro when sign-ups grow.
      **Booking emails use the same keys**: the guest's confirmation (with the address and the
      host's phone), "new booking" to the host, a reminder to both 3 days before arrival,
      cancellation notices and the review request after the stay — about **5 emails per
      booking**, so the free plan's 100 a day covers roughly 15–20 bookings a day next to the login
      codes. Without Resend, guests and hosts get **no booking emails** on the real site (they
      still see everything in "הנסיעות שלי" / "הזמנות לנכסים שלי", and texts go out if Twilio
      Messaging is set up).
- [ ] **An SMS service for booking and host phone checks (Twilio).** Without it, the real site says
      "Phone verification isn't available yet" — so **hosts cannot post** and **guests cannot book
      on the site** (a guest without a verified number sees "booking on the site isn't available
      yet" on the "אישור הזמנה" page, with "שאלה למארח" — WhatsApp — instead). The site makes the
      code itself and sends it as its own text through a Twilio **Messaging Service** (Twilio
      Verify is not used, so there is no per-check fee). Costs:
      - SMS to **Israel: $0.2575** per message; to **Georgia: $0.1684** per message (Twilio's price
        list; carrier fees may be added).
      - So one phone check costs about the price of one text. "Once per number" keeps this low: a
        guest pays it once, not for every booking.
      Steps: [twilio.com/try-twilio](https://www.twilio.com/try-twilio) → upgrade the account (a
      trial only texts your own phone) → **Messaging → Services → Create Messaging Service** (add
      a sender number) → set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
      `TWILIO_MESSAGING_SERVICE_SID` (MG…). In **Messaging → Settings → Geo permissions** allow
      only Israel and Georgia. **SMS Pumping Protection for Programmable Messaging** (against
      SMS-pumping fraud): the **Basic** tier is on by default; the **Advanced** tier is paid (about
      **$0.025 per message segment** outside the US and Canada). **Your decision** whether to buy
      Advanced; the site's own brakes (per-account and per-network shares and a daily SMS budget)
      work either way.
- [ ] **Booking text messages (Twilio Messaging).** The same Messaging Service
      (`TWILIO_MESSAGING_SERVICE_SID`, or `TWILIO_FROM_NUMBER`) sends the booking texts; without
      it they are just written to the server log (emails still go out). The texts, each in the
      person's own language (wording in `messages/<lang>/emails.json`, "sms"):
      - to the guest: "booking confirmed" (with a link to the address and the host's contact), a
        reminder 3 days before arrival, and "the host cancelled";
      - to the host: "new booking" (guest, dates, number of guests), the reminder, and "the guest
        cancelled".
      A normal booking sends about **4 texts**. Hebrew, Russian, Arabic and Georgian texts are
      Unicode (70 characters per SMS part), so each is usually **2–3 parts** — roughly **$0.50–0.80
      per text to Israel** at the prices above, about $2–3 per booking. If that is too much, tell us
      and we will send only the confirmation and the cancellation by text (emails cover the rest).
- [ ] **Scheduled jobs need `CRON_SECRET` and a plan that allows hourly jobs.** Calendar sync runs
      every hour (Airbnb / Booking.com imports, to avoid double bookings); booking reminders and
      "stay completed" (with the review request) run daily; your admin daily summary goes out once,
      at 08:00 Israel time, never on Shabbat or Yom Tov; the hosts' weekly stats email goes out on
      Sunday mornings; the saved-search and price-drop emails go out between 08:00 and 12:00 Israel
      time, never on Shabbat or Yom Tov (`/api/cron/saved-alerts`). Set `CRON_SECRET` on the
      hosting, and check that the plan runs hourly cron jobs (if it only allows daily ones, a free
      external cron service can call `/api/cron/ical-sync` every hour with the same secret).
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
- [ ] **Check the real speed with PageSpeed Insights** (pagespeed.web.dev) on `/he`, a search, a
      listing and `/he/batumi/short-stays` once the site is deployed. After the final speed pass of
      round 3 (this machine, production mode, phone setting) the home page scored 90 or more on
      every run (10 of 10: 96 or 90), a listing 94–96, a city page 90–96 and search 94 in four runs
      of five (87 in one); the numbers and the reason are in `docs/round-3/final.md`. A host with
      HTTP/2 and a CDN (e.g. Vercel) was ~1 s faster in an earlier proxy test.
- [ ] **Try the fast version on your phone:** `bash .devcontainer/start-prod.sh` in the codespace
      and open the address ending in `-3000.app.github.dev/he` (photos are prepared in the
      background for 2–3 minutes).

## Look and feel (decide when you have a minute)
- [ ] **The WhatsApp button stays WhatsApp green.** This is the only green besides "verified" and
      success messages. Say if you want it purple.
- [ ] **Red stays for safety.** The emergency number card (112) and the scam-alert banners stay
      red. Say if you want them neutral.
- [ ] **Arabic share images** show "Bayit" with the English tagline, because the image generator
      can't draw Arabic letters.
- [ ] **Jewish holidays outside the Jewish life page.** Two round-1 holiday helpers were kept
      because the brief doesn't mention them: a small "holidays in your dates" box above the
      search results (only when the chosen dates include a holiday), and holiday dots in the date
      pickers. Say if they should go.
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
      - **Long-stay discounts:** "הזמנות ומחיר" has a % for 7+ nights and a % for 28+ nights (up
        to 60%), applied off the nights only, never off the cleaning fee. Holiday prices are set
        in the place's calendar ("מחיר לתאריכים").
      - **The host sees the guest's phone and WhatsApp** for confirmed and completed bookings only
        (not after a cancellation).
      - **Imported calendars:** each link's last result (read OK / why it failed) is shown after
        "סנכרון עכשיו", and the page re-checks by itself when the last sync is older than 30 minutes.
        Errors from the hourly sync are not stored (that would need a new database field).
      - **"How to connect" steps for Airbnb and Booking.com** describe their menus in general words;
        please check them against the real sites once.
- [ ] **Jewish life page.** It is calmer: a short title band, a sticky row of jump links (Shabbat
      times, calendar, community map, emergency numbers, guides), and on phones the month list
      shows only days with times or holidays (with "show every day"). All the content is still
      there. Say if you want it otherwise.
- [ ] **Footer tagline.** It is your text: "בתים בגאורגיה, אצל מארחים שהתחייבו לקבל ישראלים בברכה.
      מזמינים באתר ומשלמים כשמגיעים." The Russian, Arabic and Georgian versions are our translations
      (see "Translations to check").
