"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { siteConfig } from "@/config/site";
import type { LatLng } from "@/lib/geo";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Map with one draggable pin for choosing a listing's exact location (client-only — load it
 * with next/dynamic and `ssr: false`). Click the map to drop the pin, drag it to adjust, or use
 * the arrow keys on the focused pin. The map itself is always left-to-right.
 */

export type LocationPickerProps = {
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  /** Where to look when there is no pin yet (the chosen city). */
  center: LatLng;
  zoom?: number;
  /** Bump to fly to `value` (after an address search or "Use my location"). */
  focusKey?: number;
  /** Accessible names. */
  labels: { map: string; pin: string };
  className?: string;
};

const PIN_SIZE = 40;

function pinIcon(): L.DivIcon {
  // A Lucide "map-pin" drawn inline (Leaflet's default PNG icons do not survive bundling).
  const html =
    `<span class="flex items-center justify-center drop-shadow-[0_3px_4px_rgb(0_0_0/0.35)]" style="width:${PIN_SIZE}px;height:${PIN_SIZE}px">` +
    `<svg width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 24 24" fill="var(--terracotta, #b4533a)" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>` +
    `<circle cx="12" cy="10" r="3" fill="white"/></svg></span>`;
  return L.divIcon({
    html,
    className: "rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE - 2],
  });
}

function ClickToDrop({ onChange }: { onChange: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

function FlyTo({ point, zoom, focusKey }: { point: LatLng; zoom: number; focusKey: string }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), zoom), { duration: 0.8, animate: !prefersReducedMotion() });
    // Only when the key changes (a new search result, a new city), not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  return null;
}

/** Moves the pin with the arrow keys when it has focus (≈ 10 m per press, 50 m with Shift). */
function KeyboardPin({ value, onChange }: { value: LatLng | null; onChange: (point: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!value || !target?.classList.contains("leaflet-marker-icon")) return;
      const meters = event.shiftKey ? 50 : 10;
      const dLat = meters / 111_320;
      const dLng = meters / (111_320 * Math.cos((value.lat * Math.PI) / 180));
      const moves: Record<string, LatLng> = {
        ArrowUp: { lat: value.lat + dLat, lng: value.lng },
        ArrowDown: { lat: value.lat - dLat, lng: value.lng },
        ArrowLeft: { lat: value.lat, lng: value.lng - dLng },
        ArrowRight: { lat: value.lat, lng: value.lng + dLng },
      };
      const next = moves[event.key];
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(next);
    };
    container.addEventListener("keydown", onKey, true);
    return () => container.removeEventListener("keydown", onKey, true);
  }, [map, value, onChange]);
  return null;
}

export default function LocationPicker({
  value,
  onChange,
  center,
  zoom = siteConfig.map.defaultZoom,
  focusKey = 0,
  labels,
  className,
}: LocationPickerProps) {
  const icon = useMemo(() => pinIcon(), []);
  const start = value ?? center;
  const target = value ?? center;

  return (
    <div dir="ltr" className={className} role="region" aria-label={labels.map}>
      <MapContainer
        center={[start.lat, start.lng]}
        zoom={value ? Math.max(zoom, 15) : zoom}
        scrollWheelZoom={false}
        className="size-full"
        attributionControl
      >
        <TileLayer url={siteConfig.map.tileUrl} attribution={siteConfig.map.tileAttribution} />
        <ClickToDrop onChange={onChange} />
        <KeyboardPin value={value} onChange={onChange} />
        <FlyTo point={target} zoom={value ? 16 : zoom} focusKey={`${focusKey}:${value ? "pin" : `${center.lat},${center.lng}`}`} />
        {value && (
          <Marker
            position={[value.lat, value.lng]}
            icon={icon}
            draggable
            keyboard
            title={labels.pin}
            alt={labels.pin}
            eventHandlers={{
              dragend(event) {
                const point = (event.target as L.Marker).getLatLng();
                onChange({ lat: point.lat, lng: point.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
