import { describe, expect, it } from "vitest";
import type { JewishPlaceRecord } from "@/lib/jewish-life/places";
import { COMMUNITY_PLACE_TYPES, toCommunityPlace } from "./community";

const record = (overrides: Partial<JewishPlaceRecord> = {}): JewishPlaceRecord => ({
  id: "p1",
  type: "SYNAGOGUE",
  names: { he: "בית הכנסת הגדול", en: "Great Synagogue" },
  description: { he: "תיאור" },
  address: { he: "רחוב" },
  hours: null,
  lat: 41.69,
  lng: 44.8,
  phone: "+995 32 000 00 00",
  website: "example.ge",
  isDemo: true,
  city: { id: "c1", slug: "tbilisi", names: { he: "טביליסי", en: "Tbilisi" } },
  ...overrides,
});

describe("community places", () => {
  it("keeps synagogues, Chabad houses and kosher places only", () => {
    expect(COMMUNITY_PLACE_TYPES).toEqual(["SYNAGOGUE", "CHABAD_HOUSE", "KOSHER_RESTAURANT", "KOSHER_SHOP"]);
    expect(toCommunityPlace(record({ type: "MIKVEH" }), "he")).toBeNull();
    expect(toCommunityPlace(record({ type: "HERITAGE_SITE" }), "he")).toBeNull();
  });

  it("sends only what the map needs, in the visitor's language", () => {
    expect(toCommunityPlace(record(), "he")).toEqual({
      id: "p1",
      type: "SYNAGOGUE",
      name: "בית הכנסת הגדול",
      cityName: "טביליסי",
      lat: 41.69,
      lng: 44.8,
      isDemo: true,
    });
    // Russian is missing: English is the fallback.
    expect(toCommunityPlace(record(), "ru")).toMatchObject({ name: "Great Synagogue", cityName: "Tbilisi" });
  });

  it("drops places without a name or a usable point", () => {
    expect(toCommunityPlace(record({ names: {} }), "he")).toBeNull();
    expect(toCommunityPlace(record({ lat: Number.NaN }), "he")).toBeNull();
    expect(toCommunityPlace(record({ city: null }), "en")).toMatchObject({ cityName: null });
  });
});
