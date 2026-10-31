import { useTranslations } from "next-intl";
import { ListingCard, type ListingCardVariant } from "@/components/listing/listing-card";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";

/** Classes of the results list (shared with the client list next to the map). */
export function resultListClass(variant: ListingCardVariant, compact: boolean): string {
  return cn(
    variant === "list"
      ? "flex flex-col gap-4"
      : compact
        ? "grid grid-cols-1 gap-x-5 gap-y-6 xl:grid-cols-2"
        : "grid grid-cols-1 gap-x-5 gap-y-6 sm:grid-cols-2 xl:grid-cols-3",
  );
}

/**
 * The result cards of the grid and list views, rendered on the server so that only their
 * interactive parts (photos, heart, compare, price) hydrate. The map view uses the client list in
 * search-results.tsx, which highlights the card of the hovered pin.
 */
export function ResultCards({ items, variant }: { items: ListingCardData[]; variant: ListingCardVariant }) {
  const t = useTranslations("search.results");
  return (
    <ul aria-label={t("listLabel")} className={resultListClass(variant, false)}>
      {items.map((listing, index) => (
        <li key={listing.id} className="min-w-0">
          {/* Only the first photo is above the fold on phones; the rest load as they come into view. */}
          <ListingCard listing={listing} variant={variant} priority={index === 0} showCompare />
        </li>
      ))}
    </ul>
  );
}
