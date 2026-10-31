import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Loading placeholders with a soft shimmer (no spinners). Each one announces "Loading…" to
 * screen readers. Server- and client-safe.
 *
 *   <CardSkeleton />                    one listing card
 *   <CardGridSkeleton count={8} />      a grid of cards
 *   <ListSkeleton rows={5} />           rows with a thumbnail
 *   <PageSkeleton />                    page title + card grid (route loading.tsx)
 */

/** One shimmering block. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer rounded-md", className)} />;
}

function LoadingLabel({ label }: { label?: string }) {
  const t = useTranslations("states");
  return <span className="sr-only">{label ?? t("loading")}</span>;
}

export function CardSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div role="status" className={cn("grid gap-3", className)}>
      <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
      <div className="grid gap-2 px-0.5">
        <div className="flex items-center justify-between gap-4">
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-4 w-10" />
        </div>
        <SkeletonBlock className="h-3.5 w-1/2" />
        <SkeletonBlock className="h-4 w-1/3" />
      </div>
      <LoadingLabel label={label} />
    </div>
  );
}

export function CardGridSkeleton({
  count = 8,
  className,
  label,
}: {
  count?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" className={cn("grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="grid gap-3">
          <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
          <div className="grid gap-2 px-0.5">
            <div className="flex items-center justify-between gap-4">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-10" />
            </div>
            <SkeletonBlock className="h-3.5 w-1/2" />
            <SkeletonBlock className="h-4 w-1/3" />
          </div>
        </div>
      ))}
      <LoadingLabel label={label} />
    </div>
  );
}

export function ListSkeleton({ rows = 4, className, label }: { rows?: number; className?: string; label?: string }) {
  return (
    <div role="status" className={cn("grid gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex items-center gap-4 rounded-2xl border bg-card p-3 sm:p-4">
          <SkeletonBlock className="size-16 shrink-0 rounded-xl sm:size-20" />
          <div className="grid flex-1 gap-2">
            <SkeletonBlock className="h-4 w-3/5" />
            <SkeletonBlock className="h-3.5 w-2/5" />
            <SkeletonBlock className="h-3.5 w-1/4" />
          </div>
          <SkeletonBlock className="hidden h-9 w-24 rounded-xl sm:block" />
        </div>
      ))}
      <LoadingLabel label={label} />
    </div>
  );
}

export function PageSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <div role="status" aria-busy className={cn("mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8", className)}>
      <div aria-hidden className="grid max-w-2xl gap-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-9 w-4/5 rounded-lg sm:h-10" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
      <div aria-hidden className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={cn("grid gap-3", i >= 4 && "hidden sm:grid", i >= 6 && "sm:hidden lg:grid")}>
            <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-3.5 w-1/2" />
          </div>
        ))}
      </div>
      <LoadingLabel label={label} />
    </div>
  );
}
