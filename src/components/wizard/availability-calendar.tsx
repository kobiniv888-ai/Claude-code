"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";
import { ar, enUS, he, ka, ru } from "react-day-picker/locale";
import { CalendarCheckIcon, CalendarXIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import type { AppLocale } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { formatDateRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addDays,
  applyRange,
  dayFromLocalDate,
  isRangeBlocked,
  localDateFromDay,
  rangesToDays,
  todayDay,
} from "@/lib/wizard/availability";
import type { DayRange } from "@/lib/wizard/types";

const DAY_PICKER_LOCALES = { he, en: enUS, ru, ar, ka } as const;

function subscribeWide(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** Two months side by side from 768 px, one on phones. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

function nightsBetween(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * The owner's availability: pick a range of days, then mark it unavailable (or available
 * again). Days imported from Airbnb / Booking.com calendars are shown but cannot be changed here.
 */
export function AvailabilityCalendar({
  locale,
  blocked,
  icalBlocked,
  onChange,
  saving,
}: {
  locale: AppLocale;
  blocked: DayRange[];
  icalBlocked: DayRange[];
  onChange: (ranges: DayRange[]) => void;
  saving: boolean;
}) {
  const t = useTranslations("wizard.price");
  const wide = useWide();
  const [selection, setSelection] = useState<DateRange | undefined>();
  const today = todayDay();

  const blockedDates = useMemo(() => [...rangesToDays(blocked)].map(localDateFromDay), [blocked]);
  const icalDates = useMemo(() => [...rangesToDays(icalBlocked)].map(localDateFromDay), [icalBlocked]);

  const from = selection?.from ? dayFromLocalDate(selection.from) : null;
  const to = selection?.to ? dayFromLocalDate(selection.to) : from;
  const allBlocked = from && to ? isRangeBlocked(blocked, from, to) : false;

  const apply = (block: boolean) => {
    if (!from || !to) return;
    onChange(applyRange(blocked, from, to, block));
    setSelection(undefined);
  };

  const upcoming = blocked.filter((r) => r.end >= today);

  return (
    <div className="grid gap-4">
      <div className="flex justify-center overflow-x-auto rounded-xl border border-border bg-background p-1 sm:p-3">
        <Calendar
          mode="range"
          selected={selection}
          onSelect={setSelection}
          numberOfMonths={wide ? 2 : 1}
          pagedNavigation
          dir={dirFor(locale)}
          locale={DAY_PICKER_LOCALES[locale]}
          numerals="latn"
          weekStartsOn={locale === "he" || locale === "ar" ? 0 : 1}
          startMonth={localDateFromDay(today)}
          endMonth={localDateFromDay(addDays(today, 2 * 365))}
          disabled={[{ before: localDateFromDay(today) }, ...icalDates]}
          modifiers={{ blocked: blockedDates, ical: icalDates }}
          modifiersClassNames={{
            blocked:
              "[&>button]:bg-destructive/10 [&>button]:text-destructive [&>button]:line-through [&>button]:decoration-2",
            ical: "[&>button]:bg-muted [&>button]:text-muted-foreground [&>button]:line-through [&>button]:opacity-100",
          }}
          className="[--cell-size:--spacing(10)] sm:[--cell-size:--spacing(10)]"
          aria-label={t("calendarLabel")}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-border bg-background" />
          {t("legendAvailable")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-destructive/20" />
          {t("legendBlocked")}
        </span>
        {icalBlocked.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-muted ring-1 ring-border" />
            {t("legendIcal")}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors",
          from ? "border-primary/30 bg-secondary/60" : "border-dashed border-border",
        )}
        aria-live="polite"
      >
        {from && to ? (
          <>
            <p className="text-sm font-medium">
              <bdi>{formatDateRange(from, to, locale, { day: "numeric", month: "short" })}</bdi>
              <span className="text-muted-foreground"> · {t("days", { count: nightsBetween(from, to) })}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {allBlocked ? (
                <Button type="button" size="sm" variant="outline" onClick={() => apply(false)} disabled={saving}>
                  <CalendarCheckIcon aria-hidden />
                  {t("markAvailable")}
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => apply(true)} disabled={saving}>
                  <CalendarXIcon aria-hidden />
                  {t("markBlocked")}
                </Button>
              )}
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => setSelection(undefined)}
                aria-label={t("clearSelection")}
              >
                <XIcon aria-hidden />
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t("calendarHelp")}</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="grid gap-2">
          <h4 className="text-sm font-medium">{t("blockedList")}</h4>
          <ul className="flex flex-wrap gap-2">
            {upcoming.map((range) => (
              <li
                key={`${range.start}-${range.end}`}
                className="flex items-center gap-1 rounded-full border border-border bg-card py-1 ps-3 pe-1 text-sm"
              >
                <bdi>{formatDateRange(range.start, range.end, locale, { day: "numeric", month: "short" })}</bdi>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => onChange(applyRange(blocked, range.start, range.end, false))}
                  aria-label={t("unblockRange", {
                    range: formatDateRange(range.start, range.end, locale, { day: "numeric", month: "long" }),
                  })}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
