"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, LinkIcon, LockIcon, LockOpenIcon, UserRoundIcon, XIcon } from "lucide-react";
import { BottomSheet } from "@/components/ds/bottom-sheet";
import { Button, buttonStyles } from "@/components/ds/button";
import { Ltr } from "@/components/common/ltr";
import { Link } from "@/i18n/navigation";
import { saveHostBlocksAction } from "@/lib/booking/host-actions";
import type { HostCalendarBooking } from "@/lib/booking/host-calendar";
import { formatDate, formatDateRange, formatNumber } from "@/lib/format";
import { buildMonth } from "@/lib/listing-page/calendar";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/wizard/availability";
import type { DayRange } from "@/lib/wizard/types";
import {
  applySelection,
  dayKind,
  daysBetween,
  indexCalendar,
  monthStart,
  selectionCounts,
  weekStartFor,
  type BookedRange,
  type DayKind,
  type ImportedRange,
} from "./model";

type Selection = { start: string; end: string; open: boolean };
type SheetState = { type: "booking"; code: string } | { type: "imported"; source: string } | null;

const NAV =
  "inline-flex size-11 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40";

/** A known Sunday, for weekday names. */
const SUNDAY = "2026-11-01";

/**
 * The host's month view for one listing: their own blocked days (tap a day, then another to mark
 * a range, then "Block" or "Open"), Bayit bookings (tap → booking details) and nights imported
 * from other sites (tap → where they come from). Two months at a time, keyboard-navigable.
 */
export function HostCalendar({
  listingId,
  today,
  monthCount,
  owner: initialOwner,
  booked,
  imported,
  bookings,
  returnTo,
}: {
  listingId: string;
  today: string;
  monthCount: number;
  owner: DayRange[];
  booked: BookedRange[];
  imported: ImportedRange[];
  bookings: Record<string, HostCalendarBooking>;
  /** Shown inside the post form (bug 2.10): a booking's page gets "חזרה למודעה" back to this path. */
  returnTo?: string;
}) {
  const t = useTranslations("hostBooking.calendar");
  const tb = useTranslations("booking");
  const locale = useLocale();
  const rtl = locale === "he" || locale === "ar";
  const weekStartsOn = weekStartFor(locale);
  const [owner, setOwner] = useState<DayRange[]>(initialOwner);
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [saving, setSaving] = useState(false);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const index = useMemo(() => indexCalendar({ today, owner, booked, imported }), [today, owner, booked, imported]);
  const months = useMemo(
    () =>
      [0, 1].map((i) => {
        const { year, month } = monthStart(today, offset + i);
        return buildMonth(year, month, [], today, weekStartsOn);
      }),
    [today, offset, weekStartsOn],
  );
  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(SUNDAY, (i + weekStartsOn) % 7);
        return { short: formatDate(day, locale, { weekday: "narrow" }), long: formatDate(day, locale, { weekday: "long" }) };
      }),
    [locale, weekStartsOn],
  );

  const first = months[0].first;
  const lastMonth = months[1];
  const last = `${lastMonth.first.slice(0, 8)}${String(new Date(Date.UTC(lastMonth.year, lastMonth.month, 0)).getUTCDate()).padStart(2, "0")}`;
  const maxOffset = Math.max(0, monthCount - 2);

  const selectedDays = selection ? daysBetween(selection.start, selection.end) : [];
  const selectedSet = new Set(selectedDays);
  const counts = selectionCounts(selectedDays, index);

  const visible = months.flatMap((m) => m.weeks.flat()).filter((d) => d !== null);
  const tabDay =
    (focusDay && focusDay >= first && focusDay <= last && focusDay) ||
    (today >= first && today <= last ? today : visible[0]?.date) ||
    first;

  const stateLabel = (kind: DayKind, day: string): string => {
    if (kind === "booked") {
      const code = index.booked.get(day) ?? "";
      const booking = bookings[code];
      return booking ? t("dayBooked", { code, name: booking.guestName }) : t("dayBookedCode", { code });
    }
    if (kind === "imported") return t("dayImported", { source: index.imported.get(day) ?? "" });
    return t(`state.${kind}`);
  };

  const onDay = (day: string) => {
    const kind = dayKind(day, index);
    if (kind === "past") return;
    if (kind === "booked") {
      setSelection(null);
      setSheet({ type: "booking", code: index.booked.get(day) ?? "" });
      return;
    }
    if (kind === "imported") {
      setSelection(null);
      setSheet({ type: "imported", source: index.imported.get(day) ?? "" });
      return;
    }
    setSelection((current) =>
      current && current.open ? { start: current.start, end: day, open: false } : { start: day, end: day, open: true },
    );
  };

  const moveFocus = (day: string) => {
    if (day < first && offset > 0) setOffset(offset - 1);
    else if (day > last && offset < maxOffset) setOffset(offset + 1);
    else if (day < first || day > last) return;
    setFocusDay(day);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: string, column: number) => {
    const step: Record<string, number> = {
      ArrowRight: rtl ? -1 : 1,
      ArrowLeft: rtl ? 1 : -1,
      ArrowDown: 7,
      ArrowUp: -7,
      Home: -column,
      End: 6 - column,
    };
    if (event.key === "Escape" && selection) {
      event.preventDefault();
      setSelection(null);
      return;
    }
    if (!(event.key in step)) return;
    event.preventDefault();
    moveFocus(addDays(day, step[event.key]));
  };

  const apply = async (action: "block" | "free") => {
    if (!selection || saving) return;
    const before = owner;
    const next = applySelection(owner, selectedDays, action, index);
    setOwner(next);
    setSelection(null);
    setSaving(true);
    const result = await saveHostBlocksAction({ listingId, blocked: next }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      setOwner(result.data.blocked);
      toast.success(action === "block" ? t("blockedToast") : t("openedToast"));
    } else {
      setOwner(before);
      toast.error(result && result.error === "rate_limited" ? t("rateLimited") : t("saveFailed"));
    }
  };

  const booking = sheet?.type === "booking" ? bookings[sheet.code] : undefined;
  const monthRange = formatDateRange(first, last, locale, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-small text-pretty text-muted-foreground" aria-live="polite">
          {selection ? (selection.open ? t("pickEnd") : t("selected", { count: selectedDays.length })) : t("pickHint")}
        </p>
        <div className="flex shrink-0 items-center" role="group" aria-label={monthRange}>
          <button type="button" className={NAV} onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label={t("previous")}>
            <ChevronLeftIcon className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          <button type="button" className={NAV} onClick={() => setOffset(offset + 1)} disabled={offset >= maxOffset} aria-label={t("next")}>
            <ChevronRightIcon className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
        </div>
      </div>

      <div ref={grid} className="grid gap-6 md:grid-cols-2 md:gap-8">
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
                  {week.map((cell, column) => {
                    if (!cell) return <td key={`e${column}`} aria-hidden />;
                    const kind = dayKind(cell.date, index);
                    const selected = selectedSet.has(cell.date);
                    const code = kind === "booked" ? index.booked.get(cell.date) : undefined;
                    // Joined bars for a booking's nights: round only the first and last night.
                    const prevSame = code !== undefined && index.booked.get(addDays(cell.date, -1)) === code;
                    const nextSame = code !== undefined && index.booked.get(addDays(cell.date, 1)) === code;
                    return (
                      <td key={cell.date} className="p-0 py-0.5">
                        <button
                          type="button"
                          data-day={cell.date}
                          tabIndex={cell.date === tabDay ? 0 : -1}
                          aria-disabled={kind === "past" || undefined}
                          aria-pressed={kind === "free" || kind === "blocked" ? selected : undefined}
                          aria-label={`${formatDate(cell.date, locale, { weekday: "long", day: "numeric", month: "long" })}, ${stateLabel(kind, cell.date)}`}
                          onClick={() => onDay(cell.date)}
                          onKeyDown={(event) => onKeyDown(event, cell.date, column)}
                          onFocus={() => setFocusDay(cell.date)}
                          className={cn(
                            "relative mx-auto flex h-11 w-full max-w-12 items-center justify-center rounded-xl text-small tabular-nums outline-none transition-colors duration-(--motion-fast) focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/60",
                            kind === "past" && "cursor-default text-muted-foreground/60",
                            kind === "free" && !selected && "font-medium text-foreground hover:bg-surface-muted",
                            kind === "blocked" &&
                              !selected &&
                              "bg-surface-muted text-muted-foreground line-through decoration-muted-foreground/70 hover:bg-border",
                            kind === "imported" && "border border-dashed border-border-strong text-muted-foreground",
                            kind === "booked" && "max-w-none rounded-none bg-primary-tint font-semibold text-primary-text",
                            kind === "booked" && !prevSame && "rounded-s-xl",
                            kind === "booked" && !nextSame && "rounded-e-xl",
                            selected && "bg-primary font-semibold text-primary-foreground",
                            cell.today && !selected && kind !== "booked" && "ring-1 ring-border-strong",
                          )}
                        >
                          {formatNumber(cell.day, locale)}
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

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground" aria-label={t("legendLabel")}>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md border border-border-strong bg-card" aria-hidden />
          {t("state.free")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md bg-surface-muted" aria-hidden />
          {t("state.blocked")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md bg-primary-tint ring-1 ring-primary-tint-border" aria-hidden />
          {t("state.booked")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md border border-dashed border-border-strong" aria-hidden />
          {t("state.imported")}
        </li>
      </ul>

      {selection && (
        <div className="sticky bottom-[calc(var(--bottom-nav-height)+0.75rem)] z-(--z-sticky) grid gap-2 rounded-card border border-border bg-card p-3 shadow-sheet motion-safe:animate-fade-up">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-small font-medium">
              {selection.open && selectedDays.length === 1
                ? formatDate(selection.start, locale, { weekday: "long", day: "numeric", month: "long" })
                : formatDateRange(selectedDays[0], selectedDays[selectedDays.length - 1], locale)}
              {counts.free === 0 && counts.blocked === 0 && <span className="block text-muted-foreground">{t("nothingToChange")}</span>}
            </p>
            <Button type="button" variant="ghost" size="icon" aria-label={t("clear")} onClick={() => setSelection(null)}>
              <XIcon aria-hidden />
            </Button>
          </div>
          {(counts.free > 0 || counts.blocked > 0) && (
            <div className="flex gap-2">
              {counts.free > 0 && (
                <Button type="button" className="min-w-0 flex-auto shrink px-3" disabled={saving} onClick={() => void apply("block")}>
                  <LockIcon aria-hidden />
                  <span className="truncate">{t("block", { count: counts.free })}</span>
                </Button>
              )}
              {counts.blocked > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-w-0 flex-auto shrink px-3"
                  disabled={saving}
                  onClick={() => void apply("free")}
                >
                  <LockOpenIcon aria-hidden />
                  <span className="truncate">{t("open", { count: counts.blocked })}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <BottomSheet
        open={sheet?.type === "booking"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={sheet?.type === "booking" ? t("bookingTitle", { code: sheet.code }) : ""}
      >
        <div className="grid gap-4 px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          {booking ? (
            <>
              <dl className="grid gap-3 text-body">
                <div className="flex items-start gap-3">
                  <UserRoundIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <dt className="sr-only">{t("guest")}</dt>
                    <dd className="font-medium" dir="auto">
                      {booking.guestName}
                    </dd>
                    <dd className="text-small text-muted-foreground">
                      {tb("guests.total", { count: booking.guests })}
                      {booking.infants > 0 && ` · ${tb("guests.infants", { count: booking.infants })}`}
                    </dd>
                  </div>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-small text-muted-foreground">{t("dates")}</dt>
                  <dd>
                    {formatDateRange(booking.checkIn, booking.checkOut, locale)} · {tb("nights", { count: booking.nights })}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-small text-muted-foreground">{t("status")}</dt>
                  <dd>{tb(`status.${booking.status}`)}</dd>
                </div>
              </dl>
              <Link
                href={returnTo ? { pathname: booking.path, query: { from: returnTo } } : booking.path}
                className={buttonStyles({ variant: "primary", block: true })}
              >
                {t("openBooking")}
                <ChevronRightIcon className="rtl:-scale-x-100" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="text-body text-muted-foreground">
              {t("bookingUnknown")} <Ltr>{sheet?.type === "booking" ? sheet.code : ""}</Ltr>
            </p>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet?.type === "imported"}
        onOpenChange={(open) => !open && setSheet(null)}
        title={t("importedTitle")}
      >
        <div className="grid gap-3 px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
          <p className="flex items-start gap-3 text-body text-pretty">
            <LinkIcon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>
              {t.rich("importedBody", { source: () => <Ltr className="font-medium">{sheet?.type === "imported" ? sheet.source : ""}</Ltr> })}
            </span>
          </p>
          <p className="flex items-start gap-3 text-small text-pretty text-muted-foreground">
            <ExternalLinkIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("importedHelp")}
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}
