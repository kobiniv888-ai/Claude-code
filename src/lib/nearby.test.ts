import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { pickOsmNearby, toLocalized } = await import("./nearby");

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
