# Bayit: security and launch report

**Date:** 7 November 2026 · **Branch:** `round-3` · **Commit audited:** `ec27439` (HEAD)
**Status of this file:** audit done. **You gave your OK on 8 November 2026** ("OK to all", with the changes below). Fixing follows the plan in section 7. **Fixing round S1 (8 November 2026):** sections 2–11 plus your decisions 1–3, 5 and 7–9. **Review of S1 (9 November 2026):** six reviewers tried to break it (81 findings, 72 confirmed), three fixers fixed them, and the gate re-ran every check, the full end-to-end suite on the production build and the start-up probes. Rows the review confirmed, or whose findings were fixed and proven, now say **OK** with the file, the test or the probe; rows with something still open say **Partial** and why.

## Your decisions (8 November 2026)

"OK to all" recommendations in section 5, with these changes. They override section 5 and 6 where they differ.

1. **Environments: our own `SITE_ENV` setting** (`development` / `staging` / `production`), never `NODE_ENV`. The server refuses to start if `SITE_ENV` is missing. Test mode (codes on screen) is allowed only when `SITE_ENV` is `development` or `staging`; with `production` the server refuses to start if test mode is on. A password-protected staging site on Netlify (next brief) builds with `NODE_ENV=production` and uses test mode behind its password. Demo logins, demo accounts and demo listings are off when `SITE_ENV=production`.
2. **Walking times rounded to 5 minutes; under 5 minutes shows "עד 5 דק׳"** (not "≈ 5 דק׳"), so it stays true. Distances in whole km.
3. **Login codes stay valid for 10 minutes** (not 5): hashed, single use, dead after 5 wrong tries.
4. **Repository:** you are making it private yourself now. **GitHub Pro ($4 a month) before launch**, for branch protection. Scan the whole Git history with gitleaks and **list every key that was ever committed** so you can change it. **Done 8 November 2026: no real key was ever committed, so nothing needs changing** (evidence in 2.4.f).
5. **Admin 2-step lockout:** after 20 wrong tries in a day, an email code **only resets the counter**. Logging in still needs the authenticator code or a recovery code.
6. **Monitoring:** free Sentry with personal-data scrubbing on and the **EU data region** if offered; a free uptime monitor. **Second backup:** tell you the provider and the monthly price **before** signing up.
7. **Guest flags:** admin review only, no automatic action. **Never count** cancellations with the reason "my flight was cancelled", or cancellations inside a travel-disruption window (both come in your next brief).
8. **Booking cap:** at most **2 upcoming bookings per verified phone, across all accounts** (replaces "3 for a new account").
9. **Guest contact details on finished bookings are deleted 3 months after checkout** (not 12), keeping anonymous stats.

### Addendum: your answers of 8 November 2026 (afternoon)

They override everything above where they differ. (b) to (e) are built and proven (9 November); (a) needs your account set-up and a backup job we still have to build.

- **(a) Second backup: Backblaze B2** (EU Central region, its own account with 2-step login, a bucket with Object Lock), not a second Cloudflare R2 account. About **$0 a month** for the database alone, about **$0.35 a month** with 50 GB of photos. Your steps are in OWNER_TODO; the backup job itself is still to build (12.4.b).
- **(b) Walking times: "up to" for every value.** Rounded up to 5 minutes and shown as "עד 5 דק׳", "עד 10 דק׳", "עד 15 דק׳"…, never "≈", in all 5 languages (6.d). "Up to 10" is always true; "≈ 10" for a 6-minute walk is not.
- **(c) Phone numbers are ADMIN-only.** Support and moderators see only the last 2 digits ("••• ••• ••45"); searching by phone is ADMIN-only (4.3.a).
- **(d) Retention confirmed:** sent-email log 90 days, "show contact" records 90 days, admin action log 1 year. Remembered devices (1 year) only mean "don't send a new-device alert again" (and risk links). Nothing lets anyone skip the 2-step code on a remembered device: never for staff, and at most 30 days for hosts if it is ever added. The only skip today is the development shortcut for demo staff, which cannot run on a real site (`tests/unit/no-trusted-device.test.ts`).
- **(e) GIF refused; HEIC keeps working.** iPhones convert HEIC to JPEG by themselves when the site asks for JPEG; where a HEIC file still arrives, the browser converts it if it can (Safari), and otherwise the server converts it with **heic-decode** (you approved this library on 8 November). Every stored image has its GPS and all other metadata removed, proven with a HEIC photo carrying GPS (6.g, 9.a).

## How to read this

**In plain words:** the site is well built in many places. Every action checks who is asking. Uploads are cleaned properly. Private pages are never cached for other people. The public map point is moved away from the real home. But it is **not ready for real users yet.** The biggest gaps:

- the framework needs its security update;
- test mode and missing settings don't stop the server from starting;
- SMS codes can be sent to 20 countries, including premium-rate numbers;
- walking times give away a home's exact location;
- demo listings show on the real site by default;
- monitoring, the incident plan and `security.txt` don't exist yet.

Most fixes are small. A few need your OK first (section 5 of this report).

**Scope:** every item of your security and launch checklist (sections 1–21), against the code at HEAD, the local demo database (read-only) and the GitHub settings we could read.

**Method:**
1. **Code audit** in 7 groups: framework and packages, login, permissions, private data, input and uploads, platform, trust. Each finding cites a file and line at HEAD, a test or a command.
2. **Adversarial verification.** A second reviewer re-checked every P0 and P1 item marked OK and tried to break it. Several items moved from OK to "partial" or "needs fix". For example, the trip calendar file skips 2-step login, and phone codes are stored in plain text.
3. **Runtime probes** on a production build (`next build` + `next start`, with test mode on and off). They covered permissions, cache, uploads, SSRF, XSS, headers, fail-closed startup, rate limits, cookies, axe and broken links. The probes ran on the build of `49b2c67`, the commit just before the final speed pass. The speed pass (`49b2c67..ec27439`) changed only these: the Next config's chunking, error pages, the icon sprite, a `beforeInteractive` script, the cookie banner, the toaster and the manifest link. I re-read each of them at HEAD. None of them changes an image, header, cookie, cache or permission setting. One small addition: the new zod script carries the CSP nonce (`src/app/[locale]/layout.tsx`). **Where runtime evidence and code reading disagree, runtime wins.**
4. Notes from the private data, input, platform and trust groups reached the report writer only in part. Their sections (5–9 and 12–19) were therefore re-checked directly at HEAD by the report writer. That evidence is marked with a file:line or a read-only database query.
5. Throwaway scripts and outputs are in the session scratchpad (`…/scratchpad/sec-audit/`), not in the repo. The local database only held demo and test data. No personal data was printed.

**Status legend**

| Status | Meaning |
|---|---|
| **OK** | Done, with evidence. |
| **Fixed** | Used during the S1 round only (fixed, waiting for the review). After the review of 9 November 2026 no row says Fixed: each is OK or Partial. |
| **Needs fix** | Missing or wrong in the code or docs. We can fix it. |
| **Partial** | Partly done. The gap is written in the row. |
| **Owner** | Only you can do it (an account setting, a decision, a lawyer, a domain). |
| **N/A** | Doesn't apply yet (for example, there are no GitHub Actions). |

Priorities are your labels: **P0** = launch blocker, **P1** = before launch if possible, **P2** = soon after. Where the checklist gives no label, the row says so.

---

## 1. At a glance: the 19 launch blockers (checklist section 1)

| # | Blocker | Status | Why, in one line |
|---|---|---|---|
| 1 | Next.js and React patched | **OK** | next 16.4.5 and react 19.3.1, with a version-floor test (2.1.a). `npm run security:check` is ready for launch day; running it then is yours (2.1.b). |
| 2 | Test mode can't run in production; no codes on screen; demo accounts can't log in or be admin | **OK** | `SITE_ENV` decides. Production refuses test mode, codes never show on screen there or on the real host names, demo accounts can't log in or be staff. Proven again on the production build (gate probes, 9 Nov). |
| 3 | Strict code limits; SMS abuse blocked | **OK** | Israeli and Georgian mobiles only; hashed 10-minute codes, dead after 5 tries; waits and daily caps on the server, failing closed; an SMS budget and a country pause that one person can no longer trigger. Yours: Twilio geo permissions and SMS Pumping Protection. |
| 4 | Every page, action and API checks who and what | **Partial** | Done: a lint rule against direct database imports, a fresh authenticator code before every destructive admin action, and a test that walks every endpoint as each role. Open: two cross-account test cases (4.8.a) and your choice on "the host asked me to cancel" (4.6.c). |
| 5 | No private data reaches the browser | **OK** | DTOs, React taint (admin pages too), a permanent data-exposure test that also reads phones as the site prints them, every action's answer checked, scrubbed logs, minimal push/Telegram/SMS texts. Taint's speed cost is your choice C19. |
| 6 | Map never reveals a home's exact location | **Partial** | Walking times "up to N", rounded up to 5 minutes, names around the public point only, whole km; the address hides 7 days after checkout. Open: a rare worst case of two walks (C20) and copies in emails and calendars (C25). |
| 7 | Input validated, links restricted | **OK** | Tours and calendars only from the allow-lists; iCal recurring rules can no longer block the server. |
| 8 | SSRF protection | **OK** | Calendar imports only from the allow-listed hosts, at most 1 MB, every redirect and every IPv6 form checked. |
| 9 | Uploads: real images, re-encoded, private files private | **OK** | JPEG, PNG, WebP, and HEIC converted (browser or server); GIF, AVIF and SVG refused; every stored image without metadata, proven with a GPS HEIC through the real route. Yours: the bucket settings (9.k). |
| 10 | HTTPS, HSTS, headers | **Partial** | COOP `same-origin`, `base-uri 'none'`, `form-action 'self'`, CSP on every page. Open: the strict image policy runs report-only for a week on the real site first (10.2.b/c). |
| 11 | Private pages never cached for others | **OK** | Probe with 2 users and a logged-out visitor: every private page and its page data sends `private, no-store`, and nothing leaked. |
| 12 | Own production DB, backups, tested restore, private secrets | **Needs fix** | Nothing is set up yet (owner). Done in code: a staging or development server can no longer use the real database (12.1.b). Open: separate production keys in the README (12.2.b), a migration user (12.3.b), the off-site backup job to Backblaze B2 (12.4.b). |
| 13 | Email passes SPF, DKIM, DMARC | **Owner** | There is no domain yet. The DMARC rollout is missing from OWNER_TODO. |
| 14 | Scam protections | **Partial** | First-listing review, scam phrases, new-device alerts, and a fresh code + host notice before a listing's contact details change are in place. Missing: IBAN, card and wallet detection, the guests' "contact changed" notice (14.3.c), your exact warning wording. |
| 15 | Privacy, Terms, accessibility, export, deletion, retention ready for the lawyer | **Partial** | Drafts exist with placeholders. Processors are not named. Acceptance of the Terms is not logged. Retention is now automatic for guest contacts (3 months after checkout), logs, the outbox and devices; inactive accounts and a few smaller data kinds are still open (15.9, C26). |
| 16 | Monitoring, alerts, incident plan | **Partial** | The security event log now records every category the checklist names (16.2); logs and Sentry are scrubbed. Missing: your Sentry key, more founder alerts, and `INCIDENT_PLAN.md`. |
| 17 | `security.txt` and a report page | **Needs fix** | Neither exists. |
| 18 | No demo listings, placeholders, test banners or dev badges on the real site | **OK** | Demo listings, the demo banner and demo logins are off whenever `SITE_ENV=production`, and the seed never puts demo data into the real database (19.i; gate probe d: 0 demo listings, a demo listing page answers 404). |
| 19 | Section-20 tests and scans pass | **Partial** | Fail-closed startup passes (probes + permanent test). `npm audit`: 0 high or critical. gitleaks is clean. The full e2e suite passes on the production build (9 Nov). ZAP and Observatory have not run. |

---

## 2. Counts by priority and status

Counted over every row in the section tables below (section 2 to 21), after the review of S1 (9 November 2026).

| Priority | OK | Partial | Needs fix | Owner | N/A | Total |
|---|---|---|---|---|---|---|
| P0 | 176 | 33 | 18 | 30 | 5 | 262 |
| P1 | 8 | 15 | 7 | 18 | 1 | 49 |
| P2 | 0 | 0 | 0 | 1 | 0 | 1 |
| **All** | 184 | 48 | 25 | 49 | 6 | 312 |

**In plain words:** of the 262 launch-blocker rows, **176 are done and proven**. 33 are partly done (the row says what is left), 18 still need a fix, mostly in sections 12–19 (the next rounds), 30 are yours to do (accounts, domain, lawyer), and 5 don't apply yet. No row waits for a review any more.

---

## 3. Section tables

The "In plain words" paragraphs under each heading describe what the audit of 7 November found; the Status and Evidence columns show where each item stands after the review of 9 November.

### Section 2: Framework, packages and code hosting

**In plain words:** we are two patch releases behind on Next.js and one behind on React. These patches fix security issues, so we upgrade now even though they are new. Two image settings are too open: AVIF is on, and other people's photo buckets are allowed. The server doesn't check its settings when it starts. The repository is **public**, and GitHub's alerts are off.

#### 2.1 Next.js and React versions

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 2.1.a | Next.js ≥ 16.4.5 + matching patched React | P0 | **OK** | next and eslint-config-next 16.4.5, react/react-dom 19.3.1 (`package.json`); a downgrade fails `tests/unit/framework-versions.test.ts`. The review (9 Nov) diffed the React build that Next 16.4.5 ships: every 19.3.1 fix is in it. | `npm install --save-exact next@16.4.5 eslint-config-next@16.4.5 react@19.3.1 react-dom@19.3.1`. better-auth (1.7.18 is out, 2 days old) only if its notes list a security fix; otherwise after 2 weeks. Then npm ci, tsc, eslint, vitest, build, e2e, Lighthouse. Add a version-floor unit test. |
| 2.1.b | Re-check advisories on launch day | P0 | Owner | Code done: `npm run security:check` (`scripts/security-check.mjs`; floors in `scripts/security-check-lib.mjs:11`; test `tests/unit/security-check.test.ts`) runs `npm audit`, the version floors and the package-age rule, also as the GitHub job "security check" on every push and every Monday (`.github/workflows/checks.yml`). Left for you: run it on launch day and read the Next.js and React advisories (OWNER_TODO). | `scripts/check-framework-versions.mjs` as `npm run security:check`: compares the installed versions with the registry and runs `npm audit --omit=dev`. Add a launch-day step: read the Next.js and React advisories. |
| 2.1.c | GitHub security alerts on | P0 | Owner | GitHub API: `dependabot_security_updates: disabled`. Secret scanning and push protection are on. The alerts state returned 403. | You: repo Settings → Code security → turn on Dependabot alerts and security updates, and private vulnerability reporting. |
| 2.1.d | Rebuild; remove old preview deployments | P0 | Owner | Every commit in history pins next 16.4.3. `README.md:170-204` walks you through a Vercel deployment. Whether one exists can only be seen in your Vercel account. The codespace rebuilds itself when the lockfile changes (`start.sh:71-78,121-129`). | After 2.1.a: rebuild the codespace. In Vercel, delete every deployment built before the upgrade. Add "after every security upgrade, delete old deployments" to OWNER_TODO. |

#### 2.2 Next.js settings

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 2.2.a | `images.dangerouslyAllowSVG` off | P0 | **OK** | `dangerouslyAllowSVG: false` (`src/config/images.ts:72`); `src/config/images.test.ts` "keeps every security setting" loads the resolved config. Confirmed by the review. | 2.1.a; set it explicitly; add a config test that loads the real config and feeds SVG variants to the optimizer. |
| 2.2.b | No `image/avif` in `images.formats` | P0 | **OK** | `formats: ["image/webp"]` (`src/config/images.ts:30`); warm-start and `scripts/warm-images.mjs` ask for WebP; `images.test.ts`. Confirmed by the review. The Lighthouse question is not about WebP: see C19 in section 6. | `formats: ["image/webp"]` everywhere; update warm-start (+ its test) and warm-images; assert it in the config test; re-measure Lighthouse. **Needs your OK** (it undoes part of the speed work). |
| 2.2.c | `remotePatterns`: only our photo host, protocol + host + path explicit | P0 | **OK** | One remote pattern built from `NEXT_PUBLIC_MEDIA_BASE_URL` (`src/config/images.ts:41`), protocol, host, port, path and query explicit; `images.test.ts` "only our bucket matches". Confirmed by the review. | Build the pattern from the media URL with `pathname: "/<prefix>/**"`, `port: ""`, `search: ""`. Fail the production build when the URL is missing. No remote hosts in dev. Add `localPatterns`. Test: foo.r2.dev → 400. |
| 2.2.d | `dangerouslyAllowLocalIP` off | P0 | OK | Resolved config `false`. Next 16.4.3 pins DNS and checks every redirect hop (`image-optimizer.js:527-704`). `is-private-ip` returns true for 19 private/metadata/NAT64/6to4 forms. Probe: `http://169.254.169.254` → 400. | Set it explicitly and assert it in the config test. |
| 2.2.e | `productionBrowserSourceMaps` off | P0 | OK | Resolved config `false`. **Probe:** `find .next-4720/static -name '*.map'` = 0. | Keep the check in CI after the 2.1.a rebuild. |
| 2.2.f | `poweredByHeader` false | P0 | OK | `next.config.ts:44`. **Probe:** no `X-Powered-By` on 19 responses. | Add it to the config test. |
| 2.2.g | `next dev` never on the internet; production uses the production build | P0 | **OK** | `npm run dev` binds 127.0.0.1; `next dev` refuses to start unless `SITE_ENV=development`, and on Vercel only for `VERCEL_ENV` production or preview, so `vercel env pull` on a laptop still works (`src/lib/startup-check.ts:163`; `startup-check.test.ts`). Codes on screen only in test mode (`src/lib/auth/code-display.ts`). | `"dev": "next dev -H 127.0.0.1"`. Refuse to start in dev on Vercel or a non-test site address. Habit 21.7. |
| 2.2.h | The Proxy is never the only protection | P0 | OK | `src/proxy.ts` holds no auth. All 43 admin page/layout files call `requireStaff`. A TypeScript-AST walk of 182 exports in 49 `'use server'` files: 175 guarded, 7 public by design, each validated and rate-limited. 33/33 guard tests pass. | Widen `actions-guard.test.ts` to every `'use server'` module (4.8.b). Test that the proxy imports nothing from `@/lib/auth`. |
| 2.2.i | `serverActions.allowedOrigins` narrow | P0 | **OK** | Only this codespace's own forwarded host (`src/lib/auth/dev-origins.ts:59`, `dev-origins.test.ts`); production refuses `EXTRA_ALLOWED_ORIGINS` (`startup-check.ts`, test "production trusts only its own address"). Confirmed by the review. | Trust only the exact codespace host. In production set `[SITE_URL host]` explicitly. The startup check refuses `EXTRA_ALLOWED_ORIGINS` on the real host. |
| 2.2.j | Validate security settings at startup; refuse to start | P0 | **OK** | `src/lib/startup-check.ts`, run by `src/instrumentation-node.ts` (exit 1) and `scripts/vercel-build.mjs`. New: a development or staging label on a public address is refused (`addressLabelProblems`, `startup-check.ts:180`), and the permanent test goes through the real `register()` (`tests/unit/startup-refuse.test.ts`, 6 cases incl. "the check runs only in the Node.js runtime"). The review traced Next 16.4.5: the exit happens before any request is answered. **Gate probe (9 Nov, production build):** `tests/startup/next-start-probes.ts`, 13 of 13 passed: SITE_ENV missing or invalid, test mode on production, BETTER_AUTH_SECRET or HASH_SALT missing, a database without TLS → `next start` exits 1 and names the problem; complete fake production settings start with no demo data, no codes on screen and the demo admin's login refused. | `src/lib/env/security-config.ts` (zod) called first in `register()`, and the same checks in `scripts/vercel-build.mjs`. Keyed on the real host (`VERCEL_ENV=production` or a non-test site address). Unit tests + a "start with a key missing → exit ≠ 0" test. |

#### 2.3 Packages (supply chain)

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 2.3.a | Lockfile committed | P0 | OK | `package-lock.json` tracked, v3, 1492 entries, all from registry.npmjs.org with integrity hashes, and in sync with `package.json`. `npm audit signatures`: 1353 verified. | Add a lock-sync unit test. |
| 2.3.b | Builds use `npm ci`, never `npm install` / blind `npm update` | P0 | **OK** | `vercel.json` `installCommand: "npm ci && npm run deps:scripts"`; README, `setup.sh`, `start.sh` and `docs/CONVENTIONS.md` agree. Confirmed by the review. | `"installCommand": "npm ci"` (with 2.3.g); fix the 3 docs/scripts; add a CONVENTIONS rule. |
| 2.3.c | No high/critical `npm audit` issues | P0 | **OK** | Gate, 9 Nov, after adding heic-decode: `npm audit --omit=dev` 0; full `npm audit` 0 high or critical (8 moderate, all in eslint's dev tools). `npm ci` of the lockfile in a clean folder works. | vitest → 4.1.12 (23 days old). lighthouse: take it out of the project and run it as `npx lighthouse@13.6.0` when measuring (recommended), or upgrade it in place. shadcn: copy its CSS into src and remove the package, or move it to devDependencies. Target 0 high/critical. **Needs your OK** (tool upgrades). |
| 2.3.d | Dependabot alerts + security updates | P0 | **OK** | `.github/dependabot.yml` (weekly, 14-day cooldown, one group for next/react). `.github/workflows/checks.yml` runs the install-script and version-floor tests on every push and pull request, Dependabot's too. You still switch the alerts on (2.1.c). | You flip the setting (2.1.c). We add `.github/dependabot.yml`: weekly, 14-day cooldown, a group for next/react. |
| 2.3.e | No new packages without asking; remove unused | P1 | **OK** | The 5 unused packages and lighthouse are gone; `docs/CONVENTIONS.md`: a new dependency needs your OK. The one new package this round, heic-decode 2.1.0, has your OK (addendum (e)). | Remove them (keep axe for the 20.S5 e2e); add a CONVENTIONS rule "new dependency = founder's OK". **Needs your OK** on the list. |
| 2.3.f | Avoid versions younger than ~2 weeks (except security) | P1 | Partial | The rule exists: `npm run security:check` fails on a package under 14 days old unless it is a listed security upgrade (`MIN_PACKAGE_AGE_DAYS`, `scripts/security-check-lib.mjs:19`; `scripts/package-age-allow.json`; test `security-check.test.ts`). **Open:** about 85 non-security packages locked on 5 November are still under 14 days old; they pass from 19 November 2026. | Dependabot cooldown; a `scripts/check-package-age.mjs` in `npm run check`; re-lock with `--before` just before launch. |
| 2.3.g | Review install scripts; `ignore-scripts` + allow-list | P1 | **OK** | `.npmrc` `ignore-scripts=true`; `npm run deps:scripts` runs only the allow-listed scripts (`scripts/allowed-install-scripts.mjs`); `tests/unit/install-scripts.test.ts` fails on a new unreviewed one. engines now `^22.12 || >=24.0` (Node 20 dropped). | Commit `.npmrc` with `ignore-scripts=true`, plus one `deps:install` step that rebuilds only the allow-listed packages. Plain npm, no new library. |
| 2.3.h | Never put secrets in plain `.env` files that could get committed | P1 | **OK** | Codespaces secrets are read from the environment, never copied into `.env`; `.env` is `chmod 600` (`.devcontainer/env-sync.sh`). `tests/unit/env-files.test.ts` fails if git tracks any `.env*` file except `.env.example`. | Read Codespaces secrets from the environment instead; keep only throwaway dev keys in `.env`; `chmod 600`; a check that fails if git tracks any `.env*` except the example. **Needs your OK** (changes binding answer 1). |

#### 2.4 GitHub and the codespace

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 2.4.a | The repository is private | P0 | Needs fix | GitHub API: `"visibility": "public"`. All code, docs, OWNER_TODO and history are public. | You: Settings → Danger zone → Private. **Paid choice**, see 5.3: on a personal Free account, branch protection for private repos and free push protection go away. |
| 2.4.b | Protect `main`: no force push or deletion | P0 | Needs fix | There is no `main` branch (404). The default branch is `claude/website-build-jm62em`. All 4 branches are unprotected; rulesets `[]`. | You: create `main` from the release commit, make it the default and Vercel's production branch, and add a ruleset (no force push or deletion). |
| 2.4.c | Actions: pin third-party actions to SHAs | P0 | N/A | 0 workflows ever (API `total_count 0`; no `.github` in any commit). | Pin to 40-char SHAs when CI is added. |
| 2.4.d | Actions: minimal `GITHUB_TOKEN` | P0 | N/A | No workflows. The repo default setting could not be read (403). | You, now: Settings → Actions → Workflow permissions → "Read repository contents". |
| 2.4.e | Actions: never print secrets in logs | P0 | N/A | No workflows. In the scripts that run, `git grep` for `set -x`, `printenv` or echoed secrets finds 0. `env-sync.sh:42` prints names only. | Rules for future CI (`::add-mask::`, no `set -x`). |
| 2.4.f | Scan the whole history for secrets (gitleaks) | P0 | **OK** | 8 November 2026: gitleaks 8.30.1 (built from its checksummed Go module) scanned all 66 commits on every branch and the pull-request ref (`gitleaks git --log-opts=--all --redact`). **1 hit: a public test value** (a browser push "auth" string in `src/lib/alerts/push-subscription.test.ts:6`), not a key; recorded in `.gitleaksignore`. A second search of every added line for this project's key formats (Resend, Telegram, Twilio, Google, Turnstile, Stripe, AWS, GitHub, Slack, Postgres URLs with a non-local host, PEM private keys, long quoted secrets) found only placeholders and test values. No `.env` file, key file or backup was ever committed (`.env.example` only, with empty secrets and a localhost-only dev database password). **No key needs changing.** | CI: `.github/workflows/secret-scan.yml` re-scans the full history on every push and pull request (exact version, no third-party actions). |
| 2.4.g | Rotate any key ever committed, pasted in chat or shown | P0 | Owner | No committed key found. Pasted or shown keys can't be checked from the repo. | You list the keys ever pasted or shown (Resend, Twilio, Telegram, Google, Azure, CARTO, Turnstile, VAPID, R2) and rotate them; keep the list in `INCIDENT_PLAN.md`. Rotating `BETTER_AUTH_SECRET` logs everyone out. Don't rotate `APP_ENCRYPTION_KEY` without a re-encryption plan. |
| 2.4.h | Codespace keys come from Codespaces secrets | P0 | Partial | The mechanism exists (`env-sync.sh:30-43`; `setup.sh:14-21` makes random dev keys). But `docs/CODESPACES.md:113-119` and `README.md:166` also offer "directly in .env". `OWNER_TODO.md:122-125` says to reuse the codespace VAPID keys in production. `README.md:215-216` says "add every variable from your .env" to Vercel (see 12.2.b). | Fix the 4 doc spots: real keys only as Codespaces secrets; production keys generated fresh on the hosting. |
| 2.4.i | Codespace port 3000 stays Private | P0 | Owner | `devcontainer.json:10-13` sets no visibility, so it is Private by default. A public port would be serious: the codespace runs with test mode on by default (`start.sh:131`). | You check the Ports tab. We add `otherPortsAttributes: {onAutoForward: "ignore"}`. Habit 21.7. |
| 2.4.j | Codespace DB holds only fake data | P0 | Partial | Read-only counts: 16 users (11 demo, 5 on test domains). One non-demo phone-only account has a Georgian mobile outside the demo/e2e ranges (not printed). `scripts/db-restore.ts:3` would restore a production backup into an empty dev DB. | You confirm, then we delete that account. db-restore refuses production backups on localhost/codespace. Your own admin account here is allowed by binding answer 1. |

### Section 3: Login, accounts and sessions

**In plain words:** login codes are random, single use and die after 5 wrong tries. But:

- phone codes are saved in readable form;
- the "wait 60 seconds" rule exists only on the screen, not on the server;
- SMS can go to 20 countries, including premium-rate numbers;
- an unverified Google email can take over an email account;
- nothing asks for a fresh code before sensitive changes;
- there is no way back if you lose your authenticator app.

#### 3.1 Login codes

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.1.a | 6 digits, secure random, hash only, single use, 10 minutes | P0 | **OK** | 10-minute codes (`code-rules.ts`), phone codes stored only as an HMAC keyed with HASH_SALT (`src/lib/auth/phone-code.ts`), email codes as a keyed hash; an expired code now answers "expired" (`phone-code.ts:81`). Tests: `phone-code.test.ts`, `phone-code.db.test.ts` (real adapter), `email-code.db.test.ts`; e2e `login-codes.spec.ts`. | Custom phone `verifyOTP` with HMAC-SHA256 and `timingSafeEqual`; keyed hash for email codes; you choose 5 or 10 minutes. DB test: no `Verification.value` matches `^\d{6}:`. |
| 3.1.b | Dies after 5 wrong tries; constant-time compare | P0 | **OK** | `checkPhoneCode` (`src/lib/auth/phone-code.ts`): atomic, constant-time, single use, dead after the 5th wrong try, which now also writes a `login_code_locked` event for email codes. The real send and check hooks are tested against the database (`src/lib/auth/code-send-hooks.db.test.ts`, 7 tests). | `timingSafeEqual`; an atomic counter (`UPDATE … RETURNING`). Test: 10 parallel wrong guesses → at most 5 attempts counted. |
| 3.1.c | Resend: ≥ 60 s, growing waits, daily caps per phone/email/IP/device | P0 | **OK** | `limitCodeSend` (`src/lib/auth/login-rate-limit.ts`): waits 60/120/300/900 s, daily caps phone 5, email 10, IP 30, device 10, in one locked transaction, failing closed. Review fixes: one IPv6 /64 is one IP; no device cookie = one device per IP; a refused wait no longer uses up the hourly count; a confirmed code gives back its IP share; a text Twilio refused gives its counts back. Tests: `login-rate-limit.test.ts`, `code-send-hooks.db.test.ts`. (The 5-a-day cap per phone number is shared on purpose: C23 in section 6.) | `limitCodeResend`: waits of 60/120/300/900 s; daily caps phone 5, email 10, IP 30, device 10; fail closed. Return `retryAfter` to the timer. Tests per rule. |
| 3.1.d | Same answer whether or not an account exists | P0 | **OK** | Your answer Q5 A: "number already used" comes after the limits and Turnstile, before any SMS (`phone-check-actions.ts`). The email-code answer is the same with or without an account (`email-code.db.test.ts`; e2e `login-codes.spec.ts`). Confirmed by the review. | You choose (5.4 Q5): keep it as a documented exception, or send the code first and tell only after it is confirmed. Test: byte-identical answers for the email send. |
| 3.1.e | Every code message: "Never share this code. Bayit will never ask you for it." in 5 languages | P0 | **OK** | The exact warning in the SMS and the code email, 5 languages, 2 SMS parts; codes are masked in the outbox. Tests: `src/lib/sms.test.ts`, `sms-alert-email.test.ts`. Confirmed by the review. | Exact wording in `sms.code` and email for all 5 languages (short, 70-character parts). Codes via the Messaging route or a custom Verify template. i18n unit test. |
| 3.1.f | Email codes: same limits + per-address cap | P0 | **OK** | Email: 10 a day per address on top of the waits; Gmail dots and +tags count as one inbox (`mailboxKey`, `login-rate-limit.ts`); a padded address is refused before any count is charged. Tests: `login-rate-limit.test.ts`, `code-send-hooks.db.test.ts`. | Daily cap of 10 per address, failing closed (same work as 3.1.c). |

#### 3.2 SMS abuse ("SMS pumping")

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.2.a | SMS only to +972/+995 (+ yours), in code and at the provider | P0 | **OK** | Only Israeli and Georgian mobiles (`smsAllowedCountries`, `src/config/site.ts`), checked in every send path. Tests: `phone.test.ts`, `src/lib/sms.test.ts`; e2e `login-codes.spec.ts`. You: Twilio Messaging geo permissions (OWNER_TODO). | `smsAllowedCountries: ["IL","GE"]`; OWNER_TODO: geo permissions in both Twilio Verify and Messaging. Tests for +1/+44/+7/+971 → refused. **Needs your OK** (5.4 Q4). |
| 3.2.b | Turnstile before any code, verified on the server | P0 | **OK** | `verifyTurnstile` (`src/lib/turnstile.ts`) fails closed; now also before a code to a new contact email (`src/lib/auth/contact-email-actions.ts:58`), and security codes are capped at 10 a day per address and account (`src/lib/auth/security-code-send.ts`). Tests: `turnstile.test.ts`, `login-rate-limit.test.ts`. | Missing keys → refuse to start in production; `verifyTurnstile` → false; require the action and hostname to match. Unit tests. |
| 3.2.c | Limits per number, range, IP, device; stricter for other countries | P0 | **OK** | Daily budget of 300 code texts with 30% kept for known accounts, a share of 6 a day per account or IP block, alerts to you at 50/80/100% (`reserveSmsSend`, `src/lib/auth/sms-guard.ts:191`); budget reset on /admin/maintenance (fresh authenticator code, audited). Test: `sms-guard.test.ts`. | Add range, device, daily and per-country keys, and a daily SMS budget kept in SiteSetting with an alert at 80%. All SMS keys fail closed. **Needs your OK** on the numbers. |
| 3.2.d | Watch verified ÷ sent by country; alert + pause that country | P0 | **OK** | A country pauses only when the low confirm rate comes from 10+ sources and 10+ IP blocks (`SMS_PAUSE_SPREAD`, `sms-guard.ts:63`), so one person cannot stop all codes; known accounts keep getting codes; "Resume texts" on /admin/maintenance. Test: `sms-guard.test.ts` ("20+ unconfirmed codes from ONE source do not pause the country…"). | Write send and verify events (country only, no number) to AuditLog. An hourly job computes the ratio, alerts you by email and Telegram, and sets `smsPausedCountries`. **Needs your OK** (threshold; a new table only if you prefer one). |
| 3.2.e | Provider fraud protection; mobile numbers only; no voice | P0 | **OK** | Mobile numbers only (`src/lib/auth/phone.ts`); no voice route (Twilio Verify is not used). e2e `login-codes.spec.ts`: landlines refused. You: **SMS Pumping Protection** on the Twilio Messaging Service (Basic is free; Advanced is paid, C27), not "Fraud Guard" (that belongs to Verify). | Accept only `MOBILE` (or `FIXED_LINE_OR_MOBILE`) with the bundled libphonenumber (free). You: Fraud Guard on, Verify voice off. Twilio Lookup is optional and paid. |
| 3.2.f | SMS only when a guest books and a host verifies | P0 | **OK** | The post form may ask for an SMS only for a host or with a signed 2-hour post-step token (`src/lib/auth/phone-check-token.ts`, `phone-check-policy.ts:44`); a new host is capped at 5 a day per account and 10 per IP. Test: `phone-check-actions.test.ts`. | Require a server-checked `place` (`booking` with a bookable listing, or `post/account` for owners of a listing). Test: a guest without booking context → refused. |

#### 3.3 Google sign-in

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.3.a | Standard flow with state and PKCE | P0 | **OK** | ID-token sign-in off for Google and Apple (`social-login.ts:38,48`); OAuth tokens encrypted; the ID token is not stored. Test: `social-login.test.ts`. Confirmed by the review. | `disableIdTokenSignIn: true` (Google and Apple); `account.encryptOAuthTokens: true`; null `idToken` in a DB hook. Tests: `supportsIdTokenSignIn()` false; POST → 404. |
| 3.3.b | Exact redirect URLs, basic scopes, verified emails only | P0 | **OK** | Unverified Google/Apple emails refused on sign-up, sign-in and linking (`social-login.ts`). Test: `social-login.test.ts`. Confirmed by the review. You: separate production and development OAuth clients. | `mapProfileToUser` (or `validateUserInfo`) rejects `email_verified !== true`, with an error in 5 languages. You create separate production and development OAuth clients. Unit test. |
| 3.3.c | Link Google to an existing account only after proof of both | P0 | **OK** | No implicit linking; connecting or removing Google/Apple needs a fresh code, and the code is used up by that one change (`account/actions.ts`, `server.ts`). Tests: `social-login.test.ts`, `sessions-2fa-db.test.ts` "disconnecting Google uses up the fresh code…". | `disableImplicitLinking: true`. Linking only after a fresh email code (or TOTP) within 5 minutes, plus a "new sign-in method" notice. **Needs your OK** (changes a round-2 decision, section 6). |

#### 3.4 Test mode and demo accounts

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.4.a | Codes on screen only when not production AND explicit TEST_MODE | P0 | **OK** | Codes on screen only with `AUTH_TEST_MODE=true` on a development or staging site (`src/lib/site-env.ts:64`), and never on one of the real site's host names (`code-display.ts:93`, `src/config/production-hosts.ts`). Tests: `code-display.test.ts`, `startup-check.test.ts`. **Gate probe:** with `SITE_ENV=production` no code button and `/api/dev/last-otp` → 404. | Explicit `APP_ENV` (development/preview/test/production) decides, not NODE_ENV. Codes on screen only if APP_ENV ≠ production AND `AUTH_TEST_MODE=true` AND all hosts are test hosts AND a site URL is configured. Only for demo accounts. Table test. **Needs your OK** (5.4 Q1). |
| 3.4.b | TEST_MODE on in production → refuse to start | P0 | **OK** | Production + test mode refuses to start (`startup-check.ts`). `tests/unit/startup-refuse.test.ts` "refuses test mode on production…"; **gate probe (b)** on `next start` → exit 1. | `assertProductionEnv()` in `register()` and `vercel-build.mjs` refuses `AUTH_TEST_MODE`, `DEV_SKIP_STAFF_2FA`, missing Turnstile or secrets on the real host. One test per variable. |
| 3.4.c | Production: demo logins off, demo accounts can't log in, never admin | P0 | **OK** | On the real site a demo account gets no session (`sessionCreateBlock`, `src/lib/auth/account-status.ts:57`, used at `server.ts:403`; test `account-status.test.ts` "a demo account gets no session on the real site…"), and no staff role (`admin/actions/users.ts`). **Gate probe (d):** the demo admin's phone login → refused. | Refuse session creation for `isDemo` on the real host; refuse staff roles for demo accounts; tests. |

#### 3.5 Sessions

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.5.a | HttpOnly + Secure + SameSite=Lax + `__Host-`; admin Strict | P0 | **OK** | `__Host-bayit.session_token` wherever cookies are Secure; a Strict `__Host-bayit.staff` cookie required for every staff page and action, living as long as the session (at most 30 days, `staffCookieMaxAgeSeconds`, `staff-session-rules.ts:48`). Tests: `session-cookies.test.ts`, `staff-session.test.ts`; e2e `security-sessions.spec.ts`. | Cookie name `__Host-bayit.session_token`, no Domain. A Strict `__Host-bayit.staff` HMAC cookie issued at TOTP and required by `requireStaff*`. The rename logs everyone out once (fine before launch). |
| 3.5.b | New session ID on login | P0 | **OK** | New session id after the 2-step code, a recovery code or turning 2-step on. Test: `session-rotation-db.test.ts`; e2e `security-sessions.spec.ts` "2-step login rotates the session…" (the old token is dead). | Rotate the session at the TOTP step (new token, delete the old one, set the cookie), plus `__Host-` (3.5.a). Tests: the old cookie → null. |
| 3.5.c | ~30 days users; 12 idle hours admin | P0 | **OK** | 12 idle hours for staff (sliding marker; a missing marker counts as idle), and the staff cookie no longer forces a new code every 12 hours of activity (`staff-session-rules.ts`). Tests: `staff-session-rules.test.ts`, `staff-session.test.ts`, `sessions-2fa-db.test.ts` "ends a staff session's 2-step check after 12 idle hours". | A 12-hour idle marker per staff session in the Verification table (no DB change). Expired → back to `/two-factor`. Fake-time test. |
| 3.5.d | Logout ends the session on the server; "all devices" ends all | P0 | **OK** | `logOutHere` fails unless the session row is deleted; "all devices" ends every session. Tests: `logout.test.ts`, `session-rotation-db.test.ts`. Confirmed by the review. | Use the shared `logOut()` everywhere with an error toast; add a server `logOutHere()` that fails unless the row was deleted; e2e test replaying the old cookie. |
| 3.5.e | Changing phone or email ends every other session | P0 | **OK** | Changing the phone or contact email ends every other session; the phone path is now tested too, including that another account's code cannot trigger it (`src/lib/auth/phone-check-binding.db.test.ts` "the owner's own replacement … ends the other sessions"). | `session.deleteMany` except the current one + audit + notice (3.6.d). DB test. |

#### 3.6 Sensitive changes

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.6.a | Fresh code before changing phone, email or guest-facing contact details | P0 | **OK** | A fresh code before: a new contact email, replacing a verified phone (the code is bound to the session and account that asked, `phone-check-actions.ts`), login methods, 2-step settings, and **a live listing's guest-facing contact details** (`src/lib/wizard/actions.ts:204-205`, `src/lib/wizard/contact-proof.ts`). Tests: `phone-check-binding.db.test.ts`, `tests/unit/wizard-contact-proof-db.test.ts`; e2e `security-sessions.spec.ts` "changing a live listing's contact number first asks the host for a fresh code" (gate, 9 Nov). | `requireFreshProof(user, purpose)`: a 6-digit email code (or TOTP), 5 minutes, stored in Verification (no DB change). New `contactEmail` confirmed by a code. Tests. |
| 3.6.b | Fresh code before deleting the account | P0 | **OK** | `deleteMyAccount` calls `requireFreshProof` (`src/lib/account/actions.ts`). e2e `security-sessions.spec.ts` "deleting the account first asks for a fresh code". Confirmed by the review. | `requireFreshProof(user, "delete_account")` + test. |
| 3.6.c | Fresh code for admin actions that delete | P0 | **OK** | Every destructive staff action needs a NEW authenticator code (an emailed code never counts): `runStaffAction(…, { freshProof })` (`src/lib/admin/server/common.ts:105`, `staff-proof.ts`), 25 actions; one code per ban, role change, reveal, removal, cleanup or backup. Tests: `tests/unit/endpoints/staff-fresh-proof-db.test.ts` (9), `endpoint-registry.test.ts` "destructive staff actions ask for a fresh authenticator code"; e2e `security-sessions.spec.ts` "a ban first asks the admin for a fresh authenticator code…" (gate, 9 Nov). | `runStaffAction(…, {freshTotp:true})` on every destructive action; extend `actions-guard.test.ts`. |
| 3.6.d | Notify the old phone or email: "If this wasn't you…" + secure link | P0 | **OK** | A security email to the OLD address only ("If this wasn't you…", the new value masked), 5 languages, plus a security event; a listing's contact change sends the host a notice with the channels masked. Tests: `sessions-2fa-db.test.ts`, `wizard-contact-proof-db.test.ts`. | A `security_change` email in 5 languages to the old address (and SMS if you accept the cost), with the new value masked. Outbox test. **Needs your OK** (SMS cost, 5.3). |
| 3.6.e | Hosts and admin: alerts on logins from a new device | P0 | **OK** | Hosts and staff get an email on a new device (staff also alert you); a sign-in with no device cookie now counts as a new device too (`src/lib/auth/hooks.ts`). Tests: `hooks.test.ts`, `sessions-2fa-db.test.ts`. | Alert email for hosts/staff on a new device (skip the first device); staff also alert you by email and Telegram. DB test. |

#### 3.7 Two-factor and recovery

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.7.a | Admin: authenticator app required | P0 | **OK** | Decision 5: 20 wrong codes a day lock the 2-step login; an email code only resets the counter, and at most 2 resets a day (`TOTP_UNLOCK_RESETS_PER_DAY`, `src/lib/auth/totp-lockout.ts:27`). Tests: `sessions-2fa-db.test.ts` "caps the email resets at 2 a day…"; e2e `staff-login.spec.ts`. | Daily cap + alert to you; fail-closed limiter; end sessions on staff promotion; enrollment needs a session under 15 minutes old; replay check in a transaction. **Needs your OK** on the lockout rule (5.4 Q11). |
| 3.7.b | Hosts: optional authenticator, strongly recommended to hotels | P1 | **OK** | A recommendation card for business hosts without 2-step login (mentions SIM swaps). Confirmed by the review. | A recommendation card for BUSINESS/hotel hosts without 2-step (5 languages; mentions SIM swaps). |
| 3.7.c | Lost phone: email code + support | P0 | **OK** | 10 hashed, single-use recovery codes, shown once; new codes cancel the old set. Tests: `recovery-code-format.test.ts`, `sessions-2fa-db.test.ts`; e2e "the 2-step page offers a recovery code instead of the app". Confirmed by the review. | 10 one-time recovery codes at setup, stored hashed. **DB change, needs your OK** (5.1). Fix the docs. |
| 3.7.d | Support never moves an account without proof | P0 | **OK** | `docs/ACCOUNT_RECOVERY.md` (proof, 24 h wait); no reset tool exists. Confirmed by the review. | A short recovery procedure (proof, 24 h wait, notices); any future reset tool ADMIN-only + fresh code + audit. **Needs your OK** on the proof rule. |
| 3.7.e | Every recovery logged and alerted | P0 | **OK** | Each recovery-code use: `audit("auth.recovery")`, a security event, an email to the account, an alert to you for staff. Test: `sessions-2fa-db.test.ts`. Confirmed by the review. | `audit("auth.recovery")` + alert to you and the account's channels. |

#### 3.8 Fake sign-ups

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 3.8.a | Turnstile on sign-up | P1 | Partial | Turnstile is on every code send (3.2.b) and the contact-email code. **Open:** Google/Apple sign-up has no Turnstile; it relies on Google's and Apple's own bot checks (a documented exception, your choice C24). | Covered by 3.2.b. |
| 3.8.b | Limit accounts per phone and per device | P1 | Partial | Per phone: `User.phoneNumber @unique` (`schema.prisma:349`). Per device: no cap. DeviceLink is only shown to staff (`admin/server/shared.ts:58-66`). | Count recent DeviceLink rows at sign-up; above N, refuse or flag. **Needs your OK** (N, refuse or flag). |
| 3.8.c | Flag bursts of new accounts | P1 | Needs fix | The velocity check counts listings only (`risk/index.ts:264-273`); no sign-up spike rule. | An hourly count per IP hash and overall, with an alert to you. **Needs your OK** (thresholds). |

### Section 4: Permissions everywhere

**In plain words:** this is in good shape. Every action and page checks who is asking and whether they own the thing. Forms accept only their own fields. Prices are always calculated on the server. Gaps:

- the trip's calendar file skips the 2-step code;
- a double tap can create two hotel bookings;
- new accounts have no booking cap;
- the calendar-export links are not random enough;
- tests don't yet cover every endpoint.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 4.1.a | Reads/writes go through server-only functions that check who is asking | P0 | **OK** | An ESLint rule blocks `@/lib/db` in src/app, src/components, src/hooks and src/proxy.ts (`eslint.config.mjs:14`); queries moved into `src/lib/<feature>/`; 12 thin files are listed with reasons. Test: `tests/unit/no-direct-db-imports.test.ts`. | Move them into `src/lib/<feature>/server.ts`; an ESLint `no-restricted-imports` rule: `@/lib/db` only under `src/lib/**`. |
| 4.1.b | Identity always from the session, never from request fields | P0 | OK | `requireUserForAction` reads only the cookie session (`session.ts:60-128,221-229`). The scan of 182 exports found no identity taken from input. A vitest proof: `reporterId:'victim'` is stripped by the schema. The Better Auth write endpoints are disabled (`server.ts:116-140`). | Hardening: put the session id last in spreads (`reviews/actions.ts:81`, `tickets/actions.ts:170`). |
| 4.2.a | Every Server Action and Route Handler holds when called directly | P0 | **OK** | The trip `.ics` and geocode routes and five public actions treat a 2-step-pending session as signed out; the search, card and booking contexts now do too. Every signed-in and staff route handler is called for real signed out and 2-step-pending (401/403/404). Tests: `route-session-gates.test.ts`, `endpoint-registry.test.ts`. | `requireUserForRoute()` mirroring `requireUserForAction`; a test that fails on `getCurrentUser()` without a `twoFactorVerified` check in `src/app/api/**`. |
| 4.2.b | Each validates input (shared zod) and checks login | P0 | **OK** | The owner's preview needs the full sign-in (`toListingViewer`, `src/lib/listing-page/load.ts`). Test: `listing-preview-gate.test.ts`. Confirmed by the review. | Same as 4.2.a (`requireFullUser`). |
| 4.2.c | Permission on the exact object | P0 | OK | Booking: `{id, guestUserId}` / `{id, hostUserId}` (`booking/service.ts:620,667,713`). Listings: `findOwnedListing` (`wizard/server.ts:83-95`). Calendar, prices, reviews, lists and saved searches are all owner-scoped. **Probe:** another user's upload → 404; their `updateDraft` → `not_found`. | none |
| 4.3.a | Booking: only its guest, the host, and the admin | P0 | **OK** | Your answers Q12 and (c): a phone number is ADMIN-only everywhere (booking, user, ticket, report, listing review, verification pages and booking search by phone); SUPPORT and MODERATOR see only the last 2 digits (`maskPhoneLast2`, `src/lib/admin/staff-visibility.ts:48`). Tests: `staff-visibility-db.test.ts`; e2e `security-sessions.spec.ts` "support staff see only the last 2 digits…" (gate, 9 Nov). | You choose (5.4 Q12): ADMIN-only `bookings` permission, or keep the CONVENTIONS role table and record your OK. |
| 4.3.b | Trip page: login as that guest; a secret link isn't enough | P0 | **OK** | The trip `.ics` with 2-step pending → 401 (`route-session-gates.test.ts`). Confirmed by the review. | `if (!user or !user.twoFactorVerified) → 401`; a route test for that case. |
| 4.3.c | Drafts, My places, stats, price guide, listing calendar: owner + admin | P0 | OK | All 21 account/post pages call `requireUser`; owner-scoped loaders (`stats/page.tsx:42-47`, `calendar/page.tsx:39-41`, `price-guide/page.tsx:62,111`). Probe: logged out → 307 login; other users get not found. | none |
| 4.3.d | Reports: reporter + admin; the host never sees who reported | P0 | **OK** | Who sent a report is ADMIN-only, also through a turned-away report's booking and a review report; the screenshot route answers 404 to others (`reports.ts`, `bookings.ts`, `api/admin/reports/[reportId]/[index]/route.ts`). Tests: `staff-visibility-db.test.ts`, that route's `route.test.ts`, `reviews-db.test.ts`. | Hide the reporter unless `reports.reveal` (ADMIN); add `assertNotOwnReport`. **Needs your OK** (5.4 Q12). |
| 4.3.e | Reviews: only the author, only their own completed booking | P0 | OK | `findGuestBooking {code, guestUserId}`, the stay rule rechecked under `FOR UPDATE` (`reviews/service.ts:81-83,131-155`); `rules.test.ts` 25/25. | none |
| 4.3.f | Saved lists: owner only; a shared link is read-only with no owner details | P0 | OK | `getSharedList` selects no notes and no owner details (`lists/server.ts:333-358`); the OG image shows only the name + cover; the token is cleared on stop (`core.ts:178`). | none |
| 4.3.g | Saved searches, alerts, settings: owner only | P0 | OK | `{id, userId}` scoping (`saved-searches/server.ts:79-123`); settings write `where {id: user.id}` (`account/actions.ts:240-333`). | none |
| 4.3.h | Admin pages and actions: admin with 2-step, checked every call | P0 | OK | All 42 admin pages call `requireStaff(...)`; all 72 staff actions use `runStaffAction`; 35/35 tests pass. Non-admin staff roles exist by design (`docs/CONVENTIONS.md:204-220`). | Extend the guard test (4.8.b). Confirm the role table (5.4 Q12). |
| 4.4.a | Each form accepts only its own fields | P0 | OK | `presentStepKeys` + `.pick(mask)` (`wizard/patch.ts:54-58`, `wizard/actions.ts:181-186`). **Probe:** `updateDraft` with `status:'LIVE', ownerId, isDemo, viewCount, verified` → the DB row was unchanged on all of them. | none |
| 4.4.b | Never accept role, verified, status, prices, owner, badges, visit date, review counts | P0 | OK | Status only through lifecycle functions (`review-rule.ts:54-66`); counts in SQL (`reviews/service.ts:151`); `visitedAt` is staff-only (`admin/badges/actions.ts:67`). | Delete the unused `bookingSettingsSchema` (`booking/schemas.ts:106-112`). |
| 4.5.a | Availability, nights, price lines, discounts, total on the server | P0 | OK | `quoteFor` inside the locked transaction writes every price field (`booking/service.ts:463-512`); `expected*` values are only compared. 57/57 pricing/booking tests pass. | none |
| 4.5.b | Booking in a transaction that enforces no overlap | P0 | **OK** | Hotel room counts added up in SQL with no row cap, inside the locked transaction (`src/lib/booking/availability.ts`). Test: `hotel-availability-scale-db.test.ts` (5001 blocks). Confirmed by the review. | Count taken rooms per night in SQL, or refuse when the cap is reached. Test with more than 5000 blocks. |
| 4.5.c | Idempotency key: double taps can't create two bookings | P0 | **OK** | One idempotency key per stay; while the host is still being alerted a repeat answers "booking in progress" (`src/lib/booking/service.ts:340`). Test: `booking-limits-db.test.ts`. | Option A: return the guest's identical booking from the last 10 minutes (no DB change). Option B: `Booking.idempotencyKey` + unique index (DB change). **Needs your OK** (5.1). |
| 4.6.a | New account: at most 3 upcoming bookings | P0 | **OK** | Decision 8: at most 2 upcoming bookings per verified phone across accounts, under advisory locks in the booking transaction. Tests: `booking-limits-db.test.ts`, including a test that fails without the per-account clause and one that fails without the phone lock. | Count under a per-guest lock; refuse the 4th with a message in 5 languages. **Needs your OK** on the definition. |
| 4.6.b | Many nights booked to block a host: flag | P0 | **OK** | Decision 7: Admin → Flags → "Long stays", review only; a "reviewed" mark now stays until its stay has ended (`retention.ts`). Tests: `guest-flags.test.ts`, `guest-flags-db.test.ts`, `privacy-retention-db.test.ts`. | A computed `long_block` flag in Admin → Flags (≥ 14 nights or ≥ 50% of the next 60, new account); alert. **Needs your OK** on the thresholds. |
| 4.6.c | Repeated cancellations and no-shows: flag | P0 | Partial | Decision 7: list-only flag; "my flight was cancelled" and travel-disruption cancellations never count, also on the admin user page now (`src/lib/admin/server/users.ts:318`). Tests: `guest-flags.test.ts`, `guest-flags-db.test.ts`, `staff-visibility-db.test.ts`. **Open:** "the host asked me to cancel" still counts toward the guest's flag (your choice, C22). | A list-only per-guest flag (≥ 3 cancellations in 90 days, ≥ 2 no-shows in 365). **Conflicts with an earlier default** (section 6). |
| 4.6.d | Reports: limit per day | P0 | OK | 5 per day per user (`reports/actions.ts:78,123`) behind Turnstile, with a lock against double taps. | Fail closed (12.5.b). |
| 4.6.e | "Show contact": limit per user per day | P0 | **OK** | "Show contact" for at most 40 listings a day, failing closed; the "seen" mark is written only after both caps pass, so parallel calls cannot slip through (`src/lib/contact/actions.ts:87`, `seen-store.ts`). Tests: `contact-reveal-cap.test.ts`, `tests/unit/endpoints/contact-reveal-race-db.test.ts`. | A daily cap of 40 distinct listings. **Needs your OK** on the number. |
| 4.6.f | Reviews: one per booking | P0 | OK | `Review_bookingId_key` UNIQUE (live DB `pg_indexes`); P2002 → `already_reviewed`. | none |
| 4.6.g | Lists and saved searches: per-user caps | P0 | OK | `MAX_LISTS=50` on every create path (`lists/core.ts:21,409`); `MAX_SAVED_SEARCHES=20` under an advisory lock; 24/24 tests. | none |
| 4.7.a | Random IDs in links for bookings, trips, reports, lists | P0 | Partial | Trips use `BT-XXXXX` (~25 bits, crypto random, `booking/code.ts:1-20`); tickets use a running number; internal ids are cuid v1. Every lookup is scoped to the user, so a guessed code shows nothing (probe). | Keep the codes as references, not keys (recommended), plus monitoring of 404 bursts. Or add a 128-bit `publicToken` (DB change). **Needs your OK** (5.1). |
| 4.7.b | Share and calendar-export tokens ≥ 128-bit, revocable, replaceable | P0 | **OK** | D3: 256-bit calendar tokens; "Replace the link" (owner only, 5 an hour) makes the old link answer 404 at once: the feed is now `private, max-age=300` and the 404 `no-store`, so no shared cache keeps the old link alive (`src/app/api/ical/[token]/route.ts`). Room-type tokens get a new token on first use. Test: `calendar-link-replace-db.test.ts`. | `randomToken(32)` for new listings; backfill (demo only); a "Replace calendar link" action. **DB change, needs your OK** (5.1). |
| 4.8.a | Each endpoint tested as logged out / other guest / other host / demo / admin | P0 | Partial | Every endpoint is in `tests/unit/endpoints/registry.ts` (share images, sitemap, robots and manifest too); `endpoint-registry.test.ts` calls each signed out, 2-step pending, as a regular account and as each staff role, with endpoint-scoped checks; every /account, /post and /admin page must call `requireUser`/`requireStaff`. Cross-account tests: `cross-account-db.test.ts`, `cross-account-more-db.test.ts`. **Open:** cross-account cases for review replies and a demo-account case. | `tests/unit/endpoint-access-db.test.ts` with fixture users + an e2e route table (20.1). |
| 4.8.b | A new endpoint without a permission rule makes a test fail | P0 | **OK** | `endpoint-registry.test.ts` fails on an unregistered or stale endpoint, a missing guard, or a destructive staff action without a fresh-code rule. Confirmed by the review. | `endpoint-rules.ts` registry + a test listing every `'use server'` export and `route.ts`; it fails on a missing rule. |

### Section 5: No private data reaching the browser

**In plain words:** the probes looked for one listing's exact address, coordinates, phone and email in every public page, its hidden page data, search, map, sitemap and APIs. Logged out and as other users, they found nothing. That is good. Still missing: permanent tests, cleaner server logs, shorter push notifications and React's "taint" safety net.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 5.a | DTOs for Client Components and API answers; never whole records, sessions or config | P0 | **OK** | React taint on secrets, sessions and the raw listing, booking and trip rows, and now on the admin loaders that read guest phones and reporters (`src/lib/admin/server/{bookings,users,reports,moderation,verifications}.ts`). Tests: `taint.test.ts`, `tests/unit/admin-taint-db.test.ts`; plus the data-exposure e2e (5.c). See C19 for its speed cost. | `taint` (5.k) + data-exposure e2e (5.c). |
| 5.b | Never public: exact address/apt/coords, host contacts, guest details, cadastral codes, notes, flags, tokens | P0 | OK | **Probe (logged out + other user):** the marker search found none of these in listing, search, `?view=map`, `/api/map/community`, `/sitemap.xml`, `/he/owner/<id>`, `/he/tbilisi` or RSC. The guest's address shows only on their own trip; the guest phone only on the host's own booking page. The walking-time leak is item 6.d. | Keep as a permanent e2e. |
| 5.c | Check HTML and RSC payload, with tests | P0 | **OK** | `tests/e2e/data-exposure.spec.ts` now also looks for phones in the format the site prints (separators removed), national forms, 4-decimal coordinates, the pin's supermarket and stop names, and any "≈ N min"; it visits a shared list, its share image and the compare page's action answer. **Passed in the gate's full production e2e run (9 Nov).** | `tests/e2e/data-exposure.spec.ts` (logged out + other user, HTML + RSC). |
| 5.d | Server Action answers and JSON APIs | P0 | **OK** | `tests/unit/endpoints/action-result-keys.test.ts` reads the result type of every server action and fails on any phone, email or address field not listed with a reason (9 listed: the caller's own data or ADMIN-only). | Assert DTO shapes in the endpoint registry test (4.8.b). |
| 5.e | Search API and map API: no exact coordinates | P0 | OK | **Probe:** neither the full-precision nor the 4-decimal coordinates appear in search, map or RSC. The DB has `approxLat ≠ lat` for 20/20 listings. | none |
| 5.f | OG share images and sitemap | P0 | **OK** | The share-image routes get only name, tagline, title, price and photo address (`tests/unit/share-image-args.test.ts`); the e2e visits the listing and list share images; the sitemap holds no private or demo URL. (Checked: the inputs, not the pixels.) | Find the listing OG route and probe it; add it to the e2e. |
| 5.g | Calendar exports: busy dates only | P0 | OK | `src/lib/ical.ts:129`: `SUMMARY:Reserved` / `Not available` only; no names or addresses. | none |
| 5.h | Emails only to the right person | P0 | **OK** | Notifications go to the contact email, which now needs a fresh code and a code to the new address (3.6.a); a listing's contact change needs a fresh code and tells the host. Tests: `email.test.ts` (`notificationEmailFor`), `wizard-contact-proof-db.test.ts`, `sessions-2fa-db.test.ts`. | 3.6.a + an outbox test per booking email. |
| 5.i | Push and Telegram alerts: as little as possible | P0 | **OK** | Push and Telegram say only "New booking BT-… / open Bayit"; the host SMS texts now carry only the code, the arrival day and the link, no guest name (`src/lib/alerts/messages.ts`, `src/lib/booking/notify.ts`). Test: `src/lib/alerts/messages.test.ts`. | Push and Telegram: "New booking BT-XXXXX, open Bayit for details" only. Unit test. |
| 5.j | `server-only` on every module touching the DB or secrets | P0 | OK | `src/lib/db.ts:1` imports `server-only`, so every one of the 150 importers is covered. The modules that read secrets without it are route handlers (`webhooks/*`), which are server only by nature. | Add `server-only` to `crypto.ts` and the secret readers anyway. |
| 5.k | React taint APIs as an extra layer | P0 | **OK** | `experimental.taint` on, through one committed switch (`src/config/taint.ts`, `next.config.ts`); this runs React's experimental build. Tests: `src/lib/security/taint.test.ts`, `src/config/taint.test.ts`. Keep or turn off: your choice C19 (speed). | Turn on `experimental.taint`; taint `Listing.address/lat/lng`, phones and tokens in the loaders. No new library. |
| 5.l | Logs never contain phones, emails, codes, addresses, tokens | P0 | **OK** | `src/lib/log-scrub.ts` on every `console.*` and Sentry event; it now also masks Prisma argument dumps, quoted names and messages, compressed IPv6, Israeli/Georgian national numbers, `%40` emails and "OTP sent: N", and turns Headers/Request objects into scrubbed copies. Tests: `log-scrub.test.ts` (every probe of the review), `monitoring.test.ts`, `tests/unit/log-hygiene.test.ts`. | Mask emails (`a***@d…`), never log codes, log ids only. Lint test for `console.*` with these fields. |
| 5.m | Generic production errors; errors recorded privately | P0 | OK | **Probe:** 500 pages (no DB) and 404s in 5 languages show no stack, path or Prisma text. Re-checked at HEAD: the 404 and global-error pages now read `messages/*/global.json`, and all 5 languages have the keys. Sentry sends no headers, cookies or query string (`monitoring.ts:1-10`). | Set `SENTRY_DSN` (16.1). |

### Section 6: Location privacy

**In plain words:** the map circle is moved 124–298 m from the home, in a stable direction, with a secret key. That part is right. But each listing also shows exact walking minutes to the synagogue and the sea, computed from the **real** pin. Anyone can combine two of them and find the home. A test on the demo listings found it within 9–43 m. Also, the guest can still see the exact address long after the stay.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 6.a | Offset the circle 100–300 m in a random direction | P0 | OK | Read-only DB: 20/20 listings offset 124–298 m from the pin. The offset uses `HASH_SALT`, not only the public id (`docs/SECURITY-REPORT.md` final pass #1). | none |
| 6.b | Store the offset point, keep it stable, send only that point | P0 | OK | `approxLat/approxLng` columns; the probe found no exact coordinates in public data. | none |
| 6.c | No exact coordinates in tiles, APIs or page data before booking | P0 | OK | Probe (5.e). | none |
| 6.d | Round public walking times to 5 minutes and distances to whole km | P0 | Partial | Your answer (b): every public walking time is rounded UP to 5 minutes and shown as "up to N" ("עד 5/10/15 דק׳"), never "≈", in 5 languages (`src/lib/geo/public-walk.ts`); the synagogue sort orders by the rounded value; the supermarket and stop a page names are picked around the public map point, not the pin; at most two pin-based walks per listing. Tests: `public-walk.test.ts` ("trilateration from everything a listing page shows", every step in every language), `where.test.ts`; e2e `walk-distance.spec.ts`, `data-exposure.spec.ts`. **Open:** in a rare geometry two pin-based walks can still narrow a home to about 4% of the 300 m circle (median about half): your choice C20. | Show minutes rounded up to 5 ("≈ 5", "≈ 10"; "under 5" for the smallest) on cards, the listing page and filters; nearby distances in whole km over 1 km. Keep the exact values server-side for the 15-minute filter. Test: the trilateration area ≥ the circle. **Conflicts with phase 5** (section 6). |
| 6.e | Exact address and pin only after a confirmed booking, only to that guest | P0 | OK | `canRevealHostContact`: viewer = guest AND active/done (`booking/policy.ts:86-91`); the probe saw no reveal for the host, other users or logged-out visitors. The `.ics` 2-step gap is 4.3.b. | none |
| 6.f | Hidden again 7 days after checkout | P0 | Partial | On the site: address, map pin and host contacts until checkout + 7 days (`src/lib/booking/policy.ts:99`; trip page, `.ics` 404 after, offline copy pruned). Tests: `booking.test.ts`, `privacy-retention-db.test.ts`, `src/lib/trip/sw.test.ts`; e2e `data-exposure.spec.ts`. **Open:** the confirmation and reminder emails and a downloaded `.ics` keep the address and host phone in the guest's mailbox and calendar, and nothing tells the guest (your choice C25). | Reveal only until checkout + 7 days (same constant), on the page, `.ics` and emails' links. Unit test. |
| 6.g | GPS and all metadata removed in every format, including HEIC | P0 | **OK** | Your answer (e): HEIC is converted (browser where it can, server with heic-decode otherwise); every stored image is re-encoded with all metadata removed. **Gate e2e (9 Nov):** `security-input-uploads.spec.ts` uploads an iPhone-style HEIC carrying GPS, a camera model and XMP through the real route; the stored WebP and JPEG copies have no EXIF, XMP or IPTC and none of the GPS or camera bytes. Unit: `images.test.ts`. | See 9.a (HEIC decision). |

### Section 7: Input, output and injection

**In plain words:** no unsafe SQL, no unsafe HTML, and the `<script>` tests never ran in a real browser. Video links are limited correctly. The 360° tour link accepts any website. Translations are not checked for changed numbers.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 7.a | Only the ORM or parameterized queries; review raw SQL | P0 | OK | `git grep` for `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw(` → 0. 26 tagged-template raw queries, all parameterized (e.g. `rate-limit.ts:38-48`). | none |
| 7.b | Never `dangerouslySetInnerHTML` with user content | P0 | OK | 3 uses, all non-user content: `inline-script.tsx:18` (our scripts), `json-ld.tsx:10` (escapes `<`), `ds/icon-sprite.tsx:35` (build-time SVG, new in the speed pass). **Probe (Chromium):** title/description XSS payloads → 0 dialogs, 0 injected elements, 0 CSP errors. | none |
| 7.c | Rich text cleaned by a vetted sanitizer | P0 | OK | No user rich text. Staff-only guide articles use a tiny Markdown parser that builds no HTML (`jewish-life/markdown.ts:1-30`; links must start with `http(s)://`). | Limit links to `https://` only. |
| 7.d | Escape user content in emails | P0 | OK | `escapeHtml` on every value (`email/layout.ts:19,36`). | none |
| 7.e | Video links: https; youtube.com, youtu.be or vimeo.com only | P0 | OK | `VIDEO_HOSTS` (`wizard/schemas.ts:204`). **Probe:** `javascript:`, `data:`, `http://youtube`, `youtube.com.evil.example`, `evil.example?u=youtube.com` → `invalid_input`. | none |
| 7.f | 360° tour links: https on an allow-list | P0 | **OK** | Tours only from Matterport, Kuula, Momento360 and Roundme, checked on save and on every render; never embedded. Tests: `schemas.test.ts`, `listing-page.test.ts`. Confirmed by the review. | `TOUR_HOSTS` (Matterport, Kuula, Momento360, Roundme + your list), on save and on render. **Needs your OK** on the list. |
| 7.g | Facebook usernames match a username pattern | P0 | OK | `MESSENGER_USERNAME` (`wizard/schemas.ts:237`; `contact/links.ts:63-68`); test `contact.test.ts:63`. | none |
| 7.h | Reject `javascript:`, `data:` and other schemes everywhere | P0 | OK | **Probe:** `javascript:` is refused for video and tour (`httpsOnly`); `data:` refused. | none |
| 7.i | `next`/`returnTo` only relative paths on our domain | P0 | OK | `src/lib/auth/next-path.ts`; `next-path.test.ts` passes (part of 33/33). | none |
| 7.j | Type, length and format validated on the server, incl. Server Actions | P0 | OK | zod on every action (4.2.b); route params regex-checked. | none |
| 7.k | Google Translate link: URL-encoded, length-limited | P1 | OK | `listing-page/translate-link.ts`: `MAX_TEXT_CHARS 5000`, `MAX_ENCODED_TEXT 6000`; probe: the text is URL-encoded. | none |
| 7.l | Admin CSV/Excel exports escape `= + - @` | P1 | N/A | No CSV or Excel export exists (`git grep text/csv\|xlsx` → 0). | Escape cells if one is added. |
| 7.m | iCal files untrusted: size and event limits; never as HTML | P0 | **OK** | 1 MB counted while downloading; recurring events are expanded only inside the import window and at most 2,000 events are kept, so a small feed full of rules can no longer block the server (`src/lib/ical.ts:54`); imported text is shown as plain text. Test: `ical.test.ts` (3,000 daily rules, 30k EXDATE, >5,000 events). | (1 MB: item 8.1.d) |
| 7.n | Translations untrusted; numbers and prices unchanged | P1 | Partial | Azure is called with `textType: plain` (`translate/azure.ts:32`) and the output is rendered as text. Nothing checks that digits and prices survive translation. | Compare the digit sequences of source and translation; on a mismatch keep the original language. Unit test. |
| 7.o | User text in emails only through API fields, never headers | P1 | OK | Only `List-Unsubscribe` headers, with CR/LF refused (`email/index.ts:77-84`). | none |

### Section 8: Server-side requests to other addresses (SSRF)

**In plain words:** calendar imports can't reach our own server or private networks, even through redirects or tricky DNS (probed). But any public website is accepted as a "calendar". The cap is 2 MB instead of your 1 MB.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 8.1.a | Calendar links: https + allow-list of calendar hosts | P0 | **OK** | Airbnb (all its country sites), Booking.com, Vrbo/HomeAway and calendar.google.com, https only (`src/config/external-hosts.ts`), on save and on every download and redirect. Tests: `external-hosts.test.ts`, `ical.test.ts`, `schemas.test.ts`. | An allow-list in `src/config` (Airbnb, Booking.com, Vrbo/HomeAway, Google Calendar + yours), checked on save and on every redirect hop. **Needs your OK** on the list. |
| 8.1.b | Public addresses only; block loopback, private, link-local, metadata, IPv6 private | P0 | **OK** | **Probe:** 127.0.0.1, 169.254.169.254, 10.0.0.1, `[::1]`, `[::ffff:127.0.0.1]`, `0x7f000001`, `2130706433`, `metadata.google.internal`, user:pass@, `javascript:`, `file:` → `bad_url`. The IPv6 list now also covers IPv4-compatible hex, `::ffff:0:0/96`, 6to4, Teredo and local NAT64 (`ical.test.ts`). DNS rebind → refused at connect. | Make it a permanent test. |
| 8.1.c | No redirects, or check every hop | P0 | OK | Each `Location` is rechecked (`ical.ts:456`); harness: redirects to metadata, private and `[fd00::1]` refused. | none |
| 8.1.d | ≤ 10 s and ≤ 1 MB per fetch | P0 | **OK** | Q16: 1 MB counted while streaming; 10 s for the whole download including redirects (`src/lib/ical.ts`). Test: `ical.test.ts` (a 2.5 MB stream stops early). Confirmed by the review. | `FEED_MAX_BYTES = 1 MB`. |
| 8.2 | Push endpoints only on known push services | P0 | OK | `push-subscription.ts:12-31` (FCM, Mozilla, Apple, WNS; https, no port or user). **Probe:** 127.0.0.1, metadata, http FCM, `fcm.googleapis.com.evil.example`, port 8443 → `invalid_input`. | none |
| 8.3 | Every other server fetch goes to fixed, known hosts | P0 | OK | Fixed hosts: Telegram (`alerts/telegram.ts:47`), Twilio (`auth/sms.ts:117`, `sms.ts:72`), rates (`currency/index.ts:24`), Nominatim/Overpass (env, default OSM), Azure/Google translate, Turnstile, Sentry DSN. The OG image fetches a stored photo URL that our server built (`og/share-image.tsx:171`). | Limit the OG fetch to the media host; set `NOMINATIM_URL`/`OVERPASS_URL` only from env (as today). |

### Section 9: Uploads

**In plain words:** the uploads passed every attack the probe tried: SVG, a file pretending to be a photo, a giant image, a wrong file name, a photo with GPS. Files are re-drawn, cleaned, given random names, and private files are encrypted. Two format gaps (HEIC, AVIF) and a missing "search this photo online" link remain.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 9.a | JPEG, PNG, WebP, HEIC (converted); no SVG | P0 | **OK** | Your answer (e): JPEG, PNG, WebP, and HEIC converted: the browser converts it to JPEG where it can (`src/lib/media-client.ts`), otherwise the server decodes it with heic-decode (`prepareUploadImage`, `src/lib/images.ts`; limits on size, pixels and decodes per hour); a HEIC that cannot be decoded gets a clear message; AVIF, GIF and SVG refused. Tests: `images.test.ts`, `images-heic-queue.test.ts`, `route.test.ts`; e2e `security-input-uploads.spec.ts` (gate, 9 Nov). | Remove AVIF from uploads. HEIC: (a) keep refusing with a clear message (iPhones convert to JPEG when the site doesn't list HEIC), or (b) add a HEIC decoder (new library). **Needs your OK** (5.2). |
| 9.b | Check the real file signature | P0 | OK | **Probe:** SVG declared `image/jpeg` → 415; HTML renamed `.jpg` → 415; a real PNG named `.jpg` → stored as WebP. | none |
| 9.c | ≤ 15 MB per file | P0 | OK | `site.ts:253` `maxPhotoBytes: 15 MB`; probe: 16 MB → 413. | none |
| 9.d | Pixel limit against decompression bombs | P0 | OK | `images.ts:58` `MAX_INPUT_PIXELS = 100M`; probe: a 30000×30000 header → 413. | none |
| 9.e | ≤ 30 photos per listing, ≤ 5 screenshots per report | P0 | OK | `site.ts:252` `maxPhotos: 30`, enforced in `uploads/listing-photo/route.ts:82,117`; `reports/turned-away.ts:40` `maxFiles: 5`. | none |
| 9.f | Per-user upload rate limit | P0 | OK | Photos 60/h (`listing-photo/route.ts:47,59`); private 30/h (`uploads/private/route.ts:48,65`). | none |
| 9.g | Re-encode with sharp, remove all metadata | P0 | **OK** | Every stored image is re-encoded by sharp with EXIF, GPS, XMP and IPTC removed: avatars, city photos and private images too (`images.test.ts`). **Gate e2e (9 Nov):** a HEIC with GPS through the real upload route is stored with no metadata (6.g). | none |
| 9.h | Random file names | P0 | OK | **Probe:** 32-hex random names. | none |
| 9.i | Listing photos: public storage via our image host | P0 | OK | `S3_PUBLIC_BUCKET`; `/api/media` sends `nosniff` + CSP sandbox (probe). | none |
| 9.j | Report screenshots: private bucket, short-lived signed links, admin only | P0 | **OK** | Report screenshots: private bucket, signed links, the own-report rule; a turned-away report's screenshots are ADMIN-only, other report screenshots follow your Q12 answer. Test: the screenshot `route.test.ts`. | ADMIN-only or your OK on the roles; the own-report check (4.3.d). |
| 9.k | Buckets: no listing; CORS only our domain; direct uploads signed | P0 | Owner | All uploads go through our server (`s3-request-presigner` is unused), so there are no direct uploads. Bucket listing and CORS are R2 settings. | You (with our steps): R2 public bucket with no list access, CORS = our domain; private bucket with no public access. |
| 9.l | Files removed when the listing or report is deleted, or retention ends | P0 | OK | Daily cleanup: photos of deleted listings after 30 days, unattached private uploads after 48 h, report screenshots 180 days after the decision (`api/cron/cleanup/route.ts:79-83`); account deletion removes ticket and certificate files. | none |
| 9.m | Review screen: reverse-image-search link + perceptual-hash duplicates | P0 | **OK** | Each photo on the review screen has TinEye and Google Lens links (new tab, `noopener noreferrer`, no referrer); the hint now says the search site downloads the photo and may keep it (5 languages). Tests: `media.test.ts`; e2e `security-input-uploads.spec.ts`. | Add a Google Lens / TinEye link per photo in moderation (free links, no API). |

### Section 10: HTTPS and security headers

**In plain words:** HSTS and the basic headers are on every response. The CSP uses a fresh key per page. Three things are looser than your list: COOP, `base-uri`, and images allowed from any https site. There was no "report-only" trial.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 10.1.a | HTTPS everywhere; HTTP → HTTPS on the same host | P0 | Partial | CSP adds `upgrade-insecure-requests` (`proxy.ts:49`). The redirect itself can only be tested on the domain. | After deploy: `curl -I http://<domain>/` → 308 to https on the same host. |
| 10.1.b | HSTS `max-age=63072000; includeSubDomains; preload` | P0 | OK | `next.config.ts:8`; **probe:** on every response (pages, API, static, 404, image). | none |
| 10.1.c | Preload submission only once every subdomain is HTTPS (your decision) | P0 | Owner | No domain yet. | OWNER_TODO item (21). |
| 10.2.a | Nonce CSP: strict-dynamic, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'` | P0 | **OK** | Nonce + strict-dynamic, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and now `form-action 'self'` only (`src/lib/security/csp.ts:107`); pages with a dot in the path get the CSP too and outside nonce headers are dropped (`src/proxy.ts`). Tests: `csp.test.ts`, `security-headers-proxy.test.ts`; e2e `security-input-uploads.spec.ts`. | `base-uri 'none'`. |
| 10.2.b | Limit img, connect and frame sources to services we use | P0 | Partial | Trial running: the strict policy (images only from our site, `data:`, `blob:`, the photo bucket, the map tiles and Google account photos; media from our site, `blob:` and the bucket) is sent report-only (`src/lib/security/csp.ts`). The enforced policy still allows any https image until the trial ends (`CSP_STRICT=enforce`). Test: `csp.test.ts`. | `img-src 'self' data: blob: <media host> <CARTO tile hosts>`; the same for media. |
| 10.2.c | Report-only first, fix reports, then enforce | P0 | Partial | Report-only phase in place: `/api/csp-report` (a report already seen this hour is now dropped without using the hourly cap, so one client cannot hide new ones; `csp-report.test.ts`, `route.test.ts`). **Still to do:** a week of reports on the real site, then `CSP_STRICT=enforce`. | Send the tightened policy as `Content-Security-Policy-Report-Only` to Sentry's free CSP endpoint for a week, then enforce. |
| 10.2.d | Never `unsafe-eval` in production | P0 | OK | `proxy.ts:21` dev only; probe: absent in production; 0 CSP violations on 6 pages. | none |
| 10.3.a | `X-Content-Type-Options: nosniff` | P0 | OK | Probe: every response. | none |
| 10.3.b | `Referrer-Policy: strict-origin-when-cross-origin` | P0 | OK | Probe: every response. | none |
| 10.3.c | Permissions-Policy camera/mic/payment off, geolocation self | P0 | OK | Probe: `camera=(), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()`. | none |
| 10.3.d | `Cross-Origin-Opener-Policy: same-origin` | P0 | **OK** | `Cross-Origin-Opener-Policy: same-origin` on every response (`src/config/security-headers.ts:11`). Tests: `security-headers.test.ts`; e2e `security-input-uploads.spec.ts`. Google/Apple sign-in are full-page redirects. | `same-origin`; e2e that Google login, Turnstile and video embeds still work. |
| 10.4.a | CORS only our origin; never `*` with cookies | P0 | OK | Probe: no `Access-Control-Allow-Origin` on any API answer. | none |
| 10.4.b | Generic 404 and 500 pages in 5 languages | P0 | OK | Probe: 404 in he/en/ru/ar/ka with the right `lang`/`dir`; 500 without a stack. Re-checked at HEAD (5.m). | none |
| 10.4.c | No `.env`, backups or debug routes reachable | P0 | OK | Probe: `/.env`, `/.git/config`, `/he/dev/ui` → 404; `/api/dev/last-otp` → 404 without test mode. Note: `/dev/ui` opens if `NEXT_PUBLIC_SHOW_DEV_UI=true` (`dev/ui/page.tsx:42`). | The startup check refuses `NEXT_PUBLIC_SHOW_DEV_UI` on the real host. |
| 10.4.d | Admin, account, trip and booking pages send noindex | P0 | OK | Probe with SITE_URL = real host: `X-Robots-Tag: noindex, nofollow` on account, admin, trips, login, saved, post; the booking page has a noindex meta tag; robots.txt disallows them. | Also send the header (not only the meta tag) on `/listing/*/book`. |

### Section 11: Caching

**In plain words:** this passed. Two users and a logged-out visitor opened the same 10 private links in turn. Each saw only their own data, and every private answer says "don't store".

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 11.a | Private pages never in shared caches; `private, no-store`; per request | P0 | OK | **Probe:** 10 private URLs, HTML + RSC: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`, no `x-nextjs-cache`; every route is dynamic (ƒ). No `use cache`, `unstable_cache` or `revalidate` export anywhere (`git grep`). The speed pass changed no caching. | Re-run after the 16.4.5 upgrade (the 3 Nov fixes were about cache leaks). |
| 11.b | Public cached pages: only public data; keys never include cookies or tokens | P0 | **OK** | Public answers are `public, s-maxage=300` with public data only; the private calendar export is now `private, max-age=300` (never in a shared cache, 4.7.b). The service worker stores trips only when the guest taps "save". | none |
| 11.c | Revalidation endpoints require authentication | P0 | N/A | No `revalidatePath`/`revalidateTag` and no revalidation route (`git grep`). | Require auth if one is added. |
| 11.d | Test: two users + logged out on the same private links | P0 | OK | Probe 20.7 (order guest → host → other → anon → guest). | Keep it as `tests/e2e/cache.spec.ts`. |

### Section 12: Infrastructure and hosting

**In plain words:** production doesn't exist yet. Most of this is setup you do once, with our steps. The code side needs: no secrets copied from the codespace, a separate database user for migrations, a maintenance-mode switch, and limits that stay on when the database has a problem.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 12.1.a | Three environments: dev (fake), preview (protected, own DB), production | P0 | Owner | Dev = codespace with demo data. Preview and production are not created. `README.md:195-196` points the production branch at `claude/website-build-jm62em`. | You: a Vercel project with Standard Protection on previews, a Neon branch DB for previews, a production DB. We update the README. |
| 12.1.b | Preview/dev never connected to the production DB | P0 | **OK** | The real site marks its database when it starts; a staging, preview or development server, build or seed refuses a database with that mark, and production refuses `DB_PUSH_ON_BUILD`/`SEED_ON_BUILD` (`src/lib/site-env-marker.ts`, `src/instrumentation-node.ts`, `scripts/check-site-marker.ts`). Tests: `tests/unit/startup/site-marker.test.ts` (throwaway database), `startup-refuse.test.ts`. | The startup check refuses a production DB host unless `VERCEL_ENV=production`; db-restore refuses production backups locally. |
| 12.2.a | Secrets only on the server; nothing secret in `NEXT_PUBLIC_` | P0 | OK | `NEXT_PUBLIC_` names: SITE_URL, MEDIA_BASE_URL, MAP_TILE_KEY (a public key, must be domain-restricted), MAP_TILE_PROVIDER, TURNSTILE_SITE_KEY (public), SHOW_DEV_UI. | none |
| 12.2.b | Development and production use separate keys | P0 | Needs fix | `README.md:215-216`: "Add every environment variable from your `.env`" to Vercel. That would carry the codespace's `BETTER_AUTH_SECRET`, `APP_ENCRYPTION_KEY`, `HASH_SALT` (`setup.sh:16-18`) and `DEV_SKIP_STAFF_2FA` into production. `OWNER_TODO.md:122-125` reuses the codespace VAPID keys. | An explicit production variable list; secrets generated fresh on the hosting; a "never copy" list (AUTH_TEST_MODE, DEV_SKIP_STAFF_2FA, NEXT_PUBLIC_SHOW_DEV_UI). |
| 12.2.c | Restrict keys: CARTO to our domain, Google OAuth exact redirects, Resend send-only from our domain, Azure server only | P0 | Owner | Azure is used only server-side (`translate/azure.ts:14`). `OWNER_TODO.md:245-246` adds localhost to the production OAuth client. | You set the restrictions in each console; we fix the OWNER_TODO steps (separate dev client; Resend "sending access" key for the domain). |
| 12.3.a | Managed Postgres with TLS and encryption at rest | P0 | Owner | Not created. Neon has both by default. | You create it; `DATABASE_URL` with `sslmode=require`; the startup check requires TLS on the real host. |
| 12.3.b | App DB user least-privilege; migrations use a separate user | P0 | Needs fix | One `DATABASE_URL` for everything (`prisma.config.ts` datasource). `scripts/vercel-build.mjs` can run `prisma db push` with it. | Two Neon roles: `bayit_app` (DML only) and `bayit_migrate` (DDL); `DIRECT_URL`/`MIGRATE_DATABASE_URL` for migrations only; README steps. |
| 12.3.c | Encrypt phones, exact addresses, emails (AES-256-GCM, separate key, HMAC lookups, rotation notes) | P1 | Needs fix | Plain columns: `User.email`, `contactEmail`, `phoneNumber`, `Listing.address/lat/lng` (`schema.prisma:341,344,349,575-577`). `crypto.ts:70-95` already has AES-256-GCM (used for TOTP secrets and private files). | Encrypt address/lat/lng and guest phone first, then email and phone with HMAC lookup columns. **DB change, needs your OK** (5.1). |
| 12.3.d | IP allow-listing for the DB if offered | P1 | Owner | Not created. | You turn it on if your Neon plan has it (Vercel's IPs are not fixed on most plans). |
| 12.4.a | Daily backups + point-in-time restore; write down how far back | P0 | Owner | Neon not created. The admin "full backup" can't keep files on Vercel (`OWNER_TODO.md:27-28`). | You choose the plan; we write the restore window into INCIDENT_PLAN. |
| 12.4.b | Weekly encrypted export to a different provider | P0 | Needs fix | The backup writes a plain folder to local disk (`admin/maintenance/backup-format.ts:1-12`); no encryption, no off-site copy. | A weekly cron: `pg_dump`, encrypted with a separate backup key (node:crypto), uploaded to an R2 bucket in a separate account. **Small paid storage, needs your OK** (5.3). |
| 12.4.c | Photos backed up too | P0 | Owner | Not set up (also open in `docs/SECURITY-REPORT.md`). | R2 object versioning or a replicated bucket. |
| 12.4.d | Full restore tested before launch, then monthly | P0 | Partial | A local backup → restore was tested in round 3, phase 1 (`scripts/db-restore.ts`). Not on the production stack. | You + us: restore a Neon branch before launch, with the steps written down; a monthly OWNER_TODO reminder. |
| 12.5.a | Hosting firewall and DDoS protection | P1 | Owner | Not deployed. | Vercel Firewall (and/or Cloudflare) rules for `/api/auth/*` and search. |
| 12.5.b | Rate limits in a shared store (propose and ask); fail closed (rule 0.4) | P1 | **OK** | Every limit fails closed when the store errors (`src/lib/rate-limit.ts`); Better Auth's own limiter now uses the database too (`src/lib/auth/auth-rate-limit.ts`); only alert quotas fail open, on purpose. Tests: `rate-limit.test.ts`, `rate-limit-fail-closed.test.ts`, `auth-rate-limit.test.ts`. | Keep Postgres (free, recommended); add `{failClosed:true}` for login, SMS, 2-step, bookings and reports; switch Better Auth's limiter to the DB store. Upstash Redis only if traffic needs it. **Your choice** (5.2). |
| 12.5.c | "Maintenance mode" switch: offline in one step | P1 | Needs fix | None (`git grep maintenanceMode` → 0). | A `MAINTENANCE_MODE` env flag + SiteSetting checked in `proxy.ts` (a 503 page in 5 languages; admin can still log in). |
| 12.6.a | Only admins with 2-step can enter | P0 | **OK** | Every admin page and staff action checks the staff role and the 2-step code, per call; the endpoint walk covers every action and route, including the 2-step-pending case (`endpoint-registry.test.ts`, `actions-guard.test.ts`). | Extend `actions-guard.test.ts` (4.8.b). |
| 12.6.b | Short sessions + new-device alerts | P0 | **OK** | Staff: 12 idle hours (3.5.c), Strict staff cookie (3.5.a), new-device alerts to the staff member and to you (3.6.e). | 3.5.a + 3.5.c + 3.6.e. |
| 12.6.c | Deleting or removing anything needs a fresh code | P0 | **OK** | See 3.6.c: a new authenticator code before every destructive admin action. | 3.6.c. |
| 12.6.d | Every action audited; pages noindex | P0 | **OK** | Q13: destructive staff actions write their audit row with `auditOrThrow` in the same transaction; every staff action that changes something is destructive by default unless listed otherwise; a cleanup writes its start row before it runs and a dry run is audited (`src/lib/admin/maintenance/cleanups.ts`, `actions.ts`). Test: `tests/unit/endpoints/staff-audit.test.ts`. | Audit dry runs and `user.view`; a test that every mutating export writes AuditLog; you decide whether a failed audit write stops destructive actions (5.4 Q13). |

### Section 13: Domain, DNS and email

**In plain words:** there is no domain yet, so most of this waits for you. The webhook checks (Resend, Telegram) are already done right. The email footer has a safety line, but not your exact wording.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 13.1.a | Registrar 2-step + registrar lock | P0 | Owner | No domain yet. Not in OWNER_TODO. | OWNER_TODO (21). |
| 13.1.b | Auto-renew with a valid card | P0 | Owner | Same. | OWNER_TODO. |
| 13.1.c | WHOIS privacy | P0 | Owner | Same. | OWNER_TODO. |
| 13.2.a | DNSSEC | P1 | Owner | Same. | OWNER_TODO. |
| 13.2.b | CAA records for our certificate provider | P1 | Owner | Same. | OWNER_TODO (Vercel: `letsencrypt.org`). |
| 13.2.c | Remove unused DNS records | P1 | Owner | Same. | OWNER_TODO, plus a yearly check. |
| 13.3.a | Send from our own domain on a separate sending subdomain | P0 | Partial | `EMAIL_FROM` env; the fallback is `onboarding@resend.dev` (`email/index.ts:184-186`). OWNER_TODO suggests `no-reply@your-domain`, not a subdomain. | The startup check refuses a missing or foreign `EMAIL_FROM` on the real host; OWNER_TODO: verify `mail.<domain>` in Resend. |
| 13.3.b | SPF + DKIM via Resend, plus DMARC | P0 | Owner | `OWNER_TODO.md:253` covers SPF/DKIM; DMARC is missing. | Add a DMARC record step. |
| 13.3.c | DMARC `p=none` → `quarantine` → `reject` | P0 | Owner | Not in OWNER_TODO. | Add the rollout with dates (start `p=none; rua=…`). |
| 13.3.d | Gmail/Yahoo sender rules (one-click unsubscribe, low spam) | P0 | OK | `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` on the weekly and alert emails (`api/unsubscribe/route.ts:8-10`; `weekly-host-stats.test.ts:246-252`). | Watch spam rates in Resend after launch. |
| 13.4.a | The same sender name every time | P0 | OK | One `fromAddress()` for all mail (`email/index.ts:184-186`). | none |
| 13.4.b | Links only to our own domain | P0 | Partial | Templates build links from SITE_URL (`email/layout.ts:71`). User text is escaped, but mail apps may turn URLs inside it into links. No test. | Test that every `href` starts with SITE_URL; strip URLs from user text in emails. |
| 13.4.c | Footer: "בית לעולם לא יבקש מכם תשלום בקישור, פרטי כרטיס אשראי או קוד כניסה." | P0 | Partial | `messages/he/emails.json:8`: "{brand} לעולם לא יבקש ממך סיסמה, קוד או תשלום במייל או בהודעה." (different words; no "link" or "card details"). | Use your exact sentence, translated into 4 languages. |
| 13.4.d | Alerts, price alerts, weekly emails: unsubscribe link | P0 | OK | Signed one-click unsubscribe (`api/unsubscribe/route.ts`; `saved-searches/run.ts`). | none |
| 13.5.a | Resend webhooks: svix signature on the raw body | P0 | OK | `resend/route.ts:39-44` reads raw text, then verifies; **probe:** cross-checked with the `standardwebhooks` library, 13/13 cases (tampered body, wrong secret, rotation list, v2 prefix). | none |
| 13.5.b | Reject old timestamps | P0 | OK | `webhook.ts:15,53` 5-minute window; probe: 301 s old or future → refused, 299 s → accepted. | none |
| 13.5.c | Process each event once | P0 | OK | Bounce handling reports duplicates (`resend/route.ts:55`, `duplicate: result.duplicate`). | none |
| 13.5.d | Keep the Telegram bot token secret | P0 | OK | Server env only (`alerts/telegram.ts:47`); never `NEXT_PUBLIC_`. | none |
| 13.5.e | Webhook `secret_token` checked on every request | P0 | OK | `webhooks/telegram/route.ts`: 503 without a secret, 401 on mismatch, before reading the body; `telegram-update.ts:21` constant-time. | none |
| 13.5.f | Connect a host via a one-time link that expires in 15 minutes | P0 | OK | `telegram-token.ts:18` `TELEGRAM_LINK_TTL_SECONDS = 15*60`, HMAC + `timingSafeEqual`; `telegram.test.ts:24`. | none |
| 13.5.g | VAPID private key secret; notifications minimal | P0 | **OK** | The key is server-only; push, Telegram and host SMS texts carry no guest name (5.i). | 5.i. |

### Section 14: Scams and fraud

**In plain words:** first listings go to a person. Scam phrases and hidden phone numbers or links are caught. Copied photos are spotted. Still missing:

- detection of bank account numbers (IBAN), card requests and crypto wallets;
- the house rules are not scanned;
- the "host contact changed" notice for guests;
- your exact warning sentence;
- a one-tap "report a scam" button.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 14.1.a | Each host's first listing waits for a person | P0 | OK | `risk/index.ts:321-327` (`first_listing`); `listing/review-rule.ts:12,24-43` sends first listings to a person and fails closed. | none |
| 14.1.b | Review screen: reused photos + reverse-image links | P0 | **OK** | Reused photos are flagged and each photo has TinEye and Google Lens links (9.m). | 9.m. |
| 14.1.c | Review screen: address doesn't match the pin | P0 | Needs fix | No such check (`git grep` for address/pin mismatch → 0). | Geocode the typed address (existing Nominatim helper) and flag when it is more than ~1 km from the pin. |
| 14.1.d | Review screen: price far below the price guide | P0 | Partial | `price_far_below_area` compares with similar listings in the area (`risk/index.ts:167-210`), not the price guide or reference prices. | Also compare with the price guide and reference ranges. |
| 14.1.e | Review screen: a new host with many listings | P0 | OK | `new_account_velocity` (`risk/index.ts:264-273`). | none |
| 14.1.f | Review screen: copied description text | P0 | Needs fix | No text-similarity check. | A shingle or hash similarity against other accounts' listings (pure code, no library). |
| 14.1.g | "ביקרנו במקום" only after a real visit | P0 | OK | Only the staff action sets `visitedAt` with a date and note (`admin/badges/actions.ts:67`); never on demo listings. | none |
| 14.2.a | Block payment links, IBANs, card requests, crypto wallets, Western Union, phones and links in titles, descriptions, house rules, reviews, messages | P0 | Partial | Phrases: Western Union, MoneyGram, gift cards, crypto words, deposit-first, prepayment (`risk/phrases.ts:114-192`). Phones and links: `contact-info.ts`, applied to title, description and translations (`risk/index.ts:218-222`) and reviews (`reviews/service.ts:91`). **Missing:** IBAN, card-number requests, wallet-address patterns; house rules are not scanned. Most hits send the listing to review rather than block it. | Add IBAN (mod-97), card (Luhn) and BTC/ETH/TRON patterns; scan house rules; BLOCK payment links and IBANs outright. Tests in 5 languages. |
| 14.2.b | Warning "לעולם אל תשלמו מראש בקישור או בהעברה. משלמים למארח כשמגיעים." on the listing, booking and trip pages and in emails | P0 | Partial | Booking (`booking.json:83`) and trip (`trips.json:93`): "…לעולם אל תשלמו מראש בקישור ששלחו לכם." The listing has "משלמים למארח בהגעה…" (`OWNER_TODO.md:157`). The email footer differs (13.4.c). | Your exact sentence in all 4 places, in 5 languages. |
| 14.2.c | A one-tap "דיווח על הונאה" button | P0 | Partial | A report reason `ASKED_MONEY_UPFRONT` sits inside the listing's "…" menu (`listing/fields.ts:169`); the help center has a scam ticket (`tickets.json:33`). There is no one-tap button. | A visible "דיווח על הונאה" button on the listing, trip and booking pages that opens the report with that reason preselected. |
| 14.3.a | Alert hosts on logins from a new device | P0 | **OK** | See 3.6.e: hosts and staff get a new-device alert. | 3.6.e. |
| 14.3.b | Contact changes need a fresh code and notify the old channels | P0 | **OK** | A live listing's contact details change only after a fresh code, and the host gets a notice with the channels masked (3.6.a, 3.6.d). | 3.6.a/d. |
| 14.3.c | Guests with upcoming bookings see "פרטי הקשר של המארח שונו לאחרונה" for 7 days | P0 | Needs fix | `Listing.contactChangedAt` is now written when the contact details change (`src/lib/wizard/actions.ts:213`), but guests with upcoming bookings are not shown "פרטי הקשר של המארח שונו לאחרונה" yet. | Store `contactChangedAt` on the listing (**DB change, 5.1**) and show the notice on trip pages and in reminders for 7 days. |
| 14.3.d | Offer hosts an authenticator app | P1 | Partial | 3.7.b. | 3.7.b. |
| 14.3.e | Host-safety guide: no commands or installs from "guests", fake CAPTCHA pages, account sharing | P1 | Partial | The safety page owner section covers overpayments, fake screenshots and codes (`messages/en/safety.json` `owners.*`). Nothing on commands, installs, fake CAPTCHAs or sharing an account. | Add 3 short tips in 5 languages. |
| 14.4.a | DMARC at `reject` | P1 | Owner | 13.3.c. | 13.3.c. |
| 14.4.b | A security page naming our only domain and what we never ask for | P1 | Partial | The safety page says we never send payment links (`safety.json goldenRule.noLinks`). It doesn't name our only domain (there is none yet). | Add the domain line once known (part of 18.2). |
| 14.4.c | A place to report fake Bayit sites | P1 | Partial | The scam ticket exists; no "fake Bayit site" option. | Add an option to the ticket form. |
| 14.4.d | Optionally register look-alike domains | P1 | Owner | — | OWNER_TODO. |
| 14.5.a | Booking limits (4.6) | P1 | Partial | 4.6.a/b/c. | 4.6. |
| 14.5.b | Reviews only from completed bookings; flag sudden bursts | P1 | Partial | The completed-stay rule holds (4.3.e); no burst flag. | A per-listing review-burst flag in Admin → Flags. |
| 14.5.c | Reports: rate limits; the admin decides | P1 | OK | 4.6.d; reports from older or verified accounts can auto-hide a listing, and moderators restore it (`reports/auto-hide.ts`). | none |
| 14.5.d | Scraping: rate-limit search, listing APIs and "show contact"; no bulk export; sitemap public only | P1 | Partial | Search actions are IP-limited (`search/actions.ts:29-30`); show contact 30/h; sitemap public only (probe); no bulk export exists. Listing page views have no limit. | Vercel Firewall rate rule on listing and search pages. |
| 14.5.e | Exclusionary listing text goes to the admin; Terms forbid it | P1 | Partial | The pledge and Terms cover it; no detector for exclusionary phrases (`phrases.ts` rule ids end at `abroad_keys`). | An "EXCLUSION" phrase category (5 languages) → review. |

### Section 15: Privacy and the law (drafts for your lawyer)

**In plain words:** the pages exist as drafts, and "download my data" and "delete my account" work. For the lawyer we still need:

- the processors named in the privacy policy;
- a log of who accepted which version of the Terms;
- an age confirmation;
- clear "what we keep" text when an account is deleted;
- automatic deletion for the remaining kinds of data;
- the risk assessment and security-policy drafts.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 15.1 | Israel Amendment 13: risk assessment, written data-security policy, delete data no longer needed | P1 (no label) | Needs fix | No such documents in the repo (`git ls-files` + grep). | Draft `docs/legal/risk-assessment.md` and `data-security-policy.md` for the lawyer. |
| 15.2 | Facts for the lawyer to decide our database security level | P1 (no label) | Needs fix | Not prepared. | A one-page data map: data kinds, counts, who has access, where stored. |
| 15.3 | Georgia: 72 h breach report, marketing consent, transfer safeguards | P1 (no label) | Partial | The privacy policy covers transfers ("adequacy decisions or standard contractual clauses", `legal.json`). No 72 h procedure (17). No marketing messages exist today. | INCIDENT_PLAN (17) + a consent record if marketing starts. |
| 15.4 | Europe: GDPR question for the lawyer | P1 (no label) | Owner | The policy already mentions GDPR (4 mentions in `legal.json`). | The lawyer question in OWNER_TODO. |
| 15.5 | Anti-spam: recorded consent; the weekly host email is service or opt-in; easy unsubscribe | P1 (no label) | Partial | One-click unsubscribe exists (13.4.d). The weekly host email has a settings switch. There is no consent record (date + method). | The lawyer classifies the weekly email; if marketing is ever sent, add a consent log (DB change). |
| 15.6.a | Accessibility audit: axe, Lighthouse, keyboard only, screen reader he + en | P0 (blocker 15) | Partial | **Probe:** axe WCAG 2.0/2.1 A+AA on 11 pages × 2 widths: 1 serious (`label-content-name-mismatch` on the 112 link, `/he/jewish-life`), otherwise 0. Lighthouse a11y, keyboard and screen-reader passes were not run. | Fix the 112 label; add an axe e2e; run the other passes before launch. |
| 15.6.b | Accessibility statement in 5 languages + coordinator contact | P0 (blocker 15) | Partial | `legal.json` `accessibility` exists in 5 languages with 10 `<todo>` placeholders (coordinator, contact). | You give the coordinator's details. |
| 15.6.c | Ask the lawyer about exemptions | P1 (no label) | Owner | — | OWNER_TODO. |
| 15.7.a | Privacy policy: what and why, named processors, where and how long, rights, contact | P0 | Partial | Processors are described generically: `legal.json` names none of Resend, Azure, CARTO, Cloudflare, Telegram, Vercel or Twilio. The controller is `<todo>` (`legal.json:160`). What a booking shares is missing (`OWNER_TODO.md:224-226`). | Name each processor and its country; add the booking section; you give the company details. |
| 15.7.b | In all 5 languages | P0 | OK | `messages/{he,en,ru,ar,ka}/legal.json`. | none |
| 15.7.c | Accept each provider's data-processing terms | P0 | Owner | — | OWNER_TODO. |
| 15.8.a | "הורדת המידע שלי" gives a file with the user's data | P0 | OK | `/api/account/export`; probe: only the caller's data, `no-store`. | none |
| 15.8.b | "מחיקת החשבון" says what is kept for legal reasons and for how long | P0 | Partial | `account.json settings.delete`: lists what is removed and that tickets stay anonymous; it says nothing about booking records kept or for how long. | Add "booking records are kept for N years (law)" once the lawyer sets N. |
| 15.8.c | Users can correct their details | P0 | OK | `updateProfile`, `updatePreferences`, contacts (`account/actions.ts:240-333`). | none |
| 15.9 | Retention: a time per data kind, deleted automatically | P0 | Partial | Automatic: guest contacts 3 months after checkout (decision 9), audit log 1 year, outbox 90 days, contact clicks 90 days, device links 1 year, security events 90 days (`src/lib/admin/maintenance/retention.ts`, `/api/cron/cleanup`; your answer (d) confirmed the times). Test: `privacy-retention-db.test.ts`. **Open:** no time yet for expired sessions (they keep IP and browser), PhoneLookup rows, old push subscriptions, ticket and report texts; inactive accounts (3 years) need a schema field (C26). | Add the missing jobs with your times (audit 90 days → see 5.4; guest contacts 12 months; inactive accounts 3 years after a warning email). |
| 15.10.a | Only essential cookies by default | P0 | Partial | Cookies: session, `bayit_did` (device id for fraud and stats, set for every visitor, `proxy.ts:133-141`), consent, language, currency. Whether `bayit_did` counts as essential is a lawyer question. | Lawyer to confirm, or set `bayit_did` only after consent or login. |
| 15.10.b | No ad or third-party trackers | P0 | OK | `git grep` for gtag, GTM, google-analytics, plausible, posthog, mixpanel, hotjar, facebook.net, clarity → 0. | none |
| 15.10.c | Analytics only cookie-less or with consent | P0 | OK | No analytics; host stats are first-party server counts. | none |
| 15.11.a | Real company details | P0 | Owner | `legal.json:30,160` `<todo>company name…</todo>`. | You give the details. |
| 15.11.b | Log each acceptance with the version accepted | P0 | Needs fix | No `termsVersion`/`termsAcceptedAt` anywhere (`git grep`). The pledge has its own versioned re-accept; the Terms don't. | A `TermsAcceptance` record (user, version, time) at sign-up and on each new version. **DB change, 5.1.** |
| 15.11.c | Users must be 18 or older | P0 | Partial | The Terms say so (`legal.json` `accounts.list.a`), but sign-up has no age confirmation. | An "I am 18 or older and accept the Terms" line at sign-up, logged with 15.11.b. |
| 15.11.d | The draft is marked for your lawyer | P0 | OK | Draft box + placeholders (`OWNER_TODO.md:216-223`). | none |

### Section 16: Monitoring and alerts

**In plain words:** the error-tracking code is ready but switched off until you create a free Sentry account. There is no separate security log yet. Alerts reach you only when a host's booking alerts fail, and only by email.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 16.1 | Free-tier error tracker, personal data stripped | P0 | Partial | Code done: Sentry events and every `console.*` line are scrubbed (`src/lib/monitoring.ts`, `src/lib/log-scrub.ts`; tests `monitoring.test.ts`, `log-scrub.test.ts`). **Yours:** the free Sentry account (EU region, its own scrubbing on). | You create Sentry (free); we scrub emails, phones and codes from messages before sending. |
| 16.2 | A separate security event log (logins, failures, codes by country, denials, rate-limit hits, contact reveals, exports, deletions, admin actions) | P0 | **OK** | D6 a: the `SecurityEvent` table with a 90-day purge; every category the checklist names is now recorded by real code (logins, failed and locked codes, codes by country, denials, rate-limit hits, contact reveals, exports, deletions, staff actions). Tests: `tests/unit/security-events-emitters.test.ts` ("every security event type is recorded by real code"), `events.test.ts`, `session-denials.test.ts`. | A `SecurityEvent` table (90-day retention) or reuse AuditLog. **Your choice, 5.1.** |
| 16.3 | Alerts to you by email + Telegram (new admin device, code/failure spikes, denials and 404 bursts, listing/booking bursts, error spikes, failed backups, domain/certificate expiry) | P0 | Needs fix | You are alerted only about host alert channels failing (`booking/alerts.ts:143,351`; `alerts/host.ts:278`), by email only (`alerts/founder.ts:49`). | An hourly alerts job over 16.2 + Telegram to your chat; domain/cert expiry check in the daily summary. |
| 16.4 | Free uptime monitor | P1 | Owner | — | UptimeRobot or Better Stack (free) on `/he` and `/api/map/community`. |
| 16.5 | Google Search Console once the domain is live | P1 | Owner | Already in `OWNER_TODO.md` item 10. | none |
| 16.6 | Weekly: check advisories and run `npm audit` | P1 | Partial | `npm run security:check` runs on every push and every Monday (`.github/workflows/checks.yml`, gate 9 Nov) and Dependabot checks weekly. **Open:** someone has to read the result each week (OWNER_TODO). | `npm run security:check` weekly + Dependabot (2.3.d). |

### Section 17: Incident plan (`INCIDENT_PLAN.md`)

**In plain words:** there is no incident plan yet, and two of its tools are missing: maintenance mode and "end all sessions for everyone".

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 17.1 | Contain: maintenance mode, end all sessions, rotate every key (with a list of secrets) | P0 | Needs fix | No `INCIDENT_PLAN.md` (`git ls-files`); no maintenance mode (12.5.c); "log out everywhere" exists per user only (`logout-actions.ts:17-37`). | Write the plan; add maintenance mode, an admin "end every session" action, and the secret inventory. |
| 17.2 | Assess: what data, how many people, since when | P0 | Needs fix | No plan; there is no security log to answer it (16.2). | Plan section + 16.2. |
| 17.3 | Notify: Israel PPA, Georgia within 72 h, the people affected in their language, the lawyer | P0 | Needs fix | No plan; no notification email template. | Plan section + a `security_incident` email template in 5 languages. |
| 17.4 | Fix and review: a short report | P0 | Needs fix | No plan. | Plan section with a report template. |
| 17.5 | Contacts: hosting, DB, registrar, email provider, lawyer | P0 | Needs fix | No plan. | We prepare the list; you fill in the account details. |
| 17.6 | Practice once before launch | P0 | Owner | — | One walk-through with us, on the preview. |

### Section 18: Reporting security problems

**In plain words:** neither the `security.txt` file nor the page exists yet. Both are small. You only need to choose the email address.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 18.1 | `/.well-known/security.txt` per RFC 9116 (Contact, Expires ≤ 1 year + reminder, Preferred-Languages he, en; Policy) | P1 | Needs fix | No file and no route (`git ls-files` / `src/app` → none). | A route that builds it from config (the contact email from env); Expires set to now + 11 months; a reminder in the daily summary 30 days before. |
| 18.2 | A "Report a security problem" page: we reply; no legal action against good-faith reporters | P1 | Needs fix | No page (`messages/en` has no such text). | A short page in 5 languages, linked from the footer and the safety page. |

### Section 19: Things that break trust on sight

**In plain words:** the link checker found no broken links, and no test strip appears without test mode. But the **demo listings would show on the real site** until someone switches them off, with a "demo" banner. The company details, your name on the About page and support reply times are still placeholders.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 19.a | Real company details in the footer and Terms | P0 | Owner | `legal.json:30,160` `<todo>`; `OWNER_TODO.md:214`. | You give them. |
| 19.b | Real support channels with honest reply times | P0 | Needs fix | The help center (tickets) and contact form exist; no reply-time statement in `help.json`, `tickets.json` or the contact messages. | You choose a realistic promise (e.g. "within 1 business day"); we add it in 5 languages. |
| 19.c | About page: your story with your real name | P0 | Owner | `about.json story.signature` is `[השם שלכם]`. | You send your name. |
| 19.d | Nothing fake: no invented numbers, reviews, ratings, badges or "trusted by" | P0 | OK | Demo rows are flagged (11 users, 20 listings `isDemo`, read-only count); city texts are fact-only and marked `_review` for you (`cityPages.json`). | none |
| 19.e | No leftover placeholders or brackets | P0 | Needs fix | Scan: 5 distinct `[…]` placeholders per language (e.g. `[השם שלכם]`, plus admin format examples) and `<todo>` tags in `legal.json` (company, accessibility coordinator). | Replace them once you give the details; add a CI check that fails on public `[…]`/`<todo>` text. |
| 19.f | No English text in the other languages | P0 | OK | Scan of he/ru/ar/ka: 16 strings identical to English, all units, product names or input examples ("MB", "Google Calendar", "© OpenStreetMap contributors", "@yourname"). Other Latin words are product names or admin-only technical words. | none |
| 19.g | No broken links | P0 | OK | **Probe:** 107 internal links on /he and /en at 390 and 1280 px, menu open: 107 OK, 0 broken. | Keep it as a CI check. |
| 19.h | No development leftovers: dev badge, test banners, "demo" strip | P0 | **OK** | No test strip or code button without test mode; on the real site the demo banner, demo listings and demo logins are off (19.i). **Gate probe (d)** on the production build. | 19.i. |
| 19.i | Demo listings hidden on the real site; never mixed with real ones in search | P0 | **OK** | Demo listings, the demo banner and demo logins are off whenever `SITE_ENV=production` (`src/lib/settings.ts` `effectiveSettings`, `src/lib/site-env.ts` `demoAllowed`); the seed never puts demo data into the real database (`prisma/seed/demo-decision.ts`; test `seed-demo-decision.test.ts`), and the demo scam alert and photo note hide with it (`scam-alert-demo-filter.test.ts`). **Gate probe (d)** on the production build. | Force demo listings off on the real host (or default `false` + refuse to show them there); keep them on in the codespace. Test on the real-host config. |
| 19.j | Trust & safety page: pledge, pay on arrival, report buttons, verified phones, real-stay reviews, privacy, our only domain | P0 | Partial | `safety.json` covers scam signs, "never pay before…", reporting and verified phones. **Missing:** the pledge, "reviews only from real stays", privacy and "our only domain". | Add 4 short sections in 5 languages. |
| 19.k | Prices the same everywhere; no surprise fees | P0 | OK | One server price calculation (4.5.a; pricing tests 22/22); Bayit charges no fees. | none |

### Section 20: Tests and scans before launch

**In plain words:** the probes covered 7 of the 8 automated tests and found the gaps listed above. The uploads, SSRF, cache and broken-link tests pass. The fail-closed test fails. Three scans (ZAP, Observatory, gitleaks) can't run until there is a preview or domain, or until you approve the tool.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 20.1 | Permissions per endpoint: logged out / other guest / other host / demo / admin | P0 | Partial | **Probe:** logged out → 307 login / 401; other users → not found; `/he/admin` → 404 for non-staff; upload and draft of another user → `not_found`. Demo and admin variants, and reports/reviews/lists endpoints, were not probed. Private "not found" pages answer HTTP 200 (streaming). | `tests/e2e/permissions.spec.ts` built from the server-action manifest, failing on unknown entries; real 404 status. |
| 20.2 | Data exposure: HTML, page data, APIs, emails | P0 | Partial | Probe passed for pages and APIs (5.b). Emails, push and Telegram were not checked. | `data-exposure.spec.ts` + an outbox test + a push payload test. |
| 20.3 | Rate limits: codes, "show contact", reports, bookings | P0 | Partial | Probe: login code tries die at 5 (OK); a 2nd send within 1 s passes (3.1.c). Show contact, reports and bookings were not probed. | e2e assertions for each limit. |
| 20.4 | Uploads: SVG, disguised file, huge image, wrong extension, GPS photo | P0 | OK | Probe (9.a–9.h): all refused or cleaned as required. | Keep it as `tests/e2e/uploads.spec.ts`. |
| 20.5 | SSRF: 127.0.0.1, 169.254.169.254, private, redirect to private | P0 | OK | Probe (8.1.b–c): all refused, 0 connections. | Keep it as a unit + e2e test. |
| 20.6 | XSS: `<script>` in title, description, review; `javascript:` video link | P0 | Partial | Probe: title, description and video OK (7.b, 7.e). The review was not probed (it needs a completed booking). | An e2e that books, completes and reviews with a payload. |
| 20.7 | Cache: two users + logged out on the same private links | P0 | OK | 11.a. | Permanent e2e; re-run after 16.4.5. |
| 20.8 | Fail closed: missing settings and TEST_MODE in production stop startup | P0 | **OK** | See 2.2.j: `tests/unit/startup-refuse.test.ts` (in `npm run check`) and the gate's `next start` probes (`tests/startup/next-start-probes.ts`, all passed on 9 Nov). | 2.2.j + a "start → exit ≠ 0" test. |
| 20.S1 | OWASP ZAP baseline of a protected staging copy | P0 | Needs fix | Not run: no preview exists; docker is available. | Once the protected preview exists: ZAP baseline with Vercel's bypass header. **Needs your preview + bypass token.** |
| 20.S2 | Mozilla Observatory and SSL Labs on the domain | P0 | N/A | No domain yet. Expected deductions: 10.2/10.3 (base-uri, img-src, COOP). | Run them after DNS and HTTPS; target A+/A. |
| 20.S3 | gitleaks secret scan of the repo and its history | P0 | **OK** | Clean history scan, 8 November 2026 (see 2.4.f). `.github/workflows/secret-scan.yml` runs on every push and pull request and fails on any new finding. | Re-run at the launch gate. |
| 20.S4 | `npm audit` with no high or critical left | P0 | **OK** | Gate, 9 Nov: `npm audit --omit=dev` 0; full audit 0 high or critical (8 moderate dev-tool advisories). See 2.3.c. | 2.3.c. |
| 20.S5 | axe + Lighthouse accessibility | P0 | Partial | 15.6.a. | 15.6.a. |
| 20.R1 | Full security review of all code, findings in `SECURITY_REPORT.md`, fixed | P0 | Partial | This report is the review; the fixes wait for your OK. | Keep this file updated per fix (rule 0.7). |
| 20.R2 | Later, with income: a professional penetration test | P2 (later) | Owner | — | OWNER_TODO. |

### Section 21: Your accounts and habits (owner)

**In plain words:** only you can do these. None of them is in OWNER_TODO yet. We will add them as one checklist once you OK this report. Section 21 has no priority labels. We set P0 for 2-step on the accounts that guard the code, hosting, email, domain and alert bot, and for keeping the codespace private; the rest are P1.

| ID | Requirement | Pri | Status | Evidence | Fix plan |
|---|---|---|---|---|---|
| 21.1.a | Authenticator 2-step on both Gmail accounts | P0 | Owner | Not in OWNER_TODO (`OWNER_TODO.md:48` covers only the admin panel). | Authenticator or passkey; no SMS fallback; backup codes offline. |
| 21.1.b | Authenticator 2-step on GitHub | P0 | Owner | The API can't see the flag (`two_factor_authentication: null`). | github.com/settings/security. |
| 21.1.c | Authenticator 2-step on hosting, database, Cloudflare | P0 | Owner | Not in OWNER_TODO. | Vercel, Neon, Cloudflare. |
| 21.1.d | Authenticator 2-step on Resend, Azure, Google Cloud | P0 | Owner | Not in OWNER_TODO. | Each console. |
| 21.1.e | Authenticator 2-step on the domain registrar | P0 | Owner | No domain yet (13.1). | When you buy it. |
| 21.1.f | Telegram two-step password | P0 | Owner | Your Telegram owns the alert bot. | Settings → Privacy → Two-Step Verification. |
| 21.2 | Password manager, unique passwords, recovery codes offline | P1 | Owner | Not in OWNER_TODO. | OWNER_TODO. |
| 21.3 | Phone: screen lock and updates | P1 | Owner | Your phone holds the admin authenticator. | OWNER_TODO. |
| 21.4 | Ask the carrier about SIM-swap protection | P1 | Owner | Not in OWNER_TODO. | Port-out PIN / SIM lock. |
| 21.5 | Never give anyone a login code | P1 | Owner | A habit. | OWNER_TODO habits list. |
| 21.6 | Never paste commands a "CAPTCHA" page asks for | P1 | Owner | A habit (14.3). | OWNER_TODO habits list. |
| 21.7 | Keep the codespace port Private; don't share codespace links | P0 | Owner | Test mode is on by default in the codespace (`start.sh:131`). | OWNER_TODO habits list; delete old codespaces. |
| 21.8 | Domain: registrar lock, auto-renew, HSTS preload decision, look-alike domains | P0 | Owner | 13.1, 10.1.c, 14.4.d. | OWNER_TODO "Domain" list. |
| 21.9 | The lawyer: privacy policy, Terms, DB security level, accessibility, spam rules, GDPR | P1 | Owner | 15.x. | OWNER_TODO "Lawyer" list. |
| 21.10 | Other: providers' DPAs, security contact email, company details, Search Console, later pen test | P1 | Owner | 15.7.c, 18.1, 19.a, 16.5, 20.R2. | OWNER_TODO "Other" list. |

---

## 4. What the probes confirmed (summary)

- **Passed:** uploads (all 10 attack files), SSRF (17 address forms, redirects, DNS rebinding), XSS on title, description and video links, the cache test with 2 users and a logged-out visitor, public data exposure, noindex, error pages, 107/107 links, axe (1 issue), no `X-Powered-By`, 0 browser source maps, cross-site Server Actions refused, field allow-list (mass assignment refused).
- **Failed or open:** AVIF served; any `*.r2.dev` bucket fetched; server starts without secrets and with test mode; second code sent within 1 s; calendar links to `*.sslip.io` saved; any https tour link saved; COOP and CSP looser than required; session cookie `__Secure-` instead of `__Host-`.
- **Smaller notes (P2):** a wrong user's private page answers HTTP 200 with the "not found" screen instead of 404 (it hides guessing from monitoring); a cross-site action answers 500 instead of 403; a misleading test-mode log line; three admin pages read the database in `generateMetadata` before the staff check (not confirmed at runtime); the email code is in the email subject (shows on lock screens); `Session.token` is stored raw in the database.

---

## 5. Needs your OK first (checklist 0.5)

Each item has the options and our recommendation. The numbered questions in 5.4 are the short version.

### 5.1 Database changes (all additive, through `prisma/sql/before-push.sql` + `db push`)

| # | What | Options | Recommendation |
|---|---|---|---|
| D1 | 2-step **recovery codes** (3.7.c) | (a) a new table of hashed one-time codes; (b) a JSON column on User | **(a).** Without it, a lost phone locks you out of /admin. |
| D2 | **Booking double-tap guard** (4.5.c) | (a) no DB change: return the guest's identical booking from the last 10 minutes; (b) `Booking.idempotencyKey` + unique index | **(b)**, the standard fix; (a) as a quick stop-gap. |
| D3 | **Calendar export links** 256-bit and replaceable (4.7.b) | Change `Listing.icalToken`'s default to an app-side random token and backfill (demo rows only) | **Yes.** Nobody's link breaks today. |
| D4 | **Terms acceptance log** with version + 18+ (15.11.b/c) | A small `TermsAcceptance` table | **Yes** (needed for the lawyer). |
| D5 | **"Host contact changed"** notice (14.3.c) | `Listing.contactChangedAt` | **Yes.** |
| D6 | **Security event log** (16.2) | (a) a new `SecurityEvent` table with 90-day retention; (b) reuse AuditLog (no DB change) | **(a)** (kept separate, as the checklist asks). |
| D7 | **Field encryption** of phones, addresses, emails (12.3.c, P1) | (a) exact address, coordinates and guest phone now, email/phone with HMAC lookups after launch; (b) everything before launch; (c) later | **(a).** |
| D8 | SMS statistics by country (3.2.d) | (a) reuse AuditLog (no change); (b) a daily counter table | **(a).** |
| D9 | Staff 12-hour idle limit (3.5.c) | (a) a marker in the Verification table (no change); (b) `Session.staffActiveAt` | **(a).** |
| D10 | Opaque booking URLs (4.7.a) | (a) keep `BT-XXXXX` as a reference, never a key; (b) a 128-bit `publicToken` | **(a).** Lookups are already scoped to the signed-in user. |
| D11 | "Reviewed" marker for guest flags (4.6.c) | (a) audit log (no change); (b) `User.guestFlagReviewedAt` | **(a).** |

### 5.2 New libraries, tools and upgrades

| # | What | Options | Recommendation |
|---|---|---|---|
| L1 | **Framework security upgrade** (2.1.a) | next/eslint-config-next 16.4.5, react/react-dom 19.3.1; better-auth 1.7.18 only if it is a security fix | **Yes, now.** Under 2 weeks old, but they are security fixes. |
| L2 | **Dev tools** (2.3.c) | vitest 3 → 4.1.12; lighthouse out of the project or upgraded to 13.6.0; shadcn copy CSS + remove, or move to devDependencies | **vitest 4.1.12; lighthouse out of the project** (still run for speed checks with `npx lighthouse@13.6.0`); **copy shadcn's CSS and remove the package.** |
| L3 | **Remove unused packages** (2.3.e) | s3-request-presigner, @hookform/resolvers, react-hook-form, nuqs, direct date-fns; keep @axe-core/playwright for the axe e2e | **Yes.** |
| L4 | **gitleaks** (2.4.f, 20.S3) | (a) a one-off docker run; (b) a pinned GitHub Action | **Both** (free). |
| L5 | **Install scripts** (2.3.g) | (a) plain npm `ignore-scripts` + allow-list; (b) `@lavamoat/allow-scripts` | **(a)**, no new library. |
| L6 | **Rate-limit store** (12.5.b) | (a) keep Postgres, fail closed where it matters; (b) Upstash Redis (new library + service, free tier) | **(a).** |
| L7 | **HEIC photos** (9.a) | (a) keep refusing HEIC with a clear message (iPhones convert to JPEG when HEIC isn't offered); (b) add a HEIC decoder library | **(a)**, and also stop accepting AVIF uploads. |
| L8 | **OWASP ZAP** via docker (20.S1) | Free; needs a protected preview + its bypass token | **Yes**, once the preview exists. |

### 5.3 Paid services

| # | What | Options | Recommendation |
|---|---|---|---|
| P1 | **Private repository** (2.4.a/b) | (a) private + GitHub Pro (paid; keeps branch protection); (b) private without branch protection; (c) a GitHub organization (protection for private repos still needs a paid plan) | **(a).** The code and plans are public today. Check the current price. |
| P2 | Twilio Lookup line-type / SMS Pumping Protection (3.2.e) | (a) free mobile-only check in code + Fraud Guard; (b) add paid Lookup | **(a)** for launch. |
| P3 | SMS to the old number after a contact change (3.6.d) | (a) email only; (b) email + SMS (about $0.17–0.26 each) | **(a).** |
| P4 | Off-site encrypted weekly backup (12.4.b) | A second R2 bucket in a separate account (small storage cost) | **Yes.** |
| P5 | Sentry, uptime monitor (16.1, 16.4) | Free tiers | **Yes** (free). |
| P6 | Professional penetration test (20.R2) | Later, with income | **Later**, as you said. |

### 5.4 Decisions (questions you can answer with yes/no or a choice)

1. **Test mode (3.4):** refuse test mode only on real deployments, decided by a new explicit `APP_ENV` setting, and keep it for the codespace preview and the e2e tests? *Recommend: yes.*
2. **AVIF off (2.2.b):** WebP only, accepting a small photo-size cost? *Recommend: yes.*
3. **Walking times rounded to 5 minutes, whole km (6.d):** this changes phase 5's "≈ 3 דק׳" to "≈ 5 דק׳". *Recommend: yes.*
4. **SMS countries (3.2.a):** Israel and Georgia only? *Recommend: yes.*
5. **Phone already used (3.1.d):** (A) keep the "number already used" answer before the SMS, or (B) send the code first? *Recommend: A.*
6. **Code life (3.1.a):** keep 5 minutes, or 10? *Recommend: 5.*
7. **Resend waits and caps (3.1.c):** waits of 60/120/300/900 s; daily phone 5, email 10, IP 30, device 10? *Recommend: yes.*
8. **Google linking (3.3.c):** stop merging Google into email accounts automatically, and link only after a fresh code? *Recommend: yes.*
9. **Code-message warning (3.1.e):** send codes through Twilio Messaging (our own text, cheaper) instead of Verify's template? *Recommend: yes.*
10. **Demo listings (19.i):** always off on the real domain? *Recommend: yes.*
11. **Admin 2-step lockout (3.7.a):** (a) 20 tries a day then wait 24 h, (b) then unlock with a fresh email code, or (c) alert only? *Recommend: b.*
12. **Staff roles (4.3.a/d/h):** limit the reporter's identity and the guest phone to ADMIN only; moderators keep the rest? *Recommend: yes.*
13. **Audit failure (12.6.d):** stop a destructive admin action if its audit row can't be written? *Recommend: yes.*
14. **Booking abuse numbers (4.6):** a new account means under 7 days or no completed stay, with at most 3 upcoming bookings; flag stays of 14+ nights; flag 3 guest cancellations in 90 days or 2 no-shows in a year (list only); "show contact" 40 listings a day? *Recommend: yes.* Note that the repeat-cancellation flag changes your earlier "no-shows never flag anyone".
15. **Allow-lists (8.1.a, 7.f):** calendars from Airbnb, Booking.com, Vrbo/HomeAway, Google Calendar; tours from Matterport, Kuula, Momento360, Roundme? *Recommend: yes, add more any time.*
16. **iCal cap (8.1.d):** lower 2 MB to 1 MB? *Recommend: yes.*
17. **.env flow (2.3.h):** read Codespaces secrets from the environment instead of copying them into `.env` (changes binding answer 1)? *Recommend: yes.*
18. **Local test account (2.4.j):** delete the one non-demo phone-only account in the codespace database? *Recommend: yes, if you don't know it.*
19. **Report file:** keep this root `SECURITY_REPORT.md` as the live report and mark `docs/SECURITY-REPORT.md` as history? *Recommend: yes.*
20. **Smaller numbers, defaults are fine:** sign-up device cap (3.8.b: 3 accounts per device in 30 days, flag only), sign-up burst alert (3.8.c), daily SMS budget (3.2.c: 300), ratio alert (3.2.d: below 0.5 with ≥ 20 sent), account-recovery proof (3.7.d: email code + verified phone, 24 h wait), audit-log retention (15.9: 1 year for staff actions, 90 days for security events).

---

## 6. Conflicts with earlier decisions

C1–C18 were settled by your OK of 8 November. **C19–C29 are open choices** from the review of S1 (9 November 2026), each with our recommendation; your answers of 8 November afternoon (backup, walking labels, phones, retention, GIF/HEIC) are in the addendum under "Your decisions".

| # | Earlier decision | Checklist | What we propose |
|---|---|---|---|
| C1 | The codespace "fast version" and the e2e suite run a **production build with `AUTH_TEST_MODE=true`** (`start.sh:131,177`; `playwright.config.ts:15`; round 3 phase 1). | 3.4: codes only when not production + TEST_MODE; TEST_MODE in production → refuse to start. | An explicit `APP_ENV` decides, not NODE_ENV. Refuse on real deployments; allow on localhost/codespace (Q1). |
| C2 | Report screenshots are kept **180 days after the decision** (`reports/turned-away.ts:199`, phase 3). | 15.9 example: "6 months after the case closes". | The same in practice (6 months ≈ 182 days). Keep 180 days, no change. |
| C3 | Phase 5 shows exact walking minutes ("≈ 3 דק׳ הליכה לים", `docs/round-3/phase-5.md:75-86`). | 6: round walking times to 5 minutes, distances to whole km. | Round to 5 (Q3). The "15 minutes or less" filter keeps working on the exact server value. |
| C4 | The approved speed work turned **AVIF** on for smaller photos (`next.config.ts:54-58`). | 2.2: don't add `image/avif`. | WebP only; re-measure Lighthouse (Q2). |
| C5 | Binding answer 1: private admin settings in a **gitignored `.env`** filled from Codespaces secrets. | 2.3: never put secrets in plain `.env` files that could get committed. | Read them from the environment; `.env` keeps only throwaway dev keys (Q17). |
| C6 | Round 2: an email-code account and a Google account with the same address **are the same account** (`server.ts:147-150`). | 3.3: link only after proof of both. | Link after a fresh code (Q8). Rejecting unverified Google emails needs no decision. |
| C7 | `src/config/site.ts:295-298` allows **20 SMS countries**; `OWNER_TODO.md:280` already says "allow only Israel and Georgia" at Twilio. | 3.2: +972, +995 and the ones you add. | Israel + Georgia only (Q4). |
| C8 | Login codes live **5 minutes** (`server.ts:52`). | 3.1: 10 minutes. | Keep 5, which is stricter (Q6). |
| C9 | Your default: "a no-show **never** flags the guest or the host" (`listing/host-flags.ts` header). | 4.6: flag repeated cancellations and no-shows. | A list-only flag for staff, with no automatic effect (Q14). |
| C10 | `docs/CONVENTIONS.md:204-220` gives MODERATOR `reports` and SUPPORT `reports.view`, plus booking views. | 4.3: bookings, reports and admin pages for the admin only. | The reporter's identity and the guest phone ADMIN-only; the rest stays (Q12). |
| C11 | iCal imports up to **2 MB** (`ical.ts:46`; the earlier report). | 8: 1 MB. | 1 MB (Q16). |
| C12 | **HEIC refused**, AVIF accepted (`images.ts:60-140`). | 9: JPEG, PNG, WebP, HEIC converted. | Keep refusing HEIC with a clear message, drop AVIF (L7). |
| C13 | `docs/SECURITY-REPORT.md`: limits failing open is "fine for launch"; it also suggests vitest 5.x. | 0.4: fail closed. 2.3: no versions under ~2 weeks old. | Fail closed for login, SMS, 2-step, bookings and reports; vitest 4.1.12 (23 days old) instead of 5.1.0 (5 days). |
| C14 | `OWNER_TODO.md:48`, `README.md:269`: "keep the backup codes". | 3.7: recovery must exist. | The app makes no backup codes today; add them (D1) and fix the docs. |
| C15 | `OWNER_TODO.md:122-125`: copy the codespace VAPID keys to the hosting and "never change them". `README.md:215-216`: copy every `.env` variable to Vercel. | 12.2: separate dev and production keys. | Generate production keys on the hosting; nobody has subscribed yet, so nothing breaks. |
| C16 | `OWNER_TODO.md:245-246`: add the localhost redirect to the same Google client. | 12.2 / 3.3: exact redirect URLs. | Separate production and development OAuth clients. |
| C17 | Booking alerts include the guest's name and dates (round 3, answer 4). | 5: as little as possible ("New booking BK-1234, open Bayit"). | Code only in push and Telegram; full details in email and on the site. |
| C18 | `demoDataVisible` is on by default (`settings.ts:70`). | 19: demo listings hidden on the real site. | Always off on the real domain (Q10). |
| C19 | React's "taint" safety net (5.k, approved in S1) runs React's **experimental** build. | Speed: Lighthouse mobile ≥ 90 on every run. | Speed investigator (9 Nov, Lighthouse 13.6.0, /he, 5 runs each): taint ON 89, 94, 90, 84, 89; taint OFF 94, 91, 82, 86, 88; before S1 (ec27439) 91, 87, 86, 95, 89. Alternating 8 runs: ON median 90 (3 of 8 under 90), OFF median 91 (2 of 6 under 90). Gate (9 Nov, taint ON, 5 runs): 88, 88, 83, 84, 89 (warm-up 88; every run took the slow-LCP path, 3.44–3.55 s). Taint costs about 6 KB of script on every page and a little later first paint; neither setting reaches 90 on every run on this machine (the measuring tool and the machine changed). **Recommendation: keep taint on**, confirm the score on PageSpeed Insights once the site is online, and turn it off only if the real site misses 90: the data-exposure test and DTOs stay the main guard. |
| C20 | Your answer (b): walking times "up to N", from the home's real pin. | 6.d: walking times must not give away the home. | As built, at most two walks per listing come from the pin; usually they leave about half of the 300 m circle, but in a rare layout only about 4% (still a city block, never an address). The only way to promise more is to measure from the public map point and add 300 m (a 3-minute walk could then read "up to 15"). **Recommendation: keep as built** (honest, useful numbers; the address stays hidden). |
| C21 | Sea and ski towns show a sea or lift walk. | 6.d: at most two walking times per listing. | A Chabad house that is not also the nearest synagogue is now hidden when the listing has a sea or lift walk. **Recommendation: keep** (the nearest synagogue still shows). |
| C22 | Decision 7: never count "my flight was cancelled" or travel-disruption cancellations. | 4.6.c: flag repeated cancellations. | "The host asked me to cancel" still counts toward the guest's 3-in-90-days flag. **Recommendation: stop counting it**, like a cancelled flight (it is the host's doing). |
| C23 | Approved: at most 5 code texts a day per phone number. | 3.1: per-number caps. | The 5 a day are shared by everyone asking for that number, so a stranger can use them up for a known number (devices that confirmed a code before keep their own allowance). **Recommendation: keep** (SMS cost and harassment matter more; the email login still works). |
| C24 | Google and Apple sign-in. | 3.8.a: Turnstile on sign-up. | Code sign-ups have Turnstile; Google/Apple sign-up relies on Google's and Apple's own bot checks. **Recommendation: accept** as a documented exception. |
| C25 | Booking emails carry the address and host phone; guests can add the stay to their calendar. | 6.f: the address hides again 7 days after checkout. | The site hides it, but copies in the guest's mailbox and calendar stay. **Recommendation:** say so in one line on the trip page and in the privacy text, and put the exact address only in the confirmation email (reminders link to the trip page). |
| C26 | Your answer (d) on retention. | 15.9: a time for every kind of personal data. | Still without a time: expired login sessions (they keep the IP and browser), phone-lookup rows, failed push subscriptions, ticket and report texts. **Recommendation:** sessions 30 days after they expire, phone lookups and dead push subscriptions 90 days, ticket and report texts 2 years after closing (lawyer to confirm). |
| C27 | Codes go through Twilio Messaging (Q9). | 3.2.e: the provider's fraud protection. | Twilio's SMS Pumping Protection has a free Basic level and a paid Advanced level (about $0.025 per text part; check the price in the Twilio console). **Recommendation: Basic at launch**; our own budget and country pause already cap the damage; switch on Advanced if pumping shows up. |
| C28 | Q12: moderators keep report screenshots. | 4.3.d: the reporter's identity is ADMIN-only. | A turned-away report's screenshots can show who reported, so they are now ADMIN-only; other report screenshots stay as Q12. **Recommendation: keep.** |
| C29 | Hosts edit their listings freely. | 3.6.a / 14.3.b: a fresh code before contact details change. | A live listing's contact change now asks for a fresh code each time and sends the host a notice each time. **Recommendation: keep both.** |

---

## 7. Fix plan

The order: P0 first, in work packages that fit the round-3 phases (checklist 0.2). The efforts are rough working days for one engineer, including tests. **Nothing starts before your OK.**

| Order | Work package | Main items | Effort | Phase |
|---|---|---|---|---|
| 1 | **Framework and supply chain** | 2.1.a/b, 2.2.a–j (AVIF, remotePatterns, config test), 2.3.b–d, startup validator (2.2.j + 3.4.b + 20.8), `npm ci`, Dependabot file | 1.5–2 days | Phase 1 |
| 2 | **Login and sessions** | APP_ENV + test-mode rules (3.4), SMS countries + mobile-only + Turnstile fail-closed (3.2), resend waits/daily caps (3.1.c/f), phone code hashing + constant time (3.1.a/b), Google (3.3), `__Host-` + staff Strict cookie + 12 h idle + session rotation (3.5), fresh codes + change notices + new-device alerts (3.6), TOTP daily cap (3.7.a), recovery codes (3.7.c, D1) | 5–7 days | Phase 1 |
| 3 | **Permissions and bookings** | `.ics`/geocode 2-step (4.2.a, 4.3.b), idempotency (4.5.c), hotel 5000-row cap (4.5.b), new-account cap + long-block + repeat flags + daily show-contact cap (4.6), calendar tokens (4.7.b), endpoint registry + role tests (4.8) | 3–4 days | Phase 1 (code that phase 1/4 touched) |
| 4 | **Privacy and location** | Walking-time rounding (6.d), 7-day address window (6.f), log scrubbing (5.l), minimal push/Telegram (5.i), taint (5.k), data-exposure e2e (5.c) | 2 days | Phase 1 / 5 |
| 5 | **Input, SSRF, uploads, headers** | Calendar allow-list + 1 MB (8.1), tour allow-list (7.f), AVIF uploads off (9.a), reverse-image link (9.m), COOP (10.3.d), CSP `base-uri`/`img-src` + report-only week (10.2) | 1.5–2 days | Phase 1 |
| 6 | **Trust and scams** | Demo listings off on the real host (19.i), IBAN/card/wallet + house rules (14.2.a), exact warnings (14.2.b, 13.4.c), one-tap scam report (14.2.c), contact-changed notice (14.3.c, D5), review-screen checks (14.1.c/d/f), safety page additions (19.j, 14.3.e), support reply times (19.b) | 3 days | Phase 6 |
| 7 | **Operations and legal drafts** | Sentry scrubbing (16.1), security event log + founder alerts (16.2/16.3, D6), maintenance mode + "end all sessions" (12.5.c, 17), `INCIDENT_PLAN.md` (17), `security.txt` + page (18), off-site encrypted backup (12.4.b), retention jobs (15.9), Terms acceptance + 18+ (15.11, D4), privacy policy processors (15.7.a), deletion wording (15.8.b), DB roles (12.3.b), docs fixes (2.4.h, 12.2.b) | 4–5 days | Phase 6 |
| 8 | **P1 items** | 2.3.e–h, 3.7.b, 3.8, 7.n, 12.3.c (D7), 12.5, 14.3.d–14.5, 15.1–15.5 drafts | 3–4 days | Phase 6 |
| 9 | **Launch gate** | All section-20 tests as permanent e2e; ZAP on the protected preview; gitleaks; `npm audit` 0 high/critical; axe + Lighthouse + keyboard + screen reader; re-run the cache/permission probes on the 16.4.5 build; update this report to "OK with evidence" for every P0/P1 | 2 days | Before launch |

**Total:** about 25–31 working days. Packages 1–5 (the code P0s) are about 13–17 days.

### To add to OWNER_TODO.md (after your OK; not edited now)

- **GitHub:** turn on Dependabot alerts and security updates, and private vulnerability reporting (2.1.c, 2.3.d). Make the repo private and choose the plan (2.4.a, P1). Create `main` with a ruleset (2.4.b). Set Actions to read-only (2.4.d). Check secret-scanning alerts (2.4.f).
- **Keys:** list and rotate every key ever pasted or shown (2.4.g). Generate production secrets fresh on the hosting, and never copy the dev-only flags (12.2.b). Separate Google OAuth clients (3.3.b, 12.2.c). Restrict CARTO, Resend and Azure (12.2.c).
- **Vercel:** delete old deployments after every security upgrade (2.1.d). Standard Protection on previews, plus a separate preview database (12.1.a). Firewall rules (12.5.a). A bypass token for the ZAP scan (20.S1).
- **Neon:** TLS, an app role and a migration role (12.3.b), IP allow-list if offered (12.3.d), the backup plan and restore window (12.4.a), a restore test before launch and then monthly (12.4.d).
- **R2:** public bucket with no listing and CORS = our domain; private bucket with no public access (9.k); versioning or replication for photos (12.4.c).
- **Twilio:** geo permissions for Israel and Georgia in **both** Verify and Messaging, Fraud Guard on, Verify voice off (3.2.a/e). Max 5 check attempts (3.1.b).
- **Domain:** registrar 2-step, lock, auto-renew, WHOIS privacy (13.1). DNSSEC, CAA, clean records (13.2). A sending subdomain in Resend (13.3.a). DMARC `p=none` → `quarantine` → `reject` (13.3.b/c). The HSTS preload decision (10.1.c). Look-alike domains (14.4.d).
- **Monitoring:** a Sentry account (16.1), an uptime monitor (16.4), Search Console (already item 10).
- **Content:** company details (19.a, 15.11.a), your name for the About page (19.c), the accessibility coordinator (15.6.b), the support reply-time promise (19.b), the security contact email (18.1).
- **Lawyer:** privacy policy, Terms, database security level, accessibility exemption, spam rules and the weekly host email, GDPR, the `bayit_did` cookie, the retention times (15.x).
- **Providers:** accept each provider's data-processing terms (15.7.c).
- **Codespace:** the port stays Private; never share its address; delete old codespaces (2.4.i, 21.7). Check and delete the non-demo phone account (2.4.j).
- **Your accounts and habits:** all of section 21 (2-step everywhere, password manager, phone lock, SIM-swap PIN, never share codes, never paste "CAPTCHA" commands).
- **Launch day:** run `npm run security:check` and read the Next.js and React advisories (2.1.b). Practise the incident plan once (17.6).
- **Later:** a professional penetration test (20.R2).
