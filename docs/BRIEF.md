# Build Prompt: Jewish Home-Listing Website (Georgia First)

Oct 31, 2026 · @Kobi

*Copy everything below into your AI website builder (Claude, Lovable, Bolt, v0, Cursor…).*

## 1. Your job and the idea

You are a senior product designer and full-stack developer. Build a modern, polished website where Israelis and Jews who own property in Georgia can list it, and Jewish travelers, families and investors anywhere in the world can find it and contact the owner directly.

- Think **Yad2** (Israel’s biggest classifieds site) for how listings, filters and contact work, and **Airbnb** for the look and feel.
- **Georgia means the country in the Caucasus** (Tbilisi, Batumi, Kutaisi), not the US state.
- Listing types: apartments, houses, villas, rooms, hotels and guesthouses — for short stays, monthly rent or sale.
- The site does not take bookings or payments at launch. It connects guests with owners by WhatsApp, Telegram, Viber, Messenger, phone or email (in-site chat comes in Phase 2).
- What makes it different: Jewish-friendly details (kosher kitchen, Shabbat-friendly, walking time to a synagogue), strong scam protection, and 5 languages.
- Later, Israelis who own property in the USA, London and Dubai can list there too — to sell to buyers in Israel or rent to religious Jewish families.
- **Working name:** “Bayit” (בית, “home”). It’s a placeholder, so keep the name, logo and colors in one config file where they’re easy to change.

## 2. Who uses it

Five kinds of users, each with their own needs:

- **Guests and renters** — Israeli and Jewish travelers, families, students and religious families looking for a short stay or a monthly rental.
- **Buyers and investors** — Israelis buying property abroad (Batumi and Tbilisi are popular).
- **Private owners** — Israelis and Jews who own a home, apartment or room in Georgia.
- **Businesses** — hotels, guesthouses, property managers and agents. They get a “Business” label so guests can filter for private owners only, like Yad2’s private/agency split.
- **The team** — admins, moderators, support agents and content editors.

## 3. Build in 3 phases

Build Phase 1 completely and make it work well before starting Phase 2.

- **Phase 1 — Launch in Georgia:** 5 languages, home page, search with filters, sort and map, listing pages, the post-a-listing wizard, contact buttons, Jewish-friendly fields and filters, the Jewish Life map, synagogue walking times, Shabbat times, accounts with phone verification, manual ID and ownership checks, automatic scam checks, moderation, favorites, the user dashboard, help center and support tickets, About, Safety Center, legal pages and the admin panel.
- **Phase 2 — Growth:** reviews, in-site chat, saved-search alerts, paid promotions (bump and featured), detailed owner stats, an ID-verification service, Jewish Life guide articles, a partner directory, an investor calculator (expected rental income and yield), and WhatsApp and phone notifications.
- **Phase 3 — Expansion:** the USA, London and Dubai — sale listings for buyers in Israel and rentals for religious Jewish families; GBP and AED currencies; verification rules for each country; and optional secure booking with payment held until check-in, like Airbnb.

## 4. Five languages, including right-to-left

The whole site works in Hebrew, English, Russian, Arabic and Georgian (codes he, en, ru, ar, ka), and Hebrew is the main language.

- **Right-to-left:** Hebrew and Arabic flip the whole layout — menus, arrows, sliders, forms and galleries. Use CSS logical properties so one design works both ways. Phone numbers, prices and links stay left-to-right inside RTL text.
- **Mixed text:** user-written text (titles, descriptions, reviews) gets `dir="auto"` so it displays correctly whatever language it’s in.
- **Language switcher:** show native names — עברית · English · Русский · العربية · ქართული — not flags.
- **First visit:** match the browser’s language if it’s one of the five, otherwise show English. Remember the choice.
- **URLs:** each language has its own address (/he, /en, /ru, /ar, /ka) with hreflang tags for Google.
- **No hard-coded text:** all interface text lives in translation files. A native speaker should check the Georgian, Arabic and Russian before launch.
- **Auto-translated listings:** the owner writes in one language and the site translates it into the other four with a translation API that supports Georgian (e.g., Google Cloud Translation). Label it “Auto-translated · Show original”, and let the owner edit each version.
- **Place names in all 5 languages,** and search works in any of them: Tbilisi = טביליסי = Тбилиси = تبليسي = თბილისი.
- **Fonts:** a family that covers all 5 scripts, such as Noto Sans with Noto Sans Hebrew, Noto Sans Arabic and Noto Sans Georgian.
- **Numbers and dates:** Western digits (0–9) everywhere; date and number formats follow the chosen language.

## 5. Design: modern, clean and trustworthy

The site should feel as polished as Airbnb: big photos, lots of white space, and nothing confusing.

- **Mobile first:** most users are on phones. It must look great from 360px wide up to large desktop screens.
- **Style:** rounded cards (12–16px corners), soft shadows, smooth small animations, skeleton loaders instead of spinners, and high-quality photos of Georgia (free placeholders until real ones arrive).
- **Colors:** a deep, trustworthy blue as the main color, a warm terracotta or wine-red accent (a nod to Georgia’s roofs and wine), an off-white background, green for “Verified” and amber for warnings. Text must pass contrast rules. Light and dark mode.
- **Icons:** one consistent icon set (e.g., Lucide), never emojis.
- **Mobile navigation:** a bottom bar with Home, Search, Post (a big plus button), Saved and Profile. On listing pages, the WhatsApp and Call buttons stick to the bottom of the screen.
- **Desktop navigation:** a top bar with the logo, main tabs (Rent, Buy, Hotels, Map, Jewish Life, About, Help), language and currency switchers, Saved, Messages, Profile, and a highlighted “Post a listing” button.
- **Footer:** About, How it works, Safety Center, Help and support, Jewish Life, Terms, Privacy, Accessibility, Contact and social links.
- **Every state is designed:** empty results, errors, loading and the 404 page get friendly text and a clear next step.
- **Installable:** make it a PWA so people can add it to their phone’s home screen like an app.

## 6. Pages and tabs

Build these pages, each with everything listed under it.

### Home

- A big search bar at the top: Where (city or neighborhood) · Deal (Short stay / Monthly rent / Buy / Hotels) · Dates or move-in date · Guests · Search.
- Quick categories: Apartments, Houses and villas, Rooms, Hotels and guesthouses, For sale, Shabbat-friendly near a synagogue.
- Popular cities with photos: Tbilisi, Batumi, Kutaisi, Kobuleti, Gudauri, Bakuriani, Borjomi, Kazbegi, Sighnaghi, Mestia. Admins can add more.
- Featured listings (paid ones always labeled “Promoted”), newest listings and recently viewed.
- “Why us”: verified owners, Jewish-friendly details, direct contact with no booking fees, support in 5 languages.
- “How it works” in 3 steps, for guests and for owners.
- This week’s Shabbat times for Tbilisi and Batumi.
- A safety tip strip linking to the Safety Center.
- A big “List your property for free” button.
- Real reviews only. Never invent testimonials.

### Listings (search results)

- Grid, list and map views. On desktop, a split view: the list on one side, the map on the other, with “Search as I move the map”.
- Filters in a sidebar on desktop and a pull-up drawer on mobile (full list in section 7). Active filters show as removable chips with “Clear all” and a live result count.
- Sort by: Recommended · Newest · Price low to high · Price high to low · Price per m² (sale) · Closest to a synagogue · Top rated · Recently updated · Price dropped.
- Listing card: photo carousel, price and period (night, month or sale), title, neighborhood, icons for bedrooms, bathrooms, m² and guests, Jewish badges (“6 min walk to synagogue”, “Kosher kitchen”, “Shabbat-friendly”), the Verified badge, a heart to save, and labels “New”, “Price dropped” or “Promoted”.
- Fast loading with pagination or infinite scroll; going back keeps the scroll position.
- “Save this search” to get alerts about new matches (Phase 2).

### Listing page

- Photo gallery: swipe, fullscreen, up to 30 photos, plus optional video and a 360° tour link.
- Title, price, key facts, listing ID, “Last updated” date and view count.
- Contact box (sticky): owner photo and name, badges, languages spoken, member since, typical reply time, the owner’s local time right now, and the contact buttons (section 8).
- Description with a “Show original / translation” switch.
- Amenities, the Jewish-friendly section, house rules (check-in and check-out times, smoking, pets, quiet hours), and all costs: deposit, cleaning fee, utilities, minimum stay, weekly and monthly discounts.
- Availability calendar managed by the owner, with iCal import and export so it stays in sync with Airbnb and Booking.com.
- A map with the approximate area only. The owner shares the exact address after contact.
- Nearby, with walking times: synagogues, Chabad house, kosher food, mikveh, supermarket, public transport, and the distance to the airport.
- This week’s candle-lighting and Havdalah times for that city, and any Jewish holidays in the guest’s dates.
- Share buttons (WhatsApp, Telegram, Facebook, copy link), Report listing, a safety tip box, similar listings, and reviews (Phase 2).

### Post a listing (step-by-step wizard)

A progress bar, auto-saved drafts, and a clear Back button on every step.

1. Deal type: short stay, monthly rent, for sale, or hotel room.
2. Property type.
3. Location: search the address and drop a pin. Only the approximate area is public by default.
4. Details (section 7).
5. Amenities.
6. Jewish-friendly details.
7. Photos: at least 5, up to 30. Drag to reorder, pick a cover, auto-compress, remove hidden location data (EXIF), and add a light watermark with the site logo.
8. Price, fees and availability calendar.
9. Contact methods and hours, plus “I don’t answer on Shabbat and holidays”.
10. Preview in all 5 languages, accept the listing rules, then Publish.

After publishing, the automatic checks run (section 10). The listing goes live or into review with a clear message, such as “We’re checking your listing — usually within a few hours.” Listings expire after 60 days unless renewed (admins can change this), so old listings don’t pile up.

Hotels and guesthouses get a business page with several room types, each with its own photos and price.

### My account (dashboard)

- My listings with a status: Live, In review, Needs changes (with the reason), Paused, Expired, Draft, Rented/Sold. Actions: edit, pause, renew, bump, mark as rented or sold, delete.
- Stats for each listing: views, contact clicks per channel, and saves.
- Favorites with personal notes, and side-by-side compare of up to 3 listings.
- My support tickets, plus saved searches, messages and reviews (Phase 2).
- Verification center (section 10).
- Settings: language, currency, notifications, 2-step login, connected accounts, download my data, delete my account.

### Owner profile (public)

Name, photo, badges, languages, member since, reply rate, all active listings, reviews, and Report profile.

### Jewish Life

- A map of synagogues, Chabad houses, kosher restaurants and shops, mikvaot and Jewish heritage sites. Only admins add places. Never invent places — start empty or with clearly marked demo points.
- Shabbat and holiday times for each city, and a Jewish calendar.
- Guide articles (Phase 2): the Jewish history of Georgia, keeping kosher there, Shabbat in Tbilisi and Batumi, tips for Israeli travelers, buying property in Georgia (checked by a local lawyer), and emergency and embassy contacts entered by admins.

### About

What the site is, who it’s for, our story (placeholder text for the founders to write), how it works, our values (trust, community, Jewish-friendly) and how to reach us.

### Help center and support tickets

- A searchable FAQ in 5 languages: Getting started, Posting, Contacting owners, Safety, Account and verification, Payments.
- Open a ticket: pick a category (Listing problem, Report a scam — urgent, Account or verification, Technical problem, Payment, Other), write a message, attach screenshots, and link a listing.
- Ticket status: Open → In progress → Waiting for you → Resolved → Closed. The user gets an email on every reply, sees the full history in the dashboard, and can rate the help at the end.
- A contact form. Live chat can come later.

### Safety Center

How to spot scams, tips for guests, tips for owners, how verification works, what to do if something goes wrong, and current scam alerts posted by admins.

### Legal pages

Terms of use, Privacy policy, Cookie policy with a consent banner, Listing rules, and an Accessibility statement. Use placeholder text marked for a lawyer to review.

### Admin panel (separate and protected)

- Overview: new users, new listings, reports, open tickets, top cities and contact clicks.
- Moderation queue: new and edited listings with a risk score and the reasons. Approve, ask for changes, or reject — the reason goes to the owner in their own language.
- Reports, users (search, verify, warn, suspend, ban, internal notes), verification requests, and tickets (assign, internal notes, saved replies).
- Content: home page sections, featured listings, cities and neighborhoods in 5 languages, Jewish Life places and articles, FAQ, translations, scam alerts and banned words.
- Settings: listing expiry, prices for paid features, Shabbat mode, default currency.
- Roles: Admin, Moderator, Support, Content editor. Every admin action is logged.

## 7. Listing details and filters

Every field below is something owners fill in and guests can filter by.

- **Deal type:** short stay (per night), monthly rent, for sale, hotel or guesthouse room.
- **Property type:** apartment, studio, penthouse, private house, villa, cottage, room in a shared apartment, hotel, guesthouse, hostel.
- **Basics:** city, neighborhood, rooms, bedrooms, bathrooms, beds (single, double, sofa bed), max guests, size in m², floor and total floors, elevator, year built, new or old building, furnished or not.
- **Georgian market details:** condition in the local terms — Black frame (bare shell), White frame (ready for finishing), Green frame (almost finished), Newly renovated, Old renovation, Needs renovation. Also heating type (central, gas boiler, electric, air conditioning), view (sea, mountain, city), and the cadastral code (private, used only for verification).
- **Amenities:** Wi-Fi, air conditioning, heating, washing machine, dryer, dishwasher, full kitchen, workspace, TV, parking, balcony or terrace, yard, pool, sauna, gym, near the sea, near ski lifts, crib and high chair, wheelchair access, pets allowed, smoking allowed, self check-in.
- **Jewish-friendly (a core feature):**
  - Walking time to the nearest synagogue and Chabad house, calculated automatically from the map.
  - Kitchen: Not kosher · Can be kashered on request · Kosher with separate meat and dairy.
  - Shabbat-friendly checklist: hot plate (plata), hot-water urn, light timers, a regular key instead of a keypad or electronic lock, stairs or a Shabbat elevator, and no motion-sensor lights or automatic doors at the entrance (or they can be switched off).
  - Mezuzot on the doors, beds that can be separated, space for a sukkah (a balcony or yard open to the sky), Pesach-ready kitchen, suits big families (sleeps 8+), kosher food or a mikveh nearby, host keeps Shabbat, host speaks Hebrew.
  - Hotels: kosher certificate (name of the supervision plus a photo of the certificate), kosher breakfast or meals, Shabbat meals, separate swimming hours.
  - Rooms in shared apartments: men only, women only, or families.
- **Price:** the amount and currency (GEL ₾, USD $, ILS ₪, EUR €; later GBP £ and AED). Per night, week or month, or a sale price. Plus deposit, cleaning fee, utilities (included or an estimate), minimum stay and weekly or monthly discounts. Sale listings show the price per m² and a price-drop history.
- **Display currency:** guests can switch currency using approximate daily exchange rates. The default follows their country (ILS in Israel, GEL in Georgia, USD elsewhere), and the owner’s original price is always shown too.
- **Extra filters:** price range, available dates, verified owners only, private owners or businesses, has photos or video, posted within (24 hours, 3 days, a week, a month), and rating (Phase 2).

The sort options are listed in section 6, under Listings.

## 8. Contacting owners

Guests contact owners directly, in the app the owner prefers, with one tap.

- Owners choose which methods to show and which comes first: WhatsApp, Telegram, Viber, Facebook Messenger, phone call, SMS, email, and in-site chat (Phase 2). Email goes through a contact form so the address stays hidden.
- Each button opens the right app with a ready message in the guest’s language, for example: “Hi! I saw your listing ‘Sunny 2-room apartment in Vake’ (ID 1234) on Bayit. Is it free on 10–17 March for 4 guests?”
- Contact details stay hidden until the guest taps “Show contact” while logged in. Logging in takes one tap with Google, Apple or a phone code. This stops bots from collecting phone numbers.
- Show the owner’s local time and preferred hours. If the owner keeps Shabbat, show “Replies after Shabbat” during Shabbat and holidays.
- The first time someone contacts an owner, show a short safety tip (section 10).
- Count every contact click for the owner’s stats.
- Save phone numbers in international format (+995, +972 and so on) with a country picker and validation, so WhatsApp links always work.

## 9. Jewish and Georgian touches

These details make the site feel built for the community, not just translated for it.

- **Shabbat times** on the home page and every listing page, from the free Hebcal API.
- **Jewish holidays in the date picker.** If the chosen dates include a holiday, show a tip, e.g., “Your dates include Sukkot — filter for sukkah space.”
- **Hebrew date** next to the regular date (optional setting).
- **“Keeps Shabbat” host badge,** with an automatic reply during Shabbat and holidays.
- **Shabbat mode** (admin setting, off by default): during Shabbat and Jewish holidays, by Israel time, people can still browse, but posting, messaging and support pause, with a “Shabbat Shalom” banner.
- **Partner directory** (Phase 2): kosher caterers, Hebrew-speaking drivers and guides, property managers and lawyers in Georgia.
- **Georgian-friendly:** the local property terms from section 7, GEL as a currency, the Georgian phone format (+995), and Georgian as a full language from day one, so local owners and staff feel at home too.

## 10. Trust and anti-scam (very important)

Trust is the product: every listing is checked, owners earn badges by proving who they are, and every user is warned about common scams at the moment they make contact.

### Verification badges

1. **Phone verified** — a code by SMS or WhatsApp. Required to post.
2. **ID verified** — the owner uploads an ID and a selfie. In Phase 1 an admin checks it by hand; in Phase 2 use an ID-verification service such as Sumsub or Veriff.
3. **Owner verified** — proof they own the property or may rent it out. In Georgia: an extract from the National Agency of Public Registry (NAPR) with the cadastral code, in the same name as the ID. Hotels upload their business registration.
4. **Property verified** (optional, paid) — a live video call with the team, or a visit from a local representative.

### Automatic checks on every new or edited listing

Each listing gets a risk score. Low risk goes live; high risk waits for a person.

- The same photos already used in another listing or account (image fingerprinting), or found elsewhere online.
- A price far below the usual price for that area and size.
- Scam phrases in any of the 5 languages: “send the deposit first”, “I’m abroad, I’ll post you the keys”, Western Union, gift cards, crypto.
- Phone numbers or links hidden in the description or the photos.
- A brand-new account posting many listings fast, several accounts on one device, or virtual (VoIP) phone numbers.
- The first listing from every new account is always checked by a person.

### Protecting users

- A safety tip the first time someone taps a contact button: “Never pay before you’ve checked the owner and seen the place, in person or on a live video call. Don’t send money by bank transfer, Bit, PayBox, crypto or gift cards to someone you haven’t verified. Bayit will never send you a payment link in a chat.”
- A video-call tip: ask the owner to show the apartment and a paper with today’s date and the listing ID.
- A Report button on every listing, profile and message (fake listing, already rented, wrong price, asked for money up front, offensive, other). After several reports, the listing is hidden until a moderator checks it.
- Users can block each other.
- Paid placements are always labeled “Promoted”.
- Reviews only from people who contacted the owner through the site (Phase 2), including the question “Were the kosher and Shabbat details accurate?”
- Warn owners about guest-side scams too, like fake overpayments and “please refund the difference”.
- Admins can switch on a site-wide scam-alert banner.
- Listings expire and show a “Last updated” date, so old listings don’t linger.

## 11. Security, privacy and legal

Build security in from day one, not at the end.

- HTTPS everywhere, secure headers (CSP, HSTS), and protection against the OWASP Top 10 (SQL injection, XSS, CSRF and the rest).
- Strong password hashing (Argon2 or bcrypt) or password-free login. 2-step login for everyone, required for admins.
- Database rules so users can only see and change their own data (e.g., Supabase row-level security).
- Rate limits and an invisible CAPTCHA (e.g., Cloudflare Turnstile) on sign-up, login, posting, “Show contact” and support forms. Protect SMS codes from SMS-pumping fraud.
- Uploads: check file type and size, re-encode images, strip hidden data, and scan for malware.
- ID and ownership documents: stored encrypted in private storage, seen only by verification staff, and deleted after review. Keep only “verified on \[date\] by \[staff member\]”.
- Secrets in environment variables, never in the code. Daily backups. Error monitoring (e.g., Sentry). Cloudflare in front of the site for speed and attack protection.
- Privacy: cookie consent, a clear privacy policy, “Download my data” and “Delete my account”. Follow Israel’s privacy law, GDPR for EU and UK users, and Georgia’s personal data law.
- **Fair-housing note:** build for the Jewish community through features (kosher, Shabbat, synagogues, Hebrew), not “Jews only” rules. In the USA and the UK, housing ads that state a religious preference can break fair-housing and equality laws. Don’t add fields that limit who may rent or buy.
- Before launch, review the whole code for security problems and send me a short report of anything still open. A lawyer should review the legal pages, and each new country before it opens.

## 12. Making money

Basic listings are free. Paid features switch on in Phase 2, but plan the database and screens for them from the start.

- **Bump to top** — moves a listing back to the top of results, like Yad2’s bump.
- **Featured** — a spot on the home page and at the top of results, always labeled “Promoted”.
- **Premium owner plan** — more photos, detailed stats, priority support and a highlighted profile.
- **Property verification visit** — earns the paid “Property verified” badge.
- **Partner ads** — Jewish and Israeli-friendly services in Georgia.
- Keep the payment provider pluggable. The right one depends on the country where the business is registered.

## 13. Recommended tech

Use this stack unless your platform has its own — then keep every requirement and adapt the tools.

- **Website:** Next.js with TypeScript, Tailwind CSS and shadcn/ui; next-intl for the languages and right-to-left.
- **Database, login and storage:** Supabase (Postgres, phone/Google/Apple login, file storage, row-level security), or Postgres with Prisma.
- **Maps and walking times:** Mapbox or Google Maps; Leaflet with OpenStreetMap as a cheaper option.
- **Shabbat and holiday times:** Hebcal API.
- **Translation:** Google Cloud Translation (supports all 5 languages).
- **SMS codes and VoIP detection:** Twilio.
- **Email:** Resend or similar.
- **Security and speed:** Cloudflare (CDN, Turnstile, attack protection) and Sentry for errors.
- **Hosting:** Vercel or similar.
- **Images:** served through a CDN as WebP or AVIF, with lazy loading.

## 14. SEO, sharing, speed, accessibility and notifications

The site must be easy to find on Google, look good when shared, load fast and work for everyone.

- **SEO:** server-side rendering, clean URLs in each language, a sitemap, and structured data for listings (schema.org).
- **Sharing previews:** when a listing is shared on WhatsApp, Telegram or Facebook, the preview shows the main photo, title, price and city.
- **Speed:** a Lighthouse score of 90+ on mobile.
- **Accessibility:** WCAG 2.1 AA (Israel’s accessibility standard is based on WCAG) — keyboard use, screen readers in all 5 languages, alt text on images, good contrast, and an Accessibility statement page. Build real accessibility, not just an overlay plugin.
- **Notifications in the user’s language:** welcome, verify your phone, listing approved or needs changes, new message, new match for a saved search, listing about to expire, and ticket replies. Email first; WhatsApp and phone notifications in Phase 2.

## 15. Definition of done

Phase 1 is done when all of these are true:

- [ ] Works on phone, tablet and desktop, starting at 360px wide.
- [ ] All 5 languages switch correctly, and Hebrew and Arabic are fully right-to-left with nothing broken or overlapping.
- [ ] A new user can sign up, verify their phone, post a listing with photos, and see it go live or into review.
- [ ] A guest can search, filter, sort, use the map, open a listing, and message the owner on WhatsApp with a ready message.
- [ ] An admin can approve or reject listings, handle reports and answer tickets.
- [ ] Report buttons, safety tips and the automatic scam checks all work.
- [ ] No “lorem ipsum”, no broken links, no console errors, and Lighthouse 90+.
- [ ] The security checklist in section 11 is done, with a short report.

## 16. How to work with me

Plan first, then build Phase 1 in small steps I can test.

1. Before writing code, send me a short plan: the site map, the database tables, the outside services I’ll need with their rough monthly cost, and any decisions I need to make.
2. Build Phase 1 step by step. After each step, tell me what’s done and how to test it.
3. If something important is unclear, ask me — don’t guess.
4. Add 20–30 demo listings across Tbilisi (Vake, Saburtalo, Old Tbilisi), Batumi, Kutaisi, Gudauri and Bakuriani, in all 5 languages with free placeholder photos. Mark all demo data “Demo” and make it removable with one switch before launch.
5. Explain setup and going live in simple steps. Include a README and a list of every environment variable.
6. Keep the site name, colors, cities, currencies and prices for paid features in one config file.
