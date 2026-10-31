import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function VerificationLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="grid gap-6">
      <span className="sr-only">{t("loading")}</span>
      <div className="grid gap-3 pt-6 sm:pt-8">
        <SkeletonBlock className="h-9 w-56 rounded-xl" />
        <SkeletonBlock className="h-5 w-80 max-w-full" />
      </div>
      <SkeletonBlock className="h-24 rounded-2xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border bg-card p-4 sm:p-6">
          <SkeletonBlock className="size-11 shrink-0 rounded-full" />
          <div className="grid flex-1 gap-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-full max-w-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
