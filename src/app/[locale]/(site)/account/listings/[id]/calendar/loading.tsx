import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function ListingCalendarLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="grid gap-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 sm:pt-8">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-9 w-40 rounded-xl" />
        <SkeletonBlock className="h-5 w-64 max-w-full" />
      </div>
      <SkeletonBlock className="h-[420px] rounded-2xl" />
      <SkeletonBlock className="h-28 rounded-2xl" />
    </div>
  );
}
