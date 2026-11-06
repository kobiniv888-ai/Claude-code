import { describe, expect, it } from "vitest";
import { indexRoomCalendar, roomSelectionSummary } from "./room-model";

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
