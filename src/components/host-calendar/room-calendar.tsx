"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, LockOpenIcon, MinusIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ds/button";
import { Ltr } from "@/components/common/ltr";
import { Link } from "@/i18n/navigation";
import { saveRoomBlocksAction } from "@/lib/booking/host-actions";
import type { HostCalendarBooking, HostRoomCalendar } from "@/lib/booking/host-calendar";
import { applyRoomSelection, type RoomBlockRange } from "@/lib/booking/room-blocks";
import { formatDate, formatDateRange, formatNumber } from "@/lib/format";
import { buildMonth } from "@/lib/listing-page/calendar";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/wizard/availability";
import { daysBetween, monthStart, weekStartFor } from "./model";
import { indexRoomCalendar, roomSelectionSummary } from "./room-model";

const NAV =
  "inline-flex size-11 items-center justify-center rounded-full text-foreground outline-none transition-colors hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-40";
const STEP =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border-strong bg-card text-foreground outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-35";

/** A known Sunday, for weekday names. */
const SUNDAY = "2026-11-01";

type Selection = { start: string; end: string; open: boolean };

/**
 * One hotel room type's calendar (round 3, founder's answer 3): every night shows the free rooms
 * of the type ("2/3"), and full nights stand out. Select nights (tap one, then another), then close
 * N rooms on them (at most the rooms still free on each night) or open the rooms you closed; the
 * bookings of those nights are listed with links. Two months at a time, keyboard-navigable.
 * Text: `hostBooking.calendar.rooms`, `hostBooking.calendar`.
 */
export function RoomCalendar({
  listingId,
  room,
  today,
  monthCount,
  closed,
  bookings,
  returnTo,
}: {
  listingId: string;
  room: HostRoomCalendar;
  today: string;
  monthCount: number;
  /** Nights the whole hotel is closed (end exclusive). */
  closed: { start: string; end: string }[];
  bookings: Record<string, HostCalendarBooking>;
  returnTo?: string;
}) {
  const t = useTranslations("hostBooking.calendar.rooms");
  const tc = useTranslations("hostBooking.calendar");
  const locale = useLocale();
  const rtl = locale === "he" || locale === "ar";
  const weekStartsOn = weekStartFor(locale);
  const [owner, setOwner] = useState<RoomBlockRange[]>(room.owner);
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  const index = useMemo(
    () => indexRoomCalendar({ today, quantity: room.quantity, owner, booked: room.booked, imported: room.imported, closed }),
    [today, room.quantity, owner, room.booked, room.imported, closed],
  );
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
  const summary = roomSelectionSummary(selectedDays, index);
  const blockCount = Math.min(Math.max(1, count), Math.max(1, summary.minFree));
  const visible = months.flatMap((m) => m.weeks.flat()).filter((d) => d !== null);
  const tabDay = (focusDay && focusDay >= first && focusDay <= last && focusDay) || (today >= first && today <= last ? today : visible[0]?.date) || first;
  const n = (value: number) => formatNumber(value, locale);

  const dayLabel = (day: string) => {
    const state = index.day(day);
    const parts = [formatDate(day, locale, { weekday: "long", day: "numeric", month: "long" })];
    if (state.past) parts.push(tc("state.past"));
    else if (state.closed) parts.push(t("closedHotel"));
    else parts.push(t("freeOf", { free: n(state.free), total: n(room.quantity) }));
    if (state.booked) parts.push(t("bookedRooms", { count: state.booked }));
    if (state.imported) parts.push(t("importedRooms", { count: state.imported }));
    if (state.blocked) parts.push(t("blockedRooms", { count: state.blocked }));
    return parts.join(", ");
  };

  const onDay = (day: string) => {
    if (day < today && index.day(day).codes.length === 0) return;
    setCount(1);
    setSelection((current) => (current && current.open ? { start: current.start, end: day, open: false } : { start: day, end: day, open: true }));
  };

  const moveFocus = (day: string) => {
    if (day < first && offset > 0) setOffset(offset - 1);
    else if (day > last && offset < maxOffset) setOffset(offset + 1);
    else if (day < first || day > last) return;
    setFocusDay(day);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: string, column: number) => {
    const step: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 7, ArrowUp: -7, Home: -column, End: 6 - column };
    if (event.key === "Escape" && selection) {
      event.preventDefault();
      setSelection(null);
      return;
    }
    if (!(event.key in step)) return;
    event.preventDefault();
    moveFocus(addDays(day, step[event.key]));
  };

  const apply = async (action: { kind: "block"; rooms: number } | { kind: "free" }) => {
    if (!selection || saving) return;
    const before = owner;
    const next = applyRoomSelection(owner, selectedDays, action, (day) => index.day(day).free, today);
    setOwner(next);
    setSelection(null);
    setSaving(true);
    const result = await saveRoomBlocksAction({ listingId, roomTypeId: room.id, blocked: next }).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      setOwner(result.data.blocked);
      toast.success(action.kind === "block" ? t("blockedToast", { count: action.rooms }) : t("openedToast"));
    } else {
      setOwner(before);
      toast.error(result && result.error === "rate_limited" ? tc("rateLimited") : tc("saveFailed"));
    }
  };

  const monthRange = formatDateRange(first, last, locale, { month: "long", year: "numeric" });
  const futureSelected = selectedDays.some((day) => day >= today);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-small text-pretty text-muted-foreground" aria-live="polite">
          {selection ? (selection.open ? tc("pickEnd") : tc("selected", { count: selectedDays.length })) : t("pickHint")}
        </p>
        <div className="flex shrink-0 items-center" role="group" aria-label={monthRange}>
          <button type="button" className={NAV} onClick={() => setOffset(offset - 1)} disabled={offset === 0} aria-label={tc("previous")}>
            <ChevronLeftIcon className="size-5 rtl:-scale-x-100" aria-hidden />
          </button>
          <button type="button" className={NAV} onClick={() => setOffset(offset + 1)} disabled={offset >= maxOffset} aria-label={tc("next")}>
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
                    const state = index.day(cell.date);
                    const selected = selectedSet.has(cell.date);
                    const full = !state.past && !state.closed && state.free === 0;
                    const some = !state.past && !state.closed && state.free > 0 && state.free < room.quantity;
                    return (
                      <td key={cell.date} className="p-0 py-0.5">
                        <button
                          type="button"
                          data-day={cell.date}
                          tabIndex={cell.date === tabDay ? 0 : -1}
                          aria-disabled={(state.past && state.codes.length === 0) || undefined}
                          aria-pressed={!state.past ? selected : undefined}
                          aria-label={dayLabel(cell.date)}
                          onClick={() => onDay(cell.date)}
                          onKeyDown={(event) => onKeyDown(event, cell.date, column)}
                          onFocus={() => setFocusDay(cell.date)}
                          className={cn(
                            "relative mx-auto flex h-12 w-full max-w-12 flex-col items-center justify-center rounded-xl text-small leading-none tabular-nums outline-none transition-colors duration-(--motion-fast) focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/60",
                            state.past && "cursor-default text-muted-foreground/60",
                            !state.past && !selected && !full && !some && !state.closed && "font-medium text-foreground hover:bg-surface-muted",
                            some && !selected && "bg-surface-muted font-medium text-foreground hover:bg-border",
                            full && !selected && "bg-primary-tint font-semibold text-primary-text",
                            state.closed && !state.past && !selected && "bg-surface-muted text-muted-foreground line-through decoration-muted-foreground/70",
                            selected && "bg-primary font-semibold text-primary-foreground",
                            cell.today && !selected && "ring-1 ring-border-strong",
                          )}
                        >
                          <span>{formatNumber(cell.day, locale)}</span>
                          {!state.past ? (
                            <span aria-hidden className={cn("mt-1 text-[0.6875rem] font-medium", selected ? "text-primary-foreground" : "text-muted-foreground", full && !selected && "text-primary-text")}>
                              <Ltr>{`${n(state.free)}/${n(room.quantity)}`}</Ltr>
                            </span>
                          ) : null}
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

      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption text-muted-foreground" aria-label={tc("legendLabel")}>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md border border-border-strong bg-card" aria-hidden />
          {t("legendFree")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md bg-surface-muted ring-1 ring-border" aria-hidden />
          {t("legendSome")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md bg-primary-tint ring-1 ring-primary-tint-border" aria-hidden />
          {t("legendFull")}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-4 rounded-md bg-surface-muted line-through" aria-hidden />
          {t("legendClosed")}
        </li>
      </ul>

      {selection && (
        <div className="sticky bottom-[calc(var(--bottom-nav-height)+0.75rem)] z-(--z-sticky) grid gap-3 rounded-card border border-border bg-card p-3 shadow-sheet motion-safe:animate-fade-up">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-small font-medium">
              {selection.open && selectedDays.length === 1
                ? formatDate(selection.start, locale, { weekday: "long", day: "numeric", month: "long" })
                : formatDateRange(selectedDays[0], selectedDays[selectedDays.length - 1], locale)}
              {futureSelected ? (
                <span className="block font-normal text-muted-foreground">{t("leastFree", { count: summary.minFree, total: n(room.quantity) })}</span>
              ) : null}
            </p>
            <Button type="button" variant="ghost" size="icon" aria-label={tc("clear")} onClick={() => setSelection(null)}>
              <XIcon aria-hidden />
            </Button>
          </div>
          {futureSelected && summary.minFree > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1" role="group" aria-label={t("roomsToClose")}>
                <button type="button" className={STEP} disabled={blockCount <= 1} aria-label={t("fewer")} onClick={() => setCount(blockCount - 1)}>
                  <MinusIcon className="size-4.5" aria-hidden />
                </button>
                <output aria-live="polite" className="w-8 text-center text-body font-semibold tabular-nums">
                  {n(blockCount)}
                </output>
                <button type="button" className={STEP} disabled={blockCount >= summary.minFree} aria-label={t("more")} onClick={() => setCount(blockCount + 1)}>
                  <PlusIcon className="size-4.5" aria-hidden />
                </button>
              </span>
              <Button type="button" className="min-w-0 flex-1 px-3" disabled={saving} onClick={() => void apply({ kind: "block", rooms: blockCount })}>
                <LockIcon aria-hidden />
                <span className="truncate">{t("close", { count: blockCount })}</span>
              </Button>
            </div>
          ) : null}
          {futureSelected && summary.blocked > 0 ? (
            <Button type="button" variant="outline" className="min-w-0 px-3" disabled={saving} onClick={() => void apply({ kind: "free" })}>
              <LockOpenIcon aria-hidden />
              <span className="truncate">{t("open")}</span>
            </Button>
          ) : null}
          {summary.codes.length > 0 ? (
            <div className="grid gap-1.5 border-t border-border pt-2">
              <p className="text-caption font-semibold text-muted-foreground">{t("bookingsTitle")}</p>
              <ul className="grid gap-1">
                {summary.codes.map((code) => {
                  const booking = bookings[code];
                  return (
                    <li key={code}>
                      <Link
                        href={booking ? (returnTo ? { pathname: booking.path, query: { from: returnTo } } : booking.path) : `/account/host-bookings/${encodeURIComponent(code)}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-input px-2 text-small outline-none hover:bg-surface-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0 truncate">
                          <Ltr className="font-semibold">{code}</Ltr>
                          {booking ? (
                            <>
                              {" · "}
                              <span dir="auto">{booking.guestName}</span>
                              {" · "}
                              {t("roomsCount", { count: booking.rooms })}
                            </>
                          ) : null}
                        </span>
                        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {!futureSelected && summary.codes.length === 0 ? <p className="text-small text-muted-foreground">{tc("nothingToChange")}</p> : null}
        </div>
      )}
    </div>
  );
}
