import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

/** /owner/[id] while it loads. */
export function OwnerPageSkeleton() {
  const t = useTranslations("owner");
  return (
    <Container className="py-8" role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <SkeletonBlock className="size-24 rounded-full" />
        <div className="grid flex-1 gap-3">
          <SkeletonBlock className="h-8 w-56" />
          <div className="flex gap-2">
            <SkeletonBlock className="h-7 w-28 rounded-full" />
            <SkeletonBlock className="h-7 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-3">
            <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </Container>
  );
}
