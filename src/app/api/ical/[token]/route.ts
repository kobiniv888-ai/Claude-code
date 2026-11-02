import { buildIcs } from "@/lib/ical";
import { db } from "@/lib/db";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/ical/<icalToken>   (also /api/ical/<icalToken>.ics)
 * The listing's blocked dates as an iCalendar feed for Airbnb, Booking.com or Google Calendar.
 * Works for every listing that is not deleted (owners often connect calendars before
 * publishing). The feed contains only dates — no names, notes or addresses: bookings made on
 * Bayit show as "Reserved", everything else (the host's own blocks, imported calendars) as
 * "Not available".
 */

export const runtime = "nodejs";

const LIMIT = { limit: 120, windowSeconds: 60 };
const TOKEN = /^[A-Za-z0-9_-]{10,64}$/;
const PAST_DAYS = 30;

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
    const listing = await db.listing.findUnique({
      where: { icalToken: token },
      select: {
        id: true,
        publicId: true,
        status: true,
        availability: {
          where: { endDate: { gte: since } },
          select: { id: true, startDate: true, endDate: true, source: true },
          orderBy: { startDate: "asc" },
          take: 2000,
        },
      },
    });
    if (!listing || listing.status === "DELETED") return notFound();

    return new Response(buildIcs(listing, listing.availability), {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="listing-${listing.publicId}.ics"`,
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
