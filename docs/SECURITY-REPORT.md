# Security report — Phase 1 (2026-10-31)

This is the pre-launch security review the brief asks for (section 11, last point). It covers the
whole code: every server action, every `/api` route, the login system, uploads, private documents,
public pages and the production server's settings. It was done in two passes on the same day: a
first review, then a final hardening pass that re-checked everything and looked for what the first
pass missed.

## Summary

**The site is in good shape for launch, once the hosting settings below are done.**

- Every change to data checks who is signed in and that they own what they change. Admin actions
  also check the staff role and are written to the audit log. Only admins can change roles.
- Public pages never show exact addresses, map points, cadastral codes, contact details (until a
  signed-in visitor taps "Show contact"), emails or phone numbers of other users, documents or
  risk scores. We checked the real page HTML and page data, signed out and signed in.
- ID and ownership documents are encrypted, only verification staff can open them, and they are
  deleted as soon as a decision is made.
- The two passes fixed **10 problems** (4 high, 4 medium, 2 low). None of them was being used
  against the site.
- What is still **open** is mostly setup outside the code (CAPTCHA keys, backups, error alerts,
  Cloudflare), two optional anti-scam services, a malware scanner, a lawyer review and a
  professional test before launch. See "Open items".

## What is protected (brief section 11)

| Brief requirement | Status | How |
|---|---|---|
| HTTPS and secure headers (CSP, HSTS) | Done | Every response has HSTS (2 years, preload), `nosniff`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy. Pages have a CSP with a new random key per request, so only our own scripts run, and the site cannot be framed. HTTPS itself comes from the host (Vercel/Cloudflare). |
| OWASP Top 10 (SQL injection, XSS, CSRF…) | Done | Database access goes through Prisma (no hand-built SQL with user text). React escapes all user text. No user HTML is ever shown; guide articles use a small safe Markdown subset (only `https` links); emails escape every value; search-engine data cannot break out of its script tag. Forms and uploads refuse requests from other websites (CSRF). Links after login (`?next=`) only go to our own pages. Calendar import cannot reach internal addresses (checked again after each redirect, 10 s, 2 MB). File paths cannot escape the storage folder. |
| Strong passwords or password-free login | Done | Password-free: Google, Apple or a phone code. Unused password and email endpoints of the login library are switched off. |
| 2-step login for everyone, required for admins | Done | Anyone can turn on an authenticator app. Staff cannot open the admin panel or run admin actions without it. The development shortcut (`DEV_SKIP_STAFF_2FA`) is ignored in production. Codes cannot be reused and are limited to 5 tries per 10 minutes. |
| Users only see and change their own data | Done | Checked in code on every action and route (listings, photos, room types, translations, calendars, favorites and notes, tickets and their files, verification requests, account settings). Users cannot set status, role, risk score, demo flag or paid placement. Staff pages and actions each check their own permission. |
| Rate limits and invisible CAPTCHA | Mostly done (CAPTCHA needs keys) | Rate limits on login codes, posting, uploads, "Show contact", emails to owners, reports, tickets, the contact form, search and more. Turnstile protects login codes, new tickets, the contact form and "email the owner". It is skipped until the keys are set. Not yet on "Show contact" and publishing (see open items). |
| SMS-pumping protection | Done | Codes go only to the countries in `src/config/site.ts`, at most 5 per phone and 20 per network address per hour, behind the CAPTCHA. Turn on Twilio Fraud Guard too (README step 5). |
| Uploads: type, size, re-encode, hidden data, malware | Mostly done | Real file type is read from the content (the file name is ignored). Size limits (also for uploads that do not declare their size) and pixel limits. Every image is re-drawn (EXIF/GPS removed). SVG and other types are refused. PDFs (documents only) are checked for scripts and embedded files. A malware-scanner connection exists but is off (see open items). |
| ID and ownership documents | Done | Encrypted (AES-256-GCM) in private storage, never reachable by a public link. Only staff with the "verifications" permission can open them, with 2-step login. Deleted when approved or rejected (a daily job retries if storage fails). The account keeps only "verified on [date] by [staff member]". |
| Secrets in environment variables | Done | No secrets in the code or the browser files (checked in the production build). `.env` is not in git. |
| Daily backups, error monitoring, Cloudflare | Open (monitoring code ready) | Hosting setup, see open items. Server errors go to Sentry once `SENTRY_DSN` is set. |
| Privacy: cookie consent, policy, download data, delete account | Done | Cookie banner; privacy, cookie and terms pages; "Download my data" (a JSON file); "Delete my account" signs out everywhere, deletes documents, ticket files and certificate photos, hides listings and removes personal details, including the exact address. Banned or suspended users are signed out and cannot sign in. |
| Fair housing | Done | No field limits who may rent or buy. The only related option is the brief's shared-room choice (men, women or families). |
| Code review with a short report | Done | This document. |

## What was fixed

### In the final pass

1. **The exact address could be worked out from the map point (high).** The map shows a point
   moved a few hundred metres from the real place. The amount it was moved was calculated only
   from the listing's internal number, which is visible in the page, with a formula that is part
   of the map code sent to every browser. Anyone could have undone the move. Now the move also
   depends on a secret key that only the server has (`HASH_SALT`). Before launch there are only
   demo listings, so nothing else needs to be done.
   *Files: `src/lib/listing/lifecycle.ts` (`publicMapPoint`), `src/lib/wizard/actions.ts`,
   `src/lib/geo.ts`, test in `src/lib/listing/lifecycle.test.ts`.*
2. **Translations of live listings skipped the scam checks (high).** The first pass made risky
   edits of the title and description re-run the checks at once. The same text could still be
   added through the "other languages" step, which went public without a check. Now a
   translation with scam phrases or hidden phone numbers or links runs the checks straight away.
   *File: `src/lib/wizard/actions.ts`.*
3. **Copied photos could be added to a live listing (medium).** New photos on a live listing went
   public at once, and the "same photos as another account" check only ran when the owner pressed
   "Save changes". Now every new photo on a live listing is compared right away; a match runs
   the checks (the listing goes to a person).
   *Files: `src/lib/risk/index.ts` (`isPhotoOfOtherAccount`), `src/app/api/uploads/listing-photo/route.ts`, test.*
4. **Upload size limit could be skipped (medium).** A signed-in user could send a file without
   saying its size and make the server hold a huge file in memory. Now the limit is enforced
   while the file is read.
   *Files: `src/app/api/uploads/shared.ts` and the three upload routes.*
5. **"Delete my account" kept some private listing data (medium, privacy).** The hidden listings
   kept the exact address, map point, cadastral code, calendar links and the kosher-certificate
   photo. Now these are cleared and the certificate photo is deleted.
   *File: `src/lib/account/delete-account.ts`.*

### In the first pass

6. **Login library shortcuts (high).** Unused built-in endpoints let a signed-in user change their
   name and photo address directly, or add a password (a second way in, without the code limits
   and CAPTCHA). They now answer "not found". *File: `src/lib/auth/server.ts`.*
7. **Edits to live listings skipped the scam checks (high).** Risky auto-saved edits (new contact
   methods, scam phrases, hidden contact details) now run the checks at once.
   *File: `src/lib/wizard/actions.ts`.*
8. **Uploads from other websites (medium).** Photo, document and profile-photo uploads refuse
   requests from another website's page (CSRF). *Files: `src/lib/same-origin.ts`, upload routes.*
9. **Image resizer open to other people's buckets (low).** It now accepts only our own bucket when
   `NEXT_PUBLIC_MEDIA_BASE_URL` is set. *File: `next.config.ts`.*
10. **Oversized private uploads were read before being refused (low).**
    *File: `src/app/api/uploads/private/route.ts`.*

## Open items

| Severity | Item | What to do |
|---|---|---|
| **High** (before launch) | **Production settings.** Without them, protections quietly switch off. Turnstile: no CAPTCHA. `CRON_SECRET`: the scheduled jobs refuse to run, so listings never expire and documents are not cleaned up. | Set every variable from `.env.example`: `TURNSTILE_*`, `CRON_SECRET`, `APP_ENCRYPTION_KEY`, `HASH_SALT`, `BETTER_AUTH_SECRET`, Twilio with Fraud Guard and only the countries you need. Keep `DEV_SKIP_STAFF_2FA` unset. Never run the development server (`npm run dev`) on a public address, because it shows login codes. |
| **High** (before launch) | **Independent test.** This review was done by the team that built the site. | Book a short penetration test (2–3 days) by an outside firm before going public. Fix what it finds. |
| **Medium** | **Paused, expired, rented or sold listings** can be edited and then put back online (unpause/renew) without a new check. Price changes on live listings are not re-checked at once either. (Text, translations, contact details and copied photos on live listings now are.) | Add a "last checked" date to listings. Run the checks again on unpause/renew when the content changed after that date, and on big price drops. |
| **Medium** | **No CAPTCHA on "Show contact" and publishing.** The brief asks for it. Today these need a signed-in account (login has the CAPTCHA), a verified phone for publishing, and rate limits (30 contact reveals an hour per account, 200 a day per listing). | Add the invisible Turnstile check to "Show contact" and "Publish" before launch, or as soon as bots show up. |
| **Medium** | **Malware scanner not configured.** Images are re-drawn, which removes hidden content. PDFs only get a structure check. | Run a ClamAV service (or a cloud scanner) and set `MALWARE_SCAN_URL`. The upload code already calls it and refuses files when it cannot answer. |
| **Medium** | **Two anti-scam checks are off:** "photos found elsewhere online" (reverse-image search) and "phone numbers written inside photos" (text recognition). Duplicate photos on our own site are detected. | Connect a reverse-image service (e.g. Google Vision Web Detection or TinEye) and text recognition. The hooks `riskHooks.reverseImageSearch` and `riskHooks.photoOcr` in `src/lib/risk/index.ts` are ready. |
| **Medium** | **Backups.** | Turn on daily backups with point-in-time restore (Supabase/Neon) and object versioning on the R2 buckets. Test one restore before launch. |
| **Medium** | **Error monitoring.** The code now sends server errors (page crashes, failed actions, failed scheduled jobs) to Sentry, without user data, but only once `SENTRY_DSN` is set. Errors in the visitor's browser are not collected yet. | Create a Sentry project and set `SENTRY_DSN`. Add browser error collection later if needed. |
| **Medium** | **Cloudflare / attack protection.** | Put the domain behind Cloudflare with the WAF and bot protection on. If the site is **not** on Vercel, set `CLIENT_IP_HEADER="cf-connecting-ip"`. Otherwise the per-address limits can be dodged by faking a header. |
| **Medium** | **Legal review.** | A lawyer should review the privacy, cookie and terms pages for Israel, GDPR/UK and Georgia, and the shared-room options (men, women, families) for each new country. |
| Low | A listing is hidden automatically after several reports, so a group of fake accounts could hide a competitor's listing. Moderators can restore it. | Count only reports from accounts with a verified phone, or from different devices. |
| Low | Photos of deleted listings stay reachable by their (unguessable) link. Files uploaded but never sent (e.g. an ID photo for a request the user abandoned) stay encrypted in storage. | Add a cleanup job that removes both after 30 days. |
| Low | Between the phone code and the 2-step code, a session can already use a few login-library account functions (sign out other devices, connect or disconnect Google). It cannot open the admin panel or any private data. | Fine for launch. Later: block these until the 2-step code is entered. |
| Low | Every page sends the browser all interface texts, including the admin panel's wording (no user data). Pages are also heavier than needed. | Send only the public text groups to the browser (layout owner). |
| Low | `npm audit --omit=dev` finds 9 issues (2 critical) in developer tools only: the test runner (vitest/tinypool), the shadcn command-line tool and its code generator (deepmerge, minimatch). None of them runs on the live site. The fixes are major upgrades or lockfile changes, so they were not applied during this pass. | In a maintenance pass: upgrade vitest to 5.x, move `shadcn` to devDependencies, then run `npm audit fix`. |
| Low | If the database is briefly unreachable, rate limits let requests through, so the site stays up. | Fine for launch. With heavy traffic, move rate limits to Redis (Upstash). |
| Info | The language cookie (`NEXT_LOCALE`) is readable by page scripts; it only holds the language. Styles may be inline (a library needs this); scripts are locked to our own key. | No action. |

## How this was checked

- Read every server action (25 files) and every `/api` route (15). Checked sign-in, ownership,
  input validation, rate limits, audit logging and which fields users can set. Searched for raw
  SQL, HTML injection points, redirects, outgoing requests that use user input, and code that
  ships to the browser.
- On the production build (port 3602):
  - Security headers are on pages and API answers; the device cookie is `Secure` and `HttpOnly`.
  - `/api/dev/*` answers 404. Every cron job refuses a missing or wrong secret and the `?secret=`
    shortcut, and accepts the right one.
  - Path tricks on `/api/media` answer 404. Signed-out requests to private routes answer 401.
    Cross-site uploads answer 403. Disabled login endpoints answer 404. Login codes for
    countries outside the list are refused.
  - The listing, owner, search, map and home pages had no exact address, map point, contact
    value, email, phone, cadastral code, calendar token or risk data.
- On a development server, signed in as the demo guest: the login library's session answer holds
  only the user's own basic fields; the same pages had no private data; a normal upload works;
  oversized uploads with and without a declared size are refused (413). Test files and the test
  session were removed afterwards.
- `npx tsc --noEmit`, `npx eslint .`, `npm run i18n:check` and `npx vitest run` (49 files,
  637 tests) pass.
