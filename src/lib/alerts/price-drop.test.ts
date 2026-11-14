import { describe, expect, it } from "vitest";
import { PRICE_DROP_MAX_PCT, PRICE_DROP_MIN_PCT, REBASE_AFTER_DAYS, dropPercent, priceDropDecision } from "./price-drop";

const now = new Date("2026-11-09T07:30:00Z");
const editedToday = new Date("2026-11-09T06:00:00Z");
const editedLongAgo = new Date(now.getTime() - (REBASE_AFTER_DAYS + 1) * 86_400_000);

function decide(alertPrice: number | null, alertCurrency: "GEL" | "USD" | null, current: { amount: number; currency: "GEL" | "USD" } | null, editedAt = editedToday) {
  return priceDropDecision({ alertPrice, alertCurrency, current, editedAt, now });
}

describe("the price-drop rule", () => {
  it("emails a real drop in the same currency and moves the alert price down", () => {
    expect(decide(100, "GEL", { amount: 90, currency: "GEL" })).toEqual({
      kind: "drop",
      from: { amount: 100, currency: "GEL" },
      to: { amount: 90, currency: "GEL" },
      pct: 10,
    });
  });

  it("needs at least 3%", () => {
    expect(decide(100, "GEL", { amount: 97.5, currency: "GEL" })).toEqual({ kind: "none" });
    expect(decide(100, "GEL", { amount: 100 - PRICE_DROP_MIN_PCT, currency: "GEL" })).toMatchObject({ kind: "drop", pct: 3 });
  });

  it("does nothing on a rise or the same price (the alert price stays where the guest saw it)", () => {
    expect(decide(100, "USD", { amount: 120, currency: "USD" })).toEqual({ kind: "none" });
    expect(decide(100, "USD", { amount: 100, currency: "USD" })).toEqual({ kind: "none" });
  });

  it("never compares across currencies: the new price becomes the alert price, without an email", () => {
    expect(decide(100, "USD", { amount: 200, currency: "GEL" })).toEqual({ kind: "rebase", to: { amount: 200, currency: "GEL" }, reason: "currency_changed" });
    expect(decide(100, "USD", { amount: 20, currency: "GEL" })).toMatchObject({ kind: "rebase", reason: "currency_changed" });
  });

  it("treats a drop of more than half as a changed period or a mistake: no email", () => {
    // Per week → per night (700 → 110): not a sale.
    expect(decide(700, "USD", { amount: 110, currency: "USD" })).toEqual({ kind: "none" });
    expect(decide(100, "USD", { amount: 100 - PRICE_DROP_MAX_PCT, currency: "USD" })).toMatchObject({ kind: "drop", pct: 50 });
    // Once the listing has not been edited for a few days, it becomes the new alert price.
    expect(decide(700, "USD", { amount: 110, currency: "USD" }, editedLongAgo)).toEqual({ kind: "rebase", to: { amount: 110, currency: "USD" }, reason: "too_large" });
  });

  it("starts watching places saved without an alert price", () => {
    expect(decide(null, null, { amount: 80, currency: "GEL" })).toEqual({ kind: "rebase", to: { amount: 80, currency: "GEL" }, reason: "no_alert_price" });
    expect(decide(80, null, { amount: 60, currency: "GEL" })).toMatchObject({ kind: "rebase", reason: "no_alert_price" });
  });

  it("does nothing without a current price", () => {
    expect(decide(100, "GEL", null)).toEqual({ kind: "none" });
    expect(decide(100, "GEL", { amount: 0, currency: "GEL" })).toEqual({ kind: "none" });
  });

  it("reads Prisma decimals", () => {
    const decimal = { toString: () => "150.00" };
    expect(priceDropDecision({ alertPrice: decimal, alertCurrency: "GEL", current: { amount: 135, currency: "GEL" }, editedAt: editedToday, now })).toMatchObject({ kind: "drop", pct: 10 });
  });

  it("computes the percentage", () => {
    expect(dropPercent(200, 150)).toBe(25);
    expect(dropPercent(200, 250)).toBe(0);
    expect(dropPercent(0, 10)).toBe(0);
  });
});
