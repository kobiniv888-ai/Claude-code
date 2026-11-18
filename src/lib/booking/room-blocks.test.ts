import { describe, expect, it } from "vitest";
import { applyRoomSelection, daysToRoomRanges, normalizeRoomRanges, roomRangesToDays } from "./room-blocks";

describe("the host's blocked rooms of one room type", () => {
  it("turns ranges into days and back, adding overlaps", () => {
    const days = roomRangesToDays([
      { start: "2026-12-01", end: "2026-12-03", rooms: 1 },
      { start: "2026-12-03", end: "2026-12-04", rooms: 2 },
    ]);
    expect(Object.fromEntries(days)).toEqual({ "2026-12-01": 1, "2026-12-02": 1, "2026-12-03": 3, "2026-12-04": 2 });
    expect(daysToRoomRanges(days)).toEqual([
      { start: "2026-12-01", end: "2026-12-02", rooms: 1 },
      { start: "2026-12-03", end: "2026-12-03", rooms: 3 },
      { start: "2026-12-04", end: "2026-12-04", rooms: 2 },
    ]);
  });

  it("stores from today on, at most the room type's number of rooms a night", () => {
    expect(
      normalizeRoomRanges(
        [
          { start: "2026-11-01", end: "2026-11-08", rooms: 2 },
          { start: "2026-11-07", end: "2026-11-09", rooms: 5 },
        ],
        "2026-11-06",
        3,
      ),
    ).toEqual([
      { start: "2026-11-06", end: "2026-11-06", rooms: 2 },
      { start: "2026-11-07", end: "2026-11-09", rooms: 3 },
    ]);
    // Bad ranges and zero rooms are dropped.
    expect(normalizeRoomRanges([{ start: "2026-11-09", end: "2026-11-07", rooms: 1 }, { start: "2026-11-07", end: "2026-11-08", rooms: 0 }], "2026-11-06", 3)).toEqual([]);
  });

  it("closes N more rooms, never more than are free that night", () => {
    const owner = [{ start: "2026-12-01", end: "2026-12-01", rooms: 1 }];
    const free = (day: string) => (day === "2026-12-02" ? 1 : 2);
    expect(applyRoomSelection(owner, ["2026-12-01", "2026-12-02", "2026-12-03"], { kind: "block", rooms: 2 }, free, "2026-11-06")).toEqual([
      { start: "2026-12-01", end: "2026-12-01", rooms: 3 },
      { start: "2026-12-02", end: "2026-12-02", rooms: 1 },
      { start: "2026-12-03", end: "2026-12-03", rooms: 2 },
    ]);
  });

  it("opens every room the host closed on the selected days; past days never change", () => {
    const owner = [{ start: "2026-12-01", end: "2026-12-05", rooms: 2 }];
    expect(applyRoomSelection(owner, ["2026-12-02", "2026-12-03"], { kind: "free" }, () => 3, "2026-11-06")).toEqual([
      { start: "2026-12-01", end: "2026-12-01", rooms: 2 },
      { start: "2026-12-04", end: "2026-12-05", rooms: 2 },
    ]);
    expect(applyRoomSelection(owner, ["2026-11-01"], { kind: "block", rooms: 1 }, () => 3, "2026-11-06")).toEqual(owner);
  });
});
