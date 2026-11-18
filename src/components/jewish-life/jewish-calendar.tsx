import type { AppLocale } from "@/config/site";
import { formatMonthParam, type YearMonth } from "@/lib/jewish-life/calendar";
import { loadCalendarMonth } from "@/lib/jewish-life/calendar-month";
import type { ShabbatCity } from "@/lib/jewish-life/queries";
import type { JewishLifeParams } from "@/lib/jewish-life/urls";
import { CalendarShell } from "./calendar-shell";

/**
 * Month view of the Jewish calendar: Hebrew dates, holidays, candle-lighting and Havdalah
 * times for the chosen city. A table on tablets and up, a list of days on phones.
 * The first month is rendered here; later months and cities are fetched by <CalendarShell>
 * (GET /api/jewish-life/calendar) without rendering the page again.
 */
export async function JewishCalendar({
  month,
  current,
  today,
  city,
  cities,
  params,
  locale,
}: {
  month: YearMonth;
  /** The current month (navigation stays within CALENDAR_RANGE_MONTHS of it). */
  current: YearMonth;
  /** Today, YYYY-MM-DD in Georgia time. */
  today: string;
  city: ShabbatCity;
  cities: ShabbatCity[];
  params: JewishLifeParams;
  locale: AppLocale;
}) {
  const initial = await loadCalendarMonth(month, city, locale);
  return (
    <CalendarShell
      initial={initial}
      current={formatMonthParam(current)}
      today={today}
      cities={cities.map((c) => ({ slug: c.slug, name: c.name }))}
      params={params}
    />
  );
}
