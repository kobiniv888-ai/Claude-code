import { describe, expect, it } from "vitest";
import { countdownParts, shabbatPhase } from "./countdown";
import { asksForDates, homeSearchFilters, parseBudget, type HomeSearchState } from "./search-card";

const HOUR = 3_600_000;
const MINUTE = 60_000;

describe("countdownParts", () => {
  it("uses the two largest units", () => {
    expect(countdownParts(2 * 24 * HOUR + 4 * HOUR + 10 * MINUTE)).toEqual([
      { unit: "day", count: 2 },
      { unit: "hour", count: 4 },
    ]);
    expect(countdownParts(3 * HOUR + 20 * MINUTE)).toEqual([
      { unit: "hour", count: 3 },
      { unit: "minute", count: 20 },
    ]);
  });

  it("drops a zero second unit and never shows zero minutes", () => {
    expect(countdownParts(24 * HOUR)).toEqual([{ unit: "day", count: 1 }]);
    expect(countdownParts(2 * HOUR)).toEqual([{ unit: "hour", count: 2 }]);
    expect(countdownParts(10_000)).toEqual([{ unit: "minute", count: 1 }]);
  });

  it("rounds minutes up (59 minutes 30 seconds reads 1 hour)", () => {
    expect(countdownParts(59 * MINUTE + 30_000)).toEqual([{ unit: "hour", count: 1 }]);
  });
});

describe("shabbatPhase", () => {
  const candles = new Date("2026-11-06T13:31:00Z");
  const havdalah = new Date("2026-11-07T14:32:00Z");

  it("counts down before candle lighting", () => {
    expect(shabbatPhase(new Date("2026-11-04T09:31:00Z"), candles, havdalah)).toEqual({
      phase: "before",
      parts: [
        { unit: "day", count: 2 },
        { unit: "hour", count: 4 },
      ],
    });
  });

  it("is Shabbat between candle lighting and Havdalah, and after it ends", () => {
    expect(shabbatPhase(new Date("2026-11-06T20:00:00Z"), candles, havdalah)).toEqual({ phase: "during" });
    expect(shabbatPhase(new Date("2026-11-07T15:00:00Z"), candles, havdalah)).toEqual({ phase: "after" });
    expect(shabbatPhase(new Date("2026-11-07T15:00:00Z"), candles, null)).toEqual({ phase: "during" });
    expect(shabbatPhase(new Date(), null, null)).toEqual({ phase: "unknown" });
  });
});

describe("home search card", () => {
  const base: HomeSearchState = {
    deal: "short-stay",
    place: { kind: "city", citySlug: "tbilisi", label: "Tbilisi" },
    checkIn: "2026-12-10",
    checkOut: "2026-12-14",
    guests: 4,
    rooms: 3,
    budget: 900,
  };

  it("asks for dates for short stays and hotels only", () => {
    expect(asksForDates("short-stay")).toBe(true);
    expect(asksForDates("hotels")).toBe(true);
    expect(asksForDates("monthly")).toBe(false);
    expect(asksForDates("buy")).toBe(false);
  });

  it("short stays send dates and guests, not rooms or budget", () => {
    const filters = homeSearchFilters(base);
    expect(filters).toMatchObject({ deal: "short-stay", city: "tbilisi", checkIn: "2026-12-10", checkOut: "2026-12-14", guests: 4 });
    expect(filters.rooms).toBeUndefined();
    expect(filters.priceMax).toBeUndefined();
  });

  it("monthly and buy send rooms and budget, not dates or guests", () => {
    expect(homeSearchFilters({ ...base, deal: "monthly" })).toMatchObject({
      deal: "monthly",
      city: "tbilisi",
      checkIn: null,
      checkOut: null,
      guests: null,
      rooms: 3,
      priceMax: 900,
    });
    expect(homeSearchFilters({ ...base, deal: "buy", rooms: 0, budget: null })).toMatchObject({ deal: "buy", rooms: null, priceMax: null });
  });

  it("parses a budget from what was typed", () => {
    expect(parseBudget("250,000")).toBe(250000);
    expect(parseBudget("₪ 1 200")).toBe(1200);
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("0")).toBeNull();
    expect(parseBudget("abc")).toBeNull();
  });
});
