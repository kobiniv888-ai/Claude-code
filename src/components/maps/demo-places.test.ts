import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Round 3, section 3: a demo place ("בית חב״ד לדוגמה – בטומי") is not a real address, so it never
 * offers a walking route or directions — on the search map's community layer, on the Jewish life
 * map's popups or on its place cards.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe.each([
  ["src/components/maps/community-layer.tsx", "walkingDirectionsUrl(place)"],
  ["src/components/jewish-life/places-map.tsx", "place.directionsUrl"],
  ["src/components/jewish-life/place-card.tsx", "place.directionsUrl"],
])("%s", (path, link) => {
  it("renders the route link only for real places", () => {
    const source = read(path);
    const at = source.indexOf(link);
    expect(at).toBeGreaterThan(0);
    // The nearest condition before the link is the demo check.
    const before = source.slice(0, at);
    const guard = before.lastIndexOf("{place.isDemo ? null : (");
    expect(guard, "demo guard before the link").toBeGreaterThan(0);
    expect(before.slice(guard)).not.toContain(")}");
  });
});
