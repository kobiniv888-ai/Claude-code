# Redesign — Phase 1 (foundations)

*Checked on 1 November 2026 on branch `redesign`. Phase 1 builds the foundations the page redesigns
stand on: the design system, the Bayit pledge, real photos and demo data, and the bug fixes from
the brief (map, login, phone prefix, "לאן" suggestions). The home, search, listing and other pages
are redesigned in the next phases, so most pages still have their old layout, now with the new
colours, cards, photos and fixes.*

## Final check: all green

| Check | Result |
|---|---|
| `npx prisma validate` / `npx prisma generate` | valid / generated |
| `npx tsc --noEmit` | no errors |
| `npx eslint .` | no errors, no warnings |
| `npm run i18n:check` | 38 namespaces × 5 languages, all keys match |
| `npx vitest run` | 61 files, 716 tests pass |
| `npm run db:seed` (run twice) | identical result both times: 20 demo listings (17 live), 109 local photos |
| Production build (`next build`) | passes |
| Screenshots at 390×844 Hebrew (light and dark) and 1440×900 English | checked, see below |

Checked in the running site:
- **Cards** show local photos (`/photos/listings/…`, never a remote image), the price with its
  unit, an icon row (rooms, guests, size, floor) and the badge row ("מקבלים ישראלים בברכה",
  minutes to the synagogue, "דובר עברית"…).
- **Map** opens on Georgia when no city is chosen (Batumi on the left, Tbilisi on the right), and
  on the city when one is. With no key in `.env` it shows pins on a plain background and the
  notice "חסר מפתח מפה". It never requests a tile from OpenStreetMap's servers.
- **"טב" in "לאן"** suggests טביליסי in about 0.1 seconds, with no spinner and no request.
- **Login:** the Hebrew page starts on +972. After switching to +995 and entering
  555 00 00 21, "שליחת קוד" opens the 6-digit code screen.
- **Hebrew calendar:** switching to the next month takes about 1 second (December 2026 shows the
  first Hanukkah candle on the 4th).
- **Pledge step** in "פרסום": step 10 of 11, the v1 text, and "אישרתם את ההבטחה של בית · גרסה 1"
  for a host who already accepted.
- No errors in the browser console on any of the pages above.

## What was built

### 1. Design system
- **New colours, text sizes, spacing, corners, shadows and motion** in `src/app/globals.css`.
  Every existing name still works. Light is the default theme; dark and "device" still work.
- **Shared components** in `src/components/ds/` (import from `@/components/ds`):
  - buttons and chips: `Button`, `Chip`, `RemovableChip`, `SegmentedControl`
  - our own Jewish icons: candles, synagogue, kosher stamp, Hebrew speech bubble, house with a heart
  - badges: `BayitBadge`, `BadgeRow`
  - carousels: `PhotoCarousel`, `CardCarousel`
  - overlays and bars: `BottomSheet`, `StickyContactBar`
  - states: `Skeleton`, `ListingCardSkeleton`, `EmptyState`
  - headings and motion: `SectionHeader`, `Reveal`, `NumberRoll`, `HeartButton`
- **New listing card:** photo first, big price, one-line title, place, icon row and badge row.
- **`/dev/ui`**, a hidden page that shows all of the above in 5 languages and both themes. It only
  exists in development, or with `NEXT_PUBLIC_SHOW_DEV_UI=true`.

### 2. The Bayit pledge (required for every host)
- **Database:** 4 new fields.
  - On the user: `welcomePledgeVersion` and `welcomePledgeAcceptedAt`.
  - On the listing: `welcomePledgeVersion` and `welcomePledgeAt`, a snapshot taken when it is
    published.
- **Wording v1:** "אני מתחייב/ת לקבל בברכה אורחים ולקוחות ישראלים ויהודים, ולא לסרב לאף אחד בגלל
  דת או מדינת מוצא", in all 5 languages (`messages/*/pledge.json`, `versions.v1`).
- **Changing the wording later:**
  1. Add a `v2` text in the 5 files.
  2. Raise `siteConfig.pledge.currentVersion` to 2.
  3. Raise the admin setting "pledge required version".

  Hosts who accepted v1 then see a banner asking them to accept the new text, and their green
  badge waits until they do.
- **Publishing is refused** until the host has accepted the current version. The wizard has a
  pledge step just before the preview.

### 3. Photos and demo data
- **Photos:** 30 photo spots, 26 of them filled.
  - Sources: free Unsplash and Pexels photos, plus the existing Wikimedia city photos. All are
    downloaded into `public/photos/`; none is hotlinked or AI-generated.
  - Credits: listed in `public/photos/CREDITS.md` and on the new `/photo-credits` page, which is
    linked from the footer.
- **Spots for real photos:** every spot that should get one is listed in `PHOTOS_NEEDED.md` at the
  top of the repository. A missing photo shows a calm "תמונה בקרוב" placeholder.
- **Demo data:** 20 demo listings in 8 cities, each with 4 to 6 local photos.
  - All 6 demo hosts accepted pledge v1.
  - Every badge appears somewhere.
  - There are no invented reply times.

### 4. Bug fixes and the map
- **Login in Codespaces works.** The site now trusts the codespace address, so the "משהו השתבש"
  error is gone.
  - Other failures show a clear message instead of "משהו השתבש".
  - In development a yellow hint explains the cause.
  - When Google/Apple are not set up, the text no longer promises them.
- **Phone prefix:**
  - Defaults to +972 in Hebrew, English, Russian and Arabic, and to +995 in Georgian.
  - The country picker is searchable by name in any language, by dialing code, or by country
    code.
  - It remembers the last choice.
  - The contact phone in "post a listing" defaults to +995.
- **Currency:** the Hebrew site shows ₪ ILS until the visitor picks another currency.
- **"לאן" suggestions** are instant, from a local list of 10 cities and 26 neighbourhoods in 5
  languages. They match typos and both spellings (בטומי / באטומי).
- **Map:**
  - **Provider:** CARTO. Light is "Voyager", dark is "Dark Matter", with the credit
    "© OpenStreetMap contributors, © CARTO".
  - **Configuration:** the provider and key live in one place, `src/config/map.ts`, set by
    `NEXT_PUBLIC_MAP_TILE_PROVIDER` and `NEXT_PUBLIC_MAP_TILE_KEY`.
  - **Where it starts:** always on Georgia.
- **Codespace start-up:** it always updates the database and re-seeds the demo data when it is
  missing or has expired.

### 5. Fixes made while joining the three parts
- **Floor and photo count:** the card's floor icon and the total photo count are now filled in
  from the database (`src/lib/listing/mappers.ts`, with a test).
- **Dark-mode button contrast:** the coral "פרסום מודעה" button in dark mode had white text at
  3.4:1, below the accessibility minimum. It now uses the darker brand coral (4.9:1).
- **Colours in `site.ts`:** `siteConfig.colors` now includes `coral`, to match the CSS.

## What to check on your phone

Open the codespace address on the phone, in Hebrew, then switch to dark mode in the menu and look
again.

1. **Home** (`/he`): city photos, and the featured cards with the green "מקבלים ישראלים בברכה"
   badge.
2. **Search** (`/he/search?city=tbilisi`):
   - every card has photos you can swipe, a price, an icon row and a badge row;
   - tap the heart and the compare button.
3. **Map** (tap "מפה"): it opens on Tbilisi. Clear the city and it should show all of Georgia,
   never the world.
   - Without a key you see a plain background and a notice.
   - With a key (steps below), the streets appear, light by day and dark in dark mode.
4. **"לאן"**: type "טב", then "באטומי", then "tbilsi". Each should suggest the right city
   immediately.
5. **Login** (`/he/login`):
   - the prefix shows +972;
   - search "995", choose Georgia, enter 555 00 00 21 and tap "שליחת קוד";
   - in development the code appears in a yellow box;
   - reload the page: it should remember +995.
6. **Post a listing** (sign in as the owner, 555 00 00 11):
   - "+" → start a new listing;
   - the contact step's phone should start on +995;
   - the step "ההבטחה של בית" comes just before the preview.
7. **Jewish life** (`/he/jewish-life`): switch the calendar to next month. It should change in
   about a second, with no long "Rendering…".
8. **Footer**: the "קרדיט לתמונות" link opens the photo credits.
9. **`/dev/ui`**: the design system, if you are curious. Only in development.

## Your two tasks

### A. Synagogue photos from Wikimedia (this server is blocked by Wikimedia; a codespace is not)

In the codespace terminal, from the project folder, on the `redesign` branch:

```bash
bash scripts/fetch-wikimedia-photos.sh
```

It downloads the Great Synagogue of Tbilisi, the Batumi synagogue and a synagogue interior. It then
optimizes them, adds their credits to `public/photos/CREDITS.md` and `PHOTOS_NEEDED.md`, commits
and pushes.
- `--dry-run` shows what it would download without changing anything.
- `--no-push` commits without pushing.
- It is safe to run again.

### B. The CARTO map key

CARTO's basemaps are free for commercial use up to 1 million tile requests a month.

1. Go to **https://carto.com/basemaps**, click **"Request a key"**, and enter your email. Nothing
   else is needed.
2. Open the email from CARTO and sign in with its link. Your key is in the dashboard.
3. In the dashboard, **add restrictions** so only your sites can use the key:
   - `localhost`
   - `*.app.github.dev` (codespaces)
   - your real domain, when you have one
4. Give the key to the site. Either way works:
   - **Codespaces secret (recommended; it survives new codespaces):** github.com → your avatar →
     **Settings → Codespaces → Secrets → New secret**.
     - Name: `NEXT_PUBLIC_MAP_TILE_KEY`
     - Value: the key
     - Repository: this one

     Then restart the codespace, or run `bash .devcontainer/start.sh`. The key is copied into
     `.env` automatically.
   - **In `.env`:** set `NEXT_PUBLIC_MAP_TILE_KEY="…"`, save, and restart the site with
     `pkill -f "next dev"; bash .devcontainer/start.sh`.
5. On Vercel later, add the same variable under **Settings → Environment Variables** and redeploy.
   The key is read when the site starts or is built, so a restart or redeploy is always needed.

If you outgrow the free tier, add another provider in `src/config/map.ts` and set
`NEXT_PUBLIC_MAP_TILE_PROVIDER`. Nothing else changes.

## Open issues

- **The pages are not redesigned yet.**
  - The home hero still says "מוצאים בגאורגיה בית שמרגיש כמו בבית", and nothing up top says that
    every host welcomes Israelis and Jews yet. That is the next phase (home), which will use the
    pledge texts (`pledge.why`, `pledge.points`) and the new photos.
  - Search, the listing page, sign-in and Jewish life keep their old layout until their phases.
    They already use the new colours, cards and fixes.
- **Synagogue, kosher food and community photos** show "תמונה בקרוב" until task A is run (synagogues)
  or real photos arrive (kosher food, community). The full list is in `PHOTOS_NEEDED.md`.
- **Map tiles** need the key (task B). Until then every map shows a plain background.
- **The "+N photos" slide** appears only on listings with more than 6 photos. No demo listing has
  that many, so you will not see it yet.
- **End-to-end browser tests** (`npm run test:e2e`) were not run in this phase. The wizard test was
  updated for the new pledge step (11 steps).
- **Pledge for new hosts:** checked by the pledge engineer (accepting saves version 1). This check
  only saw the "already accepted" state of the demo owner.

### Hebrew wording noticed outside the redesigned pages (not changed)

- **Demo labels:** the cards and the banner say "דמו", but the owner box on a listing page says
  "הדגמה", and so do the Jewish-life map points ("נקודת הדגמה", "בית כנסת לדוגמה"). One word
  everywhere would read better.
- **Account greeting:** "שלום, Demo" takes the first word of the demo name "Demo Owner — Yossi".
  This is demo data, not a translation problem. Hebrew demo names would read better.
