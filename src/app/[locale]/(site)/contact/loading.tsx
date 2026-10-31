import { useTranslations } from "next-intl";
import { SkeletonBlock } from "@/components/common/skeletons";

export default function ContactLoading() {
  const t = useTranslations("contactPage");
  return (
    <div role="status" className="pb-16">
      <span className="sr-only">{t("loading")}</span>
      <div className="border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <SkeletonBlock className="size-14 rounded-full" />
          <SkeletonBlock className="h-10 w-2/3 max-w-lg rounded-xl" />
          <SkeletonBlock className="h-5 w-full max-w-xl" />
        </div>
      </div>
      <div className="mx-auto mt-8 grid max-w-6xl gap-8 px-4 sm:mt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        <div className="flex flex-col gap-5 rounded-3xl border bg-card p-4 shadow-card sm:p-8">
          <SkeletonBlock className="h-6 w-48" />
          <div className="grid gap-5 sm:grid-cols-2">
            <SkeletonBlock className="h-11 rounded-xl" />
            <SkeletonBlock className="h-11 rounded-xl" />
          </div>
          <SkeletonBlock className="h-11 rounded-xl" />
          <SkeletonBlock className="h-40 rounded-xl" />
          <SkeletonBlock className="ms-auto h-12 w-40 rounded-xl" />
        </div>
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-36 rounded-2xl" />
          <SkeletonBlock className="h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
