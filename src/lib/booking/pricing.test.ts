import { describe, expect, it } from "vitest";
import {
  cleanDatePrices,
  cleanPriceLabel,
  LONG_STAY,
  longStayDiscount,
  quoteStay,
  requiredMinNights,
  type PriceLine,
  type PricingTerms,
  type Quote,
  type StayRequest,
} from "./pricing";

/**
 * Round 3, brief 6.3 (contract 2): which price a night gets (date price → weekend price →
 * regular), the long-stay discounts (7+ / 28+ nights), the minimum stay of a date price, cents
 * rounding, hotel rooms and the guest's currency estimate.
 *
 * November 2026: Sun 1, Mon 2 (today), … Thu 12, Fri 13, Sat 14, Sun 15. December 2026: Tue 1 … Thu 24, Fri 25.
 */
const TODAY = "2026-11-02";
const context = { today: TODAY };

function quote(terms: PricingTerms, stay: Partial<StayRequest> & Pick<StayRequest, "checkIn" | "checkOut">): Quote {
  const result = quoteStay(terms, { adults: 2, ...stay }, context);
  if (!result.ok) throw new Error(`expected a quote, got ${result.error}`);
  return result.quote;
}

const sumCents = (lines: readonly PriceLine[]) => lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);

describe("which price a night gets", () => {
  const terms: PricingTerms = {
    currency: "GEL",
    nightlyPrice: 55,
    weekendPrice: 70,
    cleaningFee: 20,
    datePrices: [{ start: "2026-11-12", end: "2026-11-14", price: 80, label: { he: "חנוכה", en: "Hanukkah" } }],
  };

  it("uses a date price first, then the weekend price, then the regular price", () => {
    // Wed 11 (regular), Thu 12 (date price), Fri 13 (date price beats the weekend price), Sat 14 (weekend).
    const q = quote(terms, { checkIn: "2026-11-11", checkOut: "2026-11-15" });
    expect(q.nightly.map((n) => [n.date, n.kind, n.price, n.weekend])).toEqual([
      ["2026-11-11", "weekday", 55, false],
      ["2026-11-12", "date_price", 80, false],
      ["2026-11-13", "date_price", 80, true],
      ["2026-11-14", "weekend", 70, true],
    ]);
    expect(q.lines).toEqual([
      { kind: "weekday", nights: 1, price: 55, amount: 55 },
      { kind: "weekend", nights: 1, price: 70, amount: 70 },
      { kind: "date_price", nights: 2, price: 80, amount: 160, label: { he: "חנוכה", en: "Hanukkah" } },
      { kind: "cleaning", price: 20, amount: 20 },
    ]);
    expect(q.subtotal).toBe(285);
    expect(q.total).toBe(305);
    expect(q.discount).toBeNull();
  });

  it("reads a weekend night at the regular price when the host set no weekend price", () => {
    const q = quote({ ...terms, weekendPrice: null, datePrices: [] }, { checkIn: "2026-11-12", checkOut: "2026-11-15" });
    expect(q.nightly.map((n) => [n.kind, n.weekend])).toEqual([
      ["weekday", false],
      ["weekday", true],
      ["weekday", true],
    ]);
    expect(q.lines[0]).toEqual({ kind: "weekday", nights: 3, price: 55, amount: 165 });
  });

  it("only prices the nights inside a date price (its end is the first night NOT at that price)", () => {
    const q = quote(terms, { checkIn: "2026-11-09", checkOut: "2026-11-12" });
    expect(q.nightly.every((n) => n.kind === "weekday")).toBe(true);
    expect(q.lines.some((l) => l.kind === "date_price")).toBe(false);
  });

  it("lets the first of two overlapping date prices win (a room type's own come first)", () => {
    const q = quote(
      {
        ...terms,
        datePrices: [
          { start: "2026-11-12", end: "2026-11-13", price: 99 },
          { start: "2026-11-11", end: "2026-11-14", price: 80 },
        ],
      },
      { checkIn: "2026-11-11", checkOut: "2026-11-14" },
    );
    expect(q.nightly.map((n) => n.price)).toEqual([80, 99, 80]);
    // One line per price (in the order of their first night), no note → no label.
    expect(q.lines.filter((l) => l.kind === "date_price")).toEqual([
      { kind: "date_price", nights: 2, price: 80, amount: 160 },
      { kind: "date_price", nights: 1, price: 99, amount: 99 },
    ]);
  });

  it("joins two ranges with the same price and note into one line, and keeps different notes apart", () => {
    const q = quote(
      {
        ...terms,
        datePrices: [
          { start: "2026-11-09", end: "2026-11-10", price: 80, label: "חג" },
          { start: "2026-11-11", end: "2026-11-12", price: 80, label: "חג" },
          { start: "2026-11-12", end: "2026-11-13", price: 80, label: "אחר" },
        ],
      },
      { checkIn: "2026-11-09", checkOut: "2026-11-13" },
    );
    const special = q.lines.filter((l) => l.kind === "date_price");
    expect(special.map((l) => [l.nights, l.amount, l.label?.he])).toEqual([
      [2, 160, "חג"],
      [1, 80, "אחר"],
    ]);
  });

  it("ignores broken date prices (no price, end before start, not a day)", () => {
    expect(
      cleanDatePrices([
        { start: "2026-11-12", end: "2026-11-12", price: 80 },
        { start: "2026-11-13", end: "2026-11-12", price: 80 },
        { start: "2026-11-12", end: "2026-11-14", price: 0 },
        { start: "2026-02-30", end: "2026-03-02", price: 80 },
        { start: "2026-11-12", end: "2026-11-14", price: 80, minNights: 2.5 },
      ]),
    ).toEqual([{ start: "2026-11-12", end: "2026-11-14", price: 80, minNights: 0, label: undefined }]);
  });

  it("keeps a note short and in known languages only", () => {
    expect(cleanPriceLabel("  פסח  ")).toEqual({ he: "פסח", en: "פסח", ru: "פסח", ar: "פסח", ka: "פסח" });
    expect(cleanPriceLabel({ he: "פסח", xx: "no", en: "  " })).toEqual({ he: "פסח" });
    expect(cleanPriceLabel("   ")).toBeUndefined();
    expect(cleanPriceLabel(["פסח"])).toBeUndefined();
    expect(cleanPriceLabel("א".repeat(100))?.he).toHaveLength(60);
  });
});

describe("long-stay discounts", () => {
  const terms: PricingTerms = { currency: "GEL", nightlyPrice: 100, cleaningFee: 50, weeklyDiscountPct: 10, monthlyDiscountPct: 25 };
  const stay = (nights: number) => quote(terms, { checkIn: "2026-11-09", checkOut: addDays("2026-11-09", nights) });

  it("gives nothing for 6 nights", () => {
    const q = stay(6);
    expect(q.discount).toBeNull();
    expect(q.total).toBe(650);
    expect(q.lines.map((l) => l.kind)).toEqual(["weekday", "cleaning"]);
  });

  it("gives the weekly discount from 7 nights, off the nights only (never the cleaning fee)", () => {
    const q = stay(7);
    expect(q.discount).toEqual({ pct: 10, amount: 70, kind: "weekly" });
    expect(q.lines).toEqual([
      { kind: "weekday", nights: 7, price: 100, amount: 700 },
      { kind: "discount", pct: 10, period: "weekly", amount: -70 },
      { kind: "cleaning", price: 50, amount: 50 },
    ]);
    expect(q.subtotal).toBe(700);
    expect(q.total).toBe(680);
  });

  it("keeps the weekly discount up to 27 nights", () => {
    const q = stay(27);
    expect(q.discount).toEqual({ pct: 10, amount: 270, kind: "weekly" });
    expect(q.total).toBe(2700 - 270 + 50);
  });

  it("gives the monthly discount from 28 nights, never both", () => {
    const q = stay(28);
    expect(q.discount).toEqual({ pct: 25, amount: 700, kind: "monthly" });
    expect(q.lines.filter((l) => l.kind === "discount")).toHaveLength(1);
    expect(q.total).toBe(2800 - 700 + 50);
  });

  it("falls back to the weekly discount for 28+ nights without a monthly one, and gives none below 28 with only a monthly one", () => {
    expect(quote({ ...terms, monthlyDiscountPct: null }, { checkIn: "2026-11-09", checkOut: addDays("2026-11-09", 30) }).discount).toEqual({
      pct: 10,
      amount: 300,
      kind: "weekly",
    });
    expect(quote({ ...terms, weeklyDiscountPct: null }, { checkIn: "2026-11-09", checkOut: addDays("2026-11-09", 10) }).discount).toBeNull();
  });

  it("discounts the date-price and weekend nights too", () => {
    const q = quote(
      { ...terms, weekendPrice: 120, datePrices: [{ start: "2026-11-09", end: "2026-11-10", price: 200 }] },
      { checkIn: "2026-11-09", checkOut: "2026-11-16" },
    );
    // Mon 9 at 200, Tue–Thu 100 ×3, Fri + Sat 120 ×2, Sun 100 → 200 + 400 + 240 = 840.
    expect(q.subtotal).toBe(840);
    expect(q.discount).toEqual({ pct: 10, amount: 84, kind: "weekly" });
    expect(q.total).toBe(840 - 84 + 50);
  });

  it("never gives 28+ nights less than 7 nights would (a smaller monthly discount is ignored)", () => {
    expect(longStayDiscount(28, 15, 10)).toEqual({ pct: 15, kind: "weekly" });
    expect(longStayDiscount(28, 15, 15)).toEqual({ pct: 15, kind: "monthly" });
    expect(longStayDiscount(27, 15, 30)).toEqual({ pct: 15, kind: "weekly" });
  });

  it("ignores a percent outside 1–60 or not a whole number", () => {
    expect(LONG_STAY).toMatchObject({ weeklyNights: 7, monthlyNights: 28, minPct: 1, maxPct: 60 });
    expect(longStayDiscount(7, 0, null)).toBeNull();
    expect(longStayDiscount(7, 61, null)).toBeNull();
    expect(longStayDiscount(7, 7.5, null)).toBeNull();
    expect(longStayDiscount(7, 60, null)).toEqual({ pct: 60, kind: "weekly" });
    expect(longStayDiscount(28, 10, 0)).toEqual({ pct: 10, kind: "weekly" });
    expect(longStayDiscount(6, 10, 20)).toBeNull();
  });
});

describe("minimum stay of a date price", () => {
  const terms: PricingTerms = {
    currency: "GEL",
    nightlyPrice: 55,
    minStayNights: 2,
    datePrices: [{ start: "2026-12-24", end: "2026-12-27", price: 90, minNights: 4, label: { he: "חנוכה" } }],
  };
  const q = (checkIn: string, checkOut: string, t: Partial<PricingTerms> = {}) => quoteStay({ ...terms, ...t }, { checkIn, checkOut, adults: 1 }, context);

  it("refuses a shorter stay that has a night at that price, and says which date price", () => {
    expect(q("2026-12-25", "2026-12-27")).toEqual({
      ok: false,
      error: "min_stay",
      minNights: 4,
      datePrice: { start: "2026-12-24", end: "2026-12-27", label: { he: "חנוכה" } },
    });
    // Ends on the date price's first night: the stay has no night at that price.
    expect(q("2026-12-21", "2026-12-23").ok).toBe(true);
    expect(q("2026-12-22", "2026-12-24").ok).toBe(true);
    // One night inside is enough to need the minimum.
    expect(q("2026-12-23", "2026-12-25")).toMatchObject({ ok: false, error: "min_stay", minNights: 4 });
  });

  it("accepts a stay as long as the minimum, and reports the minimum it met", () => {
    const result = q("2026-12-22", "2026-12-26");
    expect(result.ok && result.quote.minNights).toBe(4);
    expect(result.ok && result.quote.total).toBe(55 * 2 + 90 * 2);
  });

  it("keeps the listing's minimum when it is the longer one", () => {
    expect(q("2026-12-24", "2026-12-27", { minStayNights: 5 })).toEqual({ ok: false, error: "min_stay", minNights: 5 });
    expect(requiredMinNights(5, terms.datePrices, "2026-12-24", "2026-12-27")).toEqual({ minNights: 5 });
    expect(requiredMinNights(null, [], "2026-12-24", "2026-12-25")).toEqual({ minNights: 1 });
  });
});

describe("money", () => {
  it("rounds to cents and the lines always add up to the total", () => {
    const q = quote({ currency: "GEL", nightlyPrice: 33.33, cleaningFee: 12.5, weeklyDiscountPct: 10 }, { checkIn: "2026-11-09", checkOut: "2026-11-16" });
    // 7 × 33.33 = 233.31; 10% = 23.331 → 23.33.
    expect(q.subtotal).toBe(233.31);
    expect(q.discount).toEqual({ pct: 10, amount: 23.33, kind: "weekly" });
    expect(q.total).toBe(222.48);
    expect(sumCents(q.lines)).toBe(Math.round(q.total * 100));
  });

  it("rounds a half cent of discount up and avoids float errors", () => {
    const q = quote({ currency: "USD", nightlyPrice: 19.99, weeklyDiscountPct: 15 }, { checkIn: "2026-11-09", checkOut: "2026-11-16" });
    // 7 × 19.99 = 139.93; 15% = 20.9895 → 20.99.
    expect(q.subtotal).toBe(139.93);
    expect(q.discount?.amount).toBe(20.99);
    expect(q.total).toBe(118.94);
    expect(sumCents(q.lines)).toBe(11894);
  });

  it("prices every night and the cleaning fee once per room for hotels", () => {
    const q = quote(
      { currency: "GEL", nightlyPrice: 120, weekendPrice: 150, cleaningFee: 15, weeklyDiscountPct: 5, rooms: 2 },
      { checkIn: "2026-11-09", checkOut: "2026-11-16" },
    );
    expect(q.rooms).toBe(2);
    expect(q.lines).toEqual([
      { kind: "weekday", nights: 5, price: 120, amount: 1200, rooms: 2 },
      { kind: "weekend", nights: 2, price: 150, amount: 600, rooms: 2 },
      { kind: "discount", pct: 5, period: "weekly", amount: -90 },
      { kind: "cleaning", price: 15, amount: 30, rooms: 2 },
    ]);
    expect(q.cleaningFee).toBe(30);
    expect(q.total).toBe(1800 - 90 + 30);
    // One room (the default) carries no `rooms` on its lines.
    expect(quote({ currency: "GEL", nightlyPrice: 120 }, { checkIn: "2026-11-09", checkOut: "2026-11-10" }).lines[0]).not.toHaveProperty("rooms");
  });

  it("adds an estimate in the guest's display currency, rounded to cents, and none in the host's own currency", () => {
    const terms: PricingTerms = { currency: "GEL", nightlyPrice: 100, cleaningFee: 50, weeklyDiscountPct: 10 };
    const stay = { checkIn: "2026-11-09", checkOut: "2026-11-16", adults: 1 };
    const result = quoteStay(terms, stay, { ...context, displayCurrency: "ILS", rates: { USD: 1, GEL: 2.7, ILS: 3.7 } });
    expect(result.ok && result.quote.total).toBe(680);
    // 680 GEL → 251.85… USD → 931.85 ILS.
    expect(result.ok && result.quote.display).toEqual({ currency: "ILS", total: 931.85 });
    const same = quoteStay(terms, stay, { ...context, displayCurrency: "GEL" });
    expect(same.ok && same.quote.display).toBeNull();
  });
});

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
