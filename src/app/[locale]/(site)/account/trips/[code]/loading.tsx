import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

/**
 * One trip / the booking confirmation while it loads (right after "אישור הזמנה" too): the back
 * link, the confirmation banner, the listing row, then the details card.
 */
export default function TripLoading() {
  const t = useTranslations("account");
  return (
    <div role="status" className="grid max-w-3xl gap-4 pt-2 pb-8">
      <span className="sr-only">{t("loading")}</span>
      <SkeletonBlock className="h-11 w-32 rounded-full" />
      <SkeletonBlock className="h-24 rounded-card" />
      <div className="flex gap-3">
        <SkeletonBlock className="size-16 shrink-0 rounded-xl" />
        <div className="grid flex-1 content-center gap-2">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
        </div>
      </div>
      <SkeletonBlock className="h-64 rounded-card" />
      <SkeletonBlock className="h-40 rounded-card" />
    </div>
  );
}
