"use client";

import "leaflet/dist/leaflet.css";
import { Circle, MapContainer, TileLayer } from "react-leaflet";
import { siteConfig } from "@/config/site";

export type AreaMapProps = { lat: number; lng: number; label: string };

/** Approximate area only: a ~350 m circle around the public point, no pin, no exact address. */
export default function AreaMap({ lat, lng, label }: AreaMapProps) {
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
      <TileLayer url={siteConfig.map.tileUrl} attribution={siteConfig.map.tileAttribution} />
      <Circle
        center={[lat, lng]}
        radius={350}
        pathOptions={{ color: siteConfig.colors.primary, weight: 2, fillColor: siteConfig.colors.primary, fillOpacity: 0.18 }}
      />
    </MapContainer>
  );
}
