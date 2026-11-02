import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatNumber } from "@/lib/format";
import { buildMonths, georgiaToday, weekStartFor, weekdaySamples, type DateBlock } from "@/lib/listing-page/calendar";
import { cn } from "@/lib/utils";
import { Section } from "./section";

/**
 * Read-only availability for this month and the next. The grid follows the page direction, so
 * in Hebrew and Arabic the week runs right to left. Days are Georgia days.
 */
export function AvailabilityCalendar({ blocks, nowIso }: { blocks: DateBlock[]; nowIso: string }) {
  const t = useTranslations("listing.calendar");
  const locale = useLocale();
  const today = georgiaToday(new Date(nowIso));
  const weekStart = weekStartFor(locale);
  const months = buildMonths(blocks, today, 2, weekStart);
  const weekdays = weekdaySamples(weekStart).map((day) => ({
    short: formatDate(day, locale, { weekday: "narrow" }),
    long: formatDate(day, locale, { weekday: "long" }),
  }));
  const allFree = months.every((m) => m.blockedCount === 0);

  return (
    <Section id="availability" title={t("title")} description={allFree ? t("allFree") : t("subtitle")}>
      <div className="grid gap-8 sm:grid-cols-2">
        {months.map((month) => (
          <table key={month.first} className="w-full table-fixed border-separate border-spacing-1 text-center text-sm">
            <caption className="mb-2 text-start font-semibold">
              {formatDate(month.first, locale, { month: "long", year: "numeric" })}
            </caption>
            <thead>
              <tr>
                {weekdays.map((w) => (
                  <th key={w.long} scope="col" className="pb-1 text-xs font-medium text-muted-foreground">
                    <abbr title={w.long} className="no-underline">
                      {w.short}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.weeks.map((week, i) => (
                <tr key={i}>
                  {week.map((day, j) =>
                    day ? (
                      <td
                        key={day.date}
                        className={cn(
                          "h-9 rounded-lg tabular-nums",
                          day.past && "text-muted-foreground",
                          !day.past && day.blocked && "bg-muted text-muted-foreground line-through decoration-muted-foreground/60",
                          !day.past && !day.blocked && "bg-primary-tint/60 font-medium text-foreground",
                          day.today && "ring-2 ring-primary",
                        )}
                      >
                        <span className="sr-only">
                          {formatDate(day.date, locale, { day: "numeric", month: "long" })}:{" "}
                          {day.past ? t("past") : day.blocked ? t("booked") : t("available")}
                        </span>
                        <span aria-hidden>{formatNumber(day.day, locale)}</span>
                      </td>
                    ) : (
                      <td key={`empty-${j}`} aria-hidden />
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded bg-primary-tint ring-1 ring-primary-tint-border" aria-hidden />
          {t("available")}
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded bg-muted ring-1 ring-foreground/10" aria-hidden />
          {t("booked")}
        </li>
        <li className="inline-flex items-center gap-2">
          <span className="size-4 rounded ring-2 ring-primary" aria-hidden />
          {t("today")}
        </li>
      </ul>
    </Section>
  );
}
