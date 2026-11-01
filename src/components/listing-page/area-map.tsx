"use client";

import "leaflet/dist/leaflet.css";
import { useTheme } from "next-themes";
import { Circle, MapContainer } from "react-leaflet";
import { BaseTiles } from "@/components/maps/base-tiles";
import { siteConfig } from "@/config/site";

export type AreaMapProps = { lat: number; lng: number; label: string };

/** Approximate area only: a ~350 m circle around the public point, no pin, no exact address. */
export default function AreaMap({ lat, lng, label }: AreaMapProps) {
  const { resolvedTheme } = useTheme();
  // Navy disappears on the dark basemap: use the light brand blue there.
  const color = resolvedTheme === "dark" ? siteConfig.colors.primaryDark : siteConfig.colors.primary;
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      minZoom={11}
      maxZoom={16}
      scrollWheelZoom={false}
      className="size-full"
      attributionControl
      aria-label={label}
    >
      <BaseTiles />
      <Circle center={[lat, lng]} radius={350} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.18 }} />
    </MapContainer>
  );
}
