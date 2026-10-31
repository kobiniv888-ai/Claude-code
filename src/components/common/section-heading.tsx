import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ArrowEnd } from "./directional-icon";

/**
 * A section title (h2) with an optional eyebrow, description and a "See all" link on the end side.
 *
 *   <SectionHeading title={t("newest")} action={{ label: tc("seeAll"), href: "/search?sort=newest" }} />
 */
export function SectionHeading({
  id,
  title,
  description,
  eyebrow,
  action,
  as: Heading = "h2",
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: { label: string; href: string } | ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  const link =
    action && typeof action === "object" && "href" in action && "label" in action ? (
      <Link
        href={action.href}
        className="group inline-flex shrink-0 items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {action.label}
        <ArrowEnd aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
      </Link>
    ) : (
      (action as ReactNode)
    );
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="grid min-w-0 gap-1.5">
        {eyebrow ? <p className="text-sm font-semibold text-accent-foreground">{eyebrow}</p> : null}
        <Heading id={id} className="scroll-mt-(--header-height) text-xl font-bold tracking-tight text-balance sm:text-2xl">
          {title}
        </Heading>
        {description ? <p className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">{description}</p> : null}
      </div>
      {link}
    </div>
  );
}
