import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ListingCardVariant } from "./listing-card";
import { gridColumnsClass, type GridColumns } from "./grid-columns";

/** Placeholder with the exact shape of a ListingCard (round 2): 4:3 photo, title, place, facts, price, tags. */
export function ListingCardSkeleton({ variant = "grid", className }: { variant?: ListingCardVariant; className?: string }) {
  const isList = variant === "list";
  if (variant === "compact") {
    return (
      <div aria-hidden="true" className={cn("flex min-h-30 overflow-hidden rounded-card bg-card", className)}>
        <Skeleton className="w-[40%] max-w-40 shrink-0 rounded-card" />
        <div className="flex flex-1 flex-col gap-2 px-3 py-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-4.5 w-2/5" />
        </div>
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex overflow-hidden rounded-card border border-border bg-card",
        isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <Skeleton className={cn("aspect-[4/3] w-full rounded-none", isList && "sm:aspect-auto sm:min-h-56 sm:w-72 md:w-80")} />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-4.5 w-11/12" />
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="mt-1 h-5 w-2/5" />
        <div className="mt-1 flex gap-1">
          <Skeleton className="h-5.5 w-20 rounded-full" />
          <Skeleton className="h-5.5 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A grid (or list) of card skeletons while results load. */
export function ListingGridSkeleton({
  count = 8,
  variant = "grid",
  columns = 4,
  className,
}: {
  count?: number;
  variant?: ListingCardVariant;
  columns?: GridColumns;
  className?: string;
}) {
  const t = useTranslations("listingCard.grid");
  return (
    <div role="status" aria-live="polite" className={className}>
      <span className="sr-only">{t("loading")}</span>
      <div className={variant === "list" ? "flex flex-col gap-4" : gridColumnsClass(columns)}>
        {Array.from({ length: count }, (_, i) => (
          <ListingCardSkeleton key={i} variant={variant} />
        ))}
      </div>
    </div>
  );
}
