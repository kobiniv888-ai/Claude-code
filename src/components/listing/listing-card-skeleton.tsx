import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ListingCardVariant } from "./listing-card";
import { gridColumnsClass, type GridColumns } from "./grid-columns";

/** Placeholder with the exact shape of a ListingCard (v2): photo, price, title, place, icons, badges. */
export function ListingCardSkeleton({ variant = "grid", className }: { variant?: ListingCardVariant; className?: string }) {
  const isList = variant === "list";
  if (variant === "compact") {
    return (
      <div aria-hidden="true" className={cn("flex min-h-36 overflow-hidden rounded-card bg-card", className)}>
        <Skeleton className="w-[38%] max-w-44 shrink-0 rounded-none" />
        <div className="flex flex-1 flex-col gap-2 px-3 py-2.5">
          <Skeleton className="h-6 w-2/5 rounded-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3.5 w-1/2" />
          <div className="mt-auto flex gap-1.5">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex overflow-hidden rounded-card bg-card shadow-card ring-1 ring-foreground/5",
        isList ? "flex-col sm:flex-row" : "h-full flex-col",
        className,
      )}
    >
      <Skeleton className={cn("aspect-[16/10] w-full rounded-none", isList && "sm:aspect-auto sm:min-h-56 sm:w-72 md:w-80")} />
      <div className="flex flex-1 flex-col gap-2.5 px-4 pt-3.5 pb-4">
        <Skeleton className="h-6 w-2/5 rounded-full" />
        <Skeleton className="h-4.5 w-11/12" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-3.5">
          <Skeleton className="h-4 w-9" />
          <Skeleton className="h-4 w-9" />
          <Skeleton className="h-4 w-14" />
        </div>
        <div className="mt-auto flex gap-1.5 pt-1">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
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
