"use client";

import "leaflet/dist/leaflet.css";
import "@/components/maps/listings-map.css";
import "@/components/listing-page/area-map.css";
import L from "leaflet";
import { MapContainer, Marker, ZoomControl } from "react-leaflet";
import { BaseTiles } from "@/components/maps/base-tiles";

export type TripMapViewProps = { lat: number; lng: number; label: string };

const HOUSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/></svg>';

let pinIcon: L.DivIcon | null = null;
function exactPin(): L.DivIcon {
  pinIcon ??= L.divIcon({
    className: "bayit-home-pin-marker",
    html: `<span class="bayit-home-pin">${HOUSE_SVG}</span>`,
    iconSize: [44, 52],
    iconAnchor: [22, 52],
  });
  return pinIcon;
}

/**
 * The trip page map (loaded by ./trip-map.tsx only when it is needed): the EXACT point of this
 * booking's place — shown only to its guest — with the site's house pin. CARTO tiles, light or
 * dark with the site theme (BaseTiles). One finger scrolls the page on phones.
 */
export default function TripMapView({ lat, lng, label }: TripMapViewProps) {
  const touch = typeof window !== "undefined" && L.Browser.mobile;
  return (
    <div className="bayit-map size-full">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        minZoom={11}
        maxZoom={18}
        scrollWheelZoom={false}
        dragging={!touch}
        zoomControl={false}
        className="size-full"
        attributionControl
        aria-label={label}
      >
        <BaseTiles />
        <ZoomControl position="bottomright" />
        <Marker position={[lat, lng]} icon={exactPin()} interactive={false} keyboard={false} />
      </MapContainer>
    </div>
  );
}
