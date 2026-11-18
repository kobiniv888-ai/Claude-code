# Hebrew wording — what changed and what is left for you

Founder's rule: rewrite text only on the redesigned pages (every public page now); report awkward
Hebrew in the internal pages (admin, account) instead of changing it. The other 4 languages were
checked for the same three concepts (the demo label, "all", the host term).

## Changed (public pages)

### One word for demo content: "דמו"
- Jewish-life places: the per-card note is now "נקודת דמו — לא מקום אמיתי" (was "נקודה לדוגמה"),
  and the map popup note "נקודת דמו, לא מקום אמיתי" (`jewishLife.places.demoNote`,
  `map.community.demoNote`).
- The demo map points (`prisma/seed/jewish-places.ts`, seed re-run): "בית כנסת לדוגמה — טביליסי
  (דמו)" instead of "… (נקודת הדגמה)", and the description "זו נקודת דמו לבדיקת המפה…".
  Other languages: "Sample synagogue — Tbilisi (demo)", "Пример синагоги — Тбилиси (демо)",
  "كنيس نموذجي — تبليسي (تجريبي)", "სანიმუშო სინაგოგა — თბილისი (დემო)" (before: "Demo synagogue
  … (sample point)", which said "demo" twice in English and Arabic).
- The demo badge hint on a listing: "תוכן דמו לניסיון האתר — לא מודעה אמיתית" (all 5 languages:
  "Demo content … — not a real listing").
- Already "דמו" before this pass: listing cards, the listing page badge, the banner, `ds`, `common`.

### "הכל" (your spelling) instead of "הכול"
`search`, `common` (clearAll, seeAll, all), `jewishLife`, `cookies`, `about`, `howItWorks`,
`wizard`, `tickets`, `legal`. Other languages already used one word each; two "clear all" strings
were unified (ru "Сбросить всё", ka "ყველაფრის გასუფთავება").

### Host terms: "מארח" for stays and hotels, "מפרסם" for sale listings
- Headings already did this ("המארח" / "המפרסם", "מארח/ת" / "מפרסם/ת" in the host card).
- Sentences that said "המפרסם" on every listing now either name the right person or need no name:
  - with the deal type known: the email dialog ("שליחת אימייל למארח" / "…למפרסם"), the calendar
    (only on rentals: "המארח מעדכן את היומן", "בקשו מהמארח לאשר…");
  - without a name: "יצירת קשר" (sheet title), "שיחת טלפון" (call button), "לפני שיוצרים קשר"
    (safety tip), "עכשיו שבת — התשובה תגיע במוצאי שבת", "השעה המקומית" in the host card,
    "עדיין אין תיאור למודעה הזו", "את הכתובת המדויקת תקבלו אחרי שתיצרו קשר", "תורגם ידנית",
    "אי אפשר ליצור קשר דרך המודעה הזו".
- Arabic used the same "المعلِن" (advertiser) everywhere and got the same treatment ("المضيف" for
  stays). English ("owner"), Russian ("владелец") and Georgian ("მესაკუთრე") use one neutral word
  that fits every deal type, so they were left as they are.

### Small fixes
- "חבר/ה מאז" → "באתר מאז" (listing host card and the owner profile).
- "קוד חד-פעמי" → "קוד חד־פעמי" (maqaf, sign-in).
- The filters' deal control: "קצר" → "יומי" (pairs with "חודשי"). The same short label was also
  odd in English ("Short" → "Nightly"), Arabic ("قصير" → "يومي") and Georgian ("მოკლე" → "დღიური").
- Shabbat checklist: a missing sukkah now reads "אין מקום לסוכה" (plain text, ✗ icon) instead of a
  struck-through "מקום לסוכה". The other checklist items keep the ✓/✗ with strike-through.
- "כדי לזכור מה אהבת": already plural ("אהבתם") everywhere — nothing left to change.
- Jewish life: "הצגת הכל (13)" / "הצגת פחות" for the shortened places list.
- Account greeting for demo accounts: "שלום, Yossi (דמו)" (the personal part of "Demo Owner —
  Yossi") or "שלום! זה חשבון דמו" when the name has none ("Demo Admin"). The names stay "Demo …"
  so they never pass for real hosts.

## Not changed — for you to decide (admin and account internals)

- **"הדגמה" in admin:** `admin.markers.demo` = "הדגמה" (the moderation list). The admin content
  screens say "לדוגמה" for the demo flag (`adminContent.places.isDemo` "מקום לדוגמה",
  `…demoLabel`, `…demoBadge`, "נתוני הדוגמה" in the settings). "דמו" would match the public site.
- **"הכול":** `admin.filters.all`, `admin.reports.listingReports` ("בסך הכול"),
  `adminContent.common.all`, `adminContent.roles.roleHints.ADMIN`, `account.meta.description`,
  `account.overview.attention.allGood`, `account.listings.filters.all`, `account.compare.clear`,
  and one email (`emails.ticketStatusHint.RESOLVED`).
- **Singular slash forms in the account pages**, while the public site speaks in the plural
  ("שמרתם", "אתם"): `account.verification.lead` ("שאת/ה … בעל/ת … האמיתי/ת"),
  `account.settings.profile.languages` ("שאת/ה מדבר/ת"), `…profile.keepsShabbat` ("שומר/ת"),
  `…keepsShabbatHint` ("תענה/י"), `…email.hintWithLogin` ("תוסיף/י"),
  `…notifications.email.marketing.hint` ("תפעיל/י"), `account.listings.toast.pause`
  ("שתפעיל/י"), `adminContent.roles.you` ("את/ה"). The account overview also mixes "שלך"
  (singular) with plural elsewhere.
- **Owner-facing notices on the listing page** still say "המפרסם" (`listing.errors.OWNER_INACTIVE`
  "חשבון המפרסם…", shown to the owner or staff only). Fine as they are, listed for completeness.
- **The admin dashboard greeting** (it prints the full name) shows "Demo Admin" for the
  demo staff accounts. It is internal; the account page now handles demo names (above).
