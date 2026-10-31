# Security report — Phase 1 (2026-10-31)

This is the pre-launch security review the brief asks for (section 11, last point). It covers the
whole code: every server action, every `/api` route, the login system, uploads, private documents,
public pages and the production server's settings.

## Summary

**The site is in good shape for launch, once the hosting settings below are done.**

- Every change to data checks who is signed in and that they own what they change. Admin actions
  also check the staff role and are written to the audit log.
- Public pages never show exact addresses, map points, cadastral codes, contact details (until a
  signed-in visitor taps "Show contact"), emails or phone numbers of other users, documents or
  risk scores. We checked the real page HTML, not only the code.
- ID and ownership documents are encrypted, only verification staff can open them, and they are
  deleted as soon as a decision is made.
- This review fixed **5 problems** (2 high, 1 medium, 2 low). None of them was being used against
  the site.
- What is still **open** is mostly setup outside the code (CAPTCHA keys, backups, error alerts,
  Cloudflare), two optional anti-scam services, a lawyer review and a professional test before
  launch. See "Open items".

## What is protected (brief section 11)

| Brief requirement | Status | How |
|---|---|---|
| HTTPS and secure headers (CSP, HSTS) | Done | Every response has HSTS (2 years, preload), `nosniff`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy. Pages have a CSP with a new random key per request, so only our own scripts run, and the site cannot be framed. HTTPS itself comes from the host (Vercel/Cloudflare). |
| OWASP Top 10 (SQL injection, XSS, CSRF…) | Done | Database access goes through Prisma (no hand-built SQL). React escapes all user text. No user HTML is ever shown; guide articles use a small safe Markdown subset; emails escape every value; search-engine data cannot break out of its script tag. Forms are protected against requests from other sites (CSRF). Links after login (`?next=`) only go to our own pages. Calendar import cannot reach internal addresses. File paths cannot escape the storage folder. |
| Strong passwords or password-free login | Done | Password-free: Google, Apple or a phone code. Unused password and email endpoints of the login library are switched off. |
| 2-step login for everyone, required for admins | Done | Anyone can turn on an authenticator app. Staff cannot open the admin panel without it. The development shortcut (`DEV_SKIP_STAFF_2FA`) is ignored in production. Codes cannot be reused and are limited to 5 tries per 10 minutes. |
| Users only see and change their own data | Done | Checked in code on every action and route (listings, photos, room types, calendars, favorites and notes, tickets and their files, verification requests, account settings). Staff pages and actions each check their own permission; only admins change roles. |
| Rate limits and invisible CAPTCHA | Done (CAPTCHA needs keys) | Rate limits on login codes, posting, uploads, "Show contact", emails to owners, reports, tickets, the contact form, search and more. Turnstile protects login codes, new tickets, the contact form and "email the owner". It is skipped until the keys are set (see open items). |
| SMS-pumping protection | Done | Codes go only to the countries in `src/config/site.ts`, at most 5 per phone and 20 per network address per hour, behind the CAPTCHA. Turn on Twilio Fraud Guard too (README step 5). |
| Uploads: type, size, re-encode, hidden data, malware | Mostly done | Real file type is read from the content (the file name is ignored). Size and pixel limits. Every image is re-drawn (EXIF/GPS removed). SVG and other types are refused. PDFs (documents only) are checked for scripts and embedded files. A malware-scanner connection exists but is off (see open items). |
| ID and ownership documents | Done | Encrypted (AES-256-GCM) in private storage, never reachable by a public link. Only staff with the "verifications" permission can open them, with 2-step login. Deleted when approved or rejected (a daily job retries if storage fails). The account keeps only "verified on [date] by [staff member]". |
| Secrets in environment variables | Done | No secrets in the code or the browser files (checked in the production build). `.env` is not in git. |
| Daily backups, error monitoring, Cloudflare | Open | Hosting setup, see open items. |
| Privacy: cookie consent, policy, download data, delete account | Done | Cookie banner; privacy, cookie and terms pages; "Download my data" (a JSON file); "Delete my account" signs out everywhere, deletes documents and ticket files, hides listings and removes personal details. Banned or suspended users are signed out and cannot sign in. |
| Fair housing | Done | No field limits who may rent or buy. The only related option is the brief's shared-room choice (men, women or families). |
| Code review with a short report | Done | This document. |

## What was fixed in this review

1. **Login library shortcuts (high).** The login library has built-in endpoints we never use.
   One of them let any signed-in user change their own display name and profile-photo address
   directly, skipping our checks. A photo address pointing to someone else's server would have
   shown visitors' network addresses to that server on every listing page. The password
   endpoints could add a password to an account: a second way to log in that skipped the
   login-code limits and CAPTCHA. All unused endpoints now answer "not found".
   *File: `src/lib/auth/server.ts`.*
2. **Edits to live listings skipped the scam checks (high).** Edits are saved automatically. On a
   live listing they went public at once, and the automatic checks only ran when the owner
   pressed "Save changes", so a scammer could simply not press it. Now a risky edit is checked
   straight away: new contact methods, or a title or description with scam phrases or hidden
   phone numbers or links. Normal edits work as before.
   *File: `src/lib/wizard/actions.ts`.*
3. **Uploads from other websites (medium).** Photo, document and profile-photo uploads now refuse
   requests that come from another website's page (CSRF). Before, only the browser's cookie
   rules protected them.
   *Files: new `src/lib/same-origin.ts` (with tests), `src/app/api/uploads/shared.ts`,
   `src/app/api/uploads/listing-photo/route.ts`, `src/app/api/uploads/private/route.ts`,
   `src/app/api/account/avatar/route.ts`.*
4. **Image resizer open to other people's buckets (low).** The built-in image resizer accepted
   images from anyone's Cloudflare R2 or Supabase bucket, so it could be used as a free image
   proxy at our cost. When `NEXT_PUBLIC_MEDIA_BASE_URL` is set, it now accepts only our own
   bucket. This also makes resizing work with a custom media domain.
   *File: `next.config.ts`.*
5. **Oversized private uploads were read before being refused (low).** The size limit is now
   checked first. *File: `src/app/api/uploads/private/route.ts`.*

## Open items

| Severity | Item | What to do |
|---|---|---|
| **High** (before launch) | **Production settings.** Without them, protections quietly switch off. Turnstile: no CAPTCHA. `CRON_SECRET`: the scheduled jobs refuse to run, so listings never expire and documents are not cleaned up. | Set every variable from `.env.example`: `TURNSTILE_*`, `CRON_SECRET`, `APP_ENCRYPTION_KEY`, `HASH_SALT`, `BETTER_AUTH_SECRET`, Twilio with Fraud Guard and only the countries you need. Keep `DEV_SKIP_STAFF_2FA` unset. Never run the development server (`npm run dev`) on a public address, because it shows login codes. |
| **High** (before launch) | **Independent test.** This review was done by the team that built the site. | Book a short penetration test (2–3 days) by an outside firm before going public. Fix what it finds. |
| **Medium** | **Paused, expired, rented or sold listings** can be edited and then put back online (unpause/renew) without a new check. The same goes for price changes on live listings. | Add a "last checked" date to listings. Run the automatic checks again on unpause/renew when the content changed after that date. |
| **Medium** | **Malware scanner not configured.** Images are re-drawn, which removes hidden content. PDFs only get a structure check. | Run a ClamAV service (or a cloud scanner) and set `MALWARE_SCAN_URL`. The upload code already calls it and refuses files when it cannot answer. |
| **Medium** | **Two anti-scam checks are off:** "photos found elsewhere online" (reverse-image search) and "phone numbers written inside photos" (text recognition). Duplicate photos on our own site are already detected. | Connect a reverse-image service (e.g. Google Vision Web Detection or TinEye) and text recognition. The hooks `riskHooks.reverseImageSearch` and `riskHooks.photoOcr` in `src/lib/risk/index.ts` are ready. |
| **Medium** | **Backups.** | Turn on daily backups with point-in-time restore (Supabase/Neon) and object versioning on the R2 buckets. Test one restore before launch. |
| **Medium** | **Error monitoring.** No Sentry (or similar) is installed. The security policy already allows it. | Add Sentry so crashes and attacks show up. |
| **Medium** | **Cloudflare / attack protection.** | Put the domain behind Cloudflare with the WAF and bot protection on. If the site is **not** on Vercel, set `CLIENT_IP_HEADER="cf-connecting-ip"`. Otherwise the per-address limits can be dodged by faking a header. |
| **Medium** | **Legal review.** | A lawyer should review the privacy, cookie and terms pages for Israel, GDPR/UK and Georgia, and the shared-room options (men, women, families) for each new country. |
| Low | CAPTCHA is not on "Show contact", reports or publishing. These need sign-in (which has the CAPTCHA), a verified phone for publishing, and rate limits. | Add Turnstile there if bots show up. |
| Low | A listing is hidden automatically after several reports, so a group of fake accounts could hide a competitor's listing. Moderators can restore it. | Count only reports from accounts with a verified phone, or from different devices. |
| Low | Every page sends the browser all interface texts, including the admin panel's wording (no user data). Pages are also heavier than needed. | Send only the public text groups to the browser (layout owner). |
| Low | `npm audit` finds 9 issues (2 critical) in developer tools only: the test runner (vitest/tinypool) and the shadcn command-line tool. They do not run on the live site. The fixes are major-version upgrades. | In a maintenance pass, upgrade vitest to 5.x and move `shadcn` to devDependencies. |
| Low | If the database is briefly unreachable, rate limits let requests through, so the site stays up. | Fine for launch. With heavy traffic, move rate limits to Redis (Upstash). |
| Info | Styles may be inline (a library needs this). Scripts are locked to our own key. | No action. |

## How this was checked

- Read every server action (25 files) and every `/api` route (15). Checked sign-in, ownership,
  input validation, rate limits and audit logging. Searched for raw SQL, HTML injection points,
  redirects and outgoing requests that use user input.
- On a running server, signed in as a demo guest:
  - The listing, owner, search, map and home pages had no exact address, map point, contact
    value, email, phone, cadastral code or risk data.
  - The login library's session answer holds only the user's own basic fields.
  - Cross-site uploads are refused, and the disabled endpoints answer 404.
- On the production build:
  - The security headers are on pages and API answers.
  - `/api/dev/*` answers 404, and every cron job refuses a missing or wrong secret (and the
    `?secret=` shortcut).
  - Path tricks on `/api/media` answer 404.
  - Signed-out requests to private routes answer 401.
  - No secret appears in the browser files.
- `npx tsc --noEmit`, `npm run i18n:check` and `npx vitest run` (49 files, 636 tests) pass.
  `npx eslint` is clean for all changed files.
