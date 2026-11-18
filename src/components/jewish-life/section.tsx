import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/common/container";
import { cn } from "@/lib/utils";

/** Page-width wrapper (16px side gutter on phones). */
export function JlContainer(props: ComponentProps<typeof Container>) {
  return <Container {...props} />;
}

/**
 * One section of the Jewish Life hub (round 2): an anchor id, an 18px/22px h2 with a one-line
 * lead, and a hairline between sections — white (or black) like the rest of the site, no tinted
 * backgrounds and no icon circles.
 */
export function JlSection({
  id,
  title,
  lead,
  action,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  lead?: ReactNode;
  /** Shown at the end of the heading row (e.g. a link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-title`;
  return (
    // scroll-mt: the jump links land here; keep the heading clear of the sticky header and the nav.
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-[calc(var(--header-height)+4rem)] border-t border-border py-section first:border-t-0", className)}
    >
      <JlContainer>
        <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 id={headingId} className="text-h2 text-balance text-foreground">
              {title}
            </h2>
            {lead ? <p className="mt-1 text-small text-pretty text-muted-foreground sm:text-body">{lead}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </JlContainer>
    </section>
  );
}
