import { buildIcs, hotelExportBlocks, roomTypeExportBlocks, type IcsBlock } from "@/lib/ical";
import { db } from "@/lib/db";
import { usesRoomInventory } from "@/lib/booking/constants";
import { isBookableRoomType } from "@/lib/booking/terms";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/ical/<icalToken>   (also /api/ical/<icalToken>.ics)
 * The listing's blocked dates as an iCalendar feed for Airbnb, Booking.com or Google Calendar.
 * Works for every listing that is not deleted (owners often connect calendars before
 * publishing). The feed contains only dates — no names, notes or addresses: bookings made on
 * Bayit show as "Reserved", everything else (the host's own blocks, imported calendars) as
 * "Not available".
 *
 * Hotels (round 3, founder's answer 3): a hotel room type's token (RoomType.icalToken) gives that
 * room type's feed — a night is busy only when the type has no free room left; the hotel's own
 * token gives the nights the whole hotel is full or closed. iCal carries no room counts.
 */

export const runtime = "nodejs";

const LIMIT = { limit: 120, windowSeconds: 60 };
const TOKEN = /^[A-Za-z0-9_-]{10,64}$/;
const PAST_DAYS = 30;
const FUTURE_DAYS = 730;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);

type Context = { params: Promise<{ token: string }> };

function notFound(): Response {
  return new Response("Not found\n", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}

export async function GET(_request: Request, context: Context) {
  const { token: raw } = await context.params;
  const token = decodeURIComponent(raw ?? "").replace(/\.ics$/i, "");
  if (!TOKEN.test(token)) return notFound();

  const rate = await rateLimitByIp("ical:export", LIMIT);
  if (!rate.ok) {
    return new Response("Too many requests\n", { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });
  }

  try {
    const since = new Date(Date.now() - PAST_DAYS * 24 * 3600 * 1000);
    const until = new Date(Date.now() + FUTURE_DAYS * 24 * 3600 * 1000);
    const availability = {
      where: { endDate: { gte: since } },
      select: { id: true, startDate: true, endDate: true, source: true, roomTypeId: true, rooms: true },
      orderBy: { startDate: "asc" as const },
      take: 5000,
    };
    const roomTypes = { select: { id: true, quantity: true, active: true, price: true, pricePeriod: true } };
    let listing = await db.listing.findUnique({
      where: { icalToken: token },
      select: { id: true, publicId: true, status: true, dealType: true, availability, roomTypes },
    });
    let room: { id: string; quantity: number } | null = null;
    if (!listing) {
      // A hotel room type's own feed.
      const found = await db.roomType.findUnique({
        where: { icalToken: token },
        select: { id: true, quantity: true, listing: { select: { id: true, publicId: true, status: true, dealType: true, availability, roomTypes } } },
      });
      if (found) {
        listing = found.listing;
        room = { id: found.id, quantity: found.quantity };
      }
    }
    if (!listing || listing.status === "DELETED") return notFound();

    const rows = listing.availability.map((b) => ({ start: dayOf(b.startDate), end: dayOf(b.endDate), roomTypeId: b.roomTypeId, rooms: b.rooms }));
    let blocks: IcsBlock[] = listing.availability;
    if (room) {
      blocks = roomTypeExportBlocks(room, rows, since, until);
    } else if (usesRoomInventory(listing.dealType)) {
      blocks = hotelExportBlocks(listing.id, listing.roomTypes.filter(isBookableRoomType), rows, since, until);
    }

    return new Response(buildIcs(listing, blocks), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="listing-${listing.publicId}${room ? `-room-${room.id.slice(-6)}` : ""}.ics"`,
        "Cache-Control": "public, max-age=900, s-maxage=900",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    console.error("[ical] export failed:", error);
    return new Response("Server error\n", { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
