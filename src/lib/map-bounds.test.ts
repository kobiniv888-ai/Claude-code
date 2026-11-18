import { describe, expect, it } from "vitest";
import { parseSearchParams } from "@/lib/listing/search-params";
import { clampBoundsToGeorgia, georgiaBounds, paddedGeorgiaBounds } from "./map-bounds";

describe("Georgia bounds", () => {
  it("pads Georgia on every side", () => {
    const [[s, w], [n, e]] = georgiaBounds();
    const [[ps, pw], [pn, pe]] = paddedGeorgiaBounds(1);
    expect([ps, pw, pn, pe]).toEqual([s - 1, w - 1, n + 1, e + 1]);
  });

  it("clamps a world-sized area to Georgia", () => {
    const clamped = clampBoundsToGeorgia({ north: 80, south: -60, east: 170, west: -170 }, 0);
    expect(clamped).toEqual({ north: 43.6, south: 41.05, east: 46.75, west: 40 });
  });

  it("keeps an area inside Georgia as it is", () => {
    const tbilisi = { north: 41.8, south: 41.6, east: 44.9, west: 44.7 };
    expect(clampBoundsToGeorgia(tbilisi)).toEqual(tbilisi);
  });

  it("drops an area entirely outside Georgia", () => {
    expect(clampBoundsToGeorgia({ north: 32, south: 31, east: 35.5, west: 34.5 })).toBeNull();
  });

  it("is applied to bounds= in search URLs", () => {
    const world = parseSearchParams({ bounds: "85,-85,180,-180" });
    expect(world.bounds).not.toBeNull();
    expect(world.bounds!.north).toBeLessThan(46);
    expect(world.bounds!.west).toBeGreaterThan(38);
    expect(parseSearchParams({ bounds: "32,31,35.5,34.5" }).bounds).toBeNull();
  });
});
