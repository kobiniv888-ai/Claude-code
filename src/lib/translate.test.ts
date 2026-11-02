import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { missingTranslationLocales } = await import("./translate");

describe("missingTranslationLocales", () => {
  it("lists every other language for a listing with only its original", () => {
    expect(missingTranslationLocales("ka", ["ka"]).sort()).toEqual(["ar", "en", "he", "ru"]);
  });

  it("counts owner-written and automatic rows as present", () => {
    expect(missingTranslationLocales("he", ["he", "en", "ru"]).sort()).toEqual(["ar", "ka"]);
  });

  it("is empty when all five languages exist", () => {
    expect(missingTranslationLocales("en", ["he", "en", "ru", "ar", "ka"])).toEqual([]);
  });

  it("never lists the original language, even without its own row", () => {
    expect(missingTranslationLocales("ru", [])).not.toContain("ru");
  });
});
