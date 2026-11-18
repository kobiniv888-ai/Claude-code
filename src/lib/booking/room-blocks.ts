/**
 * The host's own blocked rooms of one hotel room type (round 3, founder's answer 3; client-safe,
 * pure). Like the listing calendar, the host's ranges are INCLUSIVE days ("2026-11-10" →
 * "2026-11-12" = 3 nights); each carries how many rooms of the type are closed on those nights.
 * The database stores them as AvailabilityBlock rows (source OWNER, roomTypeId, rooms, exclusive end).
 */
import { addDays, isDay } from "./dates";

/** Inclusive days with the number of rooms the host closed on each of them. */
export type RoomBlockRange = { start: string; end: string; rooms: number };

const MAX_DAYS = 3000;

/** Day → rooms closed by the host (overlapping ranges add up). */
export function roomRangesToDays(ranges: readonly RoomBlockRange[]): Map<string, number> {
  const days = new Map<string, number>();
  let n = 0;
  for (const range of ranges) {
    if (!isDay(range.start) || !isDay(range.end) || range.start > range.end) continue;
    const rooms = Number.isInteger(range.rooms) && range.rooms > 0 ? range.rooms : 0;
    if (rooms === 0) continue;
    for (let day = range.start; day <= range.end && n < MAX_DAYS; day = addDays(day, 1), n++) days.set(day, (days.get(day) ?? 0) + rooms);
  }
  return days;
}

/** Consecutive days with the same number of rooms → inclusive ranges, sorted. */
export function daysToRoomRanges(days: ReadonlyMap<string, number>): RoomBlockRange[] {
  const sorted = [...days.entries()].filter(([day, rooms]) => isDay(day) && rooms > 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const ranges: RoomBlockRange[] = [];
  for (const [day, rooms] of sorted) {
    const last = ranges.at(-1);
    if (last && last.rooms === rooms && addDays(last.end, 1) === day) last.end = day;
    else ranges.push({ start: day, end: day, rooms });
  }
  return ranges;
}

/**
 * The ranges as the server stores them: from today to about two years ahead, at most `quantity`
 * rooms a night (overlaps add up, then are capped), joined where the count stays the same.
 */
export function normalizeRoomRanges(ranges: readonly RoomBlockRange[], today: string, quantity: number, maxDays = 2 * 366): RoomBlockRange[] {
  const max = addDays(today, maxDays);
  const cap = Math.max(1, Math.floor(quantity));
  const days = roomRangesToDays(ranges.map((r) => ({ ...r, start: r.start < today ? today : r.start, end: r.end > max ? max : r.end })));
  for (const [day, rooms] of days) days.set(day, Math.min(cap, rooms));
  return daysToRoomRanges(days);
}

/**
 * The host's blocks after closing `rooms` more rooms on the selected days (never more than are
 * free on a day: `free(day)`), or opening every room they closed on them ("free"). Past days
 * never change.
 */
export function applyRoomSelection(
  owner: readonly RoomBlockRange[],
  days: readonly string[],
  action: { kind: "block"; rooms: number } | { kind: "free" },
  free: (day: string) => number,
  today: string,
): RoomBlockRange[] {
  const next = roomRangesToDays(owner);
  for (const day of days) {
    if (day < today) continue;
    if (action.kind === "free") next.delete(day);
    else {
      const add = Math.min(Math.max(0, Math.floor(action.rooms)), Math.max(0, free(day)));
      if (add > 0) next.set(day, (next.get(day) ?? 0) + add);
    }
  }
  for (const day of next.keys()) if (day < today) next.delete(day);
  return daysToRoomRanges(next);
}
