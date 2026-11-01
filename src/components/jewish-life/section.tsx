import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/common/container";
import { IconCircle } from "@/components/ds/icon-circle";
import type { IconComponent } from "@/components/ds/jewish-icons";
import { cn } from "@/lib/utils";

/** Page-width wrapper (16px side gutter on phones). */
export function JlContainer(props: ComponentProps<typeof Container>) {
  return <Container {...props} />;
}

/** One section of the Jewish Life page: an anchor id, a big h2 with a tinted icon, and a one-line lead. */
export function JlSection({
  id,
  icon,
  tone = "navy",
  title,
  lead,
  action,
  children,
  className,
}: {
  id: string;
  icon?: IconComponent;
  tone?: "navy" | "coral" | "green" | "amber";
  title: ReactNode;
  lead?: ReactNode;
  /** Shown at the end of the heading row (e.g. a link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `${id}-title`;
  return (
    // scroll-mt: the quick actions jump here; keep the heading clear of the sticky header.
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20 py-section", className)}>
      <JlContainer>
        <div className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <IconCircle icon={icon} tone={tone} size="md" className="-mt-0.5 sm:mt-0" /> : null}
            <div className="min-w-0">
              <h2 id={headingId} className="text-h2 text-balance text-foreground">
                {title}
              </h2>
              {lead ? <p className="mt-1 text-small text-pretty text-muted-foreground sm:text-body">{lead}</p> : null}
            </div>
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        {children}
      </JlContainer>
    </section>
  );
}
