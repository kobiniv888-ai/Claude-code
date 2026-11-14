# What to do if something goes wrong (incident plan)

For the founder, in plain words. SECURITY_REPORT section 17. Read it once now, practise it once
before launch (section 7), and open it the moment something looks wrong: an alert you did not
expect, a guest who says a stranger knew their address, a host who sees changes they did not make,
a message from a researcher, a key you pasted in the wrong place.

**Golden rules**

1. **Stay calm and write things down.** Open a private note (not in this repository, not in a
   shared chat) and write the time and what you see, every step. You will need it for the report
   and for the authorities.
2. **First stop the damage, then find out, then tell, then fix.** The four steps below, in order.
3. **Never paste a key, a password or someone's personal data** into a chat, an email, a ticket or
   this repository while you work. Talk about keys by their **name** only.
4. **When in doubt, call the lawyer early.** The 72-hour clock (section 3) starts when you know.

---

## The first 15 minutes (checklist)

- [ ] Note the time, what you saw and where (the alert email, the screenshot, the message).
- [ ] Is it still going on, or could it spread? Then **turn on maintenance mode** (1.1).
- [ ] Could someone be logged in who should not be (a staff account, a stolen session)? Then
      **sign everyone out** (1.2).
- [ ] Could a key or password be known to someone else? Then **change it** (1.3), starting with the
      one you think leaked.
- [ ] Tell the developer. Tell the lawyer if personal data might be involved (it usually is).
- [ ] Do **not** delete logs, accounts, listings or messages: they are the evidence (section 2).

---

## 1. Contain: stop the damage

### 1.1 Maintenance mode: take the site offline in one step

While it is on, every public page shows a calm page in the visitor's language ("We'll be back in a
few minutes", status 503 with "try again in 10 minutes"), and the website's own connections answer
the same in their data form. Guests with a booking are told that the address and the host's
contact details are in their booking confirmation email. Still working: the health check, the
scheduled jobs (so backups and your security alerts keep running), the signed messages from the
email and Telegram services, `/.well-known/security.txt`, photos, and **only you** (an ADMIN account
with its 2-step code entered) can use the site and the admin panel. Moderators and support wait
like everyone else. No text-message codes go out while it is on.

Two switches, use either one:

- **From the admin panel (fastest):** Admin → **תחזוקה / Maintenance** → **כלים לשעת חירום /
  Emergency tools** → **הפעלת מצב תחזוקה / Turn on maintenance mode**. It asks for a fresh code
  from your authenticator app. Within about 10 seconds every server shows the maintenance page.
  Turn it off with the same button (**כיבוי מצב תחזוקה / Turn off maintenance mode**).
- **From the hosting (works even if the database or the admin panel is down):** Vercel → the
  project → Settings → Environment Variables → add `MAINTENANCE_MODE` = `on` (Production) →
  Deployments → the latest one → **Redeploy**. To open the site again, delete the setting and
  redeploy. While this switch is on, the admin button cannot turn it off.

Fail-safe rules (built in, `src/lib/maintenance/`): any value of `MAINTENANCE_MODE` other than
`on`/`off` counts as **on**; if the check of who you are fails, you count as a visitor. Each switch
is written to the audit log and alerts you by email and Telegram.

### 1.2 Sign everyone out

Admin → Maintenance → Emergency tools → **ניתוק כולם / Sign everyone out** (asks for a fresh
authenticator code). It ends **every login of every account on every device**: guests, hosts and
all staff, except your own browser. Everyone has to log in again; staff also enter their 2-step
code again. It is written to the audit log and alerts you.

What it does **not** change (they are not logins):

- calendar export links of hosts (a host replaces theirs under the calendar settings; the old link
  stops working at once);
- shared list links (the owner can stop sharing);
- "remembered devices" (they only decide whether a new-device alert is sent);
- your own login in this browser. To end that too, log out. To end **absolutely every** login
  including yours at once, change `BETTER_AUTH_SECRET` (1.3).

### 1.3 Change ("rotate") keys

Change first the key you think leaked; if you do not know which, change all the "change now" ones.
Every key is made **fresh at the provider or with `openssl rand`**, put into Vercel → Settings →
Environment Variables (Production), and takes effect after **Redeploy**. Never reuse a codespace
key: the real site refuses to start with one.

| Key (setting name) | Where to make a new one | What happens when it changes | When |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` | everyone is logged out (also you) | change now if a login may be stolen |
| `DATABASE_URL` (password of `bayit_app`) | Neon → Roles → `bayit_app` → Reset password; build the new address (docs/DATABASE_ROLES.md) | a few seconds of errors until the redeploy | change now |
| `MIGRATION_DATABASE_URL` (password of `bayit_migrate`) and the Neon account | Neon → Roles → Reset password; Neon account → change password, check 2-step | nothing on the site | change now |
| `CRON_SECRET` | `openssl rand -hex 32` | scheduled jobs use the new one after the redeploy | change now |
| `RESEND_API_KEY` | Resend → API Keys → create a new "sending access" key for the domain, delete the old | emails pause until the redeploy | change now |
| `RESEND_WEBHOOK_SECRET` | Resend → Webhooks → the endpoint → rotate the signing secret | bounce reports wait until the redeploy | change now |
| `TWILIO_AUTH_TOKEN` | Twilio Console → Account → API keys & tokens → secondary token → promote it to primary | texts pause until the redeploy | change now |
| `TELEGRAM_BOT_TOKEN` | Telegram → @BotFather → `/revoke` → your bot; then set the webhook again (OWNER_TODO, Telegram step) | Telegram alerts pause until done | change now |
| `TELEGRAM_WEBHOOK_SECRET` | any long random text; set the webhook again with it | as above | with the bot token |
| `GOOGLE_CLIENT_SECRET` (and `APPLE_CLIENT_SECRET`) | Google Cloud → APIs & Services → Credentials → the production client → reset secret | Google login fails until the redeploy | change now |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → the widget → rotate secret | forms refuse for a minute | change now |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (photos) | Cloudflare → R2 → Manage API tokens → new token for the two buckets, delete the old | uploads fail until the redeploy | change now |
| `OFFSITE_S3_ACCESS_KEY_ID` / `OFFSITE_S3_SECRET_ACCESS_KEY` | Backblaze → a new key for the backup bucket (docs/BACKUPS.md step 3), then delete the old key | the next weekly copy uses the new one | change now |
| `AZURE_TRANSLATOR_KEY` / `GOOGLE_TRANSLATE_API_KEY` | Azure portal → the Translator resource → Keys → regenerate / Google Cloud → Credentials | translations pause until the redeploy | change now |
| `MALWARE_SCAN_TOKEN` | the scanner's console | uploads use built-in checks until the redeploy | change now |
| `SENTRY_DSN` | Sentry → Project → Client Keys → new key, disable the old | nothing visible | if it was posted publicly |
| `NEXT_PUBLIC_MAP_TILE_KEY` | CARTO → API keys (keep it limited to your domain) | maps blank until the redeploy | if someone else uses it |
| `HASH_SALT` | `openssl rand -hex 16` | staff 2-step sessions end; **every recovery code stops working** (each staff member makes new ones: Settings → Security → "New codes"); login codes in flight die; the per-connection counters start again | only if it leaked |
| `APP_ENCRYPTION_KEY` | **not alone**: ask the developer | the 2-step secrets and private files (ID documents, ticket screenshots) are sealed with it: they would become unreadable | only with a re-encryption plan |
| `FIELD_ENCRYPTION_KEY` | **not alone**: `docs/security/field-encryption.md` → "Key rotation" (old key into `FIELD_ENCRYPTION_KEY_PREVIOUS`, then `npm run db:encrypt-fields`) | exact addresses, pins and guest phones are sealed with it | only by the rotation steps |
| `BACKUP_ENCRYPTION_KEY` | `openssl rand -base64 32`, save it offline | new copies use the new key; **keep the old key offline** as long as copies made with it exist (60 days and more) | if it leaked |
| `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` (with the public key) | every browser that turned notifications on stops getting them and must turn them on again | only if it leaked |

Also change the passwords and check the 2-step login of the **accounts** behind them: Vercel,
Neon, GitHub, Cloudflare, Backblaze, Resend, Twilio, Google, Sentry, the domain registrar and your
email. Remove any session or device there that you do not recognise.

**Keys that were ever shown or pasted** (SECURITY_REPORT 2.4.g; names only, never values). Tick
each one once it was changed after being shown:

- [ ] Resend · [ ] Twilio · [ ] Telegram bot · [ ] Google OAuth · [ ] Azure / Google translation ·
  [ ] CARTO · [ ] Turnstile · [ ] VAPID · [ ] R2 · [ ] other: ______

---

## 2. Assess: what data, how many people, since when

Answer three questions in your note, with the numbers: **What** kind of data (addresses, phones,
emails, messages, ID documents, logins)? **How many** people (guests, hosts, staff)? **Since
when** (the first sign, and when it was stopped)?

Where to look:

1. **Your alert emails / Telegram messages** of the last days (they say what was counted, never
   who).
2. **Admin → יומן פעולות / Audit log**: every staff action, with who and when (kept 1 year).
3. **The security event log**, with the queries below (kept 90 days: **copy the results into
   your note today**, before they age out).
4. Sentry (errors), Vercel → Logs (requests; kept only a short time on most plans), Neon →
   Monitoring, Resend → Emails (what was sent), Twilio → Monitor → Logs (texts sent).

**The queries.** Neon → your project → **SQL Editor** (the `main` branch). They only read. The
`ipHash` is a fingerprint of a connection, never the address itself; `userId` is the account's
internal number (open it in Admin → Users).

```sql
-- A. What happened, day by day (last 14 days)
SELECT date_trunc('day', "createdAt") AS day, type, count(*)
FROM "SecurityEvent" WHERE "createdAt" > now() - interval '14 days'
GROUP BY 1, 2 ORDER BY 1, 2;

-- B. The busiest connections for failures, refusals and links that matched nothing (7 days)
SELECT "ipHash", type, count(*) AS n, min("createdAt") AS first, max("createdAt") AS last
FROM "SecurityEvent"
WHERE type IN ('login_failed', 'permission_denied', 'id_not_found', 'rate_limited')
  AND "createdAt" > now() - interval '7 days' AND "ipHash" IS NOT NULL
GROUP BY 1, 2 ORDER BY n DESC LIMIT 20;

-- C. Which accounts one connection touched (paste an ipHash from B)
SELECT "userId", type, count(*), min("createdAt"), max("createdAt")
FROM "SecurityEvent" WHERE "ipHash" = '<ipHash>' AND "userId" IS NOT NULL
GROUP BY 1, 2 ORDER BY 4;

-- D. Staff logins and 2-step events (30 days)
SELECT e."createdAt", e.type, e."userId", u.role, e.meta
FROM "SecurityEvent" e JOIN "User" u ON u.id = e."userId"
WHERE u.role <> 'USER' AND e.type IN ('login_success', 'new_device_login', 'totp_locked',
  'totp_unlock_email', 'recovery_code_used', 'sensitive_change', 'staff_session_idle_logout')
  AND e."createdAt" > now() - interval '30 days'
ORDER BY 1 DESC;

-- E. Every staff action in the suspect period (put in the times)
SELECT "createdAt", "actorId", action, "targetType", "targetId"
FROM "AuditLog" WHERE "createdAt" BETWEEN '2026-01-01 00:00' AND '2026-01-02 00:00'
ORDER BY 1;

-- F. Data that left through the site's own features in that period
SELECT type, count(*) AS events, count(DISTINCT "userId") AS accounts
FROM "SecurityEvent"
WHERE type IN ('data_export', 'contact_revealed', 'account_deleted', 'booking_cap_hit', 'show_contact_cap_hit')
  AND "createdAt" BETWEEN '2026-01-01 00:00' AND '2026-01-02 00:00'
GROUP BY 1;

-- G. How many people the site holds data about (the upper limit of "how many")
SELECT
  (SELECT count(*) FROM "User" WHERE "isDemo" = false AND "deletedAt" IS NULL) AS accounts,
  (SELECT count(*) FROM "User" WHERE role <> 'USER' AND "isDemo" = false) AS staff,
  (SELECT count(*) FROM "Listing" WHERE "isDemo" = false) AS listings,
  (SELECT count(*) FROM "Booking" WHERE "checkOut" > now() - interval '3 months') AS bookings_with_guest_contacts,
  (SELECT count(*) FROM "Session" WHERE "expiresAt" > now()) AS active_logins;
```

Write down for each query what you ran and what it showed (counts, not names). The developer can
turn the result into a list of the affected accounts, with their language, for section 3.

---

## 3. Notify: who to tell, and when

The lawyer decides the details; this is the default. **The clock starts when you know**, not when
it started.

| Who | When | How |
|---|---|---|
| **The lawyer** | at once | phone, then a short email with your note's facts |
| **Israel: the Privacy Protection Authority** (הרשות להגנת הפרטיות, Ministry of Justice) | as soon as possible ("immediately" for a serious incident under the Data Security Regulations); the lawyer says whether it is one | the authority's online form for reporting a security incident (on gov.il); keep the confirmation |
| **Georgia: the Personal Data Protection Service** (პერსონალურ მონაცემთა დაცვის სამსახური) | **within 72 hours** of learning about it, unless it is unlikely to cause harm (the lawyer decides) | the service's official website (personaldata.ge): its incident form or the address it lists; keep the confirmation |
| Other countries | if people from the EU (or elsewhere) are affected, the lawyer checks whether their authority must be told too (often also 72 hours) | as the lawyer says |
| **The people affected** | without delay when there is a real risk to them (the lawyer confirms); always in **their own language** | by email from the site (the developer sends one per language from the list of section 2); a short notice on the site if many are affected |
| The provider involved (hosting, database, email…) | when the problem may be on their side | their support page (section 5) |

Keep in your note: whom you told, when, how, and their reference number.

### Message to the people affected: templates

Fill in the parts in [brackets]. Keep it short, true and calm; no guesses. Never promise what you
do not know. Send each person the language of their account.

**עברית**

> **נושא:** הודעה חשובה על אבטחת החשבון שלך ב־Bayit
>
> שלום [שם],
>
> ב־[תאריך] גילינו [מה קרה, במשפט אחד פשוט]. ייתכן שהמידע הבא שלך נחשף: [אילו פרטים, למשל כתובת מייל ומספר טלפון]. [פרטי תשלום לא נשמרים אצלנו ולא נחשפו.]
>
> מה עשינו: [עצרנו את הבעיה ב־…, ניתקנו את כל החשבונות, החלפנו מפתחות, דיווחנו לרשויות].
>
> מה כדאי לעשות: [היכנסו מחדש לחשבון ובדקו את הפרטים בהגדרות]. היזהרו מהודעות שמבקשות מכם לשלם או למסור קוד – אנחנו אף פעם לא מבקשים קוד כניסה בטלפון או בהודעה.
>
> לשאלות אפשר לענות למייל הזה או לפתוח פנייה בעמוד העזרה. אנחנו מצטערים על כך ופועלים כדי שזה לא יקרה שוב.
>
> צוות Bayit

**English**

> **Subject:** Important notice about the security of your Bayit account
>
> Hello [name],
>
> On [date] we discovered [what happened, in one plain sentence]. The following information of yours may have been exposed: [which details, e.g. email address and phone number]. [We do not store payment details, so they were not exposed.]
>
> What we did: [stopped the problem on …, signed everyone out, changed our keys, reported it to the authorities].
>
> What you can do: [log in again and check your details in Settings]. Be careful with messages that ask you to pay or to give a code: we never ask for a login code by phone or message.
>
> If you have questions, reply to this email or open a ticket on the Help page. We are sorry, and we are working to make sure it does not happen again.
>
> The Bayit team

**Русский**

> **Тема:** Важное сообщение о безопасности вашего аккаунта Bayit
>
> Здравствуйте, [имя]!
>
> [Дата] мы обнаружили, что [что произошло, одним простым предложением]. Могли быть раскрыты следующие ваши данные: [какие, например адрес электронной почты и номер телефона]. [Платёжные данные мы не храним, поэтому они не пострадали.]
>
> Что мы сделали: [остановили проблему …, завершили все сеансы входа, заменили ключи, сообщили в надзорные органы].
>
> Что можно сделать вам: [войдите снова и проверьте свои данные в настройках]. Будьте осторожны с сообщениями, в которых просят заплатить или назвать код: мы никогда не спрашиваем код входа по телефону или в сообщении.
>
> Если у вас есть вопросы, ответьте на это письмо или создайте обращение на странице помощи. Приносим извинения и делаем всё, чтобы это не повторилось.
>
> Команда Bayit

**العربية**

> **الموضوع:** إشعار مهم بشأن أمان حسابك في Bayit
>
> مرحبًا [الاسم]،
>
> في [التاريخ] اكتشفنا أن [ما حدث، في جملة واحدة بسيطة]. ربما تكون المعلومات التالية الخاصة بك قد كُشفت: [أي تفاصيل، مثل البريد الإلكتروني ورقم الهاتف]. [نحن لا نحتفظ ببيانات الدفع، لذلك لم تُكشف.]
>
> ما قمنا به: [أوقفنا المشكلة في …، وأنهينا جميع جلسات الدخول، وغيّرنا مفاتيحنا، وأبلغنا الجهات المختصة].
>
> ما يمكنك فعله: [سجّل الدخول من جديد وتحقّق من بياناتك في الإعدادات]. احذر من الرسائل التي تطلب منك الدفع أو إعطاء رمز: نحن لا نطلب أبدًا رمز الدخول عبر الهاتف أو في رسالة.
>
> إذا كانت لديك أسئلة، ردّ على هذا البريد أو افتح طلب دعم في صفحة المساعدة. نعتذر عمّا حدث، ونعمل حتى لا يتكرر.
>
> فريق Bayit

**ქართული**

> **თემა:** მნიშვნელოვანი შეტყობინება თქვენი Bayit-ის ანგარიშის უსაფრთხოების შესახებ
>
> გამარჯობა, [სახელი],
>
> [თარიღი] აღმოვაჩინეთ, რომ [რა მოხდა, ერთი მარტივი წინადადებით]. შესაძლოა, გამჟღავნდა თქვენი შემდეგი მონაცემები: [რომელი, მაგალითად ელფოსტის მისამართი და ტელეფონის ნომერი]. [გადახდის მონაცემებს არ ვინახავთ, ამიტომ ისინი არ გამჟღავნებულა.]
>
> რა გავაკეთეთ: [შევაჩერეთ პრობლემა …, დავასრულეთ ყველა შესვლის სესია, შევცვალეთ გასაღებები, ვაცნობეთ ზედამხედველ ორგანოებს].
>
> რისი გაკეთება შეგიძლიათ: [ხელახლა შედით ანგარიშში და შეამოწმეთ თქვენი მონაცემები პარამეტრებში]. ფრთხილად იყავით შეტყობინებებთან, რომლებიც გთხოვთ გადახდას ან კოდის გაზიარებას: შესვლის კოდს არასდროს ვითხოვთ ტელეფონით ან შეტყობინებით.
>
> თუ კითხვები გაქვთ, უპასუხეთ ამ წერილს ან გახსენით მიმართვა დახმარების გვერდზე. ბოდიშს გიხდით და ყველაფერს ვაკეთებთ, რომ ეს აღარ განმეორდეს.
>
> Bayit-ის გუნდი

A short notice for the site (if many people are affected), in the same five languages, can be the
first two paragraphs of the message above.

---

## 4. Fix and review: a short report

When the site is safe again (maintenance mode off, keys changed, the hole closed and tested), write
a one-page report within a week. Keep it in your private place; the developer keeps a copy without
personal data.

```text
Incident report: [short name]                         Written by: [name]   Date: [date]

1. Summary (two sentences): what happened and what it meant for people.
2. Timeline (Israel time): first sign · noticed · contained · fixed · site open again.
3. Impact: what data, how many people (from section 2), which countries.
4. Cause: how it happened, in plain words (no blame, just the facts).
5. What we did right away: maintenance mode? signed everyone out? keys changed (names)?
6. The fix: what changed in the site or the accounts, and the test that proves it.
7. Who we told: authorities (date, reference), people affected (date, how many, languages), lawyer.
8. So it does not happen again: 1–3 concrete changes, each with an owner and a date.
9. Open questions.
```

---

## 5. Contacts

Roles and companies only. **Write the names, account e-mails, phone numbers and account numbers in
your password manager or another private place, never in this repository.**

| Role | Company (today) | What they can do for you | Where to reach them |
|---|---|---|---|
| Hosting | Vercel | logs, firewall, roll back a deployment, account security | vercel.com → Help (support form); status: the Vercel status page |
| Database | Neon | restore to a point in time, reset role passwords, logs | Neon console → Support; status: the Neon status page |
| Domain registrar | [to choose] | domain lock, DNS changes, transfer protection | the registrar's support page |
| DNS / CDN (if used) | Cloudflare | block traffic, firewall rules, R2 photo storage keys | Cloudflare dashboard → Support |
| Email sending | Resend | stop a leaked key, see what was sent | Resend dashboard → Support |
| Text messages (SMS) | Twilio | stop texts, change the auth token, fraud (SMS pumping) | Twilio Console → Help & Support |
| Off-site backup | Backblaze (B2) | the locked weekly copies | Backblaze → Help |
| Error tracking | Sentry | errors around the incident time | sentry.io → Support |
| Code | GitHub | who pushed what, revoke tokens | GitHub → Settings → Security log; support.github.com |
| Login with Google | Google Cloud | reset the OAuth client secret | Google Cloud console → APIs & Services → Credentials |
| Telegram alerts | Telegram (@BotFather) | revoke the bot token | Telegram app → @BotFather |
| Lawyer (Israel) | [name in your private place] | decides on notifications, drafts them | [private] |
| Lawyer / advisor (Georgia) | [name in your private place] | the Georgian authority, local rules | [private] |
| Authority (Israel) | Privacy Protection Authority | receives incident reports | the official gov.il website |
| Authority (Georgia) | Personal Data Protection Service | receives incident reports (72 hours) | the official personaldata.ge website |
| Developer | [name in your private place] | everything in the code | [private] |

**Facts to fill in** (in your private place, and the non-secret ones here):

- Neon plan and its **restore window** (how far back point-in-time restore goes): ________
- Where the off-site backup key is kept (the place, not the key): ________
- Who has ADMIN in the admin panel (names in your private place; the count here): ____

---

## 6. Before launch: the security address and the alerts

- `SECURITY_CONTACT_EMAIL` (a private hosting setting) is the address researchers write to
  (`/.well-known/security.txt` and the "Report a security problem" page). Read it at least every
  few days; answer within a week ("we got it, we are looking"). Once a year, check that it still
  works.
- The hourly security alerts go to `ADMIN_ALERT_EMAIL` and to Telegram
  (`ADMIN_ALERT_TELEGRAM_CHAT_ID`). What they mean is in each alert; "Was it you or your team? Then
  nothing to do."

---

## 7. Practise once before launch (about an hour, on the staging or preview site)

Do it with the developer, on a site with fake data only. Time each step.

1. **Alert:** the developer makes one harmless alert happen (for example a few wrong 2-step codes
   on a test staff account). Check that the email **and** the Telegram message arrive within the
   hour, and that they show counts only.
2. **Maintenance mode from the admin panel:** turn it on; open the site on your phone in Hebrew and
   in English (you see the calm page), open `/api/health` (it answers), log in to the admin panel
   (it works for you, not for a moderator account); turn it off.
3. **Maintenance mode from the hosting:** set `MAINTENANCE_MODE=on`, redeploy, check, remove it,
   redeploy.
4. **Sign everyone out:** log in on a second device with a test account, press "Sign everyone
   out", check the second device is logged out and you are not.
5. **Change one key:** change `CRON_SECRET` on staging and redeploy; run one job by hand with the
   new secret.
6. **Assess:** run queries A and D of section 2 on the staging database and read the result.
7. **Notify:** fill in the Hebrew template for a made-up case; read it aloud: is it clear?
8. **Restore test:** docs/BACKUPS.md → "Restore test".
9. **Report:** write the one-page report of this drill (section 4), with the times.

Then once a year, or after a big change, do steps 1, 2, 4 and 8 again.
