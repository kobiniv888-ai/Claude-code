import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";
import { ListingCardSkeleton } from "@/components/listing/listing-card-skeleton";

export default function FavoritesLoading() {
  const t = useTranslations("account");
  return (
    <div role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-9 w-40 rounded-xl" />
        <SkeletonBlock className="h-5 w-64 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
            <ListingCardSkeleton />
            <SkeletonBlock className="h-16 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
