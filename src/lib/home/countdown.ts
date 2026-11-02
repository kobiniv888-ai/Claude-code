/**
 * The Shabbat countdown (pure, client-safe): where we are relative to this week's Shabbat and
 * how long until it starts, in at most two units ("2 days and 4 hours", "3 hours and 20 minutes").
 *
 *   shabbatPhase(now, candleLighting, havdalah)
 *     → { phase: "before", parts: [{ unit: "day", count: 2 }, { unit: "hour", count: 4 }] }
 */

export type CountdownUnit = "day" | "hour" | "minute";
export type CountdownPart = { unit: CountdownUnit; count: number };

export type ShabbatPhase =
  | { phase: "before"; parts: CountdownPart[] }
  | { phase: "during" }
  | { phase: "after" }
  | { phase: "unknown" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The two largest non-zero units of a duration (minutes rounded up, so it never reads "0 minutes"). */
export function countdownParts(ms: number): CountdownPart[] {
  const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE));
  const days = Math.floor((totalMinutes * MINUTE) / DAY);
  const hours = Math.floor(((totalMinutes * MINUTE) % DAY) / HOUR);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? [{ unit: "day", count: days }, { unit: "hour", count: hours }] : [{ unit: "day", count: days }];
  if (hours > 0) return minutes > 0 ? [{ unit: "hour", count: hours }, { unit: "minute", count: minutes }] : [{ unit: "hour", count: hours }];
  return [{ unit: "minute", count: minutes }];
}

/** Before candle lighting (with the time left), during Shabbat, or after Havdalah. */
export function shabbatPhase(now: Date, candleLighting: Date | null, havdalah: Date | null): ShabbatPhase {
  if (!candleLighting) return { phase: "unknown" };
  const left = candleLighting.getTime() - now.getTime();
  if (left > 0) return { phase: "before", parts: countdownParts(left) };
  if (!havdalah || now.getTime() < havdalah.getTime()) return { phase: "during" };
  return { phase: "after" };
}
