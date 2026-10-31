"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useMemo } from "react";
import { Circle, MapContainer, Marker, TileLayer } from "react-leaflet";
import { siteConfig } from "@/config/site";

/**
 * Staff-only map with the listing's EXACT pin (red) and, when known, the shifted public point
 * (dashed circle). Client-only: load through ExactLocationMapLoader. The map is always LTR.
 */
export type ExactLocationMapProps = {
  lat: number;
  lng: number;
  approx?: { lat: number; lng: number } | null;
  label: string;
};

const PIN = 36;

export default function ExactLocationMap({ lat, lng, approx, label }: ExactLocationMapProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        html:
          `<span style="display:flex;width:${PIN}px;height:${PIN}px;filter:drop-shadow(0 3px 4px rgb(0 0 0/.35))">` +
          `<svg width="${PIN}" height="${PIN}" viewBox="0 0 24 24" fill="#c2410c" stroke="white" stroke-width="1.5" aria-hidden="true" focusable="false">` +
          `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>` +
          `<circle cx="12" cy="10" r="3" fill="white"/></svg></span>`,
        className: "",
        iconSize: [PIN, PIN],
        iconAnchor: [PIN / 2, PIN - 2],
      }),
    [],
  );
  return (
    <div dir="ltr" className="h-full w-full">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        className="h-full w-full rounded-lg"
        attributionControl
        aria-label={label}
      >
        <TileLayer url={siteConfig.map.tileUrl} attribution={siteConfig.map.tileAttribution} />
        {approx ? (
          <Circle
            center={[approx.lat, approx.lng]}
            radius={siteConfig.listings.approximateLocationMeters}
            pathOptions={{ color: "#2563eb", weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }}
          />
        ) : null}
        <Marker position={[lat, lng]} icon={icon} title={label} alt={label} keyboard={false} />
      </MapContainer>
    </div>
  );
}
