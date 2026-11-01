import { HideBottomNav } from "@/components/layout/hide-bottom-nav";
import { ListingPageSkeleton } from "@/components/listing-page/skeletons";

/**
 * A skeleton of the listing page, shown at once when a card is tapped. The listing page is the
 * heaviest public page, so it is the one exception to "no route loading.tsx on fast public pages"
 * (docs/CONVENTIONS.md): without it, tapping a card showed nothing until the whole page arrived.
 */
export default function Loading() {
  return (
    <>
      <HideBottomNav />
      <ListingPageSkeleton />
    </>
  );
}
