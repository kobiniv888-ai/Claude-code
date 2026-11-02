import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

/**
 * An icon in a quiet grey circle (round 2: no multicolored circles). Every old tone name still
 * works and draws the same neutral circle; `primary` is the purple tint, `*-solid` a purple fill.
 * Decorative by default.
 *
 *   <IconCircle icon={SynagogueIcon} size="lg" />
 *   <IconCircle tone="primary"><CheckIcon /></IconCircle>
 */
const NEUTRAL = "bg-surface-muted text-muted-foreground";
const SOLID = "bg-primary text-primary-foreground";

const iconCircleVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: NEUTRAL,
        /** The purple tint, for the rare icon that should stand out. */
        primary: "bg-primary-tint text-primary-text",
        // Round-1 tone names: all neutral now.
        navy: NEUTRAL,
        coral: NEUTRAL,
        green: NEUTRAL,
        amber: NEUTRAL,
        /** A purple fill (white icon). */
        "primary-solid": SOLID,
        "navy-solid": SOLID,
        "coral-solid": SOLID,
        /** Over photos. */
        glass: "border border-border bg-card/95 text-foreground",
      },
      size: {
        xs: "size-7 [&_svg]:size-3.5",
        sm: "size-9 [&_svg]:size-4.5",
        md: "size-11 [&_svg]:size-5",
        lg: "size-14 [&_svg]:size-6",
        xl: "size-16 [&_svg]:size-7",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type IconCircleProps = VariantProps<typeof iconCircleVariants> & {
  icon?: IconComponent;
  className?: string;
  children?: React.ReactNode;
};

export function IconCircle({ icon: Icon, tone, size, className, children }: IconCircleProps) {
  return (
    <span className={cn(iconCircleVariants({ tone, size }), className)} aria-hidden="true">
      {Icon ? <Icon aria-hidden="true" /> : children}
    </span>
  );
}

export { iconCircleVariants };
