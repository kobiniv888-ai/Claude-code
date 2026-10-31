"use client";

import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import type { CoordText } from "@/lib/admin/content/coords";
import type { LatLng } from "@/lib/geo";
import { FormField, parseNumber } from "./form";

const LocationPicker = dynamic(() => import("@/components/maps/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

function round(value: number): string {
  return String(Math.round(value * 1e6) / 1e6);
}

/**
 * A small Leaflet map: click to place the pin, drag it to adjust (or use the arrow keys on the
 * focused pin), or type the coordinates.
 */
export function MapField({
  label,
  value,
  onChange,
  center,
  errors,
  zoom = 13,
  focusKey = 0,
}: {
  label: string;
  value: CoordText;
  onChange: (next: CoordText) => void;
  /** Where the map looks when there is no pin yet. */
  center?: LatLng | null;
  errors?: { lat?: string; lng?: string };
  zoom?: number;
  /** Bump to fly the map to the current pin (after choosing a city). */
  focusKey?: number;
}) {
  const t = useTranslations("adminContent.map");
  const lat = parseNumber(value.lat);
  const lng = parseNumber(value.lng);
  const point = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 flex items-center gap-1.5 text-sm font-medium">
        <MapPin aria-hidden className="size-4 text-muted-foreground" />
        {label}
      </legend>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="relative isolate h-64 overflow-hidden rounded-xl border sm:h-72">
        <LocationPicker
          value={point}
          onChange={(p) => onChange({ lat: round(p.lat), lng: round(p.lng) })}
          center={point ?? center ?? siteConfig.map.defaultCenter}
          zoom={zoom}
          focusKey={focusKey}
          labels={{ map: t("mapLabel"), pin: t("pinLabel") }}
          className="size-full"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("lat")} error={errors?.lat}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              inputMode="decimal"
              value={value.lat}
              onChange={(e) => onChange({ ...value, lat: e.target.value })}
              placeholder="41.7151"
            />
          )}
        </FormField>
        <FormField label={t("lng")} error={errors?.lng}>
          {(props) => (
            <Input
              {...props}
              dir="ltr"
              inputMode="decimal"
              value={value.lng}
              onChange={(e) => onChange({ ...value, lng: e.target.value })}
              placeholder="44.8271"
            />
          )}
        </FormField>
      </div>
    </fieldset>
  );
}
