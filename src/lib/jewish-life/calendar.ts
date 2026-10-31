/**
 * Jewish calendar page helpers (pure, client-safe): the `?month=YYYY-MM` parameter,
 * week rows for the month grid, short Hebrew dates for the cells.
 */
import { formatDate } from "@/lib/format";

export type YearMonth = { year: number; month: number };

/** How far from the current month the calendar navigation goes (crawlers must not page forever). */
export const CALENDAR_RANGE_MONTHS = 120;

const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

export function monthIndex({ year, month }: YearMonth): number {
  return year * 12 + (month - 1);
}

function fromIndex(index: number): YearMonth {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function shiftMonth(value: YearMonth, delta: number): YearMonth {
  return fromIndex(monthIndex(value) + delta);
}

/** { year: 2026, month: 3 } → "2026-03". */
export function formatMonthParam({ year, month }: YearMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** Is `value` within CALENDAR_RANGE_MONTHS of `current`? */
export function isMonthInRange(value: YearMonth, current: YearMonth): boolean {
  return Math.abs(monthIndex(value) - monthIndex(current)) <= CALENDAR_RANGE_MONTHS;
}

/**
 * Reads `?month=YYYY-MM`. Invalid or far-away values fall back to the current month
 * (`valid: false` lets the page say so / keep it out of search engines).
 */
export function parseMonthParam(
  value: string | string[] | null | undefined,
  current: YearMonth,
): YearMonth & { valid: boolean; isCurrent: boolean } {
  const raw = Array.isArray(value) ? value[0] : value;
  const match = raw ? MONTH_PARAM.exec(raw.trim()) : null;
  if (match) {
    const parsed = { year: Number(match[1]), month: Number(match[2]) };
    if (parsed.month >= 1 && parsed.month <= 12 && isMonthInRange(parsed, current)) {
      return { ...parsed, valid: true, isCurrent: monthIndex(parsed) === monthIndex(current) };
    }
    return { ...current, valid: false, isCurrent: true };
  }
  return { ...current, valid: raw === undefined || raw === null || raw === "", isCurrent: true };
}

/** "2026-10-31" → { year: 2026, month: 10 }. */
export function yearMonthOf(date: string): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

/**
 * Splits a month's days into week rows that start on Sunday (the Jewish week),
 * padding the first and last week with nulls.
 */
export function buildMonthWeeks<T extends { weekday: number }>(days: readonly T[]): (T | null)[][] {
  if (days.length === 0) return [];
  const cells: (T | null)[] = [...Array<null>(days[0].weekday).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/**
 * "20 Cheshvan 5787" → "20 Cheshvan", "כ׳ חשון תשפ״ז" → "כ׳ חשון" (the year is always last).
 */
export function shortHebrewDate(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 2 ? parts.slice(0, -1).join(" ") : full.trim();
}

/** Seven dates of one week (Sun…Sat) — used to get localized weekday names from the formatter. */
export const REFERENCE_WEEK = [
  "2026-01-04",
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
  "2026-01-10",
] as const;

/** Today's civil date ("YYYY-MM-DD") in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const text = formatDate(now, "en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const match = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(text);
  if (!match) return now.toISOString().slice(0, 10);
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

/** "2026-10-31" + n days → "YYYY-MM-DD". */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "GMT+4" for Asia/Tbilisi (the offset at `at`, so daylight saving is respected). */
export function utcOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const text = formatDate(at, "en", { timeZone, hour: "numeric", timeZoneName: "shortOffset" });
  const match = /GMT[+-]\d{1,2}(?::\d{2})?|GMT|UTC/.exec(text);
  return match ? match[0] : timeZone;
}

/**
 * "Cheshvan – Kislev 5787" from the Hebrew dates of a month's first and last day
 * ("20 Cheshvan 5787", "20 Kislev 5787"); "Elul 5786 – Tishrei 5787" across a new year.
 */
export function hebrewMonthSpan(first: string, last: string): string {
  const split = (full: string) => {
    const parts = full.trim().split(/\s+/);
    return { month: parts.slice(1, -1).join(" "), year: parts[parts.length - 1] ?? "" };
  };
  const a = split(first);
  const b = split(last);
  if (!a.month || !b.month) return first;
  if (a.year === b.year) return a.month === b.month ? `${a.month} ${a.year}` : `${a.month} – ${b.month} ${b.year}`;
  return `${a.month} ${a.year} – ${b.month} ${b.year}`;
}
