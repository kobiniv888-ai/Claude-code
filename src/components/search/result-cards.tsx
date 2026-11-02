import { useTranslations } from "next-intl";
import type { CardTagKind } from "@/components/listing/card-tags";
import { ListingCard, type ListingCardVariant } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";

/** Classes of the results list (shared with the client list next to the map). */
export function resultListClass(variant: ListingCardVariant, compact: boolean): string {
  // Large screens always show the map next to the list, so the list has 1–2 columns there.
  return cn(
    variant === "list"
      ? "flex flex-col gap-4"
      : compact
        ? "grid grid-cols-1 gap-x-4 gap-y-4 xl:grid-cols-2"
        : "grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 min-[1800px]:grid-cols-3",
  );
}

/**
 * The result cards of the grid and list views, rendered on the server so that only their
 * interactive parts (photos, heart, compare, price) hydrate. The map view uses the client list in
 * search-results.tsx; here the hovered pin's card is ringed through data-public-id.
 */
export function ResultCards({
  items,
  variant,
  nights = null,
  preferTags,
}: {
  items: ListingCardData[];
  variant: ListingCardVariant;
  /** Nights of the searched stay (the cards add the stay total). */
  nights?: number | null;
  /** The card tags the search filters by (shown first). */
  preferTags?: readonly CardTagKind[];
}) {
  const t = useTranslations("search.results");
  return (
    <ul data-result-cards="" aria-label={t("listLabel")} className={resultListClass(variant, false)}>
      {items.map((listing, index) => (
        <li key={listing.id} data-public-id={listing.publicId} className="min-w-0">
          {/* Only the first photo is above the fold on phones; the rest load as they come into view. */}
          <ListingCard
            listing={listing}
            variant={variant}
            priority={index === 0}
            showCompare
            nights={nights}
            preferTags={preferTags}
          />
        </li>
      ))}
    </ul>
  );
}
