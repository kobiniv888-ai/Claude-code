import { describe, expect, it } from "vitest";
import { groupHolidayPeriods, indexDatePrices, indexHolidays, isPeakHoliday, periodsBetween, selectionNights } from "@/components/host-calendar/model";
import { DATE_PRICE_LIMITS, datePriceDatesProblem, datePriceInputSchema, datePriceIssue, overlappingDatePrice, sharesNight } from "./date-prices";

/** Round 3, brief 6.3: the host's holiday prices ("מחיר לתאריכים") and the holidays on the calendar. */
const TODAY = "2026-11-06";

const input = (patch: Record<string, unknown> = {}) => ({ listingId: "l1", start: "2026-12-24", last: "2026-12-26", price: 80, ...patch });

describe("the date-price form", () => {
  it("turns the calendar's inclusive nights into the database's exclusive end", () => {
    const parsed = datePriceInputSchema.parse(input({ minNights: 3, label: "  חנוכה  " }));
    expect(parsed).toMatchObject({ start: "2026-12-24", last: "2026-12-26", end: "2026-12-27", price: 80, minNights: 3, label: "חנוכה", roomTypeId: null });
  });

  it("keeps the room type for hotels (the room-type picker comes later)", () => {
    expect(datePriceInputSchema.parse(input({ roomTypeId: "room-1" })).roomTypeId).toBe("room-1");
  });

  it("rounds the price to cents and refuses a missing, zero or huge price", () => {
    expect(datePriceInputSchema.parse(input({ price: 79.999 })).price).toBe(80);
    expect(datePriceInputSchema.parse(input({ price: 55.5 })).price).toBe(55.5);
    for (const price of [0, -5, null, "80", Number.NaN, 0.001]) {
      const result = datePriceInputSchema.safeParse(input({ price }));
      expect(result.success, String(price)).toBe(false);
      if (!result.success) expect(datePriceIssue(result.error)).toBe("price_required");
    }
    const huge = datePriceInputSchema.safeParse(input({ price: DATE_PRICE_LIMITS.priceMax + 1 }));
    expect(!huge.success && datePriceIssue(huge.error)).toBe("price_too_high");
  });

  it("treats a 1-night minimum as no minimum, and limits the note", () => {
    expect(datePriceInputSchema.parse(input({ minNights: 1 })).minNights).toBeNull();
    expect(datePriceInputSchema.parse(input({ minNights: null })).minNights).toBeNull();
    expect(datePriceInputSchema.safeParse(input({ minNights: 2.5 })).success).toBe(false);
    expect(datePriceInputSchema.safeParse(input({ minNights: 91 })).success).toBe(false);
    expect(datePriceInputSchema.parse(input({ label: "   " })).label).toBeNull();
    expect(datePriceInputSchema.parse(input({ label: "ערב\n  פסח" })).label).toBe("ערב פסח");
    const long = datePriceInputSchema.safeParse(input({ label: "א".repeat(DATE_PRICE_LIMITS.labelMax + 1) }));
    expect(!long.success && datePriceIssue(long.error)).toBe("label_too_long");
    // A note is public text like a title: no emoji (guide-2).
    expect(datePriceInputSchema.parse(input({ label: "\u{1F56F}\uFE0F חנוכה \u{1F389}" })).label).toBe("חנוכה");
    expect(datePriceInputSchema.parse(input({ label: "\u{1F389}" })).label).toBeNull();
  });

  it("refuses dates that are not days or run backwards", () => {
    const bad = datePriceInputSchema.safeParse(input({ start: "2026-02-30" }));
    expect(!bad.success && datePriceIssue(bad.error)).toBe("dates_invalid");
    const backwards = datePriceInputSchema.safeParse(input({ start: "2026-12-27", last: "2026-12-24" }));
    expect(!backwards.success && datePriceIssue(backwards.error)).toBe("dates_invalid");
    // One night is fine.
    expect(datePriceInputSchema.parse(input({ last: "2026-12-24" })).end).toBe("2026-12-25");
  });
});

describe("the dates' rules", () => {
  it("allows today and later, up to two years ahead and at most 120 nights", () => {
    expect(datePriceDatesProblem({ start: TODAY, end: "2026-11-07" }, TODAY)).toBeNull();
    expect(datePriceDatesProblem({ start: "2026-11-05", end: "2026-11-07" }, TODAY)).toBe("dates_past");
    expect(datePriceDatesProblem({ start: "2029-01-01", end: "2029-01-03" }, TODAY)).toBe("too_far_ahead");
    expect(datePriceDatesProblem({ start: "2026-12-01", end: "2027-03-31" }, TODAY)).toBeNull();
    expect(datePriceDatesProblem({ start: "2026-12-01", end: "2027-04-01" }, TODAY)).toBe("too_many_nights");
    expect(datePriceDatesProblem({ start: "2026-12-01", end: "2026-12-01" }, TODAY)).toBe("dates_invalid");
  });

  it("refuses an overlap with another date price of the same listing or room type only", () => {
    const existing = [
      { start: "2026-12-24", end: "2026-12-27", roomTypeId: null },
      { start: "2027-04-01", end: "2027-04-09", roomTypeId: "room-1" },
    ];
    // The check-out-like end is free: a new price may start on it.
    expect(overlappingDatePrice({ start: "2026-12-27", end: "2026-12-29", roomTypeId: null }, existing)).toBeUndefined();
    expect(overlappingDatePrice({ start: "2026-12-20", end: "2026-12-25", roomTypeId: null }, existing)).toBe(existing[0]);
    expect(overlappingDatePrice({ start: "2026-12-25", end: "2026-12-26", roomTypeId: null }, existing)).toBe(existing[0]);
    // A room type's own price may cover nights of the listing's (it wins for that room type).
    expect(overlappingDatePrice({ start: "2026-12-24", end: "2026-12-27", roomTypeId: "room-1" }, existing)).toBeUndefined();
    expect(overlappingDatePrice({ start: "2027-04-05", end: "2027-04-12", roomTypeId: "room-1" }, existing)).toBe(existing[1]);
    expect(overlappingDatePrice({ start: "2027-04-05", end: "2027-04-12", roomTypeId: "room-2" }, existing)).toBeUndefined();
    expect(sharesNight({ start: "2026-12-24", end: "2026-12-25" }, { start: "2026-12-24", end: "2026-12-25" })).toBe(true);
  });
});

describe("holidays and holiday prices on the host calendar", () => {
  const days = [
    { date: "2027-04-21", key: "pesach" as const, name: "ערב פסח" },
    { date: "2027-04-22", key: "pesach" as const, name: "פסח" },
    { date: "2027-04-23", key: "pesach" as const, name: "פסח (יום ב׳)" },
    { date: "2026-10-01", key: "sukkot" as const, name: "סוכות" },
    { date: "2026-10-02", key: "shemini-atzeret" as const, name: "שמיני עצרת" },
    { date: "2026-10-02", key: "simchat-torah" as const, name: "שמחת תורה" },
    { date: "2027-06-10", key: "shavuot" as const, name: "שבועות" },
  ];
  const names = { pesach: "פסח", sukkot: "סוכות", shavuot: "שבועות" } as Record<string, string>;

  it("marks only the travel holidays (not fasts or memorial days)", () => {
    expect(isPeakHoliday("pesach")).toBe(true);
    expect(isPeakHoliday("chanukah")).toBe(true);
    expect(isPeakHoliday("tisha-bav")).toBe(false);
    expect(isPeakHoliday("yom-hazikaron")).toBe(false);
  });

  it("groups a holiday's days (with its eve, and Shemini Atzeret with Sukkot) into periods", () => {
    expect(groupHolidayPeriods(days, (key) => names[key] ?? key)).toEqual([
      { key: "sukkot", name: "סוכות", start: "2026-10-01", last: "2026-10-02" },
      { key: "pesach", name: "פסח", start: "2027-04-21", last: "2027-04-23" },
      { key: "shavuot", name: "שבועות", start: "2027-06-10", last: "2027-06-10" },
    ]);
    expect(indexHolidays(days).get("2026-10-02")).toBe("שמיני עצרת · שמחת תורה");
  });

  it("shows the periods of the months on screen that are not over yet", () => {
    const periods = groupHolidayPeriods(days, (key) => names[key] ?? key);
    expect(periodsBetween(periods, "2027-04-01", "2027-05-31", TODAY).map((p) => p.key)).toEqual(["pesach"]);
    expect(periodsBetween(periods, "2026-10-01", "2026-11-30", TODAY)).toEqual([]);
  });

  it("marks the nights of listing-wide prices, and takes a selection's nights from today on", () => {
    const index = indexDatePrices([
      { id: "a", start: "2026-12-24", end: "2026-12-26", price: 80, roomTypeId: null },
      { id: "b", start: "2026-12-25", end: "2026-12-28", price: 99, roomTypeId: "room-1" },
    ]);
    expect([...index.keys()]).toEqual(["2026-12-24", "2026-12-25"]);
    expect(selectionNights(["2026-11-05", "2026-11-06", "2026-11-07"], TODAY)).toEqual({ start: "2026-11-06", last: "2026-11-07", nights: 2 });
    expect(selectionNights(["2026-11-05"], TODAY)).toBeNull();
  });
});
