import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function AccountOverviewLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="pb-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-9 w-56 rounded-xl" />
        <SkeletonBlock className="h-5 w-80 max-w-full" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <SkeletonBlock className="h-64 rounded-2xl" />
        <SkeletonBlock className="h-64 rounded-2xl" />
      </div>
      <SkeletonBlock className="mt-6 h-40 rounded-2xl" />
    </div>
  );
}
