/**
 * Overlap rules for stays and blocked ranges (client-safe, pure). Ranges are half-open
 * [start, end) of "YYYY-MM-DD" days: a block's end day is free again, so a stay may check out on
 * the day the next one checks in.
 */

export type DayRange = { start: string; end: string };

/** Two half-open ranges share at least one night. Empty ranges never overlap. */
export function rangesOverlap(a: DayRange, b: DayRange): boolean {
  return a.start < a.end && b.start < b.end && a.start < b.end && b.start < a.end;
}

/** The first range in `ranges` that shares a night with [checkIn, checkOut), or null. */
export function findOverlap<T extends DayRange>(ranges: readonly T[], checkIn: string, checkOut: string): T | null {
  const stay = { start: checkIn, end: checkOut };
  return ranges.find((range) => rangesOverlap(range, stay)) ?? null;
}

/** Every night of [checkIn, checkOut) is outside every range. */
export function isStayFree(ranges: readonly DayRange[], checkIn: string, checkOut: string): boolean {
  return checkIn < checkOut && findOverlap(ranges, checkIn, checkOut) === null;
}

/**
 * Sorted, merged ranges: overlapping or touching ranges become one ([1,3) + [3,5) → [1,5)).
 * Empty and reversed ranges are dropped.
 */
export function mergeRanges(ranges: readonly DayRange[]): DayRange[] {
  const sorted = ranges
    .filter((range) => range.start < range.end)
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : 1));
  const merged: DayRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/** Merged ranges cut to the window [from, to). */
export function clipRanges(ranges: readonly DayRange[], from: string, to: string): DayRange[] {
  return mergeRanges(ranges)
    .map((range) => ({ start: range.start < from ? from : range.start, end: range.end > to ? to : range.end }))
    .filter((range) => range.start < range.end);
}
