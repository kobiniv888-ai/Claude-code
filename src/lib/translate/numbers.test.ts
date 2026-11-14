import { describe, expect, it } from "vitest";
import { keepsNumbers, numbersSafeTranslation } from "./numbers";

describe("keepsNumbers (SECURITY_REPORT 7.n)", () => {
  it("accepts a translation with the same numbers", () => {
    expect(keepsNumbers("2 rooms, 120 ₾ a night, check-in 14:00", "2 חדרים, 120 ₾ ללילה, כניסה ב-14:00")).toBe(true);
    expect(keepsNumbers("No numbers here", "Здесь нет чисел")).toBe(true);
  });

  it("accepts reordered numbers and other separators", () => {
    expect(keepsNumbers("1,200 ₾ for 3 nights", "3 ночи за 1 200 ₾")).toBe(true);
  });

  it("accepts Arabic-Indic and full-width digits", () => {
    expect(keepsNumbers("Floor 3, 45 m²", "الطابق ٣، ٤٥ م²")).toBe(true);
    expect(keepsNumbers("Floor 3", "Floor ３")).toBe(true);
  });

  it("rejects a changed, dropped or added number", () => {
    expect(keepsNumbers("120 ₾ a night", "210 ₾ ללילה")).toBe(false);
    expect(keepsNumbers("120 ₾ a night", "12 ₾ ללילה")).toBe(false);
    expect(keepsNumbers("Check-in 14:00", "Заезд днём")).toBe(false);
    expect(keepsNumbers("Check-in after lunch", "Check-in 14:00")).toBe(false);
  });
});

describe("numbersSafeTranslation", () => {
  it("falls back to the original text when a number changed", () => {
    expect(numbersSafeTranslation("120 ₾ a night", "210 ₾ ללילה")).toEqual({ text: "120 ₾ a night", kept: false });
    expect(numbersSafeTranslation("120 ₾ a night", "120 ₾ ללילה")).toEqual({ text: "120 ₾ ללילה", kept: true });
  });
});

describe("keepsNumbers edge cases", () => {
  it("compares whole numbers, not digits", () => {
    expect(keepsNumbers("12 and 3", "1 and 23")).toBe(false);
    expect(keepsNumbers("1,200,000 ₾", "1 200 000 ₾")).toBe(true);
    expect(keepsNumbers("Check-in 09:00", "כניסה ב-9:00")).toBe(true);
    expect(keepsNumbers("2.5 km", "2,5 км")).toBe(true);
  });
});
