/**
 * When the founder's daily summary goes out (round 3, founder's answer 10: 08:00 Israel time,
 * not on Shabbat), and which days it covers. Pure: the "is it Shabbat or Yom Tov" check is
 * passed in (src/lib/alerts/daily-summary.ts uses @/lib/hebcal with Jerusalem's times).
 *
 *   - The cron calls the route a few times a morning (vercel.json); it sends at most ONCE per
 *     Israel calendar day, from 08:00 on, and never while Shabbat or Yom Tov is on in Israel.
 *   - A summary covers every full day since the previous one: normally yesterday; on Sunday,
 *     Friday and Shabbat; after a Yom Tov, the days it skipped (at most MAX_PERIOD_DAYS).
 */

export const SUMMARY_TIME_ZONE = "Asia/Jerusalem";
export const SUMMARY_HOUR = 8;
export const MAX_PERIOD_DAYS = 7;

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar day ("YYYY-MM-DD") and hour (0–23) of an instant in a time zone (computation only, not display). */
export function zonedClock(at: Date, timeZone: string = SUMMARY_TIME_ZONE): { day: string; hour: number; minute: number } {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US-u-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24, minute: Number(parts.minute) };
}

/** "YYYY-MM-DD" plus `days`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The instant a calendar day starts (00:00) in a time zone, DST included. */
export function zonedDayStart(day: string, timeZone: string = SUMMARY_TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  let guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two passes settle any offset (Israel is UTC+2 or UTC+3).
  for (let i = 0; i < 2; i++) {
    const local = zonedClock(new Date(guess), timeZone);
    const [ly, lm, ld] = local.day.split("-").map(Number);
    const localAsUtc = Date.UTC(ly, lm - 1, ld, local.hour, local.minute);
    guess -= localAsUtc - Date.UTC(y, m - 1, d, 0, 0);
  }
  return new Date(guess);
}

/** 08:00 of a calendar day in Israel (the moment the summary is due). */
export function summaryMoment(day: string, timeZone: string = SUMMARY_TIME_ZONE): Date {
  return new Date(zonedDayStart(day, timeZone).getTime() + SUMMARY_HOUR * 3600 * 1000);
}

export type SummaryDecision = { send: true; day: string } | { send: false; day: string; reason: "too_early" | "rest_day" };

/** Should a summary go out now (before the once-a-day claim)? */
export function summaryDue(now: Date, isRestTime: (at: Date) => boolean): SummaryDecision {
  const { day, hour } = zonedClock(now);
  if (hour < SUMMARY_HOUR) return { send: false, day, reason: "too_early" };
  if (isRestTime(now)) return { send: false, day, reason: "rest_day" };
  return { send: true, day };
}

/**
 * The days a summary sent on `today` covers: from the day of the previous summary (a day whose
 * 08:00 was not Shabbat / Yom Tov) up to yesterday, both included.
 */
export function summaryPeriod(today: string, isRestTime: (at: Date) => boolean): { fromDay: string; toDay: string; from: Date; to: Date } {
  const toDay = addDays(today, -1);
  let fromDay = toDay;
  // Walk back over the mornings that had no summary (Shabbat, Yom Tov).
  for (let i = 0; i < MAX_PERIOD_DAYS - 1 && isRestTime(summaryMoment(fromDay)); i++) fromDay = addDays(fromDay, -1);
  return { fromDay, toDay, from: zonedDayStart(fromDay), to: zonedDayStart(today) };
}
