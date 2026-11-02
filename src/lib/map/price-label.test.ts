import { describe, expect, it } from "vitest";
import type { CurrencyCode } from "@/config/site";
import { formatMoney, type FormatMoneyOptions } from "@/lib/format";
import { PILL_COMPACT_FROM, pricePillLabel, type PillMoney } from "./price-label";

/** Display currency ILS at fixed demo rates (1 USD = 3.7 ILS, 1 GEL = 1.35 ILS). */
const RATES: Partial<Record<CurrencyCode, number>> = { ILS: 1, USD: 3.7, GEL: 1.35 };
const money = (locale: "en" | "he"): PillMoney => ({
  convert: (amount, from) => amount * (RATES[from] ?? 1),
  format: (amount, from, options?: FormatMoneyOptions) => formatMoney(amount * (RATES[from] ?? 1), "ILS", locale, options),
});

describe("price pill label", () => {
  it("shows the price in the display currency, without decimals", () => {
    expect(pricePillLabel(450, "ILS", money("en"), "On request")).toBe("₪450");
    expect(pricePillLabel(100, "USD", money("en"), "On request")).toBe("₪370");
    expect(pricePillLabel(6200, "ILS", money("en"), "On request")).toBe("₪6,200");
  });

  it("shortens large amounts after converting them", () => {
    expect(pricePillLabel(1_234_567, "ILS", money("en"), "On request")).toBe("₪1.2M");
    // 80,000 USD is 296,000 ILS: shortened although the owner's number is below the limit.
    expect(pricePillLabel(80_000, "USD", money("en"), "On request")).toBe("₪296K");
    expect(pricePillLabel(PILL_COMPACT_FROM - 1, "ILS", money("en"), "On request")).toBe("₪99,999");
  });

  it("uses Western digits in Hebrew", () => {
    expect(pricePillLabel(450, "ILS", money("he"), "לפי בקשה")).toMatch(/450/);
  });

  it("says 'on request' without a price", () => {
    expect(pricePillLabel(null, "ILS", money("en"), "On request")).toBe("On request");
    expect(pricePillLabel(0, "ILS", money("en"), "On request")).toBe("On request");
    expect(pricePillLabel(Number.NaN, "ILS", money("en"), "On request")).toBe("On request");
  });
});
