"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { ExternalLink, List } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import { BaseTiles } from "@/components/maps/base-tiles";
import { siteConfig } from "@/config/site";
import { dirFor } from "@/i18n/locale";
import { JEWISH_PLACE_TYPES, type JewishPlaceType, type PublicJewishPlace } from "@/lib/jewish-life/places";
import { PLACE_TYPE_STYLE } from "./place-type-style";
import { georgiaBounds, paddedGeorgiaBounds } from "@/lib/map-bounds";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The Jewish Life map (client-only — load it with next/dynamic and `ssr: false`).
 * The map itself is always left-to-right (tiles and controls must not flip); popups follow the page language.
 */

export type MapFocusRequest = { id: string; nonce: number } | null;

export type PlacesMapProps = {
  places: PublicJewishPlace[];
  selectedId: string | null;
  /** A marker was clicked. */
  onSelect: (id: string) => void;
  /** "Show in list" in a popup. */
  onShowInList: (id: string) => void;
  /** Fly to a place and open its popup (set when a place is picked in the list). */
  focusRequest: MapFocusRequest;
  center: { lat: number; lng: number };
  zoom: number;
  className?: string;
};

const ICON_ID = (type: JewishPlaceType) => `jl-pin-icon-${type}`;
const iconCache = new Map<string, L.DivIcon>();

/** Colored teardrop pin with the type's Lucide icon (referenced from the hidden sprite below). */
function pinIcon(type: JewishPlaceType, selected: boolean): L.DivIcon {
  const cacheKey = `${type}|${selected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;
  const size = selected ? 44 : 36;
  const icon = selected ? 22 : 18;
  // A rotated square with three round corners: the square corner becomes the tip, √2·size/2 below the center.
  const tip = Math.round(size / 2 + (size * Math.SQRT2) / 2);
  const html =
    `<span class="jl-pin flex items-center justify-center rounded-[50%_50%_50%_0] -rotate-45 border-2 border-white shadow-[0_2px_6px_rgb(0_0_0/0.35)]${
      selected ? " outline-3 outline-offset-1 outline-white/90" : ""
    }" style="width:${size}px;height:${size}px;background:${PLACE_TYPE_STYLE[type].pin}">` +
    `<svg class="rotate-45 text-white" width="${icon}" height="${icon}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="#${ICON_ID(type)}"></use></svg>` +
    `</span>`;
  const divIcon = L.divIcon({
    html,
    className:
      "jl-marker rounded-full focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring",
    iconSize: [size, size],
    iconAnchor: [size / 2, tip],
    popupAnchor: [0, -tip + 4],
  });
  iconCache.set(cacheKey, divIcon);
  return divIcon;
}

function FitToPlaces({ places }: { places: PublicJewishPlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length === 0) {
      // Nothing matches the filters: show all of Georgia, never the whole world.
      map.fitBounds(georgiaBounds());
    } else if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], 15);
    } else {
      map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])), {
        padding: [48, 48],
        maxZoom: 15,
      });
    }
  }, [map, places]);
  return null;
}

/** Leaflet needs to re-measure when the map is shown after being hidden (mobile list/map toggle). */
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function FocusOnRequest({
  request,
  places,
  markers,
}: {
  request: MapFocusRequest;
  places: PublicJewishPlace[];
  markers: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  useEffect(() => {
    if (!request) return;
    const place = places.find((p) => p.id === request.id);
    if (!place) return;
    const target: [number, number] = [place.lat, place.lng];
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.6, animate: !prefersReducedMotion() });
    map.once("moveend", () => markers.current.get(place.id)?.openPopup());
  }, [map, request, places, markers]);
  return null;
}

export default function PlacesMap({
  places,
  selectedId,
  onSelect,
  onShowInList,
  focusRequest,
  center,
  zoom,
  className,
}: PlacesMapProps) {
  const t = useTranslations("jewishLife.places");
  const locale = useLocale();
  const dir = dirFor(locale);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const centerLatLng = useMemo<[number, number]>(() => [center.lat, center.lng], [center.lat, center.lng]);

  return (
    <div dir="ltr" role="region" aria-label={t("mapLabel")} className={className}>
      {/* Icon sprite for the pins (Leaflet markers are plain HTML). */}
      <div hidden aria-hidden="true">
        {JEWISH_PLACE_TYPES.map((type) => {
          const Icon = PLACE_TYPE_STYLE[type].icon;
          return <Icon key={type} id={ICON_ID(type)} />;
        })}
      </div>
      <MapContainer
        center={centerLatLng}
        zoom={zoom}
        minZoom={siteConfig.map.minZoom}
        maxZoom={siteConfig.map.maxZoom}
        maxBounds={paddedGeorgiaBounds()}
        maxBoundsViscosity={0.9}
        scrollWheelZoom={false}
        className="z-0 size-full rounded-2xl"
      >
        {/* Below the "no places match" pill. */}
        <BaseTiles noticeClassName="top-16" />
        <ResizeWatcher />
        <FitToPlaces places={places} />
        <FocusOnRequest request={focusRequest} places={places} markers={markers} />
        {places.map((place) => {
          const style = PLACE_TYPE_STYLE[place.type];
          const selected = place.id === selectedId;
          return (
            <Marker
              key={place.id}
              position={[place.lat, place.lng]}
              icon={pinIcon(place.type, selected)}
              title={place.name}
              alt={place.name}
              zIndexOffset={selected ? 1000 : 0}
              eventHandlers={{ click: () => onSelect(place.id) }}
              ref={(marker) => {
                if (marker) markers.current.set(place.id, marker);
                else markers.current.delete(place.id);
              }}
            >
              <Popup>
                <div dir={dir} className="min-w-48 max-w-64 space-y-1.5 text-start font-sans text-neutral-900">
                  <p className="text-xs font-semibold" style={{ color: style.pin }}>
                    {t(`types.${place.type}`)}
                  </p>
                  <p className="text-sm leading-snug font-semibold" dir="auto">
                    {place.name}
                  </p>
                  {place.isDemo ? (
                    <p className="rounded-md bg-[#F4F2F7] px-2 py-1 text-xs font-medium text-[#18161F]">
                      {t("demoBadge")} · {t("demoNote")}
                    </p>
                  ) : null}
                  {place.address ? (
                    <p className="text-xs text-neutral-600" dir="auto">
                      {place.address}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
                    {/* A demo place is not a real address: no directions to it (round 3). */}
                    {place.isDemo ? null : (
                      <a
                        href={place.directionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#4B2A8C]! underline-offset-2 hover:underline"
                      >
                        {t("directions")}
                        <ExternalLink aria-hidden="true" className="size-3" />
                        <span className="sr-only">{t("opensInNewTab")}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => onShowInList(place.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#4B2A8C] underline-offset-2 hover:underline lg:hidden"
                    >
                      <List aria-hidden="true" className="size-3" />
                      {t("showInList")}
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
