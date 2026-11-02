import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ContentContainer } from "./content-container";
import { IconCircle } from "./icon-circle";
import type { Tone } from "./tones";

/** The calm, airy band at the top of every content page (contains the page's h1). */
export function PageHero({
  icon,
  tone = "primary",
  eyebrow,
  title,
  lead,
  children,
  size = "default",
  className,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  /** Actions or meta information under the lead. */
  children?: ReactNode;
  size?: "default" | "compact";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden border-b bg-linear-to-b from-secondary/80 via-secondary/30 to-background",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -end-24 -z-10 size-72 rounded-full bg-primary/10 blur-3xl sm:size-96"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -start-16 -z-10 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <ContentContainer className={size === "compact" ? "py-10 sm:py-12" : "py-12 sm:py-16 lg:py-20"}>
        <div className="max-w-3xl">
          {icon ? <IconCircle icon={icon} tone={tone} size="lg" className="mb-5 bg-card shadow-card" /> : null}
          {eyebrow ? <p className="mb-2 text-sm font-semibold text-accent-foreground">{eyebrow}</p> : null}
          <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl lg:text-5xl">{title}</h1>
          {lead ? (
            <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{lead}</p>
          ) : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </ContentContainer>
    </section>
  );
}
