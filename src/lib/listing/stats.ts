import "server-only";
import { CONTACT_CHANNELS } from "@/lib/listing/fields";
import type { ContactChannel } from "@/generated/prisma/enums";
import { hmacHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getDeviceHash, getIpHash, getUserAgent } from "@/lib/request";

/**
 * Listing statistics for the owner dashboard (server-only).
 *
 *   await recordListingView(listing.id, { viewerId: user?.id });   // from a server action / route
 *   await recordContactClick(listing.id, "WHATSAPP", user?.id ?? null);
 *   await recordSave(listing.id, +1);   // favorite added (−1 when removed)
 *   const stats = await getListingStats(listing.id, 30);
 *
 * Counters live on Listing (viewCount, contactCount, saveCount — for cards) and per day in
 * ListingStatDaily (charts). Days are Georgia days (UTC+4, no daylight saving).
 * Record views from a server action or route handler after the page is shown, not while
 * rendering: prefetches and bots would count otherwise. Ownership of the stats page is the
 * caller's check.
 */

/** Georgia has been on UTC+4 all year since 2005. */
const GEORGIA_OFFSET_MS = 4 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** "YYYY-MM-DD" of `date` in Georgia. */
export function georgiaDay(date: Date = new Date()): string {
  return new Date(date.getTime() + GEORGIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** The value stored in ListingStatDaily.date (a DATE column) for a "YYYY-MM-DD" day. */
function dayValue(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

const BOT_USER_AGENT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|viber|skype|discord|slack|headless|lighthouse|pingdom|monitor|curl|wget|python|java\/|go-http|axios|node-fetch/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT_USER_AGENT.test(userAgent);
}

/**
 * Counts one view of a LIVE listing. The same device (or IP when there is no device cookie)
 * counts once per listing per day — a hashed key in RateLimit, so nothing personal is stored.
 * The owner's own views and bots are not counted. Returns true when the view was counted.
 */
export async function recordListingView(
  listingId: string,
  opts: { viewerId?: string | null } = {},
): Promise<boolean> {
  try {
    if (isBotUserAgent(await getUserAgent())) return false;
    const listing = await db.listing.findFirst({ where: { id: listingId, status: "LIVE" }, select: { ownerId: true } });
    if (!listing || (opts.viewerId && listing.ownerId === opts.viewerId)) return false;

    const visitor = (await getDeviceHash()) ?? (await getIpHash());
    const day = georgiaDay();
    if (visitor) {
      const key = `view:${hmacHash(`${listingId}|${visitor}|${day}`).slice(0, 48)}`;
      const { ok } = await rateLimit(key, { limit: 1, windowSeconds: DAY_MS / 1000 });
      if (!ok) return false;
    }
    const { count } = await db.listing.updateMany({
      where: { id: listingId, status: "LIVE" },
      data: { viewCount: { increment: 1 } },
    });
    if (count === 0) return false;
    await db.$executeRaw`
      INSERT INTO "ListingStatDaily" ("listingId", "date", "views")
      VALUES (${listingId}, ${dayValue(day)}::date, 1)
      ON CONFLICT ("listingId", "date") DO UPDATE SET "views" = "ListingStatDaily"."views" + 1`;
    return true;
  } catch (error) {
    console.error("[stats] could not record a view:", error);
    return false;
  }
}

const CHANNELS = new Set<string>([...CONTACT_CHANNELS, "CHAT"]);

/**
 * One tap on a contact button of a LIVE listing: a ContactClick row, Listing.contactCount and
 * the day's contacts per channel. Taps by the owner are not counted.
 */
export async function recordContactClick(
  listingId: string,
  channel: ContactChannel,
  userId: string | null,
): Promise<boolean> {
  if (!CHANNELS.has(channel)) throw new Error(`recordContactClick: unknown channel "${channel}"`);
  try {
    const { count } = await db.listing.updateMany({
      where: { id: listingId, status: "LIVE", ...(userId ? { ownerId: { not: userId } } : {}) },
      data: { contactCount: { increment: 1 } },
    });
    if (count === 0) return false;
    const day = georgiaDay();
    await db.$transaction([
      db.contactClick.create({ data: { listingId, channel, userId } }),
      db.$executeRaw`
        INSERT INTO "ListingStatDaily" ("listingId", "date", "contacts", "contactsByChannel")
        VALUES (${listingId}, ${dayValue(day)}::date, 1, jsonb_build_object(${channel}::text, 1))
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
 * A favorite was added (+1) or removed (−1). Listing.saveCount follows both (never below 0);
 * the daily chart counts saves added that day.
 */
export async function recordSave(listingId: string, delta: 1 | -1): Promise<void> {
  try {
    if (delta > 0) {
      const { count } = await db.listing.updateMany({ where: { id: listingId }, data: { saveCount: { increment: 1 } } });
      if (count === 0) return;
      await db.$executeRaw`
        INSERT INTO "ListingStatDaily" ("listingId", "date", "saves")
        VALUES (${listingId}, ${dayValue(georgiaDay())}::date, 1)
        ON CONFLICT ("listingId", "date") DO UPDATE SET "saves" = "ListingStatDaily"."saves" + 1`;
    } else {
      await db.$executeRaw`UPDATE "Listing" SET "saveCount" = GREATEST(0, "saveCount" - 1) WHERE "id" = ${listingId}`;
    }
  } catch (error) {
    console.error("[stats] could not record a save:", error);
  }
}

export type ChannelCounts = Partial<Record<ContactChannel, number>>;

export type ListingStatsDay = {
  /** "YYYY-MM-DD" (Georgia). */
  date: string;
  views: number;
  contacts: number;
  saves: number;
  contactsByChannel: ChannelCounts;
};

export type ListingStats = {
  days: ListingStatsDay[];
  /** Sums over `days`. */
  totals: { views: number; contacts: number; saves: number };
  /** Contacts per channel over `days`. */
  byChannel: ChannelCounts;
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

/** Daily series for the last `days` days (today included, missing days as zeros) plus totals. */
export async function getListingStats(listingId: string, days = 30): Promise<ListingStats> {
  const span = Math.min(366, Math.max(1, Math.floor(days)));
  const today = dayValue(georgiaDay());
  const first = new Date(today.getTime() - (span - 1) * DAY_MS);

  const [listing, rows] = await Promise.all([
    db.listing.findUnique({ where: { id: listingId }, select: { viewCount: true, contactCount: true, saveCount: true } }),
    db.listingStatDaily.findMany({ where: { listingId, date: { gte: first } }, orderBy: { date: "asc" } }),
  ]);
  const byDay = new Map(rows.map((row) => [row.date.toISOString().slice(0, 10), row]));

  const series: ListingStatsDay[] = [];
  const totals = { views: 0, contacts: 0, saves: 0 };
  const byChannel: ChannelCounts = {};
  for (let i = 0; i < span; i++) {
    const date = new Date(first.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    const row = byDay.get(date);
    const contactsByChannel = parseChannels(row?.contactsByChannel);
    const day = { date, views: row?.views ?? 0, contacts: row?.contacts ?? 0, saves: row?.saves ?? 0, contactsByChannel };
    totals.views += day.views;
    totals.contacts += day.contacts;
    totals.saves += day.saves;
    for (const [channel, count] of Object.entries(contactsByChannel)) {
      byChannel[channel as ContactChannel] = (byChannel[channel as ContactChannel] ?? 0) + count;
    }
    series.push(day);
  }

  return {
    days: series,
    totals,
    byChannel,
    allTime: {
      views: listing?.viewCount ?? 0,
      contacts: listing?.contactCount ?? 0,
      saves: listing?.saveCount ?? 0,
    },
  };
}
