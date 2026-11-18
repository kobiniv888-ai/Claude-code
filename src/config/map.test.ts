import { describe, expect, it } from "vitest";
import { resolveMapTiles } from "./map";

describe("resolveMapTiles", () => {
  it("builds CARTO light (Voyager) and dark (Dark Matter) URLs with the key and the credit", () => {
    const tiles = resolveMapTiles({ key: "abc 123" });
    expect(tiles.available).toBe(true);
    if (!tiles.available) return;
    expect(tiles.provider.id).toBe("carto");
    expect(tiles.provider.styles.light.url).toBe(
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=abc%20123",
    );
    expect(tiles.provider.styles.dark.url).toContain("/dark_all/{z}/{x}/{y}{r}.png?key=");
    expect(tiles.provider.styles.light.subdomains).toBe("abcd");
    expect(tiles.provider.attribution).toContain("OpenStreetMap</a> contributors");
    expect(tiles.provider.attribution).toContain("CARTO</a>");
  });

  it("has no tiles without a key, and never falls back to OpenStreetMap", () => {
    expect(resolveMapTiles({})).toEqual({ available: false, reason: "missing-key", providerId: "carto" });
    expect(resolveMapTiles({ key: "  " })).toMatchObject({ available: false, reason: "missing-key" });
    expect(JSON.stringify(resolveMapTiles({ key: "k" }))).not.toContain("tile.openstreetmap.org");
  });

  it("rejects an unknown provider instead of guessing", () => {
    expect(resolveMapTiles({ provider: "maptiler", key: "k" })).toMatchObject({
      available: false,
      reason: "unknown-provider",
    });
    expect(resolveMapTiles({ provider: " CARTO ", key: "k" }).available).toBe(true);
  });
});
