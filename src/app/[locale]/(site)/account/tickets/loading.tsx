import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function MyTicketsLoading() {
  const t = useTranslations("tickets");
  return (
    <div role="status" className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-3 pt-6 pb-6 sm:flex-row sm:items-end sm:justify-between sm:pt-8 sm:pb-8">
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-9 w-56 rounded-xl" />
          <SkeletonBlock className="h-5 w-72 max-w-full" />
        </div>
        <SkeletonBlock className="h-10 w-36 rounded-xl" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-5">
            <div className="flex gap-2">
              <SkeletonBlock className="h-6 w-28 rounded-full" />
              <SkeletonBlock className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonBlock className="h-5 w-3/4" />
            <SkeletonBlock className="h-4 w-1/2" />
            <div className="flex gap-4">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
