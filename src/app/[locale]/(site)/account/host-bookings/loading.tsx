import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function HostBookingsLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="pb-10">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 pb-6 sm:pt-8 sm:pb-8">
        <SkeletonBlock className="h-9 w-64 max-w-full rounded-xl" />
        <SkeletonBlock className="h-5 w-80 max-w-full" />
      </div>
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBlock key={i} className="h-11 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBlock key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
