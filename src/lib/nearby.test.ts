import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { pickOsmForListing, pickOsmNearby, proximityPlaceWhere, toLocalized } = await import("./nearby");

const home = { lat: 41.709, lng: 44.766 };
/** A point `meters` north of home. */
const north = (meters: number) => ({ lat: home.lat + meters / 111_320, lon: home.lng });

describe("pickOsmNearby", () => {
  it("picks the nearest supermarket and prefers a metro entrance over closer bus stops", () => {
    const result = pickOsmNearby(home, [
      { type: "node", ...north(600), tags: { shop: "supermarket", name: "Nikora" } },
      { type: "way", center: { lat: north(300).lat, lon: north(300).lon }, tags: { shop: "supermarket", name: "Carrefour", "name:he": "קרפור" } },
      { type: "node", ...north(120), tags: { highway: "bus_stop", name: "Stop 1" } },
      { type: "node", ...north(700), tags: { railway: "subway_entrance", name: "Delisi", "name:ka": "დელისი", "name:ru": "Дели́си" } },
      { type: "node", ...north(5000), tags: { shop: "supermarket", name: "Far away" } },
    ]);
    expect(result.supermarket).toMatchObject({ name: "Carrefour", names: { he: "קרפור" }, meters: 300 });
    expect(result.supermarket!.minutes).toBeGreaterThan(0);
    expect(result.transport).toMatchObject({ kind: "metro", name: "Delisi", meters: 700 });
  });

  it("uses the nearest train, tram or bus stop without a metro", () => {
    const result = pickOsmNearby(home, [
      { type: "node", ...north(400), tags: { railway: "tram_stop" } },
      { type: "node", ...north(260), tags: { highway: "bus_stop", "name:en": "Vake Park" } },
    ]);
    expect(result.transport).toMatchObject({ kind: "bus", name: "Vake Park", meters: 250 });
    expect(result.supermarket).toBeUndefined();
  });

  it("rounds distances to 50 m (never 0)", () => {
    const result = pickOsmNearby(home, [{ type: "node", ...north(12), tags: { shop: "supermarket" } }]);
    expect(result.supermarket).toEqual({ meters: 50, minutes: 1 });
  });
});

describe("pickOsmForListing (walk-trilat-1: what pages show comes from the public point)", () => {
  // The public map point, 250 m north of the pin (the offset is 120–300 m).
  const publicPoint = { lat: north(250).lat, lng: home.lng };
  const elements: Parameters<typeof pickOsmForListing>[2] = [
    { type: "node" as const, ...north(-120), tags: { shop: "supermarket", name: "Near the pin" } },
    { type: "node" as const, ...north(380), tags: { shop: "supermarket", name: "Near the public point" } },
    { type: "node" as const, ...north(-60), tags: { highway: "bus_stop", name: "Pin stop" } },
    { type: "node" as const, ...north(300), tags: { highway: "bus_stop", name: "Public stop" } },
  ];

  it("keeps the pin's picks for staff and picks the page's ones around the public point", () => {
    const { exact, public: shown } = pickOsmForListing(home, publicPoint, elements);
    expect(exact.supermarket?.name).toBe("Near the pin");
    expect(exact.transport?.name).toBe("Pin stop");
    expect(shown.supermarket?.name).toBe("Near the public point");
    expect(shown.supermarket?.meters).toBe(150);
    expect(shown.transport).toMatchObject({ name: "Public stop", meters: 50, kind: "bus" });
  });

  it("depends on the public point alone: the same answer for any pin that has that public point", () => {
    const a = pickOsmForListing(home, publicPoint, elements).public;
    const otherPin = { lat: north(500).lat, lng: home.lng }; // also 250 m from the public point
    expect(pickOsmForListing(otherPin, publicPoint, elements).public).toEqual(a);
  });

  it("only looks as far from the public point as a query around the pin surely covers (900 m)", () => {
    const far = [{ type: "node" as const, ...north(250 + 1_000), tags: { shop: "supermarket", name: "Too far" } }];
    expect(pickOsmForListing(home, publicPoint, far).public).toEqual({});
    expect(pickOsmForListing(home, null, elements).public).toEqual({});
  });
});

describe("toLocalized", () => {
  it("fills missing languages from English", () => {
    expect(toLocalized({ en: "Great Synagogue", he: "בית הכנסת הגדול" })).toEqual({
      he: "בית הכנסת הגדול",
      en: "Great Synagogue",
      ru: "Great Synagogue",
      ar: "Great Synagogue",
      ka: "Great Synagogue",
    });
    expect(toLocalized(null).en).toBe("");
  });
});

describe("proximityPlaceWhere (brief 5.9: walking times only from verified, real places)", () => {
  it("real listings use only active, non-demo places with a verification date", () => {
    expect(proximityPlaceWhere(false)).toEqual({ active: true, isDemo: false, verifiedAt: { not: null } });
  });

  it("demo listings may also use demo places, but never unverified real ones", () => {
    expect(proximityPlaceWhere(true)).toEqual({
      active: true,
      OR: [{ isDemo: false, verifiedAt: { not: null } }, { isDemo: true }],
    });
  });
});
