import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { labelHasContactInfo, publicPriceLabel } = await import("./price-label");
const { datePricesFor } = await import("./terms");

/**
 * guide-2 (round 3, phase 4 hardening): the note on a holiday price is public text, so it never
 * carries contact details (fake values below).
 */
describe("the note on a holiday price", () => {
  it("finds a phone number, a messenger link, an email or an @username, and lets holiday names through", () => {
    for (const text of ["WhatsApp +995555123456", "t.me/myhandle", "call 555 12 34 56", "host@example.com", "@myhandle"]) {
      expect(labelHasContactInfo(text), text).toBe(true);
    }
    for (const text of ["פסח", "חנוכה", "ראש השנה 2027", "Christmas", "Новый год", null, "", "  "]) {
      expect(labelHasContactInfo(text), String(text)).toBe(false);
    }
  });

  it("is dropped before guests see it when a stored row has contact details in any language", () => {
    expect(publicPriceLabel({ he: "פסח" })).toEqual({ he: "פסח" });
    expect(publicPriceLabel({ he: "פסח", en: "WhatsApp +995555123456" })).toBeNull();
    expect(publicPriceLabel("t.me/myhandle")).toBeNull();
    expect(publicPriceLabel(null)).toBeNull();
    // The quote then has no note on that line (and the price itself still applies).
    const listing = {
      currency: "GEL" as const,
      datePrices: [{ roomTypeId: null, start: "2026-12-14", end: "2026-12-16", price: 80, minNights: null, label: publicPriceLabel({ he: "WhatsApp +995555123456" }) }],
    };
    expect(datePricesFor(listing, null)).toEqual([{ start: "2026-12-14", end: "2026-12-16", price: 80, minNights: null, label: null }]);
  });
});

/**
 * price-1: a hotel's price "for every room" is in the listing's currency, and the quote skips it
 * for a room type in another currency (its minimum stay too). The save refuses it then
 * (tests/unit/date-price-actions.test.ts); this pins the quote rule it protects.
 */
describe("a price for every room of a hotel", () => {
  const listing = {
    currency: "GEL" as const,
    datePrices: [{ roomTypeId: null, start: "2026-12-14", end: "2026-12-16", price: 300, minNights: 3, label: null }],
  };
  it("applies to room types in the listing's currency only", () => {
    expect(datePricesFor(listing, { id: "std", currency: "GEL" })).toHaveLength(1);
    expect(datePricesFor(listing, { id: "usd", currency: "USD" })).toEqual([]);
  });
});
