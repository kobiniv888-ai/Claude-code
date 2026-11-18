"use client";

import "leaflet/dist/leaflet.css";
import "@/components/maps/listings-map.css";
import "./area-map.css";
import { useMemo } from "react";
import L from "leaflet";
import { useTheme } from "next-themes";
import { Circle, MapContainer, Marker, ZoomControl } from "react-leaflet";
import { BaseTiles } from "@/components/maps/base-tiles";
import { CommunityIconSprite, CommunityMarkers } from "@/components/maps/community-layer";
import { siteConfig } from "@/config/site";
import type { CommunityPlace } from "@/lib/map/community";

export type AreaMapProps = {
  lat: number;
  lng: number;
  label: string;
  /** Synagogues, Chabad houses and kosher places near the area (public places). */
  places?: CommunityPlace[];
};

/** Radius of the approximate-area circle (the public point is already shifted). */
const AREA_RADIUS_M = 350;
/** Places this close are kept in view when the map opens. */
const FIT_PLACES_M = 1500;

const HOUSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/></svg>';

let homeIcon: L.DivIcon | null = null;
function homePinIcon(): L.DivIcon {
  homeIcon ??= L.divIcon({
    className: "bayit-home-pin-marker",
    html: `<span class="bayit-home-pin">${HOUSE_SVG}</span>`,
    iconSize: [44, 52],
    iconAnchor: [22, 52],
  });
  return homeIcon;
}

/**
 * The approximate area only: a ~350 m circle around the public point with a house pin in its
 * middle (never the exact address), plus the nearby synagogues and kosher places (tap one for its
 * name and a walking route). CARTO tiles, light or dark with the site theme (BaseTiles).
 */
export default function AreaMap({ lat, lng, label, places = [] }: AreaMapProps) {
  const { resolvedTheme } = useTheme();
  // Navy disappears on the dark basemap: use the light brand blue there.
  const color = resolvedTheme === "dark" ? siteConfig.colors.primaryDark : siteConfig.colors.primary;
  const bounds = useMemo(() => {
    const area = L.latLng(lat, lng).toBounds(AREA_RADIUS_M * 2.6);
    const near = places.filter((place) => L.latLng(lat, lng).distanceTo([place.lat, place.lng]) <= FIT_PLACES_M);
    return near.reduce((b, place) => b.extend([place.lat, place.lng]), area);
  }, [lat, lng, places]);
  // One finger scrolls the page on phones; zoom with the buttons or two fingers.
  const touch = typeof window !== "undefined" && L.Browser.mobile;

  return (
    <div className="bayit-map size-full">
      {places.length ? <CommunityIconSprite /> : null}
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [28, 28], maxZoom: 15 }}
        minZoom={11}
        maxZoom={17}
        scrollWheelZoom={false}
        dragging={!touch}
        zoomControl={false}
        className="size-full"
        attributionControl
        aria-label={label}
      >
        <BaseTiles />
        <ZoomControl position="bottomright" />
        <Circle center={[lat, lng]} radius={AREA_RADIUS_M} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.16 }} />
        <Marker position={[lat, lng]} icon={homePinIcon()} interactive={false} keyboard={false} zIndexOffset={1000} />
        {places.length ? <CommunityMarkers places={places} /> : null}
      </MapContainer>
    </div>
  );
}
