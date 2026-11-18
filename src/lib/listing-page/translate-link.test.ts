import { describe, expect, it } from "vitest";
import { cutForUrl, googleTranslateUrl, MAX_ENCODED_TEXT } from "./translate-link";

describe("googleTranslateUrl", () => {
  it("opens Google Translate with the title and description, Hebrew as iw", () => {
    const url = new URL(googleTranslateUrl({ title: "ORBI CITY – ზღვის ხედი", description: "ბინა ზღვასთან.", from: "ka", to: "he" }));
    expect(url.origin).toBe("https://translate.google.com");
    expect(url.searchParams.get("sl")).toBe("ka");
    expect(url.searchParams.get("tl")).toBe("iw");
    expect(url.searchParams.get("op")).toBe("translate");
    expect(url.searchParams.get("text")).toBe("ORBI CITY – ზღვის ხედი\n\nბინა ზღვასთან.");
  });
  it("cuts long Georgian text at a sentence end so the address stays short", () => {
    const sentence = "ეს არის ძალიან ლამაზი ბინა ზღვის პირას. ";
    const long = sentence.repeat(400);
    const cut = cutForUrl(long);
    expect(encodeURIComponent(cut).length).toBeLessThanOrEqual(MAX_ENCODED_TEXT);
    expect(cut.endsWith(".")).toBe(true);
    const url = googleTranslateUrl({ title: "ბინა", description: long, from: "ka", to: "en" });
    expect(url.length).toBeLessThan(MAX_ENCODED_TEXT + 200);
  });
  it("keeps short text as it is and never breaks a character", () => {
    expect(cutForUrl("  שלום  ")).toBe("שלום");
    const emoji = "🏖️".repeat(2000);
    expect(() => decodeURIComponent(encodeURIComponent(cutForUrl(emoji)))).not.toThrow();
  });
  it("falls back to the page address without text", () => {
    const url = new URL(googleTranslateUrl({ title: " ", description: "", from: "ru", to: "en", pageUrl: "https://bayit.ge/en/listing/12" }));
    expect(url.pathname).toBe("/translate");
    expect(url.searchParams.get("u")).toBe("https://bayit.ge/en/listing/12");
  });
});
