import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IconCircle } from "./icon-circle";
import type { Tone } from "./tones";

/** Rounded card with an icon in a tinted circle, a title and a short text. */
export function InfoCard({
  icon,
  tone = "primary",
  title,
  children,
  footer,
  headingLevel = "h3",
  layout = "stacked",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
  /** "stacked": icon above the title. "inline": icon beside the text (compact lists). */
  layout?: "stacked" | "inline";
  className?: string;
}) {
  const Heading = headingLevel;
  const inline = layout === "inline";
  return (
    <div
      className={cn(
        "flex h-full rounded-2xl border bg-card p-5 text-card-foreground shadow-card sm:p-6",
        inline ? "flex-row items-start gap-4" : "flex-col",
        className,
      )}
    >
      <IconCircle icon={icon} tone={tone} size={inline ? "sm" : "md"} />
      <div className={cn("flex min-w-0 flex-1 flex-col", !inline && "mt-4")}>
        <Heading className="text-base font-semibold text-balance sm:text-lg">{title}</Heading>
        {children ? (
          <div className="mt-1.5 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-[0.9375rem]">
            {children}
          </div>
        ) : null}
        {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}
