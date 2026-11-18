import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

/** Loading state of the wizard pages: the same frame as the wizard (segmented progress, big heading, tiles, Back/Next bar). */
export function WizardSkeleton() {
  const t = useTranslations("wizard.chrome");
  return (
    <div role="status" className="mx-auto w-full max-w-3xl px-4 pt-3 pb-6 sm:pt-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="grid gap-1.5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-3 w-16" />
        </div>
        <SkeletonBlock className="h-10 w-32 rounded-full" />
      </div>
      <div className="grid gap-2.5">
        <div className="flex min-h-11 items-center justify-between">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <div className="flex gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <SkeletonBlock key={i} className="h-1.5 flex-1 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-6 grid gap-2">
        <SkeletonBlock className="h-9 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="aspect-[4/5] rounded-card sm:aspect-[16/12]" />
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-12 w-24 rounded-full" />
        <SkeletonBlock className="h-12 flex-1 rounded-full sm:max-w-60" />
      </div>
    </div>
  );
}
