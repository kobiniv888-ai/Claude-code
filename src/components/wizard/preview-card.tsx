"use client";

import { useLocale, useTranslations } from "next-intl";
import { BadgeCheckIcon, BedDoubleIcon, ImageIcon, MapPinIcon, MoonStarIcon, RulerIcon, UsersIcon, UtensilsCrossedIcon } from "lucide-react";
import { Ltr } from "@/components/common/ltr";
import { computeShabbatFriendly } from "@/lib/listing/fields";
import { formatArea, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WizardValues } from "@/lib/wizard/schemas";
import type { WizardCity, WizardPhoto, WizardRoomType } from "@/lib/wizard/types";
import { useOptionLabel } from "./labels";

/** The price shown on the card: the listing's own, or "from" the cheapest room type. */
export function displayPrice(values: WizardValues, roomTypes: WizardRoomType[]) {
  if (values.price !== null && values.price > 0) {
    return { amount: values.price, currency: values.currency, period: values.pricePeriod, from: values.dealType === "HOTEL_ROOM" };
  }
  const cheapest = [...roomTypes].sort((a, b) => a.price - b.price)[0];
  return cheapest ? { amount: cheapest.price, currency: cheapest.currency, period: cheapest.pricePeriod, from: true } : null;
}

/** A faithful preview of the listing card in search results. */
export function PreviewCard({
  values,
  title,
  photos,
  roomTypes,
  cities,
  isBusiness,
  className,
}: {
  values: WizardValues;
  title: string;
  photos: WizardPhoto[];
  roomTypes: WizardRoomType[];
  cities: WizardCity[];
  isBusiness: boolean;
  className?: string;
}) {
  const t = useTranslations("wizard.publish");
  const locale = useLocale();
  const label = useOptionLabel();
  const city = cities.find((c) => c.id === values.cityId);
  const neighborhood = city?.neighborhoods.find((n) => n.id === values.neighborhoodId);
  const cover = photos[0];
  const price = displayPrice(values, roomTypes);
  const shabbat = computeShabbatFriendly(values.shabbatFeatures);
  const kosher = values.kitchenKosher === "KOSHER";
  const place = [neighborhood?.name, city?.name].filter(Boolean).join(", ");

  return (
    <article className={cn("overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/5", className)}>
      <div className="relative aspect-[4/3] bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- resized WebP from our media route
          <img src={cover.url} alt={cover.alt || title} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8" aria-hidden />
            <span className="text-sm">{t("noPhoto")}</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex flex-wrap gap-1.5 p-2.5">
          {shabbat && (
            <span className="inline-flex items-center gap-1 rounded-full bg-verified px-2.5 py-1 text-xs font-semibold text-verified-foreground shadow-sm">
              <MoonStarIcon className="size-3.5" aria-hidden />
              {t("badgeShabbat")}
            </span>
          )}
          {kosher && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
              <UtensilsCrossedIcon className="size-3.5" aria-hidden />
              {t("badgeKosher")}
            </span>
          )}
          {isBusiness && (
            <span className="inline-flex items-center gap-1 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
              <BadgeCheckIcon className="size-3.5" aria-hidden />
              {t("badgeBusiness")}
            </span>
          )}
        </div>
        {photos.length > 1 && (
          <span className="absolute end-2.5 bottom-2.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
            {formatNumber(photos.length, locale)}
          </span>
        )}
      </div>
      <div className="grid gap-1.5 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label("propertyType", values.propertyType)} · {label("dealType", values.dealType)}
        </p>
        <h3 className="line-clamp-2 text-base font-semibold" dir="auto">
          {title || t("untitled")}
        </h3>
        {place && (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </p>
        )}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {values.maxGuests !== null && (
            <li className="flex items-center gap-1">
              <UsersIcon className="size-3.5" aria-hidden />
              {t("guests", { count: values.maxGuests })}
            </li>
          )}
          {values.bedrooms !== null && (
            <li className="flex items-center gap-1">
              <BedDoubleIcon className="size-3.5" aria-hidden />
              {t("bedrooms", { count: values.bedrooms })}
            </li>
          )}
          {values.sizeSqm !== null && (
            <li className="flex items-center gap-1">
              <RulerIcon className="size-3.5" aria-hidden />
              {formatArea(values.sizeSqm, locale)}
            </li>
          )}
        </ul>
        <p className="mt-1 text-base">
          {price ? (
            <>
              {price.from && <span className="text-sm text-muted-foreground">{t("from")} </span>}
              <Ltr className="font-bold">{formatMoney(price.amount, price.currency, locale)}</Ltr>
              {price.period !== "TOTAL" && <span className="text-sm text-muted-foreground"> {label("period", price.period)}</span>}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">{t("noPrice")}</span>
          )}
        </p>
      </div>
    </article>
  );
}

