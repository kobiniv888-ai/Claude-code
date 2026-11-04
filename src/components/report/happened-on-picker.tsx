"use client";

import { useId, useRef, useState, type Ref } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDaysIcon, ChevronDownIcon } from "lucide-react";
import { ar, enUS, he, ka, ru } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import type { AppLocale } from "@/config/site";
import { dirFor, isAppLocale } from "@/i18n/locale";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_PICKER_LOCALES = { he, en: enUS, ru, ar, ka } as const;

/** "YYYY-MM-DD" ⇄ a local Date at midnight (what the day picker works with). */
function localDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * "When did it happen?" of the turned-away report: a button showing the day in the page's
 * language ("3 בנובמבר 2026"), which opens a calendar right under it. Not a native date field:
 * its format follows the device's language, not the page's, and on /he "11/03/2026" from an
 * English phone reads as 11 March while it means 3 November (both are valid report dates).
 * The calendar is the site's own (Western digits, RTL, the week as in the search calendar), with
 * only the days a report may be about.
 */
export function HappenedOnPicker({
  id,
  labelId,
  value,
  min,
  max,
  onChange,
  invalid,
  describedBy,
  ref,
}: {
  /** The button's id (the label's htmlFor). */
  id: string;
  /** The visible label's id: the button is named by it and the day it shows. */
  labelId: string;
  /** "YYYY-MM-DD". */
  value: string;
  min: string;
  max: string;
  onChange: (day: string) => void;
  invalid?: boolean;
  describedBy?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("report.turnedAway");
  const rawLocale = useLocale();
  const locale: AppLocale = isAppLocale(rawLocale) ? rawLocale : "en";
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const valueId = useId();
  const calendarId = useId();
  const minDate = localDate(min);
  const maxDate = localDate(max);

  function setButton(node: HTMLButtonElement | null) {
    button.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  return (
    <div className="grid gap-2">
      <button
        ref={setButton}
        id={id}
        type="button"
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={open ? calendarId : undefined}
        // A button can't be aria-invalid: the message is tied to it by aria-describedby, and the
        // red border comes from data-invalid.
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-full items-center gap-2 rounded-input border border-border-strong bg-card px-3 text-start text-body text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-invalid:border-destructive sm:w-72"
      >
        <CalendarDaysIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span id={valueId} className="min-w-0 flex-1 truncate">
          {formatDate(value, locale, { day: "numeric", month: "long", year: "numeric" })}
        </span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={calendarId} className="flex justify-center rounded-xl border border-border bg-background p-1 sm:w-fit">
          <Calendar
            mode="single"
            required
            selected={localDate(value)}
            onSelect={(date) => {
              if (!date) return;
              onChange(dayOf(date));
              setOpen(false);
              // Back on the button (the calendar it was in is gone).
              requestAnimationFrame(() => button.current?.focus());
            }}
            defaultMonth={localDate(value)}
            startMonth={new Date(minDate.getFullYear(), minDate.getMonth(), 1)}
            endMonth={new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)}
            disabled={[{ before: minDate }, { after: maxDate }]}
            dir={dirFor(locale)}
            locale={DAY_PICKER_LOCALES[locale]}
            numerals="latn"
            weekStartsOn={locale === "he" || locale === "ar" ? 0 : 1}
            aria-label={t("pickDate")}
            className="[--cell-size:--spacing(10)]"
          />
        </div>
      ) : null}
    </div>
  );
}
