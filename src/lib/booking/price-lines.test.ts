import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { formatMoney, formatNumber } from "@/lib/format";
import { bookingPriceLines, describePriceLine, formatBookingMoney, parsePriceLines, priceLineAmount, type StoredBookingPrice } from "./price-lines";
import { quoteStay, type PriceLine } from "./pricing";

/**
 * The itemized lines after booking (Booking.priceLines → trip page, emails, host and admin pages)
 * and their words in every language (round 3, brief 6.3: "₾55 × 3 לילות", "₾80 × 2 לילות (חג)",
 * "הנחה לשבוע −10%", "דמי ניקיון").
 */
function words(locale: string) {
  const file = path.join(process.cwd(), "messages", locale, "booking.json");
  const messages = { booking: JSON.parse(fs.readFileSync(file, "utf8")) };
  const errors: unknown[] = [];
  const t = createTranslator({ locale, messages, namespace: "booking.price", onError: (e) => errors.push(e) });
  const say = (line: PriceLine, currency: "GEL" | "USD" = "GEL") =>
    describePriceLine(line, (key, values) => t(key as never, values as never), {
      money: (amount) => formatMoney(amount, currency, locale),
      number: (value) => formatNumber(value, locale),
      locale,
    });
  return { say, errors };
}

/** Without the bidi isolates (U+2066–U+2069), to compare the visible text. */
const plain = (text: string) => text.replace(/[⁦-⁩]/g, "");

describe("the words of each line", () => {
  it("says every kind of line in Hebrew like the brief", () => {
    const { say, errors } = words("he");
    expect(plain(say({ kind: "weekday", nights: 3, price: 55, amount: 165 }))).toBe("₾55 × 3 לילות");
    expect(plain(say({ kind: "weekend", nights: 2, price: 70, amount: 140 }))).toBe("₾70 × שני לילות (שישי ושבת)");
    expect(plain(say({ kind: "date_price", nights: 2, price: 80, amount: 160, label: { he: "חג" } }))).toBe("₾80 × שני לילות (חג)");
    expect(plain(say({ kind: "date_price", nights: 2, price: 80, amount: 160 }))).toBe("₾80 × שני לילות במחיר מיוחד");
    expect(plain(say({ kind: "discount", pct: 10, period: "weekly", amount: -33 }))).toBe("הנחה לשבוע −10%");
    expect(plain(say({ kind: "discount", pct: 15, period: "monthly", amount: -90 }))).toBe("הנחה לחודש −15%");
    expect(plain(say({ kind: "discount", amount: -33 }))).toBe("הנחה לשהייה ארוכה");
    expect(plain(say({ kind: "cleaning", price: 20, amount: 20 }))).toBe("דמי ניקיון");
    expect(plain(say({ kind: "weekday", nights: 5, price: 120, amount: 1200, rooms: 2 }))).toBe("₾120 × 5 לילות × שני חדרים");
    expect(plain(say({ kind: "cleaning", price: 15, amount: 30, rooms: 2 }))).toBe("דמי ניקיון (₾15 × שני חדרים)");
    expect(errors).toEqual([]);
  });

  it("isolates the amounts and the host's note, so they keep their direction inside a sentence", () => {
    const { say } = words("he");
    const text = say({ kind: "date_price", nights: 2, price: 80, amount: 160, label: { he: "Hanukkah" } });
    expect(text).toContain("⁦₾80⁩");
    expect(text).toContain("⁨Hanukkah⁩");
  });

  it("has every line in all five languages, with Western digits", () => {
    const lines: PriceLine[] = [
      { kind: "weekday", nights: 3, price: 55, amount: 165 },
      { kind: "weekend", nights: 1, price: 70, amount: 70 },
      { kind: "date_price", nights: 2, price: 80, amount: 160, label: { he: "פסח", en: "Passover" } },
      { kind: "date_price", nights: 21, price: 80, amount: 1680 },
      { kind: "discount", pct: 10, period: "weekly", amount: -33 },
      { kind: "discount", pct: 25, period: "monthly", amount: -500 },
      { kind: "cleaning", price: 15, amount: 45, rooms: 3 },
    ];
    for (const locale of ["he", "en", "ru", "ar", "ka"]) {
      const { say, errors } = words(locale);
      for (const line of lines) {
        const text = say(line);
        expect(text.length).toBeGreaterThan(3);
        expect(text).not.toMatch(/[٠-٩۰-۹]/);
        expect(text).not.toMatch(/\{|\}/);
      }
      expect(errors).toEqual([]);
    }
    expect(plain(words("en").say(lines[2]))).toBe("₾80 × 2 nights (Passover)");
    expect(plain(words("ru").say(lines[3]))).toBe(`${formatMoney(80, "GEL", "ru")} × 21 ночь по особой цене`);
  });

  it("shows booking amounts exact to the cent (a discounted total never reads rounded)", () => {
    expect(formatBookingMoney(519.5, "USD", "he")).toBe("$519.50");
    expect(formatBookingMoney(55.5, "USD", "en")).toBe("$55.50");
    expect(formatBookingMoney(375, "USD", "he")).toBe("$375");
    expect(formatBookingMoney(1234.56, "GEL", "en")).toBe("₾1,234.56");
    expect(formatBookingMoney(99.999, "GEL", "en")).toBe("₾100");
    expect(formatBookingMoney(519.5, "USD", "ar")).not.toMatch(/[٠-٩]/);
  });

  it("shows the discount amount with a minus sign", () => {
    const money = (amount: number) => formatMoney(amount, "GEL", "he");
    expect(priceLineAmount({ kind: "discount", pct: 10, amount: -33 }, money)).toBe(`−${money(33)}`);
    expect(priceLineAmount({ kind: "cleaning", amount: 20 }, money)).toBe(money(20));
  });
});

describe("stored lines", () => {
  const quote = quoteStay(
    { currency: "GEL", nightlyPrice: 55, weekendPrice: 70, cleaningFee: 20, weeklyDiscountPct: 10, datePrices: [{ start: "2026-11-10", end: "2026-11-12", price: 80, label: "חג" }] },
    { checkIn: "2026-11-09", checkOut: "2026-11-16", adults: 2 },
    { today: "2026-11-02" },
  );
  if (!quote.ok) throw new Error(quote.error);
  const booking: StoredBookingPrice = {
    checkIn: "2026-11-09",
    checkOut: "2026-11-16",
    nights: 7,
    nightlyPrice: 55,
    weekendPrice: 70,
    subtotal: quote.quote.subtotal,
    cleaningFee: 20,
    discount: quote.quote.discount?.amount ?? null,
    total: quote.quote.total,
    priceLines: JSON.parse(JSON.stringify(quote.quote.lines)),
  };

  it("shows the lines the guest confirmed, as they were stored", () => {
    expect(bookingPriceLines(booking)).toEqual(quote.quote.lines);
  });

  it("never trusts stored JSON: anything that is not a valid line is dropped as a whole", () => {
    expect(parsePriceLines(null)).toBeNull();
    expect(parsePriceLines([])).toBeNull();
    expect(parsePriceLines([{ kind: "weekday", amount: "165" }])).toBeNull();
    expect(parsePriceLines([{ kind: "tip", amount: 5 }])).toBeNull();
    expect(parsePriceLines([{ kind: "weekday", nights: 3, price: 55, amount: 165, label: { he: "<b>x</b>", zz: "no" }, extra: true }])).toEqual([
      { kind: "weekday", nights: 3, price: 55, amount: 165, label: { he: "<b>x</b>" } },
    ]);
  });

  it("rebuilds the lines of an older booking from its copied prices (no stored lines)", () => {
    // Mon 9 – Sun 16 Nov: 5 weekday nights at 55, Fri + Sat at 70, cleaning 20.
    const old = bookingPriceLines({ ...booking, subtotal: 415, discount: null, total: 435, priceLines: null });
    expect(old).toEqual([
      { kind: "weekday", nights: 5, price: 55, amount: 275 },
      { kind: "weekend", nights: 2, price: 70, amount: 140 },
      { kind: "cleaning", amount: 20 },
    ]);
  });

  it("falls back to one nights line when stored lines or prices do not add up to the total", () => {
    const lines = bookingPriceLines({ ...booking, subtotal: 500, discount: 50, total: 470, priceLines: [{ kind: "weekday", nights: 7, price: 55, amount: 385 }] });
    expect(lines).toEqual([
      { kind: "weekday", nights: 7, amount: 500 },
      { kind: "discount", amount: -50 },
      { kind: "cleaning", amount: 20 },
    ]);
    expect(lines.reduce((sum, l) => sum + l.amount, 0)).toBe(470);
    // Such a line has no per-night price: it reads "7 nights".
    expect(plain(words("en").say(lines[0]))).toBe("7 nights");
  });
});
