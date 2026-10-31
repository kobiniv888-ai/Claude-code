/**
 * Jewish holidays for the date picker (pure): one mark per calendar day, so the calendar can put
 * a dot under the day and name the holiday in a tooltip.
 */
export type HolidayMark = {
  /** "YYYY-MM-DD" */
  date: string;
  /** Translated names of everything on that day, joined: "Erev Sukkot · Yom Kippur". */
  name: string;
  /** A day of Yom Tov (no travel or work for observant guests). */
  isYomTov: boolean;
};

type HolidayLike = { date: string; name: string; isYomTov: boolean; category?: string };

/** How many months ahead the date picker marks holidays. */
export const HOLIDAY_MONTHS_AHEAD = 18;

/**
 * Merges holidays that fall on the same day and drops modern Israeli days (Yom HaAtzmaut…),
 * which do not change where an observant family stays. Sorted by date.
 */
export function toHolidayMarks(holidays: readonly HolidayLike[]): HolidayMark[] {
  const byDay = new Map<string, HolidayMark>();
  for (const holiday of holidays) {
    if (holiday.category === "modern") continue;
    const existing = byDay.get(holiday.date);
    if (existing) {
      if (!existing.name.split(" · ").includes(holiday.name)) existing.name = `${existing.name} · ${holiday.name}`;
      existing.isYomTov ||= holiday.isYomTov;
    } else {
      byDay.set(holiday.date, { date: holiday.date, name: holiday.name, isYomTov: holiday.isYomTov });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** "YYYY-MM-DD" of a UTC calendar day `months` after `from` (same day of month, clamped). */
export function addMonthsToDay(from: string, months: number): string {
  const [y, m, d] = from.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
