import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { SearchXIcon } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import type { ListingCardData } from "@/lib/listing/types";
import { cn } from "@/lib/utils";
import { gridColumnsClass, type GridColumns } from "./grid-columns";
import { ListingCard, type ListingCardVariant } from "./listing-card";

/**
 * Cards in a responsive grid (1 → 2 → 3 → 4 columns) or a vertical list. Works in server and
 * client components (pass `onHover` only from a client component).
 */
export function ListingGrid({
  listings,
  variant = "grid",
  columns = 4,
  priorityCount = 4,
  showCompare = false,
  onHover,
  empty,
  label,
  className,
}: {
  listings: ListingCardData[];
  variant?: ListingCardVariant;
  columns?: GridColumns;
  /** How many first cards load their photo eagerly (the first row). */
  priorityCount?: number;
  showCompare?: boolean;
  onHover?: (publicId: number | null) => void;
  /** Shown when there are no listings (default: a generic empty state). */
  empty?: ReactNode;
  /** Accessible name of the list (default "Listings"). */
  label?: string;
  className?: string;
}) {
  const t = useTranslations("listingCard");

  if (listings.length === 0) {
    return (
      <>
        {empty ?? (
          <EmptyState icon={SearchXIcon} title={t("empty.title")} description={t("empty.description")} bordered className={className} />
        )}
      </>
    );
  }

  return (
    <ul
      aria-label={label ?? t("grid.label")}
      className={cn(variant === "list" ? "flex flex-col gap-4" : gridColumnsClass(columns), className)}
    >
      {listings.map((listing, index) => (
        <li key={listing.id} className="min-w-0">
          <ListingCard
            listing={listing}
            variant={variant}
            priority={index < priorityCount}
            showCompare={showCompare}
            onHover={onHover}
          />
        </li>
      ))}
    </ul>
  );
}
