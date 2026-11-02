/**
 * Picking stay dates on the listing page (client-safe, pure). Days are "YYYY-MM-DD" in Georgia;
 * a block's end is exclusive (the guest who leaves on a day frees that night), so a stay may end
 * on the day the next block starts.
 */
import { isBlockedDay, type DateBlock } from "./calendar";

const DAY_MS = 86_400_000;

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

export function addDays(day: string, days: number): string {
  return new Date(toTime(day) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Nights between two days (0 when the range is empty or reversed). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.max(0, Math.round((toTime(checkOut) - toTime(checkIn)) / DAY_MS));
}

/** Every night from checkIn up to (not including) checkOut is free. */
export function rangeIsFree(blocks: readonly DateBlock[], checkIn: string, checkOut: string): boolean {
  return !blocks.some((b) => b.start < checkOut && checkIn < b.end);
}

/** The first day after `day` on which a block starts: the latest possible check-out. */
export function lastCheckOut(blocks: readonly DateBlock[], day: string): string | null {
  let first: string | null = null;
  for (const b of blocks) if (b.start > day && (first === null || b.start < first)) first = b.start;
  return first;
}

export type StayDates = { checkIn: string | null; checkOut: string | null };

export type DayRole = "checkIn" | "checkOut" | "none";

export type PickRules = { blocks: readonly DateBlock[]; today: string; minNights?: number | null };

/** Can the guest start a stay on this day (a free, not past day)? */
export function canCheckIn(day: string, { blocks, today }: PickRules): boolean {
  return day >= today && !isBlockedDay(day, blocks);
}

/** Can the guest leave on this day, having arrived on `checkIn`? */
export function canCheckOut(day: string, checkIn: string, { blocks, minNights }: PickRules): boolean {
  if (day <= checkIn) return false;
  if (nightsBetween(checkIn, day) < Math.max(1, minNights ?? 1)) return false;
  return rangeIsFree(blocks, checkIn, day);
}

/**
 * The dates after tapping `day`: the first tap (or a tap after a full range) picks the arrival,
 * the second the departure. A tap on or before the arrival, or past a booked night, starts over.
 * Taps on days that cannot start a stay are ignored (returns the same dates).
 */
export function pickDay(current: StayDates, day: string, rules: PickRules): StayDates {
  const { checkIn, checkOut } = current;
  if (checkIn && !checkOut && canCheckOut(day, checkIn, rules)) return { checkIn, checkOut: day };
  if (canCheckIn(day, rules)) return { checkIn: day, checkOut: null };
  return current;
}

/** The stay total in the host's currency: nights × the nightly price, plus the cleaning fee. */
export function stayTotal(nightly: number, nights: number, cleaningFee: number | null | undefined): number {
  return nightly * nights + (cleaningFee && cleaningFee > 0 ? cleaningFee : 0);
}

/** Adds or replaces checkIn / checkOut in a query string, keeping the other parameters. */
export function withStayParams(search: string, dates: StayDates): string {
  const params = new URLSearchParams(search);
  for (const key of ["checkIn", "checkOut"] as const) {
    const value = dates[key];
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The booking step for these dates: /listing/<id>/book?checkIn&checkOut&guests. */
export function bookingPath(listingPath: string, dates: StayDates, guests: number | null): string {
  const params = new URLSearchParams();
  if (dates.checkIn) params.set("checkIn", dates.checkIn);
  if (dates.checkOut) params.set("checkOut", dates.checkOut);
  if (guests) params.set("guests", String(guests));
  const query = params.toString();
  return `${listingPath}/book${query ? `?${query}` : ""}`;
}
