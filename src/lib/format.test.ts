import { describe, expect, it } from "vitest";
import { locales } from "@/config/site";
import {
  formatArea,
  formatDate,
  formatDateRange,
  formatMoney,
  formatNumber,
  formatRelativeTime,
  formatTime,
  isolate,
  isolateLtr,
} from "./format";

/** Arabic-Indic (U+0660–0669), Extended Arabic-Indic (U+06F0–06F9) and other non-Western digits. */
const NON_WESTERN_DIGITS = /[٠-٩۰-۹०-९]/;
const digitsOnly = (s: string) => s.replace(/[^\p{Nd}]/gu, "");

describe("Western digits everywhere", () => {
  const date = new Date("2026-10-31T14:05:00Z");
  for (const locale of ["ar", "he"] as const) {
    it(`${locale}: numbers, money, dates and times use 0-9 only`, () => {
      const outputs = [
        formatNumber(1234567.89, locale),
        formatMoney(1250, "USD", locale),
        formatMoney(1250000, "ILS", locale, { compact: true }),
        formatArea(85, locale),
        formatDate(date, locale),
        formatDate(date, locale, { dateStyle: "full" }),
        formatTime(date, locale),
        formatDateRange("2026-10-01", "2026-10-05", locale),
        formatRelativeTime(new Date("2026-10-28T14:05:00Z"), locale, date),
      ];
      for (const out of outputs) {
        expect(out).not.toMatch(NON_WESTERN_DIGITS);
        expect(digitsOnly(out)).toMatch(/^[0-9]*$/);
      }
    });
  }
});

describe("formatMoney", () => {
  it("shows ₾ for GEL in every language", () => {
    for (const locale of locales) {
      const out = formatMoney(1250, "GEL", locale);
      expect(out).toContain("₾");
      expect(out).not.toContain("GEL");
      expect(out).not.toContain("ლ");
    }
  });

  it("uses the plain symbols $ ₪ € £ (not US$ / UK£)", () => {
    expect(formatMoney(100, "USD", "ar")).toContain("$");
    expect(formatMoney(100, "USD", "ar")).not.toContain("US$");
    expect(formatMoney(100, "GBP", "ar")).not.toContain("UK£");
    expect(formatMoney(100, "ILS", "he")).toContain("₪");
    expect(formatMoney(100, "EUR", "ru")).toContain("€");
  });

  it("writes Hebrew and Arabic amounts one way, symbol first, with no direction marks", () => {
    expect(formatMoney(290, "USD", "he")).toBe("$290");
    expect(formatMoney(1250, "ILS", "he")).toBe("₪1,250");
    expect(formatMoney(1250000, "ILS", "he", { compact: true })).toBe("₪1.3M");
    expect(formatMoney(-40, "GEL", "he")).toBe("-₾40");
    expect(formatMoney(290, "USD", "ar")).toBe("$290");
    expect(formatMoney(12.5, "USD", "he")).toBe("$12.50");
  });

  it("drops decimals from 100 up and for whole numbers", () => {
    expect(formatMoney(1250.75, "USD", "en")).toBe("$1,251");
    expect(formatMoney(45, "USD", "en")).toBe("$45");
    expect(formatMoney(45.5, "USD", "en")).toBe("$45.50");
    expect(formatMoney(45.5, "USD", "en", { maximumFractionDigits: 0 })).toBe("$46");
  });

  it("supports a compact form", () => {
    expect(formatMoney(1_250_000, "USD", "en", { compact: true })).toBe("$1.3M");
  });

  it("returns an empty string for non-numbers", () => {
    expect(formatMoney(Number.NaN, "USD", "en")).toBe("");
  });
});

describe("formatArea", () => {
  it("adds the square-meter unit in each language", () => {
    expect(formatArea(85, "en")).toBe("85 m²");
    expect(formatArea(85, "he")).toBe("85 מ״ר");
    expect(formatArea(85, "ru")).toBe("85 м²");
    expect(formatArea(1200, "en")).toBe("1,200 m²");
  });
});

describe("dates", () => {
  it("formats in Georgia time by default", () => {
    // 22:30 UTC is already the next day in Tbilisi (UTC+4).
    expect(formatDate(new Date("2026-10-31T22:30:00Z"), "en")).toBe("Nov 1, 2026");
  });

  it("keeps calendar dates (YYYY-MM-DD) on the same day", () => {
    expect(formatDate("2026-10-31", "en")).toBe("Oct 31, 2026");
    expect(formatDate("2026-10-31", "en", { timeZone: "America/Los_Angeles" })).toBe("Oct 30, 2026");
  });

  it("formats times in a given zone", () => {
    const date = new Date("2026-10-31T14:05:00Z");
    expect(formatTime(date, "he")).toBe("18:05");
    expect(formatTime(date, "he", "Asia/Jerusalem")).toBe("16:05");
  });

  it("formats ranges and swaps reversed ends", () => {
    const spaces = (s: string) => s.replace(/\s/g, " ");
    expect(spaces(formatDateRange("2026-10-01", "2026-10-05", "en"))).toBe("Oct 1 – 5, 2026");
    expect(spaces(formatDateRange("2026-10-05", "2026-10-01", "en"))).toBe("Oct 1 – 5, 2026");
  });

  it("formats relative times", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(formatRelativeTime(new Date("2026-10-28T12:00:00Z"), "en", now)).toBe("3 days ago");
    expect(formatRelativeTime(new Date("2026-10-31T11:59:40Z"), "en", now)).toBe("now");
    expect(formatRelativeTime(new Date("2026-10-31T14:00:00Z"), "en", now)).toBe("in 2 hours");
    expect(formatRelativeTime(new Date("2026-10-30T12:00:00Z"), "en", now)).toBe("yesterday");
  });

  it("Hebrew relative times never show the count in brackets (newer CLDR: 'לפני שעתיים (2)')", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const ago = (ms: number) => formatRelativeTime(new Date(now.getTime() - ms), "he", now);
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    expect(ago(MIN)).toBe("לפני דקה");
    expect(ago(HOUR)).toBe("לפני שעה");
    expect(ago(2 * HOUR)).toBe("לפני שעתיים");
    expect(ago(14 * DAY)).toBe("לפני שבועיים");
    expect(ago(62 * DAY)).toBe("לפני חודשיים");
    expect(ago(-HOUR)).toBe("בעוד שעה");
    // The plain plural form is unchanged.
    expect(ago(95 * DAY)).toBe("לפני 3 חודשים");
    for (const ms of [MIN, HOUR, 2 * HOUR, 7 * DAY, 14 * DAY, 62 * DAY, 400 * DAY]) expect(ago(ms)).not.toMatch(/\(\d+\)/);
  });

  it("isolates names and signed numbers inside translated sentences", () => {
    expect(isolate("Demo Admin")).toBe("\u2068Demo Admin\u2069");
    expect(isolateLtr("+15")).toBe("\u2066+15\u2069");
  });

  it("returns an empty string for invalid dates", () => {
    expect(formatDate("not a date", "en")).toBe("");
  });
});
