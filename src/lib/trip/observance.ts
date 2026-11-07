/**
 * Shabbat and Yom Tov on a stay (round 3, brief 7.1; pure, client-safe).
 *
 * The trip page shows candle-lighting and Havdalah times, the nearest verified synagogue, Chabad
 * house and kosher place, and "המארח לא עונה בשבת" ONLY when the stay includes a Friday night or a
 * Jewish holiday. The rule, in calendar days of the stay (Asia/Tbilisi, src/lib/booking/dates.ts):
 *
 *   a stay includes Shabbat or Yom Tov ⇔ one of its NIGHTS (checkIn … checkOut − 1) is the
 *   evening before a day of rest: a Saturday, or a day of Yom Tov on the ISRAELI schedule
 *   (one day of Yom Tov: Rosh Hashana I–II, Yom Kippur, Sukkot I, Shemini Atzeret, Pesach I and
 *   VII, Shavuot).
 *
 * So a Friday night counts; arriving on Saturday afternoon does not (the brief says "Friday night").
 * The same holds for a holiday: the guest must be there on a night of it. Minor holidays, fasts,
 * Chol HaMoed and Chanukah do not count (no candle lighting / Havdalah of their own).
 *
 * The times come from @hebcal/core (src/lib/hebcal, called by ./server.ts) as a list of candle
 * lightings and Havdalahs; groupObservances() turns them into windows (Friday → Saturday night,
 * or Erev Yom Tov → Havdalah, with Shabbat and Yom Tov next to each other as ONE window), and
 * windowsForStay() keeps the windows that have a night inside the stay. Both rules give the same
 * answer: a window's nights are exactly the nights before its days of rest.
 */
import { addDays, eachNight, weekdayOf } from "@/lib/booking/dates";

/** One candle lighting or Havdalah, as src/lib/hebcal/core.ts timedObservances() gives it. */
export type TimedEvent = {
  kind: "candles" | "havdalah";
  time: Date;
  /** The civil date of the evening it happens on ("YYYY-MM-DD", the place's time zone). */
  date: string;
};

/** A Shabbat or Yom Tov (or both in a row), from the first candle lighting to Havdalah. */
export type ObservanceWindow = {
  /** The evening it begins (the first candle lighting), "YYYY-MM-DD". */
  startDate: string;
  /** The evening it ends (Havdalah), "YYYY-MM-DD". */
  endDate: string;
  /** Every candle lighting inside: the first one, and e.g. the second night of Rosh Hashana. */
  candleLighting: { date: string; time: Date }[];
  /** Null only when the list ended before Havdalah (callers pad the range by a few days). */
  havdalah: { date: string; time: Date } | null;
};

/** How many days around the stay to load, so a window that starts before it is complete. */
export const OBSERVANCE_PADDING_DAYS = 4;

/** True for a Saturday or a day of Yom Tov (from `yomTovDays`, Israeli schedule). */
export function isRestDay(day: string, yomTovDays: ReadonlySet<string>): boolean {
  return weekdayOf(day) === 6 || yomTovDays.has(day);
}

/** The nights of the stay that are the evening before a day of rest (Friday nights, Erev Yom Tov…). */
export function restNights(checkIn: string, checkOut: string, yomTovDays: Iterable<string>): string[] {
  const days = new Set(yomTovDays);
  return eachNight(checkIn, checkOut).filter((night) => isRestDay(addDays(night, 1), days));
}

/** THE rule of brief 7.1: the stay includes a Friday night or a night of a Jewish holiday. */
export function stayIncludesShabbatOrHoliday(checkIn: string, checkOut: string, yomTovDays: Iterable<string>): boolean {
  return restNights(checkIn, checkOut, yomTovDays).length > 0;
}

/** At least one Friday night in the stay (Shabbat alone, whatever the holidays). */
export function stayHasFridayNight(checkIn: string, checkOut: string): boolean {
  return eachNight(checkIn, checkOut).some((night) => weekdayOf(night) === 5);
}

/**
 * Candle lightings and Havdalahs → windows. A candle lighting opens a window (or, inside an open
 * one, is a second night: Rosh Hashana II, Yom Tov right after Shabbat); a Havdalah closes it.
 * A Havdalah with no open window (its start lies before the list) is skipped.
 */
export function groupObservances(events: readonly TimedEvent[]): ObservanceWindow[] {
  const sorted = [...events].sort((a, b) => a.time.getTime() - b.time.getTime());
  const windows: ObservanceWindow[] = [];
  let open: { startDate: string; candles: { date: string; time: Date }[] } | null = null;
  for (const event of sorted) {
    if (event.kind === "candles") {
      open ??= { startDate: event.date, candles: [] };
      open.candles.push({ date: event.date, time: event.time });
      continue;
    }
    if (!open) continue;
    windows.push({
      startDate: open.startDate,
      endDate: event.date,
      candleLighting: open.candles,
      havdalah: { date: event.date, time: event.time },
    });
    open = null;
  }
  if (open) {
    const last = open.candles[open.candles.length - 1];
    windows.push({ startDate: open.startDate, endDate: addDays(last.date, 1), candleLighting: open.candles, havdalah: null });
  }
  return windows;
}

/**
 * The windows with at least one night inside the stay: the window's nights are startDate …
 * endDate − 1, the stay's are checkIn … checkOut − 1.
 */
export function windowsForStay(windows: readonly ObservanceWindow[], checkIn: string, checkOut: string): ObservanceWindow[] {
  return windows.filter((w) => w.startDate < checkOut && w.endDate > checkIn);
}

/** The days of rest inside a window ("YYYY-MM-DD"): the day after each of its nights. */
export function windowDays(window: Pick<ObservanceWindow, "startDate" | "endDate">): string[] {
  return eachNight(window.startDate, window.endDate).map((night) => addDays(night, 1));
}

/**
 * What a window is: Shabbat (it holds a Saturday) and/or the holidays whose Yom Tov days fall in
 * it (`yomTov`: days of Yom Tov with their key, Israeli schedule), each key once, in date order.
 */
export function describeWindow<K extends string>(
  window: Pick<ObservanceWindow, "startDate" | "endDate">,
  yomTov: readonly { date: string; key: K }[],
): { shabbat: boolean; holidays: K[] } {
  const days = windowDays(window);
  const holidays: K[] = [];
  for (const day of days) {
    for (const entry of yomTov) {
      if (entry.date === day && !holidays.includes(entry.key)) holidays.push(entry.key);
    }
  }
  return { shabbat: days.some((day) => weekdayOf(day) === 6), holidays };
}
