# Demo data

`npm run db:seed` fills a fresh database with the reference content the site needs and a
realistic set of **demo** content, so every page, filter, dashboard and admin screen can be tried
before real owners arrive. The seed is idempotent: run it as often as you like — rows are upserted
by stable ids, child rows are rebuilt, nothing is duplicated, and dates are moved so the demo
always looks current (listings published over the last 50 days, stats for the last 30 days).

Code: `prisma/seed/` (one small file per area, `index.ts` runs them in order),
`src/lib/demo.ts` (removal), `scripts/demo-remove.ts` (command line).

## What is seeded

### Real content (kept before launch)

| What | Details |
|---|---|
| Cities | The 10 cities of `src/config/site.ts` with names in 5 languages, search aliases, coordinates, airport, cover photo (`public/images/cities/*.webp`, credits in `public/images/CREDITS.md`) |
| Neighborhoods | 26 with names in 5 languages and approximate centers — Tbilisi: Vake, Saburtalo, Old Tbilisi, Sololaki, Vera, Mtatsminda, Vake-Bagebi, Didube, Isani, Avlabari; Batumi: Old Batumi, New Boulevard, Batumi Center, Makhinjauri, Gonio; Kutaisi: Center, Balakhvani; Gudauri: Center, New Gudauri; Bakuriani: Center, Didveli; a Center for Kobuleti, Borjomi, Kazbegi, Sighnaghi, Mestia |
| FAQ | 24 questions and answers in 5 languages, 4 in each help-center category |
| Banned words | 48 scam / contact-info / discriminatory phrases in 5 languages (most FLAG with a weight, a few BLOCK) |
| Saved replies | 3 support replies in 5 languages |
| Settings | Only "Show demo data" (`demoDataVisible = true`), created once so the switch exists; re-seeding keeps the admin's choice. Everything else stays on its default. |

Cities, neighborhoods and FAQ items are upserted: re-running the seed restores the seeded texts
of those rows (rows added by admins are not touched).

### Demo content (`isDemo`, removable)

| What | Details |
|---|---|
| Users | 4 staff, 6 owners, 1 guest (table below). E-mails `*@demo.bayit.example`, phones verified. |
| Jewish places | 13 clearly named sample points in Tbilisi, Batumi and Kutaisi ("Demo synagogue — Tbilisi (sample point)"), every place type. They are not real places. |
| Listings | 25 across Tbilisi, Batumi/Gonio, Kutaisi, Gudauri and Bakuriani: short stays, monthly rentals, 5 sales (incl. Batumi sea-view new-builds in white and black frame, one with a price-drop history), a hotel and a guesthouse with room types, a room in a shared flat, a villa for 10, ski chalets, sea views. Texts are written in the owner's language with all 5 translations (`isAuto` on the non-original ones, so "Auto-translated · Show original" shows). Photos are Unsplash stock photos (external URLs). Walking times, approximate map points, USD prices and search text are computed by the real site code. |
| Statuses | 19 LIVE (2 featured for 14 days). Owner Yossi also has one listing in each of IN_REVIEW (risk score 45), NEEDS_CHANGES ("photos_low_quality"), PAUSED, DRAFT (wizard step 4), EXPIRED and RENTED. |
| Activity | The guest's 5 favorites with notes; 30 days of views/contacts/saves and contact clicks for Yossi's listings; 2 open reports on one Batumi listing; 2 support tickets (an urgent open scam report with messages, a resolved verification question with a rating); 1 pending ID verification request (no files). |
| Scam alert | One active example, not a banner, titled "Demo: …" in every language. |

## Demo logins

Sign in at `/login` with the phone number. In development without Twilio, no SMS is sent: the
code is printed in the dev server log and shown on the login form ("Development mode — your code
is …").

| Who | Name | Phone | Notes |
|---|---|---|---|
| Admin | Demo Admin | `+995555000001` | Full admin panel |
| Moderator | Demo Moderator | `+995555000002` | Moderation queue, reports, users, verifications |
| Support | Demo Support | `+995555000003` | Tickets (assigned the two demo tickets) |
| Editor | Demo Editor | `+995555000004` | Content: cities, places, FAQ, alerts, banned words |
| Owner #1 | Demo Owner — Yossi | `+995555000011` | Hebrew, keeps Shabbat; 9 listings in every status, dashboard stats |
| Owner | Demo Owner — Natela | `+995555000012` | Georgian/Russian, ID verified; Kutaisi and Tbilisi |
| Owner | Demo Owner — Michael | `+995555000013` | English/Hebrew investor in Batumi; pending ID verification |
| Owner | Demo Owner — Rivka | `+995555000014` | Hebrew, keeps Shabbat; Gudauri and Bakuriani chalets |
| Business | Demo Hotel Batumi | `+995555000015` | Hotel with 3 room types, kosher certificate |
| Business | Demo Guesthouse Kutaisi | `+995555000016` | Guesthouse with 2 room types |
| Guest | Demo Guest — Noa | `+995555000021` | Favorites, the open scam-report ticket |

Staff must turn on 2-step login before they can open `/admin`: after signing in, follow the
prompt (or open `/two-factor/setup`), scan the QR code with an authenticator app and enter the
code. The seed does not store any authenticator secrets or passwords.

## Hiding demo data (one switch)

Admin → Settings → **Show demo data** (`demoDataVisible`). When it is off, public pages, search,
the map and the Jewish Life map show no demo listings or places; nothing is deleted, and turning
it on again brings them back. Turn it off before launch, or remove the data for good:

## Removing demo data permanently

- Admin → Settings → **Remove demo data** (calls `removeDemoData()` from `src/lib/demo.ts`), or
- on the command line:

```
npm run demo:remove            # shows what would be deleted
npm run demo:remove -- --yes   # deletes it
```

This deletes every demo user, listing and Jewish place (with their photos, translations, stats,
favorites, reports, tickets and verification requests) and the "Demo:" scam alert, and removes
demo listing ids from the featured-listings setting. Cities, neighborhoods, FAQ, banned words,
saved replies and settings stay. It cannot be undone — but `npm run db:seed` brings the demo
data back on a development database.

## Notes for developers

- Seed scripts run as CommonJS under tsx; `prisma/seed/esm-interop.ts` lets them load ES-module
  only packages (such as `@hebcal/core`). Import it first in any new tsx script that uses
  `@/lib/settings` or other server modules.
- The listing photos were checked by eye and all return HTTP 200. Each photo is used by one
  listing only; hotel room types reuse their own listing's photos. If Unsplash ever removes one,
  replace its id in `prisma/seed/listings/photos.ts`.
- `src/lib/demo.test.ts` checks the seed data: 5 languages everywhere, description lengths, no
  contact details or scam phrases in listing texts, valid phone numbers, unique photos.
