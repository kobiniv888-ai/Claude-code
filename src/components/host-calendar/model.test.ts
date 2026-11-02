import { describe, expect, it } from "vitest";
import { applySelection, dayKind, daysBetween, indexCalendar, monthStart, selectionCounts } from "./model";

const index = indexCalendar({
  today: "2026-11-10",
  owner: [{ start: "2026-11-20", end: "2026-11-22" }],
  booked: [{ start: "2026-11-12", end: "2026-11-15", code: "BT-AAAAA" }],
  imported: [{ start: "2026-11-25", end: "2026-11-27", source: "airbnb.com" }],
});

describe("host calendar model", () => {
  it("tells each day's kind (check-out days are free again)", () => {
    expect(dayKind("2026-11-09", index)).toBe("past");
    expect(dayKind("2026-11-12", index)).toBe("booked");
    expect(dayKind("2026-11-14", index)).toBe("booked");
    expect(dayKind("2026-11-15", index)).toBe("free");
    expect(dayKind("2026-11-21", index)).toBe("blocked");
    expect(dayKind("2026-11-26", index)).toBe("imported");
    expect(dayKind("2026-11-27", index)).toBe("free");
  });

  it("blocks only free days and frees only the host's own blocks", () => {
    const days = daysBetween("2026-11-16", "2026-11-11");
    expect(days).toHaveLength(6);
    expect(selectionCounts(days, index)).toEqual({ free: 3, blocked: 0 });
    expect(applySelection([{ start: "2026-11-20", end: "2026-11-22" }], days, "block", index)).toEqual([
      { start: "2026-11-11", end: "2026-11-11" },
      { start: "2026-11-15", end: "2026-11-16" },
      { start: "2026-11-20", end: "2026-11-22" },
    ]);
    const freed = applySelection([{ start: "2026-11-20", end: "2026-11-22" }], daysBetween("2026-11-21", "2026-11-26"), "free", index);
    expect(freed).toEqual([{ start: "2026-11-20", end: "2026-11-20" }]);
  });

  it("counts months across the year end", () => {
    expect(monthStart("2026-11-10", 0)).toEqual({ year: 2026, month: 11 });
    expect(monthStart("2026-11-10", 2)).toEqual({ year: 2027, month: 1 });
    expect(monthStart("2026-01-31", -1)).toEqual({ year: 2025, month: 12 });
  });
});
