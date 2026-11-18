import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { checkListingMistakes, MISTAKE_ERROR_CODES, MISTAKE_WARNING_CODES, type MistakeIssue } from "@/lib/listing/mistake-check";
import { mistakeMessage, type MistakeTranslator } from "./mistake-text";
import he from "../../../messages/he/wizard.json";
import en from "../../../messages/en/wizard.json";
import ru from "../../../messages/ru/wizard.json";
import ar from "../../../messages/ar/wizard.json";
import ka from "../../../messages/ka/wizard.json";

const MESSAGES = { he, en, ru, ar, ka };

function translator(locale: keyof typeof MESSAGES): MistakeTranslator {
  return createTranslator({ locale, messages: { wizard: MESSAGES[locale] }, namespace: "wizard.mistakes" }) as unknown as MistakeTranslator;
}

/** Without the bidi isolation marks, to compare text. */
const plain = (text: string) => text.replace(/[⁦-⁩]/g, "");

const SAMPLES: MistakeIssue[] = [
  { code: "address_missing", severity: "error", step: "location" },
  { code: "photos_too_few", severity: "error", step: "photos", params: { count: 3, min: 5 } },
  { code: "contact_in_title", severity: "error", step: "text", params: { kind: "phone", value: "+995555123456" } },
  { code: "contact_in_description", severity: "error", step: "text", params: { kind: "link", value: "wa.me/995555123456" } },
  { code: "pin_outside_city", severity: "warning", step: "location", params: { km: 26 } },
  { code: "guests_below_beds", severity: "warning", step: "booking", params: { maxGuests: 1, sleeps: 4 } },
  { code: "guests_above_beds", severity: "warning", step: "size", params: { maxGuests: 6, sleeps: 2 } },
  { code: "room_guests_below_beds", severity: "warning", step: "rooms", params: { maxGuests: 2, sleeps: 6, room: "Family" } },
  { code: "room_guests_above_beds", severity: "warning", step: "rooms", params: { maxGuests: 3, sleeps: 1, room: "Single" } },
  { code: "no_bathrooms", severity: "warning", step: "size" },
  { code: "title_language", severity: "warning", step: "text", params: { detected: "en", setting: "he" } },
  { code: "description_currency", severity: "warning", step: "text", params: { written: "200 שקל", currency: "ILS", listingCurrency: "GEL" } },
  { code: "checkin_time_mismatch", severity: "warning", step: "booking", params: { written: "13:00", setting: "10:00" } },
  { code: "checkout_time_mismatch", severity: "warning", step: "booking", params: { written: "10:00", setting: "13:00" } },
  { code: "checkin_time_missing", severity: "warning", step: "booking" },
  { code: "photo_rooms_missing", severity: "warning", step: "photos", params: { rooms: "BEDROOM,KITCHEN,BATHROOM" } },
  { code: "price_far_below", severity: "warning", step: "booking" },
  { code: "price_far_above", severity: "warning", step: "booking" },
  { code: "room_price_far_below", severity: "warning", step: "rooms", params: { room: "Suite" } },
  { code: "room_price_far_above", severity: "warning", step: "rooms", params: { room: "Suite" } },
  { code: "contact_in_translation", severity: "error", step: "publish", params: { locale: "ru", kind: "phone", value: "+995 555 12 34 56" } },
  { code: "contact_in_room_name", severity: "error", step: "rooms", params: { room: "Double", kind: "handle", value: "@batumi_rooms" } },
];

describe("mistakeMessage", () => {
  it("covers every code", () => {
    expect(SAMPLES.map((s) => s.code).sort()).toEqual([...MISTAKE_ERROR_CODES, ...MISTAKE_WARNING_CODES].sort());
  });

  it("formats every issue in all five languages without leftover placeholders", () => {
    for (const locale of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      const t = translator(locale);
      for (const issue of SAMPLES) {
        const text = mistakeMessage(issue, t, locale);
        expect(text, `${locale} ${issue.code}`).not.toMatch(/[{}]/);
        expect(text, `${locale} ${issue.code}`).not.toBe(issue.code);
        expect(text.length, `${locale} ${issue.code}`).toBeGreaterThan(15);
      }
    }
  });

  it("names the language of a hand-written version and the room type", () => {
    const he = translator("he");
    expect(plain(mistakeMessage(SAMPLES.find((s) => s.code === "contact_in_translation")!, he, "he"))).toContain("ברוסית");
    expect(plain(mistakeMessage(SAMPLES.find((s) => s.code === "contact_in_room_name")!, he, "he"))).toContain("„Double”");
  });

  it("keeps an email address or a link on one line (no break at its - or /)", () => {
    const t = translator("he");
    const text = mistakeMessage({ code: "contact_in_description", severity: "error", step: "text", params: { kind: "email", value: "host-p4g@example.com" } }, t, "he");
    expect(text).toContain("host\u2060-\u2060p4g@example.com");
    const link = mistakeMessage({ code: "contact_in_description", severity: "error", step: "text", params: { kind: "link", value: "www.example.com/flat" } }, t, "he");
    expect(link).toContain("www.example.com\u2060/\u2060flat");
  });

  it("reads naturally in Hebrew for the founder's listing 44", () => {
    const t = translator("he");
    const result = checkListingMistakes({
      dealType: "SHORT_STAY",
      propertyType: "APARTMENT",
      originalLocale: "he",
      title: "דירה בבטומי ליד הים",
      description: "דירה עם מיטה זוגית וספה נפתחת. צ'ק אין בשעה 13:00, צ'ק אאוט עד 10:00. על יציאה מאוחרת יש קנס של 200 שקל.",
      address: "Fake street 1",
      lat: 41.64,
      lng: 41.62,
      city: { slug: "batumi", lat: 41.6168, lng: 41.6367 },
      currency: "GEL",
      maxGuests: 1,
      bedsSingle: null,
      bedsDouble: 1,
      bedsSofa: 1,
      bathrooms: 0,
      checkInFrom: "10:00",
      checkOutUntil: "13:00",
      checkInFlexible: false,
      checkOutFlexible: false,
      photos: [{ room: "BEDROOM" }, { room: "KITCHEN" }, { room: "BATHROOM" }, { room: null }, { room: null }],
    });
    expect(result.warnings.map((w) => plain(mistakeMessage(w, t, "he")))).toEqual([
      "מספר חדרי הרחצה הוא 0. אם יש מקלחת או שירותים, עדכנו את המספר.",
      "בתיאור כתוב „200 שקל”, אבל המטבע של המודעה הוא לארי (₾). כתבו סכומים במטבע של המודעה, כדי שאורחים לא יתבלבלו.",
      "מספר האורחים המרבי הוא 1, אבל המיטות מתאימות ל-4 אנשים.",
      "בתיאור כתוב צ׳ק-אין „13:00”, אבל בהגדרות הצ׳ק-אין הוא מ-10:00. תקנו את מה שלא נכון.",
      "בתיאור כתוב צ׳ק-אאוט „10:00”, אבל בהגדרות הצ׳ק-אאוט הוא עד 13:00. תקנו את מה שלא נכון.",
    ]);
  });

  it("lists missing rooms with 'or', and shows a contact value as written", () => {
    expect(plain(mistakeMessage(SAMPLES[15], translator("en"), "en"))).toBe(
      "No photo has the label “Bedroom”, “Kitchen” or “Bathroom”. Pick the room under each photo so guests find it quickly.",
    );
    expect(plain(mistakeMessage(SAMPLES[2], translator("en"), "en"))).toContain("phone number: +995555123456");
  });

  it("shows the setting's time the way each language writes times", () => {
    expect(plain(mistakeMessage(SAMPLES[12], translator("en"), "en"))).toContain("check-in from 10:00 AM");
    expect(plain(mistakeMessage(SAMPLES[12], translator("ru"), "ru"))).toContain("заезд с 10:00");
  });

  it("uses the written time when no check-in time is set", () => {
    const issue: MistakeIssue = { code: "checkin_time_missing", severity: "warning", params: { written: "2pm" } };
    expect(plain(mistakeMessage(issue, translator("en"), "en"))).toBe("No check-in time is set, and the description says “2pm”. Choose the time in the settings.");
  });
});
