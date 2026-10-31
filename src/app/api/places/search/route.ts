import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { searchPlaces } from "@/lib/places";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/places/search?q=tbil&locale=he
 * City and neighborhood suggestions for the search bar, in any of the five languages.
 * → { results: PlaceSearchResult[] }
 */

const LIMIT = { limit: 120, windowSeconds: 60 };

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const localeParam = params.get("locale");
  const locale = isAppLocale(localeParam) ? localeParam : siteConfig.i18n.fallbackLocale;
  const limitParam = Number(params.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 8;

  if (!q) {
    return Response.json({ results: [] }, { headers: { "Cache-Control": "public, max-age=300" } });
  }

  const rate = await rateLimitByIp("places:search", LIMIT);
  if (!rate.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });
  }

  try {
    const results = await searchPlaces(q, locale, limit);
    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[places] search failed:", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
