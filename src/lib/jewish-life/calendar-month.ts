import "server-only";
import type { AppLocale } from "@/config/site";
import { getJewishCalendarMonth, type JewishCalendarDay } from "@/lib/hebcal";
import { formatMonthParam, type YearMonth } from "./calendar";
import type { ShabbatCity } from "./queries";

/**
 * One month of the Jewish calendar for one city, as plain data: rendered on the page for the first
 * month, then fetched from GET /api/jewish-life/calendar when the visitor changes the month or the
 * city, so only the calendar changes (not the whole page).
 */
export type CalendarMonthData = {
  /** "YYYY-MM" */
  month: string;
  city: { slug: string; name: string; timezone: string };
  days: JewishCalendarDay[];
};

export async function loadCalendarMonth(month: YearMonth, city: ShabbatCity, locale: AppLocale): Promise<CalendarMonthData> {
  const days = await getJewishCalendarMonth(month.year, month.month, locale, { ...city });
  return {
    month: formatMonthParam(month),
    city: { slug: city.slug, name: city.name, timezone: city.timezone },
    days,
  };
}
