"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { isRtl } from "@/i18n/locale";
import { formatDate, formatDateRange, formatNumber } from "@/lib/format";
import { buildMonth, weekStartFor, weekdaySamples, type CalendarDay } from "@/lib/listing-page/calendar";
import { addDays, canCheckIn, canCheckOut, pickDay } from "@/lib/listing-page/stay";
import { cn } from "@/lib/utils";
import { useStay } from "./stay-dates";

const NAV =
  "inline-flex size-11 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-35";

function monthAt(today: string, offset: number): { year: number; month: number } {
  const [y, m] = today.split("-").map(Number);
  const index = m - 1 + offset;
  return { year: y + Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * Two months of the listing's calendar (this month and the next; arrows page ahead). Booked days
 * are lightly crossed out, past days faded. The first tap picks the arrival, the second the
 * departure (the dates go to the address and the sticky bar shows the total). The week follows
 * the page direction; arrow keys move between days, Home/End to the week's ends.
 * Same look as the ds Calendar, without its date library (the listing page is the heaviest page).
 */
export function AvailabilityPicker({ className }: { className?: string }) {
  const t = useTranslations("listing.calendar");
  const locale = useLocale();
  const rtl = isRtl(locale);
  const { dates, setDates, nights, rules, maxMonths } = useStay();
  const [offset, setOffset] = useState(() => {
    if (!dates.checkIn) return 0;
    const [y, m] = dates.checkIn.split("-").map(Number);
    const [ty, tm] = rules.today.split("-").map(Number);
    return Math.min(Math.max(0, (y - ty) * 12 + (m - tm)), maxMonths - 2);
  });
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const weekStart = weekStartFor(locale);
  const months = [0, 1].map((i) => {
    const { year, month } = monthAt(rules.today, offset + i);
    return buildMonth(year, month, rules.blocks, rules.today, weekStart);
  });
  const weekdays = weekdaySamples(weekStart).map((day) => ({
    short: formatDate(day, locale, { weekday: "narrow" }),
    long: formatDate(day, locale, { weekday: "long" }),
  }));
  const first = months[0].first;
  const lastMonth = months[1];
  const last = lastMonth.weeks.flat().filter(Boolean).at(-1)!.date;
  const picking = dates.checkIn && !dates.checkOut ? dates.checkIn : null;

  const selectable = (day: string) => (picking && canCheckOut(day, picking, rules)) || canCheckIn(day, rules);
  // The one day in the tab order (roving focus): the focused one, else the arrival, else the first free day.
  const visibleDays = months.flatMap((m) => m.weeks.flat().filter((d): d is CalendarDay => !!d));
  const tabDay =
    (focusDay && visibleDays.some((d) => d.date === focusDay) && focusDay) ||
    (dates.checkIn && visibleDays.some((d) => d.date === dates.checkIn) && dates.checkIn) ||
    visibleDays.find((d) => selectable(d.date))?.date ||
    visibleDays[0].date;

  const moveFocus = (day: string) => {
    if (day < first && offset > 0) setOffset(offset - 1);
    else if (day > last && offset < maxMonths - 2) setOffset(offset + 1);
    else if (day < first || day > last) return;
    setFocusDay(day);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: CalendarDay, column: number) => {
    const step: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: 7,
      ArrowUp: -7,
      Home: -column,
      End: 6 - column,
    };
    if (!(event.key in step)) return;
    event.preventDefault();
    moveFocus(addDays(day.date, step[event.key]));
  };

  const status = (day: CalendarDay) =>
    day.date === dates.checkIn ? t("checkIn") : day.date === dates.checkOut ? t("checkOut") : day.past ? t("past") : day.blocked ? t("booked") : t("available");

  const hint =
    nights > 0 && dates.checkIn && dates.checkOut
      ? t("range", { range: formatDateRange(dates.checkIn, dates.checkOut, locale), nights: t("nights", { count: nights }) })
      : picking
        ? t("pickOut")
        : t("pickIn");

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-small font-medium text-foreground" aria-live="polite">
          {hint}
        </p>
        <div className="flex shrink-0 items-center">
          <button type="button" className={NAV} onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label={t("previous")}>
            <ChevronLeftIcon className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          <button type="button" className={NAV} onClick={() => setOffset(offset + 1)} disabled={offset >= maxMonths - 2} aria-label={t("next")}>
            <ChevronRightIcon className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      </div>
      <div ref={grid} className="grid gap-6 sm:grid-cols-2 sm:gap-8">
        {months.map((month) => (
          <table key={month.first} className="w-full table-fixed border-collapse text-center">
            <caption className="pb-2 text-start text-body font-semibold">{formatDate(month.first, locale, { month: "long", year: "numeric" })}</caption>
            <thead>
              <tr>
                {weekdays.map((w) => (
                  <th key={w.long} scope="col" className="pb-1 text-caption font-medium text-muted-foreground">
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
                  {week.map((day, column) => {
                    if (!day) return <td key={`e${column}`} aria-hidden />;
                    const isIn = day.date === dates.checkIn;
                    const isOut = day.date === dates.checkOut;
                    const between = !!dates.checkIn && !!dates.checkOut && day.date > dates.checkIn && day.date < dates.checkOut;
                    const can = selectable(day.date);
                    return (
                      <td
                        key={day.date}
                        className={cn(
                          "p-0 py-0.5",
                          between && "bg-primary-tint",
                          isIn && dates.checkOut && "bg-linear-to-l from-primary-tint from-50% to-transparent to-50% rtl:bg-linear-to-r",
                          isOut && "bg-linear-to-r from-primary-tint from-50% to-transparent to-50% rtl:bg-linear-to-l",
                        )}
                      >
                        <button
                          type="button"
                          data-day={day.date}
                          tabIndex={day.date === tabDay ? 0 : -1}
                          aria-disabled={!can || undefined}
                          aria-pressed={isIn || isOut || undefined}
                          aria-label={`${formatDate(day.date, locale, { weekday: "long", day: "numeric", month: "long" })}, ${status(day)}`}
                          onClick={() => can && setDates(pickDay(dates, day.date, rules))}
                          onKeyDown={(event) => onKeyDown(event, day, column)}
                          onFocus={() => setFocusDay(day.date)}
                          className={cn(
                            "mx-auto flex size-10 items-center justify-center rounded-full text-small tabular-nums outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/60",
                            can && !isIn && !isOut && "font-medium text-foreground hover:bg-surface-muted",
                            !can && "cursor-default",
                            day.past && "text-muted-foreground/60",
                            !day.past && day.blocked && "text-muted-foreground line-through decoration-muted-foreground/70",
                            !day.past && !day.blocked && !can && "text-muted-foreground",
                            (isIn || isOut) && "bg-primary font-semibold text-primary-foreground",
                            day.today && !isIn && !isOut && "ring-1 ring-border-strong",
                          )}
                        >
                          {formatNumber(day.day, locale)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-caption text-muted-foreground">
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-small text-muted-foreground line-through" aria-hidden>
              {formatNumber(12, locale)}
            </span>
            {t("booked")}
          </span>
          {rules.minNights && rules.minNights > 1 ? <span>{t("minStay", { count: rules.minNights })}</span> : null}
        </p>
        {dates.checkIn ? (
          <button
            type="button"
            onClick={() => setDates({ checkIn: null, checkOut: null })}
            className="inline-flex min-h-11 items-center rounded text-small font-medium text-primary-text underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
