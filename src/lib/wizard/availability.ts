/**
 * Availability calendar helpers (client-safe, pure). Days are "YYYY-MM-DD" strings in UTC;
 * ranges are inclusive (the database stores an exclusive end date — see setAvailability).
 */
import type { DayRange } from "./types";

const DAY_MS = 24 * 3600 * 1000;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is string {
  return typeof value === "string" && DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** A local calendar date (what the day picker returns) as "YYYY-MM-DD". */
export function dayFromLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" as a local Date at midnight (for the day picker). */
export function localDateFromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayDay(now = new Date()): string {
  return dayFromLocalDate(now);
}

/** Every day in the ranges. */
export function rangesToDays(ranges: readonly DayRange[], maxDays = 3000): Set<string> {
  const days = new Set<string>();
  for (const range of ranges) {
    if (!isDay(range.start) || !isDay(range.end) || range.start > range.end) continue;
    for (let day = range.start; day <= range.end && days.size < maxDays; day = addDays(day, 1)) days.add(day);
  }
  return days;
}

/** Consecutive days → inclusive ranges, sorted. */
export function daysToRanges(days: Iterable<string>): DayRange[] {
  const sorted = [...new Set(days)].filter(isDay).sort();
  const ranges: DayRange[] = [];
  for (const day of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.end, 1) === day) last.end = day;
    else ranges.push({ start: day, end: day });
  }
  return ranges;
}

/** Sorts, clips to [today, today + ~2 years] and merges overlapping or touching ranges. */
export function normalizeRanges(ranges: readonly DayRange[], today: string, maxDays = 2 * 366): DayRange[] {
  const max = addDays(today, maxDays);
  const clipped = ranges
    .filter((r) => isDay(r.start) && isDay(r.end))
    .map((r) => ({ start: r.start < today ? today : r.start, end: r.end > max ? max : r.end }))
    .filter((r) => r.start <= r.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const merged: DayRange[] = [];
  for (const range of clipped) {
    const last = merged[merged.length - 1];
    if (last && range.start <= addDays(last.end, 1)) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/** Blocks (or frees) every day from `start` to `end` inclusive. */
export function applyRange(blocked: readonly DayRange[], start: string, end: string, block: boolean): DayRange[] {
  const [from, to] = start <= end ? [start, end] : [end, start];
  const days = rangesToDays(blocked);
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (block) days.add(day);
    else days.delete(day);
  }
  return daysToRanges(days);
}

/** True when every day of the range is already blocked. */
export function isRangeBlocked(blocked: readonly DayRange[], start: string, end: string): boolean {
  const days = rangesToDays(blocked);
  const [from, to] = start <= end ? [start, end] : [end, start];
  for (let day = from; day <= to; day = addDays(day, 1)) if (!days.has(day)) return false;
  return true;
}
