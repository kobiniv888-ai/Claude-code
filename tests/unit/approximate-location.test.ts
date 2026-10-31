import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { approximateLocation, haversineMeters } from "@/lib/geo";

/**
 * The public map point of a listing (Listing.approxLat/approxLng, set by
 * prepareListingDerivedFields with the listing id as the seed) must hide the real address:
 * always 40–100% of approximateLocationMeters away, and the same for the same listing.
 */
describe("approximateLocation", () => {
  const max = siteConfig.listings.approximateLocationMeters;
  const places = [
    { lat: 41.7151, lng: 44.8271 }, // Tbilisi
    { lat: 41.6168, lng: 41.6367 }, // Batumi
    { lat: 43.0453, lng: 42.7266 }, // Mestia
  ];

  it("moves the point 40–100% of the maximum distance", () => {
    for (const point of places) {
      for (let i = 0; i < 300; i++) {
        const seed = `clx${i.toString(36)}listing${i * 7919}`;
        const meters = haversineMeters(point, approximateLocation(point, seed));
        // Coordinates are rounded to 6 decimals (≈ 0.1 m).
        expect(meters).toBeGreaterThanOrEqual(max * 0.4 - 1);
        expect(meters).toBeLessThanOrEqual(max + 1);
      }
    }
  });

  it("is stable for one listing and different between listings", () => {
    const point = places[0];
    expect(approximateLocation(point, "listing-a")).toEqual(approximateLocation(point, "listing-a"));
    expect(approximateLocation(point, "listing-a")).not.toEqual(approximateLocation(point, "listing-b"));
  });

  it("spreads offsets in every direction", () => {
    const point = places[0];
    const quadrants = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = approximateLocation(point, `seed-${i}`);
      quadrants.add(`${p.lat > point.lat ? "N" : "S"}${p.lng > point.lng ? "E" : "W"}`);
    }
    expect(quadrants.size).toBe(4);
  });
});
