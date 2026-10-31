import { beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";
import { buildSearchText } from "./search-text";

vi.mock("server-only", () => ({}));

const cities = siteConfig.cities.map((c, i) => ({
  id: `city-${c.slug}`,
  slug: c.slug,
  countryCode: "GE",
  names: c.names,
  searchText: buildSearchText(c.names, c.aliases),
  lat: c.lat,
  lng: c.lng,
  timezone: c.timezone,
  photoUrl: null,
  airportCode: c.airport.code,
  airportLat: c.airport.lat,
  airportLng: c.airport.lng,
  isPopular: c.popular,
  sortOrder: i,
  active: true,
}));
const neighborhoods = [
  {
    id: "n-vake",
    cityId: "city-tbilisi",
    slug: "vake",
    names: { he: "ואקה", en: "Vake", ru: "Ваке", ar: "فاكي", ka: "ვაკე" },
    searchText: "",
    lat: 41.709,
    lng: 44.766,
    sortOrder: 0,
  },
  {
    id: "n-old",
    cityId: "city-tbilisi",
    slug: "old-tbilisi",
    names: { he: "טביליסי העתיקה", en: "Old Tbilisi", ru: "Старый Тбилиси", ar: "تبليسي القديمة", ka: "ძველი თბილისი" },
    searchText: "",
    lat: 41.69,
    lng: 44.807,
    sortOrder: 1,
  },
  {
    id: "n-old-batumi",
    cityId: "city-batumi",
    slug: "old-batumi",
    names: { he: "בטומי העתיקה", en: "Old Batumi", ru: "Старый Батуми", ar: "باتومي القديمة", ka: "ძველი ბათუმი" },
    searchText: "",
    lat: 41.65,
    lng: 41.64,
    sortOrder: 0,
  },
];

const cityFindMany = vi.fn(async () => cities);
const neighborhoodFindMany = vi.fn(async () => neighborhoods);
vi.mock("@/lib/db", () => ({
  db: { city: { findMany: cityFindMany }, neighborhood: { findMany: neighborhoodFindMany } },
}));

const places = await import("./places");

beforeEach(() => places.clearPlacesCache());

describe("searchPlaces", () => {
  it("finds Tbilisi in all five languages", async () => {
    for (const query of ["Tbilisi", "טביליסי", "Тбилиси", "تبليسي", "თბილისი", "tiflis"]) {
      const [first] = await places.searchPlaces(query, "en");
      expect(first, query).toMatchObject({ type: "city", slug: "tbilisi", citySlug: "tbilisi", name: "Tbilisi" });
    }
  });

  it("returns names in the visitor's language", async () => {
    const [first] = await places.searchPlaces("tbil", "he");
    expect(first.name).toBe("טביליסי");
  });

  it("puts the city before its neighborhoods and labels neighborhoods with their city", async () => {
    const results = await places.searchPlaces("tbilisi", "ru");
    expect(results[0].slug).toBe("tbilisi");
    const old = results.find((r) => r.slug === "old-tbilisi");
    expect(old).toMatchObject({ type: "neighborhood", citySlug: "tbilisi", name: "Старый Тбилиси", cityName: "Тбилиси" });
  });

  it("finds neighborhoods by prefix, ignoring niqqud and case", async () => {
    expect((await places.searchPlaces("VAK", "en"))[0]).toMatchObject({ slug: "vake", type: "neighborhood" });
    expect((await places.searchPlaces("וָאקֶה", "he"))[0]).toMatchObject({ slug: "vake" });
  });

  it("respects the limit and handles empty queries", async () => {
    expect(await places.searchPlaces("old", "en", 1)).toHaveLength(1);
    expect(await places.searchPlaces("   ", "en")).toEqual([]);
    expect(await places.searchPlaces("zzzz", "en")).toEqual([]);
  });
});

describe("city lookups", () => {
  it("lists cities and finds them by slug", async () => {
    expect((await places.getCities()).map((c) => c.slug)).toEqual(siteConfig.cities.map((c) => c.slug));
    expect(await places.getCityBySlug("batumi")).toMatchObject({ names: { ka: "ბათუმი" }, airportCode: "BUS" });
    expect(await places.getCityBySlug("nowhere")).toBeNull();
    expect((await places.getNeighborhoods("city-tbilisi")).map((n) => n.slug)).toEqual(["vake", "old-tbilisi"]);
    expect(await places.getNeighborhoodBySlug("batumi", "old-batumi")).toMatchObject({ id: "n-old-batumi" });
  });

  it("loads the database once while cached", async () => {
    cityFindMany.mockClear();
    await places.getCities();
    await places.searchPlaces("bat", "en");
    expect(cityFindMany).toHaveBeenCalledTimes(1);
  });
});
