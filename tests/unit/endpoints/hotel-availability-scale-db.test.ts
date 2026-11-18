/**
 * SECURITY_REPORT 4.5.b against the local database: a hotel's free rooms are right however many
 * blocks it has. The room counts used to be read from at most 5000 rows, so a busy hotel's later
 * rows were silently left out and the booking check saw a free room that was taken. The database
 * now adds the blocks up itself (src/lib/booking/availability.ts getRoomBlocks).
 *
 * Also checks, on random blocks, that the added-up blocks give exactly the same free rooms, full,
 * closed and overbooked nights as the raw rows. Creates its own user, city, listings and blocks
 * (fake @example.com address) and removes them afterwards.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { blocksFromChanges, freeRoomsOfType, getHotelAvailability, getRoomBlocks } = await import("@/lib/booking/availability");
const { freeRoomsPerNight, hotelClosedRanges, overbookedRanges } = await import("@/lib/booking/room-availability");
const { addDays, dateToDay, dayToDate, tbilisiToday } = await import("@/lib/booking/dates");

const prefix = `cap${randomUUID().replace(/-/g, "").slice(0, 10)}`;
const ids = { host: `${prefix}-host`, city: "", hotel: "", big: "", small: "", random: "", r1: "", r2: "", r3: "" };
const today = tbilisiToday();
const day = (n: number) => addDays(today, n);
const BIG = 5001;

async function hotel(title: string) {
  const listing = await db.listing.create({ data: { ownerId: ids.host, status: "LIVE", dealType: "HOTEL_ROOM", cityId: ids.city, title } });
  return listing.id;
}

async function roomType(listingId: string, quantity: number) {
  const room = await db.roomType.create({ data: { listingId, names: { he: "חדר", en: "Room", ru: "Номер", ar: "غرفة", ka: "ოთახი" }, price: 100, quantity } });
  return room.id;
}

beforeAll(async () => {
  await db.user.create({ data: { id: ids.host, name: `${prefix} Host`, email: `${prefix}-host@example.com` } });
  const city = await db.city.create({ data: { slug: `${prefix}-city`, names: { he: "עיר", en: "City", ru: "Город", ar: "مدينة", ka: "ქალაქი" }, searchText: "city", lat: 41.6, lng: 41.6 } });
  ids.city = city.id;
  ids.hotel = await hotel(`${prefix} big hotel`);
  ids.big = await roomType(ids.hotel, BIG);
  ids.small = await roomType(ids.hotel, 3);
  // 5000 bookings of one room each on the first night, then one block taking every room of the
  // type on the second night: it starts later, so a 5000-row read never saw it.
  await db.availabilityBlock.createMany({
    data: Array.from({ length: 5000 }, () => ({ listingId: ids.hotel, startDate: dayToDate(day(10)), endDate: dayToDate(day(11)), source: "OWNER" as const, roomTypeId: ids.big, rooms: 1 })),
  });
  await db.availabilityBlock.create({ data: { listingId: ids.hotel, startDate: dayToDate(day(11)), endDate: dayToDate(day(12)), source: "OWNER", roomTypeId: ids.big, rooms: null } });
}, 60_000);

afterAll(async () => {
  await db.listing.deleteMany({ where: { ownerId: ids.host } });
  await db.city.deleteMany({ where: { slug: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: ids.host } });
});

describe("hotel availability with more than 5000 blocks (4.5.b)", () => {
  it("counts every block in the booking check", async () => {
    expect(await db.availabilityBlock.count({ where: { listingId: ids.hotel } })).toBe(5001);
    const big = { id: ids.big, quantity: BIG };
    expect(await freeRoomsOfType(ids.hotel, big, day(10), day(11))).toBe(1);
    // The second night has no room of the type left: the stay is not free.
    expect(await freeRoomsOfType(ids.hotel, big, day(11), day(12))).toBe(0);
    expect(await freeRoomsOfType(ids.hotel, big, day(10), day(12))).toBe(0);
    // Inside the booking transaction (the client createBooking passes) the answer is the same.
    expect(await db.$transaction((tx) => freeRoomsOfType(ids.hotel, big, day(10), day(12), tx))).toBe(0);
    // The other room type is untouched.
    expect(await freeRoomsOfType(ids.hotel, { id: ids.small, quantity: 3 }, day(10), day(12))).toBe(3);
  });

  it("reads a handful of added-up rows, not 5001", async () => {
    const blocks = await getRoomBlocks(ids.hotel, { from: day(0), to: day(60) });
    expect(blocks.length).toBeLessThanOrEqual(4);
  });

  it("shows the guest calendar the full night", async () => {
    const calendar = await getHotelAvailability(ids.hotel, [{ id: ids.big, quantity: BIG }, { id: ids.small, quantity: 3 }], { from: day(0), to: day(60) });
    expect(calendar.rooms[ids.big].segments).toEqual([
      { start: day(10), end: day(11), free: 1 },
      { start: day(11), end: day(12), free: 0 },
    ]);
    expect(calendar.closed).toEqual([]);
  });
});

describe("added-up blocks give the same answers as the raw rows", () => {
  it("on random blocks of a hotel: free rooms, overbooked nights, closed nights", async () => {
    ids.random = await hotel(`${prefix} random hotel`);
    ids.r1 = await roomType(ids.random, 4);
    ids.r2 = await roomType(ids.random, 1);
    ids.r3 = await roomType(ids.random, 7);
    const types = [ids.r1, ids.r2, ids.r3, null];
    let seed = 12345;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const data = Array.from({ length: 400 }, () => {
      const start = rand(70) - 5;
      const length = rand(9) - 1; // −1 … 7 nights (a few empty or reversed rows on purpose)
      const roomTypeId = types[rand(types.length)];
      const roomsPick = rand(6);
      return {
        listingId: ids.random,
        startDate: dayToDate(day(start)),
        endDate: dayToDate(day(start + length)),
        source: "OWNER" as const,
        roomTypeId,
        rooms: roomsPick === 0 ? null : roomsPick === 1 ? 0 : roomsPick - 1,
      };
    });
    await db.availabilityBlock.createMany({ data });
    const raw = (await db.availabilityBlock.findMany({ where: { listingId: ids.random }, select: { startDate: true, endDate: true, roomTypeId: true, rooms: true } })).map((b) => ({
      start: dateToDay(b.startDate),
      end: dateToDay(b.endDate),
      roomTypeId: b.roomTypeId,
      rooms: b.rooms,
    }));
    const rooms = [
      { id: ids.r1, quantity: 4 },
      { id: ids.r2, quantity: 1 },
      { id: ids.r3, quantity: 7 },
    ];
    for (const [from, to] of [
      [day(0), day(60)],
      [day(-3), day(10)],
      [day(20), day(21)],
      [day(33), day(48)],
    ]) {
      const summed = await getRoomBlocks(ids.random, { from, to });
      for (const room of rooms) {
        expect(freeRoomsPerNight(room, summed, from, to), `${room.id} ${from}`).toEqual(freeRoomsPerNight(room, raw, from, to));
        expect(overbookedRanges(room, summed, from, to)).toEqual(overbookedRanges(room, raw, from, to));
        // One room type at a time (what the booking transaction reads).
        const one = await getRoomBlocks(ids.random, { from, to }, db, room.id);
        expect(freeRoomsPerNight(room, one, from, to)).toEqual(freeRoomsPerNight(room, raw, from, to));
      }
      expect(hotelClosedRanges(rooms, summed, from, to)).toEqual(hotelClosedRanges(rooms, raw, from, to));
      expect(hotelClosedRanges([], summed, from, to)).toEqual(hotelClosedRanges([], raw, from, to));
    }
  });

  it("blocksFromChanges keeps runs of nights apart per room type", () => {
    expect(
      blocksFromChanges([
        { roomTypeId: null, day: "2026-01-01", full: 3, rooms: 0 },
        { roomTypeId: null, day: "2026-01-03", full: -3, rooms: 0 },
        { roomTypeId: "a", day: "2026-01-02", full: 0, rooms: 2 },
        { roomTypeId: "a", day: "2026-01-04", full: 1, rooms: -2 },
        { roomTypeId: "a", day: "2026-01-05", full: -1, rooms: 0 },
      ]),
    ).toEqual([
      { start: "2026-01-01", end: "2026-01-03", roomTypeId: null, rooms: null },
      { start: "2026-01-01", end: "2026-01-03", roomTypeId: null, rooms: null },
      { start: "2026-01-02", end: "2026-01-04", roomTypeId: "a", rooms: 2 },
      { start: "2026-01-04", end: "2026-01-05", roomTypeId: "a", rooms: null },
    ]);
  });
});
