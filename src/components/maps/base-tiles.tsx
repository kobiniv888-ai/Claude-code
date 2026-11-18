"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MapPinOffIcon, TerminalIcon } from "lucide-react";
import { TileLayer, useMap } from "react-leaflet";
import { BLANK_MAP_BACKGROUND, mapTiles, type MapTheme } from "@/config/map";
import { cn } from "@/lib/utils";

/**
 * The base map layer for EVERY map on the site (search, location picker, listing area, admin exact
 * location, Jewish-life places). Put it inside <MapContainer>:
 *
 *   <MapContainer …><BaseTiles /> …markers…</MapContainer>
 *
 * - Light or dark style from the site theme (next-themes); the layer remounts when it changes.
 * - Provider, key and attribution come from src/config/map.ts only.
 * - No key: no tiles at all (never OpenStreetMap's own servers, never a watermarked tile). The map
 *   keeps working over a soft land color, with a small notice: a developer hint in development,
 *   a polite "map unavailable" in production.
 */
export function BaseTiles({ noticeClassName }: { noticeClassName?: string } = {}) {
  const map = useMap();
  const { resolvedTheme } = useTheme();
  const theme: MapTheme = resolvedTheme === "dark" ? "dark" : "light";
  const background = mapTiles.available ? mapTiles.provider.styles[theme].background : BLANK_MAP_BACKGROUND[theme];

  // The land color shows while tiles load (instead of Leaflet's grey) and when there are none.
  useEffect(() => {
    map.getContainer().style.backgroundColor = background;
  }, [map, background]);

  // Leaflet's default prefix carries a flag icon; keep a plain text credit for Leaflet itself.
  useEffect(() => {
    map.attributionControl?.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
  }, [map]);

  if (!mapTiles.available) return <MapTilesNotice className={noticeClassName} />;
  // The theme is unknown for a moment on the first render; wait instead of loading both styles.
  if (!resolvedTheme) return null;
  const style = mapTiles.provider.styles[theme];
  return (
    <TileLayer
      key={`${mapTiles.provider.id}-${theme}`}
      url={style.url}
      subdomains={style.subdomains ?? "abc"}
      maxZoom={style.maxZoom}
      maxNativeZoom={style.maxZoom}
      attribution={mapTiles.provider.attribution}
    />
  );
}

/**
 * Top center by default, 48px in from both sides so it never covers the zoom buttons (LTR or RTL);
 * pass `noticeClassName` (e.g. "top-28") to clear a map's own controls.
 */
function MapTilesNotice({ className }: { className?: string }) {
  const t = useTranslations("maps");
  const development = process.env.NODE_ENV === "development";
  const Icon = development ? TerminalIcon : MapPinOffIcon;
  return (
    <p
      role="status"
      className={cn(
        "pointer-events-none absolute inset-x-12 top-2.5 z-[1000] mx-auto flex w-fit max-w-[calc(100%-6rem)] items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span dir="auto">{development ? t("keyMissingDev") : t("unavailable")}</span>
    </p>
  );
}
