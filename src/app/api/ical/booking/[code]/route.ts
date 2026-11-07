import { siteConfig, type AppLocale } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";
import { getGuestTrip } from "@/lib/booking/queries";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";
import { tripIcsFile } from "@/lib/trip/calendar-server";

/**
 * GET /api/ical/booking/<code>(.ics)?lang=he — "הוספה ליומן" on the trip page (round 3, brief 7.1).
 * Only for the signed-in guest of a CONFIRMED booking: the file holds the exact address and the
 * host's phone. One event for the stay: from the check-in time to the check-out time, Georgia
 * time (or all-day when "גמיש"), with the address, the booking number and the trip page
 * (src/lib/trip/ics.ts). Texts in `lang` (else the account's language). Never cached.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { limit: 60, windowSeconds: 60 };
const NO_STORE = { "Cache-Control": "private, no-store" };

type Context = { params: Promise<{ code: string }> };

function plain(status: number, text: string): Response {
  return new Response(`${text}\n`, { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...NO_STORE } });
}

export async function GET(request: Request, context: Context) {
  const rate = await rateLimitByIp("ical:booking", LIMIT);
  if (!rate.ok) return new Response("Too many requests\n", { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });

  const user = await getCurrentUser();
  if (!user) return plain(401, "Sign in to download this booking");

  const { code: raw } = await context.params;
  let decoded = raw ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return plain(404, "Not found");
  }
  const code = decoded.replace(/\.ics$/i, "");
  const lang = new URL(request.url).searchParams.get("lang");
  const locale: AppLocale = isAppLocale(lang) ? lang : isAppLocale(user.locale) ? user.locale : siteConfig.i18n.fallbackLocale;

  try {
    const trip = await getGuestTrip(user.id, code, locale);
    if (!trip || trip.status !== "CONFIRMED" || !trip.reveal) return plain(404, "Not found");
    const body = await tripIcsFile(trip, locale);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${trip.code}.ics"`,
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        ...NO_STORE,
      },
    });
  } catch (error) {
    console.error("[ical] booking file failed:", error);
    return plain(500, "Server error");
  }
}
