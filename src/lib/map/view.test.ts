import { describe, expect, it } from "vitest";
import { countryConfig } from "@/config/countries";
import { siteConfig } from "@/config/site";
import { georgiaBounds } from "@/lib/map-bounds";
import { findGazetteerPlace } from "@/lib/places-match";
import {
  FIT_PADDING_BOTTOM_RIGHT,
  FIT_PADDING_TOP_LEFT,
  MAP_ZOOM_SNAP,
  NEIGHBORHOOD_ZOOM,
  RESULTS_MAX_ZOOM,
  countInBounds,
  fitBoundsOptions,
  hiddenBelowFold,
  pointsBounds,
  searchAreaTarget,
  walkingDirectionsUrl,
} from "./view";

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

describe("start view (round 3)", () => {
  it("fits Georgia's own box when there is nothing else to show", () => {
    expect(searchAreaTarget({ points: [] })).toEqual({ kind: "bounds", bounds: countryConfig("GE").mapBounds });
  });

  it("pads both the results and Georgia, so no point hides under the controls", () => {
    const results = searchAreaTarget({ points: [vake, batumi] });
    const georgia = searchAreaTarget({ points: [] });
    if (results.kind !== "bounds" || georgia.kind !== "bounds") throw new Error("expected bounds targets");
    expect(fitBoundsOptions(results)).toEqual({
      paddingTopLeft: FIT_PADDING_TOP_LEFT,
      paddingBottomRight: FIT_PADDING_BOTTOM_RIGHT,
      maxZoom: RESULTS_MAX_ZOOM,
    });
    expect(fitBoundsOptions(georgia)).toEqual({ paddingTopLeft: FIT_PADDING_TOP_LEFT, paddingBottomRight: FIT_PADDING_BOTTOM_RIGHT });
    // Room for half a wide sale pill at each side, the controls on top and the "List" pill below.
    expect(FIT_PADDING_TOP_LEFT[0]).toBeGreaterThanOrEqual(44);
    expect(FIT_PADDING_BOTTOM_RIGHT[0]).toBe(FIT_PADDING_TOP_LEFT[0]);
    expect(FIT_PADDING_TOP_LEFT[1]).toBeGreaterThan(FIT_PADDING_BOTTOM_RIGHT[1]);
  });

  it("keeps the results out of the part of the map below the fold", () => {
    // 1440×900: the sticky map runs from 301 to 1034 px on the first screen.
    expect(hiddenBelowFold(301, 1034, 900)).toBe(134);
    // Fully on screen (a phone's full-screen map, or after scrolling): nothing extra.
    expect(hiddenBelowFold(164, 785, 844)).toBe(0);
    expect(hiddenBelowFold(167, 900, 900)).toBe(0);
    // A very short window: at most half the map.
    expect(hiddenBelowFold(300, 1000, 400)).toBe(350);
    const results = searchAreaTarget({ points: [vake, batumi] });
    if (results.kind !== "bounds") throw new Error("expected a bounds target");
    expect(fitBoundsOptions(results, { hiddenBottom: 134 }).paddingBottomRight).toEqual([FIT_PADDING_BOTTOM_RIGHT[0], FIT_PADDING_BOTTOM_RIGHT[1] + 134]);
    expect(fitBoundsOptions(results, { hiddenBottom: 0 }).paddingBottomRight).toEqual(FIT_PADDING_BOTTOM_RIGHT);
  });

  it("fits between whole zoom steps, so the view is not up to twice too wide", () => {
    expect(MAP_ZOOM_SNAP).toBeGreaterThan(0);
    expect(MAP_ZOOM_SNAP).toBeLessThan(1);
    expect(1 / MAP_ZOOM_SNAP).toBe(Math.round(1 / MAP_ZOOM_SNAP)); // whole steps stay reachable
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
