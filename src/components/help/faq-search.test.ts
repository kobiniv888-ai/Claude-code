import { describe, expect, it } from "vitest";
import { highlightParts, normalizeForSearch, searchFaq, searchTokens, type FaqEntry } from "./faq-search";

const items: FaqEntry[] = [
  { id: "a", category: "POSTING", question: "How do I post a listing?", answer: "Open Post and follow the steps." },
  { id: "b", category: "SAFETY", question: "Is it safe to pay a deposit?", answer: "Never pay before you have seen the place." },
  { id: "c", category: "PAYMENTS", question: "כמה עולה לפרסם מודעה?", answer: "פרסום מודעה הוא בחינם." },
  { id: "d", category: "ACCOUNT_VERIFICATION", question: "كيف أتحقق من حسابي؟", answer: "ارفع صورة الهوية." },
  { id: "e", category: "GETTING_STARTED", question: "Café near the flat?", answer: "Résumé of the área." },
];

const ids = (list: { id: string }[]) => list.map((i) => i.id);

describe("normalizeForSearch", () => {
  it("folds case, accents, niqqud, final letters and Arabic variants", () => {
    expect(normalizeForSearch("  CAFÉ  ")).toBe("cafe");
    expect(normalizeForSearch("שָׁלוֹם")).toBe("שלומ");
    expect(normalizeForSearch("أحمد")).toBe("احمد");
    expect(normalizeForSearch("مدرسة")).toBe("مدرسه");
    expect(normalizeForSearch("ёлка")).toBe("елка");
  });
});

describe("searchFaq", () => {
  it("returns everything for an empty query", () => {
    expect(searchFaq(items, "   ")).toHaveLength(items.length);
  });

  it("requires every word and ranks question matches first", () => {
    expect(ids(searchFaq(items, "pay"))).toEqual(["b"]);
    expect(ids(searchFaq(items, "post steps"))).toEqual(["a"]);
    expect(searchFaq(items, "post deposit")).toEqual([]);
    const both = searchFaq(
      [
        { id: "x", category: "SAFETY", question: "Other", answer: "deposit rules" },
        { id: "y", category: "SAFETY", question: "Deposit rules", answer: "…" },
      ],
      "deposit",
    );
    expect(ids(both)).toEqual(["y", "x"]);
  });

  it("matches across scripts without niqqud, accents or final-letter differences", () => {
    expect(ids(searchFaq(items, "מודעה"))).toEqual(["c"]);
    expect(ids(searchFaq(items, "בחינם"))).toEqual(["c"]);
    expect(ids(searchFaq(items, "اتحقق"))).toEqual(["d"]);
    expect(ids(searchFaq(items, "cafe resume"))).toEqual(["e"]);
  });
});

describe("highlightParts", () => {
  it("marks matches on the original text", () => {
    const tokens = searchTokens("pay");
    expect(highlightParts("Never pay before", tokens)).toEqual([
      { text: "Never ", match: false },
      { text: "pay", match: true },
      { text: " before", match: false },
    ]);
  });

  it("maps folded matches back onto accented text", () => {
    const parts = highlightParts("Résumé here", searchTokens("resume"));
    expect(parts[0]).toEqual({ text: "Résumé", match: true });
  });

  it("keeps niqqud with the highlighted letters", () => {
    const parts = highlightParts("שָׁלוֹם לכם", searchTokens("שלום"));
    expect(parts[0].match).toBe(true);
    expect(parts[0].text).toBe("שָׁלוֹם");
  });

  it("returns the text untouched without tokens", () => {
    expect(highlightParts("Hello", [])).toEqual([{ text: "Hello", match: false }]);
  });
});
