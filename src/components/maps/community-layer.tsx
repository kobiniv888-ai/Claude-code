"use client";

import { memo, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Marker as LeafletMarker } from "leaflet";
import { FootprintsIcon } from "lucide-react";
import { Marker, Popup } from "react-leaflet";
import { KosherStampIcon, SynagogueIcon, WelcomeHomeIcon, type IconComponent } from "@/components/ds/jewish-icons";
import { dirFor } from "@/i18n/locale";
import { COMMUNITY_PLACE_TYPES, type CommunityPlace, type CommunityPlaceType } from "@/lib/map/community";
import { walkingDirectionsUrl } from "@/lib/map/view";
import { cn } from "@/lib/utils";
import { placeIcon, placeSymbolId } from "./map-icons";

/** Bayit's own icons for each community place type (never emoji). */
export const COMMUNITY_ICONS: Record<CommunityPlaceType, IconComponent> = {
  SYNAGOGUE: SynagogueIcon,
  CHABAD_HOUSE: WelcomeHomeIcon,
  KOSHER_RESTAURANT: KosherStampIcon,
  KOSHER_SHOP: KosherStampIcon,
};

/** The legend groups (kosher restaurants and shops share the kosher stamp). */
export const COMMUNITY_LEGEND = [
  { key: "synagogue", type: "SYNAGOGUE" },
  { key: "chabad", type: "CHABAD_HOUSE" },
  { key: "kosher", type: "KOSHER_RESTAURANT" },
] as const satisfies readonly { key: string; type: CommunityPlaceType }[];

/** Hidden SVG symbols the place markers point at (<use href="#…">), drawn from our React icons. */
export function CommunityIconSprite() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute size-0 overflow-hidden">
      {COMMUNITY_PLACE_TYPES.map((type) => {
        const Icon = COMMUNITY_ICONS[type];
        return (
          <symbol key={type} id={placeSymbolId(type)} viewBox="0 0 24 24">
            <Icon />
          </symbol>
        );
      })}
    </svg>
  );
}

/** A small round badge in the type's color (popup, legend). */
export function PlaceTypeBadge({ type, className }: { type: CommunityPlaceType; className?: string }) {
  const Icon = COMMUNITY_ICONS[type];
  return (
    <span aria-hidden="true" data-type={type} className={cn("bayit-place size-8! shrink-0 animate-none!", className)}>
      <Icon className="size-[18px]" />
    </span>
  );
}

/**
 * The community places on the map, each with a small popup: name, type and a walking link.
 * Memoized with stable positions: a new position would move the marker, and moving a marker with
 * an open popup pans the map again.
 */
export const CommunityMarkers = memo(function CommunityMarkers({ places }: { places: CommunityPlace[] }) {
  const items = useMemo(() => places.map((place) => ({ place, position: [place.lat, place.lng] as [number, number] })), [places]);
  return items.map(({ place, position }) => (
    <Marker
      key={place.id}
      position={position}
      icon={placeIcon(place.type)}
      title={place.name}
      alt={place.name}
      keyboard
      // Turned on to be seen: above the pills and bubbles near them (a hovered or tapped pill still wins).
      zIndexOffset={500}
      eventHandlers={{
        popupopen: (event) => (event.target as LeafletMarker).getElement()?.classList.add("is-open"),
        popupclose: (event) => (event.target as LeafletMarker).getElement()?.classList.remove("is-open"),
      }}
    >
      <Popup className="bayit-popup" closeButton autoPanPaddingTopLeft={[16, 170]} autoPanPaddingBottomRight={[16, 96]}>
        <PlacePopup place={place} />
      </Popup>
    </Marker>
  ));
});

function PlacePopup({ place }: { place: CommunityPlace }) {
  const t = useTranslations("map.community");
  const locale = useLocale();
  return (
    // The map is always left-to-right; Leaflet's close button sits on the right, hence pr-8.
    <div dir={dirFor(locale)} className="grid gap-2.5 p-3 pr-8">
      <div className="flex items-start gap-2.5">
        <PlaceTypeBadge type={place.type} />
        <div className="min-w-0">
          <div dir="auto" className="leading-snug font-semibold text-foreground">
            {place.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {t(`types.${place.type}`)}
            {place.cityName ? ` · ${place.cityName}` : null}
          </div>
        </div>
      </div>
      {place.isDemo ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">{t("demo")}</span>
          {t("demoNote")}
        </div>
      ) : null}
      {/* A demo place is not a real address: no walking route to it (round 3). */}
      {place.isDemo ? null : (
        <a
          href={walkingDirectionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("walkLabel", { name: place.name })}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground! no-underline! outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FootprintsIcon className="size-4" aria-hidden="true" />
          {t("walk")}
        </a>
      )}
    </div>
  );
}
