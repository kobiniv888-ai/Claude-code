import { getTranslations } from "next-intl/server";
import { cardStyles } from "@/components/ds/card";
import { SpriteIcon } from "@/components/ds/sprite-icons";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { formatDate, formatDateRange, formatNumber } from "@/lib/format";
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

/** Holidays shown before "more holidays" (the rest are folded, so the hub stays short on phones). */
const VISIBLE = 4;

/**
 * The next Jewish holidays (one entry per holiday); each row links to its month in the calendar.
 * The first four are shown, the others fold away under "N more holidays".
 */
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
    return <p className={cardStyles({ padding: "lg", className: "text-small text-muted-foreground" })}>{t("empty")}</p>;
  }

  const names = new Map(await Promise.all(groups.map(async (g) => [g.key, await holidayName(g.key, locale)] as const)));

  const row = (group: HolidayGroup) => {
    const ongoing = group.firstDay <= today;
    const month = formatMonthParam(yearMonthOf(group.firstDay));
    const range =
      group.firstDay === group.end
        ? formatDate(group.firstDay, locale, { weekday: "short", day: "numeric", month: "long" })
        : formatDateRange(group.firstDay, group.end, locale, { day: "numeric", month: "long" });
    return (
      <li key={`${group.key}-${group.start}`}>
        {/* The whole row opens the holiday's month in the calendar (a 44px+ target). */}
        <Link
          href={jewishLifeHref(params, { month: month === currentMonth ? null : month }, "calendar")}
          className="flex items-start justify-between gap-3 px-4 py-3 outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5"
        >
          <div className="min-w-0">
            <p className="text-body font-medium text-foreground">{names.get(group.key)}</p>
            <p className="mt-0.5 text-small text-foreground/85">{range}</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {hebrewDate(group.firstDay, locale)}
              {group.includesErev && !ongoing
                ? ` · ${t("beginsEvening", {
                    date: formatDate(group.start, locale, { weekday: "short", day: "numeric", month: "short" }),
                  })}`
                : ""}
            </p>
            <span className="sr-only">{t("showInCalendar")}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex flex-col items-end gap-1">
              {ongoing ? (
                <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-semibold text-primary-text">{t("now")}</span>
              ) : null}
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", CATEGORY_BADGE[group.category])}>
                {group.hasYomTov ? t("yomTov") : t(`category.${group.category}`)}
              </span>
            </div>
            <SpriteIcon name="chevron-right" className="size-4 text-muted-foreground rtl:-scale-x-100" />
          </div>
        </Link>
      </li>
    );
  };

  const shown = groups.slice(0, VISIBLE);
  const folded = groups.slice(VISIBLE);

  return (
    <div className={cardStyles({ padding: "none" })}>
      <h3 className="border-b border-border px-4 py-3.5 text-body font-semibold sm:px-5">{t("title")}</h3>
      <ul className="divide-y divide-border">{shown.map(row)}</ul>
      {folded.length > 0 ? (
        <details className="group border-t border-border">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-small font-medium text-primary-text outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 sm:px-5 [&::-webkit-details-marker]:hidden">
            {t("more", { count: folded.length, formatted: formatNumber(folded.length, locale) })}
            <SpriteIcon name="chevron-down" className="size-4 transition-transform duration-(--motion-fast) group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <ul className="divide-y divide-border border-t border-border">{folded.map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}
