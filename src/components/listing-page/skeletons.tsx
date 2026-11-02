import { useTranslations } from "next-intl";
import { Container } from "@/components/common/container";
import { SkeletonBlock } from "@/components/common/skeletons";

/**
 * /listing/[id] while it loads (route loading.tsx): the same shape as the page — the photo, the
 * badges, title, price, the fact tiles, the "For those who keep tradition" card and the contact
 * bar on phones; the mosaic and the side contact box on desktop. Shown at once, never a spinner.
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
        <div className="mt-5 grid gap-8 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-x-12">
          <div className="grid content-start gap-4">
            <div className="flex gap-2">
              <SkeletonBlock className="h-8 w-44 rounded-full" />
              <SkeletonBlock className="h-8 w-20 rounded-full" />
            </div>
            <SkeletonBlock className="h-8 w-11/12" />
            <SkeletonBlock className="h-8 w-2/3" />
            <SkeletonBlock className="h-4 w-52" />
            <SkeletonBlock className="h-4 w-60" />
            <SkeletonBlock className="mt-1 h-9 w-40 lg:hidden" />
            <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-3">
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonBlock key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
            <SkeletonBlock className="mt-4 h-56 rounded-card" />
            <div className="mt-6 grid gap-2.5">
              <SkeletonBlock className="h-7 w-40" />
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonBlock key={i} className={i === 4 ? "h-4 w-2/3" : "h-4 w-full"} />
              ))}
            </div>
          </div>
          <div className="hidden content-start gap-4 rounded-card border bg-card p-5 lg:grid">
            <SkeletonBlock className="h-9 w-44" />
            <div className="flex items-center gap-3">
              <SkeletonBlock className="size-10 rounded-full" />
              <SkeletonBlock className="h-5 w-36" />
            </div>
            <SkeletonBlock className="h-13 w-full rounded-full" />
            <SkeletonBlock className="h-13 w-full rounded-full" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        </div>
      </Container>
      <div className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom,0px)] lg:hidden">
        <div className="mx-auto flex h-18 max-w-3xl items-center gap-2 px-gutter">
          <SkeletonBlock className="me-auto h-7 w-24" />
          <SkeletonBlock className="h-11 w-32 rounded-full" />
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
