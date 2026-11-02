import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { georgiaBounds } from "@/lib/map-bounds";
import { findGazetteerPlace } from "@/lib/places-match";
import { NEIGHBORHOOD_ZOOM, RESULTS_MAX_ZOOM, countInBounds, pointsBounds, searchAreaTarget, walkingDirectionsUrl } from "./view";

const vake = { lat: 41.709, lng: 44.765 };
const sololaki = { lat: 41.689, lng: 44.799 };
const batumi = { lat: 41.645, lng: 41.636 };

describe("search area", () => {
  it("fits the results when there are some", () => {
    expect(searchAreaTarget({ points: [vake, sololaki], focusPlace: { citySlug: "tbilisi" } })).toEqual({
      kind: "bounds",
      bounds: [
        [41.689, 44.765],
        [41.709, 44.799],
      ],
      maxZoom: RESULTS_MAX_ZOOM,
    });
  });

  it("shows the searched city when there are no results, or when the results are limited to the map area", () => {
    const city = findGazetteerPlace("tbilisi");
    expect(city).not.toBeNull();
    const expected = { kind: "center", center: [city!.lat, city!.lng], zoom: siteConfig.map.defaultZoom };
    expect(searchAreaTarget({ points: [], focusPlace: { citySlug: "tbilisi" } })).toEqual(expected);
    expect(searchAreaTarget({ points: [vake], focusPlace: { citySlug: "tbilisi" }, ignorePoints: true })).toEqual(expected);
  });

  it("zooms closer for a neighborhood", () => {
    const target = searchAreaTarget({ points: [], focusPlace: { citySlug: "tbilisi", neighborhoodSlug: "old-tbilisi" } });
    expect(target).toMatchObject({ kind: "center", zoom: NEIGHBORHOOD_ZOOM });
  });

  it("falls back to Georgia — never the whole world", () => {
    expect(searchAreaTarget({ points: [] })).toEqual({ kind: "bounds", bounds: georgiaBounds() });
    expect(searchAreaTarget({ points: [], focusPlace: { citySlug: "atlantis" } })).toEqual({ kind: "bounds", bounds: georgiaBounds() });
    expect(searchAreaTarget({ points: [batumi], ignorePoints: true, focusPlace: null })).toEqual({ kind: "bounds", bounds: georgiaBounds() });
  });

  it("puts a single point in a zero-sized box (fitBounds then uses maxZoom)", () => {
    expect(pointsBounds([batumi])).toEqual([
      [batumi.lat, batumi.lng],
      [batumi.lat, batumi.lng],
    ]);
  });
});

describe("homes in the visible area", () => {
  const tbilisiView = { north: 41.8, south: 41.6, east: 44.9, west: 44.7 };

  it("counts only the points inside the map", () => {
    expect(countInBounds([vake, sololaki, batumi], tbilisiView)).toBe(2);
    expect(countInBounds([batumi], tbilisiView)).toBe(0);
  });

  it("counts everything before the map knows its area", () => {
    expect(countInBounds([vake, batumi], null)).toBe(2);
  });
});

describe("walking directions", () => {
  it("links to walking directions to the place", () => {
    const url = new URL(walkingDirectionsUrl({ lat: 41.6923456789, lng: 44.8012 }));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("41.692346,44.801200");
    expect(url.searchParams.get("travelmode")).toBe("walking");
  });
});
