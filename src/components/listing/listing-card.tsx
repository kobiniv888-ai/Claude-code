"use client";

import { useLocale, useTranslations } from "next-intl";
import { BathIcon, BedDoubleIcon, LanguagesIcon, MapPinIcon, RulerIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatArea, formatNumber } from "@/lib/format";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { BusinessLabel, ListingBadges, ListingLabels, VerifiedBadge } from "./badges";
import { CompareToggle } from "./compare-toggle";
import { FavoriteButton } from "./favorite-button";
import { PhotoCarousel } from "./photo-carousel";
import { Price } from "./price";

export type ListingCardVariant = "grid" | "list";

/** next/image sizes for the card photo (matches ListingGrid's columns). */
const GRID_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";
const LIST_SIZES = "(min-width: 640px) 320px, 100vw";

type Fact = { key: string; icon: LucideIcon; value: string; label: string };

function useFacts(listing: ListingCardData): Fact[] {
  const t = useTranslations("listingFields.facts");
  const locale = useLocale();
  const facts: Fact[] = [];
  if (listing.bedrooms !== null) {
    facts.push(
      listing.bedrooms === 0
        ? { key: "bedrooms", icon: BedDoubleIcon, value: t("studio"), label: t("studio") }
        : {
            key: "bedrooms",
            icon: BedDoubleIcon,
            value: formatNumber(listing.bedrooms, locale),
            label: t("bedrooms", { count: listing.bedrooms }),
          },
    );
  }
  if (listing.bathrooms !== null && listing.bathrooms > 0) {
    facts.push({
      key: "bathrooms",
      icon: BathIcon,
      value: formatNumber(listing.bathrooms, locale),
      label: t("bathrooms", { count: listing.bathrooms }),
    });
  }
  if (listing.sizeSqm !== null && listing.sizeSqm > 0) {
    const area = formatArea(listing.sizeSqm, locale);
    facts.push({ key: "size", icon: RulerIcon, value: area, label: area });
  }
  if (listing.maxGuests !== null && listing.maxGuests > 0 && listing.dealType !== "SALE") {
    facts.push({
      key: "guests",
      icon: UsersIcon,
      value: formatNumber(listing.maxGuests, locale),
      label: t("upToGuests", { count: listing.maxGuests }),
    });
  }
  return facts;
}

/**
 * The listing card used in search results, the home page, favorites, owner profiles and
 * similar listings. The title link covers the whole card; the heart, compare and photo
 * buttons sit above it and are separate controls.
 */
export function ListingCard({
  listing,
  variant = "grid",
  priority = false,
  showCompare = false,
  onHover,
  className,
}: {
  listing: ListingCardData;
  variant?: ListingCardVariant;
  /** Load the first photo eagerly (cards above the fold). */
  priority?: boolean;
  /** Show the compare toggle over the photo. */
  showCompare?: boolean;
  /** For map highlighting: the public ID on hover/focus, null on leave. */
  onHover?: (publicId: number | null) => void;
  className?: string;
}) {
  const t = useTranslations("listingCard");
  const facts = useFacts(listing);
  const place = [listing.neighborhoodName, listing.cityName].filter(Boolean).join(" · ");
  const isList = variant === "list";
  const titleId = `listing-${listing.publicId}-title`;

  return (
    <article
      aria-labelledby={titleId}
      onPointerEnter={onHover ? () => onHover(listing.publicId) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(listing.publicId) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      className={cn(
        "group/card relative flex overflow-hidden rounded-2xl bg-card text-card-foreground shadow-card ring-1 ring-foreground/5",
        "transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover focus-within:ring-2 focus-within:ring-ring/60",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <div className={cn("relative z-10 shrink-0", isList && "sm:w-72 md:w-80")}>
        <PhotoCarousel
          photos={listing.photos}
          title={listing.title}
          href={listing.href}
          sizes={isList ? LIST_SIZES : GRID_SIZES}
          priority={priority}
          aspect={isList ? "aspect-[4/3] sm:aspect-auto sm:h-full sm:min-h-52" : "aspect-[4/3]"}
        />
        <ListingLabels badges={listing.badges} className="pointer-events-none absolute start-3 top-3 z-10 max-w-[70%]" />
        <div className="absolute end-2 top-2 z-20 flex flex-col gap-2">
          <FavoriteButton listingId={listing.id} title={listing.title} isFavorite={listing.isFavorite} />
          {showCompare && <CompareToggle publicId={listing.publicId} variant="icon" />}
        </div>
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-2 p-4", isList && "sm:p-5")}>
        <div className="flex items-start justify-between gap-2">
          {place ? (
            <p className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{place}</span>
            </p>
          ) : (
            <span />
          )}
          {listing.badges.verified && <VerifiedBadge className="relative z-10 shrink-0" />}
        </div>

        <h3 id={titleId} className={cn("font-semibold leading-snug", isList ? "text-lg" : "text-base")}>
          <Link
            href={listing.href}
            dir="auto"
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {listing.title}
          </Link>
        </h3>
        {listing.titleIsAutoTranslated && (
          <p className="-mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <LanguagesIcon className="size-3" aria-hidden="true" />
            {t("autoTranslated")}
          </p>
        )}

        {facts.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {facts.map(({ key, icon: Icon, value, label }) => (
              <li key={key} className="inline-flex items-center gap-1" title={label}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span aria-hidden="true">{value}</span>
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ul>
        )}

        <ListingBadges badges={listing.badges} kinds={["synagogue", "kosher", "shabbat"]} />

        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
          <Price
            amount={listing.price}
            currency={listing.currency}
            period={listing.pricePeriod}
            from={listing.priceIsFrom}
            size={isList ? "lg" : "md"}
            stacked={isList}
          />
          {listing.badges.business && <BusinessLabel />}
        </div>
      </div>
    </article>
  );
}
