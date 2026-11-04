/**
 * Check-in and check-out times (round 3, brief 3). Client-safe and pure.
 *
 * The post form offers only the usual times, every 30 minutes, plus "גמיש":
 *  - check-in 12:00–22:00
 *  - check-out 07:00–14:00
 * A time saved before (for example a 10:00 check-in) stays a selectable extra option and is never
 * changed silently. "גמיש" is stored in Listing.checkInFlexible / checkOutFlexible; the time column
 * is then empty, so every reader that needs a clock (the free-cancellation deadline) falls back to
 * the default check-in time as before.
 *
 * Times are shown in each language's usual format, always with Western digits (@/lib/format):
 * 24-hour in Hebrew, Russian and Georgian ("14:00"), 12-hour in English ("2:00 PM") and Arabic
 * ("2:00 م").
 */
import { formatTime } from "@/lib/format";

export type CheckTimeKind = "checkIn" | "checkOut";

/** Minutes between two offered times. */
export const CHECK_TIME_STEP_MINUTES = 30;

/** The offered range of each picker (inclusive), "HH:MM". */
export const CHECK_TIME_RANGES: Record<CheckTimeKind, { from: string; to: string }> = {
  checkIn: { from: "12:00", to: "22:00" },
  checkOut: { from: "07:00", to: "14:00" },
};

/** The select value of "גמיש" (never a valid time, so it can't clash with one). */
export const FLEXIBLE_VALUE = "flex";

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** A stored time of day: "HH:MM", 24-hour. */
export function isClockTime(value: string | null | undefined): value is string {
  return typeof value === "string" && HH_MM.test(value);
}

function toMinutes(time: string): number {
  const [, h, m] = HH_MM.exec(time)!;
  return Number(h) * 60 + Number(m);
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Every `step` minutes from `from` to `to`, both included ("12:00", "12:30", … "22:00"). */
export function timeRange(from: string, to: string, step = CHECK_TIME_STEP_MINUTES): string[] {
  const out: string[] = [];
  for (let m = toMinutes(from); m <= toMinutes(to); m += step) out.push(fromMinutes(m));
  return out;
}

/** The usual times each picker offers. */
export const CHECK_TIMES: Record<CheckTimeKind, readonly string[]> = {
  checkIn: timeRange(CHECK_TIME_RANGES.checkIn.from, CHECK_TIME_RANGES.checkIn.to),
  checkOut: timeRange(CHECK_TIME_RANGES.checkOut.from, CHECK_TIME_RANGES.checkOut.to),
};

/**
 * The times a picker lists: the usual ones, plus the saved time when it is not one of them (it is
 * kept, in time order, so a listing that says 10:00 still shows 10:00).
 */
export function checkTimeOptions(kind: CheckTimeKind, saved: string | null | undefined): string[] {
  const usual = [...CHECK_TIMES[kind]];
  if (!isClockTime(saved) || usual.includes(saved)) return usual;
  return [...usual, saved].sort((a, b) => toMinutes(a) - toMinutes(b));
}

/** True when the saved time is outside the usual list (shown as an extra option). */
export function isUnusualCheckTime(kind: CheckTimeKind, saved: string | null | undefined): boolean {
  return isClockTime(saved) && !CHECK_TIMES[kind].includes(saved);
}

/** "9:30" or "09:30" → "09:30"; anything else → null (older rows may lack the leading zero). */
export function normalizeClock(value: string | null | undefined): string | null {
  const match = typeof value === "string" ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim()) : null;
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

/**
 * "14:00" → "14:00" (he, ru, ka), "2:00 PM" (en), "2:00 م" (ar). Host times are wall-clock times
 * in the listing's country, so they are formatted as UTC (no time-zone shift).
 */
export function clockLabel(time: string, locale: string): string {
  const clock = normalizeClock(time);
  if (!clock) return time;
  const [h, m] = clock.split(":").map(Number);
  return formatTime(new Date(Date.UTC(2000, 0, 1, h, m)), locale, "UTC");
}

// ─── The picker's value ───────────────────────────────────────

export type CheckTimeChoice = { time: string; flexible: boolean };

/** What the select shows: "flex", a time, or "" (not set). */
export function checkTimeSelectValue(choice: CheckTimeChoice): string {
  if (choice.flexible) return FLEXIBLE_VALUE;
  return isClockTime(choice.time) ? choice.time : "";
}

/** The answer for a select value: "גמיש" clears the time, a time clears "גמיש", "" clears both. */
export function checkTimeFromSelect(value: string): CheckTimeChoice {
  if (value === FLEXIBLE_VALUE) return { time: "", flexible: true };
  return { time: isClockTime(value) ? value : "", flexible: false };
}

// ─── Readers (listing page, booking review, trip page, emails, calendar file) ─

/** What to show for a check-in or check-out: "flexible", a time, or nothing. */
export type CheckTimeDisplay = { flexible: true } | { flexible: false; time: string } | null;

export function checkTimeDisplay(time: string | null | undefined, flexible: boolean | null | undefined): CheckTimeDisplay {
  if (flexible) return { flexible: true };
  const clock = normalizeClock(time);
  return clock ? { flexible: false, time: clock } : null;
}
