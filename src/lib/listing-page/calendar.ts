/**
 * Read-only availability calendar (client-safe, pure). Days are "YYYY-MM-DD" strings in Georgia
 * time; AvailabilityBlock.endDate is exclusive (the day a booking checks out is free again).
 */
export type DateBlock = { start: string; end: string };

export type CalendarDay = {
  date: string;
  day: number;
  blocked: boolean;
  past: boolean;
  today: boolean;
};

export type CalendarMonth = {
  year: number;
  /** 1–12 */
  month: number;
  /** The first day of the month, "YYYY-MM-01" (for the month title). */
  first: string;
  /** Rows of 7 cells starting on `weekStartsOn`; null cells are outside the month. */
  weeks: (CalendarDay | null)[][];
  blockedCount: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Day of the week of a calendar day (0 = Sunday). */
function weekday(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isBlockedDay(day: string, blocks: readonly DateBlock[]): boolean {
  return blocks.some((b) => b.start <= day && day < b.end);
}

/** "YYYY-MM-DD" of a date in Georgia (UTC+4 all year). */
export function georgiaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3600 * 1000).toISOString().slice(0, 10);
}

export function buildMonth(
  year: number,
  month: number,
  blocks: readonly DateBlock[],
  today: string,
  weekStartsOn: 0 | 1 = 0,
): CalendarMonth {
  const total = daysInMonth(year, month);
  const lead = (weekday(year, month, 1) - weekStartsOn + 7) % 7;
  const cells: (CalendarDay | null)[] = Array.from({ length: lead }, () => null);
  let blockedCount = 0;
  for (let d = 1; d <= total; d++) {
    const date = ymd(year, month, d);
    const blocked = isBlockedDay(date, blocks);
    const past = date < today;
    if (blocked && !past) blockedCount++;
    cells.push({ date, day: d, blocked, past, today: date === today });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year, month, first: ymd(year, month, 1), weeks, blockedCount };
}

/** `count` months starting with the month of `today`. */
export function buildMonths(
  blocks: readonly DateBlock[],
  today: string,
  count = 2,
  weekStartsOn: 0 | 1 = 0,
): CalendarMonth[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const index = (m - 1 + i) % 12;
    const year = y + Math.floor((m - 1 + i) / 12);
    return buildMonth(year, index + 1, blocks, today, weekStartsOn);
  });
}

/** Weeks start on Monday in Russian and Georgian, on Sunday in Hebrew, Arabic and English. */
export function weekStartFor(locale: string): 0 | 1 {
  return locale === "ru" || locale === "ka" ? 1 : 0;
}

/** Seven sample dates (a known week) to label the weekday columns, starting on `weekStartsOn`. */
export function weekdaySamples(weekStartsOn: 0 | 1): string[] {
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => ymd(2024, 1, 7 + weekStartsOn + i));
}
