import { describe, expect, it } from "vitest";
import { baselinePrice, comparablePrice, median, MIN_PRICE_SAMPLES, priceBasis, referencePrice } from "./price";

describe("comparablePrice", () => {
  it("uses one basis per deal type", () => {
    expect(priceBasis("SHORT_STAY")).toBe("night");
    expect(priceBasis("HOTEL_ROOM")).toBe("night");
    expect(priceBasis("MONTHLY_RENT")).toBe("month");
    expect(priceBasis("SALE")).toBe("sqm");
  });

  it("converts periods", () => {
    const base = { pricePerSqmUsd: null };
    expect(comparablePrice({ ...base, dealType: "SHORT_STAY", pricePeriod: "NIGHT", priceUsd: 70 })).toBe(70);
    expect(comparablePrice({ ...base, dealType: "SHORT_STAY", pricePeriod: "WEEK", priceUsd: 350 })).toBe(50);
    expect(comparablePrice({ ...base, dealType: "SHORT_STAY", pricePeriod: "MONTH", priceUsd: 900 })).toBe(30);
    expect(comparablePrice({ ...base, dealType: "MONTHLY_RENT", pricePeriod: "MONTH", priceUsd: 600 })).toBe(600);
    expect(comparablePrice({ ...base, dealType: "MONTHLY_RENT", pricePeriod: "NIGHT", priceUsd: 20 })).toBe(600);
    expect(comparablePrice({ ...base, dealType: "MONTHLY_RENT", pricePeriod: "TOTAL", priceUsd: 600 })).toBeNull();
    expect(comparablePrice({ dealType: "SALE", pricePeriod: "TOTAL", priceUsd: 100_000, pricePerSqmUsd: 1250 })).toBe(1250);
    expect(comparablePrice({ dealType: "SALE", pricePeriod: "TOTAL", priceUsd: 100_000, pricePerSqmUsd: null })).toBeNull();
    expect(comparablePrice({ ...base, dealType: "SHORT_STAY", pricePeriod: "NIGHT", priceUsd: null })).toBeNull();
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(median([0, -1, NaN])).toBeNull();
  });
});

describe("referencePrice", () => {
  const sample = (propertyType: "APARTMENT" | "ROOM" | "VILLA", value: number) => ({ propertyType, value });

  it("prefers the same property type with enough samples", () => {
    const samples = [...Array.from({ length: MIN_PRICE_SAMPLES }, (_, i) => sample("VILLA", 300 + i)), sample("APARTMENT", 50)];
    expect(referencePrice(samples, "VILLA", 40)).toMatchObject({ source: "property_type", value: 302 });
  });

  it("falls back to the deal type, then to the baseline table", () => {
    const samples = [sample("APARTMENT", 60), sample("APARTMENT", 80), sample("VILLA", 200), sample("APARTMENT", 70), sample("APARTMENT", 90)];
    expect(referencePrice(samples, "VILLA", 40)).toMatchObject({ source: "deal_type", value: 80 });
    expect(referencePrice(samples.slice(0, 3), "VILLA", 40)).toEqual({ source: "baseline", value: 40, samples: 0 });
  });

  it("never compares rooms with whole apartments", () => {
    const samples = Array.from({ length: 6 }, () => sample("APARTMENT", 600));
    expect(referencePrice(samples, "ROOM", 175)).toMatchObject({ source: "baseline", value: 175 });
  });

  it("has a baseline for every starting city and halves it for rooms", () => {
    expect(baselinePrice("tbilisi", "MONTHLY_RENT", "APARTMENT")).toBe(550);
    expect(baselinePrice("tbilisi", "MONTHLY_RENT", "ROOM")).toBe(275);
    expect(baselinePrice("unknown-city", "SHORT_STAY", "APARTMENT")).toBe(30);
    expect(baselinePrice(null, "SALE", "HOUSE")).toBe(500);
  });
});
