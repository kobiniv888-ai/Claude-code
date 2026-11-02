import { useLocale, useTranslations } from "next-intl";
import { LanguagesIcon } from "@/components/ds/sprite-icons";
import { Tag } from "@/components/ds/tag";
import { Link } from "@/i18n/navigation";
import { formatArea, formatNumber } from "@/lib/format";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { cardPhotoTag, cardTags, type CardTagKind } from "./card-tags";
import { CompareToggle } from "./compare-toggle";
import { FavoriteButton } from "./favorite-button";
import { PhotoCarousel } from "./photo-carousel";
import { Price } from "./price";

/**
 * grid: photo on top (rows, grids, phones). list: photo beside the text from 640px (the desktop
 * list view). compact: a short horizontal row, photo at the start, without its own border (the
 * map's slide-up card puts it in a sheet that has one).
 */
export type ListingCardVariant = "grid" | "list" | "compact";

/** next/image sizes for the card photo (matches ListingGrid's columns and CardCarousel's widths). */
const GRID_SIZES = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 92vw";
const LIST_SIZES = "(min-width: 640px) 320px, 92vw";
const COMPACT_SIZES = "160px";

/**
 * The one facts line, by deal type:
 * - short stays and hotel rooms: "2 אורחים · חדר שינה 1 · מיטה 1"
 * - monthly rentals and sales: "3 חדרים · 78 מ״ר · קומה 4"
 */
function useFacts(listing: ListingCardData): string[] {
  const t = useTranslations("listingFields.facts");
  const card = useTranslations("listingCard.facts");
  const locale = useLocale();
  const facts: string[] = [];
  const bedrooms = () => {
    if (listing.bedrooms === null) return;
    facts.push(listing.bedrooms === 0 ? t("studio") : t("bedrooms", { count: listing.bedrooms }));
  };

  if (listing.dealType === "SHORT_STAY" || listing.dealType === "HOTEL_ROOM") {
    if (listing.maxGuests !== null && listing.maxGuests > 0) facts.push(t("guests", { count: listing.maxGuests }));
    bedrooms();
    if (listing.beds != null && listing.beds > 0) facts.push(t("beds", { count: listing.beds }));
    return facts;
  }

  if (listing.rooms != null && listing.rooms > 0) facts.push(t("rooms", { count: listing.rooms }));
  else bedrooms();
  if (listing.sizeSqm !== null && listing.sizeSqm > 0) facts.push(formatArea(listing.sizeSqm, locale));
  if (listing.floor != null) {
    facts.push(listing.floor === 0 ? card("groundFloor") : t("floor", { floor: formatNumber(listing.floor, locale) }));
  }
  return facts;
}

/**
 * The one listing card (round 2), used everywhere: home rows, search results, saved listings,
 * similar listings, owner profiles and the map's slide-up card.
 *
 * - A 4:3 swipeable photo (at most 5 dots) with only the heart (top, end side) and at most one
 *   tag: "דמו" (grey), "מקודם" or "חדש" (purple tint).
 * - Under it: the title (1 line), "אזור · עיר" (grey), one facts line, the price line (one price,
 *   in the visitor's currency, "≈" when converted; "₪1,260 סה״כ" with `nights`), and at most two
 *   small grey tags (kosher kitchen, Shabbat-friendly, a verified synagogue's walk, Hebrew).
 * - A white (surface) card with a 1px border, 16px corners and no shadow.
 *
 * The title link covers the whole card (and is prefetched); the heart and photo buttons sit above
 * it. Pressing the card shrinks it slightly.
 *
 * The card takes its width from its container (grid cell, carousel slide); it never grows to
 * fit its title, so give it a width where the parent sizes by content (e.g. a map popup).
 *
 * Not a client component: from a server component it renders on the server and only the
 * photos, heart and price hydrate. Pass `onHover` only from a client component.
 */
export function ListingCard({
  listing,
  variant = "grid",
  priority = false,
  sizes,
  showCompare = false,
  nights = null,
  preferTags,
  onHover,
  className,
}: {
  listing: ListingCardData;
  variant?: ListingCardVariant;
  /** Load the first photo eagerly (cards above the fold). */
  priority?: boolean;
  /**
   * next/image `sizes` for the photo when the card is narrower than the variant's default
   * (e.g. a carousel row of ~66vw cards); otherwise the variant's grid/list/compact widths.
   */
  sizes?: string;
  /** The compare toggle (desktop list view only: nothing but the heart goes on the photo). */
  showCompare?: boolean;
  /** Nights of the searched stay: adds the stay total to a nightly price. */
  nights?: number | null;
  /** Tags the visitor filtered by: shown first (see preferredCardTags). */
  preferTags?: readonly CardTagKind[];
  /** For map highlighting: the public ID on hover/focus, null on leave. */
  onHover?: (publicId: number | null) => void;
  className?: string;
}) {
  const t = useTranslations("listingCard");
  const facts = useFacts(listing);
  const place = [listing.neighborhoodName, listing.cityName].filter(Boolean).join(" · ");
  const isList = variant === "list";
  const isCompact = variant === "compact";
  const titleId = `listing-${listing.publicId}-title`;
  const photoTag = cardPhotoTag(listing.badges);
  const tags = cardTags(listing.badges, preferTags);

  return (
    <article
      aria-labelledby={titleId}
      data-listing-card=""
      onPointerEnter={onHover ? () => onHover(listing.publicId) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
      onFocus={onHover ? () => onHover(listing.publicId) : undefined}
      onBlur={onHover ? () => onHover(null) : undefined}
      className={cn(
        "group/card relative isolate flex rounded-card bg-card text-card-foreground",
        !isCompact && "border border-border transition-colors duration-(--motion-fast) hover:border-border-strong",
        // Width comes from the container only: the one-line title must never widen a grid track.
        "[contain:inline-size]",
        // Press: the card shrinks a little (transform only).
        "transition-transform duration-(--motion-fast) ease-standard has-[[data-card-link]:active]:scale-[0.98] motion-reduce:transition-none motion-reduce:has-[[data-card-link]:active]:scale-100",
        "focus-within:ring-2 focus-within:ring-ring/60",
        isCompact ? "flex-row" : isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-10 shrink-0 overflow-hidden",
          isCompact
            ? "w-[40%] max-w-40 rounded-card"
            : isList
              ? "rounded-t-[calc(var(--radius-card)-1px)] sm:w-72 sm:rounded-e-none sm:rounded-s-[calc(var(--radius-card)-1px)] md:w-80"
              : "rounded-t-[calc(var(--radius-card)-1px)]",
        )}
      >
        <PhotoCarousel
          photos={listing.photos}
          title={listing.title}
          href={listing.href}
          sizes={sizes ?? (isCompact ? COMPACT_SIZES : isList ? LIST_SIZES : GRID_SIZES)}
          priority={priority}
          aspect={isCompact ? "h-full min-h-30" : isList ? "aspect-[4/3] sm:aspect-auto sm:h-full sm:min-h-56" : "aspect-[4/3]"}
        />
        {photoTag && (
          <Tag
            variant={photoTag === "new" ? "primary" : "neutral"}
            size="sm"
            className={cn("pointer-events-none absolute top-2.5 z-10", isCompact ? "start-2" : "start-3 top-3")}
          >
            {t(`labels.${photoTag}`)}
          </Tag>
        )}
        <FavoriteButton
          listingId={listing.id}
          title={listing.title}
          isFavorite={listing.isFavorite}
          className={cn("absolute top-1.5 z-20", isCompact ? "end-1" : "end-2 top-2")}
        />
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          isCompact ? "gap-0.5 px-3 py-2" : "gap-0.5 p-3",
          isList && "sm:px-5 sm:py-4",
        )}
      >
        <h3 id={titleId} className={cn("flex min-w-0 items-center gap-1 leading-snug font-medium", isList ? "text-base sm:text-lg" : "text-[0.9375rem]")}>
          {listing.titleIsAutoTranslated ? (
            <span title={t("autoTranslated")} className="shrink-0 text-muted-foreground">
              <LanguagesIcon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t("autoTranslated")}</span>
            </span>
          ) : null}
          <Link
            href={listing.href}
            dir="auto"
            data-card-link=""
            className="block min-w-0 truncate outline-none after:absolute after:inset-0 after:z-0 after:rounded-card after:content-[''] focus-visible:underline"
          >
            {listing.title}
          </Link>
        </h3>

        {place ? <p className="truncate text-sm text-muted-foreground">{place}</p> : null}

        {facts.length > 0 ? (
          <p className="truncate text-sm text-muted-foreground">
            {facts.map((fact, index) => (
              <span key={fact}>
                {index > 0 ? <span aria-hidden="true"> · </span> : null}
                {index > 0 ? <span className="sr-only">, </span> : null}
                {fact}
              </span>
            ))}
          </p>
        ) : null}

        <div className={cn("min-w-0", isCompact ? "mt-0.5" : "mt-1")}>
          <Price
            amount={listing.price}
            currency={listing.currency}
            period={listing.pricePeriod}
            from={listing.priceIsFrom}
            size="line"
            showOriginal={false}
            compact="auto"
            nights={nights}
          />
        </div>

        {tags.length > 0 || (isList && showCompare) ? (
          <div className={cn("flex min-w-0 items-center gap-1", isCompact ? "mt-1" : "mt-2", isList && "mt-auto pt-2")}>
            {tags.length > 0 ? (
              <ul className="flex min-w-0 flex-wrap items-center gap-1">
                {tags.map((tag) => (
                  <Tag key={tag.kind} as="li" size="sm">
                    {tag.kind === "synagogue" ? t("tags.synagogue", { count: tag.minutes ?? 0 }) : t(`tags.${tag.kind}`)}
                  </Tag>
                ))}
              </ul>
            ) : null}
            {isList && showCompare ? (
              <CompareToggle publicId={listing.publicId} variant="icon" className="relative z-10 ms-auto hidden sm:inline-flex" />
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
