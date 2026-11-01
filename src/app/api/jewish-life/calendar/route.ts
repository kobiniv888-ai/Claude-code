import type { NextRequest } from "next/server";
import { siteConfig } from "@/config/site";
import { isAppLocale } from "@/i18n/locale";
import { DEFAULT_TIME_ZONE } from "@/lib/format";
import { parseMonthParam, todayIn, yearMonthOf } from "@/lib/jewish-life/calendar";
import { loadCalendarMonth } from "@/lib/jewish-life/calendar-month";
import { getShabbatCities } from "@/lib/jewish-life/queries";
import { rateLimitByIp, rateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/jewish-life/calendar?month=2026-12&city=batumi&locale=he
 * One month of the Jewish calendar (Hebrew dates, holidays, candle-lighting and Havdalah) for the
 * calendar on /jewish-life, so changing the month or city swaps only the calendar instead of
 * re-rendering the whole page. → CalendarMonthData. Cached by browsers and the CDN: the data for a
 * month, city and language does not change.
 */

const LIMIT = { limit: 120, windowSeconds: 60 };
const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const localeParam = params.get("locale");
  const locale = isAppLocale(localeParam) ? localeParam : siteConfig.i18n.fallbackLocale;

  const current = yearMonthOf(todayIn(DEFAULT_TIME_ZONE));
  const month = parseMonthParam(params.get("month"), current);
  if (!month.valid) {
    return Response.json({ error: "invalid_month" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const rate = await rateLimitByIp("jl:calendar", LIMIT);
  if (!rate.ok) {
    return Response.json({ error: "rate_limited" }, { status: 429, headers: rateLimitHeaders(rate, LIMIT.limit) });
  }

  try {
    const cities = await getShabbatCities(locale);
    const slug = params.get("city");
    const city =
      cities.find((c) => c.slug === slug) ??
      cities.find((c) => c.slug === siteConfig.shabbat.homeCities[0]) ??
      cities[0];
    if (!city) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const data = await loadCalendarMonth({ year: month.year, month: month.month }, city, locale);
    return Response.json(data, { headers: { "Cache-Control": CACHE } });
  } catch (error) {
    console.error("[jewish-life] calendar month failed:", error);
    return Response.json({ error: "server_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
