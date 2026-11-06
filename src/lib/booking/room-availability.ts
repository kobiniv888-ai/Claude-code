/**
 * Hotel availability by room type (round 3, founder's answer 3; client-safe, pure).
 *
 * A hotel (dealType HOTEL_ROOM) sells rooms, not the whole place: each room type has `quantity`
 * identical rooms ("כמה חדרים כאלה להציע בבית"). On one night:
 *
 *   free rooms of a type = quantity − booked rooms − blocked rooms   (never below 0)
 *
 * where every AvailabilityBlock that covers the night counts:
 * - a block WITH that room type takes `rooms` rooms (a booking: Booking.rooms; the host's own
 *   block: the rooms they closed; an imported iCal event: 1 room). `rooms` null takes them all;
 * - a block WITHOUT a room type closes the whole hotel: every room of every type;
 * - blocks of other room types take nothing from this one.
 * A room type is available for a stay when every night of [checkIn, checkOut) has at least the
 * rooms asked for. One booking never closes the whole hotel.
 *
 * Days are "YYYY-MM-DD" (Georgian calendar days); ranges are half-open [start, end).
 * The server runs the same math on the rows it reads inside the locked booking transaction
 * (src/lib/booking/service.ts); the browser runs it on the free-room segments the page got.
 */
import { addDays, daysBetween, isDay } from "./dates";
import { mergeRanges, type DayRange } from "./overlap";

/** An AvailabilityBlock as the math reads it. roomTypeId null = the whole hotel. */
export type RoomBlock = { start: string; end: string; roomTypeId: string | null; rooms: number | null };

/** A room type's identity and its number of rooms. */
export type RoomCapacity = { id: string; quantity: number };

/** Free rooms of one type on consecutive nights [start, end) (only where fewer than all are free). */
export type FreeSegment = { start: string; end: string; free: number };

/** Longest window the math walks (more than the 400-day booking calendar). */
const MAX_WINDOW_DAYS = 1200;

/** Whole rooms, at least 0 (bad input reads as 0). */
function whole(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** The number of rooms a room type offers (a stored quantity below 1 counts as 1, like the database default). */
export function roomQuantity(room: Pick<RoomCapacity, "quantity">): number {
  return Math.max(1, whole(room.quantity));
}

/** How many rooms of `room` one block takes on a night it covers. */
export function roomsTakenBy(block: Pick<RoomBlock, "roomTypeId" | "rooms">, room: RoomCapacity): number {
  const quantity = roomQuantity(room);
  if (block.roomTypeId === null) return quantity;
  if (block.roomTypeId !== room.id) return 0;
  const rooms = whole(block.rooms);
  return rooms === 0 ? quantity : rooms;
}

/**
 * Rooms taken per night of the window [from, to), as an array (index 0 = `from`): a sweep over
 * the blocks, so a busy hotel with many bookings stays fast.
 */
function takenPerNight(room: RoomCapacity, blocks: readonly RoomBlock[], from: string, to: string): number[] {
  const length = Math.min(MAX_WINDOW_DAYS, Math.max(0, daysBetween(from, to)));
  const diff = new Array<number>(length + 1).fill(0);
  for (const block of blocks) {
    if (!isDay(block.start) || !isDay(block.end) || block.end <= block.start) continue;
    const taken = roomsTakenBy(block, room);
    if (taken === 0) continue;
    const start = Math.max(0, daysBetween(from, block.start));
    const end = Math.min(length, daysBetween(from, block.end));
    if (start >= end) continue;
    diff[start] += taken;
    diff[end] -= taken;
  }
  const taken: number[] = new Array(length);
  let running = 0;
  for (let i = 0; i < length; i++) {
    running += diff[i];
    taken[i] = running;
  }
  return taken;
}

/** Free rooms of `room` on each night of [from, to) (index 0 = `from`). */
export function freeRoomsPerNight(room: RoomCapacity, blocks: readonly RoomBlock[], from: string, to: string): number[] {
  const quantity = roomQuantity(room);
  return takenPerNight(room, blocks, from, to).map((taken) => Math.max(0, quantity - taken));
}

/** Free rooms of `room` on one night. */
export function freeRoomsOnNight(room: RoomCapacity, blocks: readonly RoomBlock[], night: string): number {
  return freeRoomsPerNight(room, blocks, night, addDays(night, 1))[0] ?? 0;
}

/**
 * The rooms of `room` free on EVERY night of the stay [checkIn, checkOut): the most that can be
 * booked together. 0 for an empty or invalid stay.
 */
export function freeRoomsForStay(room: RoomCapacity, blocks: readonly RoomBlock[], checkIn: string, checkOut: string): number {
  if (!isDay(checkIn) || !isDay(checkOut) || checkOut <= checkIn) return 0;
  const free = freeRoomsPerNight(room, blocks, checkIn, checkOut);
  return free.length === 0 ? 0 : Math.min(...free);
}

/** True when `rooms` rooms of the type are free on every night of the stay. */
export function hasFreeRooms(room: RoomCapacity, blocks: readonly RoomBlock[], checkIn: string, checkOut: string, rooms = 1): boolean {
  const wanted = Math.max(1, whole(rooms));
  return freeRoomsForStay(room, blocks, checkIn, checkOut) >= wanted;
}

/**
 * The nights of [from, to) on which fewer than all rooms of `room` are free, as segments of
 * consecutive nights with the same count. What the browser needs to show free rooms for any stay
 * (nights outside every segment have all `quantity` rooms free).
 */
export function freeSegments(room: RoomCapacity, blocks: readonly RoomBlock[], from: string, to: string): FreeSegment[] {
  const quantity = roomQuantity(room);
  const free = freeRoomsPerNight(room, blocks, from, to);
  const segments: FreeSegment[] = [];
  for (let i = 0; i < free.length; i++) {
    if (free[i] >= quantity) continue;
    const day = addDays(from, i);
    const last = segments.at(-1);
    if (last && last.end === day && last.free === free[i]) last.end = addDays(day, 1);
    else segments.push({ start: day, end: addDays(day, 1), free: free[i] });
  }
  return segments;
}

/** Free rooms for a stay from a room type's quantity and its free segments (the browser's side). */
export function freeFromSegments(quantity: number, segments: readonly FreeSegment[], checkIn: string, checkOut: string): number {
  if (!isDay(checkIn) || !isDay(checkOut) || checkOut <= checkIn) return 0;
  let free = Math.max(1, whole(quantity));
  for (const segment of segments) {
    if (segment.start < checkOut && segment.end > checkIn) free = Math.min(free, Math.max(0, whole(segment.free)));
  }
  return free;
}

/** Nights [start, end) on which a room type has no free room (an iCal export of that type). */
export function fullRanges(room: RoomCapacity, blocks: readonly RoomBlock[], from: string, to: string): DayRange[] {
  return mergeRanges(freeSegments(room, blocks, from, to).filter((s) => s.free === 0).map(({ start, end }) => ({ start, end })));
}

/**
 * Nights of [from, to) on which more rooms of `room` are taken than it has (an imported booking
 * from another site on a night Bayit had already sold out): a double booking for the host to sort out.
 */
export function overbookedRanges(room: RoomCapacity, blocks: readonly RoomBlock[], from: string, to: string): DayRange[] {
  const quantity = roomQuantity(room);
  const taken = takenPerNight(room, blocks, from, to);
  const ranges: DayRange[] = [];
  for (let i = 0; i < taken.length; i++) {
    if (taken[i] <= quantity) continue;
    const day = addDays(from, i);
    const last = ranges.at(-1);
    if (last && last.end === day) last.end = addDays(day, 1);
    else ranges.push({ start: day, end: addDays(day, 1) });
  }
  return ranges;
}

/**
 * Nights of [from, to) on which the hotel has no free room at all: closed as a whole (a block
 * without a room type) or every room type full. With no room types, every block closes the place
 * (the rule of a listing booked as a whole).
 */
export function hotelClosedRanges(rooms: readonly RoomCapacity[], blocks: readonly RoomBlock[], from: string, to: string): DayRange[] {
  const ranges = (list: readonly DayRange[]) => mergeRanges(list).map((r) => ({ start: r.start < from ? from : r.start, end: r.end > to ? to : r.end })).filter((r) => r.start < r.end);
  if (rooms.length === 0) return ranges(blocks);
  const length = Math.min(MAX_WINDOW_DAYS, Math.max(0, daysBetween(from, to)));
  const open = new Array<boolean>(length).fill(false);
  for (const room of rooms) {
    const free = freeRoomsPerNight(room, blocks, from, to);
    for (let i = 0; i < length; i++) if (free[i] > 0) open[i] = true;
  }
  const closed: DayRange[] = [];
  for (let i = 0; i < length; i++) {
    if (open[i]) continue;
    const day = addDays(from, i);
    const last = closed.at(-1);
    if (last && last.end === day) last.end = addDays(day, 1);
    else closed.push({ start: day, end: addDays(day, 1) });
  }
  return closed;
}
