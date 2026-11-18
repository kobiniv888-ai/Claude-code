/**
 * The safety page says only what the site does (SECURITY_REPORT 19.j, S2 review TS-14):
 * - "automatic checks" name photos only when the photo text check (riskHooks.photoOcr) exists;
 * - "moving somewhere else to pay" never says the site takes no bookings: it takes bookings on site.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { riskHooks } = await import("@/lib/risk");

const LOCALES = ["he", "en", "ru", "ar", "ka"] as const;
const safety = (locale: string) => JSON.parse(readFileSync(path.join(process.cwd(), "messages", locale, "safety.json"), "utf8"));

/** "photo" in the 5 languages. */
const PHOTO = /photo|picture|image|תמונ|фото|снимк|صور|ფოტო|სურათ/iu;
/** "doesn't take bookings" as the old texts said it. */
const NO_BOOKINGS = /doesn't take bookings|לא מבצע הזמנות|не принимает бронирования|لا يستقبل .{0,20}حجوزات|არ იღებს დაჯავშნ/iu;

describe("safety page claims (TS-14)", () => {
  it.each(LOCALES)("%s: the contact check mentions photos only with a photo check", (locale) => {
    const text: string = safety(locale).verification.checks.contacts;
    if (riskHooks.photoOcr === null) expect(text).not.toMatch(PHOTO);
  });

  it.each(LOCALES)("%s: off-platform payment does not say the site takes no bookings", (locale) => {
    const text: string = safety(locale).spot.offPlatform.body;
    expect(text).not.toMatch(NO_BOOKINGS);
    expect(text).toContain("{siteName}");
  });
});
