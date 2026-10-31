import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

/** /listing/[id] while it loads: gallery, title and facts, the contact box. */
export function ListingPageSkeleton() {
  const t = useTranslations("listing");
  return (
    <Container className="pt-4 pb-12 sm:pt-6" role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <SkeletonBlock className="mb-3 h-4 w-40" />
      <SkeletonBlock className="-mx-4 aspect-[4/3] rounded-none sm:mx-0 sm:rounded-2xl md:hidden" />
      <div className="hidden h-[min(56vh,480px)] grid-cols-4 grid-rows-2 gap-2 md:grid">
        <SkeletonBlock className="col-span-2 row-span-2 rounded-s-2xl rounded-e-none" />
        <SkeletonBlock className="rounded-none" />
        <SkeletonBlock className="rounded-none rounded-se-2xl" />
        <SkeletonBlock className="rounded-none" />
        <SkeletonBlock className="rounded-none rounded-ee-2xl" />
      </div>
      <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-x-12">
        <div className="grid content-start gap-4">
          <SkeletonBlock className="h-6 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-11/12" />
          <SkeletonBlock className="h-8 w-2/3" />
          <SkeletonBlock className="h-4 w-48" />
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 5 }, (_, i) => (
              <SkeletonBlock key={i} className="h-5 w-24" />
            ))}
          </div>
          <div className="mt-6 grid gap-2.5 border-t pt-8">
            <SkeletonBlock className="h-6 w-40" />
            {Array.from({ length: 6 }, (_, i) => (
              <SkeletonBlock key={i} className={i === 5 ? "h-4 w-2/3" : "h-4 w-full"} />
            ))}
          </div>
        </div>
        <div className="grid content-start gap-4 rounded-2xl border p-5">
          <SkeletonBlock className="h-8 w-40" />
          <div className="flex items-center gap-3">
            <SkeletonBlock className="size-14 rounded-full" />
            <div className="grid flex-1 gap-2">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-5 w-36" />
            </div>
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="h-4 w-full" />
          ))}
          <SkeletonBlock className="h-12 w-full rounded-xl" />
        </div>
      </div>
    </Container>
  );
}

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
