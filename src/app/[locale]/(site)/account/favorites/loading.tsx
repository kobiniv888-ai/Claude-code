import { useTranslations } from "next-intl";
import { ListingCardSkeleton, Skeleton } from "@/components/ds/skeleton";

/** Saved listings while they load: the heading and three cards, each with its note box. */
export default function FavoritesLoading() {
  const t = useTranslations("account");
  return (
    <div role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <Skeleton className="h-9 w-48 rounded-xl" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="grid gap-x-4 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <ListingCardSkeleton />
            <Skeleton className="h-28 rounded-card" />
          </div>
        ))}
      </div>
    </div>
  );
}
