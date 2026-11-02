/**
 * The host calendar's day logic (pure, client-safe). Days are "YYYY-MM-DD" in Georgia time.
 * The host's own blocks are inclusive ranges (like the wizard calendar); booked and imported
 * ranges keep the database's exclusive end (the check-out day is free again).
 */
import { addDays, daysToRanges, rangesToDays } from "@/lib/wizard/availability";
import type { DayRange } from "@/lib/wizard/types";

/** A booked or imported range: `end` is exclusive. */
export type BusyRange = { start: string; end: string };
export type BookedRange = BusyRange & { code: string };
export type ImportedRange = BusyRange & { source: string };

export type DayKind = "past" | "free" | "blocked" | "booked" | "imported";

export type CalendarIndex = {
  today: string;
  owner: Set<string>;
  /** Day → booking code. */
  booked: Map<string, string>;
  /** Day → calendar host name ("airbnb.com"). */
  imported: Map<string, string>;
};

const MAX_DAYS = 3000;

function eachNight(range: BusyRange, visit: (day: string) => void) {
  let n = 0;
  for (let day = range.start; day < range.end && n < MAX_DAYS; day = addDays(day, 1), n++) visit(day);
}

export function indexCalendar(input: {
  today: string;
  owner: readonly DayRange[];
  booked: readonly BookedRange[];
  imported: readonly ImportedRange[];
}): CalendarIndex {
  const booked = new Map<string, string>();
  for (const range of input.booked) eachNight(range, (day) => booked.set(day, range.code));
  const imported = new Map<string, string>();
  for (const range of input.imported) eachNight(range, (day) => imported.set(day, range.source));
  return { today: input.today, owner: rangesToDays(input.owner), booked, imported };
}

/** What a day shows. A booking wins over everything; imported nights over the host's own blocks. */
export function dayKind(day: string, index: CalendarIndex): DayKind {
  if (index.booked.has(day)) return "booked";
  if (day < index.today) return "past";
  if (index.imported.has(day)) return "imported";
  if (index.owner.has(day)) return "blocked";
  return "free";
}

/** Every day from `a` to `b` (either order), inclusive. */
export function daysBetween(a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const days: string[] = [];
  for (let day = from; day <= to && days.length < MAX_DAYS; day = addDays(day, 1)) days.push(day);
  return days;
}

/** How many days of a selection each action would change. */
export function selectionCounts(days: readonly string[], index: CalendarIndex): { free: number; blocked: number } {
  let free = 0;
  let blocked = 0;
  for (const day of days) {
    const kind = dayKind(day, index);
    if (kind === "free") free++;
    else if (kind === "blocked") blocked++;
  }
  return { free, blocked };
}

/**
 * The host's blocks after blocking (only free days) or freeing (only the host's own blocks) the
 * selected days. Booked, imported and past days never change here.
 */
export function applySelection(
  owner: readonly DayRange[],
  days: readonly string[],
  action: "block" | "free",
  index: CalendarIndex,
): DayRange[] {
  const next = rangesToDays(owner);
  for (const day of days) {
    const kind = dayKind(day, index);
    if (action === "block" && kind === "free") next.add(day);
    if (action === "free" && kind === "blocked") next.delete(day);
  }
  return daysToRanges([...next].filter((day) => day >= index.today));
}

/** First day of the month, `offset` months after the month of `day`. */
export function monthStart(day: string, offset = 0): { year: number; month: number } {
  const [y, m] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + offset;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/** Sunday-first weeks in Hebrew and Arabic, Monday-first elsewhere (like the other calendars). */
export function weekStartFor(locale: string): 0 | 1 {
  return locale === "he" || locale === "ar" ? 0 : 1;
}
