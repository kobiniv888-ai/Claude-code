import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeGeocodeQuery } from "@/lib/geocode/core";
import { GeocodeUnavailableError, OSM_ATTRIBUTION, QueueFullError, geocodeAddress } from "@/lib/geocode";
import { rateLimit, rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/geocode?q=Chavchavadze+12&locale=he
 * Address search for the post form, through our server only (bug 8.9). Signed-in people only,
 * called once per "Search"/Enter. → { results: GeocodeResult[], attribution }
 * Errors: 400 too_short · 401 unauthorized · 429 rate_limited · 503 busy · 502 unavailable.
 */

const PER_USER = { limit: 30, windowSeconds: 60 };
const PER_IP = { limit: 60, windowSeconds: 60 };
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = normalizeGeocodeQuery(params.get("q"));
  const localeParam = params.get("locale");
  const locale = isAppLocale(localeParam) ? localeParam : siteConfig.i18n.fallbackLocale;
  if (!query) return Response.json({ error: "too_short" }, { status: 400, headers: NO_STORE });

  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });

  const byIp = await rateLimitByIp("geocode", PER_IP);
  if (!byIp.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byIp, PER_IP.limit) });
  }
  const byUser = await rateLimit(`geocode:user:${user.id}`, PER_USER);
  if (!byUser.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(byUser, PER_USER.limit) });
  }

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
  }
}
