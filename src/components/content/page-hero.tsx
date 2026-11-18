import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ContentContainer } from "./content-container";
import { IconCircle } from "./icon-circle";
import type { Tone } from "./tones";

/**
 * The calm title band at the top of content pages (legal, how it works): the round-2 type scale
 * (text-h1 / text-body), a plain background with a hairline under it, no gradient and no shadow.
 */
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
    <section className={cn("border-b border-border bg-background", className)}>
      <ContentContainer className={size === "compact" ? "pt-8 pb-6 sm:pt-12 sm:pb-8" : "pt-8 pb-8 sm:pt-14 sm:pb-10"}>
        <div className="max-w-3xl">
          {icon ? <IconCircle icon={icon} tone={tone} size="md" className="mb-4" /> : null}
          {eyebrow ? <p className="mb-1.5 text-small font-medium text-primary-text">{eyebrow}</p> : null}
          <h1 className="text-h1 text-balance text-foreground">{title}</h1>
          {lead ? <p className="mt-2 text-body text-pretty text-muted-foreground">{lead}</p> : null}
          {children ? <div className="mt-5">{children}</div> : null}
        </div>
      </ContentContainer>
    </section>
  );
}
