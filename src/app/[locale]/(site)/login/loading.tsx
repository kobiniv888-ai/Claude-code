import { Skeleton } from "@/components/ui/skeleton";

/** The /login card while it loads: door, headline, three benefit rows and the phone form. */
export default function Loading() {
  return (
    <div className="flex w-full justify-center px-gutter py-6 sm:py-12" aria-busy>
      <div className="grid w-full max-w-[27rem] gap-3 rounded-card bg-card p-5 shadow-raised ring-1 ring-foreground/5 sm:p-8">
        <Skeleton className="mx-auto size-28 rounded-full" />
        <Skeleton className="mx-auto h-8 w-3/4 rounded-lg" />
        <Skeleton className="mx-auto h-4 w-5/6" />
        <Skeleton className="mt-2 h-11 rounded-input" />
        <Skeleton className="h-11 rounded-input" />
        <Skeleton className="h-11 rounded-input" />
        <Skeleton className="mt-3 h-12 rounded-input" />
        <Skeleton className="h-12 rounded-full" />
      </div>
    </div>
  );
}
