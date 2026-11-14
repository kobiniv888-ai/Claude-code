import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";
import { HideFooter } from "@/components/layout/hide-footer";

/**
 * "אישור הזמנה" (the booking review) while it loads: the same layout as the page (stay, price, then
 * the form). Shown by layout/navigation-skeleton.tsx when "Book" is tapped on a listing.
 */
export function BookingReviewSkeleton() {
  return (
    <Container className="grid max-w-5xl gap-4 pt-3 pb-6 lg:gap-6 lg:pt-6" aria-hidden>
      {/* Like the page itself (listing/[id]/book/layout.tsx): no site footer in the booking flow. */}
      <HideFooter />
      <div className="grid gap-2">
        <SkeletonBlock className="h-5 w-28" />
        <SkeletonBlock className="h-7 w-48" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8">
        <div className="grid content-start gap-4 lg:col-start-2 lg:row-start-1">
          <div className="grid gap-3 rounded-card border border-border p-3">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="size-20 shrink-0 rounded-xl" />
              <div className="grid flex-1 gap-2">
                <SkeletonBlock className="h-4 w-4/5" />
                <SkeletonBlock className="h-3 w-1/2" />
              </div>
            </div>
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
          <div className="grid gap-2 rounded-card border border-border p-3">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-5 w-full" />
          </div>
        </div>
        <div className="grid content-start gap-4 lg:col-start-1 lg:row-start-1">
          <SkeletonBlock className="h-64 w-full rounded-card" />
          <SkeletonBlock className="h-48 w-full rounded-card" />
        </div>
      </div>
    </Container>
  );
}
