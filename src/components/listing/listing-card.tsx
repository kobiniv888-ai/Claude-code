import { useLocale, useTranslations } from "next-intl";
import { BathIcon, BedDoubleIcon, Building2Icon, LanguagesIcon, MapPinIcon, RulerIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { BadgeRow, BayitBadge, listingBadgeItems, listingPhotoTags } from "@/components/ds/badges";
import { Link } from "@/i18n/navigation";
import { formatArea, formatNumber } from "@/lib/format";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { CompareToggle } from "./compare-toggle";
import { FavoriteButton } from "./favorite-button";
import { PhotoCarousel } from "./photo-carousel";
import { Price } from "./price";

export type ListingCardVariant = "grid" | "list";

/** next/image sizes for the card photo (matches ListingGrid's columns and CardCarousel's widths). */
const GRID_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 90vw";
const LIST_SIZES = "(min-width: 640px) 320px, 100vw";

type Fact = { key: string; icon: LucideIcon; value: string; label: string };

/** The icon row: bedrooms (or studio), guests, m², floor — then bathrooms if there is room. */
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
  if (listing.maxGuests !== null && listing.maxGuests > 0 && listing.dealType !== "SALE") {
    facts.push({
      key: "guests",
      icon: UsersIcon,
      value: formatNumber(listing.maxGuests, locale),
      label: t("upToGuests", { count: listing.maxGuests }),
    });
  }
  if (listing.sizeSqm !== null && listing.sizeSqm > 0) {
    const area = formatArea(listing.sizeSqm, locale);
    facts.push({ key: "size", icon: RulerIcon, value: area, label: area });
  }
  if (listing.floor != null) {
    const floor = formatNumber(listing.floor, locale);
    facts.push({ key: "floor", icon: Building2Icon, value: floor, label: t("floor", { floor }) });
  }
  if (facts.length < 4 && listing.bathrooms !== null && listing.bathrooms > 0) {
    facts.push({
      key: "bathrooms",
      icon: BathIcon,
      value: formatNumber(listing.bathrooms, locale),
      label: t("bathrooms", { count: listing.bathrooms }),
    });
  }
  return facts;
}

/**
 * The one listing card (v2), used everywhere: home rows, search grid/list, favorites, similar
 * listings, owner profiles and map popups. Photo first (16:10 carousel with dots), up to two tags
 * on the photo, the heart in the other corner, then a big price with its unit, the title, the
 * place, an icon row and the Bayit badge row (3 + "+N").
 *
 * The title link covers the whole card (and is prefetched); the heart, compare and photo
 * buttons sit above it as separate controls. Pressing the card shrinks it slightly; on desktop
 * the photo zooms a little on hover.
 *
 * The card takes its width from its container (grid cell, carousel slide); it never grows to
 * fit its title, so give it a width where the parent sizes by content (e.g. a map popup).
 *
 * Not a client component: from a server component it renders on the server and only the
 * photos, heart, compare toggle and price hydrate. Pass `onHover` only from a client component.
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
  const photoTags = listingPhotoTags(listing.badges, 2);
  const welcomesOnPhoto = photoTags.some((tag) => tag.kind === "welcomes");
  const badgeItems = listingBadgeItems(listing.badges, { exclude: welcomesOnPhoto ? ["welcomes"] : [] });

  return (
    <article
      aria-labelledby={titleId}
      onPointerEnter={onHover ? () => onHover(listing.publicId) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(listing.publicId) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      className={cn(
        "group/card relative isolate flex rounded-card bg-card text-card-foreground shadow-card ring-1 ring-foreground/5",
        // Width comes from the container only: the one-line title must never widen a grid track.
        "[contain:inline-size]",
        // Hover: a deeper shadow fades in (opacity only). Press: the card shrinks a little.
        "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-card before:opacity-0 before:shadow-card-hover before:transition-opacity before:duration-(--motion-base) hover:before:opacity-100",
        "transition-transform duration-(--motion-fast) ease-standard has-[[data-card-link]:active]:scale-[0.98] motion-reduce:transition-none motion-reduce:has-[[data-card-link]:active]:scale-100",
        "focus-within:ring-2 focus-within:ring-ring/60",
        isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-10 shrink-0 overflow-hidden",
          isList ? "rounded-t-card sm:w-72 sm:rounded-e-none sm:rounded-s-card md:w-80" : "rounded-t-card",
        )}
      >
        <PhotoCarousel
          photos={listing.photos}
          title={listing.title}
          href={listing.href}
          sizes={isList ? LIST_SIZES : GRID_SIZES}
          priority={priority}
          totalCount={listing.photoCount}
          aspect={isList ? "aspect-[16/10] sm:aspect-auto sm:h-full sm:min-h-56" : "aspect-[16/10]"}
        />
        {photoTags.length > 0 && (
          <ul className="pointer-events-none absolute start-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-col items-start gap-1.5">
            {photoTags.map((tag) => (
              <BayitBadge key={tag.kind} {...tag} as="li" variant="solid" />
            ))}
          </ul>
        )}
        <FavoriteButton
          listingId={listing.id}
          title={listing.title}
          isFavorite={listing.isFavorite}
          className="absolute end-2 top-2 z-20"
        />
        {/* Bottom corner, so it never covers the photo tags or the arrow buttons on narrow cards. */}
        {showCompare && <CompareToggle publicId={listing.publicId} variant="icon" className="absolute end-2 bottom-2 z-20" />}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5 px-4 pt-3 pb-4", isList && "sm:px-5 sm:pt-4")}>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
          <Price
            amount={listing.price}
            currency={listing.currency}
            period={listing.pricePeriod}
            from={listing.priceIsFrom}
            size={isList ? "lg" : "card"}
            compact="auto"
          />
          {listing.badges.business && <BayitBadge kind="business" className="relative z-10" />}
        </div>

        <h3 id={titleId} className={cn("min-w-0 font-semibold leading-snug", isList ? "text-lg" : "text-base")}>
          <Link
            href={listing.href}
            dir="auto"
            data-card-link=""
            className={cn(
              "block outline-none after:absolute after:inset-0 after:z-0 after:rounded-card after:content-[''] focus-visible:underline",
              isList ? "line-clamp-2" : "truncate",
            )}
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

        {place ? (
          <p className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{place}</span>
          </p>
        ) : null}

        {facts.length > 0 && (
          <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-sm text-foreground/80">
            {facts.map(({ key, icon: Icon, value, label }) => (
              <li key={key} className="inline-flex items-center gap-1.5" title={label}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span aria-hidden="true">{value}</span>
                <span className="sr-only">{label}</span>
              </li>
            ))}
          </ul>
        )}

        {badgeItems.length > 0 && <BadgeRow items={badgeItems} max={3} className="mt-auto pt-1.5" />}
      </div>
    </article>
  );
}
