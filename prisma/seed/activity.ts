/**
 * Demo activity so the dashboards and the admin panel have something to show: the guest's
 * favorites, 30 days of stats and contact clicks for owner #1 (Yossi), two open reports, two
 * support tickets and a pending ID verification request. Everything hangs off demo users and
 * listings, so removing demo data removes it too.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { daysFromNow, generateDailyStats, georgiaDate, randomInt, seededRandom } from "./lib";
import { ALL_LISTINGS, demoListingId } from "./listings";
import { contactMethodsFor } from "./listings/timeline";
import { demoUser, demoUserId } from "./users";

const STATS_DAYS = 30;

/** Owner #1's listings with dashboard stats: listing number → [first, last] day with traffic and base views. */
const OWNER_STATS: { n: number; until: number; baseViews: number }[] = [
  { n: 1, until: 0, baseViews: 38 },
  { n: 2, until: 0, baseViews: 24 },
  { n: 3, until: 0, baseViews: 30 },
  { n: 6, until: -10, baseViews: 34 }, // paused 10 days ago
];

const FAVORITES: { n: number; note: string; daysAgo: number }[] = [
  { n: 1, note: "לפסח – לשאול אם אפשר לקבל את המטבח מוכשר", daysAgo: 6 },
  { n: 3, note: "קרוב לבית הכנסת, מטבח כשר. לבדוק תאריכים לשבת חתן", daysAgo: 12 },
  { n: 16, note: "נוף לים! לבדוק אם פנוי בסוף אוגוסט", daysAgo: 3 },
  { n: 20, note: "לחנוכה עם כל המשפחה – מקום ל-10", daysAgo: 9 },
  { n: 23, note: "ארוחת בוקר כשרה. לשאול על שעות הבריכה הנפרדות", daysAgo: 2 },
];

export async function seedActivity(db: PrismaClient, now: Date): Promise<Record<string, number>> {
  const guestId = demoUserId("guest");

  // ─── Favorites ───
  for (const fav of FAVORITES) {
    const listingId = demoListingId(fav.n);
    await db.favorite.upsert({
      where: { userId_listingId: { userId: guestId, listingId } },
      create: { userId: guestId, listingId, note: fav.note, createdAt: daysFromNow(-fav.daysAgo, now, 18) },
      update: { note: fav.note, createdAt: daysFromNow(-fav.daysAgo, now, 18) },
    });
  }

  // ─── Owner #1: daily stats and contact clicks ───
  const owner = demoUser("yossi");
  let statRows = 0;
  let clickRows = 0;
  for (const entry of OWNER_STATS) {
    const seed = ALL_LISTINGS.find((l) => l.n === entry.n);
    if (!seed) throw new Error(`No demo listing ${entry.n}`);
    const listingId = demoListingId(entry.n);
    const publishedDay = seed.status === "EXPIRED" ? -(seed.days + 60) : -seed.days;
    const channels = (contactMethodsFor(seed, owner.phone) ?? []).map((m) => m.channel);
    const stats = generateDailyStats({
      seed: `stats-${listingId}`,
      from: -(STATS_DAYS - 1),
      to: entry.until,
      publishedDay,
      baseViews: entry.baseViews,
      channels,
      now,
    });

    await db.listingStatDaily.deleteMany({ where: { listingId } });
    await db.contactClick.deleteMany({ where: { listingId } });
    await db.listingStatDaily.createMany({
      data: stats.map((s) => ({
        listingId,
        date: georgiaDate(s.day, now),
        views: s.views,
        contacts: s.contacts,
        saves: s.saves,
        contactsByChannel: s.contactsByChannel,
      })),
    });
    statRows += stats.length;

    const rand = seededRandom(`clicks-${listingId}`);
    const clicks = stats.flatMap((s) =>
      Object.entries(s.contactsByChannel).flatMap(([channel, count]) =>
        Array.from({ length: count ?? 0 }, () => ({
          listingId,
          channel: channel as (typeof channels)[number],
          userId: rand() < 0.25 ? guestId : null,
          createdAt: new Date(georgiaDate(s.day, now).getTime() + randomInt(rand, 5, 18) * 3600 * 1000 + randomInt(rand, 0, 59) * 60 * 1000),
        })),
      ),
    );
    if (clicks.length > 0) await db.contactClick.createMany({ data: clicks });
    clickRows += clicks.length;

    // Counters on the card: older traffic before the 30-day window + the window itself.
    const olderDays = Math.max(0, -publishedDay - STATS_DAYS);
    const views = stats.reduce((sum, s) => sum + s.views, 0) + olderDays * entry.baseViews;
    const contacts = clicks.length + Math.round((olderDays * entry.baseViews) / 18);
    const saves = stats.reduce((sum, s) => sum + s.saves, 0) + (FAVORITES.some((f) => f.n === entry.n) ? 1 : 0);
    await db.listing.update({ where: { id: listingId }, data: { viewCount: views, contactCount: contacts, saveCount: saves } });
  }

  // ─── Two open reports on one listing ───
  const reported = demoListingId(17);
  const reports = [
    {
      id: "demo-report-wrong-price",
      reporterId: guestId,
      reason: "WRONG_PRICE" as const,
      details: "במודעה כתוב 650 דולר לחודש, אבל בטלפון אמרו לי 800 דולר ועוד עמלה.",
      createdAt: daysFromNow(-2, now, 15),
    },
    {
      id: "demo-report-already-rented",
      reporterId: demoUserId("rivka"),
      reason: "ALREADY_RENTED" as const,
      details: "Called today – they said the flat was rented a week ago, but the listing is still up.",
      createdAt: daysFromNow(-1, now, 11),
    },
  ];
  for (const report of reports) {
    const data = { targetType: "LISTING" as const, listingId: reported, status: "OPEN" as const, handledById: null, handledAt: null, resolution: null, ...report };
    await db.report.upsert({ where: { id: report.id }, create: data, update: data });
  }
  await db.listing.update({ where: { id: reported }, data: { reportCount: reports.length } });

  // ─── Support tickets ───
  const supportId = demoUserId("support");
  const scamTicketAt = daysFromNow(-1, now, 19);
  await upsertTicket(db, {
    id: "demo-ticket-scam-report",
    userId: guestId,
    category: "SCAM_REPORT",
    priority: "URGENT",
    status: "OPEN",
    subject: "מישהו ביקש ממני מקדמה לפני שראיתי את הדירה",
    listingId: demoListingId(16),
    assignedToId: supportId,
    locale: "he",
    createdAt: scamTicketAt,
    messages: [
      {
        authorId: guestId,
        body: "שלום, אחרי שלחצתי על וואטסאפ במודעה הזו כתב לי מספר אחר, לא זה שמופיע במודעה. הוא אמר שהוא בעל הדירה, שיש עוד שלוש משפחות שמתעניינות, וביקש 200 דולר מקדמה בהעברה עוד היום כדי לשמור לי את התאריכים. זה נראה לי חשוד, ולא שילמתי.",
        minutesAfter: 0,
      },
      {
        authorId: guestId,
        body: "עוד משהו: הוא שלח לי גם קישור לתשלום שנראה כמו דף של האתר. לא לחצתי עליו.",
        minutesAfter: 12,
      },
      {
        authorId: supportId,
        fromStaff: true,
        internal: true,
        body: "Checked: the number that wrote to the guest is not the owner's verified phone. Looks like impersonation. Asked the owner to confirm; if we see more of these, publish a scam alert.",
        minutesAfter: 95,
      },
    ],
  });

  const verificationTicketAt = daysFromNow(-20, now, 10);
  await upsertTicket(db, {
    id: "demo-ticket-verification-question",
    userId: demoUserId("natela"),
    category: "ACCOUNT_VERIFICATION",
    priority: "NORMAL",
    status: "RESOLVED",
    subject: "Сколько времени занимает проверка документов?",
    listingId: null,
    assignedToId: supportId,
    locale: "ru",
    createdAt: verificationTicketAt,
    rating: 5,
    ratingComment: "Быстро и понятно, спасибо!",
    messages: [
      {
        authorId: demoUserId("natela"),
        body: "Здравствуйте! Три дня назад я загрузила паспорт и селфи для проверки личности. Подскажите, сколько обычно занимает проверка и нужно ли что-то ещё?",
        minutesAfter: 0,
      },
      {
        authorId: supportId,
        fromStaff: true,
        body: "Здравствуйте, Натела! Спасибо за терпение. Ваши документы проверены, значок «Личность подтверждена» уже виден в профиле. Сами файлы после проверки удалены. Хорошего дня!",
        minutesAfter: 240,
      },
      {
        authorId: demoUserId("natela"),
        body: "Вижу значок, большое спасибо!",
        minutesAfter: 300,
      },
    ],
  });

  // ─── A pending ID verification (no real files) ───
  const verification = {
    userId: demoUserId("michael"),
    type: "ID" as const,
    status: "PENDING" as const,
    documents: [],
    userNote: "Demo request – no real documents are attached. I'd like the ID-verified badge for my Batumi listings.",
    reviewedById: null,
    reviewedAt: null,
    decisionReason: null,
    createdAt: daysFromNow(-2, now, 13),
  };
  await db.verificationRequest.upsert({
    where: { id: "demo-verification-michael-id" },
    create: { id: "demo-verification-michael-id", ...verification },
    update: verification,
  });

  return { favorites: FAVORITES.length, statDays: statRows, contactClicks: clickRows, reports: reports.length, tickets: 2, verifications: 1 };
}

type TicketSeed = {
  id: string;
  userId: string;
  category: "SCAM_REPORT" | "ACCOUNT_VERIFICATION";
  priority: "NORMAL" | "URGENT";
  status: "OPEN" | "RESOLVED";
  subject: string;
  listingId: string | null;
  assignedToId: string;
  locale: "he" | "ru";
  createdAt: Date;
  rating?: number;
  ratingComment?: string;
  messages: { authorId: string; body: string; minutesAfter: number; fromStaff?: boolean; internal?: boolean }[];
};

async function upsertTicket(db: PrismaClient, ticket: TicketSeed) {
  const at = (minutes: number) => new Date(ticket.createdAt.getTime() + minutes * 60 * 1000);
  const lastMessageAt = at(Math.max(...ticket.messages.map((m) => m.minutesAfter)));
  const data = {
    userId: ticket.userId,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    listingId: ticket.listingId,
    assignedToId: ticket.assignedToId,
    locale: ticket.locale,
    rating: ticket.rating ?? null,
    ratingComment: ticket.ratingComment ?? null,
    lastMessageAt,
    closedAt: null,
    createdAt: ticket.createdAt,
  };
  await db.ticket.upsert({ where: { id: ticket.id }, create: { id: ticket.id, ...data }, update: data });
  await db.ticketMessage.deleteMany({ where: { ticketId: ticket.id } });
  await db.ticketMessage.createMany({
    data: ticket.messages.map((m, i) => ({
      id: `${ticket.id}-message-${i + 1}`,
      ticketId: ticket.id,
      authorId: m.authorId,
      fromStaff: m.fromStaff ?? false,
      internal: m.internal ?? false,
      body: m.body,
      createdAt: at(m.minutesAfter),
    })),
  });
}

