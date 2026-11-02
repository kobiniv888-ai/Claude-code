import { describe, expect, it } from "vitest";
import { addDays, applyRange, daysToRanges, isRangeBlocked, normalizeRanges, rangesToDays } from "./availability";
import { missingRequirements } from "./requirements";
import {
  contactStepSchema,
  contactValueProblem,
  isVideoUrl,
  normalizeContactValue,
  pickStepData,
  priceStepSchema,
  roomTypeSchema,
  stepIssues,
  stepSaveSchemas,
  type WizardValues,
} from "./schemas";
import { applies, parseStepParam, priceStepFor, stepAt, stepNumber, stepsFor } from "./steps";

const base: WizardValues = {
  dealType: "SHORT_STAY",
  propertyType: "APARTMENT",
  businessName: "",
  cityId: "city1",
  neighborhoodId: null,
  address: "",
  lat: 41.7151,
  lng: 44.8271,
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  bedsSingle: null,
  bedsDouble: 1,
  bedsSofa: null,
  maxGuests: 4,
  sizeSqm: 80,
  floor: 3,
  totalFloors: 9,
  elevator: true,
  yearBuilt: 2015,
  buildingAge: "NEW",
  furnished: true,
  condition: null,
  heating: [],
  views: [],
  cadastralCode: "",
  sharedRoomFor: null,
  originalLocale: "he",
  title: "Sunny apartment near Vake Park",
  description: "A bright three-room apartment with a balcony, five minutes from Vake Park and the synagogue.",
  videoUrl: "",
  tour360Url: "",
  amenities: ["wifi"],
  petsAllowed: null,
  smokingAllowed: false,
  partiesAllowed: null,
  checkInFrom: "14:00",
  checkOutUntil: "11:00",
  quietHoursFrom: "",
  quietHoursTo: "",
  kitchenKosher: "CAN_KASHER",
  shabbatFeatures: ["hot_plate"],
  jewishFeatures: [],
  hotelJewishFeatures: [],
  kosherCertName: "",
  kosherCertPhotoKey: null,
  price: 90,
  currency: "USD",
  pricePeriod: "NIGHT",
  deposit: null,
  cleaningFee: 20,
  utilitiesIncluded: null,
  utilitiesEstimate: null,
  minStayNights: 2,
  weeklyDiscountPct: 10,
  monthlyDiscountPct: null,
  icalImportUrls: [],
  weekendPrice: null,
  cancellationPolicy: "MODERATE",
  paymentMethodsAtCheckIn: ["cash"],
  contactMethods: [{ channel: "WHATSAPP", value: "+995555123456", order: 0 }],
  contactHoursFrom: "",
  contactHoursTo: "",
  noReplyOnShabbat: true,
};
const kind = { dealType: "SHORT_STAY", propertyType: "APARTMENT" } as const;

describe("steps", () => {
  it("adds the room types step only for hotels", () => {
    expect(stepsFor(kind)).not.toContain("rooms");
    expect(stepsFor(kind)).toHaveLength(14);
    expect(stepsFor(kind).slice(-2)).toEqual(["pledge", "publish"]);
    const hotel = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" } as const;
    // Hotels skip "size" (their room types hold it): 15 - 1.
    expect(stepsFor(hotel)).toHaveLength(14);
    expect(stepsFor(hotel)).not.toContain("size");
    expect(stepNumber("rooms", hotel)).toBe(10);
    expect(stepNumber("booking", hotel)).toBe(11);
    expect(stepNumber("booking", kind)).toBe(11);
  });

  it("uses the bookings-and-price step instead of the price step for short stays and hotels", () => {
    const hotel = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" } as const;
    const rent = { dealType: "MONTHLY_RENT", propertyType: "APARTMENT" } as const;
    expect(stepsFor(kind)).toContain("booking");
    expect(stepsFor(kind)).not.toContain("price");
    expect(stepsFor(hotel)).toContain("booking");
    expect(stepsFor(rent)).toContain("price");
    expect(stepsFor(rent)).not.toContain("booking");
    expect(priceStepFor(rent)).toBe("price");
    expect(priceStepFor(kind)).toBe("booking");
    expect(applies("bookingTerms", rent)).toBe(false);
    expect(applies("cleaningFee", hotel)).toBe(true);
    expect(applies("discounts", kind)).toBe(false);
  });

  it("parses ?step= as a number or a key and clamps it", () => {
    expect(parseStepParam("3", kind, 1)).toBe("location");
    expect(parseStepParam("photos", kind, 1)).toBe("photos");
    expect(parseStepParam("rooms", kind, 2)).toBe("property"); // not a step here → fallback
    expect(parseStepParam("99", kind, 1)).toBe("publish");
    expect(parseStepParam(undefined, kind, 4)).toBe("size");
    expect(parseStepParam(undefined, kind, 7)).toBe("text");
    expect(stepAt(0, kind)).toBe("deal");
  });

  it("shows fields per deal/property type", () => {
    expect(applies("sharedRoomFor", { dealType: "MONTHLY_RENT", propertyType: "ROOM" })).toBe(true);
    expect(applies("sharedRoomFor", kind)).toBe(false);
    expect(applies("condition", { dealType: "SALE", propertyType: "HOUSE" })).toBe(true);
    expect(applies("cleaningFee", { dealType: "SALE", propertyType: "HOUSE" })).toBe(false);
    expect(applies("availability", { dealType: "SALE", propertyType: "HOUSE" })).toBe(false);
  });
});

describe("step save schemas", () => {
  it("accepts a half-filled step (auto-save)", () => {
    const empty = { ...base, title: "", description: "", maxGuests: null, rooms: null };
    for (const step of ["size", "building", "features", "text"] as const) {
      expect(stepSaveSchemas[step].safeParse(pickStepData(step, empty)).success).toBe(true);
    }
  });

  it("rejects values out of range or in the wrong format", () => {
    expect(stepSaveSchemas.size.safeParse({ ...pickStepData("size", base), maxGuests: 0 }).success).toBe(false);
    expect(stepSaveSchemas.size.safeParse({ ...pickStepData("size", base), rooms: 2.3 }).success).toBe(false);
    expect(stepSaveSchemas.size.safeParse({ ...pickStepData("size", base), rooms: 2.5 }).success).toBe(true);
    expect(stepSaveSchemas.text.safeParse({ ...pickStepData("text", base), title: "x".repeat(91) }).success).toBe(false);
    expect(stepSaveSchemas.features.safeParse({ ...pickStepData("features", base), videoUrl: "http://youtube.com/x" }).success).toBe(false);
    expect(stepSaveSchemas.features.safeParse({ ...pickStepData("features", base), tour360Url: "https://my.matterport.com/show/?m=1" }).success).toBe(true);
    expect(stepSaveSchemas.building.safeParse({ ...pickStepData("building", base), cadastralCode: "abc" }).success).toBe(false);
    // Each split step sends only its own fields.
    expect(Object.keys(pickStepData("text", base)).sort()).toEqual(["description", "originalLocale", "title"]);
    expect(pickStepData("building", base)).not.toHaveProperty("title");
    expect(stepSaveSchemas.amenities.safeParse({ ...pickStepData("amenities", base), checkInFrom: "25:00" }).success).toBe(false);
    expect(stepSaveSchemas.amenities.safeParse({ ...pickStepData("amenities", base), amenities: ["jacuzzi"] }).success).toBe(false);
  });

  it("only accepts enabled currencies and https iCal links", () => {
    expect(priceStepSchema.safeParse({ ...pickStepData("price", base), currency: "GBP" }).success).toBe(false);
    expect(priceStepSchema.safeParse({ ...pickStepData("price", base), icalImportUrls: ["http://airbnb.com/a.ics"] }).success).toBe(false);
    const parsed = priceStepSchema.parse({
      ...pickStepData("price", base),
      price: 99.999,
      icalImportUrls: ["https://www.airbnb.com/calendar/ical/1.ics", ""],
    });
    expect(parsed.price).toBe(100);
    expect(parsed.icalImportUrls).toEqual(["https://www.airbnb.com/calendar/ical/1.ics"]);
    expect(
      priceStepSchema.safeParse({ ...pickStepData("price", base), icalImportUrls: ["https://a.b/1", "https://a.b/2", "https://a.b/3", "https://a.b/4"] })
        .success,
    ).toBe(false);
  });

  it("dedupes vocabularies and keeps contact methods unique and ordered", () => {
    expect(stepSaveSchemas.jewish.parse({ ...pickStepData("jewish", base), shabbatFeatures: ["hot_plate", "hot_plate"] }).shabbatFeatures).toEqual([
      "hot_plate",
    ]);
    const twice = [
      { channel: "WHATSAPP", value: "+995555123456", order: 0 },
      { channel: "WHATSAPP", value: "+995555123457", order: 1 },
    ];
    expect(contactStepSchema.safeParse({ ...pickStepData("contact", base), contactMethods: twice }).success).toBe(false);
    const parsed = contactStepSchema.parse({
      ...pickStepData("contact", base),
      contactMethods: [
        { channel: "TELEGRAM", value: "t.me/cohen_home", order: 5 },
        { channel: "PHONE", value: "+995555123456", order: 1 },
      ],
    });
    expect(parsed.contactMethods.map((m) => [m.channel, m.order, m.value])).toEqual([
      ["PHONE", 0, "+995555123456"],
      ["TELEGRAM", 1, "@cohen_home"],
    ]);
  });
});

describe("stepIssues (Next is blocked)", () => {
  it("is empty for a complete step", () => {
    for (const step of ["deal", "property", "location", "size", "building", "features", "text", "amenities", "jewish", "price", "booking", "contact"] as const) {
      expect(stepIssues(step, base, kind)).toEqual({});
    }
  });

  it("requires title and description (a short stay's guests are in the booking step)", () => {
    const issues = stepIssues("text", { ...base, title: "Short", description: "", maxGuests: null }, kind);
    expect(issues).toMatchObject({ title: "titleTooShort", description: "required" });
    expect(stepIssues("size", { ...base, maxGuests: null }, kind).maxGuests).toBeUndefined();
    // Only the essentials: "building" and "features" never block Next on empty fields.
    const blank = { ...base, floor: null, totalFloors: null, yearBuilt: null, condition: null, heating: [], views: [] };
    expect(stepIssues("building", blank, kind)).toEqual({});
    expect(stepIssues("features", blank, { dealType: "SALE", propertyType: "APARTMENT" })).toEqual({});
    expect(stepIssues("booking", { ...base, maxGuests: null }, kind).maxGuests).toBe("required");
  });

  it("needs a nightly price, guests and a payment method to take bookings", () => {
    expect(stepIssues("booking", { ...base, price: null }, kind).price).toBe("priceRequired");
    expect(stepIssues("booking", { ...base, pricePeriod: "WEEK" }, kind).price).toBe("priceRequired");
    expect(stepIssues("booking", { ...base, paymentMethodsAtCheckIn: [] }, kind).paymentMethodsAtCheckIn).toBe("paymentMethodRequired");
    expect(stepIssues("booking", { ...base, minStayNights: 91 }, kind).minStayNights).toBe("tooLarge");
    const hotel = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" } as const;
    expect(stepIssues("booking", { ...base, dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null, maxGuests: null }, hotel)).toEqual({});
  });

  it("checks cross-field rules", () => {
    expect(stepIssues("building", { ...base, floor: 10, totalFloors: 5 }, kind).floor).toBe("floorAboveTotal");
    expect(stepIssues("size", { ...base, bedrooms: 4, rooms: 2 }, kind).bedrooms).toBe("bedroomsAboveRooms");
  });

  it("requires size and rooms for a sale, and sharedRoomFor for a room", () => {
    const sale = { dealType: "SALE", propertyType: "APARTMENT" } as const;
    expect(stepIssues("size", { ...base, sizeSqm: null }, sale).sizeSqm).toBe("required");
    expect(stepIssues("size", { ...base, rooms: null }, sale).rooms).toBe("required");
    const room = { dealType: "MONTHLY_RENT", propertyType: "ROOM" } as const;
    expect(stepIssues("size", base, room).sharedRoomFor).toBe("required");
  });

  it("needs a pin inside Georgia and a city", () => {
    expect(stepIssues("location", { ...base, lat: null, lng: null }, kind).lat).toBe("pinRequired");
    expect(stepIssues("location", { ...base, lat: 32.08, lng: 34.78 }, kind).lat).toBe("outsideGeorgia");
    expect(stepIssues("location", { ...base, cityId: null }, kind).cityId).toBe("cityRequired");
  });

  it("needs a price (except hotels) and a valid period", () => {
    expect(stepIssues("price", { ...base, price: null }, kind).price).toBe("priceRequired");
    expect(stepIssues("price", { ...base, pricePeriod: "MONTH" }, kind).pricePeriod).toBe("pickOne");
    const hotel = { dealType: "HOTEL_ROOM", propertyType: "HOTEL" } as const;
    expect(stepIssues("price", { ...base, dealType: "HOTEL_ROOM", propertyType: "HOTEL", price: null }, hotel)).toEqual({});
  });

  it("validates contact values per channel", () => {
    const methods = [
      { channel: "WHATSAPP" as const, value: "+995 12", order: 0 },
      { channel: "MESSENGER" as const, value: "a b", order: 1 },
    ];
    const issues = stepIssues("contact", { ...base, contactMethods: methods }, kind);
    expect(issues["contact.WHATSAPP"]).toBe("invalidPhone");
    expect(issues["contact.MESSENGER"]).toBe("invalidMessenger");
    expect(stepIssues("contact", { ...base, contactMethods: [] }, kind).contactMethods).toBe("contactRequired");
  });
});

describe("contact helpers", () => {
  it("validates and normalizes values", () => {
    expect(contactValueProblem("PHONE", "+995555123456")).toBeNull();
    expect(contactValueProblem("TELEGRAM", "@cohen_home")).toBeNull();
    expect(contactValueProblem("TELEGRAM", "+972501234567")).toBeNull();
    expect(contactValueProblem("EMAIL", "not-an-email")).toBe("invalidEmail");
    expect(normalizeContactValue("MESSENGER", "https://m.me/john.cohen?ref=1")).toBe("john.cohen");
    expect(normalizeContactValue("EMAIL", " Name@Example.COM ")).toBe("name@example.com");
    expect(isVideoUrl("https://youtu.be/abc")).toBe(true);
    expect(isVideoUrl("https://example.com/video")).toBe(false);
  });
});

describe("room types", () => {
  it("requires a name and a positive price", () => {
    const room = { name: "Double room", price: 80, currency: "GEL", pricePeriod: "NIGHT", maxGuests: 2, bedsSingle: null, bedsDouble: 1, sizeSqm: null, quantity: 4 };
    expect(roomTypeSchema.safeParse(room).success).toBe(true);
    expect(roomTypeSchema.safeParse({ ...room, price: 0 }).success).toBe(false);
    expect(roomTypeSchema.safeParse({ ...room, name: "" }).success).toBe(false);
    expect(roomTypeSchema.safeParse({ ...room, pricePeriod: "TOTAL" }).success).toBe(false);
  });
});

describe("missingRequirements", () => {
  it("lists what blocks publishing, in step order", () => {
    const missing = missingRequirements({
      values: { ...base, price: null, contactMethods: [] },
      photoCount: 3,
      phoneVerified: false,
      pledgeAccepted: false,
    });
    expect(missing.map((m) => m.key)).toEqual(["phoneVerified", "photos", "price", "contact", "pledge"]);
    expect(missing.find((m) => m.key === "photos")?.step).toBe("photos");
    expect(missing.find((m) => m.key === "pledge")?.step).toBe("pledge");
  });

  it("is empty for a complete listing", () => {
    expect(missingRequirements({ values: base, photoCount: 5, phoneVerified: true, pledgeAccepted: true })).toEqual([]);
  });

  it("lets hotels use room-type photos and prices", () => {
    const hotel = { ...base, dealType: "HOTEL_ROOM" as const, propertyType: "HOTEL" as const, price: null, maxGuests: null };
    expect(missingRequirements({ values: hotel, photoCount: 2, roomPhotoCount: 3, pricedRoomTypes: 1, phoneVerified: true, pledgeAccepted: true })).toEqual([]);
    expect(missingRequirements({ values: hotel, photoCount: 5, pricedRoomTypes: 0, phoneVerified: true, pledgeAccepted: true })).toEqual([
      { key: "price", step: "rooms" },
    ]);
  });
});

describe("availability ranges", () => {
  it("converts between days and inclusive ranges", () => {
    const ranges = [{ start: "2026-12-30", end: "2027-01-02" }];
    expect([...rangesToDays(ranges)]).toEqual(["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
    expect(daysToRanges(["2026-11-03", "2026-11-01", "2026-11-02", "2026-11-05"])).toEqual([
      { start: "2026-11-01", end: "2026-11-03" },
      { start: "2026-11-05", end: "2026-11-05" },
    ]);
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("blocks and frees ranges", () => {
    let blocked = applyRange([], "2026-11-10", "2026-11-12", true);
    expect(blocked).toEqual([{ start: "2026-11-10", end: "2026-11-12" }]);
    expect(isRangeBlocked(blocked, "2026-11-11", "2026-11-12")).toBe(true);
    blocked = applyRange(blocked, "2026-11-11", "2026-11-11", false);
    expect(blocked).toEqual([
      { start: "2026-11-10", end: "2026-11-10" },
      { start: "2026-11-12", end: "2026-11-12" },
    ]);
  });

  it("merges, sorts and clips to today", () => {
    expect(
      normalizeRanges(
        [
          { start: "2026-11-20", end: "2026-11-22" },
          { start: "2026-10-01", end: "2026-11-02" },
          { start: "2026-11-23", end: "2026-11-25" },
        ],
        "2026-11-01",
      ),
    ).toEqual([
      { start: "2026-11-01", end: "2026-11-02" },
      { start: "2026-11-20", end: "2026-11-25" },
    ]);
  });
});

describe("the split details step (brief 5.7)", () => {
  it("opens old ?step=details links on the first of the new steps", () => {
    expect(parseStepParam("details", kind, 1)).toBe("size");
    expect(parseStepParam("details", { dealType: "HOTEL_ROOM", propertyType: "HOTEL" }, 1)).toBe("building");
  });

  it("puts size, building, features and text right after the location", () => {
    expect(stepsFor(kind).slice(2, 8)).toEqual(["location", "size", "building", "features", "text", "amenities"]);
  });

  it("lists what is missing per new step, with the step that fixes it", () => {
    const missing = missingRequirements({
      values: { ...base, title: "", videoUrl: "not a link" },
      photoCount: 10,
      phoneVerified: true,
      pledgeAccepted: true,
    });
    expect(missing.map((m) => [m.key, m.step])).toEqual([
      ["features", "features"],
      ["text", "text"],
    ]);
  });
});
