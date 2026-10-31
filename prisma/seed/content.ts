/**
 * Settings, banned words, saved support replies (real content, kept by demo removal) and the
 * example scam alert (demo content, "Demo:" title).
 */
import type { AppLocale, Localized } from "@/config/site";
import type { BannedWordAction, BannedWordCategory, PrismaClient } from "@/generated/prisma/client";
import { DEMO_SCAM_ALERT_ID, DEMO_TITLE_PREFIX } from "@/lib/demo";
import { L, assertLocalized } from "./lib";

// ─── Settings ──────────────────────────────────────────────────

/**
 * Only "Show demo data" is written (everything else stays on its default from @/lib/settings),
 * so the switch exists in Admin → Settings. Created once: re-seeding keeps the admin's choice.
 */
export async function seedSettings(db: PrismaClient): Promise<void> {
  await db.siteSetting.upsert({
    where: { key: "demoDataVisible" },
    create: { key: "demoDataVisible", value: true },
    update: {},
  });
}

// ─── Banned words ──────────────────────────────────────────────

export type BannedWordSeed = {
  phrase: string;
  /** null = checked in every language */
  locale: AppLocale | null;
  action: BannedWordAction;
  category: BannedWordCategory;
  weight: number;
};

const scam = (locale: AppLocale | null, phrase: string, weight: number, action: BannedWordAction = "FLAG"): BannedWordSeed => ({
  phrase,
  locale,
  action,
  category: "SCAM",
  weight,
});

export const BANNED_WORDS: BannedWordSeed[] = [
  // Payment channels scammers ask for (any language).
  scam(null, "western union", 35),
  scam(null, "moneygram", 35),
  scam(null, "bitcoin", 25),
  scam(null, "usdt", 25),
  scam(null, "paybox", 15),

  // "Send the deposit first" / "pay in advance by transfer"
  scam("en", "send the deposit first", 30),
  scam("en", "pay in advance by transfer", 25),
  scam("en", "payment before viewing", 25),
  scam("he", "שלחו קודם את הפיקדון", 30),
  scam("he", "תשלום מראש בהעברה", 25),
  scam("he", "העברה בביט לפני הצפייה", 30),
  scam("he", "פייבוקס לפני הצפייה", 30),
  scam("ru", "сначала отправьте залог", 30),
  scam("ru", "предоплата переводом", 25),
  scam("ru", "оплата до просмотра", 25),
  scam("ar", "أرسل العربون أولا", 30),
  scam("ar", "الدفع مقدما بالتحويل", 25),
  scam("ka", "ჯერ გადმორიცხეთ დეპოზიტი", 30),
  scam("ka", "წინასწარ გადარიცხვით", 25),

  // "I'm abroad, I'll mail you the keys"
  scam("en", "i am abroad", 20),
  scam("en", "i will mail you the keys", 40, "BLOCK"),
  scam("he", "אני נמצא בחול", 20),
  scam("he", "אשלח לכם את המפתחות בדואר", 40, "BLOCK"),
  scam("ru", "я сейчас за границей", 20),
  scam("ru", "вышлю ключи по почте", 40, "BLOCK"),
  scam("ar", "أنا خارج البلاد", 20),
  scam("ar", "سأرسل لك المفاتيح بالبريد", 35),
  scam("ka", "საზღვარგარეთ ვიმყოფები", 20),
  scam("ka", "გასაღებს ფოსტით გამოგიგზავნით", 35),

  // Gift cards and crypto
  scam("en", "gift card", 30),
  scam("en", "crypto", 20),
  scam("he", "כרטיס מתנה", 30),
  scam("he", "קריפטו", 20),
  scam("ru", "подарочная карта", 30),
  scam("ru", "криптовалюта", 20),
  scam("ar", "بطاقة هدايا", 30),
  scam("ar", "عملات رقمية", 20),
  scam("ka", "სასაჩუქრე ბარათი", 30),
  scam("ka", "კრიპტოვალუტა", 20),

  // Contact details belong in the contact step, not in the text.
  { phrase: "wa.me", locale: null, action: "FLAG", category: "CONTACT_INFO", weight: 15 },
  { phrase: "whatsapp me", locale: "en", action: "FLAG", category: "CONTACT_INFO", weight: 10 },
  { phrase: "כתבו לי בוואטסאפ", locale: "he", action: "FLAG", category: "CONTACT_INFO", weight: 10 },
  { phrase: "пишите в вотсап", locale: "ru", action: "FLAG", category: "CONTACT_INFO", weight: 10 },

  // Discriminatory terms (listing rules, fair housing).
  { phrase: "no foreigners", locale: "en", action: "BLOCK", category: "OFFENSIVE", weight: 40 },
  { phrase: "לא לזרים", locale: "he", action: "BLOCK", category: "OFFENSIVE", weight: 40 },
  { phrase: "только славянам", locale: "ru", action: "BLOCK", category: "OFFENSIVE", weight: 40 },
  { phrase: "ممنوع الأجانب", locale: "ar", action: "BLOCK", category: "OFFENSIVE", weight: 40 },
  { phrase: "უცხოელების გარეშე", locale: "ka", action: "FLAG", category: "OFFENSIVE", weight: 30 },
];

export async function seedBannedWords(db: PrismaClient): Promise<number> {
  for (const word of BANNED_WORDS) {
    const data = { action: word.action, category: word.category, weight: word.weight };
    // Compound unique lookups cannot match a NULL locale, so find first, then create or update.
    const existing = await db.bannedWord.findFirst({ where: { phrase: word.phrase, locale: word.locale }, select: { id: true } });
    if (existing) await db.bannedWord.update({ where: { id: existing.id }, data });
    else await db.bannedWord.create({ data: { phrase: word.phrase, locale: word.locale, ...data } });
  }
  return BANNED_WORDS.length;
}

// ─── Scam alert (demo) ─────────────────────────────────────────

const demo = (value: Localized): Localized =>
  Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, `${DEMO_TITLE_PREFIX} ${text}`])) as Localized;

export const DEMO_SCAM_ALERT = {
  title: demo(
    L(
      "ביקשו מכם פיקדון לפני שראיתם את הדירה?",
      "Asked for a deposit before you've seen the home?",
      "Просят залог до того, как вы увидели жильё?",
      "طُلب منك عربون قبل أن ترى المسكن؟",
      "ბინის ნახვამდე დეპოზიტს გთხოვენ?",
    ),
  ),
  body: L(
    "דפוס נפוץ: \"בעל דירה\" עם מחיר אטרקטיבי במיוחד אומר שיש הרבה מתעניינים ומבקש פיקדון בהעברה בנקאית, בביט או בפייבוקס לפני כל צפייה. לעולם אל תשלמו לפני שראיתם את הדירה – בעצמכם או בשיחת וידאו חיה – ובדקתם את בעל הדירה. דווחו על מודעות כאלה בכפתור \"דיווח\".",
    "A common pattern: an \"owner\" with an unusually attractive price says many people are interested and asks for a deposit by bank transfer, Bit or PayBox before any viewing. Never pay before you've seen the home – in person or on a live video call – and checked the owner. Report such listings with the Report button.",
    "Частая схема: «хозяин» с необычно выгодной ценой говорит, что желающих много, и просит залог переводом, через Bit или PayBox ещё до просмотра. Никогда не платите, пока не увидели жильё – лично или по видеосвязи – и не проверили владельца. Сообщайте о таких объявлениях кнопкой «Пожаловаться».",
    "نمط شائع: \"مالك\" بسعر مغرٍ على غير العادة يقول إن هناك الكثير من المهتمين ويطلب عربونًا بتحويل بنكي أو عبر Bit أو PayBox قبل أي معاينة. لا تدفع أبدًا قبل أن ترى المسكن – بنفسك أو في مكالمة فيديو مباشرة – وتتحقق من المالك. أبلغ عن مثل هذه الإعلانات بزر \"إبلاغ\".",
    "გავრცელებული სქემა: „მეპატრონე“ უჩვეულოდ მიმზიდველი ფასით ამბობს, რომ ბევრი მსურველია, და ნახვამდე დეპოზიტს ითხოვს საბანკო გადარიცხვით, Bit-ით ან PayBox-ით. არასოდეს გადაიხადოთ, სანამ ბინას არ ნახავთ – პირადად ან ცოცხალ ვიდეოზარში – და მეპატრონეს არ გადაამოწმებთ. ასეთ განცხადებებზე შეგვატყობინეთ ღილაკით „დარეკლამაცია“.",
  ),
};

export async function seedDemoScamAlert(db: PrismaClient): Promise<void> {
  assertLocalized(DEMO_SCAM_ALERT.title, "scam alert title");
  assertLocalized(DEMO_SCAM_ALERT.body, "scam alert body");
  const data = {
    title: DEMO_SCAM_ALERT.title,
    body: DEMO_SCAM_ALERT.body,
    severity: "WARNING" as const,
    active: true,
    showAsBanner: false,
  };
  await db.scamAlert.upsert({ where: { id: DEMO_SCAM_ALERT_ID }, create: { id: DEMO_SCAM_ALERT_ID, ...data }, update: data });
}

// ─── Saved replies (support) ───────────────────────────────────

export const SAVED_REPLIES: { id: string; title: string; body: Localized }[] = [
  {
    id: "saved-reply-scam-report-received",
    title: "Scam report received",
    body: L(
      "תודה שדיווחת. הצוות שלנו בודק עכשיו את המודעה ואת החשבון. בינתיים אל תעבירו כסף ושמרו את כל ההודעות. נעדכן אתכם כאן ברגע שנדע יותר.",
      "Thank you for reporting this. Our team is checking the listing and the account now. Please don't send any money and keep all the messages. We'll update you here as soon as we know more.",
      "Спасибо, что сообщили. Наша команда уже проверяет объявление и аккаунт. Пожалуйста, не переводите деньги и сохраните всю переписку. Мы напишем здесь, как только узнаем больше.",
      "شكرًا على الإبلاغ. يتحقق فريقنا الآن من الإعلان والحساب. من فضلك لا ترسل أي أموال واحتفظ بجميع الرسائل. سنوافيك هنا فور معرفة المزيد.",
      "გმადლობთ შეტყობინებისთვის. ჩვენი გუნდი ახლა ამოწმებს განცხადებას და ანგარიშს. გთხოვთ, ფული არ გადარიცხოთ და შეინახეთ ყველა შეტყობინება. მეტის გაგებისთანავე აქ მოგწერთ.",
    ),
  },
  {
    id: "saved-reply-how-to-verify-id",
    title: "How to verify your ID",
    body: L(
      "כדי לקבל את תג \"זהות מאומתת\": היכנסו לאזור האישי ← אימות, העלו תמונה ברורה של תעודה מזהה וסלפי ושלחו את הבקשה. חבר צוות בודק אותה בדרך כלל תוך שני ימי עבודה, והמסמכים נמחקים אחרי הבדיקה.",
      "To get the \"ID verified\" badge, open your dashboard → Verification, upload a clear photo of your ID and a selfie, and send the request. A team member usually reviews it within two working days, and the documents are deleted after the review.",
      "Чтобы получить значок «Личность подтверждена», откройте личный кабинет → Проверка, загрузите чёткое фото документа и селфи и отправьте заявку. Сотрудник обычно проверяет её в течение двух рабочих дней, а документы удаляются после проверки.",
      "للحصول على شارة \"تم التحقق من الهوية\"، افتح لوحة التحكم ← التحقق، وارفع صورة واضحة لهويتك وصورة سيلفي، ثم أرسل الطلب. يراجعه أحد أعضاء الفريق عادةً خلال يومي عمل، وتُحذف المستندات بعد المراجعة.",
      "ნიშნის „პირადობა დადასტურებულია“ მისაღებად გახსენით პირადი კაბინეტი → ვერიფიკაცია, ატვირთეთ პირადობის მოწმობის მკაფიო ფოტო და სელფი და გაგზავნეთ მოთხოვნა. გუნდის წევრი ჩვეულებრივ ორ სამუშაო დღეში განიხილავს მას, დოკუმენტები კი შემოწმების შემდეგ იშლება.",
    ),
  },
  {
    id: "saved-reply-listing-live-after-changes",
    title: "Listing approved after changes",
    body: L(
      "תודה שעדכנתם את המודעה – היא באוויר עכשיו. מודעה נשארת פעילה 60 יום, ואפשר לחדש אותה בלחיצה אחת. נשמח לעזור אם יש עוד משהו.",
      "Thanks for updating your listing – it is live now. Listings stay online for 60 days, and you can renew yours with one click. Let us know if there's anything else we can help with.",
      "Спасибо, что обновили объявление – теперь оно опубликовано. Объявление активно 60 дней, продлить его можно в один клик. Напишите, если нужна ещё помощь.",
      "شكرًا على تحديث إعلانك – إنه منشور الآن. يبقى الإعلان فعّالًا 60 يومًا، ويمكنك تجديده بنقرة واحدة. أخبرنا إن احتجت إلى أي مساعدة أخرى.",
      "გმადლობთ განცხადების განახლებისთვის – ის უკვე გამოქვეყნებულია. განცხადება 60 დღე რჩება აქტიური და მისი განახლება ერთი დაჭერით შეგიძლიათ. მოგვწერეთ, თუ კიდევ რამეში დაგეხმარებით.",
    ),
  },
];

export async function seedSavedReplies(db: PrismaClient): Promise<number> {
  for (const reply of SAVED_REPLIES) {
    assertLocalized(reply.body, `saved reply ${reply.id}`);
    await db.savedReply.upsert({
      where: { id: reply.id },
      create: { id: reply.id, title: reply.title, body: reply.body },
      update: { title: reply.title, body: reply.body },
    });
  }
  return SAVED_REPLIES.length;
}
