import { describe, expect, it } from "vitest";
import { GAZETTEER } from "@/config/places";
import { editDistance, findGazetteerPlace, matchPlaces } from "./places-match";

const first = (query: string) => matchPlaces(query)[0];

describe("matchPlaces", () => {
  it.each([
    ["טב", "tbilisi"],
    ["Bat", "batumi"],
    ["באטומי", "batumi"],
    ["בטומי", "batumi"],
    ["tbilsi", "tbilisi"],
    ["თბ", "tbilisi"],
    ["Тби", "tbilisi"],
    ["تب", "tbilisi"],
    ["Tiflis", "tbilisi"],
    ["ტფილისი", "tbilisi"],
    ["Batum", "batumi"],
    ["batomi", "batumi"],
    ["kutaissi", "kutaisi"],
    ["stepantsminda", "kazbegi"],
    ["בורג'ומי", "borjomi"],
  ])("%s → %s (a city first)", (query, slug) => {
    const match = first(query);
    expect(match?.type).toBe("city");
    expect(match?.slug).toBe(slug);
  });

  it("finds neighborhoods with their city", () => {
    const vake = matchPlaces("vake").find((m) => m.slug === "vake");
    expect(vake).toMatchObject({ type: "neighborhood", citySlug: "tbilisi" });
    expect(vake?.cityNames?.he).toBe("טביליסי");
    // A word inside the name: "Old Tbilisi" shows up for "tbilisi", after the city.
    const results = matchPlaces("tbilisi").map((m) => m.slug);
    expect(results[0]).toBe("tbilisi");
    expect(results).toContain("old-tbilisi");
    expect(matchPlaces("ואקה")[0]?.slug).toBe("vake");
  });

  it("ignores case, niqqud and final letters", () => {
    expect(first("TBILISI")?.slug).toBe("tbilisi");
    expect(first("טְבִּילִיסִי")?.slug).toBe("tbilisi");
  });

  it("does not guess on very short or unrelated input", () => {
    expect(matchPlaces("")).toEqual([]);
    expect(matchPlaces("   ")).toEqual([]);
    expect(matchPlaces("zzzz")).toEqual([]);
    expect(matchPlaces("london")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(matchPlaces("a", { limit: 3 }).length).toBeLessThanOrEqual(3);
  });
});

describe("editDistance", () => {
  it("counts adjacent swaps as one edit", () => {
    expect(editDistance("tbilsi", "tbilisi")).toBe(1);
    expect(editDistance("tblsi", "tbilisi")).toBe(2);
    expect(editDistance("abcd", "abdc")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("kitten", "sitting", 1)).toBe(2);
  });
});

describe("gazetteer", () => {
  it("has every city and neighborhood in all five languages, with unique slugs", () => {
    const citySlugs = new Set<string>();
    for (const city of GAZETTEER) {
      expect(citySlugs.has(city.slug)).toBe(false);
      citySlugs.add(city.slug);
      for (const name of Object.values(city.names)) expect(name.trim()).not.toBe("");
      const hoodSlugs = new Set<string>();
      for (const hood of city.neighborhoods) {
        expect(hoodSlugs.has(hood.slug)).toBe(false);
        hoodSlugs.add(hood.slug);
        for (const name of Object.values(hood.names)) expect(name.trim()).not.toBe("");
      }
    }
    expect(GAZETTEER).toHaveLength(10);
  });

  it("looks up a place's coordinates", () => {
    expect(findGazetteerPlace("batumi")).toMatchObject({ type: "city" });
    expect(findGazetteerPlace("tbilisi", "vake")).toMatchObject({ type: "neighborhood", lat: 41.709 });
    expect(findGazetteerPlace("nowhere")).toBeNull();
    expect(findGazetteerPlace(null)).toBeNull();
  });
});
