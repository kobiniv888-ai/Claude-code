import { describe, expect, it } from "vitest";
import { buildStepUpdate, type StepUpdateDeps, type StepUpdateListing } from "./step-update";
import { stepSaveSchemas } from "./schemas";
import { presentStepKeys } from "./patch";
import type { SavableStepKey } from "./steps";

/*
 * The patch-save contract (bug 2.2), step by step: a save writes exactly the answers it carries
 * (plus the columns derived from them) and never touches an answer it does not carry. An explicit
 * empty value is a deliberate clear and is written.
 */

const listing: StepUpdateListing = {
  id: "l1",
  status: "DRAFT",
  dealType: "SHORT_STAY",
  propertyType: "APARTMENT",
  countryCode: "GE",
  cityId: "batumi",
  neighborhoodId: "batumi-center",
  lat: 41.6168,
  lng: 41.6367,
  address: "Sherif Khimshiashvili 7",
  title: "Sea view flat in Batumi",
  description: "A bright flat five minutes from the sea and the synagogue.",
  originalLocale: "he",
  rooms: 3,
  maxGuests: 4,
  cadastralCode: "05.24.11.111",
  videoUrl: null,
  kosherCertPhotoKey: null,
  kosherCertName: null,
  shabbatFeatures: ["hot_plate"],
  amenities: ["wifi"],
  checkInFrom: "14:00",
  price: 90,
  currency: "USD",
  pricePeriod: "NIGHT",
  deposit: null,
  cleaningFee: 20,
  weekendPrice: null,
  utilitiesIncluded: null,
  utilitiesEstimate: 50,
  paymentMethodsAtCheckIn: ["cash"],
  contactMethods: [{ channel: "WHATSAPP", value: "+995555123456", order: 0 }],
  noReplyOnShabbat: true,
};

const deps: StepUpdateDeps = {
  getCity: async (id) => (["batumi", "tbilisi"].includes(id) ? { id, countryCode: "GE" } : null),
  getNeighborhoodIds: async (cityId) => (cityId === "batumi" ? ["batumi-center", "old-batumi"] : ["vake"]),
  getRates: async () => ({ USD: 1, GEL: 2.7, ILS: 3.7, EUR: 0.92 }),
  mapPoint: (point) => ({ lat: point.lat + 1, lng: point.lng + 1 }),
  // Stand-ins for src/lib/field-crypto.ts: the exact address and pin are only ever written sealed.
  sealAddress: (address) => (address === null ? null : `sealed:${address}`),
  sealPin: (pin) => (pin ? `sealed-pin:${pin.lat},${pin.lng}` : null),
  walkMinutes: async () => ({}), // the walking times are tested in src/lib/geo/walk-recompute.test.ts
  parseContactMethods: (value) => (Array.isArray(value) ? (value as never[]) : []),
  countFutureDatePrices: async (listingId) => (listingId === "with-date-prices" ? 2 : 0),
};
const user = { id: "u1", businessName: null };

const update = <S extends SavableStepKey>(step: S, patch: Record<string, unknown>, row: Partial<StepUpdateListing> = {}) =>
  buildStepUpdate(step, patch as never, { ...listing, ...row }, user, deps);

describe("buildStepUpdate: nothing sent, nothing written", () => {
  it.each(["deal", "property", "location", "size", "building", "features", "text", "amenities", "jewish", "price", "booking", "contact"] as const)(
    "%s with an empty patch writes no column",
    async (step) => {
      const result = await update(step, {});
      expect(result.data).toEqual({});
      expect(result.contentChanged).toBe(false);
      expect(result.textChanged).toBe(false);
    },
  );
});

describe("buildStepUpdate per step", () => {
  it("deal: the new deal type and the property type / price period it allows", async () => {
    const result = await update("deal", { dealType: "SALE" });
    expect(result.data).toEqual({ dealType: "SALE", propertyType: "APARTMENT", pricePeriod: "TOTAL", bookingMode: "CONTACT" });
    expect(result.contentChanged).toBe(true);
  });

  it("property: only the type; the business name goes to the account", async () => {
    expect((await update("property", { propertyType: "HOUSE" })).data).toEqual({ propertyType: "HOUSE" });
    const hotel = await update("property", { businessName: "Sea Breeze" }, { dealType: "HOTEL_ROOM", propertyType: "HOTEL" });
    expect(hotel.data).toEqual({});
    expect(hotel.userUpdate).toEqual({ businessName: "Sea Breeze" });
    expect((await update("property", { propertyType: "HOTEL" })).fieldErrors).toEqual({ propertyType: ["pickOne"] });
  });

  it("location: an address change keeps the city, neighborhood and pin (the founder's listing 44)", async () => {
    const result = await update("location", { address: "Sherif Khimshiashvili 7, entrance 2, apt 14" });
    expect(result.data).toEqual({ addressEnc: "sealed:Sherif Khimshiashvili 7, entrance 2, apt 14" });
    expect(result.contentChanged).toBe(false);
  });

  it("location: clearing the city on purpose disconnects the city and its neighborhood", async () => {
    const result = await update("location", { cityId: null });
    expect(result.data).toEqual({ city: { disconnect: true }, neighborhood: { disconnect: true } });
    expect(result.contentChanged).toBe(true);
  });

  it("location: a new city keeps a neighborhood only if it belongs to it", async () => {
    const result = await update("location", { cityId: "tbilisi" });
    expect(result.data).toEqual({ city: { connect: { id: "tbilisi" } }, countryCode: "GE", neighborhood: { disconnect: true } });
    const same = await update("location", { neighborhoodId: "old-batumi" });
    expect(same.data).toEqual({ neighborhood: { connect: { id: "old-batumi" } } });
  });

  it("location: the pin is one answer with its public approximate point; outside the country is refused", async () => {
    const result = await update("location", { lat: 41.65, lng: 41.64 });
    expect(result.data).toEqual({ pinEnc: "sealed-pin:41.65,41.64", approxLat: 42.65, approxLng: 42.64 });
    expect((await update("location", { lat: 48.85, lng: 2.35 })).fieldErrors).toEqual({ lat: ["outsideGeorgia"] });
    expect((await update("location", { lat: null, lng: null })).data).toEqual({ pinEnc: null, approxLat: null, approxLng: null });
  });

  it("location: the exact address and pin are never written in plain text (SECURITY_REPORT 12.3.c)", async () => {
    const result = await update("location", { address: "Rustaveli 1, apt 3", lat: 41.65, lng: 41.64, cityId: "batumi" });
    for (const key of ["address", "lat", "lng", "legacyAddress", "legacyLat", "legacyLng"]) expect(result.data, key).not.toHaveProperty(key);
    expect(result.data).toMatchObject({ addressEnc: "sealed:Rustaveli 1, apt 3", pinEnc: "sealed-pin:41.65,41.64" });
  });

  it("location: an empty address sent on purpose is cleared", async () => {
    expect((await update("location", { address: "" })).data).toEqual({ addressEnc: null });
  });

  it("size / building / features: only the sent fields, empty text stored as null", async () => {
    expect((await update("size", { rooms: 4 })).data).toEqual({ rooms: 4 });
    expect((await update("size", { maxGuests: null })).data).toEqual({ maxGuests: null });
    expect((await update("building", { cadastralCode: "" })).data).toEqual({ cadastralCode: null });
    expect((await update("features", { videoUrl: "" })).data).toEqual({ videoUrl: null });
  });

  it("text: a new title alone keeps the description and marks translations stale", async () => {
    const result = await update("text", { title: "  Sea view flat near the promenade  " });
    expect(result.data).toEqual({ title: "Sea view flat near the promenade" });
    expect(result.textChanged).toBe(true);
    const emoji = await update("text", { title: "🏖️ Sea view flat 📍 Batumi 🎉", description: "Five minutes from the sea 🌊" });
    expect(emoji.data).toEqual({ title: "Sea view flat Batumi", description: "Five minutes from the sea 🌊" });
    const unchanged = await update("text", { description: listing.description });
    expect(unchanged.textChanged).toBe(false);
  });

  it("amenities: one time without the others", async () => {
    expect((await update("amenities", { checkOutUntil: "11:00" })).data).toEqual({ checkOutUntil: "11:00" });
    expect((await update("amenities", { checkInFrom: "" })).data).toEqual({ checkInFrom: null });
  });

  // Round 3: "גמיש" in the check-in / check-out pickers (Listing.checkInFlexible / checkOutFlexible).
  it.each(["amenities", "booking"] as const)("%s: flexible empties the time, a time turns flexible off", async (step) => {
    // What the picker sends for "גמיש": the flag and an empty time.
    expect((await update(step, { checkInFlexible: true, checkInFrom: "" })).data).toMatchObject({ checkInFlexible: true, checkInFrom: null });
    // The flag alone still empties a saved time (never both).
    expect((await update(step, { checkInFlexible: true })).data).toMatchObject({ checkInFlexible: true, checkInFrom: null });
    // A time picked after "גמיש": the flag goes off.
    expect((await update(step, { checkOutUntil: "10:30", checkOutFlexible: false })).data).toMatchObject({ checkOutUntil: "10:30", checkOutFlexible: false });
    expect((await update(step, { checkOutUntil: "10:30" }, { checkOutFlexible: true })).data).toMatchObject({ checkOutUntil: "10:30", checkOutFlexible: false });
    // "Not set" clears both.
    expect((await update(step, { checkInFrom: "", checkInFlexible: false })).data).toMatchObject({ checkInFrom: null, checkInFlexible: false });
  });

  it("amenities: a time alone writes no flag when it was already off, and the other half is untouched", async () => {
    expect((await update("amenities", { checkInFrom: "15:00" }, { checkInFlexible: false })).data).toEqual({ checkInFrom: "15:00" });
    expect((await update("amenities", { checkOutFlexible: true }, { checkOutUntil: null })).data).toEqual({ checkOutFlexible: true });
    const outOnly = (await update("amenities", { checkOutFlexible: true }, { checkOutUntil: "11:00" })).data;
    expect(outOnly).toEqual({ checkOutFlexible: true, checkOutUntil: null });
    expect(outOnly).not.toHaveProperty("checkInFrom");
  });

  it("a saved time outside the usual list (10:00 check-in) is kept by an unrelated save", async () => {
    const result = await update("booking", { cleaningFee: 25 }, { checkInFrom: "10:00" });
    expect(result.data).not.toHaveProperty("checkInFrom");
    expect(result.data).not.toHaveProperty("checkInFlexible");
  });

  it("jewish: Shabbat features recompute the badge; hotel-only fields stay empty for homes", async () => {
    const result = await update("jewish", { shabbatFeatures: ["mechanical_key", "no_motion_sensors", "hot_plate"] });
    expect(result.data).toEqual({ shabbatFeatures: ["mechanical_key", "no_motion_sensors", "hot_plate"], isShabbatFriendly: true });
    expect((await update("jewish", { hotelJewishFeatures: ["kosher_breakfast"] })).data).toEqual({ hotelJewishFeatures: [] });
    expect((await update("jewish", { kosherCertPhotoKey: "someone-else/x.jpg" })).fieldErrors).toEqual({ kosherCertPhotoKey: ["invalid"] });
  });

  it("price: a deposit alone; a price brings its USD value; included utilities clear the estimate", async () => {
    const rent = { dealType: "MONTHLY_RENT", pricePeriod: "MONTH", price: 700 } as const;
    expect((await update("price", { deposit: 700 }, rent)).data).toEqual({ deposit: 700 });
    expect((await update("price", { price: 2700, currency: "GEL" }, rent)).data).toEqual({ price: 2700, currency: "GEL", priceUsd: 1000 });
    expect((await update("price", { utilitiesIncluded: true }, rent)).data).toEqual({ utilitiesIncluded: true, utilitiesEstimate: null });
    expect((await update("price", { pricePeriod: "NIGHT" }, rent)).data).toEqual({ pricePeriod: "MONTH" });
  });

  it("booking: a fee alone keeps the price and recomputes instant booking", async () => {
    const result = await update("booking", { cleaningFee: 25 });
    expect(result.data).toEqual({ cleaningFee: 25, bookingMode: "INSTANT" });
    const noPayment = await update("booking", { paymentMethodsAtCheckIn: [] });
    expect(noPayment.data).toMatchObject({ paymentMethodsAtCheckIn: [], bookingMode: "CONTACT" });
    const nightly = await update("booking", { price: 100, pricePeriod: "NIGHT" });
    expect(nightly.data).toMatchObject({ price: 100, pricePeriod: "NIGHT", priceUsd: 100, bookingMode: "INSTANT" });
    expect(nightly.contentChanged).toBe(true);
  });

  it("booking: hotels turn instant booking on too (round 3, phase 4); guests book them only with an active room type", async () => {
    const hotel = { dealType: "HOTEL_ROOM", propertyType: "HOTEL", pricePeriod: "NIGHT" } as const;
    expect((await update("booking", { cleaningFee: 25 }, hotel)).data).toMatchObject({ cleaningFee: 25, bookingMode: "INSTANT" });
    expect((await update("booking", { paymentMethodsAtCheckIn: [] }, hotel)).data).toMatchObject({ bookingMode: "CONTACT" });
  });

  it("booking: long-stay discounts are saved as typed (round 3, brief 6.3) and count as a price change", async () => {
    const result = await update("booking", { weeklyDiscountPct: 10, monthlyDiscountPct: 20 });
    expect(result.data).toMatchObject({ weeklyDiscountPct: 10, monthlyDiscountPct: 20, bookingMode: "INSTANT" });
    expect(result.contentChanged).toBe(true);
    expect((await update("booking", { weeklyDiscountPct: null })).data).toMatchObject({ weeklyDiscountPct: null });
  });

  it("booking: a price change of a live listing is recorded", async () => {
    const result = await update("booking", { price: 80 }, { status: "LIVE" });
    expect(result.priceChange).toEqual({ oldPrice: 90, newPrice: 80, currency: "USD" });
    expect((await update("booking", { cleaningFee: 30 }, { status: "LIVE" })).priceChange).toBeUndefined();
  });

  it("contact: one setting without the methods; methods of a live listing must work", async () => {
    expect((await update("contact", { noReplyOnShabbat: false })).data).toEqual({ noReplyOnShabbat: false });
    const bad = await update("contact", { contactMethods: [{ channel: "WHATSAPP", value: "123", order: 0 }] }, { status: "LIVE" });
    expect(bad.fieldErrors).toEqual({ "contact.WHATSAPP": ["invalidPhone"] });
    const added = await update("contact", {
      contactMethods: [
        { channel: "WHATSAPP", value: "+995555123456", order: 0 },
        { channel: "PHONE", value: "+995555123456", order: 1 },
      ],
    });
    expect(added.contentChanged).toBe(true);
  });
});

describe("the save schema picked to the sent keys (updateDraft)", () => {
  const parse = (step: SavableStepKey, data: Record<string, unknown>) => {
    const keys = presentStepKeys(step, data);
    const schema = (stepSaveSchemas[step] as unknown as { pick: (mask: Record<string, true>) => { safeParse: (v: unknown) => { success: boolean; data?: unknown } } }).pick(
      Object.fromEntries(keys.map((key) => [key, true])),
    );
    return schema.safeParse(Object.fromEntries(keys.map((key) => [key, data[key]])));
  };

  it("never fills in defaults for answers that were not sent", () => {
    // The full schema would turn a missing address into "" (and the old save then wrote null).
    expect(parse("location", { cityId: "batumi" }).data).toEqual({ cityId: "batumi" });
    expect(parse("text", { title: "Sea view" }).data).toEqual({ title: "Sea view" });
    expect(parse("amenities", {}).data).toEqual({});
  });

  it("ignores keys of other steps and still validates the sent ones", () => {
    expect(parse("size", { rooms: 2, title: "x" }).data).toEqual({ rooms: 2 });
    expect(parse("size", { rooms: 2.25 }).success).toBe(false);
    expect(parse("location", { address: "x".repeat(201) }).success).toBe(false);
  });
});

describe("a new currency while holiday prices are set (price-2)", () => {
  it("is refused in the price and booking steps until the holiday prices are changed or deleted", async () => {
    for (const step of ["price", "booking"] as const) {
      const refused = await update(step, { currency: "GEL" }, { id: "with-date-prices", currency: "USD" });
      expect(refused.fieldErrors, step).toEqual({ currency: ["datePricesExist"] });
      expect(refused.data, step).toEqual({});
    }
  });

  it("is saved without holiday prices, and the same currency is never refused", async () => {
    const free = await update("price", { currency: "GEL" }, { id: "no-date-prices", currency: "USD" });
    expect(free.fieldErrors).toBeUndefined();
    expect(free.data).toMatchObject({ currency: "GEL" });
    const same = await update("booking", { currency: "USD", price: 90 }, { id: "with-date-prices", currency: "USD" });
    expect(same.fieldErrors).toBeUndefined();
  });
});
