import { getTranslations } from "next-intl/server";
import { ListingGridSkeleton } from "@/components/listing/listing-card-skeleton";
import { SkeletonBlock } from "@/components/common/skeletons";

/** Search results loading: the search bar, the filter sidebar and a grid of card skeletons. */
export default async function SearchLoading() {
  const t = await getTranslations("search.results");
  return (
    <div role="status" aria-label={t("loading")} className="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8">
      <span className="sr-only">{t("loading")}</span>
      <SkeletonBlock className="mx-auto mb-6 h-12 max-w-3xl rounded-full md:h-14" />
      <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="hidden space-y-4 lg:block" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <div className="grid gap-4">
          <SkeletonBlock className="h-4 w-32" />
          <SkeletonBlock className="h-7 w-64 max-w-full" />
          <div className="flex gap-2" aria-hidden="true">
            <SkeletonBlock className="h-10 w-28 rounded-full lg:hidden" />
            <SkeletonBlock className="ms-auto h-10 w-40 rounded-full" />
          </div>
          <ListingGridSkeleton count={6} columns={3} />
        </div>
      </div>
    </div>
  );
}
