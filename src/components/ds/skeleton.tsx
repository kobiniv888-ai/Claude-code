/**
 * Skeletons: a soft shimmer in the reading direction (static with reduced motion), never a
 * spinner. `Skeleton` is any block; the listing card has a ready-made one with its exact shape.
 *
 *   <Skeleton className="h-6 w-2/5 rounded-full" />
 *   <ListingCardSkeleton />          // or <ListingGridSkeleton count={8} columns={4} />
 */
export { Skeleton } from "@/components/ui/skeleton";
export { ListingCardSkeleton, ListingGridSkeleton } from "@/components/listing/listing-card-skeleton";
