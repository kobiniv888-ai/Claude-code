import { describe, expect, it } from "vitest";
import {
  addTotals,
  bookingSeries,
  emptyTotals,
  hotelOccupancy,
  isBookableDeal,
  isQuietPeriod,
  nightsInPeriod,
  occupancyRate,
  parseStatsEnd,
  parseStatsRange,
  percent,
  periodDays,
  stayOccupancy,
  type StatsStay,
} from "./stats-math";

const stay = (checkIn: string, checkOut: string, extra: Partial<StatsStay> = {}): StatsStay => ({
  checkIn,
  checkOut,
  rooms: 1,
  roomTypeId: null,
  bookedOn: "2026-10-01",
  ...extra,
});

describe("periods", () => {
  it("offers the last 7 and 30 days, 30 by default", () => {
    expect(parseStatsRange("7")).toBe(7);
    expect(parseStatsRange(["7"])).toBe(7);
    expect(parseStatsRange("30")).toBe(30);
    expect(parseStatsRange("90")).toBe(30);
    expect(parseStatsRange(undefined)).toBe(30);
  });

  it("lists the days up to today, oldest first", () => {
    expect(periodDays("2026-11-04", 7)).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(periodDays("2026-11-04", 30)).toHaveLength(30);
    expect(periodDays("2026-03-01", 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });

  it("shows bookings only for short stays and hotels", () => {
    expect(isBookableDeal("SHORT_STAY")).toBe(true);
    expect(isBookableDeal("HOTEL_ROOM")).toBe(true);
    expect(isBookableDeal("MONTHLY_RENT")).toBe(false);
    expect(isBookableDeal("SALE")).toBe(false);
  });
});

describe("booked nights", () => {
  it("counts only the nights inside the period (check-out day excluded)", () => {
    // Period 1–7 Nov; stay 30 Oct → 3 Nov = nights 1 and 2 Nov inside.
    expect(nightsInPeriod(stay("2026-10-30", "2026-11-03"), "2026-11-01", "2026-11-07")).toBe(2);
    expect(nightsInPeriod(stay("2026-11-06", "2026-11-10"), "2026-11-01", "2026-11-07")).toBe(2);
    expect(nightsInPeriod(stay("2026-11-02", "2026-11-04"), "2026-11-01", "2026-11-07")).toBe(2);
    expect(nightsInPeriod(stay("2026-11-08", "2026-11-10"), "2026-11-01", "2026-11-07")).toBe(0);
    expect(nightsInPeriod(stay("2026-10-20", "2026-11-01"), "2026-11-01", "2026-11-07")).toBe(0);
    // Hotels: rooms × nights.
    expect(nightsInPeriod(stay("2026-11-02", "2026-11-05", { rooms: 2 }), "2026-11-01", "2026-11-07")).toBe(6);
  });

  it("puts bookings on the day they were made and nights on each night", () => {
    const days = periodDays("2026-11-04", 3); // 2, 3, 4 Nov
    const series = bookingSeries(
      [stay("2026-11-03", "2026-11-06", { bookedOn: "2026-11-02" }), stay("2026-12-01", "2026-12-03", { bookedOn: "2026-11-04", rooms: 2 })],
      days,
    );
    expect(series.get("2026-11-02")).toEqual({ bookings: 1, bookedNights: 0 });
    expect(series.get("2026-11-03")).toEqual({ bookings: 0, bookedNights: 1 });
    expect(series.get("2026-11-04")).toEqual({ bookings: 1, bookedNights: 1 });
  });
});

describe("occupancy", () => {
  it("is booked / offered, at most 100%, null when nothing was offered", () => {
    expect(occupancyRate(3, 7)).toBeCloseTo(3 / 7);
    expect(occupancyRate(9, 7)).toBe(1);
    expect(occupancyRate(0, 0)).toBeNull();
    expect(percent(3 / 7)).toBe(43);
    expect(percent(1.2)).toBe(100);
  });

  it("short stay: booked nights / days of the period", () => {
    const days = periodDays("2026-11-07", 7); // 1–7 Nov
    const result = stayOccupancy([stay("2026-10-30", "2026-11-03"), stay("2026-11-05", "2026-11-06")], days);
    expect(result).toEqual({ bookedNights: 3, offeredNights: 7, rate: 3 / 7 });
    expect(stayOccupancy([], days).rate).toBe(0);
  });

  it("hotel: booked room-nights / (rooms offered × nights), in all and per room type", () => {
    const days = periodDays("2026-11-07", 7);
    const roomTypes = [
      { id: "double", quantity: 4, active: true },
      { id: "family", quantity: 2, active: true },
      { id: "old", quantity: 3, active: false },
      { id: "retired", quantity: 5, active: false },
    ];
    const result = hotelOccupancy(
      [
        stay("2026-11-01", "2026-11-04", { roomTypeId: "double", rooms: 2 }), // 6 room-nights
        stay("2026-11-06", "2026-11-09", { roomTypeId: "family", rooms: 1 }), // 2 inside
        stay("2026-11-02", "2026-11-03", { roomTypeId: "old", rooms: 1 }), // 1, inactive type with guests
        stay("2026-11-02", "2026-11-04", { roomTypeId: null, rooms: 1 }), // 2, made before room types
      ],
      roomTypes,
      days,
    );
    expect(result.byRoomType).toEqual([
      { id: "double", quantity: 4, bookedNights: 6, offeredNights: 28, rate: 6 / 28 },
      { id: "family", quantity: 2, bookedNights: 2, offeredNights: 14, rate: 2 / 14 },
      { id: "old", quantity: 3, bookedNights: 1, offeredNights: 21, rate: 1 / 21 },
    ]);
    expect(result.total).toEqual({ bookedNights: 11, offeredNights: 63, rate: 11 / 63 });
  });

  it("short stay: nights closed by the host or booked on another site are not offered on Bayit (occupancy-1)", () => {
    const days = periodDays("2026-11-30", 30); // 1–30 Nov
    const closed = [
      { start: "2026-11-06", end: "2026-11-26", roomTypeId: null, rooms: null }, // 20 nights booked elsewhere (ICAL)
      { start: "2026-11-26", end: "2026-12-01", roomTypeId: null, rooms: null }, // 5 nights closed (OWNER)
    ];
    const result = stayOccupancy([stay("2026-11-01", "2026-11-06")], days, closed);
    expect(result).toEqual({ bookedNights: 5, offeredNights: 5, rate: 1 });
    // A Bayit night under another block still counts as offered (never removed twice).
    expect(stayOccupancy([stay("2026-11-06", "2026-11-08")], days, closed)).toMatchObject({ bookedNights: 2, offeredNights: 7 });
  });

  it("hotel: closed rooms are not offered; a whole-hotel block closes every room type (occupancy-1)", () => {
    const days = periodDays("2026-11-30", 30);
    const rooms = [{ id: "double", quantity: 3, active: true }];
    const oneRoom = hotelOccupancy([], rooms, days, [{ start: "2026-11-01", end: "2026-11-11", roomTypeId: "double", rooms: 1 }]);
    expect(oneRoom.byRoomType[0].offeredNights).toBe(80);
    const twoTypes = [...rooms, { id: "family", quantity: 2, active: true }];
    const whole = hotelOccupancy([], twoTypes, days, [{ start: "2026-11-01", end: "2026-11-11", roomTypeId: null, rooms: null }]);
    expect(whole.byRoomType.map((r) => r.offeredNights)).toEqual([60, 40]);
    // A booked room counts as offered even under a closure of the type.
    const booked = hotelOccupancy([stay("2026-11-01", "2026-11-02", { roomTypeId: "double", rooms: 1 })], rooms, days, [
      { start: "2026-11-01", end: "2026-11-02", roomTypeId: "double", rooms: null },
    ]);
    expect(booked.byRoomType[0]).toMatchObject({ bookedNights: 1, offeredNights: 88 });
  });

  it("hotel without room types offers nothing", () => {
    expect(hotelOccupancy([stay("2026-11-02", "2026-11-03")], [], periodDays("2026-11-07", 7)).total.rate).toBeNull();
  });
});

describe("the stats page's last day (?to=, weekly-2)", () => {
  it("accepts a real past day up to about 13 months back, else null (the period ends today)", () => {
    expect(parseStatsEnd("2026-11-07", "2026-11-08")).toBe("2026-11-07");
    expect(parseStatsEnd(["2026-11-08"], "2026-11-08")).toBe("2026-11-08");
    expect(parseStatsEnd("2026-11-09", "2026-11-08")).toBeNull(); // the future
    expect(parseStatsEnd("2025-09-01", "2026-11-08")).toBeNull(); // too old
    expect(parseStatsEnd("2026-02-30", "2026-11-08")).toBeNull(); // no such day
    expect(parseStatsEnd("7.11.2026", "2026-11-08")).toBeNull();
    expect(parseStatsEnd(undefined, "2026-11-08")).toBeNull();
  });
});

describe("totals", () => {
  it("adds up and knows a quiet week", () => {
    const a = addTotals(emptyTotals(), { views: 120, saves: 8 });
    expect(addTotals(a, { bookings: 1, bookedNights: 3 })).toEqual({ views: 120, saves: 8, contacts: 0, bookings: 1, bookedNights: 3 });
    expect(isQuietPeriod(emptyTotals())).toBe(true);
    expect(isQuietPeriod({ ...emptyTotals(), contacts: 1 })).toBe(false);
    expect(isQuietPeriod({ ...emptyTotals(), bookedNights: 2 })).toBe(false);
  });
});
