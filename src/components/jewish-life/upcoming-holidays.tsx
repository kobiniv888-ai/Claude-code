import { ArrowRight, CalendarHeart } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDateRange } from "@/lib/format";
import { getHolidaysInRange, hebrewDate, holidayName } from "@/lib/hebcal";
import { addDaysToDate, formatMonthParam, yearMonthOf } from "@/lib/jewish-life/calendar";
import { groupHolidays, type HolidayGroup } from "@/lib/jewish-life/holidays";
import { jewishLifeHref, type JewishLifeParams } from "@/lib/jewish-life/urls";
import { cn } from "@/lib/utils";

const CATEGORY_BADGE: Record<HolidayGroup["category"], string> = {
  major: "bg-primary/15 text-accent-foreground",
  minor: "bg-primary/10 text-primary",
  fast: "border border-foreground/20 bg-muted text-foreground",
  modern: "bg-primary/10 text-primary-text",
};

/** The next Jewish holidays (one entry per holiday), each linking to its month in the calendar. */
export async function UpcomingHolidays({
  today,
  params,
  currentMonth,
  locale,
  limit = 8,
}: {
  today: string;
  params: JewishLifeParams;
  /** "YYYY-MM" of today (links to it drop the month parameter). */
  currentMonth: string;
  locale: AppLocale;
  limit?: number;
}) {
  const t = await getTranslations({ locale, namespace: "jewishLife.upcoming" });
  let groups: HolidayGroup[] = [];
  try {
    // Start a day early so a holiday whose Erev is today still shows its start.
    groups = groupHolidays(await getHolidaysInRange(addDaysToDate(today, -1), addDaysToDate(today, 400), locale))
      .filter((g) => g.end >= today)
      .slice(0, limit);
  } catch (error) {
    console.error("[jewish-life] upcoming holidays failed:", error);
  }

  if (groups.length === 0) {
    return <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-card">{t("empty")}</p>;
  }

  const names = new Map(await Promise.all(groups.map(async (g) => [g.key, await holidayName(g.key, locale)] as const)));

  return (
    <div className="rounded-2xl border bg-card shadow-card">
      <h3 className="flex items-center gap-2 border-b px-4 py-4 text-lg font-semibold sm:px-5">
        <CalendarHeart aria-hidden="true" className="size-5 text-primary-text" />
        {t("title")}
      </h3>
      <ul className="divide-y">
        {groups.map((group) => {
          const ongoing = group.firstDay <= today;
          const month = formatMonthParam(yearMonthOf(group.firstDay));
          const range =
            group.firstDay === group.end
              ? formatDate(group.firstDay, locale, { weekday: "short", day: "numeric", month: "long" })
              : formatDateRange(group.firstDay, group.end, locale, { day: "numeric", month: "long" });
          return (
            <li key={`${group.key}-${group.start}`} className="px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{names.get(group.key)}</p>
                  <p className="mt-0.5 text-sm">{range}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {hebrewDate(group.firstDay, locale)}
                    {group.includesErev && !ongoing
                      ? ` · ${t("beginsEvening", {
                          date: formatDate(group.start, locale, { weekday: "short", day: "numeric", month: "short" }),
                        })}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {ongoing ? (
                    <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-text">
                      {t("now")}
                    </span>
                  ) : null}
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", CATEGORY_BADGE[group.category])}>
                    {group.hasYomTov ? t("yomTov") : t(`category.${group.category}`)}
                  </span>
                </div>
              </div>
              <Link
                href={jewishLifeHref(params, { month: month === currentMonth ? null : month }, "calendar")}
                className="mt-1 inline-flex min-h-6 items-center gap-1 rounded-sm text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("showInCalendar")}
                <span className="sr-only">: {names.get(group.key)}</span>
                <ArrowRight aria-hidden="true" className="size-3.5 rtl:-scale-x-100" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
