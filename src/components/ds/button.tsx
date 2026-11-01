import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * Bayit buttons: pill-shaped, at least 44px tall (40px for `sm`), bold labels.
 *
 *   <Button>חיפוש</Button>                                   // navy primary
 *   <Button variant="accent">פרסום</Button>                  // coral (AA-safe darker coral)
 *   <Button variant="whatsapp"><WhatsAppIcon /> WhatsApp</Button>
 *   <Button variant="round" size="icon" aria-label="…"><ShareIcon /></Button>
 *   <Link href="/search" className={buttonStyles({ variant: "outline" })}>…</Link>
 *
 * For a link styled as a button, use `asChild` with a `Link`, or `buttonStyles()`.
 * Server-component friendly (no state).
 */
const buttonStyles = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-transparent font-semibold whitespace-nowrap select-none",
    "transition-[transform,background-color,box-shadow,color] duration-(--motion-fast) ease-standard outline-none",
    "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "active:scale-[0.97] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        /** Navy: the one main action of a screen. */
        primary: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        /** Coral: highlights such as "post a listing". Text uses the darker coral for AA. */
        // Dark: --coral-strong turns light there, so keep the darker brand fill (white text 4.9:1;
        // the bright coral fill is only 3.4:1 with white text).
        accent: "bg-coral-strong text-coral-foreground shadow-sm hover:bg-coral-strong/90 dark:bg-(--brand-accent) dark:hover:bg-(--brand-accent)/90",
        outline: "border-border bg-card text-foreground hover:bg-muted hover:border-input",
        /** Quiet, no background until hovered. */
        ghost: "text-foreground hover:bg-muted",
        /** A soft navy tint: secondary actions next to a primary one. */
        soft: "bg-navy-soft text-navy hover:bg-navy-soft/70",
        /** WhatsApp (contact the host): a deeper WhatsApp green so white text passes AA. */
        whatsapp: "bg-whatsapp text-whatsapp-foreground shadow-sm hover:bg-whatsapp/90",
        /** Round white button with a shadow, e.g. over photos or a map. */
        round: "bg-card text-foreground shadow-raised hover:bg-card/90",
        link: "h-auto rounded-md px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-10 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        md: "h-11 px-5 text-base",
        lg: "h-13 px-7 text-base",
        /** Square/round icon-only: always give it an aria-label. */
        icon: "size-11 p-0",
        "icon-sm": "size-10 p-0 [&_svg:not([class*='size-'])]:size-4.5",
      },
      block: {
        true: "w-full",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonStyles> & {
    /** Render the child element (e.g. a Link) with the button's styles. */
    asChild?: boolean;
  };

function Button({ className, variant, size, block, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="ds-button"
      data-variant={variant ?? "primary"}
      className={cn(buttonStyles({ variant, size, block }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}

export { Button, buttonStyles };
