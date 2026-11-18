import { describe, expect, it } from "vitest";
import { applySelection, dayKind, indexCalendar, selectionCounts } from "./model";
import { indexHotelNights, indexRoomCalendar, roomSelectionSummary } from "./room-model";

describe("hotel calendar per room type", () => {
  const index = indexRoomCalendar({
    today: "2026-12-01",
    quantity: 3,
    owner: [{ start: "2026-12-03", end: "2026-12-04", rooms: 1 }],
    booked: [
      { start: "2026-12-02", end: "2026-12-04", code: "BT-AAAAA", rooms: 2 },
      { start: "2026-11-28", end: "2026-12-02", code: "BT-BBBBB", rooms: 1 },
    ],
    imported: [{ start: "2026-12-03", end: "2026-12-05", source: "booking.com" }],
    closed: [{ start: "2026-12-10", end: "2026-12-11" }],
  });

  it("free = rooms − booked − imported − closed by the host", () => {
    expect(index.day("2026-12-01")).toMatchObject({ booked: 1, free: 2, codes: ["BT-BBBBB"], past: false });
    expect(index.day("2026-12-02")).toMatchObject({ booked: 2, free: 1 });
    expect(index.day("2026-12-03")).toMatchObject({ booked: 2, imported: 1, blocked: 1, free: 0 });
    expect(index.day("2026-12-04")).toMatchObject({ booked: 0, imported: 1, blocked: 1, free: 1 });
    expect(index.day("2026-12-05")).toMatchObject({ free: 3, codes: [] });
  });

  it("a whole-hotel block leaves no room of any type", () => {
    expect(index.day("2026-12-10")).toMatchObject({ closed: true, free: 0 });
  });

  it("past nights are marked, so they are never changed", () => {
    expect(index.day("2026-11-30")).toMatchObject({ past: true, booked: 1 });
  });

  it("sums up a selection: the fewest free rooms, the host's closed rooms and the bookings", () => {
    expect(roomSelectionSummary(["2026-12-01", "2026-12-02", "2026-12-04"], index)).toEqual({ minFree: 1, blocked: 1, codes: ["BT-BBBBB", "BT-AAAAA"] });
    expect(roomSelectionSummary(["2026-11-29"], index)).toEqual({ minFree: 0, blocked: 0, codes: [] });
  });
});

describe("the whole hotel per night (ui-hotel-2)", () => {
  // Double: 2 rooms, suite: 1 room, and a switched-off type with one old booking.
  const rooms = [
    { quantity: 2, active: true, owner: [], booked: [{ start: "2026-12-03", end: "2026-12-05", code: "BT-DOUBLE", rooms: 2 }], imported: [] },
    { quantity: 1, active: true, owner: [], booked: [{ start: "2026-12-04", end: "2026-12-06", code: "BT-SUITE", rooms: 1 }], imported: [] },
    { quantity: 4, active: false, owner: [], booked: [{ start: "2026-12-08", end: "2026-12-09", code: "BT-OFF", rooms: 1 }], imported: [] },
  ];
  const nights = indexHotelNights(rooms, [], "2026-12-01");

  it("counts the free rooms of the offered room types and the bookings of the night", () => {
    expect(nights("2026-12-02")).toEqual({ free: 3, total: 3, booked: 0, codes: [] });
    // One type full, the other free: some rooms booked.
    expect(nights("2026-12-03")).toEqual({ free: 1, total: 3, booked: 2, codes: ["BT-DOUBLE"] });
    // Both types full: the hotel is full.
    expect(nights("2026-12-04")).toEqual({ free: 0, total: 3, booked: 3, codes: ["BT-DOUBLE", "BT-SUITE"] });
    // A switched-off type's booking is listed, but its rooms are not offered.
    expect(nights("2026-12-08")).toEqual({ free: 3, total: 3, booked: 1, codes: ["BT-OFF"] });
  });

  it("gives the whole-hotel calendar its full and partly booked nights, which can still be blocked", () => {
    const index = indexCalendar({ today: "2026-12-01", owner: [{ start: "2026-12-05", end: "2026-12-05" }], booked: [], imported: [], hotel: nights });
    expect(dayKind("2026-12-02", index)).toBe("free");
    expect(dayKind("2026-12-03", index)).toBe("hotelSome");
    expect(dayKind("2026-12-04", index)).toBe("hotelFull");
    // The host's own block of the whole hotel wins.
    expect(dayKind("2026-12-05", index)).toBe("blocked");
    const days = ["2026-12-03", "2026-12-04", "2026-12-05"];
    expect(selectionCounts(days, index)).toEqual({ free: 2, blocked: 1 });
    expect(applySelection([{ start: "2026-12-05", end: "2026-12-05" }], days, "block", index)).toEqual([{ start: "2026-12-03", end: "2026-12-05" }]);
  });

  it("has nothing to count without room types", () => {
    expect(indexHotelNights([], [], "2026-12-01")("2026-12-02")).toBeNull();
  });
});
