import type { ReactNode } from "react";
import { spriteIcon } from "@/components/ds/sprite-icons";
import { Link } from "@/i18n/navigation";

const ArrowIcon = spriteIcon("arrow-right");

/**
 * A city page section title (18px, 22px on desktop) with an optional purple link on the end side
 * ("לכל התוצאות והמסננים ←"). Like the design system's SectionHeader, drawn with sprite icons only.
 */
export function CitySectionHeading({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <h2 id={id} className="min-h-11 content-center text-h2 text-balance text-foreground">
        {title}
      </h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="group/link -me-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-primary-text outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {linkLabel}
          <ArrowIcon className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
