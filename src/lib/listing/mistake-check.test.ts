import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import {
  bedsSleep,
  canPublish,
  checkListingMistakes,
  MISTAKE_ERROR_CODES,
  MISTAKE_WARNING_CODES,
  requiredPhotoRooms,
  type MistakeInput,
} from "./mistake-check";
import he from "../../../messages/he/wizard.json";
import en from "../../../messages/en/wizard.json";
import ru from "../../../messages/ru/wizard.json";
import ar from "../../../messages/ar/wizard.json";
import ka from "../../../messages/ka/wizard.json";

const BATUMI = { slug: "batumi", lat: 41.6168, lng: 41.6367 };

/** Six photos labelled with the three rooms guests look for. */
const LABELLED_PHOTOS: MistakeInput["photos"] = [
  { room: "LIVING_ROOM" },
  { room: "BEDROOM" },
  { room: "KITCHEN" },
  { room: "BATHROOM" },
  { room: "BALCONY" },
  { room: null },
];

/** A clean short stay: no errors, no warnings. */
function clean(overrides: Partial<MistakeInput> = {}): MistakeInput {
  return {
    dealType: "SHORT_STAY",
    propertyType: "APARTMENT",
    originalLocale: "he",
    title: "דירה מוארת מול הים בבטומי",
    description: "דירה עם מרפסת ונוף לים, מטבח מאובזר ומיטה זוגית. צ'ק אין משעה 14:00, צ'ק אאוט עד 11:00.",
    address: "Rustaveli 1, apt 5 (fake test address)",
    lat: 41.6405,
    lng: 41.6185,
    city: BATUMI,
    currency: "GEL",
    maxGuests: 2,
    bedsSingle: 0,
    bedsDouble: 1,
    bedsSofa: 0,
    bathrooms: 1,
    checkInFrom: "14:00",
    checkOutUntil: "11:00",
    checkInFlexible: false,
    checkOutFlexible: false,
    photos: LABELLED_PHOTOS,
    roomTypes: [],
    pricePosition: "typical",
    ...overrides,
  };
}

const codes = (result: ReturnType<typeof checkListingMistakes>) => ({
  errors: result.errors.map((i) => i.code),
  warnings: result.warnings.map((i) => i.code),
});

describe("the founder's listing 44 (test fixture, the listing itself is never changed)", () => {
  // As described in brief 6.1: the description says check-in at 13:00 and check-out at 10:00,
  // the settings say check-in from 10:00 and check-out until 13:00; max guests 1 with a double
  // bed and a sofa bed; 0 bathrooms; a "200 שקל" fine in a listing priced in lari.
  const listing44 = clean({
    title: "דירה בבטומי ליד הים",
    description:
      "דירה נעימה עם מיטה זוגית וספה נפתחת, מטבח ומרפסת. צ'ק אין בשעה 13:00, צ'ק אאוט עד 10:00. על יציאה מאוחרת יש קנס של 200 שקל.",
    checkInFrom: "10:00",
    checkOutUntil: "13:00",
    maxGuests: 1,
    bedsSingle: null,
    bedsDouble: 1,
    bedsSofa: 1,
    bathrooms: 0,
    currency: "GEL",
  });

  it("has exactly these warnings and no errors", () => {
    const result = checkListingMistakes(listing44);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      { code: "no_bathrooms", severity: "warning", field: "bathrooms", step: "size" },
      {
        code: "description_currency",
        severity: "warning",
        field: "description",
        step: "text",
        params: { written: "200 שקל", currency: "ILS", listingCurrency: "GEL" },
      },
      { code: "guests_below_beds", severity: "warning", field: "maxGuests", step: "booking", params: { maxGuests: 1, sleeps: 4 } },
      {
        code: "checkin_time_mismatch",
        severity: "warning",
        field: "checkInFrom",
        step: "booking",
        params: { written: "13:00", setting: "10:00" },
      },
      {
        code: "checkout_time_mismatch",
        severity: "warning",
        field: "checkOutUntil",
        step: "booking",
        params: { written: "10:00", setting: "13:00" },
      },
    ]);
    expect(canPublish(result)).toBe(true);
  });

  it("without room labels on its photos, it also asks for kitchen, bedroom and bathroom photos", () => {
    const result = checkListingMistakes({ ...listing44, photos: LABELLED_PHOTOS.map(() => ({ room: null })) });
    expect(codes(result).warnings).toContain("photo_rooms_missing");
    expect(result.warnings.find((w) => w.code === "photo_rooms_missing")?.params).toEqual({ rooms: "BEDROOM,KITCHEN,BATHROOM" });
  });
});

describe("a clean listing", () => {
  it("has no errors and no warnings", () => {
    expect(codes(checkListingMistakes(clean()))).toEqual({ errors: [], warnings: [] });
  });
});

describe("errors (block publishing)", () => {
  it("address missing for a short stay or a hotel, not for a rental or a sale", () => {
    expect(codes(checkListingMistakes(clean({ address: "  " }))).errors).toEqual(["address_missing"]);
    expect(codes(checkListingMistakes(clean({ address: null }))).errors).toEqual(["address_missing"]);
    const hotel = clean({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", address: "", bathrooms: null, maxGuests: null });
    expect(codes(checkListingMistakes(hotel)).errors).toEqual(["address_missing"]);
    expect(codes(checkListingMistakes(clean({ dealType: "MONTHLY_RENT", address: "" }))).errors).toEqual([]);
    expect(codes(checkListingMistakes(clean({ dealType: "SALE", address: "" }))).errors).toEqual([]);
  });

  it("fewer than 5 photos (hotels count room-type photos)", () => {
    const four = LABELLED_PHOTOS.slice(0, 4);
    const result = checkListingMistakes(clean({ photos: four }));
    expect(result.errors).toEqual([{ code: "photos_too_few", severity: "error", step: "photos", params: { count: 4, min: siteConfig.listings.minPhotos } }]);
    expect(canPublish(result)).toBe(false);
    // Room-type photos don't count for an apartment…
    const withRoomPhotos = [...four, { room: "BEDROOM" as const, roomTypeId: "r1" }];
    expect(codes(checkListingMistakes(clean({ photos: withRoomPhotos }))).errors).toEqual(["photos_too_few"]);
    // …but do for a hotel.
    const hotel = clean({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", photos: withRoomPhotos, bathrooms: null, maxGuests: null });
    expect(codes(checkListingMistakes(hotel)).errors).toEqual([]);
  });

  it("a phone number, an email, a link or a @username in the title or the description", () => {
    expect(checkListingMistakes(clean({ title: "דירה מול הים, להזמנות 0541234567" })).errors).toEqual([
      { code: "contact_in_title", severity: "error", field: "title", step: "text", params: { kind: "phone", value: "0541234567" } },
    ]);
    // Shown as written, so the host can find it in the text.
    const spaced = checkListingMistakes(clean({ description: `${clean().description} וואטסאפ +995 555 12 34 56` }));
    expect(spaced.errors[0]?.params).toEqual({ kind: "phone", value: "+995 555 12 34 56" });
    const email = checkListingMistakes(clean({ description: `${clean().description} כתבו לי: host@example.com` }));
    expect(email.errors.map((e) => [e.code, e.params?.kind])).toEqual([["contact_in_description", "email"]]);
    // A Hebrew prefix with a hyphen ("ל-host@…") isn't shown as part of the address.
    const prefixed = checkListingMistakes(clean({ description: `${clean().description} כתבו ל-host-p4@example.com` }));
    expect(prefixed.errors[0]?.params).toEqual({ kind: "email", value: "host-p4@example.com" });
    const link = checkListingMistakes(clean({ description: `${clean().description} פרטים: wa.me/995555123456` }));
    expect(link.errors.map((e) => e.code)).toEqual(["contact_in_description"]);
    const handle = checkListingMistakes(clean({ description: `${clean().description} טלגרם @batumi_flat_owner` }));
    expect(handle.errors.map((e) => [e.code, e.params?.kind])).toEqual([["contact_in_description", "handle"]]);
  });

  it("a season or holiday range of dates, or a list of numbers, is not a phone number", () => {
    for (const extra of ["פנויה בקיץ 15.06-15.09.2026.", "פסח 12.04-20.04.2026", "קווי אוטובוס 37 61 102 150", "חדרים 101 - 110 / 201 - 210"]) {
      expect(checkListingMistakes(clean({ description: `${clean().description} ${extra}` })).errors, extra).toEqual([]);
    }
  });

  it("errors come in the order of the wizard's steps", () => {
    const result = checkListingMistakes(clean({ address: "", photos: [], title: "call +995 555 12 34 56" }));
    expect(result.errors.map((e) => e.code)).toEqual(["address_missing", "contact_in_title", "photos_too_few"]);
  });
});

describe("warnings", () => {
  it("max guests below or above what the beds sleep (single 1, double 2, sofa 2)", () => {
    expect(bedsSleep({ bedsSingle: 2, bedsDouble: 1, bedsSofa: 1 })).toBe(6);
    expect(bedsSleep({ bedsSingle: null, bedsDouble: 0, bedsSofa: null })).toBeNull();
    expect(codes(checkListingMistakes(clean({ maxGuests: 1 }))).warnings).toEqual(["guests_below_beds"]);
    const above = checkListingMistakes(clean({ maxGuests: 5 }));
    expect(above.warnings).toEqual([{ code: "guests_above_beds", severity: "warning", field: "beds", step: "size", params: { maxGuests: 5, sleeps: 2 } }]);
    // No beds entered: nothing to compare.
    expect(codes(checkListingMistakes(clean({ bedsDouble: null, maxGuests: 6 }))).warnings).toEqual([]);
    // A monthly rental asks for max guests in the size step.
    const monthly = checkListingMistakes(clean({ dealType: "MONTHLY_RENT", maxGuests: 1, checkInFrom: null }));
    expect(monthly.warnings.find((w) => w.code === "guests_below_beds")?.step).toBe("size");
  });

  it("checks each hotel room type's beds", () => {
    const hotel = clean({
      dealType: "HOTEL_ROOM",
      propertyType: "HOTEL",
      bathrooms: null,
      maxGuests: null,
      roomTypes: [
        { id: "r1", name: "Double, sea view", maxGuests: 2, bedsSingle: 0, bedsDouble: 1 },
        { id: "r2", name: "Family", maxGuests: 2, bedsSingle: 2, bedsDouble: 1, bedsSofa: 1 },
        { id: "r3", name: "Single", maxGuests: 3, bedsSingle: 1, bedsDouble: 0 },
      ],
    });
    expect(checkListingMistakes(hotel).warnings).toEqual([
      { code: "room_guests_below_beds", severity: "warning", field: "maxGuests", step: "rooms", params: { maxGuests: 2, sleeps: 6, room: "Family" } },
      { code: "room_guests_above_beds", severity: "warning", field: "maxGuests", step: "rooms", params: { maxGuests: 3, sleeps: 1, room: "Single" } },
    ]);
  });

  it("0 bathrooms (not for hotels, which have no bathroom count)", () => {
    expect(codes(checkListingMistakes(clean({ bathrooms: 0 }))).warnings).toEqual(["no_bathrooms"]);
    expect(codes(checkListingMistakes(clean({ bathrooms: null }))).warnings).toEqual([]);
  });

  it("times in the description that don't match the settings, in every language", () => {
    const at = (description: string, checkInFrom = "14:00", checkOutUntil = "11:00") =>
      codes(checkListingMistakes(clean({ description: `${"דירה עם מרפסת ונוף לים, מטבח מאובזר ומיטה זוגית."} ${description}`, checkInFrom, checkOutUntil }))).warnings;
    expect(at("Check-in at 2pm, check-out by 11 a.m.")).toEqual([]);
    expect(at("Check-in at 3pm, check-out by 10 a.m.")).toEqual(["checkin_time_mismatch", "checkout_time_mismatch"]);
    expect(at("הכניסה בשעה 1 בצהריים")).toEqual(["checkin_time_mismatch"]);
    expect(at("היציאה עד 10 בבוקר")).toEqual(["checkout_time_mismatch"]);
    expect(at("Заезд с 15:00")).toEqual(["checkin_time_mismatch"]);
    expect(at("заезд с 14:00, выезд до 11:00")).toEqual([]);
    expect(at("تسجيل الوصول الساعة 3 ظهرًا")).toEqual(["checkin_time_mismatch"]);
    expect(at("შესვლა 14:00-დან, გასვლა 12:00-მდე")).toEqual(["checkout_time_mismatch"]);
    // An hour without am/pm matches either.
    expect(at("Check-in after 2, check-out by 11")).toEqual([]);
    // A range that includes the setting is fine.
    expect(at("Check-in from 14:00 to 22:00")).toEqual([]);
    // "Late check-out until 14:00" is an extra, not the check-out time.
    expect(at("Late check-out until 14:00 for a fee")).toEqual([]);
  });

  it("no time comparison when the setting is flexible; no check-in time is its own warning", () => {
    expect(codes(checkListingMistakes(clean({ checkInFrom: null, checkInFlexible: true, description: `${clean().description} Check-in at 5pm` }))).warnings).toEqual([]);
    const missing = checkListingMistakes(clean({ checkInFrom: null }));
    expect(missing.warnings).toEqual([
      { code: "checkin_time_missing", severity: "warning", field: "checkInFrom", step: "booking", params: { written: "14:00" } },
    ]);
    const missingSilent = checkListingMistakes(clean({ checkInFrom: "", description: "דירה עם מרפסת ונוף לים, מטבח מאובזר ומיטה זוגית ליד הים." }));
    expect(missingSilent.warnings).toEqual([{ code: "checkin_time_missing", severity: "warning", field: "checkInFrom", step: "booking" }]);
    // Rentals and sales have no check-in time.
    expect(codes(checkListingMistakes(clean({ dealType: "SALE", checkInFrom: null }))).warnings).toEqual([]);
  });

  it("prices in the description in another currency (the listing's and its room types' are fine)", () => {
    const withText = (text: string, currency: MistakeInput["currency"] = "GEL") =>
      checkListingMistakes(clean({ currency, description: `${clean().description} ${text}` })).warnings.map((w) => `${w.code}:${w.params?.currency}`);
    expect(withText("פיקדון 200 ₪")).toEqual(["description_currency:ILS"]);
    expect(withText("Deposit $100, cleaning 30 €")).toEqual(["description_currency:USD", "description_currency:EUR"]);
    expect(withText("Уборка 50 лари")).toEqual([]);
    expect(withText("Уборка 50 лари", "USD")).toEqual(["description_currency:GEL"]);
    expect(withText("ניקיון 50 ₾ ופיקדון 100 ₾")).toEqual([]);
    const hotel = checkListingMistakes(
      clean({
        dealType: "HOTEL_ROOM",
        propertyType: "HOTEL",
        bathrooms: null,
        maxGuests: null,
        description: `${clean().description} Room from $40`,
        roomTypes: [{ id: "r1", name: "Double", maxGuests: 2, bedsSingle: 0, bedsDouble: 1, currency: "USD" }],
      }),
    );
    expect(codes(hotel).warnings).toEqual([]);
  });

  it("a title in another language than 'I'm writing in'", () => {
    const result = checkListingMistakes(clean({ title: "Sunny flat near the sea" }));
    expect(result.warnings).toEqual([
      { code: "title_language", severity: "warning", field: "title", step: "text", params: { detected: "en", setting: "he" } },
    ]);
    expect(codes(checkListingMistakes(clean({ title: "Sunny flat near the sea", originalLocale: "en" }))).warnings).toEqual([]);
  });

  it("a price far outside the price guide's usual range (nothing when the guide has too little data)", () => {
    expect(checkListingMistakes(clean({ pricePosition: "far_below" })).warnings).toEqual([
      { code: "price_far_below", severity: "warning", field: "price", step: "booking" },
    ]);
    expect(codes(checkListingMistakes(clean({ pricePosition: "far_above", dealType: "SALE", checkInFrom: null }))).warnings).toEqual(["price_far_above"]);
    expect(checkListingMistakes(clean({ pricePosition: "far_above", dealType: "SALE" })).warnings[0].step).toBe("price");
    expect(codes(checkListingMistakes(clean({ pricePosition: "below" }))).warnings).toEqual([]);
    expect(codes(checkListingMistakes(clean({ pricePosition: "above" }))).warnings).toEqual([]);
    expect(codes(checkListingMistakes(clean({ pricePosition: null }))).warnings).toEqual([]);
    const hotel = clean({
      dealType: "HOTEL_ROOM",
      propertyType: "HOTEL",
      bathrooms: null,
      maxGuests: null,
      roomTypes: [{ id: "r1", name: "Suite", maxGuests: 2, bedsSingle: 0, bedsDouble: 1, pricePosition: "far_above" }],
    });
    expect(checkListingMistakes(hotel).warnings).toEqual([
      { code: "room_price_far_above", severity: "warning", field: "price", step: "rooms", params: { room: "Suite" } },
    ]);
  });

  it("the pin outside the chosen city (a generous radius, the city center is all we know)", () => {
    // Kobuleti is about 25 km north of Batumi.
    const far = checkListingMistakes(clean({ lat: 41.8214, lng: 41.7792 }));
    expect(far.warnings).toEqual([{ code: "pin_outside_city", severity: "warning", field: "lat", step: "location", params: { km: 26 } }]);
    // Gonio, inside Batumi's 20 km.
    expect(codes(checkListingMistakes(clean({ lat: 41.5636, lng: 41.5733 }))).warnings).toEqual([]);
    // Tbilisi reaches 25 km; other towns 15 km.
    const tbilisi = { slug: "tbilisi", lat: 41.7151, lng: 44.8271 };
    expect(codes(checkListingMistakes(clean({ city: tbilisi, lat: 41.79, lng: 44.75 }))).warnings).toEqual([]);
    const mestia = { slug: "mestia", lat: 43.0453, lng: 42.7266 };
    expect(codes(checkListingMistakes(clean({ city: mestia, lat: 43.2, lng: 42.7266 }))).warnings).toEqual(["pin_outside_city"]);
  });

  it("no photo labelled kitchen, bedroom or bathroom (hotels: bedroom and bathroom)", () => {
    const noKitchen = LABELLED_PHOTOS.map((p) => (p.room === "KITCHEN" ? { room: null } : p));
    expect(checkListingMistakes(clean({ photos: noKitchen })).warnings).toEqual([
      { code: "photo_rooms_missing", severity: "warning", step: "photos", params: { rooms: "KITCHEN" } },
    ]);
    expect(requiredPhotoRooms({ dealType: "HOTEL_ROOM", propertyType: "HOTEL" })).toEqual(["BEDROOM", "BATHROOM"]);
    const hotel = clean({ dealType: "HOTEL_ROOM", propertyType: "HOTEL", bathrooms: null, maxGuests: null, photos: noKitchen });
    expect(codes(checkListingMistakes(hotel)).warnings).toEqual([]);
    // Room-type photos count for the labels too.
    const roomLabelled = [...noKitchen.filter((p) => p.room !== "BEDROOM"), { room: "BEDROOM" as const, roomTypeId: "r1" }];
    expect(codes(checkListingMistakes({ ...hotel, photos: roomLabelled })).warnings).toEqual([]);
    // No photos at all: the error says enough.
    expect(codes(checkListingMistakes(clean({ photos: [] })))).toEqual({ errors: ["photos_too_few"], warnings: [] });
  });
});

describe("messages", () => {
  it("every code has a message in all five languages", () => {
    for (const [locale, messages] of Object.entries({ he, en, ru, ar, ka })) {
      const issues = (messages as { mistakes?: { issues?: Record<string, unknown> } }).mistakes?.issues ?? {};
      for (const code of [...MISTAKE_ERROR_CODES, ...MISTAKE_WARNING_CODES]) {
        expect(issues[code], `${locale}: mistakes.issues.${code}`).toBeTypeOf("string");
      }
    }
  });
});
