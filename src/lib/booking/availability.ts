import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AvailabilitySource } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { addDays, dateToDay, dayToDate, tbilisiToday } from "./dates";
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
 * free rooms of each room type.
 */

type Client = Prisma.TransactionClient | typeof db;

/** Enough rows for a busy hotel's year (each booking is one row). */
const BLOCK_LIMIT = 5000;

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
    take: BLOCK_LIMIT,
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
 */
export async function getRoomBlocks(listingId: string, range: { from: string; to: string }, client: Client = db, roomTypeId?: string): Promise<RoomBlock[]> {
  const rows = await client.availabilityBlock.findMany({
    where: {
      listingId,
      startDate: { lt: dayToDate(range.to) },
      endDate: { gt: dayToDate(range.from) },
      ...(roomTypeId ? { OR: [{ roomTypeId: null }, { roomTypeId }] } : {}),
    },
    select: { startDate: true, endDate: true, roomTypeId: true, rooms: true },
    orderBy: { startDate: "asc" },
    take: BLOCK_LIMIT,
  });
  return rows.map((b) => ({ start: dateToDay(b.startDate), end: dateToDay(b.endDate), roomTypeId: b.roomTypeId, rooms: b.rooms }));
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
