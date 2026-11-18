import { PenLine } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A clearly visible "to be written" note for content the founders still have to provide.
 * Never use lorem ipsum — use this.
 */
export function PlaceholderNote({
  badge,
  title,
  children,
  hint,
  className,
}: {
  badge: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border-2 border-dashed border-primary/40 bg-accent/40 p-5 sm:p-8",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <span
          aria-hidden="true"
          className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-card text-primary-text shadow-card"
        >
          <PenLine className="size-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {badge}
          </span>
          <p className="mt-2 text-lg font-semibold text-balance">{title}</p>
          {children ? <p className="mt-2 leading-relaxed text-pretty text-foreground/80">{children}</p> : null}
          {hint ? <p className="mt-3 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}
