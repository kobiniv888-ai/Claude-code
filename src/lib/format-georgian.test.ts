import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatMoney, formatNumber, formatRelativeTime, formatTime } from "./format";
import { georgianRelativeTime, isGeorgianLocale, zonedDayInfo } from "./format-georgian";

const NBSP = " ";

describe("Georgian formatting (same output with or without Georgian Intl data)", () => {
  it("recognizes Georgian locale tags", () => {
    expect(isGeorgianLocale("ka")).toBe(true);
    expect(isGeorgianLocale("ka-GE")).toBe(true);
    expect(isGeorgianLocale("kab")).toBe(false);
    expect(isGeorgianLocale("en")).toBe(false);
  });

  it("formats numbers and money with Georgian separators and symbol placement", () => {
    expect(formatNumber(1234567.5, "ka")).toBe(`1${NBSP}234${NBSP}567,5`);
    expect(formatMoney(12500, "USD", "ka")).toBe(`12${NBSP}500${NBSP}$`);
    expect(formatMoney(75, "GEL", "ka")).toBe(`75${NBSP}₾`);
  });

  it("uses Georgian compact suffixes", () => {
    expect(formatMoney(1_300_000, "USD", "ka", { compact: true })).toBe(`1,3${NBSP}მლნ.${NBSP}$`);
    expect(formatNumber(450_000, "ka", { notation: "compact" })).toBe(`450${NBSP}ათ.`);
    expect(formatNumber(3e9, "ka", { notation: "compact" })).toBe(`3${NBSP}მლრდ.`);
  });

  it("formats dates with Georgian month and weekday names", () => {
    expect(formatDate("2026-10-01", "ka")).toBe("1 ოქტ 2026");
    expect(formatDate("2026-10-01", "ka", { day: "numeric", month: "long" })).toBe("1 ოქტომბერი");
    expect(formatDate("2026-10-01", "ka", { weekday: "long", day: "numeric", month: "long" })).toBe(
      "ხუთშაბათი 1 ოქტომბერი",
    );
    expect(formatDate("2026-10-03", "ka", { weekday: "short" })).toBe("შაბ");
  });

  it("uses the requested time zone for the day name", () => {
    // 22:30 UTC on Friday is already Saturday in Tbilisi (UTC+4).
    expect(zonedDayInfo(new Date("2026-10-02T22:30:00Z"), "Asia/Tbilisi")).toEqual({ month: 9, weekday: 6 });
    expect(formatDate(new Date("2026-10-02T22:30:00Z"), "ka", { weekday: "long" })).toBe("შაბათი");
  });

  it("formats times on a 24-hour clock", () => {
    expect(formatTime(new Date("2026-10-01T10:05:00Z"), "ka")).toBe("14:05");
  });

  it("formats ranges with each side's month", () => {
    expect(formatDateRange("2026-10-01", "2026-10-05", "ka")).toBe("1 – 5 ოქტ 2026");
    expect(formatDateRange("2026-10-01", "2026-12-05", "ka", { day: "numeric", month: "short" })).toBe(
      "1 ოქტ – 5 დეკ",
    );
  });

  it("formats relative times like CLDR", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(formatRelativeTime(new Date("2026-10-31T11:59:50Z"), "ka", now)).toBe("ახლა");
    expect(formatRelativeTime(new Date("2026-10-28T12:00:00Z"), "ka", now)).toBe("3 დღის წინ");
    expect(formatRelativeTime(new Date("2026-10-30T12:00:00Z"), "ka", now)).toBe("გუშინ");
    expect(formatRelativeTime(new Date("2026-10-31T14:00:00Z"), "ka", now)).toBe("2 საათში");
    expect(georgianRelativeTime(-1, "month", String)).toBe("გასულ თვეს");
    expect(georgianRelativeTime(5, "year", String)).toBe("5 წელიწადში");
  });
});

describe("space normalization", () => {
  it("uses plain spaces around the range dash in every engine", () => {
    expect(formatDateRange("2026-10-01", "2026-10-05", "en")).toBe("Oct 1 – 5, 2026");
    expect(formatDateRange("2026-10-01", "2026-10-05", "ru")).not.toMatch(/[  ]/);
  });
});
