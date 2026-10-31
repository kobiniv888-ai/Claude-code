import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/common/container";
import { cn } from "@/lib/utils";

/** Page-width wrapper (16px side gutter on phones). */
export function JlContainer(props: ComponentProps<typeof Container>) {
  return <Container {...props} />;
}

/** One section of the Jewish Life page, with an anchor id and an h2. */
export function JlSection({
  id,
  icon: Icon,
  eyebrow,
  title,
  lead,
  action,
  children,
  className,
}: {
  id: string;
  icon?: LucideIcon;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Shown at the end of the heading row (e.g. a link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-28 py-12 sm:py-16", className)}>
      <JlContainer>
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            {eyebrow ? (
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-accent-foreground">
                {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
                {eyebrow}
              </p>
            ) : null}
            <h2 id={headingId} className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
              {title}
            </h2>
            {lead ? <p className="mt-2 text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </JlContainer>
    </section>
  );
}
