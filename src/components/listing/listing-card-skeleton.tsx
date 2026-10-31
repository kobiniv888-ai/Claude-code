import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ListingCardVariant } from "./listing-card";
import { gridColumnsClass, type GridColumns } from "./grid-columns";

/** Placeholder with the exact shape of a ListingCard. */
export function ListingCardSkeleton({ variant = "grid", className }: { variant?: ListingCardVariant; className?: string }) {
  const isList = variant === "list";
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex overflow-hidden rounded-2xl bg-card shadow-card ring-1 ring-foreground/5",
        isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <Skeleton className={cn("aspect-[4/3] w-full rounded-none", isList && "sm:aspect-auto sm:min-h-52 sm:w-72 md:w-80")} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-5 w-11/12" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-4 w-14" />
        </div>
        <Skeleton className="h-6 w-2/5 rounded-full" />
        <Skeleton className="mt-auto h-5 w-1/3" />
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
