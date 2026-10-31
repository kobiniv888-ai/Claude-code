import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section title (h2) with an optional eyebrow and lead paragraph. */
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
      {eyebrow ? <p className="mb-2 text-sm font-semibold text-accent-foreground">{eyebrow}</p> : null}
      <h2 id={id} className="scroll-mt-24 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {lead ? <p className="mt-3 text-base text-pretty text-muted-foreground sm:text-lg">{lead}</p> : null}
    </div>
  );
}

/** Vertical rhythm for a page section. */
export function ContentSection({
  className,
  children,
  ...props
}: ComponentProps<"section">) {
  return (
    <section className={cn("py-12 sm:py-16", className)} {...props}>
      {children}
    </section>
  );
}
