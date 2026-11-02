import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

/**
 * A small text tag (24px, 12px text, a full pill). Quiet by design: grey for facts and status
 * ("דמו", "מטבח כשר"), the purple tint for something new ("חדש"), green only for "verified".
 * Works on a photo as well as on a card. Server-component friendly.
 *
 *   <Tag>דמו</Tag>
 *   <Tag variant="primary">חדש</Tag>
 *   <Tag variant="success" icon={BadgeCheckIcon}>מאומת</Tag>
 *   <ul className="flex gap-1"><Tag as="li">מטבח כשר</Tag><Tag as="li">דובר עברית</Tag></ul>
 */
const tagStyles = cva(
  "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full px-2 text-xs leading-none font-medium whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /** Grey: facts and status, "דמו". */
        neutral: "bg-surface-muted text-muted-foreground",
        /** Purple tint: "חדש". */
        primary: "bg-primary-tint text-primary-text",
        /** Green: only "verified" (and "booking confirmed"). */
        success: "bg-primary-tint text-success",
      },
      size: {
        /** 22px */
        sm: "h-5.5",
        /** 24px */
        md: "h-tag",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
);

export type TagProps = VariantProps<typeof tagStyles> & {
  icon?: IconComponent;
  /** "li" inside a list of tags. */
  as?: "span" | "li";
  title?: string;
  className?: string;
  children: React.ReactNode;
};

function Tag({ variant, size, icon: Icon, as: Comp = "span", title, className, children }: TagProps) {
  return (
    <Comp data-slot="tag" data-variant={variant ?? "neutral"} title={title} className={cn(tagStyles({ variant, size }), className)}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      <span className="truncate">{children}</span>
    </Comp>
  );
}

export { Tag, tagStyles };
