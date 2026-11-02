"use client";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";
import { ListingCard } from "@/components/listing/listing-card";
import { computeShabbatFriendly } from "@/lib/listing/fields";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import type { WizardValues } from "@/lib/wizard/schemas";
import type { WizardCity, WizardPhoto, WizardRoomType } from "@/lib/wizard/types";

/** The price shown on the card: the listing's own, or "from" the cheapest room type. */
export function displayPrice(values: WizardValues, roomTypes: WizardRoomType[]) {
  if (values.price !== null && values.price > 0) {
    return { amount: values.price, currency: values.currency, period: values.pricePeriod, from: values.dealType === "HOTEL_ROOM" };
  }
  const cheapest = [...roomTypes].sort((a, b) => a.price - b.price)[0];
  return cheapest ? { amount: cheapest.price, currency: cheapest.currency, period: cheapest.pricePeriod, from: true } : null;
}

/**
 * The preview of the listing in search results: the site's one ListingCard, filled from the
 * wizard's values. `inert`: nothing on it can be clicked or focused (it is not published yet).
 * The minutes to the nearest synagogue are worked out when the listing is published, so that
 * badge is not shown here.
 */
export function PreviewCard({
  listingId,
  publicId,
  values,
  title,
  photos,
  roomTypes,
  cities,
  isBusiness,
  pledgeAccepted,
  className,
}: {
  listingId: string;
  publicId: number;
  values: WizardValues;
  title: string;
  photos: WizardPhoto[];
  roomTypes: WizardRoomType[];
  cities: WizardCity[];
  isBusiness: boolean;
  /** The owner accepted the current Bayit pledge (the green "welcomes" badge). */
  pledgeAccepted: boolean;
  className?: string;
}) {
  const t = useTranslations("wizard.publish");
  const city = cities.find((c) => c.id === values.cityId);
  const neighborhood = city?.neighborhoods.find((n) => n.id === values.neighborhoodId);
  const price = displayPrice(values, roomTypes);
  const shown = title.trim() || t("untitled");
  const own = photos.filter((photo) => !photo.roomTypeId);

  const card: ListingCardData = {
    id: listingId,
    publicId,
    href: "/post",
    title: shown,
    titleIsAutoTranslated: false,
    cityName: city?.name ?? null,
    neighborhoodName: neighborhood?.name ?? null,
    photos: own.slice(0, 6).map((photo) => ({ url: photo.url, alt: photo.alt || shown })),
    photoCount: own.length,
    floor: values.floor,
    price: price?.amount ?? null,
    currency: price?.currency ?? values.currency,
    pricePeriod: price?.period ?? values.pricePeriod,
    priceIsFrom: price?.from ?? false,
    priceUsd: null,
    dealType: values.dealType,
    propertyType: values.propertyType,
    bedrooms: values.bedrooms,
    bathrooms: values.bathrooms,
    sizeSqm: values.sizeSqm,
    maxGuests: values.maxGuests ?? roomTypes[0]?.maxGuests ?? null,
    badges: {
      welcomes: pledgeAccepted,
      verified: false,
      business: isBusiness,
      shabbatFriendly: computeShabbatFriendly(values.shabbatFeatures),
      kosherKitchen: values.kitchenKosher === "KOSHER",
      synagogueWalkMin: null,
      speaksHebrew: values.jewishFeatures.includes("host_speaks_hebrew"),
      keepsShabbat: values.jewishFeatures.includes("host_keeps_shabbat"),
      kosherMeals: values.hotelJewishFeatures.some((f) => f === "kosher_meals" || f === "kosher_breakfast"),
      isNew: true,
      priceDropped: false,
      promoted: false,
      demo: false,
    },
    lat: null,
    lng: null,
    isFavorite: false,
    publishedAt: null,
  };

  return (
    <div className={cn("relative", className)}>
      <div inert className="select-none">
        <ListingCard listing={card} />
      </div>
      {own.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-caption text-muted-foreground">
          <ImageIcon className="size-3.5" aria-hidden />
          {t("noPhoto")}
        </p>
      )}
    </div>
  );
}
