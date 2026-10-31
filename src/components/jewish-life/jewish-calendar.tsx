import { Flame, MoonStar } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { formatDate, formatTime } from "@/lib/format";
import { getJewishCalendarMonth, type JewishCalendarDay } from "@/lib/hebcal";
import { HOLIDAY_CATEGORY, type HolidayCategory } from "@/lib/hebcal/keys";
import {
  REFERENCE_WEEK,
  buildMonthWeeks,
  formatMonthParam,
  hebrewMonthSpan,
  isMonthInRange,
  shiftMonth,
  shortHebrewDate,
  yearMonthOf,
  type YearMonth,
} from "@/lib/jewish-life/calendar";
import type { ShabbatCity } from "@/lib/jewish-life/queries";
import { jewishLifeHref, type JewishLifeParams } from "@/lib/jewish-life/urls";
import { cn } from "@/lib/utils";
import { CalendarShell } from "./calendar-shell";

type DayHoliday = JewishCalendarDay["holidays"][number];

function chipClass(holiday: DayHoliday): string {
  if (holiday.isYomTov) return "bg-terracotta text-terracotta-foreground";
  const category: HolidayCategory = HOLIDAY_CATEGORY[holiday.key];
  switch (category) {
    case "major":
      return "bg-terracotta/15 text-accent-foreground";
    case "fast":
      return "border border-foreground/20 bg-muted text-foreground";
    case "modern":
      return "bg-wine/10 text-wine";
    default:
      return "bg-primary/10 text-primary";
  }
}

function isYomTovDay(day: JewishCalendarDay): boolean {
  return day.holidays.some((h) => h.isYomTov);
}

function DayTimes({
  day,
  locale,
  timeZone,
  labels,
}: {
  day: JewishCalendarDay;
  locale: AppLocale;
  timeZone: string;
  labels: { candleLighting: string; havdalah: string };
}) {
  if (!day.candleLighting && !day.havdalah) return null;
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[0.6875rem] leading-tight font-medium tabular-nums">
      {day.candleLighting ? (
        <span className="inline-flex items-center gap-1">
          <Flame aria-hidden="true" className="size-3 shrink-0 text-terracotta" />
          <span className="sr-only">{labels.candleLighting}</span>
          <time dateTime={day.candleLighting}>{formatTime(day.candleLighting, locale, timeZone)}</time>
        </span>
      ) : null}
      {day.havdalah ? (
        <span className="inline-flex items-center gap-1">
          <MoonStar aria-hidden="true" className="size-3 shrink-0 text-primary" />
          <span className="sr-only">{labels.havdalah}</span>
          <time dateTime={day.havdalah}>{formatTime(day.havdalah, locale, timeZone)}</time>
        </span>
      ) : null}
    </div>
  );
}

function HolidayChips({ holidays, className }: { holidays: DayHoliday[]; className?: string }) {
  if (holidays.length === 0) return null;
  return (
    <ul className={cn("space-y-0.5", className)}>
      {holidays.map((h) => (
        <li
          key={`${h.key}-${h.name}`}
          title={h.name}
          className={cn("rounded px-1.5 py-0.5 text-[0.6875rem] leading-tight font-semibold", chipClass(h))}
        >
          <span className="line-clamp-2">{h.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Month view of the Jewish calendar: Hebrew dates, holidays, candle-lighting and Havdalah
 * times for the chosen city. A table on tablets and up, a list of days on phones.
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
  const t = await getTranslations({ locale, namespace: "jewishLife.calendar" });
  const days = await getJewishCalendarMonth(month.year, month.month, locale, { ...city });
  const weeks = buildMonthWeeks(days);
  const monthParam = formatMonthParam(month);
  const isCurrent = monthParam === formatMonthParam(current);

  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);
  const linkFor = (target: YearMonth) =>
    jewishLifeHref(
      params,
      { month: formatMonthParam(target) === formatMonthParam(current) ? null : formatMonthParam(target) },
      "calendar",
    );

  const weekdays = REFERENCE_WEEK.map((date) => ({
    short: formatDate(date, locale, { weekday: "short" }),
    long: formatDate(date, locale, { weekday: "long" }),
  }));
  const timeLabels = { candleLighting: t("candleLighting"), havdalah: t("havdalah") };
  const todayMonth = yearMonthOf(today);
  const showToday = formatMonthParam(todayMonth) === monthParam;

  return (
    <CalendarShell
      monthTitle={formatDate(`${monthParam}-01`, locale, { month: "long", year: "numeric" })}
      hebrewMonths={days.length ? hebrewMonthSpan(days[0].hebrewDate, days[days.length - 1].hebrewDate) : ""}
      prevHref={isMonthInRange(prev, current) ? linkFor(prev) : null}
      nextHref={isMonthInRange(next, current) ? linkFor(next) : null}
      todayHref={isCurrent ? null : linkFor(current)}
      citySlug={city.slug}
      cities={cities.map((c) => ({
        slug: c.slug,
        name: c.name,
        href: jewishLifeHref(params, { city: c.slug }, "calendar"),
      }))}
    >
      {/* Tablet and desktop: month grid */}
      <div className="hidden p-3 sm:p-4 md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <caption className="sr-only">{t("caption", { month: formatDate(`${monthParam}-01`, locale, { month: "long", year: "numeric" }), city: city.name })}</caption>
          <thead>
            <tr>
              {weekdays.map((w, i) => (
                <th
                  key={w.long}
                  scope="col"
                  abbr={w.long}
                  className={cn("pb-2 text-center text-xs font-semibold text-muted-foreground", i === 6 && "text-primary")}
                >
                  {w.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day, di) => {
                  if (!day) return <td key={`empty-${wi}-${di}`} className="border border-border/60 bg-muted/30" />;
                  const isToday = showToday && day.date === today;
                  const yomTov = isYomTovDay(day);
                  return (
                    <td
                      key={day.date}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "h-28 border border-border/60 p-1.5 align-top lg:h-32",
                        day.weekday === 6 && "bg-secondary/50",
                        yomTov && "bg-terracotta/10",
                        isToday && "outline-2 -outline-offset-2 outline-primary",
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                            isToday && "bg-primary text-primary-foreground",
                          )}
                        >
                          {formatDate(day.date, locale, { day: "numeric" })}
                        </span>
                        <span className="truncate pt-0.5 text-[0.6875rem] text-muted-foreground">
                          {shortHebrewDate(day.hebrewDate)}
                        </span>
                      </div>
                      <span className="sr-only">
                        {formatDate(day.date, locale, { dateStyle: "full" })}
                        {isToday ? ` (${t("today")})` : ""}
                      </span>
                      <HolidayChips holidays={day.holidays} className="mt-1" />
                      <div className="mt-1">
                        <DayTimes day={day} locale={locale} timeZone={city.timezone} labels={timeLabels} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phones: list of days */}
      <ol className="divide-y md:hidden" aria-label={t("listLabel", { city: city.name })}>
        {days.map((day) => {
          const isToday = showToday && day.date === today;
          const yomTov = isYomTovDay(day);
          const hasDetails = day.holidays.length > 0 || day.candleLighting || day.havdalah;
          return (
            <li
              key={day.date}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "px-4 py-2",
                day.weekday === 6 && "bg-secondary/50",
                yomTov && "bg-terracotta/10",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {formatDate(day.date, locale, { day: "numeric" })}
                </span>
                <span className={cn("w-16 shrink-0 text-sm font-medium", day.weekday === 6 && "text-primary")}>
                  {weekdays[day.weekday].short}
                </span>
                <span className="min-w-0 truncate text-sm text-muted-foreground">{shortHebrewDate(day.hebrewDate)}</span>
                {isToday ? <span className="ms-auto text-xs font-semibold text-primary">{t("today")}</span> : null}
              </div>
              {hasDetails ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 ps-11">
                  <HolidayChips holidays={day.holidays} className="flex flex-wrap gap-1 space-y-0" />
                  <DayTimes day={day} locale={locale} timeZone={city.timezone} labels={timeLabels} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-terracotta" />
          {t("legend.yomTov")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-primary/30" />
          {t("legend.holiday")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm border border-foreground/30 bg-muted" />
          {t("legend.fast")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-sm bg-wine/40" />
          {t("legend.modern")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Flame aria-hidden="true" className="size-3.5 text-terracotta" />
          {t("candleLighting")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MoonStar aria-hidden="true" className="size-3.5 text-primary" />
          {t("havdalah")}
        </span>
        <span>{t("legend.timesIn", { city: city.name })}</span>
      </div>
    </CalendarShell>
  );
}
