import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { IconComponent } from "./jewish-icons";

/**
 * An icon inside a tinted circle (like round category buttons). Decorative by default.
 *
 *   <IconCircle icon={SynagogueIcon} tone="navy" size="lg" />
 *   <IconCircle tone="green"><CheckIcon /></IconCircle>
 */
const iconCircleVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        navy: "bg-navy-soft text-navy",
        coral: "bg-coral-soft text-coral-strong",
        green: "bg-verified-soft text-verified",
        amber: "bg-warning-soft text-warning",
        neutral: "bg-muted text-muted-foreground",
        /** Solid fills, for strong accents (white icon). */
        "navy-solid": "bg-navy text-navy-foreground",
        "coral-solid": "bg-coral text-coral-foreground",
        /** Over photos. */
        glass: "bg-card/90 text-foreground shadow-sm backdrop-blur",
      },
      size: {
        xs: "size-7 [&_svg]:size-3.5",
        sm: "size-9 [&_svg]:size-4.5",
        md: "size-11 [&_svg]:size-5",
        lg: "size-14 [&_svg]:size-6",
        xl: "size-18 [&_svg]:size-8",
      },
    },
    defaultVariants: { tone: "navy", size: "md" },
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
