import { describe, expect, it } from "vitest";
import { bidiWords, hasArabicScript, isRtlText, truncateText, visualOrder } from "./bidi";

describe("visualOrder", () => {
  it("reverses pure Hebrew", () => {
    expect(visualOrder("בית")).toBe("תיב");
    expect(visualOrder("בתים בגאורגיה")).toBe("היגרואגב םיתב");
  });

  it("leaves Latin text alone", () => {
    expect(visualOrder("Homes in Georgia")).toBe("Homes in Georgia");
  });

  it("keeps numbers, separators and currency signs left to right inside Hebrew", () => {
    expect(visualOrder("₪1,200 ללילה")).toBe("הלילל ₪1,200");
    expect(visualOrder("דירה 3 חדרים")).toBe("םירדח 3 הריד");
  });

  it("keeps an embedded Latin run in order", () => {
    expect(visualOrder("מלון Old Tbilisi בוואקה")).toBe("הקאווב Old Tbilisi ןולמ");
  });

  it("mirrors brackets in right-to-left text", () => {
    expect(visualOrder("דירה (חדשה)")).toBe("(השדח) הריד");
  });

  it("reorders an embedded Hebrew word in an English sentence", () => {
    expect(visualOrder("Shalom בית here")).toBe("Shalom תיב here");
  });
});

describe("bidiWords", () => {
  it("splits right-to-left text into visual words in reading order", () => {
    expect(bidiWords("בתים בגאורגיה למטיילים")).toEqual({ rtl: true, words: ["םיתב", "היגרואגב", "םילייטמל"] });
  });

  it("keeps a Latin run together as one piece", () => {
    expect(bidiWords("מלון Old Tbilisi בוואקה").words).toEqual(["ןולמ", "Old Tbilisi", "הקאווב"]);
  });

  it("splits left-to-right text at every space", () => {
    expect(bidiWords("  Homes in   Georgia ")).toEqual({ rtl: false, words: ["Homes", "in", "Georgia"] });
  });
});

describe("helpers", () => {
  it("detects the paragraph direction from the first strong letter", () => {
    expect(isRtlText("123 בית")).toBe(true);
    expect(isRtlText("Bayit בית")).toBe(false);
  });

  it("detects Arabic script", () => {
    expect(hasArabicScript("منزل")).toBe(true);
    expect(hasArabicScript("בית Bayit")).toBe(false);
  });

  it("truncates at a word boundary with an ellipsis", () => {
    expect(truncateText("short", 10)).toBe("short");
    expect(truncateText("Sunny apartment with a view of the old town", 24)).toBe("Sunny apartment with a…");
  });
});
