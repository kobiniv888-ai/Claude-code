import { describe, expect, it } from "vitest";
import { headlinePlan } from "./headline";

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
