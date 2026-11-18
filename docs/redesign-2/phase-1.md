# Round 2, phase 1: brand and design system

Phase 1 of `docs/redesign-2/BRIEF.md` (sections 3 and 12.1), following `docs/redesign-2/PLAN.md`.

## What changed

**Brand**
- **Colors.** The site is now purple and white in light mode, and purple and black in dark mode.
  - Every token from brief 3.2 lives in `src/app/styles/bayit.css`, which `globals.css` and
    `sections.css` share.
  - Old color names (navy, coral, terracotta, wine, verified, warning) still compile, but now point
    to the purple palette. New code uses the new names, listed in `docs/CONVENTIONS.md`.
  - A script swept about 120 files to the new names.
  - No coral, navy, orange or brown is left. Green is used only for "verified", success messages
    and the WhatsApp button. Red is used only for errors and safety alerts.
- **Theme.** It follows the phone's setting by default. The light/dark/device switch stays in the
  menu.
- **Type.** Rubik (400/500/600) is used everywhere, with Noto Sans Georgian for Georgian.
  - Each language page preloads only its own script's font file. For example, the Arabic font
    payload dropped from 211 KB to 80 KB.
  - The type scale (`text-display`, `text-h1`… `text-caption`, `text-price`) has the brief's sizes.
- **Shapes.** Corners are 16px on cards, 12px on inputs, 14px on buttons, and full pills on chips.
  - Main buttons are 48px tall and secondary buttons 40px.
  - Cards have a 1px border and no shadow. Only the floating search card and bottom sheets have a
    shadow.
- **Motion.** The staggered fade-in on every section is gone (`<Reveal>` now does nothing). Bottom
  sheets slide in 250ms. Skeletons, the photo fade-in and the heart pop stay.

**Logo, icons and share images**
- **Logo.** The new ב logo (`src/components/brand/logo.tsx`) is in the header, menu, footer, error
  pages, admin, emails and share images.
  - It reads "בית" on Hebrew pages and "Bayit" in every other language.
  - It is white on purple and dark backgrounds, and purple on white.
  - The old logo files are deleted.
- **Favicon and app icons.** These are generated from the brief's SVGs by
  `scripts/generate-icons.mjs` (it uses sharp, which was already installed).
  - `favicon.ico` holds 16, 32 and 48 px images. There is also an SVG icon and a 180px Apple icon.
  - The app icons are 192 and 512 px, with maskable 192/512 versions from the full-square SVG.
  - The manifest is named "Bayit · בית". The browser bar color is `#4B2A8C` in light mode and
    `#0F0D14` in dark mode.
- **Share images.** These use the framework's built-in generator at 1200×630.
  - Default image: purple, with the white mark, the name and the tagline in the page's language.
  - Listing image: the first photo above a purple bar with the title, the price and the logo. It
    is a JPEG of about 85 KB, so WhatsApp shows the preview.
- **Emails.** They now have a purple top band, the white mark, purple buttons and near-black
  headings.

**Components** (`src/components/ds`, `src/components/ui`, `src/components/layout`)
- **Restyled:** Button, Chip, Tag (new), Card (new), Badges, Sheet, Skeleton, EmptyState, Accordion,
  Calendar, inputs and tabs.
  - Inputs are 44px tall with 16px text, so iPhones don't zoom in.
  - The calendar shows the selected range in purple, booked days crossed out and past days faded.
- **Header.** 56px tall on phones: purple in light mode, near-black in dark mode. It has a white
  logo, an "HE" language pill that opens a short language sheet, and the menu button.
- **Bottom nav.** The active item is purple. The "+" is a raised purple circle with a white
  border. Page content now ends above the bar (bug 8.7).
- **Side menu.** Icons are grey, the current page is purple, and long Georgian and Russian labels
  wrap.
- **`/dev/ui`.** It shows every token in both themes, the type scale, every logo variant and every
  restyled component. It is available in all 5 languages.

## Integration check (this gate)

All green:
- `npx tsc --noEmit`
- `npx eslint .`
- `npm run i18n:check` (40 namespaces × 5 languages)
- `npx vitest run` (72 files, 810 tests)
- `next build`

The screenshots were checked at 390×844 in Hebrew (light and dark) and 1440×900 in English. The
pages were `/dev/ui`, home, search (Tbilisi), a listing, Jewish life and login, plus:
- the side menu and language sheet in he/ka/ru
- the signed-in header and account page
- every icon size, including the maskable safe zone
- the share images in all 5 languages, and the listing share image in he/en/ar

Small fixes made at the gate:
- **`eslint .` failed** on `scripts/server-script.cjs`, a CommonJS preload that has to use
  `require()`. That rule is now switched off for this one file.
- **Buttons on the login page** were full pills. They now have the 14px button corners.
- **Desktop header "Log in"** was a white pill with a dark outline next to the white "Post a
  listing" button. It is now a white-outline button with white text, so "Post a listing" is the
  one main action.
- **Green used for things that aren't "verified":**
  - The color sweep had turned round 1's "verified" color into green in places that are not about
    verification. These now use purple:
    - the pledge strip on the Jewish life page
    - the home pledge section
    - the "Shabbat-friendly" chip and the ✓ marks in the listing's Shabbat list
    - the yes/discount facts
    - the "now" holiday tag
    - the "how it works" step
    - the calendar legend
    - the solid green "price dropped" tag on cards
    - the default ✓ in check lists
    - the check badge in the login illustration
  - Green stays only for verified badges (phone, ID, owner, property, business, kosher
    supervision, lawyer-reviewed guides) and for success messages.
- **A stray `home/shots/` folder** of screenshots in the repo root (left by a screenshot script)
  was moved out of the repo.

## What to check on your phone

1. **Header and bottom nav, light and dark.** Switch your phone between light and dark mode. The
   site should follow it.
   - The header should be purple with a white ב and "בית" in light mode, and near-black in dark
     mode.
   - The "+" in the bottom nav should sit above the bar.
2. **Home.** The whole search card should be visible on first load, with the "חיפוש" button
   above the bottom nav.
3. **The "HE" pill.** It should open a short sheet with the five languages. Try Georgian and
   Russian, and check that the menu labels wrap instead of being cut off.
4. **App icon.** In Safari, choose Share → Add to Home Screen. The icon should be the white ב on
   purple. The browser bar should be purple in light mode and black in dark mode.
5. **Link previews.** Send yourself a WhatsApp link to the home page and to a listing.
   - The home page preview should be purple with "בית" and the tagline.
   - The listing preview should show the photo with the purple bar.
6. **Emails.** Look at a login or notification email in Admin → Email outbox: there should be a
   purple band with the white mark.
7. **`/he/dev/ui`.** This is one page with every color, text size and component, in both themes.

## Open issues (by phase)

**Phase 2: home, cards, search**
- **Home hero.**
  - It is still the round-1 photo with a slow zoom (`src/components/home/home-motion.tsx`).
  - The brief's purple band with rounded bottom corners, and the search card overlapping it by
    48px, are not built yet.
- **Shabbat countdown.** It still has yellow candle flames (an illustration). It comes off the home
  page in phase 2 and gets folded away on the listing page in phase 3.
- **Georgian at 360px.** The home search card does not fully fit on first load, and the "Where?"
  and "When?" placeholders are cut short.
- **Cards** still show 2 tags plus a "+N" counter in the tag row, and up to 2 more tags on the
  photo. The "מקבלים ישראלים בברכה" welcome tag still appears on cards. The brief wants at most 2
  small tags in total and no welcome badge.

**Phase 3: listing page**
- **Shabbat checklist (bug 8.8).** "No" items are still struck through, and some read as double
  negatives.
- **Tradition card.** It still has a solid purple header block and the big Shabbat card. It gets
  folded in phase 3.

**Phase 5: other pages**
- **Jewish life hub.** The emergency number (112) card is red. This was kept on purpose, because
  it is a safety alert. The same applies to the scam-alert banners.
- **Post form.** The wizard's pledge step still uses green (15 places). The wizard is restyled
  then.

**Phase 6: finish**
- **Currency defaults (bug 8.5, section 6).**
  - Russian pages still default to USD, where PLAN says ILS.
  - Georgian pages still default to USD, where PLAN says GEL.
  - Hebrew already defaults to ILS.
- **Desktop header height.** `--header-height` on desktop is still 6.75rem. Update it if the
  desktop header changes.

**Not a bug: Arabic share images** show "Bayit" with the English tagline. The image generator
crashes on Arabic letters, so Arabic text is left out of share images.
