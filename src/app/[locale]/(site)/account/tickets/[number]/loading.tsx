import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function TicketLoading() {
  const t = useTranslations("tickets");
  return (
    <div role="status" className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6 lg:px-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-9 w-3/4 rounded-xl" />
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <SkeletonBlock className="h-7 w-32 rounded-full" />
        <SkeletonBlock className="h-5 w-40" />
      </div>
      <SkeletonBlock className="h-24 rounded-2xl" />
      <div className="mt-8 flex flex-col gap-4">
        <div className="flex gap-3">
          <SkeletonBlock className="size-9 shrink-0 rounded-full" />
          <SkeletonBlock className="h-28 w-3/4 rounded-2xl" />
        </div>
        <div className="flex flex-row-reverse gap-3">
          <SkeletonBlock className="size-9 shrink-0 rounded-full" />
          <SkeletonBlock className="h-20 w-2/3 rounded-2xl" />
        </div>
      </div>
      <SkeletonBlock className="mt-8 h-48 rounded-2xl" />
    </div>
  );
}
