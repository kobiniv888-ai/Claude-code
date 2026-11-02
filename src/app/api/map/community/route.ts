import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { getCommunityPlaces } from "@/lib/map/community-queries";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/map/community?locale=he
 * The search map's "Jewish community" layer: synagogues, Chabad houses and kosher places, with
 * names in the visitor's language. Public data only (no phone, address or notes).
 * → { places: CommunityPlace[] }
 */

const LIMIT = { limit: 60, windowSeconds: 60 };

export async function GET(request: NextRequest) {
  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale = isAppLocale(localeParam) ? localeParam : siteConfig.i18n.fallbackLocale;

  const rate = await rateLimitByIp("map:community", LIMIT);
  if (!rate.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });
  }

  try {
    const places = await getCommunityPlaces(locale);
    return Response.json(
      { places },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("[map] community places failed:", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
