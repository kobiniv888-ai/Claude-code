import { describe, expect, it } from "vitest";
import {
  freeFromSegments,
  freeRoomsForStay,
  freeRoomsOnNight,
  freeRoomsPerNight,
  freeSegments,
  fullRanges,
  hasFreeRooms,
  hotelClosedRanges,
  overbookedRanges,
  roomQuantity,
  roomsTakenBy,
  type RoomBlock,
} from "./room-availability";

const double = { id: "double", quantity: 3 };
const suite = { id: "suite", quantity: 1 };

const booking = (start: string, end: string, roomTypeId: string | null, rooms: number | null = 1): RoomBlock => ({ start, end, roomTypeId, rooms });

describe("rooms a block takes", () => {
  it("a booking of the type takes its rooms; another type's takes none", () => {
    expect(roomsTakenBy({ roomTypeId: "double", rooms: 2 }, double)).toBe(2);
    expect(roomsTakenBy({ roomTypeId: "suite", rooms: 1 }, double)).toBe(0);
  });

  it("a block without a room type closes every room of every type (the whole hotel)", () => {
    expect(roomsTakenBy({ roomTypeId: null, rooms: null }, double)).toBe(3);
    expect(roomsTakenBy({ roomTypeId: null, rooms: 1 }, suite)).toBe(1);
  });

  it("a room-type block without a number of rooms takes all of them", () => {
    expect(roomsTakenBy({ roomTypeId: "double", rooms: null }, double)).toBe(3);
    expect(roomsTakenBy({ roomTypeId: "double", rooms: 0 }, double)).toBe(3);
  });

  it("a quantity below 1 counts as one room", () => {
    expect(roomQuantity({ quantity: 0 })).toBe(1);
    expect(roomQuantity({ quantity: -4 })).toBe(1);
    expect(roomQuantity({ quantity: 2.7 })).toBe(2);
  });
});

describe("free rooms per night: quantity − booked − blocked", () => {
  const blocks: RoomBlock[] = [
    booking("2026-12-01", "2026-12-04", "double", 1), // a guest, 3 nights
    booking("2026-12-02", "2026-12-03", "double", 1), // another guest, 1 night
    { start: "2026-12-03", end: "2026-12-05", roomTypeId: "double", rooms: 1 }, // the host closes one room
    booking("2026-12-01", "2026-12-10", "suite", 1), // other room type: no effect
  ];

  it("counts every block that covers the night", () => {
    expect(freeRoomsPerNight(double, blocks, "2026-11-30", "2026-12-06")).toEqual([3, 2, 1, 1, 2, 3]);
  });

  it("the check-out day is free again (end is exclusive)", () => {
    expect(freeRoomsOnNight(double, [booking("2026-12-01", "2026-12-02", "double", 3)], "2026-12-02")).toBe(3);
    expect(freeRoomsOnNight(double, [booking("2026-12-01", "2026-12-02", "double", 3)], "2026-12-01")).toBe(0);
  });

  it("a stay gets the fewest free rooms of its nights", () => {
    expect(freeRoomsForStay(double, blocks, "2026-12-01", "2026-12-03")).toBe(1);
    expect(freeRoomsForStay(double, blocks, "2026-12-04", "2026-12-08")).toBe(2);
    expect(freeRoomsForStay(double, blocks, "2026-12-05", "2026-12-08")).toBe(3);
  });

  it("the last room: free for one more booking, then not", () => {
    const one = [booking("2026-12-01", "2026-12-03", "double", 2)];
    expect(hasFreeRooms(double, one, "2026-12-01", "2026-12-03", 1)).toBe(true);
    expect(hasFreeRooms(double, one, "2026-12-01", "2026-12-03", 2)).toBe(false);
    const full = [...one, booking("2026-12-02", "2026-12-05", "double", 1)];
    expect(hasFreeRooms(double, full, "2026-12-02", "2026-12-03", 1)).toBe(false);
    // The night before and after are still open.
    expect(hasFreeRooms(double, full, "2026-12-01", "2026-12-02", 1)).toBe(true);
    expect(hasFreeRooms(double, full, "2026-12-03", "2026-12-05", 2)).toBe(true);
  });

  it("more booked and blocked rooms than the quantity (the host lowered it) read as 0 free, never negative", () => {
    const over = [booking("2026-12-01", "2026-12-02", "double", 2), { start: "2026-12-01", end: "2026-12-02", roomTypeId: "double", rooms: 2 }];
    expect(freeRoomsOnNight(double, over, "2026-12-01")).toBe(0);
  });

  it("a block without a room type closes the whole hotel on its nights only", () => {
    const closed = [{ start: "2026-12-24", end: "2026-12-26", roomTypeId: null, rooms: null }];
    expect(freeRoomsForStay(double, closed, "2026-12-23", "2026-12-25")).toBe(0);
    expect(freeRoomsForStay(suite, closed, "2026-12-25", "2026-12-26")).toBe(0);
    expect(freeRoomsForStay(double, closed, "2026-12-26", "2026-12-28")).toBe(3);
  });

  it("empty, reversed or invalid stays have no free rooms", () => {
    expect(freeRoomsForStay(double, [], "2026-12-05", "2026-12-05")).toBe(0);
    expect(freeRoomsForStay(double, [], "2026-12-06", "2026-12-05")).toBe(0);
    expect(freeRoomsForStay(double, [], "2026-02-30", "2026-03-02")).toBe(0);
    expect(hasFreeRooms(double, [], "2026-12-05", "2026-12-05")).toBe(false);
  });

  it("ignores broken blocks (bad days, end before start)", () => {
    const broken = [booking("2026-12-05", "2026-12-01", "double", 3), booking("nope", "2026-12-09", "double", 3)];
    expect(freeRoomsForStay(double, broken, "2026-12-01", "2026-12-08")).toBe(3);
  });

  it("a block that starts before the window still counts inside it", () => {
    expect(freeRoomsPerNight(double, [booking("2026-11-20", "2026-12-02", "double", 1)], "2026-12-01", "2026-12-03")).toEqual([2, 3]);
  });
});

describe("segments for the browser", () => {
  const blocks: RoomBlock[] = [booking("2026-12-01", "2026-12-04", "double", 1), booking("2026-12-02", "2026-12-03", "double", 2)];

  it("only nights with fewer than all rooms free, joined when the count stays the same", () => {
    expect(freeSegments(double, blocks, "2026-11-28", "2026-12-10")).toEqual([
      { start: "2026-12-01", end: "2026-12-02", free: 2 },
      { start: "2026-12-02", end: "2026-12-03", free: 0 },
      { start: "2026-12-03", end: "2026-12-04", free: 2 },
    ]);
  });

  it("the browser gets the same answer from the segments as the server from the blocks", () => {
    const segments = freeSegments(double, blocks, "2026-11-28", "2027-01-10");
    for (const [checkIn, checkOut] of [
      ["2026-11-29", "2026-12-01"],
      ["2026-11-30", "2026-12-02"],
      ["2026-12-01", "2026-12-02"],
      ["2026-12-01", "2026-12-04"],
      ["2026-12-03", "2026-12-06"],
      ["2026-12-04", "2026-12-06"],
    ]) {
      expect(freeFromSegments(double.quantity, segments, checkIn, checkOut)).toBe(freeRoomsForStay(double, blocks, checkIn, checkOut));
    }
  });

  it("finds nights with more rooms taken than the type has (an imported booking on a sold-out night)", () => {
    const over = [...blocks, { start: "2026-12-02", end: "2026-12-04", roomTypeId: "double", rooms: 1 }];
    // 12-02: 1 + 2 + 1 = 4 of 3; 12-03: 1 + 1 = 2 of 3.
    expect(overbookedRanges(double, over, "2026-11-28", "2026-12-10")).toEqual([{ start: "2026-12-02", end: "2026-12-03" }]);
    expect(overbookedRanges(double, blocks, "2026-11-28", "2026-12-10")).toEqual([]);
  });

  it("full nights of one type (what its calendar exports as busy)", () => {
    expect(fullRanges(double, blocks, "2026-11-28", "2026-12-10")).toEqual([{ start: "2026-12-02", end: "2026-12-03" }]);
  });
});

describe("the whole hotel's closed nights (the guest calendar)", () => {
  it("closed only when every room type is full or the hotel is closed", () => {
    const blocks: RoomBlock[] = [
      booking("2026-12-01", "2026-12-05", "double", 3),
      booking("2026-12-03", "2026-12-04", "suite", 1),
      { start: "2026-12-10", end: "2026-12-11", roomTypeId: null, rooms: null },
    ];
    expect(hotelClosedRanges([double, suite], blocks, "2026-11-30", "2026-12-20")).toEqual([
      { start: "2026-12-03", end: "2026-12-04" },
      { start: "2026-12-10", end: "2026-12-11" },
    ]);
  });

  it("one booking never closes the whole hotel", () => {
    expect(hotelClosedRanges([double, suite], [booking("2026-12-01", "2026-12-05", "suite", 1)], "2026-11-30", "2026-12-20")).toEqual([]);
  });

  it("without room types every block closes the place (a listing booked as a whole)", () => {
    expect(hotelClosedRanges([], [booking("2026-12-01", "2026-12-03", null, 1), booking("2026-12-03", "2026-12-04", "x", 1)], "2026-11-30", "2026-12-20")).toEqual([
      { start: "2026-12-01", end: "2026-12-04" },
    ]);
  });
});
