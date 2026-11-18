import { describe, expect, it } from "vitest";
import { PRICE_PERIODS_BY_DEAL } from "@/lib/wizard/schemas";
import { ALERT_PERIOD_BY_DEAL, ALERT_PRICE_SELECT, headlineAlertPrice, type AlertPriceRow } from "./alert-price";

const row = (overrides: Partial<AlertPriceRow> = {}): AlertPriceRow => ({
  dealType: "SHORT_STAY",
  price: 120,
  currency: "GEL",
  pricePeriod: "NIGHT",
  roomTypes: [],
  ...overrides,
});

describe("headlineAlertPrice (lists-alerts-6/7)", () => {
  it("watches the listing's own price in its deal type's period", () => {
    expect(headlineAlertPrice(row())).toEqual({ amount: 120, currency: "GEL", period: "NIGHT", fromRoom: false });
    expect(headlineAlertPrice(row({ dealType: "MONTHLY_RENT", price: 1500, pricePeriod: "MONTH" }))).toMatchObject({ amount: 1500, period: "MONTH" });
    expect(headlineAlertPrice(row({ dealType: "SALE", price: 95_000, currency: "USD", pricePeriod: "TOTAL" }))).toMatchObject({ amount: 95_000, period: "TOTAL" });
  });

  it("watches nothing for a price in another period (a week price is not compared with a night price)", () => {
    expect(headlineAlertPrice(row({ price: 700, pricePeriod: "WEEK" }))).toBeNull();
    // Even with a room type: the card shows the listing's own (weekly) price.
    expect(headlineAlertPrice(row({ price: 700, pricePeriod: "WEEK", roomTypes: [{ price: 90, currency: "GEL" }] }))).toBeNull();
  });

  it("hotels: the cheapest active per-night room type, marked as a 'from' price", () => {
    expect(headlineAlertPrice(row({ dealType: "HOTEL_ROOM", price: null, roomTypes: [{ price: 150, currency: "GEL" }] }))).toEqual({
      amount: 150,
      currency: "GEL",
      period: "NIGHT",
      fromRoom: true,
    });
    expect(headlineAlertPrice(row({ dealType: "HOTEL_ROOM", price: null, roomTypes: [] }))).toBeNull();
    // Rooms are only read for the per-night deal types.
    expect(headlineAlertPrice(row({ dealType: "MONTHLY_RENT", price: null, pricePeriod: "MONTH", roomTypes: [{ price: 150, currency: "GEL" }] }))).toBeNull();
  });

  it("reads only active, priced, per-night room types, cheapest first", () => {
    expect(ALERT_PRICE_SELECT.roomTypes.where).toEqual({ active: true, price: { gt: 0 }, pricePeriod: "NIGHT" });
    expect(ALERT_PRICE_SELECT.roomTypes.orderBy[0]).toEqual({ priceUsd: { sort: "asc", nulls: "last" } });
    expect(ALERT_PERIOD_BY_DEAL).toEqual({ SHORT_STAY: "NIGHT", HOTEL_ROOM: "NIGHT", MONTHLY_RENT: "MONTH", SALE: "TOTAL" });
    // Each deal type's default price period (the wizard's first choice).
    for (const [deal, period] of Object.entries(ALERT_PERIOD_BY_DEAL)) expect(PRICE_PERIODS_BY_DEAL[deal as keyof typeof PRICE_PERIODS_BY_DEAL][0]).toBe(period);
  });
});
