/**
 * Demo accounts (isDemo). Sign in with the phone number and the development code that the
 * login form shows (no Twilio configured) — Better Auth's phone-number plugin finds the user by
 * phoneNumber, so no Account/password rows are created.
 */
import type { AppLocale } from "@/config/site";
import type { AccountType, PrismaClient, UserRole } from "@/generated/prisma/client";
import { DEMO_EMAIL_DOMAIN } from "@/lib/demo";
import { PLEDGE_CURRENT_VERSION } from "@/lib/pledge";
import { daysFromNow } from "./lib";

export type DemoUserKey =
  | "admin"
  | "moderator"
  | "support"
  | "editor"
  | "yossi"
  | "natela"
  | "michael"
  | "rivka"
  | "hotel"
  | "guesthouse"
  | "guest";

export type DemoUserSeed = {
  key: DemoUserKey;
  name: string;
  phone: string;
  role: UserRole;
  locale: AppLocale;
  spokenLanguages: string[];
  accountType?: AccountType;
  businessName?: string;
  keepsShabbat?: boolean;
  showHebrewDates?: boolean;
  bio?: string;
  idVerified?: boolean;
  businessVerified?: boolean;
  avgReplyMinutes?: number;
  replyRate?: number;
  /** Days since the account was created. */
  joinedDaysAgo: number;
};

export const DEMO_USERS: DemoUserSeed[] = [
  { key: "admin", name: "Demo Admin", phone: "+995555000001", role: "ADMIN", locale: "he", spokenLanguages: ["he", "en", "ru"], joinedDaysAgo: 120 },
  { key: "moderator", name: "Demo Moderator", phone: "+995555000002", role: "MODERATOR", locale: "ru", spokenLanguages: ["ru", "ka", "en"], joinedDaysAgo: 110 },
  { key: "support", name: "Demo Support", phone: "+995555000003", role: "SUPPORT", locale: "he", spokenLanguages: ["he", "en", "ar"], joinedDaysAgo: 105 },
  { key: "editor", name: "Demo Editor", phone: "+995555000004", role: "EDITOR", locale: "en", spokenLanguages: ["en", "ka", "he"], joinedDaysAgo: 100 },
  {
    key: "yossi",
    name: "Demo Owner — Yossi",
    phone: "+995555000011",
    role: "USER",
    locale: "he",
    spokenLanguages: ["he", "en", "ru"],
    keepsShabbat: true,
    showHebrewDates: true,
    bio: "גר בטביליסי כבר שמונה שנים עם המשפחה. משכיר כמה דירות בוואקה, בסבורטלו ובעיר העתיקה, ושמח לעזור לאורחים עם מניין, אוכל כשר וטיפים לעיר.",
    avgReplyMinutes: 35,
    replyRate: 96,
    joinedDaysAgo: 95,
  },
  {
    key: "natela",
    name: "Demo Owner — Natela",
    phone: "+995555000012",
    role: "USER",
    locale: "ka",
    spokenLanguages: ["ka", "ru", "he"],
    bio: "Родилась в Кутаиси, в семье грузинских евреев. Сдаю квартиры и дом в Кутаиси и Тбилиси, всегда помогаю гостям с трансфером из аэропорта.",
    idVerified: true,
    avgReplyMinutes: 60,
    replyRate: 90,
    joinedDaysAgo: 88,
  },
  {
    key: "michael",
    name: "Demo Owner — Michael",
    phone: "+995555000013",
    role: "USER",
    locale: "en",
    spokenLanguages: ["en", "he"],
    bio: "Israeli investor living between Tel Aviv and Batumi. I own a few new-build apartments by the sea and know the local market well.",
    avgReplyMinutes: 90,
    replyRate: 85,
    joinedDaysAgo: 70,
  },
  {
    key: "rivka",
    name: "Demo Owner — Rivka",
    phone: "+995555000014",
    role: "USER",
    locale: "he",
    spokenLanguages: ["he", "en"],
    keepsShabbat: true,
    showHebrewDates: true,
    bio: "משפחה דתית מירושלים עם בתים בגודאורי ובבקוריאני. הכול מוכן לשבת ולמשפחות גדולות – גם בחורף וגם בקיץ.",
    avgReplyMinutes: 120,
    replyRate: 92,
    joinedDaysAgo: 80,
  },
  {
    key: "hotel",
    name: "Demo Hotel Batumi",
    phone: "+995555000015",
    role: "USER",
    locale: "en",
    spokenLanguages: ["en", "he", "ru", "ka"],
    accountType: "BUSINESS",
    businessName: "Demo Hotel Batumi",
    bio: "A sample family hotel near the sea in Batumi with kosher breakfast and Shabbat meals.",
    businessVerified: true,
    avgReplyMinutes: 15,
    replyRate: 99,
    joinedDaysAgo: 75,
  },
  {
    key: "guesthouse",
    name: "Demo Guesthouse Kutaisi",
    phone: "+995555000016",
    role: "USER",
    locale: "ka",
    spokenLanguages: ["ka", "ru", "en"],
    accountType: "BUSINESS",
    businessName: "Demo Guesthouse Kutaisi",
    bio: "საოჯახო სასტუმრო ქუთაისის ცენტრში, ეზოთი და საერთო სამზარეულოთი.",
    avgReplyMinutes: 45,
    replyRate: 94,
    joinedDaysAgo: 65,
  },
  { key: "guest", name: "Demo Guest — Noa", phone: "+995555000021", role: "USER", locale: "he", spokenLanguages: ["he", "en"], joinedDaysAgo: 30 },
];

export function demoUserId(key: DemoUserKey): string {
  return `demo-user-${key}`;
}

export function demoUserEmail(key: DemoUserKey): string {
  return `${key}@${DEMO_EMAIL_DOMAIN}`;
}

export function demoUser(key: DemoUserKey): DemoUserSeed {
  const user = DEMO_USERS.find((u) => u.key === key);
  if (!user) throw new Error(`Unknown demo user ${key}`);
  return user;
}

/** Demo accounts that post listings. */
const DEMO_HOSTS: ReadonlySet<DemoUserKey> = new Set(["yossi", "natela", "michael", "rivka", "hotel", "guesthouse"]);

export async function seedUsers(db: PrismaClient, now: Date): Promise<number> {
  const adminId = demoUserId("admin");
  // The admin first, so idVerifiedById can point at it.
  for (const user of DEMO_USERS) {
    const id = demoUserId(user.key);
    const joined = daysFromNow(-user.joinedDaysAgo, now, 9);
    // Every demo host accepted the current Bayit welcome pledge (the green badge on their listings).
    const isHost = DEMO_HOSTS.has(user.key);
    const data = {
      name: user.name,
      email: demoUserEmail(user.key),
      emailVerified: false,
      phoneNumber: user.phone,
      phoneNumberVerified: true,
      role: user.role,
      status: "ACTIVE" as const,
      accountType: user.accountType ?? "PRIVATE",
      businessName: user.businessName ?? null,
      bio: user.bio ?? null,
      spokenLanguages: user.spokenLanguages,
      locale: user.locale,
      timezone: "Asia/Tbilisi",
      keepsShabbat: user.keepsShabbat ?? false,
      showHebrewDates: user.showHebrewDates ?? false,
      idVerifiedAt: user.idVerified ? daysFromNow(-user.joinedDaysAgo + 5, now, 11) : null,
      idVerifiedById: user.idVerified ? adminId : null,
      businessVerifiedAt: user.businessVerified ? daysFromNow(-user.joinedDaysAgo + 3, now, 11) : null,
      // No invented response times or reply rates on the site, not even for demo hosts.
      avgReplyMinutes: null,
      replyRate: null,
      // Booking alerts (round 3, src/lib/alerts): demo hosts get them by email, which for demo
      // accounts stays in the dev outbox and counts as delivered (instant booking works in the
      // codespace). Telegram and browser notifications are on as soon as someone connects them.
      notificationPrefs: isHost ? { alerts: { channels: { email: true, telegram: true, push: true } } } : undefined,
      welcomePledgeVersion: isHost ? PLEDGE_CURRENT_VERSION : null,
      welcomePledgeAcceptedAt: isHost ? daysFromNow(-user.joinedDaysAgo + 1, now, 10) : null,
      lastSeenAt: daysFromNow(-(user.joinedDaysAgo % 3), now, 8),
      isDemo: true,
      createdAt: joined,
    };
    await releaseDemoPhone(db, id, user.phone);
    await db.user.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  return DEMO_USERS.length;
}

/**
 * Logging in with a demo phone number before the demo data exists creates an ordinary account
 * that holds that number, and the demo user could then never be created (unique phone number).
 * Such an account came from the phone login (placeholder e-mail), so it is removed; any other
 * account keeps its data and only lets go of the number.
 */
async function releaseDemoPhone(db: PrismaClient, demoId: string, phone: string): Promise<void> {
  const holder = await db.user.findUnique({
    where: { phoneNumber: phone },
    select: { id: true, email: true, isDemo: true },
  });
  if (!holder || holder.id === demoId) return;
  if (!holder.isDemo && holder.email.endsWith("@phone.bayit.invalid")) {
    await db.user.delete({ where: { id: holder.id } });
    console.log(`  · removed an account created by logging in with the demo number ${phone}`);
  } else {
    await db.user.update({ where: { id: holder.id }, data: { phoneNumber: null, phoneNumberVerified: false } });
    console.log(`  · detached the demo number ${phone} from another account`);
  }
}
