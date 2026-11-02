import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section title (h2, the round-2 section size) with an optional eyebrow and lead paragraph. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  align = "start",
  className,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: "start" | "center";
  className?: string;
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? <p className="mb-1.5 text-caption text-primary-text">{eyebrow}</p> : null}
      <h2 id={id} className="scroll-mt-24 text-h2 text-balance text-foreground">
        {title}
      </h2>
      {lead ? <p className="mt-1.5 text-body text-pretty text-muted-foreground">{lead}</p> : null}
    </div>
  );
}

/** Vertical rhythm for a page section (32px on phones, more on desktop). */
export function ContentSection({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("py-section", className)} {...props}>
      {children}
    </section>
  );
}
