import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A deep-blue call-to-action panel. Put buttons (see ctaButtonClass) in `children`. */
export function CtaBand({
  title,
  body,
  children,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground shadow-card sm:px-10 sm:py-14",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -end-16 -z-10 size-64 rounded-full bg-primary/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -start-10 -z-10 size-56 rounded-full bg-primary-foreground/10 blur-3xl"
      />
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h2>
        {body ? <p className="mt-3 text-base text-pretty text-primary-foreground/85 sm:text-lg">{body}</p> : null}
      </div>
      {children ? <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">{children}</div> : null}
    </div>
  );
}

/** Link-button styles for content pages (use with <Link className={…}>). */
export const ctaButtonClass = {
  /** Solid deep blue. */
  primary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0",
  /** White button with a border. */
  outline:
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-card px-5 text-base font-semibold text-foreground shadow-card transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0",
  /** Terracotta accent. */
  accent:
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-card transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0",
  /** On a deep-blue band: light solid. */
  onPrimary:
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary-foreground px-5 text-base font-semibold text-brand transition-colors hover:bg-primary-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground [&_svg]:size-5 [&_svg]:shrink-0",
  /** On a deep-blue band: outline. */
  onPrimaryOutline:
    "inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-primary-foreground/40 px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-foreground [&_svg]:size-5 [&_svg]:shrink-0",
} as const;
