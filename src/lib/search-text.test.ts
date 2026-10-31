import { describe, expect, it } from "vitest";
import { buildSearchText, matchScore, normalizeSearchText, splitSearchText } from "./search-text";

describe("normalizeSearchText", () => {
  it("lower-cases, trims and collapses spaces", () => {
    expect(normalizeSearchText("  Old   Tbilisi ")).toBe("old tbilisi");
    expect(normalizeSearchText("Vake-Saburtalo")).toBe("vake saburtalo");
  });

  it("strips Latin diacritics and Russian ё", () => {
    expect(normalizeSearchText("Tbilissí")).toBe("tbilissi");
    expect(normalizeSearchText("Ёлка")).toBe("елка");
  });

  it("strips Hebrew niqqud, geresh and normalizes final letters", () => {
    expect(normalizeSearchText("טְבִּילִיסִי")).toBe("טביליסי");
    expect(normalizeSearchText("בורג׳ומי")).toBe(normalizeSearchText("בורג'ומי"));
    expect(normalizeSearchText("תל אביב-יפו")).toBe("תל אביב יפו");
    expect(normalizeSearchText("ים")).toBe("ימ");
  });

  it("normalizes Arabic letter variants and harakat", () => {
    expect(normalizeSearchText("تَبْلِيسِي")).toBe("تبليسي");
    expect(normalizeSearchText("أحمد")).toBe(normalizeSearchText("احمد"));
  });

  it("leaves Georgian intact", () => {
    expect(normalizeSearchText("თბილისი")).toBe("თბილისი");
  });

  it("handles empty input", () => {
    expect(normalizeSearchText("")).toBe("");
    expect(normalizeSearchText(null)).toBe("");
  });
});

describe("buildSearchText", () => {
  const names = { he: "טביליסי", en: "Tbilisi", ru: "Тбилиси", ar: "تبليسي", ka: "თბილისი" };

  it("joins every language and alias, de-duplicated", () => {
    const text = buildSearchText(names, ["tiflis", "Tbilisi"]);
    expect(splitSearchText(text)).toEqual(["טביליסי", "tbilisi", "тбилиси", "تبليسي", "თბილისი", "tiflis"]);
  });

  it("matches the city in any language", () => {
    const terms = splitSearchText(buildSearchText(names));
    for (const query of ["Tbilisi", "טביליסי", "Тбилиси", "تبليسي", "თბილისი", "tbil", "тби"]) {
      const q = normalizeSearchText(query);
      expect(Math.max(...terms.map((t) => matchScore(t, q)))).toBeGreaterThan(0);
    }
  });
});

describe("matchScore", () => {
  it("ranks exact > prefix > word prefix > contains", () => {
    expect(matchScore("batumi", "batumi")).toBe(100);
    expect(matchScore("batumi", "bat")).toBe(80);
    expect(matchScore("old tbilisi", "tbi")).toBe(60);
    expect(matchScore("saburtalo", "urta")).toBe(40);
    expect(matchScore("batumi", "kutaisi")).toBe(0);
  });
});
