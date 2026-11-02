/**
 * Map tiles — the ONE place that knows the tile provider and its key. Every map draws its base
 * layer with <BaseTiles> (src/components/maps/base-tiles.tsx), which reads only this file.
 *
 * Today: CARTO basemaps (free for commercial use up to 1M tile requests a month with a key from
 * https://carto.com/basemaps/apikey). Light = Voyager, dark = Dark Matter.
 *   NEXT_PUBLIC_MAP_TILE_KEY=<key>          required; restrict it in the CARTO dashboard to the
 *                                           production domain and *.app.github.dev
 *   NEXT_PUBLIC_MAP_TILE_PROVIDER=carto     optional; the only provider wired in so far
 *
 * To switch providers later (e.g. if we outgrow the free tier): add an entry to PROVIDERS below
 * with its light/dark URLs and attribution, then set NEXT_PUBLIC_MAP_TILE_PROVIDER. Nothing else
 * changes. Never fall back to tile.openstreetmap.org: its usage policy forbids apps (it answered
 * us with "403 Access blocked" tiles).
 *
 * Both variables are NEXT_PUBLIC_*: they are inlined into the browser bundle at build time, so
 * restart `npm run dev` / rebuild after changing them.
 */

export type MapTheme = "light" | "dark";

export type TileStyle = {
  /** Leaflet URL template ({s} subdomain, {r} "@2x" on retina screens). */
  url: string;
  subdomains?: string;
  maxZoom: number;
  /** Land color of this style: the map background while tiles load (no grey flash). */
  background: string;
};

export type TileProvider = {
  id: string;
  name: string;
  styles: Record<MapTheme, TileStyle>;
  /** HTML (Leaflet shows it in the attribution control). Keep it: the licenses require it. */
  attribution: string;
};

const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const PROVIDERS: Record<string, (key: string) => TileProvider> = {
  carto: (key) => {
    const query = `?key=${encodeURIComponent(key)}`;
    return {
      id: "carto",
      name: "CARTO",
      styles: {
        // Voyager: soft colors, readable labels, quiet enough for our price pills.
        // Positron ("light_all") is the even calmer alternative.
        light: {
          url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${query}`,
          subdomains: "abcd",
          maxZoom: 20,
          background: "#f2efe9",
        },
        dark: {
          url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png${query}`,
          subdomains: "abcd",
          maxZoom: 20,
          background: "#262626",
        },
      },
      attribution: `${OSM_CREDIT}, &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    };
  },
};

/** Background for a map without tiles (no key): soft land colors, light and dark. */
export const BLANK_MAP_BACKGROUND: Record<MapTheme, string> = {
  light: "#ece8df",
  dark: "#22262e",
};

export type MapTilesConfig =
  | { available: true; provider: TileProvider }
  | { available: false; reason: "missing-key" | "unknown-provider"; providerId: string };

/** Resolves the tile setup from the environment (exported for tests). */
export function resolveMapTiles(env: { provider?: string; key?: string }): MapTilesConfig {
  const providerId = (env.provider?.trim() || "carto").toLowerCase();
  const make = PROVIDERS[providerId];
  if (!make) return { available: false, reason: "unknown-provider", providerId };
  const key = env.key?.trim();
  if (!key) return { available: false, reason: "missing-key", providerId };
  return { available: true, provider: make(key) };
}

// Literal process.env.NEXT_PUBLIC_* reads so Next.js inlines them into the client bundle.
export const mapTiles: MapTilesConfig = resolveMapTiles({
  provider: process.env.NEXT_PUBLIC_MAP_TILE_PROVIDER,
  key: process.env.NEXT_PUBLIC_MAP_TILE_KEY,
});
