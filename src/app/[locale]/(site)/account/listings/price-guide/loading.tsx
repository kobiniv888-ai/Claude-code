import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function PriceGuideLoading() {
  const t = useTranslations("pricing.panel");
  return (
    <div role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-9 w-56 rounded-xl" />
        <SkeletonBlock className="h-5 w-80 max-w-full" />
      </div>
      <div className="mb-4 flex gap-2">
        <SkeletonBlock className="h-10 w-36 rounded-full" />
        <SkeletonBlock className="h-10 w-32 rounded-full" />
      </div>
      <SkeletonBlock className="h-28 rounded-2xl" />
      <div className="mt-4 grid gap-3 rounded-2xl border bg-card p-4">
        <SkeletonBlock className="h-11 rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
        </div>
        <SkeletonBlock className="h-2 rounded-full" />
        <SkeletonBlock className="h-6 w-2/3 rounded-full" />
      </div>
    </div>
  );
}
