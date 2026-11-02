import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Bayit buttons (round 2): 14px corners, a 48px main button and a 40px secondary one.
 * Purple is the only accent: the main action is purple with white text (bright #7B52E3 in dark
 * mode), pressed/hover = --primary-pressed. No shadows (only the search card and sheets have one).
 *
 *   <Button>חיפוש</Button>                                       // primary, 48px
 *   <Button variant="secondary">ביטול</Button>                    // outline, 40px
 *   <Button variant="ghost" size="sm">ניקוי</Button>
 *   <Button variant="round" size="icon" aria-label="…"><ShareIcon /></Button>   // round icon button
 *   <Link href="/search" className={buttonStyles({ variant: "secondary" })}>…</Link>
 *
 * For a link styled as a button, use `asChild` with a `Link`, or `buttonStyles()`.
 * Server-component friendly (no state).
 */
const variants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-button border border-transparent font-medium whitespace-nowrap select-none",
    "transition-[transform,background-color,border-color,color] duration-(--motion-fast) ease-standard outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.98] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        /** Purple: the one main action of a screen. */
        primary: "bg-primary text-primary-foreground hover:bg-primary-pressed active:bg-primary-pressed",
        /** Kept for older callers: the same purple main button (there is no second accent color). */
        accent: "bg-primary text-primary-foreground hover:bg-primary-pressed active:bg-primary-pressed",
        /** The 40px outline button next to a main one (Cancel, Show phone…). */
        secondary: "border-border-strong bg-card text-foreground hover:bg-surface-muted active:bg-surface-muted",
        /** Same look as `secondary`, but 48px by default (to sit in a row of main buttons). */
        outline: "border-border-strong bg-card text-foreground hover:bg-surface-muted active:bg-surface-muted",
        /** Quiet, no background until hovered. */
        ghost: "text-foreground hover:bg-surface-muted active:bg-surface-muted",
        /** A soft purple tint: secondary actions that should still read as "do this". */
        soft: "bg-primary-tint text-primary-text hover:border-primary-tint-border",
        /** WhatsApp (contact the host): WhatsApp's own deeper green, the one non-purple button (white text 5.3:1). */
        whatsapp: "bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90",
        /** Round button on photos or a map: white (card) with a hairline border, no shadow. */
        round: "rounded-full border-border bg-card text-foreground hover:bg-surface-muted",
        link: "h-auto rounded-md px-0 text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        /** 40px (secondary). */
        sm: "h-button-sm px-4 text-sm [&_svg:not([class*='size-'])]:size-4.5",
        /** 48px (main). */
        md: "h-button px-5 text-base",
        lg: "h-button px-7 text-base",
        /** Icon only, 44px: always give it an aria-label. */
        icon: "size-11 p-0",
        "icon-sm": "size-10 p-0 [&_svg:not([class*='size-'])]:size-4.5",
      },
      block: {
        true: "w-full",
      },
    },
    compoundVariants: [
      { variant: "link", class: "h-auto px-0" },
      // Icon buttons are round.
      { size: ["icon", "icon-sm"], class: "rounded-full" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonVariantProps = VariantProps<typeof variants>;

/** Class names for a button look. `secondary` is 40px unless a size is given; the rest are 48px. */
function buttonStyles(options: ButtonVariantProps & { className?: string } = {}) {
  const { variant, size, block, className } = options;
  return cn(variants({ variant, block, size: size ?? (variant === "secondary" ? "sm" : "md") }), className);
}

export type ButtonProps = React.ComponentProps<"button"> &
  ButtonVariantProps & {
    /** Render the child element (e.g. a Link) with the button's styles. */
    asChild?: boolean;
  };

function Button({ className, variant, size, block, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="ds-button"
      data-variant={variant ?? "primary"}
      className={buttonStyles({ variant, size, block, className })}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

export { Button, buttonStyles };
