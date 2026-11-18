import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { requireUserForAction, type CurrentUser } from "@/lib/auth/session";
import { normalizeGeocodeQuery } from "@/lib/geocode/core";
import { GeocodeUnavailableError, OSM_ATTRIBUTION, QueueFullError, geocodeAddress } from "@/lib/geocode";
import { rateLimit, rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/geocode?q=Chavchavadze+12&locale=he
 * Address search for the post form, through our server only (bug 8.9). Signed-in people only,
 * called once per "Search"/Enter. → { results: GeocodeResult[], attribution }
 * Errors: 400 too_short · 401 unauthorized · 429 rate_limited · 503 busy · 502 unavailable.
 * The session rules of every signed-in action (SECURITY_REPORT 4.2.a): a session whose 2-step code
 * was not entered yet is refused like a signed-out one (requireUserForAction).
 */

// One search per click is plenty. Each requester stays well under the site-wide upstream budget
// (one Nominatim request per 1.1 s ≈ 54/min, 8 waiting at most) — hardening A3.
const PER_USER = { limit: 8, windowSeconds: 60 };
const PER_IP = { limit: 15, windowSeconds: 60 };
/** Searches one person may have waiting for the shared upstream slot at the same time. */
const MAX_IN_FLIGHT_PER_USER = 2;
const NO_STORE = { "Cache-Control": "no-store" };

const inFlightByUser = new Map<string, number>();

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = normalizeGeocodeQuery(params.get("q"));
  const localeParam = params.get("locale");
  const locale = isAppLocale(localeParam) ? localeParam : siteConfig.i18n.fallbackLocale;
  if (!query) return Response.json({ error: "too_short" }, { status: 400, headers: NO_STORE });

  let user: CurrentUser;
  try {
    user = await requireUserForAction();
  } catch {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const byIp = await rateLimitByIp("geocode", PER_IP);
  if (!byIp.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byIp, PER_IP.limit) });
  }
  const byUser = await rateLimit(`geocode:user:${user.id}`, PER_USER);
  if (!byUser.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byUser, PER_USER.limit) });
  }

  const waiting = inFlightByUser.get(user.id) ?? 0;
  if (waiting >= MAX_IN_FLIGHT_PER_USER) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "2" } });
  }
  inFlightByUser.set(user.id, waiting + 1);
  try {
    const results = await geocodeAddress(query, locale);
    return Response.json(
      { results, attribution: OSM_ATTRIBUTION },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (error) {
    if (error instanceof QueueFullError) {
      return Response.json({ error: "busy" }, { status: 503, headers: { ...NO_STORE, "Retry-After": "2" } });
    }
    if (!(error instanceof GeocodeUnavailableError)) console.error("[geocode] search failed:", error);
    else console.warn("[geocode]", error.message);
    return Response.json({ error: "unavailable" }, { status: 502, headers: NO_STORE });
  } finally {
    const left = (inFlightByUser.get(user.id) ?? 1) - 1;
    if (left > 0) inFlightByUser.set(user.id, left);
    else inFlightByUser.delete(user.id);
  }
}
