import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppLocale } from "@/config/site";
import { cn } from "@/lib/utils";

/**
 * Centered card for the phone and 2-step pages, under the site header (which carries the logo).
 * Bordered, no shadow (redesign round 2).
 */
export function AuthShell({
  title,
  description,
  icon,
  children,
  footer,
  className,
}: {
  /** Kept for callers; the brand is in the site header now. */
  locale?: AppLocale;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative isolate flex w-full justify-center px-4 py-8 sm:py-14">
      {/* Soft brand glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
      />
      <div className={cn("flex w-full max-w-[26rem] flex-col gap-6", className)}>
        <div className="rounded-card border border-border bg-card p-5 sm:p-8">
          <div className="mb-6 grid gap-2 text-center">
            {icon && <div className="mx-auto mb-1">{icon}</div>}
            <h1 className="text-h1 text-balance">{title}</h1>
            {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>

        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}

/** Loading state for the auth pages (skeleton card). */
export function AuthShellSkeleton() {
  return (
    <div className="flex w-full justify-center px-4 py-8 sm:py-14" aria-busy>
      <div className="flex w-full max-w-[26rem] flex-col gap-6">
        <div className="grid gap-4 rounded-card border border-border bg-card p-5 sm:p-8">
          <Skeleton className="mx-auto h-7 w-3/4 rounded-lg" />
          <Skeleton className="mx-auto h-4 w-5/6" />
          <Skeleton className="mt-2 h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
