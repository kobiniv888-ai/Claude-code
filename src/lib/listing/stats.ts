import "server-only";
import { headers } from "next/headers";
import type { AppLocale } from "@/config/site";
import type { ContactChannel, DealType } from "@/generated/prisma/enums";
import { pickLocalized } from "@/i18n/locale";
import { dateToDay, dayToDate, tbilisiToday } from "@/lib/booking/dates";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { CONTACT_CHANNELS } from "@/lib/listing/fields";
import { getClientIp, getDeviceHash, getUserAgent } from "@/lib/request";
import {
  BOOKED_STATUSES,
  bookingSeries,
  emptyTotals,
  hotelOccupancy,
  isBookableDeal,
  periodDays,
  stayOccupancy,
  type Occupancy,
  type StatsStay,
  type StatsTotals,
} from "./stats-math";
import {
  dailyAccountVisitorId,
  dailyVisitorId,
  daySecretInput,
  isPrefetchRequest,
  skipReason,
  statsDedupeExpiry,
  statsDedupeKey,
  type StatsEvent,
  type StatsListing,
} from "./stats-rules";

/**
 * Listing statistics for the host (round 3, brief 6.2; server-only).
 *
 *   await recordListingView(listing.id, user);                 // trackListingView (after the page shows)
 *   await recordSave(listing.id, +1, user);                    // toggleFavorite (−1 when removed)
 *   await recordContactClick(listing.id, "WHATSAPP", user);    // recordContactTap
 *   const stats = await getListingStats({ id, dealType }, 30, locale);  // the stats page (owner only!)
 *
 * Who counts is decided in ./stats-rules.ts (each visitor once a day; never the host, staff, bots,
 * prefetches or demo listings), the numbers in ./stats-math.ts. Per day the counts live in
 * ListingStatDaily; Listing.viewCount / contactCount / saveCount are the all-time counters (admin
 * review page). Bookings and booked nights come from Booking rows (CONFIRMED / COMPLETED).
 * Days are Georgian days. The pages that show any of this check that the viewer owns the listing:
 * guests never see it.
 */

export type StatsViewerInput = { id: string; isStaff?: boolean } | null | undefined;

const CHANNELS = new Set<string>([...CONTACT_CHANNELS, "CHAT"]);

const listingFacts = { status: true, isDemo: true, ownerId: true } as const;

async function daySecret(day: string): Promise<string> {
  return hmacHash(daySecretInput(day));
}

/**
 * The first time today this visitor does this: claims the dedupe key (INSERT … ON CONFLICT DO
 * NOTHING). Throws on a database error, so nothing is counted then.
 */
async function firstToday(event: StatsEvent, day: string, listingId: string, visitorId: string, channel?: string): Promise<boolean> {
  const key = statsDedupeKey(event, day, listingId, visitorId, channel);
  const { count } = await db.rateLimit.createMany({
    data: [{ key, count: 1, resetAt: statsDedupeExpiry(day) }],
    skipDuplicates: true,
  });
  return count === 1;
}

/** This device was signed in to the host's account or to any staff account (DeviceLink). */
async function deviceOfHostOrStaff(deviceHash: string | null, ownerId: string): Promise<boolean> {
  if (!deviceHash) return false;
  const link = await db.deviceLink.findFirst({
    where: { deviceHash, OR: [{ userId: ownerId }, { user: { role: { not: "USER" } } }] },
    select: { id: true },
  });
  return link !== null;
}

/**
 * Counts one view of a LIVE, non-demo listing: once per visitor per day (the anonymous daily ID
 * from the IP and the browser), never the host (signed in, or on a device they signed in on),
 * staff, bots or prefetches. Returns true when the view was counted.
 */
export async function recordListingView(listingId: string, viewer?: StatsViewerInput): Promise<boolean> {
  try {
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: listingFacts });
    if (!listing) return false;
    const requestHeaders = await headers();
    const [ip, userAgent, deviceHash] = await Promise.all([getClientIp(), getUserAgent(), getDeviceHash()]);
    const request = { userAgent, prefetch: isPrefetchRequest((name) => requestHeaders.get(name)) };
    const who = { userId: viewer?.id ?? null, isStaff: !!viewer?.isStaff };
    if (skipReason(listing, who, request)) return false;
    if (await deviceOfHostOrStaff(deviceHash, listing.ownerId)) return false;

    const day = tbilisiToday();
    const visitor = dailyVisitorId(await daySecret(day), ip, userAgent);
    if (!(await firstToday("view", day, listingId, visitor))) return false;

    const { count } = await db.listing.updateMany({ where: { id: listingId, status: "LIVE" }, data: { viewCount: { increment: 1 } } });
    if (count === 0) return false;
    await db.$executeRaw`
      INSERT INTO "ListingStatDaily" ("listingId", "date", "views")
      VALUES (${listingId}, ${dayToDate(day)}::date, 1)
      ON CONFLICT ("listingId", "date") DO UPDATE SET "views" = "ListingStatDaily"."views" + 1`;
    return true;
  } catch (error) {
    console.error("[stats] could not record a view:", error);
    return false;
  }
}

/**
 * One tap on a contact button of a LIVE, non-demo listing: once per visitor per day per contact
 * method, never by the host or staff. Writes a ContactClick row (the channel and the time,
 * NEVER who tapped: founder's answer 8), Listing.contactCount and the day's count per channel.
 * The viewer's id is used only for the host/staff check and the anonymous daily ID.
 */
export async function recordContactClick(listingId: string, channel: ContactChannel, viewer: StatsViewerInput): Promise<boolean> {
  if (!CHANNELS.has(channel)) throw new Error(`recordContactClick: unknown channel "${channel}"`);
  try {
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: listingFacts });
    if (!listing) return false;
    if (skipReason(listing, { userId: viewer?.id ?? null, isStaff: !!viewer?.isStaff })) return false;

    const day = tbilisiToday();
    const secret = await daySecret(day);
    const visitor = viewer?.id ? dailyAccountVisitorId(secret, viewer.id) : dailyVisitorId(secret, await getClientIp(), await getUserAgent());
    if (!(await firstToday("contact", day, listingId, visitor, channel))) return false;

    const { count } = await db.listing.updateMany({ where: { id: listingId, status: "LIVE" }, data: { contactCount: { increment: 1 } } });
    if (count === 0) return false;
    await db.$transaction([
      db.contactClick.create({ data: { listingId, channel } }),
      db.$executeRaw`
        INSERT INTO "ListingStatDaily" ("listingId", "date", "contacts", "contactsByChannel")
        VALUES (${listingId}, ${dayToDate(day)}::date, 1, jsonb_build_object(${channel}::text, 1))
        ON CONFLICT ("listingId", "date") DO UPDATE SET
          "contacts" = "ListingStatDaily"."contacts" + 1,
          "contactsByChannel" = COALESCE("ListingStatDaily"."contactsByChannel", '{}'::jsonb)
            || jsonb_build_object(${channel}::text,
                 COALESCE(("ListingStatDaily"."contactsByChannel" ->> ${channel}::text)::int, 0) + 1)`,
    ]);
    return true;
  } catch (error) {
    console.error("[stats] could not record a contact click:", error);
    return false;
  }
}

/**
 * A favorite was added (+1) or removed (−1) by `viewer`.
 * - Listing.saveCount ("saved by N people now") follows both, for everyone but the host and staff,
 *   and never on demo listings (never below 0).
 * - The day's "saves" counts each account once per day per LIVE listing, with the same rules.
 */
export async function recordSave(listingId: string, delta: 1 | -1, viewer: StatsViewerInput): Promise<void> {
  try {
    const listing = await db.listing.findUnique({ where: { id: listingId }, select: listingFacts });
    if (!listing) return;
    const who = { userId: viewer?.id ?? null, isStaff: !!viewer?.isStaff };
    // The all-time counter ignores the status (a paused listing can still be un-saved).
    const reason = skipReason({ ...listing, status: "LIVE" } satisfies StatsListing, who);
    if (reason) return;

    if (delta < 0) {
      await db.$executeRaw`UPDATE "Listing" SET "saveCount" = GREATEST(0, "saveCount" - 1) WHERE "id" = ${listingId}`;
      return;
    }
    await db.listing.updateMany({ where: { id: listingId }, data: { saveCount: { increment: 1 } } });
    if (listing.status !== "LIVE") return;

    const day = tbilisiToday();
    const secret = await daySecret(day);
    const visitor = viewer?.id ? dailyAccountVisitorId(secret, viewer.id) : dailyVisitorId(secret, await getClientIp(), await getUserAgent());
    if (!(await firstToday("save", day, listingId, visitor))) return;
    await db.$executeRaw`
      INSERT INTO "ListingStatDaily" ("listingId", "date", "saves")
      VALUES (${listingId}, ${dayToDate(day)}::date, 1)
      ON CONFLICT ("listingId", "date") DO UPDATE SET "saves" = "ListingStatDaily"."saves" + 1`;
  } catch (error) {
    console.error("[stats] could not record a save:", error);
  }
}

// ─── Reading (owner-only pages and the weekly email) ─────────────────────────

export type ChannelCounts = Partial<Record<ContactChannel, number>>;

export type ListingStatsDay = StatsTotals & {
  /** "YYYY-MM-DD" (Georgia). */
  date: string;
  contactsByChannel: ChannelCounts;
};

export type RoomTypeStats = Occupancy & { id: string; name: string; quantity: number };

export type ListingStats = {
  /** Days in the period (7 or 30), today included. */
  range: number;
  days: ListingStatsDay[];
  /** Sums over `days`. */
  totals: StatsTotals;
  /** Contact taps per method over `days`. */
  byChannel: ChannelCounts;
  /** Short stays and hotels: bookings, booked nights and occupancy are shown. */
  bookable: boolean;
  /** Short stays and hotels; null otherwise. Hotels: room-nights. */
  occupancy: Occupancy | null;
  /** Hotels: per room type (empty otherwise). */
  roomTypes: RoomTypeStats[];
  /** Since the listing was created (the counters on Listing). */
  allTime: { views: number; contacts: number; saves: number };
};

function parseChannels(value: unknown): ChannelCounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ChannelCounts = {};
  for (const [channel, count] of Object.entries(value as Record<string, unknown>)) {
    if (CHANNELS.has(channel) && typeof count === "number" && count > 0) out[channel as ContactChannel] = count;
  }
  return out;
}

/** Bookings that stand (CONFIRMED / COMPLETED) made in the period or with nights in it. */
async function loadStays(listingIds: string[], first: string, last: string): Promise<(StatsStay & { listingId: string })[]> {
  if (listingIds.length === 0) return [];
  const from = dayToDate(first);
  const toExclusive = dayToDate(tbilisiNextDay(last));
  const rows = await db.booking.findMany({
    where: {
      listingId: { in: listingIds },
      status: { in: [...BOOKED_STATUSES] },
      OR: [
        { checkIn: { lt: toExclusive }, checkOut: { gt: from } },
        // Made in the period (Georgian days: UTC+4, so a little wider, filtered below).
        { createdAt: { gte: new Date(from.getTime() - 4 * 3600_000), lt: new Date(toExclusive.getTime()) } },
      ],
    },
    select: { listingId: true, checkIn: true, checkOut: true, rooms: true, roomTypeId: true, createdAt: true },
  });
  return rows.map((row) => ({
    listingId: row.listingId,
    checkIn: dateToDay(row.checkIn),
    checkOut: dateToDay(row.checkOut),
    rooms: row.rooms,
    roomTypeId: row.roomTypeId,
    bookedOn: tbilisiToday(row.createdAt),
  }));
}

function tbilisiNextDay(day: string): string {
  return dateToDay(new Date(dayToDate(day).getTime() + 86_400_000));
}

/**
 * The stats page: a daily series for the last `range` days (today included, missing days as
 * zeros), the totals, contact taps per method and, for short stays and hotels, bookings,
 * booked nights and occupancy (hotels per room type too). The CALLER checks ownership.
 */
export async function getListingStats(
  listing: { id: string; dealType: DealType | string },
  range: number,
  locale: AppLocale,
  today: string = tbilisiToday(),
): Promise<ListingStats> {
  const days = periodDays(today, range);
  const first = days[0];
  const bookable = isBookableDeal(listing.dealType);
  const hotel = listing.dealType === "HOTEL_ROOM";

  const [counters, rows, stays, roomTypes] = await Promise.all([
    db.listing.findUnique({ where: { id: listing.id }, select: { viewCount: true, contactCount: true, saveCount: true } }),
    db.listingStatDaily.findMany({ where: { listingId: listing.id, date: { gte: dayToDate(first), lte: dayToDate(today) } } }),
    bookable ? loadStays([listing.id], first, today) : Promise.resolve([]),
    hotel
      ? db.roomType.findMany({
          where: { listingId: listing.id },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, names: true, quantity: true, active: true },
        })
      : Promise.resolve([]),
  ]);
  const byDay = new Map(rows.map((row) => [dateToDay(row.date), row]));
  const bookingsByDay = bookingSeries(stays, days);

  const series: ListingStatsDay[] = [];
  const totals = emptyTotals();
  const byChannel: ChannelCounts = {};
  for (const date of days) {
    const row = byDay.get(date);
    const contactsByChannel = parseChannels(row?.contactsByChannel);
    const booked = bookingsByDay.get(date) ?? { bookings: 0, bookedNights: 0 };
    const day: ListingStatsDay = {
      date,
      views: row?.views ?? 0,
      saves: row?.saves ?? 0,
      contacts: row?.contacts ?? 0,
      bookings: bookable ? booked.bookings : 0,
      bookedNights: bookable ? booked.bookedNights : 0,
      contactsByChannel,
    };
    totals.views += day.views;
    totals.saves += day.saves;
    totals.contacts += day.contacts;
    totals.bookings += day.bookings;
    totals.bookedNights += day.bookedNights;
    for (const [channel, count] of Object.entries(contactsByChannel)) {
      byChannel[channel as ContactChannel] = (byChannel[channel as ContactChannel] ?? 0) + count;
    }
    series.push(day);
  }

  let occupancy: Occupancy | null = null;
  let roomTypeStats: RoomTypeStats[] = [];
  if (hotel) {
    const result = hotelOccupancy(stays, roomTypes, days);
    occupancy = result.total;
    const names = new Map(roomTypes.map((room) => [room.id, pickLocalized(room.names, locale)]));
    roomTypeStats = result.byRoomType.map((room) => ({ ...room, name: names.get(room.id) ?? "" }));
  } else if (bookable) {
    occupancy = stayOccupancy(stays, days);
  }

  return {
    range: days.length,
    days: series,
    totals,
    byChannel,
    bookable,
    occupancy,
    roomTypes: roomTypeStats,
    allTime: { views: counters?.viewCount ?? 0, contacts: counters?.contactCount ?? 0, saves: counters?.saveCount ?? 0 },
  };
}

/**
 * Totals of the last `range` days for several listings at once ("הנכסים שלי" cards, the weekly
 * email). Bookings and booked nights only for short stays and hotels. The CALLER checks that the
 * listings belong to the viewer.
 */
export async function getStatsTotals(
  listings: readonly { id: string; dealType: DealType | string }[],
  range: number,
  lastDay: string = tbilisiToday(),
): Promise<Map<string, StatsTotals>> {
  const result = new Map(listings.map((listing) => [listing.id, emptyTotals()]));
  if (listings.length === 0) return result;
  const days = periodDays(lastDay, range);
  const first = days[0];
  const ids = listings.map((listing) => listing.id);
  const bookableIds = listings.filter((listing) => isBookableDeal(listing.dealType)).map((listing) => listing.id);

  const [sums, stays] = await Promise.all([
    db.listingStatDaily.groupBy({
      by: ["listingId"],
      where: { listingId: { in: ids }, date: { gte: dayToDate(first), lte: dayToDate(lastDay) } },
      _sum: { views: true, saves: true, contacts: true },
    }),
    loadStays(bookableIds, first, lastDay),
  ]);
  for (const row of sums) {
    const totals = result.get(row.listingId);
    if (!totals) continue;
    totals.views = row._sum.views ?? 0;
    totals.saves = row._sum.saves ?? 0;
    totals.contacts = row._sum.contacts ?? 0;
  }
  const staysByListing = new Map<string, StatsStay[]>();
  for (const stay of stays) staysByListing.set(stay.listingId, [...(staysByListing.get(stay.listingId) ?? []), stay]);
  for (const [listingId, list] of staysByListing) {
    const totals = result.get(listingId);
    if (!totals) continue;
    for (const value of bookingSeries(list, days).values()) {
      totals.bookings += value.bookings;
      totals.bookedNights += value.bookedNights;
    }
  }
  return result;
}

/** The user has (or had) a listing: shows the weekly stats email switch in the settings. */
export async function hasHostListings(userId: string): Promise<boolean> {
  const count = await db.listing.count({ where: { ownerId: userId, deletedAt: null, status: { not: "DELETED" } } });
  return count > 0;
}
