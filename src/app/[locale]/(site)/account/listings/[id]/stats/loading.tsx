import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function ListingStatsLoading() {
  const t = useTranslations("account");
  return (
    <div role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-9 w-56 rounded-xl" />
        <SkeletonBlock className="h-6 w-72 max-w-full" />
      </div>
      <SkeletonBlock className="mb-4 h-11 w-48 rounded-xl" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBlock key={i} className="h-60 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="mt-6 h-48 rounded-2xl" />
    </div>
  );
}
