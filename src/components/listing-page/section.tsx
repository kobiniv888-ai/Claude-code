import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A listing page section: a thin divider, the 18px section title (22px on desktop) and its content. */
export function Section({
  id,
  title,
  description,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  /** Shown on the end side of the title (e.g. a "Show all" link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-(--header-height) border-t border-border pt-8", className)}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="grid gap-1">
          <h2 id={`${id}-title`} className="text-h2 text-foreground">
            {title}
          </h2>
          {description ? <p className="text-small text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
