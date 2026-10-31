import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function HelpLoading() {
  const t = useTranslations("help");
  return (
    <div role="status" className="pb-16">
      <span className="sr-only">{t("loading")}</span>
      <div className="border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-12 sm:py-16 lg:py-20">
          <SkeletonBlock className="size-14 rounded-full" />
          <SkeletonBlock className="h-10 w-3/4 rounded-xl" />
          <SkeletonBlock className="h-5 w-2/3" />
          <SkeletonBlock className="mt-4 h-14 w-full max-w-2xl rounded-2xl sm:h-16" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 lg:px-8">
        <SkeletonBlock className="h-7 w-48" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <SkeletonBlock className="mt-12 h-7 w-64" />
        <div className="mt-6 flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
