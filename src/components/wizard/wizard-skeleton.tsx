import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

/** Loading state of the wizard pages (progress chips, heading, two form cards, nav bar). */
export function WizardSkeleton() {
  const t = useTranslations("wizard.chrome");
  return (
    <div role="status" className="mx-auto w-full max-w-4xl px-4 pt-4 pb-6 sm:pt-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="grid gap-1.5">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
        <SkeletonBlock className="h-8 w-32 rounded-lg" />
      </div>
      <div className="grid gap-3">
        <div className="flex justify-between">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-16" />
        </div>
        <SkeletonBlock className="h-1.5 w-full rounded-full" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>
      </div>
      <div className="mt-8 grid gap-2">
        <SkeletonBlock className="h-8 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-40 rounded-2xl" />
        ))}
      </div>
      <SkeletonBlock className="mt-8 h-16 rounded-2xl" />
    </div>
  );
}
