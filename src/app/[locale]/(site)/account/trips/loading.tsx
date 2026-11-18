import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

/** "My trips" while it loads: the title, then trip cards (88px photo + three lines). */
export default function TripsLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="pb-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-9 w-56 max-w-full rounded-xl" />
        <SkeletonBlock className="h-5 w-80 max-w-full" />
      </div>
      <SkeletonBlock className="mb-3 h-7 w-32 rounded-lg" />
      <div className="grid gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-card border border-border p-3">
            <SkeletonBlock className="size-22 shrink-0 rounded-xl" />
            <div className="grid flex-1 content-start gap-2 pt-1">
              <SkeletonBlock className="h-5 w-3/4" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-4 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
