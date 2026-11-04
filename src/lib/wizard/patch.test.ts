import { describe, expect, it } from "vitest";
import {
  answeredChoices,
  confirmedFields,
  mergeAnswers,
  parseUnsent,
  pickChanged,
  presentStepKeys,
  stepsToSave,
  unsentIsNewer,
  type FieldKey,
} from "./patch";
import type { WizardValues } from "./schemas";

/** A new draft as the database creates it (the founder's listing 44 before any answer). */
const empty: WizardValues = {
  dealType: "SHORT_STAY",
  propertyType: "APARTMENT",
  businessName: "",
  cityId: null,
  neighborhoodId: null,
  address: "",
  lat: null,
  lng: null,
  rooms: null,
  bedrooms: null,
  bathrooms: null,
  bedsSingle: null,
  bedsDouble: null,
  bedsSofa: null,
  maxGuests: null,
  sizeSqm: null,
  floor: null,
  totalFloors: null,
  elevator: null,
  yearBuilt: null,
  buildingAge: null,
  furnished: null,
  condition: null,
  heating: [],
  views: [],
  cadastralCode: "",
  sharedRoomFor: null,
  originalLocale: "he",
  title: "",
  description: "",
  videoUrl: "",
  tour360Url: "",
  amenities: [],
  petsAllowed: null,
  smokingAllowed: null,
  partiesAllowed: null,
  checkInFrom: "",
  checkOutUntil: "",
  checkInFlexible: false,
  checkOutFlexible: false,
  quietHoursFrom: "",
  quietHoursTo: "",
  kitchenKosher: null,
  shabbatFeatures: [],
  jewishFeatures: [],
  hotelJewishFeatures: [],
  kosherCertName: "",
  kosherCertPhotoKey: null,
  price: null,
  currency: "USD",
  pricePeriod: "NIGHT",
  deposit: null,
  cleaningFee: null,
  utilitiesIncluded: null,
  utilitiesEstimate: null,
  minStayNights: null,
  weeklyDiscountPct: null,
  monthlyDiscountPct: null,
  icalImportUrls: [],
  weekendPrice: null,
  cancellationPolicy: "MODERATE",
  paymentMethodsAtCheckIn: [],
  contactMethods: [],
  contactHoursFrom: "",
  contactHoursTo: "",
  noReplyOnShabbat: false,
};
/** The same draft once steps 1–3 are answered. */
const saved: WizardValues = { ...empty, cityId: "batumi", neighborhoodId: "batumi-center", address: "Sherif Khimshiashvili Street 7", lat: 41.637, lng: 41.611 };
const changed = (...keys: FieldKey[]) => new Set<FieldKey>(keys);
const kind = { dealType: "SHORT_STAY", propertyType: "APARTMENT" } as const;

describe("pickChanged: a save carries only what the person changed", () => {
  it("sends nothing for a step that was only looked at (the stale step 3 of listing 44)", () => {
    // The page showed an empty step 3 (restored from the browser's cache); nothing was touched.
    expect(pickChanged("location", empty, changed())).toEqual({});
  });

  it("sends the one changed field of the step, and only fields of that step", () => {
    expect(pickChanged("location", saved, changed("address"))).toEqual({ address: "Sherif Khimshiashvili Street 7" });
    expect(pickChanged("location", saved, changed("title", "address"))).toEqual({ address: "Sherif Khimshiashvili Street 7" });
  });

  it("sends a deliberate clear", () => {
    expect(pickChanged("location", { ...saved, address: "" }, changed("address"))).toEqual({ address: "" });
    expect(pickChanged("booking", { ...saved, cleaningFee: null }, changed("cleaningFee"))).toEqual({ cleaningFee: null });
  });

  it("a field shared by two steps goes with either (maximum guests: size and booking)", () => {
    const values = { ...saved, maxGuests: 4 };
    expect(pickChanged("booking", values, changed("maxGuests"))).toEqual({ maxGuests: 4 });
    expect(pickChanged("size", values, changed("maxGuests"))).toEqual({ maxGuests: 4 });
  });
});

describe("stepsToSave: no change is left behind when leaving a step", () => {
  it("the active step first, then the first visible step that owns each other change", () => {
    expect(stepsToSave(changed("address", "title"), kind, "text")).toEqual(["text", "location"]);
    // Short stays have no "price" step: their price is saved by "booking".
    expect(stepsToSave(changed("price"), kind)).toEqual(["booking"]);
    expect(stepsToSave(changed("price"), { dealType: "SALE", propertyType: "APARTMENT" })).toEqual(["price"]);
    expect(stepsToSave(changed(), kind, "location")).toEqual([]);
  });
});

describe("presentStepKeys: the server validates only the keys that were sent", () => {
  it("ignores other steps' keys, undefined values and non-objects", () => {
    expect(presentStepKeys("location", { address: "x", title: "y", lat: undefined })).toEqual(["address"]);
    expect(presentStepKeys("location", { cityId: null })).toEqual(["cityId"]);
    expect(presentStepKeys("location", null)).toEqual([]);
    expect(presentStepKeys("location", ["address"])).toEqual([]);
  });
});

describe("mergeAnswers / confirmedFields", () => {
  it("the saved answers win, except fields changed here and not saved yet", () => {
    const onScreen = { ...empty, title: "Sea view flat" };
    const merged = mergeAnswers(saved, onScreen, changed("title"));
    expect(merged).toEqual({ ...saved, title: "Sea view flat" });
  });

  it("a field typed into while its save was on the way stays changed", () => {
    const sent = { title: "Sea view", address: "Rustaveli 1" };
    expect(confirmedFields(sent, { ...saved, title: "Sea view flat", address: "Rustaveli 1" })).toEqual(["address"]);
  });
});

describe("answeredChoices: steps 1–2 show the saved choice (no 2-second guess)", () => {
  const at = "2026-11-03T20:00:00.000Z";
  const later = "2026-11-03T20:00:30.000Z";
  const base = { status: "DRAFT", wizardStep: 1, createdAt: at, updatedAt: at, values: empty, photoCount: 0 };

  it("a draft nobody touched yet shows no choice", () => {
    expect(answeredChoices(base)).toEqual({ deal: false, property: false });
  });

  it("the deal is chosen once the draft was saved or step 1 was passed", () => {
    expect(answeredChoices({ ...base, updatedAt: later })).toEqual({ deal: true, property: false });
    expect(answeredChoices({ ...base, wizardStep: 2 })).toEqual({ deal: true, property: false });
  });

  it("the place type is chosen past step 2, for a non-default type, or with any later answer", () => {
    expect(answeredChoices({ ...base, wizardStep: 3 })).toEqual({ deal: true, property: true });
    expect(answeredChoices({ ...base, values: { ...empty, propertyType: "HOUSE" } })).toEqual({ deal: true, property: true });
    // Listing 44: back on step 1 or 2 after answering step 3 — both choices still show.
    expect(answeredChoices({ ...base, wizardStep: 1, updatedAt: later, values: saved })).toEqual({ deal: true, property: true });
    expect(answeredChoices({ ...base, photoCount: 2 })).toEqual({ deal: true, property: true });
  });

  it("published listings always show their choices", () => {
    expect(answeredChoices({ ...base, status: "LIVE" })).toEqual({ deal: true, property: true });
  });
});

describe("unsent changes in sessionStorage", () => {
  const entry = { v: 1 as const, base: "2026-11-03T20:00:00.000Z", changedAt: Date.parse("2026-11-03T20:01:00.000Z"), fields: { title: "Sea view" } };

  it("reads back only well-formed entries with known fields", () => {
    expect(parseUnsent(JSON.stringify(entry))).toEqual(entry);
    expect(parseUnsent(JSON.stringify({ ...entry, fields: { title: "x", isAdmin: true } }))?.fields).toEqual({ title: "x" });
    expect(parseUnsent(JSON.stringify({ ...entry, fields: { isAdmin: true } }))).toBeNull();
    expect(parseUnsent("{oops")).toBeNull();
    expect(parseUnsent(null)).toBeNull();
    expect(parseUnsent(JSON.stringify({ ...entry, v: 2 }))).toBeNull();
  });

  it("restores them when the server has not changed since, or when they are newer", () => {
    const received = Date.parse("2026-11-03T20:05:00.000Z");
    // The server is still where the browser left it.
    expect(unsentIsNewer(entry, { updatedAt: entry.base, serverNow: "2026-11-03T20:05:00.000Z" }, received)).toBe(true);
    // Saved elsewhere after the change: the server wins.
    expect(unsentIsNewer(entry, { updatedAt: "2026-11-03T20:03:00.000Z", serverNow: "2026-11-03T20:05:00.000Z" }, received)).toBe(false);
    // Saved before the change (by this tab, e.g. another field): the change wins.
    expect(unsentIsNewer(entry, { updatedAt: "2026-11-03T20:00:40.000Z", serverNow: "2026-11-03T20:05:00.000Z" }, received)).toBe(true);
    // The phone's clock is 2 minutes behind the server's: compared on the server's clock.
    const behind = { ...entry, changedAt: Date.parse("2026-11-03T19:59:00.000Z") };
    expect(unsentIsNewer(behind, { updatedAt: "2026-11-03T20:00:40.000Z", serverNow: "2026-11-03T20:05:00.000Z" }, Date.parse("2026-11-03T20:03:00.000Z"))).toBe(true);
  });
});
