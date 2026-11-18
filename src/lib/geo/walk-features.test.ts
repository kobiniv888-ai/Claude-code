/**
 * The rules around the walking time to the sea / ski lifts (round 3, brief 7.3) in the modules that
 * use it: the post form's pin save, the search filters and their `where`, the listing page
 * highlight and the "Near the sea" amenity replacement.
 */
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_RATES } from "@/lib/currency/convert";
import { activeFilterChips, emptyFilters, parseSearchParams, removeFilter, serializeSearchQuery, withFilters } from "@/lib/listing/search-params";
import { buildListingWhere, NEAR_LIFTS_WHERE, NEAR_SEA_AMENITY_WHERE, NEAR_SEA_WHERE, publicListingWhere } from "@/lib/listing/where";
import { listingHighlights, orderedAmenities, walkHighlight } from "@/lib/listing-page/highlights";
import { sectionActiveCount } from "@/lib/search/filter-sections";
import { buildStepUpdate, type StepUpdateDeps, type StepUpdateListing } from "@/lib/wizard/step-update";
import { displayAmenities, NEAR_SEA_AMENITY } from "./walk-towns";

vi.mock("server-only", () => ({}));

const now = new Date("2026-11-07T12:00:00.000Z");

describe("the post form's pin save recomputes the walking times", () => {
  const listing = {
    id: "l1",
    status: "DRAFT",
    dealType: "SHORT_STAY",
    propertyType: "APARTMENT",
    countryCode: "GE",
    cityId: "batumi",
    neighborhoodId: null,
    lat: 41.65,
    lng: 41.64,
    title: "",
    description: "",
    originalLocale: "he",
    kosherCertPhotoKey: null,
    price: null,
    currency: "USD",
    pricePeriod: "NIGHT",
    paymentMethodsAtCheckIn: [],
    contactMethods: [],
    seaWalkMinutes: 9,
    liftWalkMinutes: null,
  } as StepUpdateListing;
  const calls: [string | null, number | null, number | null][] = [];
  const deps: StepUpdateDeps = {
    getCity: async (id) => (["batumi", "tbilisi"].includes(id) ? { id, countryCode: "GE" } : null),
    getNeighborhoodIds: async () => [],
    getRates: async () => ({ USD: 1 }),
    mapPoint: (point) => point,
    sealAddress: (address) => (address === null ? null : `sealed:${address}`),
    sealPin: (pin) => (pin ? `sealed-pin:${pin.lat},${pin.lng}` : null),
    walkMinutes: async (cityId, lat, lng) => {
      calls.push([cityId, lat, lng]);
      return cityId === "batumi" && lat !== null ? { seaWalkMinutes: 4, liftWalkMinutes: null } : { seaWalkMinutes: null, liftWalkMinutes: null };
    },
    parseContactMethods: () => [],
    countFutureDatePrices: async () => 0,
  };
  const user = { id: "u1", businessName: null };
  const save = (patch: Record<string, unknown>) => buildStepUpdate("location", patch as never, listing, user, deps);

  it("writes them with a moved pin, in the same update", async () => {
    const result = await save({ lat: 41.62, lng: 41.6 });
    expect(result.data).toMatchObject({ pinEnc: "sealed-pin:41.62,41.6", seaWalkMinutes: 4, liftWalkMinutes: null });
    expect(calls.at(-1)).toEqual(["batumi", 41.62, 41.6]);
  });

  it("clears them when the pin is removed or the city stops being a sea town", async () => {
    expect((await save({ lat: null, lng: null })).data).toMatchObject({ seaWalkMinutes: null, liftWalkMinutes: null });
    expect((await save({ cityId: "tbilisi" })).data).toMatchObject({ seaWalkMinutes: null, liftWalkMinutes: null });
  });

  it("leaves them alone when neither the pin nor the city changes", async () => {
    const result = await save({ address: "Rustaveli 1" });
    expect(result.data).not.toHaveProperty("seaWalkMinutes");
    expect(result.data).not.toHaveProperty("liftWalkMinutes");
  });
});

describe("the קרוב לים / קרוב למעליות filters", () => {
  it("parse only in the sea / ski towns", () => {
    expect(parseSearchParams({ city: "batumi", nearSea: "1" }).nearSea).toBe(true);
    expect(parseSearchParams({ city: "kobuleti", nearSea: "1" }).nearSea).toBe(true);
    expect(parseSearchParams({ city: "tbilisi", nearSea: "1" }).nearSea).toBe(false);
    expect(parseSearchParams({ nearSea: "1" }).nearSea).toBe(false);
    expect(parseSearchParams({ city: "gudauri", nearLifts: "1" }).nearLifts).toBe(true);
    expect(parseSearchParams({ city: "mestia", nearLifts: "1" }).nearLifts).toBe(true);
    expect(parseSearchParams({ city: "batumi", nearLifts: "1" }).nearLifts).toBe(false);
  });

  it("round-trip through the URL and drop out when the city changes", () => {
    expect(serializeSearchQuery({ city: "batumi", nearSea: true })).toBe("city=batumi&nearSea=1");
    expect(serializeSearchQuery({ city: "tbilisi", nearSea: true })).toBe("city=tbilisi");
    const batumi = parseSearchParams({ city: "batumi", nearSea: "1" });
    expect(withFilters(batumi, { city: "tbilisi" }).nearSea).toBe(false);
    expect(withFilters(batumi, { neighborhood: "gonio" }).nearSea).toBe(true);
    expect(withFilters(parseSearchParams({ city: "bakuriani", nearLifts: "1" }), { city: null }).nearLifts).toBe(false);
  });

  it("are removable chips of the amenities section", () => {
    const filters = parseSearchParams({ city: "batumi", nearSea: "1" });
    expect(activeFilterChips(filters)).toContainEqual({ key: "nearSea" });
    expect(removeFilter(filters, "nearSea").nearSea).toBe(false);
    expect(sectionActiveCount(filters, "amenities")).toBe(1);
  });

  it("filter on the computed walk: 15 minutes or less", () => {
    const ctx = { currency: "USD" as const, rates: FALLBACK_RATES, demoVisible: false, now };
    const where = (patch: Partial<ReturnType<typeof emptyFilters>>) =>
      (buildListingWhere({ ...emptyFilters(), city: "batumi", ...patch }, ctx).AND as object[]).slice(1);
    expect(NEAR_SEA_WHERE).toEqual({ seaWalkMinutes: { lte: 15 } });
    expect(NEAR_LIFTS_WHERE).toEqual({ liftWalkMinutes: { lte: 15 } });
    expect(where({ nearSea: true })).toEqual([{ city: { slug: "batumi" } }, NEAR_SEA_WHERE]);
    expect(where({ city: "gudauri", nearLifts: true })).toEqual([{ city: { slug: "gudauri" } }, NEAR_LIFTS_WHERE]);
    expect(where({})).toEqual([{ city: { slug: "batumi" } }]);
    expect((buildListingWhere(emptyFilters(), ctx).AND as object[])[0]).toEqual(publicListingWhere({ demoVisible: false, now }));
  });
});

describe("the computed walk replaces the manual \"Near the sea\" amenity once there is a pin", () => {
  it("is not shown for a pinned listing", () => {
    expect(displayAmenities(["wifi", NEAR_SEA_AMENITY, "pool"], true)).toEqual(["wifi", "pool"]);
    expect(displayAmenities(["wifi", NEAR_SEA_AMENITY], false)).toEqual(["wifi", NEAR_SEA_AMENITY]);
    expect(displayAmenities(["near_ski_lifts"], true)).toEqual(["near_ski_lifts"]);
  });

  it("is not filtered by: the amenity filter means the computed walk for pinned listings", () => {
    const ctx = { currency: "USD" as const, rates: FALLBACK_RATES, demoVisible: false, now };
    const and = (amenities: string[]) => (buildListingWhere({ ...emptyFilters(), amenities: amenities as never }, ctx).AND as object[]).slice(1);
    expect(and([NEAR_SEA_AMENITY])).toEqual([NEAR_SEA_AMENITY_WHERE]);
    expect(and(["wifi", NEAR_SEA_AMENITY])).toEqual([{ amenities: { hasEvery: ["wifi"] } }, NEAR_SEA_AMENITY_WHERE]);
    expect(NEAR_SEA_AMENITY_WHERE).toEqual({
      OR: [
        { AND: [{ pinEnc: { not: null } }, { seaWalkMinutes: { lte: 15 } }] },
        { AND: [{ pinEnc: null }, { amenities: { has: NEAR_SEA_AMENITY } }] },
      ],
    });
  });
});

describe("the listing page highlight", () => {
  const base = { dealType: "SHORT_STAY" as const, amenities: ["pool", "parking", "yard", "near_ski_lifts"], views: [], kitchenKosher: null };

  it("shows the walk to the sea or the lifts, any stored value, rounded up to 5 minutes (6.d)", () => {
    expect(walkHighlight({ seaWalkMinutes: 4 })).toEqual({ kind: "sea", minutes: 5 });
    expect(walkHighlight({ seaWalkMinutes: 22 })).toEqual({ kind: "sea", minutes: 25 });
    expect(walkHighlight({ liftWalkMinutes: 7 })).toEqual({ kind: "lift", minutes: 10 });
    expect(walkHighlight({ liftWalkMinutes: 10 })).toEqual({ kind: "lift", minutes: 10 });
    expect(walkHighlight({ seaWalkMinutes: null, liftWalkMinutes: null })).toBeNull();
    expect(walkHighlight({})).toBeNull();
  });

  it("takes the first of the three places, and makes the host's \"near the ski lifts\" redundant", () => {
    expect(listingHighlights(base)).toEqual(["pool", "near_ski_lifts", "yard"]);
    expect(listingHighlights({ ...base, seaWalkMinutes: 5 })).toEqual(["pool", "near_ski_lifts"]);
    expect(listingHighlights({ ...base, liftWalkMinutes: 5 })).toEqual(["pool", "yard"]);
  });

  it("keeps the amenities preview saying something new", () => {
    const highlights = listingHighlights({ ...base, liftWalkMinutes: 5 });
    expect(orderedAmenities(base.amenities, highlights).slice(-2)).toEqual(["yard", "pool"]);
  });
});
