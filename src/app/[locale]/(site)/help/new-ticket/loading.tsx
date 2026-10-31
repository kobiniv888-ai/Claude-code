import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function NewTicketLoading() {
  const t = useTranslations("tickets");
  return (
    <div role="status" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-9 w-2/3 max-w-md rounded-xl" />
        <SkeletonBlock className="h-5 w-full max-w-xl" />
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6 rounded-3xl border bg-card p-4 shadow-card sm:p-8">
          <SkeletonBlock className="h-5 w-40" />
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonBlock key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-40 w-full rounded-xl" />
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="ms-auto h-12 w-44 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-40 rounded-2xl" />
          <SkeletonBlock className="h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
