import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";
import { JlContainer } from "@/components/jewish-life/section";

/** Jewish Life while the server renders: hero, map and calendar placeholders. */
export default function Loading() {
  const t = useTranslations("jewishLife");
  return (
    <div role="status" aria-busy="true" className="pb-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="border-b bg-secondary/40">
        <JlContainer className="grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center lg:py-16">
          <div className="space-y-4">
            <SkeletonBlock className="h-7 w-32 rounded-full" />
            <SkeletonBlock className="h-10 w-4/5 sm:h-12" />
            <SkeletonBlock className="h-5 w-full max-w-xl" />
            <SkeletonBlock className="h-5 w-2/3 max-w-md" />
            <div className="flex flex-wrap gap-2 pt-2">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="h-10 w-32 rounded-full" />
              ))}
            </div>
          </div>
          <SkeletonBlock className="h-56 w-full rounded-2xl" />
        </JlContainer>
      </div>
      <JlContainer className="space-y-5 py-12">
        <SkeletonBlock className="h-8 w-64" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="h-10 w-36 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonBlock key={i} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
          <SkeletonBlock className="hidden h-[38rem] w-full rounded-2xl lg:block" />
        </div>
      </JlContainer>
      <JlContainer className="space-y-5 py-12">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-72 w-full rounded-2xl" />
      </JlContainer>
    </div>
  );
}
