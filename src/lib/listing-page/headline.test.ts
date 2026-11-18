import { describe, expect, it } from "vitest";
import { cheapestRoomType, headlinePlan } from "./headline";

const base = { price: 100, pricePeriod: "NIGHT" as const, priceIsFrom: false, sizeSqm: null };

describe("headlinePlan (main price under the title)", () => {
  it("sales: the full price and the price per m²", () => {
    expect(headlinePlan({ ...base, dealType: "SALE", price: 185_000, pricePeriod: "TOTAL", sizeSqm: 70 })).toEqual({ period: "TOTAL", perSqm: 2643, stayTotal: false });
    expect(headlinePlan({ ...base, dealType: "SALE", price: 185_000, pricePeriod: "TOTAL", sizeSqm: null }).perSqm).toBeNull();
  });
  it("monthly rentals: per month", () => {
    expect(headlinePlan({ ...base, dealType: "MONTHLY_RENT", price: 900, pricePeriod: "MONTH" })).toEqual({ period: "MONTH", perSqm: null, stayTotal: false });
  });
  it("short stays and hotels: per night, with the total once dates are chosen (not for 'from' prices)", () => {
    expect(headlinePlan({ ...base, dealType: "SHORT_STAY" })).toEqual({ period: "NIGHT", perSqm: null, stayTotal: true });
    expect(headlinePlan({ ...base, dealType: "HOTEL_ROOM", priceIsFrom: true }).stayTotal).toBe(false);
    expect(headlinePlan({ ...base, dealType: "SHORT_STAY", pricePeriod: "WEEK" })).toEqual({ period: "WEEK", perSqm: null, stayTotal: false });
  });
});

describe("cheapestRoomType (a hotel's 'from' price)", () => {
  it("compares the value, not the number, when room types use different currencies", () => {
    const rooms = [
      { id: "suite", price: 120, priceUsd: 120 }, // $120
      { id: "double", price: 190, priceUsd: 70.37 }, // ₾190
      { id: "family", price: 280, priceUsd: 103.7 }, // ₾280
    ];
    expect(cheapestRoomType(rooms)?.id).toBe("double");
  });
  it("skips rooms without a price; rooms without a USD value come last", () => {
    expect(cheapestRoomType([{ id: "a", price: 0, priceUsd: 1 }, { id: "b", price: 50, priceUsd: null }, { id: "c", price: 90, priceUsd: 33 }])?.id).toBe("c");
    expect(cheapestRoomType([{ id: "a", price: 80, priceUsd: null }, { id: "b", price: 60, priceUsd: null }])?.id).toBe("b");
    expect(cheapestRoomType([{ id: "a", price: null, priceUsd: null }])).toBeNull();
  });
});
