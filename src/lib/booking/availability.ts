import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { AvailabilitySource } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addDays, dateToDay, dayToDate, isDay, tbilisiToday } from "./dates";
import { clipRanges, type DayRange } from "./overlap";
import { freeRoomsForStay, freeSegments, hotelClosedRanges, roomQuantity, type FreeSegment, type RoomBlock, type RoomCapacity } from "./room-availability";

/**
 * A listing's unavailable nights, from every source: the host's own blocks (OWNER), imported
 * calendars (ICAL) and bookings made on Bayit (BOOKING). AvailabilityBlock.endDate is exclusive.
 *
 * Hotels (round 3, founder's answer 3) count rooms per room type instead (./room-availability):
 * a block with a room type takes some rooms of that type, a block without one closes the whole
 * hotel. getRoomBlocks / freeRoomsOfType read the rows for that math (also inside the locked
 * booking transaction), getHotelAvailability gives the guest calendar its closed nights and the
 * free rooms of each room type. The room counts are added up in the database (getRoomBlocks), so
 * they stay right however many blocks a hotel has.
 */

type Client = Prisma.TransactionClient | typeof db;

/** The host's calendar page lists blocks one by one (display only: the booking check never reads it). */
const CALENDAR_BLOCK_LIMIT = 5000;

export type DateWindow = { from?: string; to?: string };

function window({ from, to }: DateWindow = {}): { from: string; to: string } {
  const start = from ?? tbilisiToday();
  return { from: start, to: to ?? addDays(start, 400) };
}

/** Merged unavailable ranges [start, end) inside the window (default: today + 400 days). */
export async function getUnavailableDates(listingId: string, range?: DateWindow, client: Client = db): Promise<DayRange[]> {
  const { from, to } = window(range);
  const blocks = await client.availabilityBlock.findMany({
    where: { listingId, startDate: { lt: dayToDate(to) }, endDate: { gt: dayToDate(from) } },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
    take: 2000,
  });
  return clipRanges(
    blocks.map((b) => ({ start: dateToDay(b.startDate), end: dateToDay(b.endDate) })),
    from,
    to,
  );
}

export type CalendarBlock = DayRange & {
  id: string;
  source: AvailabilitySource;
  /** Source BOOKING: the booking's code (link it for the host). */
  bookingCode: string | null;
  /** Source ICAL: the calendar's host name ("airbnb.com"). */
  note: string | null;
  /** Hotels: the room type these nights are for (null = the whole listing / hotel). */
  roomTypeId: string | null;
  /** With roomTypeId: rooms taken (null = every room of the type). */
  rooms: number | null;
};

/** Every block with its source, for the host's calendar page ("see bookings"). */
export async function getCalendarBlocks(listingId: string, range?: DateWindow): Promise<CalendarBlock[]> {
  const { from, to } = window(range);
  const blocks = await db.availabilityBlock.findMany({
    where: { listingId, startDate: { lt: dayToDate(to) }, endDate: { gt: dayToDate(from) } },
    select: { id: true, startDate: true, endDate: true, source: true, note: true, roomTypeId: true, rooms: true, booking: { select: { code: true } } },
    orderBy: { startDate: "asc" },
    take: CALENDAR_BLOCK_LIMIT,
  });
  return blocks.map((b) => ({
    id: b.id,
    start: dateToDay(b.startDate),
    end: dateToDay(b.endDate),
    source: b.source,
    bookingCode: b.booking?.code ?? null,
    note: b.source === "ICAL" ? b.note : null,
    roomTypeId: b.roomTypeId,
    rooms: b.roomTypeId ? b.rooms : null,
  }));
}

/**
 * The blocks room-type math needs for [from, to): every block of the listing, or, with
 * `roomTypeId`, the ones of that room type and the whole-hotel ones (roomTypeId null).
 *
 * Correct for any number of rows (SECURITY_REPORT 4.5.b): the database adds the blocks up itself
 * and returns only where the totals change, so the answer is at most two rows per room type and
 * night of the window, however many bookings, holds and imported events there are (it used to
 * read at most 5000 rows, and a busy hotel's extra rows were silently left out: the booking check
 * then saw free rooms that were taken). Each run of nights with the same totals comes back as a
 * few equivalent blocks, clipped to the window:
 *
 *   - the rooms the blocks of a room type take: one block with that sum (`rooms`);
 *   - blocks that take every room (a whole-hotel block, or a room-type block without a count):
 *     one block, or two when several overlap (2 × quantity is already "more than the room type
 *     has", which is all the math can tell apart: free rooms stop at 0, overbooked starts above
 *     the quantity).
 *
 * The room math (./room-availability) gives exactly the same free rooms, full nights, closed
 * nights and overbooked nights for these blocks as for the original rows. Blocks whose end is not
 * after their start take no night, as before.
 */
export async function getRoomBlocks(listingId: string, range: { from: string; to: string }, client: Client = db, roomTypeId?: string): Promise<RoomBlock[]> {
  if (!isDay(range.from) || !isDay(range.to) || !(range.from < range.to)) return [];
  const typeFilter = roomTypeId ? Prisma.sql`AND ("roomTypeId" IS NULL OR "roomTypeId" = ${roomTypeId})` : Prisma.empty;
  const rows = await client.$queryRaw<{ roomTypeId: string | null; day: string; full: bigint | number; rooms: bigint | number }[]>`
    WITH b AS (
      SELECT "roomTypeId",
             GREATEST("startDate", ${range.from}::date) AS s,
             LEAST("endDate", ${range.to}::date) AS e,
             CASE WHEN "roomTypeId" IS NULL OR "rooms" IS NULL OR "rooms" <= 0 THEN 1 ELSE 0 END AS takes_all,
             CASE WHEN "roomTypeId" IS NOT NULL AND "rooms" > 0 THEN "rooms" ELSE 0 END AS taken
      FROM "AvailabilityBlock"
      WHERE "listingId" = ${listingId}
        AND "startDate" < ${range.to}::date
        AND "endDate" > ${range.from}::date
        AND "endDate" > "startDate"
        ${typeFilter}
    )
    SELECT "roomTypeId", to_char(day, 'YYYY-MM-DD') AS day, SUM(d_all)::bigint AS full, SUM(d_taken)::bigint AS rooms
    FROM (
      SELECT "roomTypeId", s AS day, takes_all AS d_all, taken AS d_taken FROM b
      UNION ALL
      SELECT "roomTypeId", e AS day, -takes_all, -taken FROM b
    ) changes
    GROUP BY "roomTypeId", day
    ORDER BY "roomTypeId" NULLS FIRST, day`;
  return blocksFromChanges(rows.map((r) => ({ roomTypeId: r.roomTypeId, day: r.day, full: Number(r.full), rooms: Number(r.rooms) })));
}

/**
 * Turns the per-day changes of getRoomBlocks (sorted by room type, then day) back into blocks:
 * for each run of nights with the same totals, one block with the rooms taken and up to two
 * blocks that take every room (pure; exported for the unit test).
 */
export function blocksFromChanges(changes: readonly { roomTypeId: string | null; day: string; full: number; rooms: number }[]): RoomBlock[] {
  const blocks: RoomBlock[] = [];
  let i = 0;
  while (i < changes.length) {
    const type = changes[i].roomTypeId;
    let full = 0;
    let rooms = 0;
    for (; i < changes.length && changes[i].roomTypeId === type; i++) {
      full += changes[i].full;
      rooms += changes[i].rooms;
      const next = changes[i + 1];
      if (!next || next.roomTypeId !== type || next.day <= changes[i].day) continue;
      const start = changes[i].day;
      const end = next.day;
      for (let copy = 0; copy < Math.min(2, full); copy++) blocks.push({ start, end, roomTypeId: type, rooms: null });
      if (type !== null && rooms > 0) blocks.push({ start, end, roomTypeId: type, rooms });
    }
  }
  return blocks;
}

/**
 * Rooms of one type free on every night of [checkIn, checkOut). Pass the transaction client from
 * createBooking: it runs after the room type's row is locked, so the count is the one the booking
 * is checked against.
 */
export async function freeRoomsOfType(listingId: string, room: RoomCapacity, checkIn: string, checkOut: string, client: Client = db): Promise<number> {
  if (!(checkIn < checkOut)) return 0;
  const blocks = await getRoomBlocks(listingId, { from: checkIn, to: checkOut }, client, room.id);
  return freeRoomsForStay(room, blocks, checkIn, checkOut);
}

/** A hotel's calendar for guests: closed nights, and each room type's free rooms where fewer than all are free. */
export type HotelAvailability = {
  /** Nights with no free room at all (merged, end exclusive): the calendar disables them. */
  closed: DayRange[];
  /** Per room type: its number of rooms and the nights with fewer free (see freeSegments). */
  rooms: Record<string, { quantity: number; segments: FreeSegment[] }>;
};

/** The guest calendar of a hotel with these (active, bookable) room types, inside the window. */
export async function getHotelAvailability(listingId: string, rooms: readonly RoomCapacity[], range?: DateWindow, client: Client = db): Promise<HotelAvailability> {
  const { from, to } = window(range);
  const blocks = await getRoomBlocks(listingId, { from, to }, client);
  return hotelAvailabilityFrom(rooms, blocks, from, to);
}

/** The same from rows already read (pure). */
export function hotelAvailabilityFrom(rooms: readonly RoomCapacity[], blocks: readonly RoomBlock[], from: string, to: string): HotelAvailability {
  return {
    closed: hotelClosedRanges(rooms, blocks, from, to),
    rooms: Object.fromEntries(rooms.map((room) => [room.id, { quantity: roomQuantity(room), segments: freeSegments(room, blocks, from, to) }])),
  };
}

/** The first block sharing a night with [checkIn, checkOut), or null when every night is free. */
export async function findBlockingRange(
  listingId: string,
  checkIn: string,
  checkOut: string,
  client: Client = db,
): Promise<{ id: string; source: AvailabilitySource } | null> {
  return client.availabilityBlock.findFirst({
    where: { listingId, startDate: { lt: dayToDate(checkOut) }, endDate: { gt: dayToDate(checkIn) } },
    select: { id: true, source: true },
  });
}

export async function isRangeFree(listingId: string, checkIn: string, checkOut: string, client: Client = db): Promise<boolean> {
  return checkIn < checkOut && (await findBlockingRange(listingId, checkIn, checkOut, client)) === null;
}
