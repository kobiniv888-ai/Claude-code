import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function SettingsLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="grid gap-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 sm:pt-8">
        <SkeletonBlock className="h-9 w-40 rounded-xl" />
        <SkeletonBlock className="h-5 w-72 max-w-full" />
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-6">
          <SkeletonBlock className="h-6 w-44" />
          <SkeletonBlock className="h-4 w-full max-w-md" />
          <SkeletonBlock className="h-11 w-full rounded-xl" />
          <SkeletonBlock className="h-11 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
