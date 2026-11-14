import { ArrowRight, CalendarHeart, Filter } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { AppLocale } from "@/config/site";
import { Link } from "@/i18n/navigation";
import { DEFAULT_TIME_ZONE, formatDate, formatDateRange } from "@/lib/format";
import { getHolidaysInRange, holidayName } from "@/lib/hebcal";
import { addDaysToDate, todayIn } from "@/lib/jewish-life/calendar";
import {
  JEWISH_FEATURE_PARAM,
  groupHolidays,
  holidayHints,
  jewishFeatureSearchHref,
  type SearchParamsInput,
} from "@/lib/jewish-life/holidays";
import { cn } from "@/lib/utils";
import { resolveLocale, type HeadingLevel } from "./shared";

export type HolidaysInRangeProps = {
  /** First day of the stay: "YYYY-MM-DD" or a Date (read in Georgia time). */
  start: string | Date;
  /** Last day of the stay (inclusive). */
  end: string | Date;
  /**
   * The current search filters, kept in the "filter for sukkah space" link
   * (a page's awaited `searchParams`, a URLSearchParams or a query string).
   */
  searchParams?: SearchParamsInput;
  /** Show the "Your dates include Sukkot — filter for sukkah space" links. Default true. */
  showHints?: boolean;
  /** Holidays listed before "and N more". Default 6. */
  maxItems?: number;
  headingLevel?: HeadingLevel;
  locale?: AppLocale;
  className?: string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;

function toDateString(value: string | Date): string | null {
  if (typeof value === "string") return DATE_ONLY.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
  if (Number.isNaN(value.getTime())) return null;
  return todayIn(DEFAULT_TIME_ZONE, value);
}

function activeFeatures(params: SearchParamsInput): string[] {
  if (!params) return [];
  const values =
    typeof params === "string"
      ? new URLSearchParams(params.replace(/^\?/, "")).getAll(JEWISH_FEATURE_PARAM)
      : params instanceof URLSearchParams
        ? params.getAll(JEWISH_FEATURE_PARAM)
        : [params[JEWISH_FEATURE_PARAM] ?? []].flat();
  return values.flatMap((v) => v.split(",")).map((v) => v.trim());
}

/**
 * Jewish holidays inside a guest's dates, with a tip to filter for the right homes:
 * "Your dates include Sukkot — filter for sukkah space" → /search?…&jewish=sukkah_space.
 *
 *   <HolidaysInRange start="2026-09-24" end="2026-10-04" searchParams={await searchParams} />
 *
 * Server component. Renders nothing when the dates contain no holiday.
 */
export async function HolidaysInRange({
  start,
  end,
  searchParams,
  showHints = true,
  maxItems = 6,
  headingLevel: Heading = "h3",
  locale: localeProp,
  className,
}: HolidaysInRangeProps) {
  let from = toDateString(start);
  let to = toDateString(end);
  if (!from || !to) return null;
  if (from > to) [from, to] = [to, from];
  const maxEnd = addDaysToDate(from, MAX_DAYS);
  if (to > maxEnd) to = maxEnd;

  const locale = await resolveLocale(localeProp);
  let groups;
  try {
    groups = groupHolidays(await getHolidaysInRange(from, to, locale));
  } catch (error) {
    console.error("[shabbat] could not list holidays:", error);
    return null;
  }
  if (groups.length === 0) return null;

  const t = await getTranslations({ locale, namespace: "shabbat" });
  const names = new Map(
    await Promise.all(groups.map(async (g) => [g.key, await holidayName(g.key, locale)] as const)),
  );
  const shown = groups.slice(0, Math.max(1, maxItems));
  const more = groups.length - shown.length;
  const chosen = activeFeatures(searchParams);
  const hints = showHints ? holidayHints(groups).filter((h) => !chosen.includes(h.hint)) : [];
  const headingId = `holidays-${from}-${to}`;

  return (
    <aside
      aria-labelledby={headingId}
      className={cn("rounded-2xl border border-primary/25 bg-accent/60 p-4 sm:p-5", className)}
    >
      <Heading id={headingId} className="flex items-center gap-2 text-base font-semibold">
        <CalendarHeart aria-hidden="true" className="size-5 shrink-0 text-primary-text" />
        {t("holidays.title")}
      </Heading>
      <ul className="mt-3 space-y-2 text-sm">
        {shown.map((group) => {
          const name = names.get(group.key) ?? group.key;
          const erevOnly = group.includesErev && group.start === group.end;
          const range =
            group.firstDay === group.end
              ? formatDate(group.firstDay, locale, { weekday: "short", day: "numeric", month: "short" })
              : formatDateRange(group.firstDay, group.end, locale, { day: "numeric", month: "short" });
          return (
            <li key={`${group.key}-${group.start}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{erevOnly ? t("holidays.beginsEvening", { name }) : name}</span>
              <span className="text-muted-foreground">{range}</span>
              {group.hasYomTov ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                  {t("holidays.yomTov")}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {more > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t("holidays.more", { count: more })}</p> : null}
      {groups.some((g) => g.hasYomTov) ? (
        <p className="mt-3 text-xs text-pretty text-muted-foreground">{t("holidays.yomTovNote")}</p>
      ) : null}
      {hints.length > 0 ? (
        <div className="mt-4 space-y-2">
          {hints.map(({ hint, key }) => (
            <Link
              key={hint}
              href={jewishFeatureSearchHref(searchParams, hint)}
              className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-sm font-semibold text-primary shadow-card transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Filter aria-hidden="true" className="size-4 shrink-0" />
              <span className="flex-1 text-pretty">{t(`holidays.hint.${hint}`, { holiday: names.get(key) ?? key })}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
