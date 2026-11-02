# Round 2, phase 5: other pages

Two parts were built side by side and then checked together at this gate:
- **post form and account**: the split post form (5.7), the map step (bug 8.1), account tabs and
  greeting (5.8, bug 8.2), account deletion and data export with bookings
- **content**: the About story (5.10), the Help FAQ and the Terms booking rules (5.11), the calmer
  Jewish life hub with jump links (5.9), and real community places with a verification date (5.9)

## What changed

### Post form (brief 5.7)
- The round-1 step 4 ("ספרו לאורחים על המקום", ~20 fields) is now four short steps after the
  location step. The wizard has 14 steps for a short stay:
  1. **`size` "גודל וחדרים"**: rooms, bedrooms, bathrooms, beds, size, and who shares the room
     (shared rooms only). Hotels skip it.
  2. **`building` "הבניין"**: floor, floors, year built, elevator, new or old, and the private
     cadastral code in its own "רישום הנכס" card tagged "פרטי".
  3. **`features` "מצב ומאפיינים"**: all optional and folded. Each group row says what is chosen,
     and a group with an error opens by itself. Groups: condition (the Georgian frame terms) with
     furnished, heating, view, and video / 360° tour. Condition only shows where it applied in
     round 1 (sale and long rent), so a short stay sees heating, view and video.
  4. **`text` "כותרת ותיאור"**: language, title, description.
- **Required:** only rooms (sale and monthly rent), size (sale), who shares the room (shared
  rooms), and title plus description. The cross-field checks stay: floor above the building's
  floors (building step) and more bedrooms than rooms (size step).
- **Kept:** the phase-4 "הזמנות ומחיר" step (max guests and check-in/out times stay there),
  autosave per step, the private exact address, the private cadastral code, the progress bar and
  the required pledge step.
- **Old links:** `?step=details` opens `size` (`building` for hotels). Risk flags about the text
  and "edit original" in the preview go to `text`.
- **Green** is gone from the pledge step, the Jewish step, the privacy notes and the steps sheet.
  It stays only on success states: photos uploaded, saved, listing live.

### Map step (bug 8.1)
- The cause was the Leaflet sizing problem. `location-picker.tsx` now tells Leaflet the map's
  size after mount and on every size change. Until the person moves the map, it shows the
  intended view again: all of Georgia, the chosen city, or the pin.
- **A pin is never placed by itself.** A tap outside Georgia places nothing, and a pin dragged
  outside goes back. The form then says "המקום הזה מחוץ לגאורגיה…" (`wizard.location.tapOutside`).
- **Gate check:** no pin on first view at 390 and 1440. A tap in the center of the first view
  lands at 42.349, 43.374 (390) and 42.335, 43.374 (1440), which is central Georgia. Without a
  CARTO key the tiles are blank, so the coordinates are the proof.

### Account (brief 5.8, bug 8.2)
- **Tabs:** סקירה · הנסיעות שלי · הנכסים שלי · הזמנות לנכסים שלי (hosts only) · שמורים · אימות ·
  הגדרות.
  - Compare and Support are no longer tabs and keep their URLs. On desktop they sit in a quieter
    list under a divider.
  - On phones, Compare and Support join the tab strip only while they are open or while something
    is waiting there: a ticket waiting for a reply, or items to compare.
- **"המודעות שלי" is now "הנכסים שלי"** in the account, the user menu and the post form, in all
  5 languages.
- **Greeting:** "שלום, <first name>". Demo accounts see "שלום, Yossi (דמו)".
  - **A phone-only sign-up never sees "Hello, +972".** `requireUser()` first asks for a first
    name, so a new phone account lands on the first-name step (checked in the screenshots).
    "שלום!" stays as the fallback when no first name is known.
- **Settings → Profile** prefills a demo account's first name as "Yossi" / "Noa", or leaves it
  empty. It never shows "Demo" (`settingsFirstName` in `src/lib/account/greeting.ts`,
  unit-tested).
- **Account deletion** calls `releaseBookingsOfDeletedAccount(userId)` before anything is
  anonymized, and now also clears `firstName`.
- **Data export** now has:
  - `trips`: the user's own bookings, in full
  - `bookingsOfMyPlaces`: bookings of their places, without the guest's name, phone or message
  - `firstName`, plus the pledge version and date

### About (brief 5.10)
- The page opens with the founder story (`/about#story`). Hebrew and English are word for word
  from the brief; Russian, Arabic and Georgian are translations.
- The signature stays a visible placeholder: `[השם שלכם]` / `[Your name]` / `[Ваше имя]` / `[اسمكم]`
  / `[თქვენი სახელი]`.
- The purple line sits next to the ב mark. No other company is named.
- The rest of the page now uses ds cards without shadows, and its text describes instant booking
  and paying the host on arrival. The audience section and the old placeholder note are gone.
- **"הסיפור שלנו"** is linked from the footer and the side menu.
- `SectionHeading` / `ContentSection` now use the round-2 sizes (`text-h2`, `py-section`), so
  How it works, Safety and the legal pages changed with them.

### Help and Terms (brief 5.11)
- **FAQ** (`prisma/seed/faq.ts`, idempotent by stable id, already seeded on the dev database):
  - New questions: how booking works and when you pay; cancellations and what happens if the host
    cancels; calendar sync for hosts.
  - Outdated answers were updated: bookings, payments, how you log in (Google or an email code),
    and walking times (only from verified places).
  - The "Contacting owners" category is now "הזמנות ויצירת קשר".
- **Terms** (`legal.json`, last updated 2026-11-02):
  - The old "we take no bookings" section is replaced by **"Bookings through Bayit"**: platform
    only, the stay agreement is between guest and host, no payments, instant booking, the 3
    cancellation presets, no-shows. It starts with a bold "draft for a lawyer" box.
  - New **"The welcome pledge"** section: the pledge, what a host may not do, and what we may do if
    a host breaks it.
  - Visible `<todo>` placeholders mark what the lawyer must write. The anchor changed from
    `#no-bookings` to `#bookings`, and nothing linked to the old one.

### Jewish life hub (brief 5.9)
- All the content is kept, in a calmer layout:
  - A title band replaces the big photo hero. It is purple in light mode, has no band in dark
    mode, and shows a small photo on desktop only.
  - **Sticky jump links** sit under the header: Shabbat times → calendar → community map →
    emergency numbers → guides (`jump-nav.tsx` and the small client `jump-nav-spy.tsx`). The
    menu's anchors still work.
  - The Shabbat countdown is a calm bordered card with ds chips; there are no flames or glow.
  - Hairlines separate the sections instead of tinted backgrounds.
  - The explore cards are three small photo tiles inside the map section.
- To keep phones short:
  - The month list shows only days with times or holidays, plus "show every day".
  - Upcoming holidays shows 4, with "N more" folded below.
  - The page went from 8,705 px to about 6,580 px tall at 390.
- `home-motion.tsx` and `HERO_SLIDES` were deleted.

### Community places (brief 5.9)
- **Schema:** `JewishPlace.verifiedAt DateTime?`, `verifiedById String?` (no relation, like
  `createdById`) and `source String?`.
  - `prisma/sql/before-push.sql` adds the columns idempotently.
  - It also removes walking times that real listings got from unverified, demo or hidden places.
  - A non-interactive push succeeded on a scratch database with old data. At this gate it was run
    again on the dev database: before-push, then push reported "already in sync".
- **Walking times:** `proximityPlaceWhere(listingIsDemo)` in `src/lib/nearby.ts`.
  - Real listings use only active, non-demo places that have a verification date.
  - Demo listings may also use demo places.
- **Admin → Content → Places:** the form has "תאריך הבדיקה" (date verified, with a "היום"
  button) and "מקור" (source, staff only). The list can be filtered to "real, not verified".
  - Demo places can't be verified.
  - Saving a place recomputes the listings within 5 km.

## Gate results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | passes (again after the gate fixes) |
| `npx eslint` on every changed and new file | no problems |
| `npm run i18n:check` | 42 namespaces × 5 languages, all keys match |
| `npx vitest run` | 81 files, 909 tests pass |
| Production build (`next build`) | passes |
| Full e2e (`playwright test`, 47 tests, desktop + mobile) | **47 passed** (10.5 min). After the jump-nav fix, the Jewish life e2e test was run again and passed. |
| Schema: before-push + `prisma db push` on the dev database | succeeds without prompts, "already in sync" |

- The posting test (`owner-admin.spec.ts`) walks the split form: 14 steps, with size, building
  and features left empty.
- `trust.spec.ts` now opens the preview by key (`?step=publish`), not by number.

## Fixes made at the gate
1. **Jump links highlighted the wrong chip.**
   - On desktop, tapping "Community map" marked "Calendar".
   - The spy used a fixed 130 px band, but the desktop header plus the jump nav are about 160 px
     tall.
   - `jump-nav-spy.tsx` now marks the last section whose top has passed a line under the sticky
     nav, or the point where a jump lands (its `scroll-margin-top`), whichever is lower. Both are
     measured on each scroll frame, so the line also follows the phone header when it hides.
     At the very bottom of the page, the last section counts.
   - Checked at 390 light and dark and at 1440: each of the 5 chips marks its own section, and the
     page bottom marks "Guides".
2. **The "לא חובה" tag wrapped onto two lines** next to longer labels (e.g. "חדרי רחצה").
   `fields.tsx` now keeps the tag on one line (`whitespace-nowrap`).
3. **The admin places list on phones cut every name to "בית כנסת לדוגמה — …"**, which hid
   "(דמו)". Names now wrap to two lines (`line-clamp-2`).

## Decisions (conservative choices, no answer needed now)
- **Help category:** no new "Bookings" FAQ category, because that needs an enum change that isn't
  in PLAN. The existing category was renamed "הזמנות ויצירת קשר" instead.
- **"שלום!" for a phone-only user:** a first name is required before any account page (PLAN,
  Login 5), so a phone-only user sees the one-field first-name step, never a number. "שלום!" is
  only the fallback.
- **Walking-time clean-up:**
  - On the next push, real listings lose walking times that came from places with no
    verification date.
  - A real place added before this phase counts again once an admin gives it a date. Saving the
    place recomputes the listings near it.
- **Compare and Support** left the tab bar but keep their URLs, so no redirects were needed.
- `category.houses` in `src/config/photos.ts` is no longer shown on any page. It was kept, because
  the photo sources and credits still list the file. It can go in phase 6 together with the file.

## For the next phase (open issues found at the gate)
- **Initials on demo accounts don't match:**
  - the header menu shows "DO" / "DG"
  - the account sidebar shows "DN"
  - Settings shows "DY"

  They come from the full "Demo …" name. Use the first name, like the greeting does.
- **The Help and legal page heroes** still use the round-1 soft gradient, and the help search
  field still has a shadow. Calm them down like About.
- **Account overview on desktop:** the "Needs your attention" card stretches to the trust-badges
  card's height, leaving empty space when nothing is waiting.
- **The Hebrew address-search placeholder** ("רחוב ומספר, למשל Chavchavadze Ave 12") is cut off in
  the 390 px field. Shorten it in all languages.
- **Without a CARTO key**, the dev-only "Map key missing" chip covers the zoom buttons in RTL.
  This doesn't happen on the real site.
- Phase 6 still owns the section-8 bugs other than 8.1 and 8.2, the speed work, and the final
  "Done when" check.

## Screenshots
`/tmp/p5shots/` (390×844 Hebrew light and dark, 1440×900 English):
- **Post form:** `wizard-{location,map,size,building,features,features-open,text,booking,pledge}-*`
- **Account:**
  - `account-{yossi,noa}-*`
  - `account-settings-yossi-*`
  - `account-phoneonly-*`: the first-name step
- **Content:** `about-*`, `help-*`, `terms-bookings-*`, `jewish-*` (including `-jump3`, after
  tapping "Community map")
- **Admin:** `admin-places-*`, `admin-place-new-*`
- **Other languages, first screens at 390:** `intl-{ar,ru,ka}-{about,jewish-life,help,legal-terms,account,post}`

No horizontal overflow and no clipped text were found. The only clipped text the script flagged
was screen-reader-only, plus the admin names fixed above.
