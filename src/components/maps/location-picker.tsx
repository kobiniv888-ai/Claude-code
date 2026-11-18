"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import { siteConfig } from "@/config/site";
import type { LatLng } from "@/lib/geo";
import { georgiaBounds, paddedGeorgiaBounds } from "@/lib/map-bounds";
import { prefersReducedMotion } from "@/lib/motion";
import { BaseTiles } from "./base-tiles";

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
  /** 7 or less without a pin: the map shows all of Georgia instead. */
  zoom?: number;
  /** Bump to fly to `value` (after an address search or "Use my location"). */
  focusKey?: number;
  /**
   * Where a pin may go (e.g. inside Georgia). A tap elsewhere places nothing and a pin dragged
   * there goes back; `onRejected` lets the form say why.
   */
  allowed?: (point: LatLng) => boolean;
  onRejected?: () => void;
  /** Accessible names. */
  labels: { map: string; pin: string };
  className?: string;
};

/** What the map should show: the pin, the chosen city, or all of Georgia (bug 8.1). */
type View = { kind: "pin"; point: LatLng } | { kind: "city"; point: LatLng; zoom: number } | { kind: "georgia" };

function viewKey(view: View): string {
  return view.kind === "georgia" ? "georgia" : `${view.kind}:${view.point.lat},${view.point.lng}`;
}

function applyView(map: L.Map, view: View, animate: boolean) {
  if (view.kind === "georgia") {
    map.fitBounds(georgiaBounds(), { animate });
    return;
  }
  const zoom = view.kind === "pin" ? Math.max(map.getZoom(), 16) : Math.max(map.getZoom(), view.zoom);
  if (animate) map.flyTo([view.point.lat, view.point.lng], zoom, { duration: 0.8 });
  else map.setView([view.point.lat, view.point.lng], view.kind === "pin" ? 16 : view.zoom, { animate: false });
}

/**
 * Keeps the map's view right (bug 8.1: the picker opened over southern Russia). Leaflet measures
 * its box once, when it is created; if the box is still 0×0 or changes later (a lazy chunk, the
 * step's entrance, rotating the phone), Leaflet keeps the old size and the view drifts off to the
 * south-east. So: after mount and on every size change, tell Leaflet the new size and — until the
 * person has moved the map themselves — show the intended view again. A new pin, city or search
 * result (`target` changes) moves the map there.
 */
function ViewKeeper({ view, focusKey }: { view: View; focusKey: string }) {
  const map = useMap();
  const touched = useRef(false);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    const container = map.getContainer();
    const markTouched = () => {
      touched.current = true;
    };
    // Only the person's own gestures count (programmatic moves fire Leaflet's move events too).
    map.on("dragstart", markTouched);
    container.addEventListener("wheel", markTouched, { passive: true });
    container.addEventListener("touchstart", markTouched, { passive: true });
    container.addEventListener("dblclick", markTouched);
    let last = "";
    const fit = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      const size = `${Math.round(width)}x${Math.round(height)}`;
      if (size === last) return;
      last = size;
      map.invalidateSize({ animate: false });
      if (!touched.current) applyView(map, viewRef.current, false);
    };
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => fit());
    observer?.observe(container);
    return () => {
      observer?.disconnect();
      map.off("dragstart", markTouched);
      container.removeEventListener("wheel", markTouched);
      container.removeEventListener("touchstart", markTouched);
      container.removeEventListener("dblclick", markTouched);
    };
  }, [map]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    applyView(map, viewRef.current, !prefersReducedMotion());
    // Only when the key changes (a new search result, a new city), not on every drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  return null;
}

const PIN_SIZE = 40;

function pinIcon(): L.DivIcon {
  // A Lucide "map-pin" drawn inline (Leaflet's default PNG icons do not survive bundling).
  const html =
    `<span class="flex items-center justify-center drop-shadow-[0_3px_4px_rgb(0_0_0/0.35)]" style="width:${PIN_SIZE}px;height:${PIN_SIZE}px">` +
    `<svg width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 24 24" fill="var(--primary, #4b2a8c)" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>` +
    `<circle cx="12" cy="10" r="3" fill="white"/></svg></span>`;
  return L.divIcon({
    html,
    className: "rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring",
    iconSize: [PIN_SIZE, PIN_SIZE],
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE - 2],
  });
}

function ClickToDrop({ onChange, allowed, onRejected }: Pick<LocationPickerProps, "onChange" | "allowed" | "onRejected">) {
  useMapEvents({
    click(event) {
      const point = { lat: event.latlng.lat, lng: event.latlng.lng };
      if (allowed && !allowed(point)) {
        onRejected?.();
        return;
      }
      onChange(point);
    },
  });
  return null;
}

/** Moves the pin with the arrow keys when it has focus (≈ 10 m per press, 50 m with Shift). */
function KeyboardPin({
  value,
  onChange,
  allowed,
}: {
  value: LatLng | null;
  onChange: (point: LatLng) => void;
  allowed?: (point: LatLng) => boolean;
}) {
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
      if (allowed && !allowed(next)) return;
      onChange(next);
    };
    container.addEventListener("keydown", onKey, true);
    return () => container.removeEventListener("keydown", onKey, true);
  }, [map, value, onChange, allowed]);
  return null;
}

export default function LocationPicker({
  value,
  onChange,
  center,
  zoom = siteConfig.map.defaultZoom,
  focusKey = 0,
  allowed,
  onRejected,
  labels,
  className,
}: LocationPickerProps) {
  const icon = useMemo(() => pinIcon(), []);
  // No pin and no city yet: show the whole country rather than a corner of it. No pin is ever
  // placed until the person taps the map or picks a search result.
  const view: View = value
    ? { kind: "pin", point: value }
    : zoom <= 7
      ? { kind: "georgia" }
      : { kind: "city", point: center, zoom };
  const key = `${focusKey}:${value ? "pin" : viewKey(view)}`;

  return (
    <div dir="ltr" className={className} role="region" aria-label={labels.map}>
      <MapContainer
        {...(view.kind === "georgia"
          ? { bounds: georgiaBounds() }
          : { center: [view.point.lat, view.point.lng] as [number, number], zoom: view.kind === "pin" ? Math.max(zoom, 15) : zoom })}
        minZoom={siteConfig.map.minZoom}
        maxZoom={siteConfig.map.maxZoom}
        maxBounds={paddedGeorgiaBounds()}
        maxBoundsViscosity={0.9}
        scrollWheelZoom={false}
        className="size-full"
        attributionControl
      >
        <BaseTiles />
        <ClickToDrop onChange={onChange} allowed={allowed} onRejected={onRejected} />
        <KeyboardPin value={value} onChange={onChange} allowed={allowed} />
        <ViewKeeper view={view} focusKey={key} />
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
                const marker = event.target as L.Marker;
                const point = marker.getLatLng();
                if (allowed && !allowed({ lat: point.lat, lng: point.lng })) {
                  // Back to where it was: a pin outside the allowed area is never saved.
                  marker.setLatLng([value.lat, value.lng]);
                  onRejected?.();
                  return;
                }
                onChange({ lat: point.lat, lng: point.lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
