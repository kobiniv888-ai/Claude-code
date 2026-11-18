/**
 * When the weekly host stats email goes out (round 3, brief 6.2; founder's answer 10: Sunday
 * 09:00 Israel time) and which week it covers. Pure: "is it Shabbat or Yom Tov" is passed in
 * (src/lib/alerts/weekly-host-stats.ts uses @/lib/hebcal with Jerusalem's times, like the
 * founder's daily summary).
 *
 *   - The cron calls the route every hour on Sunday to Tuesday mornings (vercel.json); it sends
 *     between 09:00 and WEEKLY_LAST_HOUR:59 Israel time on the week's due day only, and at most
 *     once per host per week (each host is claimed first).
 *   - The due day is Sunday. When Sunday is Yom Tov (09:00 falls inside it), the email moves to
 *     the next day that isn't, at most MAX_DELAY_DAYS days later (conservative: never on a rest
 *     day, never twice).
 *   - The week covered is the 7 Georgian days Sunday to Saturday before the week's Sunday (stats
 *     days are Georgian days), even when the email goes out on Monday.
 */
import { addDays, zonedClock, zonedDayStart } from "./summary-schedule";

export const WEEKLY_TIME_ZONE = "Asia/Jerusalem";
export const WEEKLY_HOUR = 9;
/** The last hour (Israel time) at which a late run may still send that day. */
export const WEEKLY_LAST_HOUR = 11;
/** A Yom Tov Sunday moves the email to Monday (or Tuesday after a two-day Yom Tov). */
export const MAX_DELAY_DAYS = 2;

/** 0 = Sunday … 6 = Saturday of a "YYYY-MM-DD" day. */
function weekday(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

/** The Sunday on or before `day`: the week's key. */
export function weekSunday(day: string): string {
  return addDays(day, -weekday(day));
}

/** 09:00 of a calendar day in Israel. */
export function weeklyMoment(day: string): Date {
  return new Date(zonedDayStart(day, WEEKLY_TIME_ZONE).getTime() + WEEKLY_HOUR * 3600 * 1000);
}

/** The day this week's email is due: Sunday, or the next day whose 09:00 isn't Shabbat or Yom Tov. */
export function weeklyDueDay(week: string, isRestTime: (at: Date) => boolean): string | null {
  for (let i = 0; i <= MAX_DELAY_DAYS; i++) {
    const day = addDays(week, i);
    if (!isRestTime(weeklyMoment(day))) return day;
  }
  return null;
}

/** The Georgian days the email covers: the Sunday to Saturday before the week's Sunday. */
export function weeklyPeriod(week: string): { fromDay: string; toDay: string } {
  return { fromDay: addDays(week, -7), toDay: addDays(week, -1) };
}

export type WeeklyDecision =
  | { send: true; week: string; day: string; fromDay: string; toDay: string }
  | { send: false; week: string; day: string; reason: "not_due_day" | "too_early" | "too_late" | "rest_day" };

/** Should the weekly emails go out now (before each host's once-a-week claim)? */
export function weeklyDue(now: Date, isRestTime: (at: Date) => boolean): WeeklyDecision {
  const { day, hour } = zonedClock(now, WEEKLY_TIME_ZONE);
  const week = weekSunday(day);
  const due = weeklyDueDay(week, isRestTime);
  if (due !== day) return { send: false, week, day, reason: "not_due_day" };
  if (hour < WEEKLY_HOUR) return { send: false, week, day, reason: "too_early" };
  if (hour > WEEKLY_LAST_HOUR) return { send: false, week, day, reason: "too_late" };
  if (isRestTime(now)) return { send: false, week, day, reason: "rest_day" };
  return { send: true, week, day, ...weeklyPeriod(week) };
}
