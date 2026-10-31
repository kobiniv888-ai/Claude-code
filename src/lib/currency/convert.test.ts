import { describe, expect, it } from "vitest";
import { FALLBACK_RATES, convert, enabledCurrencies, isEnabledCurrency, normalizeRates, toUsd, type Rates } from "./convert";

const rates: Rates = { USD: 1, GEL: 2.7, ILS: 3.7, EUR: 0.92, GBP: 0.79, AED: 3.67 };

describe("convert", () => {
  it("returns the same amount for the same currency", () => {
    expect(convert(123.45, "GEL", "GEL", rates)).toBe(123.45);
  });

  it("converts through USD", () => {
    expect(toUsd(270, "GEL", rates)).toBeCloseTo(100);
    expect(convert(100, "USD", "ILS", rates)).toBeCloseTo(370);
    expect(convert(270, "GEL", "ILS", rates)).toBeCloseTo(370);
    expect(convert(370, "ILS", "EUR", rates)).toBeCloseTo(92);
  });

  it("round-trips", () => {
    expect(convert(convert(1000, "GEL", "EUR", rates), "EUR", "GEL", rates)).toBeCloseTo(1000);
  });

  it("falls back for missing or broken rates", () => {
    const broken = { USD: 1, GEL: 0, ILS: Number.NaN } as unknown as Rates;
    expect(convert(100, "USD", "GEL", broken)).toBeCloseTo(100 * FALLBACK_RATES.GEL);
    expect(convert(100, "USD", "ILS", null)).toBeCloseTo(100 * FALLBACK_RATES.ILS);
  });
});

describe("normalizeRates", () => {
  it("keeps valid numbers, fills the rest and pins USD to 1", () => {
    const out = normalizeRates({ USD: 1.2, GEL: "2.75", ILS: -1, EUR: 0.9, XYZ: 5 });
    expect(out.USD).toBe(1);
    expect(out.GEL).toBe(2.75);
    expect(out.ILS).toBe(FALLBACK_RATES.ILS);
    expect(out.EUR).toBe(0.9);
    expect(Object.keys(out).sort()).toEqual(Object.keys(FALLBACK_RATES).sort());
  });

  it("handles junk input", () => {
    expect(normalizeRates(null)).toEqual({ ...FALLBACK_RATES, USD: 1 });
  });
});

describe("enabled currencies", () => {
  it("follows siteConfig (GBP/AED are Phase 3)", () => {
    expect(enabledCurrencies).toEqual(["GEL", "USD", "ILS", "EUR"]);
    expect(isEnabledCurrency("ILS")).toBe(true);
    expect(isEnabledCurrency("GBP")).toBe(false);
    expect(isEnabledCurrency("ils")).toBe(false);
  });
});
