"use client";

import { createContext, useContext, useMemo, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { DateRange, DayButtonProps } from "react-day-picker";
import { ar, enUS, he, ka, ru } from "react-day-picker/locale";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppLocale } from "@/config/site";
import { dirFor, isAppLocale } from "@/i18n/locale";
import { DEFAULT_TIME_ZONE, formatDate } from "@/lib/format";
import { todayIn } from "@/lib/jewish-life/calendar";
import type { HolidayMark } from "@/lib/search/holiday-marks";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES = { he, en: enUS, ru, ar, ka } as const;

/** "YYYY-MM-DD" ⇄ a local Date at midnight (what the day picker works with). */
export function dayToDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateToDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MAX_MONTHS_AHEAD = 24;

/** Holiday marks for the day buttons (a context, so the DayButton component keeps one identity). */
const MarksContext = createContext<{ marks: Map<string, HolidayMark> }>({ marks: new Map() });

type CommonProps = {
  holidays: readonly HolidayMark[];
  numberOfMonths?: number;
  className?: string;
};

type RangeProps = CommonProps & {
  mode: "range";
  checkIn: string | null;
  checkOut: string | null;
  onChange: (checkIn: string | null, checkOut: string | null) => void;
};

type SingleProps = CommonProps & {
  mode: "single";
  /** The move-in date. */
  checkIn: string | null;
  onChange: (checkIn: string | null) => void;
};

/**
 * The date picker of the search bar and filters: a stay (check-in → check-out) or a single
 * move-in date, with Jewish holidays marked by a dot. Hovering or focusing a holiday shows its
 * name (tooltip, plus a line under the calendar for touch screens and screen readers).
 */
export function HolidayCalendar(props: RangeProps | SingleProps) {
  const t = useTranslations("search.dates");
  const rawLocale = useLocale();
  const locale: AppLocale = isAppLocale(rawLocale) ? rawLocale : "en";
  const { holidays, numberOfMonths = 1, className } = props;
  const marks = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays]);
  const [today] = useState(() => todayIn(DEFAULT_TIME_ZONE));
  const [hovered, setHovered] = useState<string | null>(null);
  const [month, setMonth] = useState<Date>(() => dayToDate(props.checkIn ?? today));

  const todayDate = dayToDate(today);
  const endMonth = new Date(todayDate.getFullYear(), todayDate.getMonth() + MAX_MONTHS_AHEAD, 1);
  const hoveredMark = hovered ? marks.get(hovered) : undefined;
  const context = useMemo(() => ({ marks }), [marks]);

  const shared = {
    dir: dirFor(locale),
    locale: DAY_PICKER_LOCALES[locale],
    numerals: "latn" as const,
    weekStartsOn: (locale === "he" || locale === "ar" ? 0 : 1) as 0 | 1,
    numberOfMonths,
    month,
    onMonthChange: setMonth,
    startMonth: new Date(todayDate.getFullYear(), todayDate.getMonth(), 1),
    endMonth,
    disabled: { before: todayDate },
    modifiers: {
      holiday: (date: Date) => marks.has(dateToDay(date)),
      yomTov: (date: Date) => marks.get(dateToDay(date))?.isYomTov === true,
    },
    onDayMouseEnter: (date: Date) => setHovered(marks.has(dateToDay(date)) ? dateToDay(date) : null),
    onDayMouseLeave: () => setHovered(null),
    onDayFocus: (date: Date) => setHovered(marks.has(dateToDay(date)) ? dateToDay(date) : null),
    components: { DayButton: HolidayDayButton },
    className: cn("mx-auto p-0 [--cell-size:--spacing(10)]", className),
  } satisfies Partial<ComponentProps<typeof Calendar>>;

  const caption = (
    <p className="mt-3 flex min-h-5 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      {hoveredMark ? (
        <>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span>
            <span className="font-medium text-foreground">
              {formatDate(hoveredMark.date, locale, { weekday: "short", day: "numeric", month: "short" })}
            </span>
            {" · "}
            {hoveredMark.name}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />
          <span>{t("holidayLegend")}</span>
        </>
      )}
    </p>
  );

  if (props.mode === "single") {
    return (
      <MarksContext.Provider value={context}>
        <Calendar
          {...shared}
          mode="single"
          selected={props.checkIn ? dayToDate(props.checkIn) : undefined}
          onSelect={(date) => props.onChange(date ? dateToDay(date) : null)}
        />
        {caption}
      </MarksContext.Provider>
    );
  }

  const selected: DateRange | undefined = props.checkIn
    ? { from: dayToDate(props.checkIn), to: props.checkOut ? dayToDate(props.checkOut) : undefined }
    : undefined;

  return (
    <MarksContext.Provider value={context}>
      <Calendar
        {...shared}
        mode="range"
        min={1}
        selected={selected}
        onSelect={(range, triggerDate) => {
          // A click after a complete stay starts a new one (instead of stretching the old one).
          if (props.checkIn && props.checkOut) {
            props.onChange(dateToDay(triggerDate), null);
            return;
          }
          const from = range?.from ? dateToDay(range.from) : null;
          const to = range?.to ? dateToDay(range.to) : null;
          props.onChange(from, to && from && to > from ? to : null);
        }}
      />
      {caption}
    </MarksContext.Provider>
  );
}

function HolidayDayButton({ children, ...props }: DayButtonProps) {
  const { marks } = useContext(MarksContext);
  const mark = marks.get(dateToDay(props.day.date));
  const content = (
    <>
      {children}
      {mark ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-x-0 bottom-1 mx-auto size-1 rounded-full",
              props.modifiers.selected ? "bg-current" : "bg-primary",
            )}
          />
          <span className="sr-only">{`, ${mark.name}`}</span>
        </>
      ) : null}
    </>
  );
  if (!mark || props.modifiers.disabled) return (
      <CalendarDayButton {...props}>
        {content}
      </CalendarDayButton>
    );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative block size-full">
          <CalendarDayButton {...props}>
            {content}
          </CalendarDayButton>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-center">
        {mark.name}
      </TooltipContent>
    </Tooltip>
  );
}
