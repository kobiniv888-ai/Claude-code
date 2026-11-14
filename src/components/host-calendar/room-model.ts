/**
 * The hotel calendar's day logic for one room type (round 3, founder's answer 3; pure,
 * client-safe). Per night: rooms booked on Bayit, rooms taken by other sites' calendars (one per
 * imported event), rooms the host closed, whether the whole hotel is closed, and what is left:
 *
 *   free = quantity − booked − imported − closed by the host   (0 when the whole hotel is closed)
 *
 * Days are "YYYY-MM-DD" in Georgia. Booked, imported and whole-hotel ranges keep the database's
 * exclusive end; the host's own ranges are inclusive (src/lib/booking/room-blocks.ts).
 */
import { addDays } from "@/lib/booking/dates";
import { roomRangesToDays, type RoomBlockRange } from "@/lib/booking/room-blocks";
import type { HotelNight } from "./model";

export type RoomBooked = { start: string; end: string; code: string; rooms: number };
export type RoomImported = { start: string; end: string; source: string };

export type RoomDay = {
  booked: number;
  imported: number;
  /** Closed by the host (this room type). */
  blocked: number;
  /** The whole hotel is closed this night (a block without a room type). */
  closed: boolean;
  free: number;
  /** Bayit bookings holding rooms this night. */
  codes: string[];
  past: boolean;
};

export type RoomCalendarIndex = { quantity: number; today: string; day: (day: string) => RoomDay };

const MAX_NIGHTS = 3000;

function eachNight(range: { start: string; end: string }, visit: (day: string) => void) {
  let n = 0;
  for (let day = range.start; day < range.end && n < MAX_NIGHTS; day = addDays(day, 1), n++) visit(day);
}

export function indexRoomCalendar(input: {
  today: string;
  quantity: number;
  owner: readonly RoomBlockRange[];
  booked: readonly RoomBooked[];
  imported: readonly RoomImported[];
  closed: readonly { start: string; end: string }[];
}): RoomCalendarIndex {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const booked = new Map<string, number>();
  const codes = new Map<string, string[]>();
  for (const range of input.booked) {
    eachNight(range, (day) => {
      booked.set(day, (booked.get(day) ?? 0) + Math.max(1, range.rooms));
      codes.set(day, [...(codes.get(day) ?? []), range.code]);
    });
  }
  const imported = new Map<string, number>();
  for (const range of input.imported) eachNight(range, (day) => imported.set(day, (imported.get(day) ?? 0) + 1));
  const closed = new Set<string>();
  for (const range of input.closed) eachNight(range, (day) => closed.add(day));
  const owner = roomRangesToDays(input.owner);
  return {
    quantity,
    today: input.today,
    day: (day) => {
      const b = booked.get(day) ?? 0;
      const i = imported.get(day) ?? 0;
      const o = owner.get(day) ?? 0;
      const c = closed.has(day);
      return { booked: b, imported: i, blocked: o, closed: c, free: c ? 0 : Math.max(0, quantity - b - i - o), codes: codes.get(day) ?? [], past: day < input.today };
    },
  };
}

/** What a day of the selection allows: the fewest free rooms (to close more) and whether the host closed any. */
export function roomSelectionSummary(days: readonly string[], index: RoomCalendarIndex): { minFree: number; blocked: number; codes: string[] } {
  const future = days.filter((day) => day >= index.today);
  if (future.length === 0) return { minFree: 0, blocked: 0, codes: [] };
  let minFree = Number.POSITIVE_INFINITY;
  let blocked = 0;
  const codes = new Set<string>();
  for (const day of future) {
    const state = index.day(day);
    minFree = Math.min(minFree, state.free);
    blocked += state.blocked;
    for (const code of state.codes) codes.add(code);
  }
  for (const day of days) for (const code of index.day(day).codes) codes.add(code);
  return { minFree: Number.isFinite(minFree) ? minFree : 0, blocked, codes: [...codes] };
}

/** A hotel room type's calendar data, as indexHotelNights reads it. */
export type HotelRoomInput = {
  quantity: number;
  /** Switched off: not offered to guests, so it does not count in the hotel's rooms. */
  active: boolean;
  owner: readonly RoomBlockRange[];
  booked: readonly RoomBooked[];
  imported: readonly RoomImported[];
};

/**
 * The whole hotel per night (round 3): the free rooms of all offered room types, the rooms booked on
 * Bayit and their booking codes. The whole-hotel calendar shows "full" when nothing is free, and
 * which bookings a night holds. null when the hotel offers no room type (nothing to count).
 */
export function indexHotelNights(
  rooms: readonly HotelRoomInput[],
  closed: readonly { start: string; end: string }[],
  today: string,
): (day: string) => HotelNight | null {
  const offered = rooms.filter((room) => room.active);
  const indexes = offered.map((room) =>
    indexRoomCalendar({ today, quantity: room.quantity, owner: room.owner, booked: room.booked, imported: room.imported, closed }),
  );
  // Bookings of switched-off room types still hold their rooms: list them, never count them as free.
  const offIndexes = rooms
    .filter((room) => !room.active)
    .map((room) => indexRoomCalendar({ today, quantity: room.quantity, owner: [], booked: room.booked, imported: [], closed: [] }));
  const total = indexes.reduce((sum, index) => sum + index.quantity, 0);
  return (day) => {
    if (total === 0 && offIndexes.length === 0) return null;
    let free = 0;
    let booked = 0;
    const codes = new Set<string>();
    for (const index of indexes) {
      const state = index.day(day);
      free += state.free;
      booked += state.booked;
      for (const code of state.codes) codes.add(code);
    }
    for (const index of offIndexes) {
      const state = index.day(day);
      booked += state.booked;
      for (const code of state.codes) codes.add(code);
    }
    return { free, total, booked, codes: [...codes] };
  };
}
