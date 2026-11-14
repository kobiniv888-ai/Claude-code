/**
 * The host calendar's day logic (pure, client-safe). Days are "YYYY-MM-DD" in Georgia time.
 * The host's own blocks are inclusive ranges (like the wizard calendar); booked and imported
 * ranges keep the database's exclusive end (the check-out day is free again).
 */
import type { HolidayKey } from "@/lib/hebcal/keys";
import { addDays, daysToRanges, rangesToDays } from "@/lib/wizard/availability";
import type { DayRange } from "@/lib/wizard/types";

/** A booked or imported range: `end` is exclusive. */
export type BusyRange = { start: string; end: string };
export type BookedRange = BusyRange & { code: string };
export type ImportedRange = BusyRange & { source: string };

/**
 * `hotelFull` / `hotelSome`: the whole-hotel calendar of a hotel (round 3), on a night it did not
 * close itself: every room of every offered room type is taken, or some rooms are booked on Bayit.
 * Both can still be blocked (that closes the rest of the hotel; it never cancels a booking).
 */
export type DayKind = "past" | "free" | "blocked" | "booked" | "imported" | "hotelFull" | "hotelSome";

/** A hotel night over all its offered room types (./room-model indexHotelNights). */
export type HotelNight = { free: number; total: number; booked: number; codes: string[] };

export type CalendarIndex = {
  today: string;
  owner: Set<string>;
  /** Day → booking code. */
  booked: Map<string, string>;
  /** Day → calendar host name ("airbnb.com"). */
  imported: Map<string, string>;
  /** Hotels: the rooms of the night (whole-hotel calendar only). */
  hotel?: (day: string) => HotelNight | null;
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
  hotel?: (day: string) => HotelNight | null;
}): CalendarIndex {
  const booked = new Map<string, string>();
  for (const range of input.booked) eachNight(range, (day) => booked.set(day, range.code));
  const imported = new Map<string, string>();
  for (const range of input.imported) eachNight(range, (day) => imported.set(day, range.source));
  return { today: input.today, owner: rangesToDays(input.owner), booked, imported, ...(input.hotel ? { hotel: input.hotel } : {}) };
}

/**
 * What a day shows. A booking wins over everything; imported nights over the host's own blocks.
 * A hotel's open night shows its rooms: full, some booked on Bayit, or free.
 */
export function dayKind(day: string, index: CalendarIndex): DayKind {
  if (index.booked.has(day)) return "booked";
  if (day < index.today) return "past";
  if (index.imported.has(day)) return "imported";
  if (index.owner.has(day)) return "blocked";
  const night = index.hotel?.(day);
  if (night && night.total > 0 && night.free === 0) return "hotelFull";
  if (night && night.booked > 0) return "hotelSome";
  return "free";
}

/** Open nights the host can block: free, or a hotel night with rooms taken (blocking closes the rest). */
export function isBlockable(kind: DayKind): boolean {
  return kind === "free" || kind === "hotelFull" || kind === "hotelSome";
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
    if (isBlockable(kind)) free++;
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
    if (action === "block" && isBlockable(kind)) next.add(day);
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

// ─── Holiday prices and Jewish holidays (round 3, brief 6.3) ─────

/** One day of a Jewish holiday on the calendar ("פסח (יום ב׳)", "ערב פסח"). */
export type CalendarHoliday = { date: string; key: HolidayKey; name: string };

/** A holiday from its first marked day to its last (inclusive): "פסח", 1–8 April. */
export type HolidayPeriod = { key: HolidayKey; name: string; start: string; last: string };

/**
 * Holidays when Israelis travel most (school and work holidays, family trips): the major ones with
 * their eves and Chol HaMoed, Chanukah and Purim. Fasts and memorial days are not travel peaks.
 */
const PEAK_HOLIDAYS: ReadonlySet<HolidayKey> = new Set<HolidayKey>([
  "rosh-hashana",
  "yom-kippur",
  "sukkot",
  "shemini-atzeret",
  "simchat-torah",
  "chanukah",
  "purim",
  "pesach",
  "shavuot",
]);

export function isPeakHoliday(key: HolidayKey): boolean {
  return PEAK_HOLIDAYS.has(key);
}

/** Holidays that run on from another one count as its period (Shemini Atzeret ends Sukkot). */
const PERIOD_OF: Partial<Record<HolidayKey, HolidayKey>> = { "shemini-atzeret": "sukkot", "simchat-torah": "sukkot" };

/**
 * Days of the same holiday that follow each other become one period, named after the holiday
 * ("סוכות" from its eve to Simchat Torah), in date order.
 */
export function groupHolidayPeriods(days: readonly CalendarHoliday[], nameOf: (key: HolidayKey) => string): HolidayPeriod[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const periods: HolidayPeriod[] = [];
  for (const day of sorted) {
    const key = PERIOD_OF[day.key] ?? day.key;
    let open: HolidayPeriod | undefined;
    for (let i = periods.length - 1; i >= 0 && !open; i--) if (periods[i].key === key) open = periods[i];
    if (open && (open.last === day.date || addDays(open.last, 1) === day.date)) {
      open.last = day.date;
      continue;
    }
    periods.push({ key, name: nameOf(key), start: day.date, last: day.date });
  }
  return periods.sort((a, b) => a.start.localeCompare(b.start));
}

/** Day → the holiday names on it ("ערב פסח", "שבועות"). */
export function indexHolidays(days: readonly CalendarHoliday[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const day of days) map.set(day.date, map.has(day.date) ? `${map.get(day.date)} · ${day.name}` : day.name);
  return map;
}

/** A holiday price as the calendar marks it (`end` exclusive). */
export type PricedRange = { id: string; start: string; end: string; price: number; roomTypeId: string | null };

/** Night → the listing-wide holiday price on it (a room type's own prices are not marked here). */
export function indexDatePrices<T extends PricedRange>(list: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const price of list) {
    if (price.roomTypeId !== null) continue;
    eachNight(price, (day) => {
      if (!map.has(day)) map.set(day, price);
    });
  }
  return map;
}

/**
 * Night → the holiday price one hotel room type gets (round 3): its own price first, then a price
 * for every room (`listingWide`: only when the room type uses the listing's currency, as in the
 * quote: src/lib/booking/terms.ts datePricesFor). Another room type's prices are ignored.
 */
export function indexRoomDatePrices<T extends PricedRange>(list: readonly T[], roomTypeId: string, options: { listingWide?: boolean } = {}): Map<string, T> {
  const map = new Map<string, T>();
  for (const price of list) {
    if (price.roomTypeId !== roomTypeId) continue;
    eachNight(price, (day) => {
      if (!map.has(day)) map.set(day, price);
    });
  }
  if (options.listingWide !== false) {
    for (const [day, price] of indexDatePrices(list)) if (!map.has(day)) map.set(day, price);
  }
  return map;
}

/** The holiday periods that have a day in [from, to] and are not over before `today`. */
export function periodsBetween(periods: readonly HolidayPeriod[], from: string, to: string, today: string): HolidayPeriod[] {
  return periods.filter((p) => p.last >= today && p.last >= from && p.start <= to);
}

/** A selection's nights for a holiday price: from today on (past days are never selected). */
export function selectionNights(days: readonly string[], today: string): { start: string; last: string; nights: number } | null {
  const future = days.filter((day) => day >= today);
  if (future.length === 0) return null;
  return { start: future[0], last: future[future.length - 1], nights: future.length };
}
