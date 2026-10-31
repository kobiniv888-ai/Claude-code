import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function MyListingsLoading() {
  const t = useTranslations("account");
  return (
    <div role="status">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-3 pt-6 pb-6 sm:flex-row sm:items-end sm:justify-between sm:pt-8 sm:pb-8">
        <div className="grid gap-3">
          <SkeletonBlock className="h-9 w-48 rounded-xl" />
          <SkeletonBlock className="h-5 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-40 rounded-xl" />
      </div>
      <div className="mb-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBlock key={i} className="h-9 w-24 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex flex-col gap-4 rounded-2xl border bg-card p-3 sm:flex-row sm:p-4">
            <SkeletonBlock className="aspect-[4/3] w-full rounded-xl sm:w-44" />
            <div className="flex flex-1 flex-col gap-3">
              <SkeletonBlock className="h-7 w-28 rounded-full" />
              <SkeletonBlock className="h-5 w-3/4" />
              <SkeletonBlock className="h-4 w-1/3" />
              <SkeletonBlock className="h-4 w-1/2" />
              <div className="mt-auto flex gap-2">
                <SkeletonBlock className="h-10 w-24 rounded-xl" />
                <SkeletonBlock className="h-10 w-24 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
