"use client";

import { Clock, ExternalLink, Globe, MapPin, MapPinned, Navigation, Phone, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Ltr } from "@/components/common/ltr";
import { displayUrl, type PublicJewishPlace } from "@/lib/jewish-life/places";
import { cn } from "@/lib/utils";
import { PLACE_TYPE_STYLE } from "./place-type-style";

/** One place in the Jewish Life list. */
export function PlaceCard({
  place,
  selected,
  onShowOnMap,
}: {
  place: PublicJewishPlace;
  selected: boolean;
  onShowOnMap: () => void;
}) {
  const t = useTranslations("jewishLife.places");
  const style = PLACE_TYPE_STYLE[place.type];
  const Icon = style.icon;
  const headingId = `jl-place-${place.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-card transition-shadow",
        selected ? "border-primary ring-2 ring-primary/40" : "hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: style.pin }}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
            <span className={cn("rounded-full px-2 py-0.5", style.chip)}>{t(`types.${place.type}`)}</span>
            {place.cityName ? <span className="text-muted-foreground">{place.cityName}</span> : null}
            {place.isDemo ? (
              <span className="rounded-full border border-amber-300 bg-warning-soft px-2 py-0.5 text-amber-900 dark:border-warning/40 dark:text-warning">
                {t("demoBadge")}
              </span>
            ) : null}
          </p>
          <h3
            id={headingId}
            tabIndex={-1}
            dir="auto"
            className="mt-1.5 text-base leading-snug font-semibold text-pretty outline-none"
          >
            {place.name}
          </h3>
        </div>
      </div>

      {place.isDemo ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-amber-900 dark:text-warning">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {t("demoNote")}
        </p>
      ) : null}

      {place.description ? (
        <p dir="auto" className="mt-3 line-clamp-3 text-sm text-pretty text-muted-foreground">
          {place.description}
        </p>
      ) : null}

      <dl className="mt-3 space-y-2 text-sm">
        {place.address ? (
          <div>
            <dt className="sr-only">{t("address")}</dt>
            <dd dir="auto" className="flex min-w-0 items-start gap-2">
              <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {place.address}
            </dd>
          </div>
        ) : null}
        {place.hours ? (
          <div>
            <dt className="sr-only">{t("hours")}</dt>
            <dd dir="auto" className="flex min-w-0 items-start gap-2 whitespace-pre-line">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {place.hours}
            </dd>
          </div>
        ) : null}
        {place.phone && place.phoneHref ? (
          <div>
            <dt className="sr-only">{t("phone")}</dt>
            <dd className="flex min-w-0 items-start gap-2">
              <Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <a href={place.phoneHref} className="font-medium text-primary underline-offset-2 hover:underline">
                <Ltr>{place.phone}</Ltr>
              </a>
            </dd>
          </div>
        ) : null}
        {place.website ? (
          <div>
            <dt className="sr-only">{t("website")}</dt>
            <dd className="flex min-w-0 items-start gap-2">
              <Globe aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <a
                href={place.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="min-w-0 truncate font-medium text-primary underline-offset-2 hover:underline"
              >
                <Ltr>{displayUrl(place.website)}</Ltr>
                <span className="sr-only"> {t("opensInNewTab")}</span>
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={place.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Navigation aria-hidden="true" className="size-4" />
          {t("directions")}
          <ExternalLink aria-hidden="true" className="size-3.5 opacity-80" />
          <span className="sr-only">{t("opensInNewTab")}</span>
        </a>
        <button
          type="button"
          onClick={onShowOnMap}
          aria-describedby={headingId}
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border bg-card px-3 text-sm font-semibold whitespace-nowrap transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <MapPinned aria-hidden="true" className="size-4" />
          {t("showOnMap")}
        </button>
      </div>
    </article>
  );
}
