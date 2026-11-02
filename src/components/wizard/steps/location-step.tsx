"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EyeOffIcon, LoaderCircleIcon, LocateFixedIcon, MapPinIcon, SearchIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { formatNumber } from "@/lib/format";
import { haversineMeters, type LatLng } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { isInGeorgia, LIMITS } from "@/lib/wizard/schemas";
import type { WizardCity } from "@/lib/wizard/types";
import { Field, FieldError, Section } from "../fields";
import type { StepProps } from "../step-props";

const LocationPicker = dynamic(() => import("@/components/maps/location-picker"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

type NominatimResult = { place_id: number; display_name: string; lat: string; lon: string };

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const SEARCH_DELAY_MS = 1100;
/** A pin farther than this from every neighborhood center is not given a neighborhood. */
const NEIGHBORHOOD_MAX_METERS = 3500;
/** A pin within this distance of a city center picks that city when none is chosen. */
const CITY_GUESS_MAX_METERS = 30_000;

function nearest<T extends LatLng>(items: T[], point: LatLng, maxMeters: number): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const d = haversineMeters(item, point);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return bestDistance <= maxMeters ? best : null;
}

/** Address search with OpenStreetMap Nominatim (from the browser, ≥ 1 s between requests). */
function AddressSearch({
  locale,
  onPick,
}: {
  locale: string;
  onPick: (result: { lat: number; lng: number; address: string }) => void;
}) {
  const t = useTranslations("wizard.location");
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const lastRequest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    const wait = Math.max(SEARCH_DELAY_MS, lastRequest.current + SEARCH_DELAY_MS - Date.now());
    const timer = setTimeout(async () => {
      lastRequest.current = Date.now();
      setState("loading");
      try {
        const url = `${NOMINATIM}?format=jsonv2&countrycodes=ge&limit=6&accept-language=${encodeURIComponent(locale)}&q=${encodeURIComponent(q)}`;
        const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as NominatimResult[];
        setResults(Array.isArray(data) ? data.slice(0, 6) : []);
        setActive(-1);
        setOpen(true);
        setState("done");
      } catch (error) {
        if ((error as Error).name !== "AbortError") setState("error");
      }
    }, wait);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  const pick = (result: NominatimResult) => {
    onPick({ lat: Number(result.lat), lng: Number(result.lon), address: result.display_name.slice(0, LIMITS.addressMax) });
    setQuery(result.display_name);
    setOpen(false);
  };

  const listId = `${id}-list`;
  const showList = open && query.trim().length >= 3 && state === "done";
  return (
    <div className="relative grid gap-2">
      <label htmlFor={`${id}-input`} className="text-sm font-medium">
        {t("searchLabel")}
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-describedby={`${id}-help`}
          dir="auto"
          autoComplete="off"
          value={query}
          placeholder={t("searchPlaceholder")}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (e.target.value.trim().length < 3) {
              setResults([]);
              setState("idle");
            }
          }}
          onKeyDown={(e) => {
            if (!showList || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(results[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="h-11 ps-9 pe-9 text-base"
        />
        {state === "loading" && (
          <LoaderCircleIcon className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
        )}
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {state === "error" ? t("searchError") : t("searchHelp")}
      </p>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("searchResults")}
          className="absolute inset-x-0 top-full z-[500] mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-card-hover"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-muted-foreground" role="presentation">
              {t("searchEmpty")}
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={result.place_id}
                id={`${id}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(result);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
                  index === active ? "bg-secondary" : "hover:bg-muted",
                )}
              >
                <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span dir="auto" className="line-clamp-2">
                  {result.display_name}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {showList ? t("searchCount", { count: results.length }) : ""}
      </p>
    </div>
  );
}

/** Step 3 — city, neighborhood, address search, pin on the map. Address and pin stay private. */
export function LocationStep({ values, set, errors, context, locale }: StepProps) {
  const t = useTranslations("wizard.location");
  const [focusKey, setFocusKey] = useState(0);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const neighborhoodTouched = useRef(values.neighborhoodId !== null);

  const cities = context.cities;
  const city: WizardCity | undefined = cities.find((c) => c.id === values.cityId);
  const pin = values.lat !== null && values.lng !== null ? { lat: values.lat, lng: values.lng } : null;
  const center = useMemo(
    () => (city ? { lat: city.lat, lng: city.lng } : siteConfig.map.defaultCenter),
    [city],
  );

  /** A new pin: guess the city (if none) and the nearest neighborhood (unless chosen by hand). */
  const placePin = (point: LatLng, extra: { address?: string } = {}) => {
    const patch: Parameters<typeof set>[0] = { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)), ...extra };
    let targetCity = city;
    if (!targetCity || haversineMeters(targetCity, point) > CITY_GUESS_MAX_METERS) {
      const guess = nearest(cities, point, CITY_GUESS_MAX_METERS);
      if (guess && guess.id !== targetCity?.id) {
        targetCity = guess;
        patch.cityId = guess.id;
        patch.neighborhoodId = null;
        neighborhoodTouched.current = false;
      }
    }
    if (targetCity && !neighborhoodTouched.current) {
      const guess = nearest(targetCity.neighborhoods, point, NEIGHBORHOOD_MAX_METERS);
      patch.neighborhoodId = guess?.id ?? null;
    }
    set(patch);
  };

  const locateMe = () => {
    if (!("geolocation" in navigator)) {
      setGeoError(t("geoUnsupported"));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isInGeorgia(point.lat, point.lng)) {
          setGeoError(t("geoOutside"));
          return;
        }
        placePin(point);
        setFocusKey((k) => k + 1);
      },
      (error) => {
        setLocating(false);
        setGeoError(error.code === error.PERMISSION_DENIED ? t("geoDenied") : t("geoFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  const pinError = errors.lat;

  return (
    <div className="grid gap-6">
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("cityLabel")} error={errors.cityId}>
            {(props) => (
              <Select
                value={values.cityId ?? ""}
                onValueChange={(cityId) => {
                  neighborhoodTouched.current = false;
                  const next = cities.find((c) => c.id === cityId);
                  // Keep the pin only if it is in (or near) the new city.
                  const keepPin = pin && next && haversineMeters(next, pin) <= CITY_GUESS_MAX_METERS;
                  set({
                    cityId,
                    neighborhoodId: keepPin && next ? nearest(next.neighborhoods, pin, NEIGHBORHOOD_MAX_METERS)?.id ?? null : null,
                    ...(keepPin ? {} : { lat: null, lng: null }),
                  });
                  setFocusKey((k) => k + 1);
                }}
              >
                <SelectTrigger {...props} className="h-11 w-full bg-card text-base">
                  <SelectValue placeholder={t("cityPlaceholder")} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  {cities.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field
            label={t("neighborhoodLabel")}
            optional
            description={city && city.neighborhoods.length > 0 ? t("neighborhoodHelp") : undefined}
          >
            {(props) => (
              <Select
                value={values.neighborhoodId ?? "none"}
                disabled={!city || city.neighborhoods.length === 0}
                onValueChange={(id) => {
                  neighborhoodTouched.current = id !== "none";
                  set({ neighborhoodId: id === "none" ? null : id });
                }}
              >
                <SelectTrigger {...props} className="h-11 w-full bg-card text-base">
                  <SelectValue placeholder={t("neighborhoodPlaceholder")} />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-80">
                  <SelectItem value="none">{t("neighborhoodNone")}</SelectItem>
                  {city?.neighborhoods.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
        </div>
        {cities.length === 0 && <p className="text-sm text-foreground">{t("noCities")}</p>}

        <AddressSearch
          locale={locale}
          onPick={({ lat, lng, address }) => {
            if (!isInGeorgia(lat, lng)) return;
            placePin({ lat, lng }, { address });
            setFocusKey((k) => k + 1);
          }}
        />

        <Field
          label={t("addressLabel")}
          description={t("addressHelp")}
          optional
          labelAddon={
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <EyeOffIcon className="size-3.5" aria-hidden />
              {t("private")}
            </span>
          }
        >
          {(props) => (
            <Input
              {...props}
              dir="auto"
              value={values.address}
              maxLength={LIMITS.addressMax}
              autoComplete="street-address"
              onChange={(e) => set({ address: e.target.value })}
              className="h-11 text-base"
            />
          )}
        </Field>
      </Section>

      <Section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-0.5">
            <h3 className="font-semibold">{t("mapTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("mapHelp")}</p>
          </div>
          <Button type="button" variant="outline" onClick={locateMe} disabled={locating} className="h-10">
            {locating ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <LocateFixedIcon aria-hidden />}
            {t("useMyLocation")}
          </Button>
        </div>
        <div
          className={cn(
            "relative h-72 overflow-hidden rounded-xl border sm:h-96",
            pinError ? "border-destructive ring-3 ring-destructive/20" : "border-border",
          )}
          data-invalid={pinError ? true : undefined}
        >
          <LocationPicker
            value={pin}
            onChange={(point) => placePin(point)}
            center={center}
            zoom={city ? siteConfig.map.defaultZoom : 7}
            focusKey={focusKey}
            labels={{ map: t("mapLabel"), pin: t("pinLabel") }}
            className="size-full"
          />
        </div>
        {geoError && <p className="text-sm text-foreground">{geoError}</p>}
        {pinError && <FieldError id="pin-error">{pinError}</FieldError>}
        {pin && (
          <p className="text-xs text-muted-foreground">
            {t("pinSet")}{" "}
            <bdi dir="ltr" className="tabular-nums">
              {formatNumber(pin.lat, locale, { maximumFractionDigits: 5 })}, {formatNumber(pin.lng, locale, { maximumFractionDigits: 5 })}
            </bdi>
          </p>
        )}
        <div className="flex items-start gap-3 rounded-xl bg-primary-tint p-3.5 text-sm text-foreground dark:bg-success/15">
          <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
          <p className="text-pretty">{t("privacyNote", { meters: siteConfig.listings.approximateLocationMeters })}</p>
        </div>
      </Section>
    </div>
  );
}
