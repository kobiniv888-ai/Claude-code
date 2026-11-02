import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

/**
 * /listing/[id] while it loads (route loading.tsx): the same shape as the quiet page: the photo,
 * the title and one facts line, the host line, three highlights, the description and the sticky
 * bar on phones; the mosaic and the side box on desktop. Shown at once, never a spinner.
 */
export function ListingPageSkeleton() {
  const t = useTranslations("listing");
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <SkeletonBlock className="aspect-[4/3] w-full rounded-none md:hidden" />
      <Container className="pt-0 pb-12 md:pt-5">
        <SkeletonBlock className="mb-4 hidden h-4 w-48 md:block" />
        <div className="hidden h-[min(60vh,500px)] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-card md:grid">
          <SkeletonBlock className="col-span-2 row-span-2 rounded-none" />
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonBlock key={i} className="rounded-none" />
          ))}
        </div>
        <div className="mt-4 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-x-14">
          <div className="grid content-start gap-3">
            <SkeletonBlock className="h-7 w-11/12" />
            <SkeletonBlock className="h-7 w-2/3" />
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-64" />
            <div className="my-2 flex items-center gap-3 border-y border-border py-4">
              <SkeletonBlock className="size-11 rounded-full" />
              <div className="grid flex-1 gap-2">
                <SkeletonBlock className="h-4 w-48" />
                <SkeletonBlock className="h-4 w-64" />
              </div>
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBlock className="size-6 rounded-md" />
                <SkeletonBlock className="h-4 w-36" />
              </div>
            ))}
            <div className="mt-6 grid gap-2.5 border-t border-border pt-8">
              <SkeletonBlock className="h-6 w-32" />
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonBlock key={i} className={i === 4 ? "h-4 w-2/3" : "h-4 w-full"} />
              ))}
            </div>
          </div>
          <div className="hidden content-start gap-4 rounded-card border border-border bg-card p-5 lg:grid">
            <SkeletonBlock className="h-8 w-40" />
            <SkeletonBlock className="h-14 w-full rounded-input" />
            <SkeletonBlock className="h-12 w-full rounded-button" />
          </div>
        </div>
      </Container>
      <div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-border bg-card pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
        <div className="mx-auto flex h-18 max-w-3xl items-center gap-2 px-gutter">
          <SkeletonBlock className="me-auto h-6 w-28" />
          <SkeletonBlock className="h-12 w-36 rounded-button" />
          <SkeletonBlock className="size-11 rounded-full" />
        </div>
      </div>
    </div>
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
