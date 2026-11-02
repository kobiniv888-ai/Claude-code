import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { ArrowEnd } from "@/components/common/directional-icon";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * A section title (round 2): an 18px heading (22px on desktop), an optional one-line subtitle
 * and a purple "הכל ←" link (the arrow follows the reading direction).
 *
 *   <SectionHeader id="new-title" title="נכסים חדשים" href="/search?sort=new" />
 *   <section aria-labelledby="new-title">…</section>
 */
export function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel,
  as: Heading = "h2",
  size = "h2",
  id,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Where "See all" goes. No link without it. */
  href?: ComponentProps<typeof Link>["href"];
  /** Default: "See all". */
  linkLabel?: string;
  as?: "h1" | "h2" | "h3";
  size?: "h1" | "h2" | "h3";
  /** For aria-labelledby on the section. */
  id?: string;
  className?: string;
}) {
  const t = useTranslations("ds.section");
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading
          id={id}
          className={cn(
            "text-balance text-foreground",
            size === "h1" ? "text-h1" : size === "h2" ? "text-h2" : "text-h3",
          )}
        >
          {title}
        </Heading>
        {subtitle ? <p className="text-small text-pretty text-muted-foreground">{subtitle}</p> : null}
      </div>
      {href ? (
        <Link
          href={href}
          className="group/see-all -me-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-medium text-primary-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {linkLabel ?? t("seeAll")}
          <ArrowEnd
            className="size-4 transition-transform duration-(--motion-fast) group-hover/see-all:translate-x-0.5 rtl:group-hover/see-all:-translate-x-0.5 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </Link>
      ) : null}
    </div>
  );
}
